-- Run this in the Supabase SQL Editor. Renames the elo column to trophies
-- (it's no longer real ELO math, so the name was misleading) and rescales
-- everyone's existing rating down to the new 0-based ladder: newElo = max(0,
-- oldElo - 1000). This preserves everyone's relative standing rather than
-- wiping out progress - e.g. 1017 -> 17, 985 -> 0 (floored).
alter table profiles rename column elo to trophies;
update profiles set trophies = greatest(0, trophies - 1000);
alter table profiles alter column trophies set default 0;
