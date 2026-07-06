import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// The anon key is meant to be public - safe to ship in frontend code.
// RLS on the Supabase tables (and this backend's own auth checks) is what
// actually enforces access control, not keeping this secret.
const SUPABASE_URL = 'https://hgkjkzeiaqbydgtljpbc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhna2premVpYXFieWRndGxqcGJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyOTQ3MTksImV4cCI6MjA5ODg3MDcxOX0.TeD_rjQC5xyeo2o_WvwQ8D7jH4JUK9-mZoKlIlETJPU';
const API_BASE = '/api';
const REQUIRED_LEG_COUNT = 4;
const TIER_ORDER = ['grey', 'green', 'blue', 'purple', 'gold']; // must match src/lib/tiers.js
const SPORTS = [
  { key: 'basketball', label: 'Basketball', icon: '🏀', supported: false },
  { key: 'football', label: 'Football', icon: '🏈', supported: false },
  { key: 'baseball', label: 'MLB', icon: '⚾', supported: true },
  { key: 'world_cup', label: 'World Cup', icon: '⚽', supported: true },
];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  session: null,
  profile: null,
  screen: 'loading', // loading | auth | onboarding | home
  authMode: 'login', // login | signup
  tab: 'play', // play | friends | clashes
  sport: 'baseball',
  comingSoonSport: null,
  games: [],
  builder: null, // { mode: 'create'|'accept', sport, eventId, eventLabel, clashId, opponentId, props, ticket: [] }
  clashReveal: null, // full clash object (with clash_legs) - shown right after both tickets are known
  friends: [],
  pendingRequests: [],
  searchQuery: '',
  searchResults: [],
  clashes: [],
  clashesTab: 'active', // active | finished
  expandedClashId: null,
  dismissedClashIds: new Set(), // session-only - not persisted, matches the prototype's own fidelity here
  error: null,
  busy: false,
  showSettings: false,
};

async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.session) headers.Authorization = `Bearer ${state.session.access_token}`;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function setState(patch) {
  Object.assign(state, patch);
  render();
}

async function runAction(fn) {
  state.error = null;
  state.busy = true;
  render();
  try {
    await fn();
  } catch (err) {
    state.error = err.message;
  }
  state.busy = false;
  render();
}

// --- Auth bootstrap ---

supabase.auth.onAuthStateChange((_event, session) => {
  state.session = session;
  if (session) {
    loadProfile();
  } else {
    setState({ screen: 'auth', profile: null });
  }
});

async function loadProfile() {
  try {
    const profile = await apiFetch(`/users/profile/${state.session.user.id}`);
    setState({ profile, screen: 'home' });
    refreshHomeData();
  } catch {
    setState({ screen: 'onboarding' });
  }
}

async function refreshHomeData() {
  await runAction(async () => {
    const [games, friends, pendingRequests, clashes] = await Promise.all([
      apiFetch(`/games/${state.sport}`),
      apiFetch('/users/friends'),
      apiFetch('/users/friends/pending'),
      apiFetch('/clashes'),
    ]);
    Object.assign(state, { games, friends, pendingRequests, clashes });
  });
}

// --- Render ---

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.appendChild(
    state.screen === 'auth' ? renderAuthScreen() :
    state.screen === 'onboarding' ? renderOnboardingScreen() :
    state.screen === 'home' ? renderHomeScreen() :
    el('p', {}, 'Loading...')
  );
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'className') {
      node.className = value;
    } else if (typeof value === 'boolean') {
      // Presence of a boolean attribute (disabled, selected, ...) is what
      // matters in HTML - setAttribute('disabled', false) still disables it.
      if (value) node.setAttribute(key, '');
    } else if (value != null) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children.flat()) {
    // `condition && el(...)` is a common pattern here, and evaluates to
    // `false` (not null/undefined) when the condition doesn't hold.
    if (child == null || child === false) continue;
    const isPrimitive = typeof child === 'string' || typeof child === 'number';
    node.appendChild(isPrimitive ? document.createTextNode(String(child)) : child);
  }
  return node;
}

function errorBanner() {
  return state.error ? el('div', { className: 'error' }, state.error) : null;
}

// --- Auth screen ---

