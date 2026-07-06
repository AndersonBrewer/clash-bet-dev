# Clash Bet Backend

A minimal Express backend covering login, friends, Clashes, ELO, and live sports
data - built to cost $0/month at friends-testing scale.

## What this uses and why

| Piece | Tool | Cost |
|---|---|---|
| Login / user accounts | Supabase Auth | Free |
| Database (users, friends, clashes, legs) | Supabase Postgres | Free |
| Player prop lines | The Odds API | Free (500 credits/mo) |
| Live stat checking | ESPN's public (unofficial) endpoints | Free, no key |

## One-time setup

### 1. Create a Supabase project
1. Go to https://supabase.com, sign up, click "New Project."
2. Once it's created, go to **Settings > API**. Copy the **Project URL**, the
   **anon public** key, and the **service_role** key.
3. Go to **SQL Editor > New Query**, paste in the entire contents of
   `src/db/schema.sql`, and run it. This creates all four tables (profiles,
   friendships, clashes, clash_legs) with the right permissions.
4. Go to **Authentication > Providers** and make sure Email is enabled (it is
   by default). That's all you need for basic email/password login - the app
   will call Supabase's client SDK directly for sign-up/sign-in, this backend
   doesn't handle passwords itself.

### 2. Get an Odds API key
1. Go to https://the-odds-api.com/, click to get a free API key (no credit
   card needed for the free tier).
2. You'll get 500 credits/month. Remember: pull player prop odds **once per
   game**, not on a timer - that keeps you well within the free tier even
   with several friends testing across multiple games a week.

### 3. Configure environment variables
```
cp .env.example .env
```
Fill in the four values from steps 1 and 2.

### 4. Install and run
```
npm install
npm run dev
```
Server starts on `http://localhost:3001`.

## How the pieces fit together

- **Login**: happens entirely on the frontend via Supabase's JS client
  (`supabase.auth.signUp(...)`, `supabase.auth.signInWithPassword(...)`).
  Once signed in, the frontend gets a session token and sends it as
  `Authorization: Bearer <token>` on every request to this backend. Right
  after sign-up, call `POST /api/users/profile` once to create the user's
  row (username, starting ELO).

- **Browsing games**: frontend calls `GET /api/games/:sport` to show a real
  schedule (free, via ESPN). When a user opens a specific game to build a
  ticket, call `GET /api/games/:sport/:eventId/props` ONCE to get real prop
  lines with tiers already assigned.

- **Creating a Clash**: once both users have picked their 5 legs, call
  `POST /api/clashes` with both tickets. This locks the picks into the
  database.

- **Live progress**: while a Clash's game is in progress, poll
  `POST /api/clashes/:id/refresh` every 30-60 seconds to pull current stat
  values from ESPN's free box score endpoint and update each leg's progress.

- **Resolving a Clash**: once the real game ends, call
  `POST /api/clashes/:id/resolve`. This finalizes every leg as hit/miss,
  tallies both scores, determines win/loss/tie, updates both users' ELO
  using the standard chess-style formula, and marks the Clash resolved.
  (You'll want a small scheduler - even a simple cron job checking ESPN's
  scoreboard for games that just went final - to trigger this automatically
  rather than doing it by hand.)

- **Clash history**: `GET /api/clashes` returns every Clash (pending, live,
  and resolved) for the logged-in user, each with its full leg data attached.
  Filter/sort on the frontend by `status` and `resolved_at`.

## What's intentionally left simple for now

- **Prop market coverage**: the `MARKET_KEYS` map in `src/lib/oddsApi.js`
  only covers a handful of basketball stats as a starting example - you'll
  need to add entries for baseball/football stat names and confirm the exact
  market key names The Odds API uses for each (check their docs per-sport,
  since naming varies).
- **ESPN box score parsing**: `extractPlayerStat` in `src/lib/espnApi.js` is
  written for basketball's box score shape. Baseball and soccer box scores
  are structured differently in ESPN's response, so you'll need a parser
  per sport.
- **Auto-resolution**: there's no scheduler here yet - resolving a Clash is a
  manual API call for now. A simple approach later: a cron job every few
  minutes that checks all `live` Clashes' games against ESPN's scoreboard,
  and calls `/resolve` automatically once a game shows `status: post`.
- **Tie-break "double or nothing"**: not built - you mentioned wanting to
  revisit this later, so `resolve` just marks a real tie as `tied` for now.

## Where to run this

For testing with friends, any of these work and are free or near-free:
- **Render** or **Railway** - free/cheap tiers, easiest to deploy an Express app to
- **Fly.io** - generous free allowance
- Your own machine, if you're just testing locally with friends on the same network

Whichever you pick, remember to set the same environment variables there
that you set in `.env` locally.
