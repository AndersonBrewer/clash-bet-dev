import fetch from 'node-fetch';

// ESPN's public but UNOFFICIAL endpoints. No API key needed, but:
// - Not documented or supported by ESPN
// - Could change or break without notice
// - Fine for testing with friends; don't build a real business on this alone long-term
const SPORT_PATHS = {
  basketball: 'basketball/nba',
  baseball: 'baseball/mlb',
  football: 'football/nfl',
  world_cup: 'soccer/fifa.world',
};

/**
 * Get today's scoreboard for a sport - game statuses, scores, and ESPN event IDs.
 * Use the returned event `id` values to match against games shown on your Play page.
 */
export async function getScoreboard(sport, dateYYYYMMDD) {
  const path = SPORT_PATHS[sport];
  const dateParam = dateYYYYMMDD ? `?dates=${dateYYYYMMDD}` : '';
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard${dateParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Get the full box score (individual player stats) for one game.
 * This is what you poll during a live Clash to check whether each leg's
 * stat line has been hit yet.
 */
export async function getGameSummary(sport, eventId) {
  const path = SPORT_PATHS[sport];
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/${path}/summary?event=${eventId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN summary fetch failed: ${res.status}`);
  return res.json();
}

// Strips accents/punctuation so e.g. "Ronald Acuña Jr." matches "Acuna Jr"
// regardless of which form a given data source uses.
const COMBINING_MARK_RANGE = [768, 879]; // Unicode combining diacritical marks block

function stripCombiningMarks(str) {
  let result = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code < COMBINING_MARK_RANGE[0] || code > COMBINING_MARK_RANGE[1]) result += ch;
  }
  return result;
}

export function normalizeName(name) {
  return stripCombiningMarks((name || '').normalize('NFD'))
    .toLowerCase().replace(/[.']/g, '').trim();
}

/**
 * Get one team's active roster - used to figure out which side of the game
 * a given player prop belongs to, since The Odds API's player props don't
 * include team affiliation. Works before a game starts too, unlike the box
 * score. Returns a Map of normalized name -> { headshotUrl } (soccer rosters
 * don't expose headshots via this endpoint, so that'll just be null there).
 */
export async function getTeamRoster(sport, teamId) {
  const path = SPORT_PATHS[sport];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}/roster`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN roster fetch failed: ${res.status}`);
  const data = await res.json();

  const roster = new Map();
  for (const entry of data.athletes || []) {
    // Baseball groups players by position ({ position, items: [...] });
    // soccer's roster is already a flat list of player objects.
    const players = entry.items || [entry];
    for (const p of players) {
      const name = p.fullName || p.displayName;
      if (name) roster.set(normalizeName(name), { headshotUrl: p.headshot?.href || null });
    }
  }
  return roster;
}

// The Odds API and ESPN don't always agree on a player's name - most often
// The Odds API uses a fuller name (extra middle name) than ESPN's roster.
// Falls back to "every word in the shorter name appears in the longer one"
// before giving up. Doesn't catch pure nicknames (e.g. "Vitinha" for "Vitor
// Ferreira") - there's no way to resolve those without a name-alias lookup.
function findRosterEntry(roster, playerName) {
  const normalized = normalizeName(playerName);
  if (roster.has(normalized)) return roster.get(normalized);

  const nameTokens = normalized.split(' ').filter(Boolean);
  for (const rosterName of roster.keys()) {
    const rosterTokens = rosterName.split(' ').filter(Boolean);
    const [shorter, longer] = nameTokens.length <= rosterTokens.length
      ? [nameTokens, rosterTokens]
      : [rosterTokens, nameTokens];
    if (shorter.length > 0 && shorter.every(t => longer.includes(t))) return roster.get(rosterName);
  }
  return null;
}

export function rosterHasPlayer(roster, playerName) {
  return !!findRosterEntry(roster, playerName);
}

export function headshotForPlayer(roster, playerName) {
  return findRosterEntry(roster, playerName)?.headshotUrl || null;
}

// Our stat_key values (from The Odds API's market names) are friendly words
// like "hits" or "points", but ESPN's box score labels each stat with its own
// abbreviation (e.g. "H", "PTS"). This maps stat_key -> ESPN label, per sport.
const STAT_LABELS = {
  basketball: { points: 'PTS', rebounds: 'REB', assists: 'AST', threes: '3PT', steals: 'STL', blocks: 'BLK' },
  baseball: { hits: 'H', home_runs: 'HR', rbis: 'RBI', runs: 'R', strikeouts: 'K', walks: 'BB' },
};

// Soccer's ESPN summary has an entirely different shape - individual player
// stats live under `rosters[].roster[].stats[]` as named objects, not the
// positional label/value arrays basketball and baseball share. This maps
// stat_key -> ESPN's stat `name` field for soccer.
const SOCCER_STAT_NAMES = {
  shots: 'totalShots',
  shots_on_target: 'shotsOnTarget',
  assists: 'goalAssists',
  goal_scorer_anytime: 'totalGoals',
};

function extractSoccerStat(summaryJson, playerName, statKey) {
  const statName = SOCCER_STAT_NAMES[statKey] || statKey;
  for (const teamRoster of summaryJson?.rosters || []) {
    const player = teamRoster.roster?.find(
      p => normalizeName(p.athlete?.displayName) === normalizeName(playerName)
    );
    if (player) {
      const stat = player.stats?.find(s => s.name === statName);
      return stat ? stat.value : 0;
    }
  }
  return null; // player not found
}

/**
 * Pulls a single player's current value for a given stat out of a game
 * summary response. NOTE: the shape varies a lot by sport - this covers
 * basketball, baseball, and soccer. You'll want an equivalent for any
 * additional sport you support.
 */
export function extractPlayerStat(boxscoreJson, playerName, statKey, sport) {
  if (sport === 'world_cup') return extractSoccerStat(boxscoreJson, playerName, statKey);

  const label = STAT_LABELS[sport]?.[statKey] || statKey;
  const teams = boxscoreJson?.boxscore?.players || [];
  for (const team of teams) {
    for (const statGroup of team.statistics || []) {
      const athleteIndex = statGroup.athletes?.findIndex(
        a => normalizeName(a.athlete?.displayName) === normalizeName(playerName)
      );
      if (athleteIndex >= 0) {
        const labels = statGroup.labels || [];
        const statIndex = labels.findIndex(l => l.toLowerCase() === label.toLowerCase());
        if (statIndex >= 0) {
          const value = statGroup.athletes[athleteIndex].stats?.[statIndex];
          return value ? parseFloat(value) : 0;
        }
      }
    }
  }
  return null; // player not found or hasn't recorded that stat yet
}
