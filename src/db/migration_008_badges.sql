-- Run this in the Supabase SQL Editor. Adds the Badges (clan/team) feature:
-- a shared shield emblem, membership, and a badge-scoped leaderboard.
create table badges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_private boolean not null default false,
  primary_color text not null,
  secondary_color text not null,
  pattern text not null,
  creator_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- No unique constraint on user_id - "one badge at a time" is enforced in
-- the backend route, not the database, so it's a one-line change to loosen
-- that later if you ever want multi-badge membership.
create table badge_members (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid not null references badges(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table badges enable row level security;
alter table badge_members enable row level security;

-- Matches profiles' own "viewable by everyone" policy - the backend (using
-- the service role key) does the real private-badge visibility filtering in
-- the route itself, same as every other write path in this app.
create policy "badges are viewable by everyone" on badges for select using (true);
create policy "badge_members are viewable by everyone" on badge_members for select using (true);