function renderAuthScreen() {
  const isSignup = state.authMode === 'signup';
  let emailInput, passwordInput, usernameInput;

  const submit = () => runAction(async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (isSignup) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  });

  return el('div', {},
    el('h1', {}, 'Clash Bet'),
    el('div', { className: 'card' },
      el('h2', {}, isSignup ? 'Sign up' : 'Log in'),
      errorBanner(),
      emailInput = el('input', { type: 'email', placeholder: 'Email' }),
      passwordInput = el('input', { type: 'password', placeholder: 'Password' }),
      el('button', { onclick: submit, disabled: state.busy }, isSignup ? 'Sign up' : 'Log in'),
      el('p', { className: 'muted' },
        isSignup ? 'Already have an account? ' : "Don't have an account? ",
        el('a', {
          href: '#',
          onclick: (e) => { e.preventDefault(); setState({ authMode: isSignup ? 'login' : 'signup', error: null }); },
        }, isSignup ? 'Log in' : 'Sign up')
      )
    )
  );
}

// --- Onboarding screen ---

function renderOnboardingScreen() {
  let usernameInput;
  const submit = () => runAction(async () => {
    const profile = await apiFetch('/users/profile', {
      method: 'POST',
      body: JSON.stringify({ username: usernameInput.value.trim() }),
    });
    setState({ profile, screen: 'home' });
    refreshHomeData();
  });

  return el('div', {},
    el('h1', {}, 'Welcome to Clash Bet'),
    el('div', { className: 'card' },
      el('h2', {}, 'Pick a username'),
      errorBanner(),
      usernameInput = el('input', { placeholder: 'Username' }),
      el('button', { onclick: submit, disabled: state.busy }, 'Create profile')
    )
  );
}

// --- Home screen ---

function renderHomeScreen() {
  return el('div', { style: 'display:flex; flex-direction:column; flex:1; min-height:0;' },
    el('div', { className: 'app-header' },
      el('div', { className: 'user', onclick: () => alert('Avatar / profile editing - not built yet') },
        el('div', { className: 'avatar-circle', style: `background:${state.profile.avatar_color || '#4c7bf0'};` }),
        el('div', {},
          el('div', { className: 'username' }, state.profile.username),
          el('div', { className: 'elo' }, `${state.profile.elo} ELO`)
        )
      ),
      el('div', { className: 'row', style: 'gap: 14px;' },
        el('div', { className: 'icon-btn', onclick: () => alert('Notifications - coming soon') }, '🔔'),
        el('div', { className: 'icon-btn', onclick: () => setState({ showSettings: true }) }, '⚙️')
      )
    ),
    errorBanner(),
    state.clashReveal ? renderClashReveal(state.clashReveal) :
    state.builder ? renderTicketBuilder() :
    state.tab === 'play' ? renderPlayTab() :
    state.tab === 'friends' ? el('div', { className: 'content' }, renderFriendsTab()) :
    el('div', { className: 'content' }, renderClashesTab()),
    el('div', { className: 'bottomnav' },
      navIcon('play', '▶️'),
      navIcon('friends', '👥'),
      navIcon('clashes', '🎫')
    ),
    state.showSettings ? renderSettingsOverlay() : null
  );
}

function navIcon(key, icon) {
  return el('button', {
    className: `navicon ${state.tab === key ? 'current' : ''}`,
    onclick: () => setState({ tab: key, builder: null }),
  }, icon);
}

function renderSettingsOverlay() {
  return el('div', {
    className: 'overlay',
    onclick: (e) => { if (e.target === e.currentTarget) setState({ showSettings: false }); },
  },
    el('div', { className: 'overlay-panel' },
      el('div', { className: 'overlay-close', onclick: () => setState({ showSettings: false }) }, '✕'),
      el('div', { className: 'overlay-title' }, 'SETTINGS'),
      el('div', { className: 'overlay-card', onclick: () => alert('Edit profile - not built yet') },
        el('h4', {}, 'Edit Profile'),
        el('div', { className: 'muted' }, 'Change your username or profile picture')
      ),
      el('div', { className: 'overlay-card', onclick: () => alert('Account settings - not built yet') },
        el('h4', {}, 'Account'),
        el('div', { className: 'muted' }, 'Email, password, notification preferences')
      ),
      el('div', { className: 'overlay-card danger', onclick: () => supabase.auth.signOut() },
        el('h4', {}, 'Log Out')
      )
    )
  );
}

// --- Play tab ---

function renderPlayTab() {
  const sportButtons = SPORTS.map(s => el('div', {
    className: `sport-icon ${(state.comingSoonSport ? state.comingSoonSport === s.key : state.sport === s.key) ? 'active' : ''}`,
    onclick: () => {
      if (!s.supported) { setState({ comingSoonSport: s.key }); return; }
      runAction(async () => {
        const games = await apiFetch(`/games/${s.key}`);
        setState({ sport: s.key, games, comingSoonSport: null });
      });
    },
  }, s.icon));

  return el('div', { style: 'display:flex; flex-direction:column; flex:1; min-height:0;' },
    el('div', { className: 'sportbar' }, ...sportButtons),
    el('div', { className: 'content' },
      state.comingSoonSport
        ? el('div', { className: 'unavailable-panel' }, `Prop picking for ${SPORTS.find(s => s.key === state.comingSoonSport).label} is coming soon.`)
        : el('div', {}, ...state.games.map(renderGameCard))
    )
  );
}

