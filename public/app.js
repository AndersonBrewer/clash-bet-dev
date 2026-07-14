import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// The anon key is meant to be public - safe to ship in frontend code.
// RLS on the Supabase tables (and this backend's own auth checks) is what
// actually enforces access control, not keeping this secret.
const SUPABASE_URL = 'https://hgkjkzeiaqbydgtljpbc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhna2premVpYXFieWRndGxqcGJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyOTQ3MTksImV4cCI6MjA5ODg3MDcxOX0.TeD_rjQC5xyeo2o_WvwQ8D7jH4JUK9-mZoKlIlETJPU';
const API_BASE = '/api';
const REQUIRED_LEG_COUNT = 4;
const TIER_ORDER = ['grey', 'green', 'blue', 'purple', 'gold']; // must match src/lib/tiers.js
// must match src/lib/ranks.js
const RANK_TIERS = [
  { key: 'grey', label: 'Grey League', min: 0 },
  { key: 'green', label: 'Green League', min: 100 },
  { key: 'blue', label: 'Blue League', min: 250 },
  { key: 'purple', label: 'Purple League', min: 500 },
  { key: 'gold', label: 'Gold League', min: 1000 },
];
function rankForTrophies(trophies) {
  let current = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (trophies >= tier.min) current = tier;
  }
  return current;
}
const SPORTS = [
  { key: 'basketball', label: 'Basketball', icon: 'basketball', supported: false },
  { key: 'football', label: 'Football', icon: 'football', supported: false },
  { key: 'baseball', label: 'MLB', icon: 'baseball', supported: true },
  { key: 'world_cup', label: 'World Cup', icon: 'soccer', supported: true },
];

// Inline SVG source, copied verbatim from sleek-redesign.html (design-spec-v2.md)
// so every icon in the app is a real vector element (stroke/fill: currentColor)
// rather than an emoji glyph - lets icon color follow the surrounding CSS
// (active/inactive states, neon-glow treatment) instead of being stuck
// whatever color the OS renders that emoji as.
const ICON_SVG = {
  basketball: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.8 5.8c2.8 2.8 2.8 9.6 0 12.4M18.2 5.8c-2.8 2.8-2.8 9.6 0 12.4"/></svg>',
  football: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 12c0-4.2 3.8-8 8-8s8 3.8 8 8-3.8 8-8 8-8-3.8-8-8Z"/><path d="M7 12h10M10 9.8v1M10 13.2v1M14 9.8v1M14 13.2v1"/></svg>',
  baseball: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M6.3 6.3c2.3 2.3 2.3 9.1 0 11.4M17.7 6.3c-2.3 2.3-2.3 9.1 0 11.4"/></svg>',
  soccer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.3l2.6 1.9-1 3-3.2 0-1-3L12 7.3Z"/><path d="M12 3.2v4.1M5 8l3.7 1.2M19 8l-3.7 1.2M6.7 18.6l2.1-3.2M17.3 18.6l-2.1-3.2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z"/><path d="M10 18a2 2 0 0 0 4 0"/></svg>',
  // The old version of this icon was just a circle with 8 radiating lines -
  // reads as a sun, not a gear. This is a real cog shape (rounded teeth
  // around a ring, hole in the center).
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l12 7-12 7V5Z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3Z"/><path d="M12 8.7l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3 1-2Z"/></svg>',
  podium: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="5" height="9" rx="1"/><rect x="9.5" y="7" width="5" height="14" rx="1"/><rect x="16" y="15" width="5" height="6" rx="1"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4"/><path d="M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg>',
};

// innerHTML on a plain <div> correctly parses embedded <svg>...</svg> markup
// into real, properly-namespaced SVG DOM nodes - simpler than building each
// element by hand with createElementNS, and the source is trusted (hardcoded
// above, not user input).
function icon(name) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = ICON_SVG[name];
  return wrapper.firstElementChild;
}

// Small trophy-icon + count, colored by rank - reused on the leaderboard,
// friends list, and profile header wherever a trophy count used to just be
// bare "X ELO" text.
// Soft glow + defining ring in the player's rank color, for avatars on the
// header and Profile tab - same "colored glow around a circle" language the
// active sport-tab/nav-icon states already use elsewhere, just tied to rank
// instead of "currently selected."
function avatarGlowStyle(trophies) {
  const color = `var(--${rankForTrophies(trophies).key})`;
  return `box-shadow: 0 0 14px ${color}, 0 0 0 2px ${color};`;
}

function trophyBadge(trophies, className = '', onclick = null) {
  return el('div', {
    className: `trophy-badge ${className}`,
    style: `color:var(--${rankForTrophies(trophies).key});`,
    onclick: onclick ? (e) => { e.stopPropagation(); onclick(); } : null,
  }, icon('trophy'), `${trophies}`);
}

// --- Badge shield rendering (ported from prototype.html's renderShield) ---
// Kept as close to the original as possible per badges-spec.md - the visual
// quality comes from 3 details that are easy to lose if simplified: a
// vertical gradient (not flat fill), a drop-shadow filter lifting it off
// the background, and a thin translucent inner-bevel outline.

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) + Math.round(255 * percent / 100);
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * percent / 100);
  let b = (num & 0x0000ff) + Math.round(255 * percent / 100);
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

const BADGE_PATTERN_SVG = {
  solid: '',
  cross: '<rect x="42" y="15" width="16" height="70" fill="SECONDARY"/><rect x="15" y="42" width="70" height="16" fill="SECONDARY"/>',
  square: '<rect x="32" y="32" width="36" height="36" fill="SECONDARY"/>',
  stripes: '<rect x="10" y="25" width="80" height="12" fill="SECONDARY"/><rect x="10" y="50" width="80" height="12" fill="SECONDARY"/><rect x="10" y="75" width="80" height="12" fill="SECONDARY"/>',
  diamond: '<polygon points="50,20 75,50 50,80 25,50" fill="SECONDARY"/>',
  chevron: '<path d="M15,38 L50,66 L85,38 L85,54 L50,82 L15,54 Z" fill="SECONDARY"/>',
  star: '<polygon points="50,26 59,47 82,47 63,61 70,84 50,70 30,84 37,61 18,47 41,47" fill="SECONDARY"/>',
  ring: '<circle cx="50" cy="52" r="23" fill="none" stroke="SECONDARY" stroke-width="11"/>',
  split: '<rect x="50" y="0" width="50" height="110" fill="SECONDARY"/>',
  bolt: '<path d="M58,18 L34,58 H48 L41,92 L72,50 H56 L58,18 Z" fill="SECONDARY"/>',
};

