import express from 'express';
import { supabaseAdmin } from '../supabaseClient.js';
import { requireAuth } from './authMiddleware.js';
import { getGameSummary, extractPlayerStat } from '../lib/espnApi.js';
import { eloForClashResult } from '../lib/elo.js';
import { ALLOWED_SPORTS } from '../lib/sports.js';
import { TIER_POINTS } from '../lib/tiers.js';

export const clashesRouter = express.Router();

// Single source of truth for leg count - keep this in sync with the frontend's LEG_COUNT.
const REQUIRED_LEG_COUNT = 4;

function validateLegs(label, legs, res) {
  if (!Array.isArray(legs) || legs.length !== REQUIRED_LEG_COUNT) {
    res.status(400).json({ error: `${label} ticket must have exactly ${REQUIRED_LEG_COUNT} legs` });
    return false;
  }
  const uniquePlayers = new Set(legs.map(l => l.playerName));
  if (uniquePlayers.size !== legs.length) {
    res.status(400).json({ error: `${label} ticket has more than one leg on the same player` });
    return false;
  }
  return true;
}

function legRows(clashId, ownerId, legs) {
  return legs.map(l => ({
    clash_id: clashId, owner_id: ownerId, player_name: l.playerName, stat_key: l.statKey,
    tier: l.tier, line: l.line, over_under: l.overUnder === 'under' ? 'under' : 'over',
  }));
}

// Challenge a friend to a Clash: submits YOUR ticket only and picks an
// opponent. Sits as 'awaiting_opponent' until they submit their own ticket
// via POST /:id/accept - two people playing async don't both need to be
// online at once to set up a match.
clashesRouter.post('/', requireAuth, async (req, res) => {
  const { opponentId, sport, eventExternalId, eventLabel, myLegs } = req.body;
  // myLegs: [{ playerName, statKey, tier, line }, ...] (REQUIRED_LEG_COUNT)

  if (!ALLOWED_SPORTS.includes(sport)) {
    return res.status(400).json({ error: `Unsupported sport - this launch only supports: ${ALLOWED_SPORTS.join(', ')}` });
  }
  if (!validateLegs('your', myLegs, res)) return;

  const { data: clash, error: clashError } = await supabaseAdmin
    .from('clashes')
    .insert({
      user_a_id: req.user.id,
      user_b_id: opponentId,
      sport,
      event_external_id: eventExternalId,
      event_label: eventLabel,
      status: 'awaiting_opponent',
    })
    .select()
    .single();

  if (clashError) return res.status(400).json({ error: clashError.message });

  const { error: legsError } = await supabaseAdmin.from('clash_legs').insert(legRows(clash.id, req.user.id, myLegs));
  if (legsError) return res.status(400).json({ error: legsError.message });

  res.json(clash);
});

// The invited opponent submits their own ticket for a Clash they were
// challenged to. Only the invited user can accept, and only while the
// Clash is still awaiting their response.
clashesRouter.post('/:id/accept', requireAuth, async (req, res) => {
  const { legs } = req.body;

  const { data: clash } = await supabaseAdmin.from('clashes').select('*').eq('id', req.params.id).single();
  if (!clash) return res.status(404).json({ error: 'Clash not found' });
  if (clash.status !== 'awaiting_opponent') return res.status(400).json({ error: 'This Clash is not awaiting a response' });
  if (clash.user_b_id !== req.user.id) return res.status(403).json({ error: 'Only the invited opponent can accept this Clash' });

  if (!validateLegs('your', legs, res)) return;

  const { error: legsError } = await supabaseAdmin.from('clash_legs').insert(legRows(clash.id, req.user.id, legs));
  if (legsError) return res.status(400).json({ error: legsError.message });

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('clashes')
    .update({ status: 'pending' })
    .eq('id', clash.id)
    .select()
    .single();
  if (updateError) return res.status(400).json({ error: updateError.message });

  res.json(updated);
});