function renderGameCard(game) {
  const label = `${game.away} @ ${game.home}`;
  const when = game.status === 'in'
    ? `Live - ${game.statusDetail}`
    : new Date(game.startTime).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return el('div', {
    className: 'game-card',
    onclick: () => openTicketBuilder({ mode: 'create', sport: state.sport, eventId: game.eventId, eventLabel: label }),
  },
    el('div', { className: 'matchup' }, label.toUpperCase()),
    el('div', { className: 'when' }, when)
  );
}

// --- Ticket builder (shared by create-challenge and accept-challenge flows) ---
// Guided flow: pick a team -> pick a player on that team -> pick one of
// their available stats -> pick a tier chip, which adds the leg and returns
// to the player list for the next pick.

async function openTicketBuilder({ mode, sport, eventId, eventLabel, clashId, opponentId }) {
  await runAction(async () => {
    const props = await apiFetch(`/games/${sport}/${eventId}/props`);
    state.builder = {
      mode, sport, eventId, eventLabel, clashId, opponentId, props,
      ticket: Array(REQUIRED_LEG_COUNT).fill(null),
      activeLegIndex: 0,
      selectedOpponentId: opponentId || '',
      selectedTeam: 'home',
      selectedPlayer: null,
      selectedStat: null,
      pendingSide: 'over',
      pendingTier: null,
    };
  });
}

function playerAvatar(headshotUrl, className = 'player-avatar') {
  return headshotUrl
    ? el('img', { src: headshotUrl, className })
    : el('div', { className: `${className} player-avatar-placeholder` });
}

function teamLogo(logoUrl, teamName) {
  return logoUrl
    ? el('img', { src: logoUrl, className: 'logo', title: teamName })
    : el('div', { className: 'logo' }, teamName.toUpperCase());
}

function nextEmptyLegIndex(ticket) {
  const idx = ticket.findIndex(l => l === null);
  return idx === -1 ? ticket.length - 1 : idx;
}

function resetPendingPick(b) {
  b.selectedPlayer = null;
  b.selectedStat = null;
  b.pendingTier = null;
  b.pendingSide = 'over';
}

function selectLegSlot(i) {
  const b = state.builder;
  b.activeLegIndex = i;
  const leg = b.ticket[i];
  if (leg) {
    b.selectedPlayer = leg.playerName;
    b.selectedStat = leg.statKey;
    b.pendingTier = leg.tier;
    b.pendingSide = leg.overUnder;
  } else {
    resetPendingPick(b);
  }
  render();
}

function pickPlayer(name) {
  const b = state.builder;
  if (b.ticket.some(l => l && l.playerName === name)) return;
  b.selectedPlayer = name;
  b.selectedStat = null;
  b.pendingTier = null;
  b.pendingSide = 'over';
  render();
}

function pickStat(statKey) {
  const b = state.builder;
  const stat = b.props.players[b.selectedPlayer].stats[statKey];
  b.selectedStat = statKey;
  b.pendingTier = null;
  b.pendingSide = stat.overUnder ? 'over' : null;
  render();
}

function setPendingSide(side) {
  state.builder.pendingSide = side;
  state.builder.pendingTier = null; // switching sides invalidates whichever box was highlighted
  render();
}

function selectPendingTier(tierName) {
  state.builder.pendingTier = tierName;
  render();
}

function currentTierOptions(b) {
  const stat = b.props.players[b.selectedPlayer].stats[b.selectedStat];
  if (!stat.overUnder) return stat.options;
  return b.pendingSide === 'under' ? stat.under : stat.over;
}

function confirmLockLeg() {
  const b = state.builder;
  if (!b.pendingTier) return;
  const option = currentTierOptions(b).find(o => o.tier === b.pendingTier);
  if (!option) return;
  b.ticket[b.activeLegIndex] = {
    playerName: b.selectedPlayer,
    statKey: b.selectedStat,
    tier: option.tier,
    line: option.line,
    overUnder: b.pendingSide === 'under' ? 'under' : 'over',
  };
  b.activeLegIndex = nextEmptyLegIndex(b.ticket);
  resetPendingPick(b);
  render();
}

