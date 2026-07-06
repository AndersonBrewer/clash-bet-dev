import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// The anon key is meant to be public - safe to ship in frontend code.
// RLS on the Supabase tables (and this backend's own auth checks) is what
// actually enforces access control, not keeping this secret.
const SUPABASE_URL = 'https://hgkjkzeiaqbydgtljpbc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhna2premVpYXFieWRndGxqcGJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyOTQ3MTksImV4cCI6MjA5ODg3MDcxOX0.TeD_rjQC5xyeo2o_WvwQ8D7jH4JUK9-mZoKlIlETJPU';
const API_BASE = '/api';
const REQUIRED_LEG_COUNT = 4;
const SPORTS = [
  { key: 'baseball', label: 'MLB' },
  { key: 'world_cup', label: 'World Cup' },
];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  session: null,
  profile: null,
  screen: 'loading', // loading | auth | onboarding | home
  authMode: 'login', // login | signup
  tab: 'play', // play | friends | clashes
  sport: 'baseball',
  games: [],
  builder: null, // { mode: 'create'|'accept', sport, eventId, eventLabel, clashId, opponentId, props, ticket: [] }
  friends: [],
  pendingRequests: [],
  searchQuery: '',
  searchResults: [],
  clashes: [],
  error: null,
  busy: false,
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
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
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
  return el('div', {},
    el('div', { className: 'topbar' },
      el('div', {}, el('strong', {}, state.profile.username), el('span', { className: 'muted' }, ` · ELO ${state.profile.elo}`)),
      el('button', { className: 'secondary', onclick: () => supabase.auth.signOut() }, 'Log out')
    ),
    errorBanner(),
    el('div', { className: 'tabs' },
      tabButton('play', 'Play'),
      tabButton('friends', 'Friends'),
      tabButton('clashes', 'Clashes')
    ),
    state.builder ? renderTicketBuilder() :
    state.tab === 'play' ? renderPlayTab() :
    state.tab === 'friends' ? renderFriendsTab() :
    renderClashesTab()
  );
}

function tabButton(key, label) {
  return el('button', {
    className: state.tab === key ? 'active' : '',
    onclick: () => setState({ tab: key, builder: null }),
  }, label);
}

// --- Play tab ---

function renderPlayTab() {
  const sportButtons = SPORTS.map(s => el('button', {
    className: state.sport === s.key ? '' : 'secondary',
    onclick: () => runAction(async () => {
      const games = await apiFetch(`/games/${s.key}`);
      setState({ sport: s.key, games });
    }),
  }, s.label));

  return el('div', {},
    el('div', { className: 'row', style: 'margin-bottom: 12px' }, ...sportButtons,
      el('button', { disabled: true, title: 'Coming soon' }, 'Play Online (Coming Soon)')),
    ...state.games.map(renderGameCard)
  );
}

function renderGameCard(game) {
  const label = `${game.away} @ ${game.home}`;
  const when = game.status === 'in'
    ? `Live - ${game.statusDetail}`
    : new Date(game.startTime).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return el('div', { className: 'card' },
    el('div', { className: 'row between' },
      el('div', {},
        el('div', {}, label),
        el('div', { className: 'muted' }, when)
      ),
      el('button', {
        onclick: () => openTicketBuilder({ mode: 'create', sport: state.sport, eventId: game.eventId, eventLabel: label }),
      }, 'Build Ticket')
    )
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
      mode, sport, eventId, eventLabel, clashId, opponentId, props, ticket: [],
      selectedOpponentId: opponentId || '',
      selectedTeam: 'home',
      selectedPlayer: null,
    };
  });
}

function addLeg(playerName, statKey, option) {
  const ticket = state.builder.ticket;
  if (ticket.length >= REQUIRED_LEG_COUNT || ticket.some(l => l.playerName === playerName)) return;
  ticket.push({ playerName, statKey, tier: option.tier, line: option.line });
  state.builder.selectedPlayer = null;
  render();
}

function removeLeg(playerName, statKey) {
  const ticket = state.builder.ticket;
  const idx = ticket.findIndex(l => l.playerName === playerName && l.statKey === statKey);
  if (idx >= 0) ticket.splice(idx, 1);
  render();
}

