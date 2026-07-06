// Standard ELO rating update, same core formula chess.com and similar ranked
// systems use. K controls how much a single result can move your rating -
// higher K = bigger swings. 32 is a common default; tune later once you have
// real match data to see if ratings feel too volatile or too sticky.
const K_FACTOR = 32;

/**
 * @param {number} ratingA - current ELO of user A
 * @param {number} ratingB - current ELO of user B
 * @param {number} scoreA - 1 if A won, 0 if A lost, 0.5 if tied
 * @returns {{ newRatingA: number, newRatingB: number, deltaA: number, deltaB: number }}
 */
export function calculateEloUpdate(ratingA, ratingB, scoreA) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;

  const newRatingA = Math.round(ratingA + K_FACTOR * (scoreA - expectedA));
  const newRatingB = Math.round(ratingB + K_FACTOR * (scoreB - expectedB));

  return {
    newRatingA,
    newRatingB,
    deltaA: newRatingA - ratingA,
    deltaB: newRatingB - ratingB,
  };
}

// Convenience wrapper for the three Clash outcomes used in the app.
export function eloForClashResult(ratingA, ratingB, result) {
  // result is from A's perspective: 'won_a', 'won_b', or 'tied'
  const scoreA = result === 'won_a' ? 1 : result === 'won_b' ? 0 : 0.5;
  return calculateEloUpdate(ratingA, ratingB, scoreA);
}