// List all Clashes (pending/live/resolved) for the logged-in user.
// Enriches each Clash with both players' usernames (the frontend needs to
// show real names, not just user_a/user_b) and each leg's point value
// (so the frontend can show max possible points without duplicating the
// tier -> points mapping).
clashesRouter.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('clashes')
    .select('*, clash_legs(*)')
    .or(`user_a_id.eq.${req.user.id},user_b_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  if (!data.length) return res.json(data);

  const userIds = [...new Set(data.flatMap(c => [c.user_a_id, c.user_b_id]))];
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, avatar_color')
    .in('id', userIds);
  if (profilesError) return res.status(400).json({ error: profilesError.message });
  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]));

  const enriched = data.map(c => ({
    ...c,
    user_a_username: profileById[c.user_a_id]?.username,
    user_b_username: profileById[c.user_b_id]?.username,
    user_a_avatar_color: profileById[c.user_a_id]?.avatar_color,
    user_b_avatar_color: profileById[c.user_b_id]?.avatar_color,
    clash_legs: (c.clash_legs || []).map(leg => ({ ...leg, points: TIER_POINTS[leg.tier] })),
  }));
  res.json(enriched);
});

// Pulls the latest box score and updates each leg's current stat value.
// Shared by the manual /refresh route and the scheduler's periodic sweep of
// 'live' Clashes - both need the exact same logic, just triggered differently.
export async function refreshClashLegs(clash) {
  const summary = await getGameSummary(clash.sport, clash.event_external_id);

  for (const leg of clash.clash_legs) {
    const value = extractPlayerStat(summary, leg.player_name, leg.stat_key, clash.sport);
    if (value !== null) {
      await supabaseAdmin.from('clash_legs').update({ current_value: value }).eq('id', leg.id);
    }
  }
}

// Marks every leg hit/miss based on final stat values, tallies each side's
// score, determines the winner, updates both users' ELO, and marks the
// Clash resolved. Shared by the manual /resolve route and the scheduler,
// which calls this automatically once a Clash's game goes final.
export async function resolveClash(clash) {
  // Pull the FINAL box score directly here, rather than trusting whatever
  // current_value was left over from the last refresh - the game may have
  // ended after the last refresh ran, which would resolve on stale numbers.
  const finalSummary = await getGameSummary(clash.sport, clash.event_external_id);

  let scoreA = 0, scoreB = 0;
  for (const leg of clash.clash_legs) {
    const finalValue = extractPlayerStat(finalSummary, leg.player_name, leg.stat_key, clash.sport);
    const valueToUse = finalValue !== null ? finalValue : leg.current_value; // fallback if a player didn't play/wasn't found
    const hit = leg.over_under === 'under' ? valueToUse <= leg.line : valueToUse >= leg.line;
    await supabaseAdmin.from('clash_legs').update({ hit, current_value: valueToUse }).eq('id', leg.id);
    if (hit) {
      if (leg.owner_id === clash.user_a_id) scoreA += TIER_POINTS[leg.tier];
      else scoreB += TIER_POINTS[leg.tier];
    }
  }

  const result = scoreA > scoreB ? 'won_a' : scoreA < scoreB ? 'won_b' : 'tied';

  // Pull both users' current ELO, compute the update, write it back
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, elo')
    .in('id', [clash.user_a_id, clash.user_b_id]);

  const profileA = profiles.find(p => p.id === clash.user_a_id);
  const profileB = profiles.find(p => p.id === clash.user_b_id);
  const { newRatingA, newRatingB } = eloForClashResult(profileA.elo, profileB.elo, result);

  await supabaseAdmin.from('profiles').update({ elo: newRatingA }).eq('id', clash.user_a_id);
  await supabaseAdmin.from('profiles').update({ elo: newRatingB }).eq('id', clash.user_b_id);

  await supabaseAdmin
    .from('clashes')
    .update({ status: result, score_a: scoreA, score_b: scoreB, resolved_at: new Date().toISOString() })
    .eq('id', clash.id);

  return { result, scoreA, scoreB, newRatingA, newRatingB };
}

// Poll this periodically (e.g. every 30-60s) for any Clash marked 'live' to
// refresh each leg's current stat value from the free ESPN box score.
// This does NOT resolve the clash - just updates progress for display.
clashesRouter.post('/:id/refresh', requireAuth, async (req, res) => {
  const { data: clash } = await supabaseAdmin.from('clashes').select('*, clash_legs(*)').eq('id', req.params.id).single();
  if (!clash) return res.status(404).json({ error: 'Clash not found' });

  await refreshClashLegs(clash);

  res.json({ refreshed: true });
});

// Call this once the real game has ended. Marks every leg hit/miss based on
// final stat values, tallies each side's score, determines the winner,
// updates both users' ELO, and marks the Clash resolved.
clashesRouter.post('/:id/resolve', requireAuth, async (req, res) => {
  const { data: clash } = await supabaseAdmin.from('clashes').select('*, clash_legs(*)').eq('id', req.params.id).single();
  if (!clash) return res.status(404).json({ error: 'Clash not found' });

  const result = await resolveClash(clash);

  res.json(result);
});
