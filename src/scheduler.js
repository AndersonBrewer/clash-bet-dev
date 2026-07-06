import { supabaseAdmin } from './supabaseClient.js';
import { getScoreboard } from './lib/espnApi.js';
import { refreshClashLegs, resolveClash } from './routes/clashes.js';

const POLL_INTERVAL_MS = 60_000;

// Periodically checks every pending/live Clash's real-world game against
// ESPN's scoreboard: flips 'pending' -> 'live' once the game starts, keeps
// live legs' stat values fresh, and auto-resolves once the game goes final.
// This replaces having to call /refresh and /resolve by hand.
export function startScheduler() {
  runOnce().catch(err => console.error('scheduler: initial run failed:', err.message));
  setInterval(() => {
    runOnce().catch(err => console.error('scheduler: run failed:', err.message));
  }, POLL_INTERVAL_MS);
  console.log(`Scheduler started - checking pending/live Clashes every ${POLL_INTERVAL_MS / 1000}s`);
}

async function runOnce() {
  const { data: clashes, error } = await supabaseAdmin
    .from('clashes')
    .select('*, clash_legs(*)')
    .in('status', ['pending', 'live']);

  if (error) {
    console.error('scheduler: failed to load clashes:', error.message);
    return;
  }
  if (!clashes?.length) return;

  // One scoreboard fetch per sport in play covers every clash on that sport -
  // ESPN's scoreboard call is free, so no need to fetch per-clash.
  const scoreboards = {};
  for (const sport of new Set(clashes.map(c => c.sport))) {
    try {
      scoreboards[sport] = await getScoreboard(sport);
    } catch (err) {
      console.error(`scheduler: failed to fetch ${sport} scoreboard:`, err.message);
    }
  }

  for (const clash of clashes) {
    const scoreboard = scoreboards[clash.sport];
    if (!scoreboard) continue;

    const event = (scoreboard.events || []).find(e => e.id === clash.event_external_id);
    if (!event) continue; // game not on today's scoreboard (e.g. different date) - skip until it is

    const state = event.competitions[0].status.type.state; // 'pre' | 'in' | 'post'

    try {
      if (state === 'post') {
        await resolveClash(clash);
        console.log(`scheduler: resolved clash ${clash.id}`);
      } else if (state === 'in') {
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
