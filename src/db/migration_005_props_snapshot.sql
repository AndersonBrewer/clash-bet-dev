-- Run this in the Supabase SQL Editor. Stores the exact prop odds/tiers a
-- Clash was built against at challenge-creation time, so the opponent's
-- accept-flow can build their ticket from the identical snapshot instead of
-- a fresh live fetch that might show different lines if enough time passed
-- (challenge/accept is async - could be hours or days apart).
alter table clashes add column props_snapshot jsonb;
