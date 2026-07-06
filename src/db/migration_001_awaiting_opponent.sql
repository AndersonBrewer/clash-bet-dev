-- Run this in the Supabase SQL Editor. Allows a Clash to sit in
-- 'awaiting_opponent' status between the challenger submitting their ticket
-- and the opponent submitting theirs.
alter table clashes drop constraint clashes_status_check;
alter table clashes add constraint clashes_status_check
  check (status in ('awaiting_opponent', 'pending', 'live', 'won_a', 'won_b', 'tied'));
