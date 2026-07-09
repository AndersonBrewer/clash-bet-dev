// Clash Royale-style flat trophy gain/loss, not real ELO math (chess-style
// rating-difference-weighted swings). Both sides move by the same BASE
// amount, nudged up or down together by how much of an upset the result
// was - an underdog win swings more for both players, an expected win
// swings less for both. Never drops below 0 (see the floor below).
const BASE_TROPHY_CHANGE = 30;
const MAX_ADJUSTMENT = 15; // total range per match: 15..45 trophies
const TROPHY_DIFF_SCALE = 20; // trophies of gap per 1 point of adjustment

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * @param {number} trophiesA - current trophy count of user A
 * @param {number} trophiesB - current trophy count of user B
 * @param {'won_a'|'won_b'|'tied'} result - from A's perspective
 */
export function trophiesForClashResult(trophiesA, trophiesB, result) {
  if (result === 'tied') {
    return { newTrophiesA: trophiesA, newTrophiesB: trophiesB, deltaA: 0, deltaB: 0 };
  }

  const aWon = result === 'won_a';
  const winnerTrophies = aWon ? trophiesA : trophiesB;
  const loserTrophies = aWon ? trophiesB : trophiesA;

  // Positive when the winner had FEWER trophies than the loser (an upset -
  // both players' trophies swing more). Negative when the winner already
  // had more (an expected result - both swing less).
  const diff = loserTrophies - winnerTrophies;
  const adjustment = clamp(Math.round(diff / TROPHY_DIFF_SCALE), -MAX_ADJUSTMENT, MAX_ADJUSTMENT);
  const change = BASE_TROPHY_CHANGE + adjustment;

  const newWinnerTrophies = winnerTrophies + change;
  const newLoserTrophies = Math.max(0, loserTrophies - change);

  const newTrophiesA = aWon ? newWinnerTrophies : newLoserTrophies;
  const newTrophiesB = aWon ? newLoserTrophies : newWinnerTrophies;

  return {
    newTrophiesA, newTrophiesB,
    deltaA: newTrophiesA - trophiesA,
    deltaB: newTrophiesB - trophiesB,
  };
}