// Every def (clipPath/gradient/filter) needs a unique id per rendered
// instance - multiple shields render on screen at once (join list,
// leaderboard rows, header), and reused ids would make browsers apply the
// wrong gradient/clip to the wrong shield.
let shieldUidCounter = 0;

function shieldSvg(primary, secondary, pattern, size) {
  const s = size || 44;
  const uid = 'shield' + (shieldUidCounter++);
  const primaryLight = shadeColor(primary, 22);
  const primaryDark = shadeColor(primary, -22);
  const patternSvg = (BADGE_PATTERN_SVG[pattern] || '').split('SECONDARY').join(secondary);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<svg viewBox="0 0 100 112" style="width:${s}px; height:${s * 1.12}px; overflow:visible;">
    <defs>
      <clipPath id="${uid}-clip"><polygon points="8,8 92,8 92,58 50,104 8,58"/></clipPath>
      <linearGradient id="${uid}-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${primaryLight}"/>
        <stop offset="100%" stop-color="${primaryDark}"/>
      </linearGradient>
      <filter id="${uid}-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-opacity="0.4"/>
      </filter>
    </defs>
    <g filter="url(#${uid}-shadow)">
      <polygon points="8,8 92,8 92,58 50,104 8,58" fill="url(#${uid}-grad)" stroke="#222" stroke-width="3.5"/>
      <g clip-path="url(#${uid}-clip)">${patternSvg}</g>
      <polygon points="12,11 88,11 88,56 50,98 12,56" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
    </g>
  </svg>`;
  return wrapper.firstElementChild;
}

const BADGE_COLORS = [
  '#9e9e9e', '#6fcf6f', '#4a90e2', '#a63fc9', '#f0c419', '#e5534b', '#f2f2f2', '#1a1a1a',
];
const BADGE_PATTERNS = ['solid', 'cross', 'square', 'stripes', 'diamond', 'chevron', 'star', 'ring', 'split', 'bolt'];

// Brand mark from design-spec-v2.md: a hex badge ringed in the tier
// gradient, with a lightning bolt in the neon gradient at its center.
// Gradient <defs> ids get a counter suffix so multiple logo instances never
// collide if more than one is ever on screen at once (SVG id refs resolve
// document-wide, not scoped to their own <svg>).
let logoIdCounter = 0;
function logoMark(className) {
  const id = ++logoIdCounter;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<svg viewBox="0 0 120 120">
    <defs>
      <linearGradient id="tierGrad${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#94a3b8"/>
        <stop offset="25%" stop-color="#34d399"/>
        <stop offset="50%" stop-color="#3b82f6"/>
        <stop offset="75%" stop-color="#a855f7"/>
        <stop offset="100%" stop-color="#fbbf24"/>
      </linearGradient>
      <linearGradient id="neonGrad${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#22e5ff"/>
        <stop offset="100%" stop-color="#ff2d95"/>
      </linearGradient>
    </defs>
    <polygon points="60,6 108,33 108,87 60,114 12,87 12,33" fill="#12151c" stroke="url(#tierGrad${id})" stroke-width="6"/>
    <path d="M67 22 L38 64 H54 L48 98 L83 53 H65 L67 22 Z" fill="url(#neonGrad${id})"/>
  </svg>`;
  const svg = wrapper.firstElementChild;
  if (className) svg.setAttribute('class', className);
  return svg;
}

function wordmark(className) {
  return el('div', { className: `wordmark ${className || ''}` },
    el('span', {}, 'CLASH'), el('span', { className: 'bet' }, 'BET'));
}

function logoLockup(className) {
  return el('div', { className: `lockup-row ${className || ''}` }, logoMark('logo-mark-sm'), wordmark());
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  session: null,
  profile: null,
  screen: 'loading', // loading | auth | onboarding | home
  authMode: 'login', // login | signup
  tab: 'play', // play | clashes | leaderboard | profile
  sport: 'baseball',
  comingSoonSport: null,
  games: [],
  builder: null, // { mode: 'create'|'accept', sport, eventId, eventLabel, clashId, opponentId, props, ticket: [] }
  clashReveal: null, // full clash object (with clash_legs) - shown right after both tickets are known
  leaderboard: [],
  friends: [],
  pendingRequests: [],
  searchQuery: '',
  searchResults: [],
  viewingFriendId: null, // set while viewing a friend's read-only Profile
  profileStats: null, // { username, trophies, rank, avatarColor, stats } for whoever's Profile is showing
  clashes: [],
  clashesTab: 'active', // active | finished
  clashesSportFilter: 'all', // all | baseball | world_cup
  expandedClashId: null,
  dismissedClashIds: new Set(), // session-only - not persisted, matches the prototype's own fidelity here
  error: null,
  busy: false,
  showSettings: false,
  notifications: [],
  showNotifications: false,
  showEditProfile: false,
  editProfileForm: null, // { avatarColor } while the Edit Profile overlay is open
  showNotificationSettings: false,
  showRankTiers: false,
  badge: null, // the logged-in user's Badge (with membersList), or null
  badgeFlow: null, // null | 'create' | 'join' - which sub-screen inside the Badges tab
  badgesList: [], // fetched when entering the 'join' flow
  createBadgeForm: { isPrivate: false, primary: '#4a90e2', secondary: '#f2f2f2', pattern: 'cross' },
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
    const [games, friends, pendingRequests, clashes, leaderboard, notifications, badge] = await Promise.all([
      apiFetch(`/games/${state.sport}`),
      apiFetch('/users/friends'),
      apiFetch('/users/friends/pending'),
      apiFetch('/clashes'),
      apiFetch('/users/leaderboard'),
      apiFetch('/users/notifications'),
      apiFetch('/badges/mine'),
    ]);
    Object.assign(state, { games, friends, pendingRequests, clashes, leaderboard, notifications, badge });
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
    renderLoadingScreen()
  );
}

