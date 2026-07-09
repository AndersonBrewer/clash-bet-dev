// Rank reuses the same 5 colors as the betting tiers (grey/green/blue/
// purple/gold) rather than inventing a separate palette - keeps the whole
// app's visual language (tier-gradient logo, bet tiers, now ranks too)
// pointing at the same 5-step "common -> rare" idea instead of two
// unrelated color systems. Mirrored client-side in public/app.js - keep
// both in sync.
export const RANK_TIERS = [
  { key: 'grey', label: 'Grey League', min: 0 },
  { key: 'green', label: 'Green League', min: 100 },
  { key: 'blue', label: 'Blue League', min: 250 },
  { key: 'purple', label: 'Purple League', min: 500 },
  { key: 'gold', label: 'Gold League', min: 1000 },
];

export function rankForTrophies(trophies) {
  let current = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (trophies >= tier.min) current = tier;
  }
  return current;
}
