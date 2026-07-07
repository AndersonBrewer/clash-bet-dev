-- Run this in the Supabase SQL Editor. Adds per-user notification
-- preferences so people can mute individual notification types (friend
-- requests, clash challenges, clash results) from Settings.
alter table profiles
  add column notification_prefs jsonb not null default '{"friend_request": true, "clash_challenge": true, "clash_ended": true}'::jsonb;