function renderLoadingScreen() {
  return el('div', { className: 'loading-screen' },
    el('div', { className: 'loading-glow' }),
    logoMark('loading-mark'),
    el('div', { className: 'loading-wordmark' }, el('span', {}, 'CLASH'), el('span', { className: 'bet' }, 'BET')),
    el('div', { className: 'loading-bar-track' }, el('div', { className: 'loading-bar-fill' })),
    el('div', { className: 'loading-status' }, "Loading tonight's games...")
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
    logoLockup('auth-lockup'),
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
        el('div', { className: 'avatar-circle', style: `background:${state.profile.avatar_color || '#4c7bf0'}; ${avatarGlowStyle(state.profile.trophies)}` }),
        el('div', {},
          el('div', { className: 'username' }, state.profile.username),
          trophyBadge(state.profile.trophies, 'elo', () => setState({ showRankTiers: true }))
        )
      ),
      el('div', { className: 'row', style: 'gap: 14px;' },
        logoMark('header-logo'),
        state.badge ? el('div', { className: 'icon-btn', onclick: () => openBadgesOverlay() }, shieldSvg(state.badge.primary_color, state.badge.secondary_color, state.badge.pattern, 24)) : null,
        el('div', { className: 'icon-btn', onclick: () => setState({ showNotifications: true }) },
          icon('bell'), state.notifications.length > 0 ? el('div', { className: 'unread-dot' }) : null),
        el('div', { className: 'icon-btn', onclick: () => setState({ showSettings: true }) }, icon('gear'))
      )
    ),
    errorBanner(),
    state.clashReveal ? renderClashReveal(state.clashReveal) :
    state.builder ? renderTicketBuilder() :
    state.tab === 'play' ? renderPlayTab() :
    state.tab === 'clashes' ? el('div', { className: 'content' }, renderClashesTab()) :
    state.tab === 'leaderboard' ? el('div', { className: 'content' }, renderLeaderboardTab()) :
    state.tab === 'badges' ? el('div', { className: 'content' }, renderBadgesTab()) :
    el('div', { className: 'content' }, renderProfileTab()),
    el('div', { className: 'bottomnav' },
      navIcon('play', 'play'),
      navIcon('clashes', 'bolt'),
      navIcon('leaderboard', 'podium'),
      navIcon('badges', 'shield'),
      navIcon('profile', 'person')
    ),
    state.showSettings ? renderSettingsOverlay() : null,
    state.showNotifications ? renderNotificationsOverlay() : null,
    state.showEditProfile ? renderEditProfileOverlay() : null,
    state.showNotificationSettings ? renderNotificationSettingsOverlay() : null,
    state.showRankTiers ? renderRankTiersOverlay() : null
  );
}

function navIcon(key, iconName) {
  return el('button', {
    className: `navicon ${state.tab === key ? 'current' : ''}`,
    onclick: () => key === 'profile' ? openOwnProfile() : setState({ tab: key, builder: null }),
  }, icon(iconName));
}

function openOwnProfile() {
  setState({ tab: 'profile', builder: null, viewingFriendId: null, profileStats: null });
  runAction(async () => {
    const profileStats = await apiFetch(`/users/${state.profile.id}/stats`);
    setState({ profileStats });
  });
}

function openFriendProfileById(friendId) {
  setState({ viewingFriendId: friendId, profileStats: null });
  runAction(async () => {
    const profileStats = await apiFetch(`/users/${friendId}/stats`);
    setState({ profileStats });
  });
}

function renderSettingsOverlay() {
  return el('div', {
    className: 'overlay',
    onclick: (e) => { if (e.target === e.currentTarget) setState({ showSettings: false }); },
  },
    el('div', { className: 'overlay-panel' },
      el('div', { className: 'overlay-close', onclick: () => setState({ showSettings: false }) }, '✕'),
      el('div', { className: 'overlay-title' }, 'SETTINGS'),
      el('div', {
        className: 'overlay-card',
        onclick: () => setState({
          showSettings: false, showEditProfile: true,
          editProfileForm: { avatarColor: state.profile.avatar_color || '#4a7bf0' },
        }),
      },
        el('h4', {}, 'Edit Profile'),
        el('div', { className: 'muted' }, 'Change your username or avatar color')
      ),
      el('div', {
        className: 'overlay-card',
        onclick: () => setState({ showSettings: false, showNotificationSettings: true }),
      },
        el('h4', {}, 'Notifications'),
        el('div', { className: 'muted' }, 'Choose what you get notified about')
      ),
      el('div', { className: 'overlay-card danger', onclick: () => supabase.auth.signOut() },
        el('h4', {}, 'Log Out')
      )
    )
  );
}

// --- Edit Profile overlay ---

const AVATAR_COLOR_CHOICES = ['#4a7bf0', '#d9455f', '#34d399', '#a855f7', '#fbbf24', '#22e5ff', '#f97316', '#94a3b8'];

function renderEditProfileOverlay() {
  const form = state.editProfileForm;
  let usernameInput, avatarPreview;
  const swatchEls = [];

  const back = () => setState({ showEditProfile: false, showSettings: true });

  // Swatch selection mutates the DOM directly instead of calling render() -
  // this whole app's render() tears down and rebuilds the entire tree, which
  // would destroy the username <input> (and whatever's mid-typed in it,
  // plus focus/cursor) every time a swatch was clicked.
  const selectColor = (color) => {
    form.avatarColor = color;
    avatarPreview.style.background = color;
    swatchEls.forEach(s => { s.style.borderColor = s.dataset.color === color ? '#fff' : 'transparent'; });
  };

  const save = () => runAction(async () => {
    const username = usernameInput.value.trim();
    if (!username) throw new Error('Username cannot be empty');
    const updated = await apiFetch('/users/profile', {
      method: 'PATCH',
      body: JSON.stringify({ username, avatarColor: form.avatarColor }),
    });
    setState({ profile: { ...state.profile, ...updated }, showEditProfile: false, showSettings: true });
  });

  avatarPreview = el('div', { className: 'avatar-circle', style: `background:${form.avatarColor}; width:64px; height:64px; margin:0 auto;` });

  AVATAR_COLOR_CHOICES.forEach(c => {
    const swatch = el('div', {
      style: `width:32px; height:32px; border-radius:50%; background:${c}; cursor:pointer; border:3px solid ${form.avatarColor === c ? '#fff' : 'transparent'};`,
      onclick: () => selectColor(c),
    });
    swatch.dataset.color = c;
    swatchEls.push(swatch);
  });

  return el('div', {
    className: 'overlay',
    onclick: (e) => { if (e.target === e.currentTarget) back(); },
  },
    el('div', { className: 'overlay-panel' },
      el('div', { className: 'overlay-close', onclick: back }, '✕'),
      el('div', { className: 'overlay-title' }, 'EDIT PROFILE'),
      errorBanner(),
      el('div', { style: 'display:flex; justify-content:center; margin-bottom:18px;' }, avatarPreview),
      el('div', { className: 'muted', style: 'margin-bottom:6px;' }, 'Username'),
      usernameInput = el('input', { value: state.profile.username }),
      el('div', { className: 'muted', style: 'margin:14px 0 8px;' }, 'Avatar color'),
      el('div', { style: 'display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;' }, ...swatchEls),
      el('button', { onclick: save, disabled: state.busy, style: 'width:100%;' }, 'Save Changes')
    )
  );
}

