// @ts-check
/**
 * Current zone bins (contract §5.4). A debug-only grouping derived independently
 * each frame/generation from argmax(timeAllocation) with deterministic
 * tie-breaking in canonical zone order. Zone bins have NO persistent identity,
 * are not biological groups, and are never used for mating, survival,
 * reproduction, mutation, or stored in canonical biological state.
 */

import { ZONES } from "../config/zones.js";
import { argmax } from "../core/math.js";

/**
 * Current zone-bin index for an individual (argmax with first-wins tie-break in
 * canonical zone order, which is exactly what argmax() provides).
 * @param {{timeAllocation:ArrayLike<number>}} individual
 * @returns {number}
 */
export function currentZoneBinIndex(individual) {
  return argmax(individual.timeAllocation);
}

/**
 * Current zone-bin name for an individual.
 * @param {{timeAllocation:ArrayLike<number>}} individual
 * @returns {string}
 */
export function currentZoneBinName(individual) {
  return ZONES[currentZoneBinIndex(individual)];
}

/**
 * Count living individuals by current zone bin.
 * @param {Array<{timeAllocation:ArrayLike<number>}>} individuals
 * @returns {number[]} counts in canonical zone order
 */
export function zoneBinCounts(individuals) {
  const counts = new Array(ZONES.length).fill(0);
  for (const ind of individuals) counts[currentZoneBinIndex(ind)]++;
  return counts;
}
