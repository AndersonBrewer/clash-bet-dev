import express from 'express';
import { supabaseAdmin } from '../supabaseClient.js';
import { getScoreboard, getTeamRoster, rosterHasPlayer, headshotForPlayer, rosterEntryForPlayer, getBatterSeasonStats } from '../lib/espnApi.js';
import { getUpcomingEvents, getPlayerPropsForEvent, assignTier, statKeyForMarket } from '../lib/oddsApi.js';
import { requireAuth } from './authMiddleware.js';
import { ALLOWED_SPORTS } from '../lib/sports.js';
import { TIER_ORDER, TIER_POINTS } from '../lib/tiers.js';

export const gamesRouter = express.Router();

export const DEFAULT_STATS_BY_SPORT = {
  baseball: 'hits,home_runs,rbis,runs,walks,hits_runs_rbis',
  world_cup: 'shots,shots_on_target,assists,goal_scorer_anytime',
};

// ESPN's scoreboard defaults to a stale "today" when called with no date -
// pass the real current date explicitly so it returns today's actual slate.
function todayYYYYMMDD() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function findEspnEvent(sport, eventId) {
  const scoreboard = await getScoreboard(sport, todayYYYYMMDD());
  return (scoreboard.events || []).find(e => e.id === eventId);
}

// ESPN and The Odds API don't always agree on a team's name (e.g. ESPN's
// "United States" vs The Odds API's "USA") - unlike player names, this can't
// be caught by a token-subset match since the two names share no words at
// all. Extend this table as more mismatches turn up (soccer country names
// are the most likely source - things like "South Korea" vs "Korea
// Republic" haven't been seen yet, but wouldn't be surprising).
const TEAM_NAME_ALIASES = {
  'united states': 'usa',
};

function normalizeTeamName(name) {
  const lower = name.toLowerCase();
  return TEAM_NAME_ALIASES[lower] || lower;
}

// A single stat can have multiple lines (e.g. Over 0.5 and Over 1.5), and
// their implied-probability tiers can collide - keeping every option would
// let two indistinguishable-looking chips of the same tier color show up.
// This app's whole model is "pick one of 5 risk tiers", so keep one option
// per tier (whichever we saw first) and always show them safest-to-boldest.
function dedupeAndSortTiers(options) {
  const byTier = new Map();
  for (const opt of options) {
    if (!byTier.has(opt.tier)) byTier.set(opt.tier, opt);
  }
  return TIER_ORDER.filter(t => byTier.has(t)).map(t => byTier.get(t));
}