function renderTicketBuilder() {
  const b = state.builder;
  const { teams, players } = b.props;
  const playerEntries = Object.entries(players);
  const hasOtherTeam = playerEntries.some(([, info]) => !info.team);
  const usedPlayers = new Set(b.ticket.map(l => l.playerName));
  const ticketFull = b.ticket.length >= REQUIRED_LEG_COUNT;

  const ticketSlots = el('div', { className: 'card' },
    el('h3', {}, `Your ticket (${b.ticket.length}/${REQUIRED_LEG_COUNT})`),
    ...b.ticket.map(l => el('div', { className: 'ticket-slot' },
      el('span', {}, `${l.playerName} - ${l.statKey.replace(/_/g, ' ')} ${l.line}`),
      el('div', { className: 'row' },
        el('span', { className: `tier-chip tier-${l.tier}` }, l.tier),
        el('button', { className: 'secondary', onclick: () => removeLeg(l.playerName, l.statKey) }, '×')
      )
    ))
  );

  const teamTabs = [
    { key: 'home', label: teams.home },
    { key: 'away', label: teams.away },
    ...(hasOtherTeam ? [{ key: 'other', label: 'Other' }] : []),
  ];
  const teamToggle = el('div', { className: 'row', style: 'margin-bottom: 12px' },
    ...teamTabs.map(t => el('button', {
      className: b.selectedTeam === t.key ? '' : 'secondary',
      onclick: () => { b.selectedTeam = t.key; b.selectedPlayer = null; render(); },
    }, t.label))
  );

  const teamPlayers = playerEntries
    .filter(([, info]) => (info.team || 'other') === b.selectedTeam)
    .map(([name]) => name);

  const playerList = el('div', { className: 'card' },
    el('h3', {}, 'Pick a player'),
    teamPlayers.length === 0 ? el('p', { className: 'muted' }, 'No props available for this team yet.') : null,
    ...teamPlayers.map(name => el('div', {
      className: 'row between',
      style: `cursor: pointer; padding: 8px 0; border-bottom: 1px solid #2a2d3a;${b.selectedPlayer === name ? ' color: #4a7bf0;' : ''}`,
      onclick: () => { b.selectedPlayer = usedPlayers.has(name) ? b.selectedPlayer : name; render(); },
    },
      el('span', {}, name),
      usedPlayers.has(name) ? el('span', { className: 'muted' }, 'in ticket') : null
    ))
  );

  const statSection = (b.selectedPlayer && !usedPlayers.has(b.selectedPlayer)) ? el('div', { className: 'card' },
    el('h3', {}, `${b.selectedPlayer} - pick a stat`),
    ...Object.entries(players[b.selectedPlayer].stats).map(([statKey, options]) =>
      el('div', { style: 'margin-bottom: 8px' },
        el('div', { className: 'muted' }, statKey.replace(/_/g, ' ')),
        el('div', {}, ...options.map(opt => el('div', {
          className: `tier-chip tier-${opt.tier}`,
          onclick: () => addLeg(b.selectedPlayer, statKey, opt),
        },
          el('div', { className: 'line' }, `${opt.line}`),
          el('div', { className: 'odds' }, opt.americanOdds > 0 ? `+${opt.americanOdds}` : `${opt.americanOdds}`)
        )))
      )
    )
  ) : null;

  const canSubmit = b.ticket.length === REQUIRED_LEG_COUNT && (b.mode === 'accept' || b.selectedOpponentId);

  const opponentPicker = b.mode === 'create' ? el('div', { className: 'card' },
    el('h3', {}, 'Challenge a friend'),
    state.friends.length === 0
      ? el('p', { className: 'muted' }, 'Add a friend first from the Friends tab.')
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

  return el('div', {},
    el('div', { className: 'row between' },
      el('h2', {}, b.eventLabel),
      el('button', { className: 'secondary', onclick: () => setState({ builder: null }) }, 'Cancel')
    ),
    errorBanner(),
    ticketSlots,
    opponentPicker,
    el('button', { disabled: !canSubmit || state.busy, onclick: submit },
      b.mode === 'create' ? 'Send Challenge' : 'Accept Challenge'),
    ticketFull ? el('p', { className: 'muted' }, 'Ticket complete - remove a leg above to change a pick.') : el('div', {},
      teamToggle,
      playerList,
      statSection
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

function renderClashesTab() {
  if (state.clashes.length === 0) return el('p', { className: 'muted' }, 'No Clashes yet - challenge a friend from the Play tab.');
  return el('div', {}, ...state.clashes.map(renderClashCard));
}

function renderClashCard(clash) {
  const isB = clash.user_b_id === state.profile.id;
  const legs = clash.clash_legs || [];
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
    clash.status !== 'awaiting_opponent' && el('div', { className: 'muted' }, `Score: ${clash.score_a} - ${clash.score_b}`),
    respondButton,
    ...legs.map(leg => el('div', { className: 'leg-row' },
      el('span', {}, `${leg.player_name} - ${leg.stat_key.replace(/_/g, ' ')} ${leg.line} (${leg.owner_id === clash.user_a_id ? 'A' : 'B'})`),
      el('span', {
        className: leg.hit === true ? 'hit-yes' : leg.hit === false ? 'hit-no' : 'hit-pending',
      }, leg.hit === true ? `HIT (${leg.current_value})` : leg.hit === false ? `MISS (${leg.current_value})` : `${leg.current_value ?? 0}`)
    ))
  );
}

// --- Boot ---

supabase.auth.getSession().then(({ data: { session } }) => {
  state.session = session;
  if (session) loadProfile();
  else setState({ screen: 'auth' });
});