// --- Notification settings overlay ---

function renderNotificationSettingsOverlay() {
  const prefs = state.profile.notification_prefs || { friend_request: true, clash_challenge: true, clash_ended: true };

  const back = () => setState({ showNotificationSettings: false, showSettings: true });

  const toggle = (key) => runAction(async () => {
    const nextPrefs = { ...prefs, [key]: !prefs[key] };
    const updated = await apiFetch('/users/profile', {
      method: 'PATCH',
      body: JSON.stringify({ notificationPrefs: nextPrefs }),
    });
    setState({ profile: { ...state.profile, ...updated } });
  });

  const row = (key, label, description) => el('div', { className: 'toggle-row' },
    el('div', {},
      el('div', { style: 'font-weight:700;' }, label),
      el('div', { className: 'muted' }, description)
    ),
    el('div', { className: `toggle-switch ${prefs[key] ? 'on' : ''}`, onclick: () => toggle(key) }, el('div', { className: 'knob' }))
  );

  return el('div', {
    className: 'overlay',
    onclick: (e) => { if (e.target === e.currentTarget) back(); },
  },
    el('div', { className: 'overlay-panel' },
      el('div', { className: 'overlay-close', onclick: back }, '✕'),
      el('div', { className: 'overlay-title' }, 'NOTIFICATIONS'),
      errorBanner(),
      row('friend_request', 'Friend Requests', 'When someone sends you a friend request'),
      row('clash_challenge', 'Clash Challenges', 'When someone challenges you to a Clash'),
      row('clash_ended', 'Clash Results', 'When one of your Clashes ends')
    )
  );
}

// --- Rank tiers overlay ---

function renderRankTiersOverlay() {
  const myRankKey = rankForTrophies(state.profile.trophies).key;

  const rows = RANK_TIERS.map((tier, i) => {
    const nextTier = RANK_TIERS[i + 1];
    const rangeText = nextTier ? `${tier.min} - ${nextTier.min - 1}` : `${tier.min}+`;
    const isCurrent = tier.key === myRankKey;
    return el('div', { className: `rank-tier-card tier-${tier.key} ${isCurrent ? 'current' : ''}` },
      el('div', {},
        el('div', { className: 'rank-tier-name' }, tier.label),
        el('div', { className: 'rank-tier-range' }, `${rangeText} trophies`)
      ),
      isCurrent ? el('div', { className: 'rank-tier-you' }, icon('trophy'), 'YOU') : null
    );
  }).reverse(); // Gold at top, Grey at bottom - reads like a ladder you're climbing

  return el('div', {
    className: 'overlay',
    onclick: (e) => { if (e.target === e.currentTarget) setState({ showRankTiers: false }); },
  },
    el('div', { className: 'overlay-panel' },
      el('div', { className: 'overlay-close', onclick: () => setState({ showRankTiers: false }) }, '✕'),
      el('div', { className: 'overlay-title' }, 'LEAGUES'),
      ...rows
    )
  );
}

// --- Badges tab ---

function openBadgesOverlay() {
  setState({ tab: 'badges', badgeFlow: null });
}

function renderBadgesTab() {
  let body;
  if (state.badgeFlow === 'create') body = renderCreateBadgeForm();
  else if (state.badgeFlow === 'join') body = renderJoinBadgeList();
  else if (state.badge) body = renderInBadgeView();
  else body = renderNoBadgeView();

  return el('div', {},
    el('div', { style: 'font-family:Archivo,sans-serif; font-weight:900; font-size:20px; margin-bottom:16px; text-align:center; color:var(--text);' }, 'BADGE'),
    errorBanner(),
    body
  );
}

function renderNoBadgeView() {
  return el('div', { style: 'text-align:center; padding:10px 0 20px;' },
    el('div', { className: 'muted', style: 'margin-bottom:20px;' }, "You're not in a Badge yet."),
    el('button', { style: 'width:100%; margin-bottom:10px;', onclick: () => setState({ badgeFlow: 'create' }) }, 'Create a Badge'),
    el('button', { className: 'secondary', style: 'width:100%;', onclick: openJoinBadgeFlow }, 'Join a Badge')
  );
}

function openJoinBadgeFlow() {
  runAction(async () => {
    const badgesList = await apiFetch('/badges');
    setState({ badgesList, badgeFlow: 'join' });
  });
}

function renderJoinBadgeList() {
  const doJoin = (id) => runAction(async () => {
    const badge = await apiFetch(`/badges/${id}/join`, { method: 'POST' });
    setState({ badge, badgeFlow: null });
  });

  return el('div', {},
    el('div', { className: 'back-arrow', style: 'margin-bottom:12px;', onclick: () => setState({ badgeFlow: null }) }, '←'),
    state.badgesList.length === 0 ? el('p', { className: 'muted', style: 'text-align:center;' }, 'No Badges yet - be the first to create one.') : null,
    ...state.badgesList.map(b => el('div', { className: 'badge-list-row' },
      shieldSvg(b.primary_color, b.secondary_color, b.pattern, 48),
      el('div', { style: 'flex:1; margin-left:12px;' },
        el('div', { style: 'font-family:Archivo,sans-serif; font-weight:900; font-size:15px; color:var(--text);' }, b.name),
        el('div', { className: 'muted', style: 'font-size:12px; margin-top:2px;' }, `${b.memberCount} members · ${b.totalTrophies.toLocaleString()} total trophies`)
      ),
      b.is_private
        ? el('div', { className: 'muted', style: 'font-size:12px;' }, 'Request')
        : el('button', { style: 'padding:8px 14px;', onclick: () => doJoin(b.id) }, 'Join')
    ))
  );
}

