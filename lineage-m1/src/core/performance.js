// @ts-check
/**
 * Body-trait -> performance layer and zone fitness (contract §9, §10 steps 1-4).
 *
 * Pure functions of a body genome and versioned configuration. No RNG, no
 * observer state, no time allocation, no zone bins.
 */

import { EFFECT, UPKEEP, NUM_DIMENSIONS } from "../config/traits.js";
import { dot } from "./math.js";

/**
 * Compute the seven performance dimensions from a body genome.
 * @param {ArrayLike<number>} genome length 10
 * @returns {number[]} length 7
 */
export function performanceDimensions(genome) {
  const perf = new Array(NUM_DIMENSIONS).fill(0);
  for (let t = 0; t < genome.length; t++) {
    const g = genome[t];
    if (g === 0) continue;
    const row = EFFECT[t];
    for (let d = 0; d < NUM_DIMENSIONS; d++) {
      perf[d] += row[d] * g;
    }
  }
  return perf;
}

/**
 * Total flat metabolic upkeep for a genome (§10 step 3 input).
 * @param {ArrayLike<number>} genome
 * @returns {number}
 */
export function upkeepCost(genome) {
  let sum = 0;
  for (let t = 0; t < genome.length; t++) sum += UPKEEP[t] * genome[t];
  return sum;
}

/**
 * Zone fitness for every zone (§10 steps 2-4): weighted performance minus
 * scarcity-scaled upkeep. Returns one value per zone in canonical order.
 * @param {ArrayLike<number>} genome
 * @param {{zoneWeights:number[][], zoneScarcity:number[]}} config
 * @returns {number[]} length 3
 */
export function zoneFitness(genome, config) {
  const perf = performanceDimensions(genome);
  const upkeep = upkeepCost(genome);
  const out = new Array(config.zoneWeights.length);
  for (let z = 0; z < config.zoneWeights.length; z++) {
    out[z] = dot(config.zoneWeights[z], perf) - config.zoneScarcity[z] * upkeep;
  }
  return out;
}
