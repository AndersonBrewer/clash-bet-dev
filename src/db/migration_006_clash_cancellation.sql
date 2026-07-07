-- Run this in the Supabase SQL Editor. Adds a 'cancelled' Clash status (used
-- when a leg's player is ruled out before the real game starts) and a
-- matching 'clash_cancelled' notification type to tell both users why.
alter table clashes drop constraint clashes_status_check;
alter table clashes add constraint clashes_status_check
  check (status in ('awaiting_opponent', 'pending', 'live', 'won_a', 'won_b', 'tied', 'cancelled'));

alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('welcome', 'friend_request', 'clash_challenge', 'clash_ended', 'clash_cancelled'));
