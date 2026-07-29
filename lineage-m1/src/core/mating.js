// @ts-check
/**
 * Mate eligibility, deterministic candidate order, and mate selection
 * (contract §11 steps 5-8). Mating is derived ONLY from time-allocation overlap.
 * No observer state, trait value, zone-bin label, or display state may enter.
 */

import { dot } from "./math.js";

/**
 * Seeded Fisher-Yates shuffle of an id array using simRng (§11 step 6).
 * Consumes exactly (n-1) uniform draws. Mutates and returns `ids`.
 * @param {number[]} ids
 * @param {import("./rng.js").Rng} rng
 * @returns {number[]}
 */
export function fisherYatesShuffle(ids, rng) {
  for (let i = ids.length - 1; i >= 1; i--) {
    const j = Math.floor(rng.nextFloat() * (i + 1));
    const tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  return ids;
}

/**
 * Form mating pairs among aged survivors (§11 steps 5-7).
 * @param {import("./individual.js").Individual[]} survivors already aged this generation
 * @param {Object} config
 * @param {import("./rng.js").Rng} rng
 * @returns {Array<{parentAId:number, parentBId:number, overlap:number}>}
 */
export function formMatingPairs(survivors, config, rng) {
  const byId = new Map();
  const eligibleIds = [];
  for (const ind of survivors) {
    byId.set(ind.id, ind);
    if (ind.ageGenerations >= 1 && ind.ageGenerations <= 5) eligibleIds.push(ind.id);
  }
  // Step 6: one seeded Fisher-Yates shuffle of eligible parent ids.
  const order = fisherYatesShuffle(eligibleIds.slice(), rng);
  const paired = new Set();
  const pairs = [];
  const exp = config.matingOverlapExponent;
  const minOverlap = config.minimumMatingOverlap;

  for (const aId of order) {
    if (paired.has(aId)) continue;
    const A = byId.get(aId);
    // Build weighted candidate list among remaining unpaired distinct ids.
    const candIds = [];
    const weights = [];
    let weightSum = 0;
    for (const bId of order) {
      if (bId === aId || paired.has(bId)) continue;
      const B = byId.get(bId);
      const overlap = dot(A.timeAllocation, B.timeAllocation);
      if (overlap <= 0 || overlap < minOverlap) continue; // strictly positive & >= minimum
      const w = Math.pow(overlap, exp);
      candIds.push(bId);
      weights.push(w);
      weightSum += w;
    }
    if (candIds.length === 0 || weightSum <= 0) {
      // No valid B; A remains unpaired this generation. No draw consumed.
      continue;
    }
    // Normalize positive weights and consume one draw to select B.
    const u = rng.nextFloat();
    const threshold = u * weightSum;
    let cumulative = 0;
    let chosen = candIds[candIds.length - 1];
    for (let i = 0; i < candIds.length; i++) {
      cumulative += weights[i];
      if (cumulative > threshold) { chosen = candIds[i]; break; }
    }
    paired.add(aId);
    paired.add(chosen);
    const B = byId.get(chosen);
    pairs.push({
      parentAId: aId,
      parentBId: chosen,
      overlap: dot(A.timeAllocation, B.timeAllocation),
    });
  }
  return pairs;
}
