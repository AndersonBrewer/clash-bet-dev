import fetch from 'node-fetch';

const BASE_URL = 'https://api.the-odds-api.com/v4';
const API_KEY = process.env.ODDS_API_KEY;

// Maps our internal sport names to The Odds API's sport keys.
// Full list: https://the-odds-api.com/sports-odds-data/sports-apis.html
const SPORT_KEYS = {
  basketball: 'basketball_nba',
  baseball: 'baseball_mlb',
  football: 'americanfootball_nfl',
  world_cup: 'soccer_fifa_world_cup',
};

// Player prop market keys vary by sport. These are the common US-basketball
// ones as an example - expand this map as you wire up more sports/stats.
const MARKET_KEYS = {
  points: 'player_points',
  rebounds: 'player_rebounds',
  assists: 'player_assists',
  threes: 'player_threes',
  steals: 'player_steals',
  blocks: 'player_blocks',
  hits: 'batter_hits',
  home_runs: 'batter_home_runs',
  rbis: 'batter_rbis',
  runs: 'batter_runs_scored',
  shots: 'player_shots',
  shots_on_target: 'player_shots_on_target',
  goal_scorer_anytime: 'player_goal_scorer_anytime',
};

const MARKET_KEY_TO_STAT_KEY = Object.fromEntries(Object.entries(MARKET_KEYS).map(([statKey, marketKey]) => [marketKey, statKey]));

// The Odds API uses different prefixes per sport (player_, batter_, ...) - a
// naive prefix strip doesn't reliably reverse market.key back to our stat_key,
// so look it up directly instead.
export function statKeyForMarket(marketKey) {
  return MARKET_KEY_TO_STAT_KEY[marketKey] || marketKey;
}

/**
 * Step 1: list today's games for a sport, to get each game's event ID.
 * IMPORTANT: this call only costs 1 credit regardless of markets/regions,
 * since it's just the schedule, not odds.
 */
export async function getUpcomingEvents(sport) {
  const sportKey = SPORT_KEYS[sport];
  const url = `${BASE_URL}/sports/${sportKey}/events?apiKey=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API events fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Step 2: pull player prop odds for ONE specific game.
 * Cost = number of markets requested (since each market is priced separately).
 * Call this ONCE per game, right when you populate the Play page for that
 * game - not on a timer. The lines are locked in at ticket-build time anyway,
 * so there's no need to keep refreshing this after that.
 */
export async function getPlayerPropsForEvent(sport, eventId, statKeys) {
  const sportKey = SPORT_KEYS[sport];
  const markets = statKeys.map(k => MARKET_KEYS[k]).filter(Boolean).join(',');
  const url = `${BASE_URL}/sports/${sportKey}/events/${eventId}/odds` +
    `?apiKey=${API_KEY}&regions=us&markets=${markets}&oddsFormat=american`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API props fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Turns a raw American-odds line into our 5-tier system (grey/green/blue/purple/gold).
 * This is a starting heuristic based on implied probability bands - tune the
 * cutoffs once you have real data to see how they feel in practice.
 */
export function assignTier(americanOdds) {
  const impliedProbability = americanOddsToImpliedProbability(americanOdds);
  if (impliedProbability >= 0.70) return 'grey';   // safest, lowest reward
  if (impliedProbability >= 0.55) return 'green';
  if (impliedProbability >= 0.45) return 'blue';   // ~coin flip, the "expected" middle tier
  if (impliedProbability >= 0.30) return 'purple';
  return 'gold';                                   // boldest, highest reward
}

function americanOddsToImpliedProbability(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}
