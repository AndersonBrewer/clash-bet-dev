import express from 'express';
import { supabaseAdmin } from '../supabaseClient.js';
import { requireAuth } from './authMiddleware.js';

export const badgesRouter = express.Router();

const BADGE_PATTERNS = ['solid', 'cross', 'square', 'stripes', 'diamond', 'chevron', 'star', 'ring', 'split', 'bolt'];

// Total trophies is always computed here from live profile data, never
// stored - it has to reflect trophy changes as members win/lose Clashes,
// not a stale snapshot from whenever they joined.
async function badgeWithMembers(badgeId) {
  const { data: badge, error } = await supabaseAdmin.from('badges').select('*').eq('id', badgeId).single();
  if (error || !badge) return null;

  const { data: members } = await supabaseAdmin
    .from('badge_members')
    .select('user_id, profiles:user_id(id, username, avatar_color, trophies)')
    .eq('badge_id', badgeId);

  const membersList = (members || []).map(m => m.profiles).filter(Boolean);
  return {
    ...badge,
    membersList,
    memberCount: membersList.length,
    totalTrophies: membersList.reduce((sum, m) => sum + m.trophies, 0),
  };
}

// List every public Badge, plus any private one the requesting user already
// belongs to - private Badges are otherwise invisible here.
badgesRouter.get('/', requireAuth, async (req, res) => {
  const { data: badges, error } = await supabaseAdmin.from('badges').select('*').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });

  const { data: myMemberships } = await supabaseAdmin.from('badge_members').select('badge_id').eq('user_id', req.user.id);
  const myBadgeIds = new Set((myMemberships || []).map(m => m.badge_id));
  const visible = badges.filter(b => !b.is_private || myBadgeIds.has(b.id));

  // One query for every badge's members (rather than N+1 per badge) to
  // compute member counts + total trophies for the whole list at once.
  const { data: allMembers } = await supabaseAdmin.from('badge_members').select('badge_id, profiles:user_id(trophies)');
  const countByBadge = {};
  const trophiesByBadge = {};
  for (const m of allMembers || []) {
    countByBadge[m.badge_id] = (countByBadge[m.badge_id] || 0) + 1;
    trophiesByBadge[m.badge_id] = (trophiesByBadge[m.badge_id] || 0) + (m.profiles?.trophies || 0);
  }

  res.json(visible.map(b => ({
    ...b,
    memberCount: countByBadge[b.id] || 0,
    totalTrophies: trophiesByBadge[b.id] || 0,
  })));
});

// The logged-in user's own Badge (full member list, for the in-Badge
// leaderboard), or null if they're not in one.
badgesRouter.get('/mine', requireAuth, async (req, res) => {
  const { data: membership } = await supabaseAdmin.from('badge_members').select('badge_id').eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.json(null);
  res.json(await badgeWithMembers(membership.badge_id));
});

badgesRouter.post('/', requireAuth, async (req, res) => {
  const { name, isPrivate, primaryColor, secondaryColor, pattern } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Badge name is required' });
  if (!BADGE_PATTERNS.includes(pattern)) return res.status(400).json({ error: 'Invalid pattern' });

  // One Badge at a time, enforced here rather than a DB constraint - easy to
  // loosen later if multi-badge membership is ever wanted.
  const { data: existing } = await supabaseAdmin.from('badge_members').select('id').eq('user_id', req.user.id).maybeSingle();
  if (existing) return res.status(400).json({ error: 'Leave your current Badge before creating a new one' });

  const { data: badge, error } = await supabaseAdmin
    .from('badges')
    .insert({
      name: name.trim(), is_private: !!isPrivate, primary_color: primaryColor,
      secondary_color: secondaryColor, pattern, creator_id: req.user.id,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  await supabaseAdmin.from('badge_members').insert({ badge_id: badge.id, user_id: req.user.id });

  res.json(await badgeWithMembers(badge.id));
});

badgesRouter.post('/:id/join', requireAuth, async (req, res) => {
  const { data: badge } = await supabaseAdmin.from('badges').select('*').eq('id', req.params.id).single();
  if (!badge) return res.status(404).json({ error: 'Badge not found' });
  // Private Badges don't have a request/approval flow yet - see badges-spec.md.
  if (badge.is_private) return res.status(400).json({ error: 'This Badge is private - joining requires an invite' });

  const { data: existing } = await supabaseAdmin.from('badge_members').select('id').eq('user_id', req.user.id).maybeSingle();
  if (existing) return res.status(400).json({ error: 'Leave your current Badge before joining another' });

  const { error } = await supabaseAdmin.from('badge_members').insert({ badge_id: badge.id, user_id: req.user.id });
  if (error) return res.status(400).json({ error: error.message });

  res.json(await badgeWithMembers(badge.id));
});

badgesRouter.post('/leave', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin.from('badge_members').delete().eq('user_id', req.user.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ left: true });
});
