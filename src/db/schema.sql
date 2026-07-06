-- Run this in the Supabase SQL Editor (Project > SQL Editor > New Query) once, after creating your project.

-- Profile data for each user. id matches Supabase's built-in auth.users.id,
-- so Supabase Auth handles email/password (or Google, etc.) and this table just
-- extends it with the app-specific fields we need (username, elo, avatar).
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  elo integer not null default 1000,
  avatar_color text default '#4a7bf0',
  created_at timestamptz not null default now()
);

-- Friendships. One row per relationship. status is 'pending' until the
-- recipient accepts, then flips to 'accepted'. requester_id sent the request.
create table friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, recipient_id)
);

-- One row per Clash (a head-to-head match between two users on one real-world event).
create table clashes (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references profiles(id) on delete cascade,
  user_b_id uuid not null references profiles(id) on delete cascade,
  sport text not null,                 -- 'basketball' | 'baseball' | 'football' | 'world_cup'
  event_external_id text not null,     -- the game ID from your stats provider (ESPN event id, etc.)
  event_label text not null,           -- e.g. "Knicks vs. Celtics" - denormalized for easy display
  status text not null default 'pending' check (status in ('pending', 'live', 'won_a', 'won_b', 'tied')),
  score_a integer default 0,
  score_b integer default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- One row per leg (5 per user per clash). clash_id + owner_id groups them.
create table clash_legs (
  id uuid primary key default gen_random_uuid(),
  clash_id uuid not null references clashes(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,  -- which user this leg belongs to
  player_name text not null,
  stat_key text not null,              -- e.g. 'points', 'rebounds'
  tier text not null check (tier in ('grey', 'green', 'blue', 'purple', 'gold')),
  line numeric not null,               -- the locked-in prop line for this tier
  current_value numeric default 0,     -- live/final stat value, updated as the game progresses
  hit boolean,                         -- null while pending/live, true/false once resolved
  created_at timestamptz not null default now()
);

-- Row level security: users can only read/write their own data (and their side of shared rows).
alter table profiles enable row level security;
alter table friendships enable row level security;
alter table clashes enable row level security;
alter table clash_legs enable row level security;

create policy "profiles are viewable by everyone" on profiles for select using (true);
create policy "users can update their own profile" on profiles for update using (auth.uid() = id);

create policy "users see friendships they're part of" on friendships for select
  using (auth.uid() = requester_id or auth.uid() = recipient_id);
create policy "users can create friend requests" on friendships for insert
  with check (auth.uid() = requester_id);
create policy "recipient can update request status" on friendships for update
  using (auth.uid() = recipient_id);

create policy "users see clashes they're part of" on clashes for select
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

create policy "users see legs from their own clashes" on clash_legs for select
  using (
    exists (
      select 1 from clashes
      where clashes.id = clash_legs.clash_id
      and (clashes.user_a_id = auth.uid() or clashes.user_b_id = auth.uid())
    )
  );

-- Note: inserts/updates to clashes and clash_legs are done via the backend using the
-- service role key (which bypasses RLS), since resolving a Clash and updating ELO
-- needs to happen server-side, not directly from the app.