function renderInBadgeView() {
  const b = state.badge;
  const ranked = [...b.membersList].sort((x, y) => y.trophies - x.trophies);

  const leave = () => {
    if (!confirm('Leave this Badge?')) return;
    runAction(async () => {
      await apiFetch('/badges/leave', { method: 'POST' });
      setState({ badge: null });
    });
  };

  return el('div', {},
    el('div', { style: 'display:flex; flex-direction:column; align-items:center; margin-top:6px;' },
      shieldSvg(b.primary_color, b.secondary_color, b.pattern, 100),
      el('div', { style: 'font-family:Archivo,sans-serif; font-weight:900; font-size:20px; margin-top:12px; color:var(--text);' }, b.name),
      el('div', { className: 'muted', style: 'font-size:13px; margin-top:4px;' }, `${b.memberCount} members · ${b.totalTrophies.toLocaleString()} total trophies`)
    ),
    el('div', { style: 'font-family:Archivo,sans-serif; font-weight:900; font-size:13px; color:var(--text-dim); letter-spacing:0.05em; text-transform:uppercase; margin:24px 0 10px;' }, 'Badge Leaderboard'),
    ...ranked.map((m, i) => el('div', { className: 'badge-list-row', style: 'justify-content:space-between;' },
      el('div', { style: 'display:flex; align-items:center; gap:12px;' },
        el('div', { style: 'font-weight:900; font-size:15px; color:var(--text-faint); width:20px;' }, `${i + 1}`),
        el('div', { className: 'player-avatar', style: `background:${m.avatar_color || '#4a7bf0'};` }),
        el('div', { style: 'font-weight:700; color:var(--text);' }, m.id === state.profile.id ? `${m.username} (You)` : m.username)
      ),
      trophyBadge(m.trophies)
    )),
    el('button', { className: 'danger', style: 'width:100%; margin-top:20px;', onclick: leave }, 'Leave Badge')
  );
}

function renderCreateBadgeForm() {
  const f = state.createBadgeForm;
  let nameInput, previewContainer, visibilityBtns = [];
  const primarySwatchEls = [];
  const secondarySwatchEls = [];
  const patternOptionEls = [];

  // Every swatch/pattern/visibility pick mutates the DOM directly instead of
  // calling render() - a full re-render tears down and rebuilds the whole
  // app tree, which would wipe the name <input> (and any unsaved typing/
  // focus) the same way it would have for Edit Profile's avatar swatches.
  const refreshVisuals = () => {
    previewContainer.innerHTML = '';
    previewContainer.appendChild(shieldSvg(f.primary, f.secondary, f.pattern, 90));
    primarySwatchEls.forEach(s => { s.style.borderColor = s.dataset.hex === f.primary ? '#fff' : 'transparent'; });
    secondarySwatchEls.forEach(s => { s.style.borderColor = s.dataset.hex === f.secondary ? '#fff' : 'transparent'; });
    patternOptionEls.forEach(opt => {
      opt.style.borderColor = opt.dataset.pattern === f.pattern ? 'var(--green)' : 'transparent';
      opt.style.background = opt.dataset.pattern === f.pattern ? 'rgba(52,211,153,0.1)' : 'transparent';
      opt.querySelector('svg')?.remove();
      opt.insertBefore(shieldSvg(f.primary, f.secondary, opt.dataset.pattern, 40), opt.firstChild);
    });
    visibilityBtns.forEach(btn => { btn.className = `ou-btn ${btn.dataset.value === String(f.isPrivate) ? 'ou-selected' : ''}`; });
  };

  const back = () => setState({ badgeFlow: null });

  const submit = () => runAction(async () => {
    const name = nameInput.value.trim();
    if (!name) throw new Error('Give your Badge a name first.');
    const badge = await apiFetch('/badges', {
      method: 'POST',
      body: JSON.stringify({ name, isPrivate: f.isPrivate, primaryColor: f.primary, secondaryColor: f.secondary, pattern: f.pattern }),
    });
    setState({
      badge, badgeFlow: null,
      createBadgeForm: { isPrivate: false, primary: '#4a90e2', secondary: '#f2f2f2', pattern: 'cross' },
    });
  });

  previewContainer = el('div', { style: 'display:flex; justify-content:center; margin:16px 0;' }, shieldSvg(f.primary, f.secondary, f.pattern, 90));

  const primarySwatches = BADGE_COLORS.map(hex => {
    const swatch = el('div', {
      style: `width:32px; height:32px; border-radius:50%; background:${hex}; cursor:pointer; border:3px solid ${f.primary === hex ? '#fff' : 'transparent'};`,
      onclick: () => { f.primary = hex; refreshVisuals(); },
    });
    swatch.dataset.hex = hex;
    primarySwatchEls.push(swatch);
    return swatch;
  });
  const secondarySwatches = BADGE_COLORS.map(hex => {
    const swatch = el('div', {
      style: `width:32px; height:32px; border-radius:50%; background:${hex}; cursor:pointer; border:3px solid ${f.secondary === hex ? '#fff' : 'transparent'};`,
      onclick: () => { f.secondary = hex; refreshVisuals(); },
    });
    swatch.dataset.hex = hex;
    secondarySwatchEls.push(swatch);
    return swatch;
  });
  const patternOptions = BADGE_PATTERNS.map(p => {
    const opt = el('div', {
      className: 'pattern-option',
      style: `border-color:${f.pattern === p ? 'var(--green)' : 'transparent'}; background:${f.pattern === p ? 'rgba(52,211,153,0.1)' : 'transparent'};`,
      onclick: () => { f.pattern = p; refreshVisuals(); },
    },
      shieldSvg(f.primary, f.secondary, p, 40),
      el('div', { className: 'pattern-label' }, p.toUpperCase())
    );
    opt.dataset.pattern = p;
    patternOptionEls.push(opt);
    return opt;
  });

  const publicBtn = el('div', { className: `ou-btn ${!f.isPrivate ? 'ou-selected' : ''}`, onclick: () => { f.isPrivate = false; refreshVisuals(); } }, 'PUBLIC');
  const privateBtn = el('div', { className: `ou-btn ${f.isPrivate ? 'ou-selected' : ''}`, onclick: () => { f.isPrivate = true; refreshVisuals(); } }, 'PRIVATE');
  publicBtn.dataset.value = 'false';
  privateBtn.dataset.value = 'true';
  visibilityBtns = [publicBtn, privateBtn];

  return el('div', {},
    el('div', { className: 'back-arrow', style: 'margin-bottom:4px;', onclick: back }, '←'),
    el('div', { style: 'font-family:Archivo,sans-serif; font-weight:900; font-size:20px; text-align:center; margin-bottom:4px; color:var(--text);' }, 'CREATE A BADGE'),
    previewContainer,
    nameInput = el('input', { placeholder: 'Badge Name', style: 'margin-bottom:16px;' }),
    el('div', { className: 'muted', style: 'margin-bottom:6px;' }, 'Visibility'),
    el('div', { className: 'ou-toggle', style: 'margin-bottom:18px;' }, publicBtn, privateBtn),
    el('div', { className: 'muted', style: 'margin-bottom:8px;' }, 'Primary Color'),
    el('div', { style: 'display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;' }, ...primarySwatches),
    el('div', { className: 'muted', style: 'margin-bottom:8px;' }, 'Secondary Color'),
    el('div', { style: 'display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;' }, ...secondarySwatches),
    el('div', { className: 'muted', style: 'margin-bottom:8px;' }, 'Emblem Pattern'),
    el('div', { style: 'display:flex; gap:10px; overflow-x:auto; margin-bottom:20px;' }, ...patternOptions),
    el('button', { style: 'width:100%;', onclick: submit, disabled: state.busy }, 'Create Badge')
  );
}

