-- Run this in the Supabase SQL Editor. Adds a real, persisted notifications
-- system (the prototype's version was in-memory only and didn't survive a
-- page reload).
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('welcome', 'friend_request', 'clash_challenge', 'clash_ended')),
  title text not null,
  body text,
  related_id uuid, -- friendship id or clash id, depending on type
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;
create policy "users see their own notifications" on notifications for select using (auth.uid() = user_id);