function renderTicketBuilder() {
  const b = state.builder;
  const { teams, players } = b.props;
  const filledCount = b.ticket.filter(Boolean).length;
  const ticketFull = filledCount === REQUIRED_LEG_COUNT;

  let step;
  if (!b.selectedPlayer) step = renderPlayerStep(b, teams, players);
  else if (!b.selectedStat) step = renderStatStep(b, players[b.selectedPlayer]);
  else step = renderLineStep(b, players[b.selectedPlayer]);

  const opponentPicker = b.mode === 'create' ? el('div', { className: 'opponent-picker' },
    el('div', { className: 'step-label' }, 'CHALLENGE A FRIEND'),
    state.friends.length === 0
      ? el('p', { className: 'muted', style: 'text-align:center;' }, 'Add a friend first from the Friends tab.')
      : el('select', {
          onchange: (e) => { b.selectedOpponentId = e.target.value; render(); },
        },
          el('option', { value: '' }, 'Pick an opponent...'),
          ...state.friends.map(f => {
            const isMeRequester = f.requester_id === state.profile.id;
            const friendProfile = isMeRequester ? f.recipient : f.requester;
            const friendId = isMeRequester ? f.recipient_id : f.requester_id;
            return el('option', { value: friendId, selected: b.selectedOpponentId === friendId }, friendProfile.username);
          })
        )
  ) : null;

  const canSubmit = ticketFull && (b.mode === 'accept' || b.selectedOpponentId);

  const submit = () => runAction(async () => {
    if (b.mode === 'create') {
      await apiFetch('/clashes', {
        method: 'POST',
        body: JSON.stringify({
          opponentId: b.selectedOpponentId,
          sport: b.sport,
          eventExternalId: b.eventId,
          eventLabel: b.eventLabel,
          myLegs: b.ticket,
        }),
      });
      const clashes = await apiFetch('/clashes');
      setState({ builder: null, tab: 'clashes', clashes });
    } else {
      const accepted = await apiFetch(`/clashes/${b.clashId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ legs: b.ticket }),
      });
      const clashes = await apiFetch('/clashes');
      // Both tickets are only ever simultaneously known right at this
      // moment for the accepting side - that's the one real trigger point
      // for the head-to-head reveal in an async challenge/accept flow.
      const full = clashes.find(c => c.id === accepted.id);
      setState({ builder: null, clashes, clashReveal: full || null });
    }
  });

  return el('div', { style: 'display:flex; flex-direction:column; flex:1; min-height:0;' },
    el('div', { className: 'topnav-row' },
      el('span', { className: 'back-arrow', onclick: () => setState({ builder: null }) }, '←')
    ),
    el('div', { className: 'match-header' },
      el('div', { className: 'logos' },
        teamLogo(teams.awayLogo, teams.away),
        el('div', { className: 'vs' }, 'VS'),
        teamLogo(teams.homeLogo, teams.home)
      ),
      el('div', { className: 'time' }, b.eventLabel)
    ),
    errorBanner(),
    el('div', { className: 'panel' },
      el('div', { className: 'close-x-row' }, el('span', { className: 'close-x-inline', onclick: () => setState({ builder: null }) }, '✕')),
      step,
      opponentPicker,
      el('button', {
        className: `play-btn ${canSubmit ? 'enabled' : 'disabled'}`,
        disabled: !canSubmit || state.busy,
        onclick: submit,
      }, `${b.mode === 'create' ? 'PLAY' : 'ACCEPT'} (${filledCount}/${REQUIRED_LEG_COUNT})`)
    ),
    el('div', { className: 'circles' },
      ...b.ticket.map((leg, i) => el('div', {
        className: `circle ${leg ? `tier-${leg.tier}` : ''} ${i === b.activeLegIndex ? 'active-ring' : ''}`,
        onclick: () => selectLegSlot(i),
      }))
    )
  );
}

function renderPlayerStep(b, teams, players) {
  const usedPlayers = new Set(b.ticket.filter(Boolean).map(l => l.playerName));
  const teamPlayers = Object.entries(players).filter(([, info]) => info.team === b.selectedTeam);

  return el('div', {},
    el('div', { className: 'step-label' }, 'SELECT A PLAYER'),
    el('div', { className: 'teamrow' },
      el('span', { className: b.selectedTeam === 'home' ? 'active' : '', onclick: () => { b.selectedTeam = 'home'; render(); } }, teams.home),
      el('span', { className: b.selectedTeam === 'away' ? 'active' : '', onclick: () => { b.selectedTeam = 'away'; render(); } }, teams.away)
    ),
    teamPlayers.length === 0 ? el('p', { className: 'muted', style: 'text-align:center;' }, 'No props available for this team yet.') : null,
    ...teamPlayers.map(([name, info]) => {
      const used = usedPlayers.has(name);
      return el('div', {
        className: `player-row ${used ? 'used' : ''}`,
        onclick: () => pickPlayer(name),
      },
        playerAvatar(info.headshotUrl, 'pfoto'),
        el('div', { className: 'pname' }, name.toUpperCase()),
        el('div', { className: 'pills' }, ...Object.keys(info.stats).map(statKey => el('div', { className: 'pill' }, statKey.replace(/_/g, ' '))))
      );
    })
  );
}

function disabledTeamRow(b) {
  const teams = b.props.teams;
  return el('div', { className: 'teamrow' },
    el('span', { className: b.selectedTeam === 'home' ? 'active' : '' }, teams.home),
    el('span', { className: b.selectedTeam === 'away' ? 'active' : '' }, teams.away)
  );
}

function renderStatStep(b, playerInfo) {
  return el('div', {},
    el('div', { className: 'step-label' }, 'SELECT A STAT'),
    disabledTeamRow(b),
    el('div', { className: 'player-single' },
      playerAvatar(playerInfo.headshotUrl, 'pfoto-lg'),
      el('div', { style: 'font-weight:800;' }, b.selectedPlayer.toUpperCase())
    ),
    ...Object.entries(playerInfo.stats).map(([statKey, stat]) => {
      const preview = (stat.overUnder ? (stat.over[0] || stat.under[0]) : stat.options[0]);
      return el('div', { className: 'stat-row', onclick: () => pickStat(statKey) },
        el('span', {}, statKey.replace(/_/g, ' ').toUpperCase()),
        el('span', {}, preview ? preview.line : '—')
      );
    })
  );
}

function renderLineStep(b, playerInfo) {
  const stat = playerInfo.stats[b.selectedStat];
  const options = currentTierOptions(b);
  const optionByTier = Object.fromEntries(options.map(o => [o.tier, o]));

  const tierBoxes = TIER_ORDER.map(tierName => {
    const opt = optionByTier[tierName];
    const selected = b.pendingTier === tierName;
    return el('div', {
      className: `tier-box tier-${tierName} ${selected ? 'selected' : ''} ${opt ? '' : 'disabled'}`,
      onclick: () => { if (opt) selectPendingTier(tierName); },
    },
      el('div', {}, opt ? opt.line : '—'),
      el('div', { className: 'tier-points' }, opt ? `+${opt.points}` : '')
    );
  });

  return el('div', {},
    el('div', { className: 'step-label' }, 'SELECT A LINE'),
    disabledTeamRow(b),
    el('div', { className: 'player-single', style: 'text-align:left; display:flex; align-items:center; gap:12px;' },
      playerAvatar(playerInfo.headshotUrl, 'pfoto-lg'),
      el('div', { style: 'font-weight:800;' }, b.selectedPlayer.toUpperCase())
    ),
    el('div', { className: 'stat-label' }, b.selectedStat.replace(/_/g, ' ').toUpperCase()),
    stat.overUnder ? el('div', { className: 'ou-toggle' },
      el('div', { className: `ou-btn ${b.pendingSide === 'over' ? 'ou-selected' : ''}`, onclick: () => setPendingSide('over') }, 'OVER'),
      el('div', { className: `ou-btn ${b.pendingSide === 'under' ? 'ou-selected' : ''}`, onclick: () => setPendingSide('under') }, 'UNDER')
    ) : null,
    el('div', { className: 'tiers' }, ...tierBoxes),
    el('button', { className: 'lockbtn', disabled: !b.pendingTier, onclick: confirmLockLeg }, 'LOCK IT IN')
  );
}

// --- Play.Clash (head-to-head reveal) ---
// Shown right after both tickets are known. In our async challenge/accept
// flow that's only ever true right when the accepting player submits - the
// challenger only sees this later via the polling check near the bottom of
// this file, which detects their Clash flipping out of 'awaiting_opponent'.

function shortName(fullName) {
  const parts = fullName.split(' ');
  return parts[parts.length - 1];
}

function ouLabel(overUnder) {
  return overUnder === 'under' ? 'U' : 'O';
}

function renderClashReveal(clash) {
  const isB = clash.user_b_id === state.profile.id;
  const myLegs = clash.clash_legs.filter(l => l.owner_id === state.profile.id);
  const oppLegs = clash.clash_legs.filter(l => l.owner_id !== state.profile.id);
  const myName = (isB ? clash.user_b_username : clash.user_a_username) || 'You';
  const oppName = (isB ? clash.user_a_username : clash.user_b_username) || 'Opponent';
  const myColor = (isB ? clash.user_b_avatar_color : clash.user_a_avatar_color) || '#4a7bf0';
  const oppColor = (isB ? clash.user_a_avatar_color : clash.user_b_avatar_color) || '#d9455f';

  const rows = myLegs.map((myLeg, i) => {
    const oppLeg = oppLegs[i];
    const delay = (i * 0.35).toFixed(2);
    return el('div', { className: 'clash-row' },
      el('div', { className: `leg-box leg-you tier-${myLeg.tier}`, style: `animation-delay:${delay}s;` },
        el('div', { className: 'leg-player' }, shortName(myLeg.player_name)),
        el('div', { className: 'leg-detail' }, `${myLeg.stat_key.replace(/_/g, ' ')} ${ouLabel(myLeg.over_under)} ${myLeg.line}`)
      ),
      oppLeg ? el('div', { className: `leg-box leg-opp tier-${oppLeg.tier}`, style: `animation-delay:${delay}s;` },
        el('div', { className: 'leg-player' }, shortName(oppLeg.player_name)),
        el('div', { className: 'leg-detail' }, `${oppLeg.stat_key.replace(/_/g, ' ')} ${ouLabel(oppLeg.over_under)} ${oppLeg.line}`)
      ) : null
    );
  });

  return el('div', { style: 'display:flex; flex-direction:column; flex:1; min-height:0;' },
    el('div', { className: 'topnav-row' },
      el('span', { className: 'back-arrow', onclick: () => setState({ clashReveal: null }) }, '←')
    ),
    el('div', { className: 'clash-header' },
      el('div', { style: 'text-align:center;' },
        el('div', { className: 'clash-avatar', style: `background:${myColor}; margin:0 auto 6px;` }),
        el('div', { className: 'clash-name' }, myName)
      ),
      el('div', { className: 'clash-vs' }, 'VS'),
      el('div', { style: 'text-align:center;' },
        el('div', { className: 'clash-avatar', style: `background:${oppColor}; margin:0 auto 6px;` }),
        el('div', { className: 'clash-name' }, oppName)
      )
    ),
    el('div', { className: 'clash-body' }, el('div', { className: 'clash-divider' }), ...rows),
    el('div', { style: 'padding:0 16px 16px;' },
      el('div', { className: 'lockbtn', onclick: () => setState({ clashReveal: null, tab: 'clashes' }) }, 'VIEW IN CLASHES')
    )
  );
}

// --- Friends tab ---

function renderFriendsTab() {
  let searchInput;

  const search = () => runAction(async () => {
    const results = await apiFetch(`/users/search?username=${encodeURIComponent(searchInput.value.trim())}`);
    setState({ searchResults: results });
  });

  const sendRequest = (recipientId) => runAction(async () => {
    await apiFetch('/users/friends/request', { method: 'POST', body: JSON.stringify({ recipientId }) });
    setState({ searchResults: [] });
  });

  const respond = (id, accept) => runAction(async () => {
    await apiFetch(`/users/friends/${id}/respond`, { method: 'POST', body: JSON.stringify({ accept }) });
    await refreshHomeData();
  });

  return el('div', {},
    el('div', { className: 'card' },
      el('h3', {}, 'Add a friend'),
      el('div', { className: 'row' },
        searchInput = el('input', { placeholder: 'Search by username' }),
        el('button', { onclick: search }, 'Search')
      ),
      ...state.searchResults.map(u => el('div', { className: 'row between' },
        el('span', {}, u.username),
        el('button', { onclick: () => sendRequest(u.id) }, 'Add')
      ))
    ),
    state.pendingRequests.length > 0 && el('div', { className: 'card' },
      el('h3', {}, 'Pending requests'),
      ...state.pendingRequests.map(r => el('div', { className: 'row between' },
        el('span', {}, r.requester.username),
        el('div', { className: 'row' },
          el('button', { onclick: () => respond(r.id, true) }, 'Accept'),
          el('button', { className: 'secondary', onclick: () => respond(r.id, false) }, 'Decline')
        )
      ))
    ),
    el('div', { className: 'card' },
      el('h3', {}, 'Friends'),
      state.friends.length === 0 ? el('p', { className: 'muted' }, 'No friends yet.') : null,
      ...state.friends.map(f => {
        const friend = f.requester_id === state.profile.id ? f.recipient : f.requester;
        return el('div', { className: 'row between' },
          el('span', {}, friend.username),
          el('span', { className: 'muted' }, `ELO ${friend.elo}`)
        );
      })
    )
  );
}

// --- Clashes tab ---

const ACTIVE_STATUSES = ['awaiting_opponent', 'pending', 'live'];

function renderClashesTab() {
  const visible = state.clashes.filter(c => !state.dismissedClashIds.has(c.id));
  const list = visible.filter(c => ACTIVE_STATUSES.includes(c.status) === (state.clashesTab === 'active'));

  return el('div', {},
    el('div', { className: 'ou-toggle', style: 'margin-bottom: 16px;' },
      el('div', {
        className: `ou-btn ${state.clashesTab === 'active' ? 'ou-selected' : ''}`,
        onclick: () => setState({ clashesTab: 'active', expandedClashId: null }),
      }, 'ACTIVE'),
      el('div', {
        className: `ou-btn ${state.clashesTab === 'finished' ? 'ou-selected' : ''}`,
        onclick: () => setState({ clashesTab: 'finished', expandedClashId: null }),
      }, 'FINISHED')
    ),
    list.length === 0
      ? el('p', { className: 'muted', style: 'text-align:center; margin-top:30px;' },
          state.clashesTab === 'active' ? 'No active Clashes right now.' : 'No finished Clashes yet.')
      : null,
    ...list.map(renderClashBanner)
  );
}

// Our statuses are absolute (won_a/won_b); banners need them from the
// viewer's own perspective (won/lost/tied), like the prototype's model.
function myResultLabel(clash, isB) {
  if (clash.status === 'won_a') return isB ? 'lost' : 'won';
  if (clash.status === 'won_b') return isB ? 'won' : 'lost';
  if (clash.status === 'tied') return 'tied';
  return clash.status; // awaiting_opponent | pending | live
}

function progressIcon(leg) {
  const hit = leg.hit !== null ? leg.hit
    : leg.over_under === 'under' ? leg.current_value <= leg.line : leg.current_value >= leg.line;
  return hit ? '✅' : '❌';
}

function renderLegProgressBox(leg, sideClass, showProgress) {
  return el('div', { className: `leg-progress-box ${sideClass} tier-${leg.tier}` },
    el('div', { className: 'leg-player' }, shortName(leg.player_name)),
    el('div', { className: 'leg-detail' },
      `${leg.stat_key.replace(/_/g, ' ')} ${ouLabel(leg.over_under)} ${showProgress ? `${leg.current_value} / ` : ''}${leg.line}`),
    el('div', { className: 'leg-icon' }, showProgress ? progressIcon(leg) : '⏳')
  );
}

function renderClashDetail(clash, ctx) {
  const { myLegs, oppLegs, myName, oppName, myScore, oppScore, myMax, oppMax, result } = ctx;
  const isResolved = ['won', 'lost', 'tied'].includes(result);
  const showProgress = clash.status === 'live' || isResolved;

  const scoreRow = clash.status === 'awaiting_opponent' ? null : el('div', { className: 'clash-score-row' },
    el('div', { style: `color:${myScore >= oppScore ? '#2e7d32' : '#333'};` }, `${myScore} pts`),
    el('div', { style: 'font-weight:700; font-size:13px;' }, isResolved ? 'FINAL' : clash.status.toUpperCase()),
    el('div', { style: `color:${oppScore > myScore ? '#2e7d32' : '#333'};` }, `${oppScore} pts`)
  );

  const rows = myLegs.map((myLeg, i) => {
    const oppLeg = oppLegs[i];
    return el('div', { className: 'clash-detail-row' },
      renderLegProgressBox(myLeg, 'leg-side-you', showProgress),
      oppLeg ? renderLegProgressBox(oppLeg, 'leg-side-opp', showProgress) : null
    );
  });

  return el('div', { className: 'clash-detail clash-detail-slide' },
    scoreRow,
    el('div', { className: 'clash-detail-header' },
      el('div', { style: 'color:#1a4fa0;' }, 'YOU', el('div', { className: 'max-points' }, `max ${myMax} pts`)),
      el('div', { style: 'color:#a33; text-align:right;' }, oppName, el('div', { className: 'max-points' }, `max ${oppMax} pts`))
    ),
    el('div', { className: 'clash-legs-wrap' }, el('div', { className: 'clash-detail-divider' }), ...rows),
    isResolved ? el('div', {
      className: 'dismiss-btn',
      onclick: () => { state.dismissedClashIds.add(clash.id); setState({ expandedClashId: null }); },
    }, 'DISMISS') : null
  );
}

function renderClashBanner(clash) {
  const isB = clash.user_b_id === state.profile.id;
  const legs = clash.clash_legs || [];
  const myLegs = legs.filter(l => l.owner_id === state.profile.id);
  const oppLegs = legs.filter(l => l.owner_id !== state.profile.id);
  const myName = (isB ? clash.user_b_username : clash.user_a_username) || 'You';
  const oppName = (isB ? clash.user_a_username : clash.user_b_username) || 'Opponent';
  const myColor = (isB ? clash.user_b_avatar_color : clash.user_a_avatar_color) || '#4a7bf0';
  const oppColor = (isB ? clash.user_a_avatar_color : clash.user_b_avatar_color) || '#d9455f';
  const myScore = isB ? clash.score_b : clash.score_a;
  const oppScore = isB ? clash.score_a : clash.score_b;
  const myMax = myLegs.reduce((s, l) => s + (l.points || 0), 0);
  const oppMax = oppLegs.reduce((s, l) => s + (l.points || 0), 0);
  const result = myResultLabel(clash, isB);
  const expanded = state.expandedClashId === clash.id;

  const statusLine = result === 'awaiting_opponent'
    ? el('div', { className: 'clash-banner-status' }, isB ? 'Awaiting your response' : `Waiting for ${oppName}`)
    : result === 'pending'
    ? el('div', { className: 'clash-banner-status' }, 'Upcoming')
    : result === 'live'
    ? el('div', { className: 'clash-banner-status' }, el('span', { className: 'live-dot' }), 'LIVE')
    : el('div', { className: 'clash-banner-status' }, result === 'won' ? 'YOU WON' : result === 'lost' ? 'YOU LOST' : 'TIED');

  const canRespond = clash.status === 'awaiting_opponent' && isB;

  const banner = el('div', {
    className: `clash-banner ${['won', 'lost', 'tied'].includes(result) ? result : ''} ${expanded ? 'expanded-banner' : ''}`,
    onclick: () => setState({ expandedClashId: expanded ? null : clash.id }),
  },
    el('div', { className: 'clash-banner-top' },
      el('div', { className: 'row' },
        el('div', { className: 'mini-avatar', style: `background:${myColor};` }),
        el('span', {}, `${myName}`, el('div', { className: 'max-points' }, `max ${myMax} pts`))
      ),
      el('span', {}, 'VS'),
      el('div', { className: 'row' },
        el('span', { style: 'text-align:right;' }, oppName, el('div', { className: 'max-points' }, `max ${oppMax} pts`)),
        el('div', { className: 'mini-avatar', style: `background:${oppColor};` })
      )
    ),
    el('div', { className: 'clash-banner-mid' }, clash.event_label),
    statusLine,
    canRespond ? el('button', {
      style: 'width:100%; margin-top:10px;',
      onclick: (e) => {
        e.stopPropagation();
        openTicketBuilder({ mode: 'accept', sport: clash.sport, eventId: clash.event_external_id, eventLabel: clash.event_label, clashId: clash.id });
      },
    }, 'Respond to Challenge') : null
  );

  const detail = expanded
    ? renderClashDetail(clash, { myLegs, oppLegs, myName, oppName, myScore, oppScore, myMax, oppMax, result })
    : null;

  return el('div', {}, banner, detail);
}

// --- Boot ---

supabase.auth.getSession().then(({ data: { session } }) => {
  state.session = session;
  if (session) loadProfile();
  else setState({ screen: 'auth' });
});

// Lightweight stand-in for real push notifications: while the app is open,
// periodically check whether any Clash you challenged someone to has just
// been accepted, and pop the head-to-head reveal the moment it has. Doesn't
// notify you if the app isn't open - that would need a service worker and a
// push backend, a much bigger lift than this project needs right now.
setInterval(async () => {
  if (state.screen !== 'home' || !state.session || state.builder || state.clashReveal) return;
  try {
    const freshClashes = await apiFetch('/clashes');
    const previousStatusById = new Map(state.clashes.map(c => [c.id, c.status]));
    const justAccepted = freshClashes.find(c =>
      c.user_a_id === state.profile.id &&
      previousStatusById.get(c.id) === 'awaiting_opponent' &&
      c.status !== 'awaiting_opponent'
    );
    if (justAccepted) {
      setState({ clashes: freshClashes, clashReveal: justAccepted });
      return;
    }
    state.clashes = freshClashes;
    if (state.tab === 'clashes') render();
  } catch {
    // background poll - fail silently, next tick will retry
  }
}, 25000);