// --- Notifications overlay ---

async function dismissNotification(id) {
  await apiFetch(`/users/notifications/${id}`, { method: 'DELETE' });
  setState({ notifications: state.notifications.filter(n => n.id !== id) });
}

async function respondToFriendRequestNotification(notif, accept) {
  await runAction(async () => {
    await apiFetch(`/users/friends/${notif.related_id}/respond`, { method: 'POST', body: JSON.stringify({ accept }) });
    state.notifications = state.notifications.filter(n => n.id !== notif.id);
    await refreshHomeData();
  });
}

async function acceptChallengeNotification(notif) {
  await runAction(async () => {
    const clashes = await apiFetch('/clashes');
    const clash = clashes.find(c => c.id === notif.related_id);
    if (!clash) { state.error = 'This challenge is no longer available.'; return; }
    state.showNotifications = false;
    // Only removed from THIS session's list, not deleted server-side yet -
    // accepting is a multi-step flow (still have to build and submit a
    // ticket), so the backend only deletes the real row once that actually
    // completes. If the user abandons the ticket builder without
    // submitting, the notification will still be there next time they
    // check, rather than the challenge silently vanishing.
    state.notifications = state.notifications.filter(n => n.id !== notif.id);
    await openTicketBuilder({ mode: 'accept', sport: clash.sport, eventId: clash.event_external_id, eventLabel: clash.event_label, clashId: clash.id });
  });
}

async function declineChallengeNotification(notif) {
  await runAction(async () => {
    await apiFetch(`/clashes/${notif.related_id}/decline`, { method: 'POST' });
    state.notifications = state.notifications.filter(n => n.id !== notif.id);
    await refreshHomeData();
  });
}

function renderNotificationsOverlay() {
  return el('div', {
    className: 'overlay',
    onclick: (e) => { if (e.target === e.currentTarget) setState({ showNotifications: false }); },
  },
    el('div', { className: 'overlay-panel' },
      el('div', { className: 'overlay-close', onclick: () => setState({ showNotifications: false }) }, '✕'),
      el('div', { className: 'overlay-title' }, 'NOTIFICATIONS'),
      state.notifications.length === 0 ? el('div', { className: 'overlay-card' }, "You're all caught up.") : null,
      ...state.notifications.map(renderNotificationCard)
    )
  );
}

function renderNotificationCard(n) {
  if (n.type === 'welcome' || n.type === 'clash_ended' || n.type === 'clash_cancelled') {
    return el('div', { className: 'overlay-card', style: 'position:relative;' },
      el('div', { className: 'notif-card-x', onclick: () => dismissNotification(n.id) }, '✕'),
      el('h4', {}, n.title),
      el('div', {}, n.body)
    );
  }
  if (n.type === 'friend_request') {
    return el('div', { className: 'overlay-card' },
      el('h4', {}, n.title),
      el('div', { className: 'notif-friend-row' }, n.body),
      el('div', { className: 'notif-btns' },
        el('div', { className: 'notif-btn notif-accept', onclick: () => respondToFriendRequestNotification(n, true) }, 'Accept'),
        el('div', { className: 'notif-btn notif-decline', onclick: () => respondToFriendRequestNotification(n, false) }, 'Decline')
      )
    );
  }
  if (n.type === 'clash_challenge') {
    return el('div', { className: 'overlay-card' },
      el('h4', {}, n.title),
      el('div', { className: 'notif-friend-row' }, n.body),
      el('div', { className: 'notif-btns' },
        el('div', { className: 'notif-btn notif-accept', onclick: () => acceptChallengeNotification(n) }, 'Accept'),
        el('div', { className: 'notif-btn notif-decline', onclick: () => declineChallengeNotification(n) }, 'Decline')
      )
    );
  }
  return null;
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
  }, icon(s.icon)));

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
    // Accepting a challenge builds against the challenger's exact odds
    // snapshot (passing clashId), not a fresh live fetch - see props_snapshot
    // on the backend for why.
    const props = await apiFetch(`/games/${sport}/${eventId}/props${clashId ? `?clashId=${clashId}` : ''}`);
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
    ? el('img', { src: logoUrl, className: 'logo-img', title: teamName })
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

