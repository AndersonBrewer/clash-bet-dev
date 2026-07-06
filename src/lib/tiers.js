// Single source of truth for the 5-tier system - risk order and the points
// each tier awards when a leg hits. Used by both the props endpoint (to
// label/sort/dedupe tier options) and Clash resolution (to score legs).
export const TIER_ORDER = ['grey', 'green', 'blue', 'purple', 'gold'];
export const TIER_POINTS = { grey: 10, green: 25, blue: 50, purple: 100, gold: 200 };
