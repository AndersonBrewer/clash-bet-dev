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
  friends: [],
  pendingRequests: [],
  searchQuery: '',
  searchResults: [],
  clashes: [],
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
    } else {
      await apiFetch(`/clashes/${b.clashId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ legs: b.ticket }),
      });
    }
    const clashes = await apiFetch('/clashes');
    setState({ builder: null, tab: 'clashes', clashes });
  });

  return el('div', { style: 'display:flex; flex-direction:column; flex:1; min-height:0;' },
    el('div', { className: 'topnav-row' },
      el('span', { className: 'back-arrow', onclick: () => setState({ builder: null }) }, '←')
    ),
    el('div', { className: 'match-header' },
      el('div', { className: 'logos' },
        el('div', { className: 'logo' }, teams.away.toUpperCase()),
        el('div', { className: 'vs' }, 'VS'),
        el('div', { className: 'logo' }, teams.home.toUpperCase())
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

function renderClashesTab() {
  if (state.clashes.length === 0) return el('p', { className: 'muted' }, 'No Clashes yet - challenge a friend from the Play tab.');
  return el('div', {}, ...state.clashes.map(renderClashCard));
}

function legRow(leg) {
  return el('div', { className: `leg-row tier-border-${leg.tier}` },
    el('span', {}, `${leg.player_name} - ${leg.stat_key.replace(/_/g, ' ')} ${leg.line}`),
    el('span', {
      className: leg.hit === true ? 'hit-yes' : leg.hit === false ? 'hit-no' : 'hit-pending',
    }, leg.hit === true ? `HIT (${leg.current_value})` : leg.hit === false ? `MISS (${leg.current_value})` : `${leg.current_value ?? 0}`)
  );
}

function legGroup(title, legs, score, isResolved) {
  const maxPoints = legs.reduce((sum, l) => sum + (l.points || 0), 0);
  return el('div', { style: 'margin-top: 12px;' },
    el('div', { className: 'row between' },
      el('strong', {}, title),
      el('span', { className: 'muted' }, isResolved ? `${score} / ${maxPoints} pts` : `max ${maxPoints} pts`)
    ),
    ...legs.map(legRow)
  );
}

function renderClashCard(clash) {
  const isB = clash.user_b_id === state.profile.id;
  const legs = clash.clash_legs || [];
  const myLegs = legs.filter(l => l.owner_id === state.profile.id);
  const oppLegs = legs.filter(l => l.owner_id !== state.profile.id);
  const myName = (isB ? clash.user_b_username : clash.user_a_username) || 'You';
  const oppName = (isB ? clash.user_a_username : clash.user_b_username) || 'Opponent';
  const myScore = isB ? clash.score_b : clash.score_a;
  const oppScore = isB ? clash.score_a : clash.score_b;
  const isResolved = !['awaiting_opponent', 'pending', 'live'].includes(clash.status);
  const canRespond = clash.status === 'awaiting_opponent' && isB;

  const respondButton = canRespond ? el('button', {
    onclick: () => openTicketBuilder({
      mode: 'accept',
      sport: clash.sport,
      eventId: clash.event_external_id,
      eventLabel: clash.event_label,
      clashId: clash.id,
    }),
  }, 'Respond to Challenge') : null;

  return el('div', { className: 'card' },
    el('div', { className: 'row between' },
      el('div', {}, clash.event_label),
      el('span', { className: `badge ${clash.status}` }, clash.status.replace(/_/g, ' '))
    ),
    respondButton,
    myLegs.length > 0 ? legGroup(`${myName} (you)`, myLegs, myScore, isResolved) : null,
    oppLegs.length > 0 ? legGroup(oppName, oppLegs, oppScore, isResolved) : null
  );
}

// --- Boot ---

supabase.auth.getSession().then(({ data: { session } }) => {
  state.session = session;
  if (session) loadProfile();
  else setState({ screen: 'auth' });
});