// The X inside the ticket-builder panel steps back one screen (line -> stat
// -> player) rather than always bailing out of the whole builder - only
// closes it outright once already on the first step (player select).
function goBackStep() {
  const b = state.builder;
  if (b.selectedStat) {
    b.selectedStat = null;
    b.pendingTier = null;
    b.pendingSide = 'over';
    render();
  } else if (b.selectedPlayer) {
    b.selectedPlayer = null;
    render();
  } else {
    setState({ builder: null });
  }
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
      el('div', { className: 'close-x-row' }, el('span', { className: 'close-x-inline', onclick: goBackStep }, '✕')),
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

// Baseball convention: AVG/OBP/SLG never reach 1.000, so drop the leading
// zero (".262"); OPS occasionally does for elite hitters, so only drop it
// when the value is actually under 1.
function formatBattingAvg(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  const fixed = x.toFixed(3);
  return x < 1 ? fixed.replace(/^0/, '') : fixed;
}

function renderSeasonStatPills(stats) {
  return el('div', { className: 'pills' },
    el('div', { className: 'pill' }, `AVG ${formatBattingAvg(stats.avg)}`),
    el('div', { className: 'pill' }, `OPS ${formatBattingAvg(stats.ops)}`),
    el('div', { className: 'pill' }, `RBI/G ${stats.rbiPerGame != null ? stats.rbiPerGame.toFixed(2) : '—'}`)
  );
}

function renderStatLinePills(stats) {
  return el('div', { className: 'pills' }, ...Object.entries(stats).map(([statKey, stat]) => {
    const preview = stat.overUnder ? (stat.over[0] || stat.under[0]) : stat.options[0];
    return el('div', { className: 'pill' }, `${statDisplayName(statKey)} ${preview ? preview.line : ''}`);
  }));
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
        el('div', { className: 'pname' }, name.toUpperCase(), info.position ? el('span', { className: 'ppos' }, ` · ${info.position}`) : null),
        info.seasonStats ? renderSeasonStatPills(info.seasonStats) : renderStatLinePills(info.stats)
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
        el('span', {}, statDisplayName(statKey).toUpperCase()),
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
    el('div', { className: 'stat-label' }, statDisplayName(b.selectedStat).toUpperCase()),
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

// "hits_runs_rbis" reads as three unrelated stats once naively
// underscore-to-space'd ("HITS RUNS RBIS") - spell out the combo instead.
const STAT_DISPLAY_NAMES = { hits_runs_rbis: 'hits+runs+rbis' };
function statDisplayName(statKey) {
  return STAT_DISPLAY_NAMES[statKey] || statKey.replace(/_/g, ' ');
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
        el('div', { className: 'leg-detail' }, `${statDisplayName(myLeg.stat_key)} ${ouLabel(myLeg.over_under)} ${myLeg.line}`)
      ),
      oppLeg ? el('div', { className: `leg-box leg-opp tier-${oppLeg.tier}`, style: `animation-delay:${delay}s;` },
        el('div', { className: 'leg-player' }, shortName(oppLeg.player_name)),
        el('div', { className: 'leg-detail' }, `${statDisplayName(oppLeg.stat_key)} ${ouLabel(oppLeg.over_under)} ${oppLeg.line}`)
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

// --- Leaderboard tab ---
// Global ranking across every user (not just friends) - not in the original
// design spec/prototype, so this uses our own light-theme visual language
// rather than replicating a mock that doesn't exist for this screen.

function renderLeaderboardTab() {
  if (state.leaderboard.length === 0) return el('p', { className: 'muted', style: 'text-align:center; margin-top:30px;' }, 'No ranked players yet.');

  return el('div', {},
    el('div', { style: 'font-family:Archivo,sans-serif; font-weight:900; font-size:20px; margin-bottom:16px; text-align:center; color:var(--text);' }, 'LEADERBOARD'),
    ...state.leaderboard.map((entry, i) => {
      const isMe = entry.id === state.profile.id;
      return el('div', {
        className: 'player-row',
        style: isMe ? 'border-color:var(--green); background:rgba(52,211,153,0.1);' : '',
      },
        el('div', { style: 'width:28px; font-weight:800; color:var(--text-faint); flex-shrink:0; text-align:center;' }, `${i + 1}`),
        el('div', { className: 'player-avatar', style: `background:${entry.avatar_color || '#4a7bf0'};` }),
        el('div', { className: 'pname', style: 'flex:1;' }, isMe ? `${entry.username} (you)` : entry.username),
        trophyBadge(entry.trophies)
      );
    })
  );
}

// --- Profile tab ---
// Not part of the original design spec beyond its shape (avatar+username,
// per-sport win% boxes, Friends section) - the prototype never wired up
// real search, so this folds in the working add-friend flow we already
// built rather than showing a fake "Invite Friends" button that does nothing.

function renderProfileTab() {
  const stats = state.profileStats;
  if (!stats) return el('p', { className: 'muted', style: 'text-align:center; margin-top:30px;' }, 'Loading...');

  const viewingSelf = !state.viewingFriendId;

  const myRank = rankForTrophies(stats.trophies);
  const header = el('div', { style: 'display:flex; align-items:center; gap:12px; margin-bottom:18px;' },
    !viewingSelf ? el('span', { className: 'back-arrow', onclick: openOwnProfile }, '←') : null,
    el('div', {
      className: 'avatar-circle',
      style: `background:${stats.avatarColor || '#4c7bf0'}; width:56px; height:56px; ${avatarGlowStyle(stats.trophies)} ${viewingSelf ? 'cursor:pointer;' : ''}`,
      onclick: viewingSelf ? () => alert('Edit username / profile picture - not built yet') : null,
    }),
    el('div', {},
      el('div', { style: 'font-family:Archivo,sans-serif; font-weight:800; font-size:17px; color:var(--text);' }, stats.username),
      el('div', { style: `font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:var(--${myRank.key});` }, myRank.label),
      trophyBadge(stats.trophies)
    )
  );

  const statBoxes = el('div', { className: 'row', style: 'gap:12px; margin-bottom:22px;' },
    ...Object.entries(stats.stats).map(([sportKey, s]) => {
      const label = (SPORTS.find(sp => sp.key === sportKey) || {}).label || sportKey;
      return el('div', { className: 'game-card', style: 'background:#4a7bf0; color:#fff; flex:1; text-align:center; padding:22px 8px; margin-bottom:0;' },
        el('div', { style: 'font-weight:800; font-size:17px;' }, s.winPct !== null ? `${s.winPct}%` : '—'),
        el('div', { style: 'font-size:11px; opacity:0.85; margin-top:4px;' }, `${label.toUpperCase()} WIN%`)
      );
    })
  );

  const friendsSection = viewingSelf ? el('div', {},
    el('div', { style: 'font-family:Archivo,sans-serif; font-weight:900; font-size:20px; margin-bottom:16px; color:var(--text);' }, 'FRIENDS'),
    renderFriendManagement(),
    ...[...state.friends]
      .map(f => ({
        friend: f.requester_id === state.profile.id ? f.recipient : f.requester,
        friendId: f.requester_id === state.profile.id ? f.recipient_id : f.requester_id,
      }))
      .sort((a, b) => b.friend.trophies - a.friend.trophies)
      .map(({ friend, friendId }) => el('div', {
        className: 'player-row',
        onclick: () => openFriendProfileById(friendId),
      },
        el('div', { className: 'player-avatar', style: `background:${friend.avatar_color || '#4a7bf0'};` }),
        el('div', { className: 'pname', style: 'flex:1;' }, friend.username),
        trophyBadge(friend.trophies)
      ))
  ) : null;

  return el('div', {}, header, statBoxes, friendsSection);
}

function renderFriendManagement() {
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

  return el('div', { style: 'margin-bottom: 16px;' },
    el('div', { className: 'row', style: 'margin-bottom: 10px;' },
      searchInput = el('input', { placeholder: 'Search by username' }),
      el('button', { onclick: search }, 'Add')
    ),
    ...state.searchResults.map(u => el('div', { className: 'row between', style: 'margin-bottom:6px;' },
      el('span', { style: 'color:var(--text);' }, u.username),
      el('button', { onclick: () => sendRequest(u.id) }, 'Send Request')
    )),
    state.pendingRequests.length > 0 ? el('div', { style: 'margin: 10px 0;' },
      el('div', { style: 'font-weight:700; margin-bottom:8px; color:var(--text);' }, 'Pending requests'),
      ...state.pendingRequests.map(r => el('div', { className: 'row between', style: 'margin-bottom:8px;' },
        el('span', { style: 'color:var(--text);' }, r.requester.username),
        el('div', { className: 'row' },
          el('button', { onclick: () => respond(r.id, true) }, 'Accept'),
          el('button', { className: 'secondary', onclick: () => respond(r.id, false) }, 'Decline')
        )
      ))
    ) : null
  );
}

// --- Clashes tab ---

const ACTIVE_STATUSES = ['awaiting_opponent', 'pending', 'live'];

// Only sports that can actually have a Clash (matches ALLOWED_SPORTS on the
// backend) - showing basketball/football icons here would just be a dead
// end that always reads "no clashes" for sports that don't exist yet.
const CLASH_SPORT_FILTERS = [{ key: 'all', label: 'All' }, ...SPORTS.filter(s => s.supported)];

function renderClashesTab() {
  const visible = state.clashes.filter(c => !state.dismissedClashIds.has(c.id));
  const list = visible
    .filter(c => ACTIVE_STATUSES.includes(c.status) === (state.clashesTab === 'active'))
    .filter(c => state.clashesSportFilter === 'all' || c.sport === state.clashesSportFilter);

  return el('div', {},
    el('div', { style: 'display:flex; gap:10px; margin-bottom:16px;' },
      ...CLASH_SPORT_FILTERS.map(s => el('div', {
        className: `sport-icon ${state.clashesSportFilter === s.key ? 'active' : ''}`,
        onclick: () => setState({ clashesSportFilter: s.key, expandedClashId: null }),
      }, s.key === 'all'
        ? el('span', { style: 'font-family:"JetBrains Mono",monospace; font-weight:700; font-size:10px;' }, 'ALL')
        : icon(s.icon)))
    ),
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
          `No ${state.clashesTab === 'active' ? 'active' : 'finished'} ${
            state.clashesSportFilter === 'all' ? '' : `${SPORTS.find(s => s.key === state.clashesSportFilter)?.label} `
          }Clashes ${state.clashesTab === 'active' ? 'right now' : 'yet'}.`)
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

// Once resolved, leg.hit is the authoritative stored result. Before that
// (live or even pending), derive it live from current_value vs line so
// progress icons AND score totals actually track the real game as it moves,
// not just a stored score that's only ever written at final resolution.
function legIsHit(leg) {
  if (leg.hit !== null) return leg.hit;
  if (leg.current_value === null || leg.current_value === undefined) return false; // hasn't started tracking yet
  return leg.over_under === 'under' ? leg.current_value <= leg.line : leg.current_value >= leg.line;
}

function progressIcon(leg) {
  return legIsHit(leg) ? '✅' : '❌';
}

function liveScore(legs) {
  return legs.reduce((sum, l) => sum + (legIsHit(l) ? (l.points || 0) : 0), 0);
}

function renderLegProgressBox(leg, sideClass, showProgress) {
  return el('div', { className: `leg-progress-box ${sideClass} tier-${leg.tier}` },
    el('div', { className: 'leg-player' }, shortName(leg.player_name)),
    el('div', { className: 'leg-detail' },
      `${statDisplayName(leg.stat_key)} ${ouLabel(leg.over_under)} ${showProgress ? `${leg.current_value} / ` : ''}${leg.line}`),
    el('div', { className: 'leg-icon' }, showProgress ? progressIcon(leg) : '⏳')
  );
}

function renderClashDetail(clash, ctx) {
  const { myLegs, oppLegs, myName, oppName, myScore, oppScore, myMax, oppMax, result } = ctx;
  const isResolved = ['won', 'lost', 'tied', 'cancelled'].includes(result);
  // Cancelled legs never actually got tracked (the game never started), so
  // showing real ✅/❌ icons would misleadingly read as "you lost every
  // pick" - leave them at the neutral pending ⏳ instead.
  const showProgress = clash.status === 'live' || (isResolved && result !== 'cancelled');

  const scoreRow = (clash.status === 'awaiting_opponent' || clash.status === 'cancelled') ? null : el('div', { className: 'clash-score-row' },
    el('div', { style: `color:${myScore >= oppScore ? 'var(--win)' : 'var(--text-dim)'};` }, `${myScore} pts`),
    el('div', { style: 'font-family:"JetBrains Mono",monospace; font-weight:700; font-size:13px; color:var(--text-dim);' }, isResolved ? 'FINAL' : clash.status.toUpperCase()),
    el('div', { style: `color:${oppScore > myScore ? 'var(--win)' : 'var(--text-dim)'};` }, `${oppScore} pts`)
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
      el('div', { style: 'color:var(--blue);' }, 'YOU', el('div', { className: 'max-points' }, `max ${myMax} pts`)),
      el('div', { style: 'color:var(--loss); text-align:right;' }, oppName, el('div', { className: 'max-points' }, `max ${oppMax} pts`))
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
  // Computed live from leg data (not clash.score_a/score_b, which the
  // backend only ever writes at final resolution) so this tracks an
  // in-progress game instead of sitting stuck at 0 until it ends.
  const myScore = liveScore(myLegs);
  const oppScore = liveScore(oppLegs);
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
    : result === 'cancelled'
    ? el('div', { className: 'clash-banner-status' }, 'CANCELLED - PLAYER RULED OUT')
    : el('div', { className: 'clash-banner-status' }, result === 'won' ? 'YOU WON' : result === 'lost' ? 'YOU LOST' : 'TIED');

  const canRespond = clash.status === 'awaiting_opponent' && isB;

  const banner = el('div', {
    className: `clash-banner ${['won', 'lost', 'tied', 'cancelled'].includes(result) ? result : ''} ${expanded ? 'expanded-banner' : ''}`,
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
    const [freshClashes, freshNotifications] = await Promise.all([
      apiFetch('/clashes'),
      apiFetch('/users/notifications'),
    ]);
    const previousStatusById = new Map(state.clashes.map(c => [c.id, c.status]));
    const justAccepted = freshClashes.find(c =>
      c.user_a_id === state.profile.id &&
      previousStatusById.get(c.id) === 'awaiting_opponent' &&
      c.status !== 'awaiting_opponent'
    );
    if (justAccepted) {
      setState({ clashes: freshClashes, notifications: freshNotifications, clashReveal: justAccepted });
      return;
    }
    state.clashes = freshClashes;
    state.notifications = freshNotifications;
    render();
  } catch {
    // background poll - fail silently, next tick will retry
  }
}, 25000);