// Powers the Play page's game list for a given sport - real schedule, free via ESPN.
gamesRouter.get('/:sport', requireAuth, async (req, res) => {
  if (!ALLOWED_SPORTS.includes(req.params.sport)) {
    return res.status(400).json({ error: `Unsupported sport - this launch only supports: ${ALLOWED_SPORTS.join(', ')}` });
  }
  try {
    const scoreboard = await getScoreboard(req.params.sport, todayYYYYMMDD());
    const games = (scoreboard.events || [])
      .map(event => {
        const competition = event.competitions[0];
        const home = competition.competitors.find(c => c.homeAway === 'home');
        const away = competition.competitors.find(c => c.homeAway === 'away');
        return {
          eventId: event.id,
          status: competition.status.type.state, // 'pre' | 'in' | 'post'
          statusDetail: competition.status.type.detail,
          startTime: event.date,
          home: home.team.displayName,
          away: away.team.displayName,
          homeScore: home.score,
          awayScore: away.score,
        };
      })
      .filter(g => g.status !== 'post') // only upcoming/live games - not ones that already finished
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Builds the ticket-builder's props payload for one game: real player prop
// lines bundled with our 5-tier assignment. Extracted from the route below
// so clash creation can call it directly too, to snapshot exactly what a
// challenger saw at the moment they built their ticket (see props_snapshot
// on the clashes table) - the accept side then builds against that same
// snapshot instead of a fresh live fetch that could show different lines.
export async function buildPropsPayload(sport, eventId, statKeys) {
  // ESPN's event id and The Odds API's event id are different systems -
  // find the matching Odds API event for this ESPN game by team names.
  const espnEvent = await findEspnEvent(sport, eventId);
  if (!espnEvent) throw new ApiError(404, 'Game not found');
  const competition = espnEvent.competitions[0];
  const homeTeam = competition.competitors.find(c => c.homeAway === 'home').team;
  const awayTeam = competition.competitors.find(c => c.homeAway === 'away').team;

  const oddsEvents = await getUpcomingEvents(sport);
  const oddsEvent = oddsEvents.find(e =>
    normalizeTeamName(e.home_team) === normalizeTeamName(homeTeam.displayName) &&
    normalizeTeamName(e.away_team) === normalizeTeamName(awayTeam.displayName)
  );
  if (!oddsEvent) throw new ApiError(404, 'No odds available for this game yet');

  // The Odds API's player props don't say which team a player is on - pull
  // both rosters so the ticket builder can offer a team toggle.
  const [homeRoster, awayRoster] = await Promise.all([
    getTeamRoster(sport, homeTeam.id),
    getTeamRoster(sport, awayTeam.id),
  ]);

  const oddsData = await getPlayerPropsForEvent(sport, oddsEvent.id, statKeys);

  // Reshape into: { playerName: { team, headshotUrl, stats: { stat: {
  //   overUnder: true,  over: [{tier, points, line, americanOdds}, ...], under: [...]
  // } } } } for Over/Under markets, or { overUnder: false, options: [...] }
  // for Yes/No markets (e.g. anytime goal scorer) that have no Under side.
  const players = {};
  for (const bookmaker of oddsData.bookmakers || []) {
    for (const market of bookmaker.markets || []) {
      const isYesNo = market.key === 'player_goal_scorer_anytime';
      for (const outcome of market.outcomes || []) {
        // Yes/No markets list a "Yes" price per player with no numeric
        // line - "No" isn't a meaningful ticket leg.
        if (isYesNo && outcome.name !== 'Yes') continue;

        const playerName = outcome.description;
        const stat = statKeyForMarket(market.key);
        const team = rosterHasPlayer(homeRoster, playerName) ? 'home' : rosterHasPlayer(awayRoster, playerName) ? 'away' : null;
        if (!team) continue; // can't attribute to a side - drop rather than invent a fake "Other" bucket

        const roster = team === 'home' ? homeRoster : awayRoster;
        const headshotUrl = headshotForPlayer(roster, playerName);
        const rosterEntry = rosterEntryForPlayer(roster, playerName);
        const tier = assignTier(outcome.price);
        const entry = {
          tier,
          points: TIER_POINTS[tier],
          line: outcome.point ?? 1, // Yes/No markets have no point value - "did it happen at least once"
          americanOdds: outcome.price,
        };

        players[playerName] = players[playerName] || {
          team, headshotUrl, position: rosterEntry?.position || null, athleteId: rosterEntry?.athleteId || null, stats: {},
        };
        players[playerName].stats[stat] = players[playerName].stats[stat]
          || { overUnder: !isYesNo, over: [], under: [], options: [] };

        if (isYesNo) players[playerName].stats[stat].options.push(entry);
        else if (outcome.name === 'Under') players[playerName].stats[stat].under.push(entry);
        else players[playerName].stats[stat].over.push(entry);
      }
    }
    // Merge across every bookmaker rather than stopping at the first - a
    // single book frequently only prices a subset of markets for a given
    // game (e.g. betmgm often has just goal_scorer_anytime for a soccer
    // match, while betrivers/fanduel also have shots/assists for the same
    // game), so stopping early was silently dropping real prop variety.
    // dedupeAndSortTiers below already resolves same-tier duplicates across
    // books by keeping whichever was seen first.
  }
  for (const info of Object.values(players)) {
    for (const stat of Object.keys(info.stats)) {
      const s = info.stats[stat];
      if (s.overUnder) {
        s.over = dedupeAndSortTiers(s.over);
        s.under = dedupeAndSortTiers(s.under);
      } else {
        s.options = dedupeAndSortTiers(s.options);
      }
    }
  }

  // Season AVG/OPS/RBI-per-game for the player list, baseball only - the
  // ticket builder shows these instead of a bare stat name so a pick can
  // be judged at a glance. Fetched in parallel since it's 2 ESPN calls per
  // player; a missing/failed lookup just means that player shows no blurb.
  if (sport === 'baseball') {
    await Promise.all(Object.values(players).map(async (info) => {
      if (info.athleteId) info.seasonStats = await getBatterSeasonStats(info.athleteId);
    }));
  }

  return {
    teams: {
      home: homeTeam.displayName, away: awayTeam.displayName,
      homeLogo: homeTeam.logo || null, awayLogo: awayTeam.logo || null,
    },
    players,
  };
}

// Powers the ticket-builder screen. Call this ONCE when the user opens this
// game's ticket builder - the lines then get locked into clash_legs when
// they submit, no need to refetch after that.
gamesRouter.get('/:sport/:eventId/props', requireAuth, async (req, res) => {
  if (!ALLOWED_SPORTS.includes(req.params.sport)) {
    return res.status(400).json({ error: `Unsupported sport - this launch only supports: ${ALLOWED_SPORTS.join(', ')}` });
  }
  try {
    // Accepting a challenge should see the EXACT odds the challenger built
    // their ticket against, not a fresh live fetch - challenge/accept is
    // async (could be hours or days apart) and lines can move in that gap.
    if (req.query.clashId) {
      const { data: clash } = await supabaseAdmin.from('clashes').select('props_snapshot').eq('id', req.query.clashId).single();
      if (clash?.props_snapshot) return res.json(clash.props_snapshot);
    }

    const statKeys = (req.query.stats || DEFAULT_STATS_BY_SPORT[req.params.sport]).split(',');
    const payload = await buildPropsPayload(req.params.sport, req.params.eventId, statKeys);
    res.json(payload);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});
