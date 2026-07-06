-- Run this in the Supabase SQL Editor. Persists which side (over/under) a
-- leg was picked on, needed for correct hit/miss resolution now that the
-- ticket builder lets users pick Under, not just Over.
alter table clash_legs add column over_under text not null default 'over'
  check (over_under in ('over', 'under'));
