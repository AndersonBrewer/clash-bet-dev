import express from 'express';
import { getScoreboard } from '../lib/espnApi.js';
import { getUpcomingEvents, getPlayerPropsForEvent, assignTier, statKeyForMarket } from '../lib/oddsApi.js';
import { requireAuth } from './authMiddleware.js';
import { ALLOWED_SPORTS } from '../lib/sports.js';

export const gamesRouter = express.Router();

const DEFAULT_STATS_BY_SPORT = {
  baseball: 'hits,home_runs,rbis,runs',
  world_cup: 'shots,shots_on_target,assists,goal_scorer_anytime',
};

// Powers the Play page's game list for a given sport - real schedule, free via ESPN.
gamesRouter.get('/:sport', requireAuth, async (req, res) => {
  if (!ALLOWED_SPORTS.includes(req.params.sport)) {
    return res.status(400).json({ error: `Unsupported sport - this launch only supports: ${ALLOWED_SPORTS.join(', ')}` });
  }
  try {
    const scoreboard = await getScoreboard(req.params.sport);
    const games = (scoreboard.events || []).map(event => {
      const competition = event.competitions[0];
      const home = competition.competitors.find(c => c.homeAway === 'home');
      const away = competition.competitors.find(c => c.homeAway === 'away');
      return {
        eventId: event.id,
        status: competition.status.type.state, // 'pre' | 'in' | 'post'
        statusDetail: competition.status.type.detail,
        home: home.team.displayName,
        away: away.team.displayName,
        homeScore: home.score,
        awayScore: away.score,
      };
    });
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Powers the ticket-builder screen: pulls real player prop lines for one
// game and bundles them with our 5-tier assignment. Call this ONCE when the
// user opens this game's ticket builder - the lines then get locked into
// clash_legs when they submit, no need to refetch after that.
gamesRouter.get('/:sport/:eventId/props', requireAuth, async (req, res) => {
  if (!ALLOWED_SPORTS.includes(req.params.sport)) {
    return res.status(400).json({ error: `Unsupported sport - this launch only supports: ${ALLOWED_SPORTS.join(', ')}` });
  }
  try {
    const statKeys = (req.query.stats || DEFAULT_STATS_BY_SPORT[req.params.sport]).split(',');

    // ESPN's event id and The Odds API's event id are different systems -
    // find the matching Odds API event for this ESPN game by team names.
    const scoreboard = await getScoreboard(req.params.sport);
    const espnEvent = (scoreboard.events || []).find(e => e.id === req.params.eventId);
    if (!espnEvent) return res.status(404).json({ error: 'Game not found' });
    const competition = espnEvent.competitions[0];
    const home = competition.competitors.find(c => c.homeAway === 'home').team.displayName;
    const away = competition.competitors.find(c => c.homeAway === 'away').team.displayName;

    const oddsEvents = await getUpcomingEvents(req.params.sport);
    const oddsEvent = oddsEvents.find(e => e.home_team === home && e.away_team === away);
    if (!oddsEvent) return res.status(404).json({ error: 'No odds available for this game yet' });

    const oddsData = await getPlayerPropsForEvent(req.params.sport, oddsEvent.id, statKeys);

    // Reshape into: { playerName: { stat: [{ tier, line, americanOdds }, ...] } }
    const propsByPlayer = {};
    for (const bookmaker of oddsData.bookmakers || []) {
      for (const market of bookmaker.markets || []) {
        for (const outcome of market.outcomes || []) {
          // Yes/No markets (e.g. anytime goal scorer) list a "Yes" price per
          // player with no numeric line - "No" isn't a meaningful ticket leg.
          if (market.key === 'player_goal_scorer_anytime' && outcome.name !== 'Yes') continue;

          const playerName = outcome.description;
          const stat = statKeyForMarket(market.key);
          propsByPlayer[playerName] = propsByPlayer[playerName] || {};
          propsByPlayer[playerName][stat] = propsByPlayer[playerName][stat] || [];
          propsByPlayer[playerName][stat].push({
            tier: assignTier(outcome.price),
            line: outcome.point ?? 1, // Yes/No markets have no point value - "did it happen at least once"
            americanOdds: outcome.price,
          });
        }
      }
      break; // just use the first bookmaker for now - average across books later if you want sharper lines
    }
    res.json(propsByPlayer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
