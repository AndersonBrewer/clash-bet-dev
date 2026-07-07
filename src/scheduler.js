import { supabaseAdmin } from './supabaseClient.js';
import { getScoreboard, getInjuredPlayers, fuzzyNameLookup } from './lib/espnApi.js';
import { refreshClashLegs, resolveClash, cancelClashForInjury } from './routes/clashes.js';

const POLL_INTERVAL_MS = 60_000;

// Periodically checks every awaiting/pending/live Clash's real-world game
// against ESPN's scoreboard: cancels a Clash if a leg's player is ruled out
// before the game starts, flips 'pending' -> 'live' once it does, keeps live
// legs' stat values fresh, and auto-resolves once the game goes final. This
// replaces having to call /refresh and /resolve by hand.
export function startScheduler() {
  runOnce().catch(err => console.error('scheduler: initial run failed:', err.message));
  setInterval(() => {
    runOnce().catch(err => console.error('scheduler: run failed:', err.message));
  }, POLL_INTERVAL_MS);
  console.log(`Scheduler started - checking awaiting/pending/live Clashes every ${POLL_INTERVAL_MS / 1000}s`);
}

async function runOnce() {
  const { data: clashes, error } = await supabaseAdmin
    .from('clashes')
    .select('*, clash_legs(*)')
    .in('status', ['awaiting_opponent', 'pending', 'live']);

  if (error) {
    console.error('scheduler: failed to load clashes:', error.message);
    return;
  }
  if (!clashes?.length) return;

  // One scoreboard/injuries fetch per sport in play covers every clash on
  // that sport - both are free ESPN calls, no need to fetch per-clash.
  const scoreboards = {};
  const injuredBySport = {};
  for (const sport of new Set(clashes.map(c => c.sport))) {
    try {
      scoreboards[sport] = await getScoreboard(sport);
    } catch (err) {
      console.error(`scheduler: failed to fetch ${sport} scoreboard:`, err.message);
    }
    try {
      injuredBySport[sport] = await getInjuredPlayers(sport);
    } catch (err) {
      console.error(`scheduler: failed to fetch ${sport} injuries:`, err.message);
      injuredBySport[sport] = new Map();
    }
  }

  for (const clash of clashes) {
    const scoreboard = scoreboards[clash.sport];
    if (!scoreboard) continue;

    const event = (scoreboard.events || []).find(e => e.id === clash.event_external_id);
    if (!event) continue; // game not on today's scoreboard (e.g. different date) - skip until it is

    const gameState = event.competitions[0].status.type.state; // 'pre' | 'in' | 'post'

    try {
      if (gameState === 'pre') {
        // Before the game starts, a ruled-out player means this Clash can
        // never resolve fairly - applies to awaiting_opponent too, so a
        // challenge doesn't sit there waiting on a pick that's already dead.
        const injuredMap = injuredBySport[clash.sport] || new Map();
        const injuredLeg = clash.clash_legs.find(leg => fuzzyNameLookup(injuredMap, leg.player_name));
        if (injuredLeg) {
          await cancelClashForInjury(clash, injuredLeg.player_name);
          console.log(`scheduler: cancelled clash ${clash.id} - ${injuredLeg.player_name} ruled out`);
        }
        continue; // nothing else to do before the game has started
      }

      if (clash.status === 'awaiting_opponent') continue; // never became a real two-sided clash - nothing more to check

      if (gameState === 'post') {
        await resolveClash(clash);
        console.log(`scheduler: resolved clash ${clash.id}`);
      } else if (gameState === 'in') {
        if (clash.status === 'pending') {
          await supabaseAdmin.from('clashes').update({ status: 'live' }).eq('id', clash.id);
        }
        await refreshClashLegs(clash);
      }
    } catch (err) {
      console.error(`scheduler: failed to process clash ${clash.id}:`, err.message);
    }
  }
}
