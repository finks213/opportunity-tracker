// @ts-check
/**
 * Birth-only inheritance drift for body genome and time allocation
 * (contract §12 and §13). Pure given the RNG; consumes only simRng.
 *
 * Draw order is binding for determinism (§11 step 9): body inheritance and the
 * body-mutation opportunity occur BEFORE any allocation-related random draw.
 */

import { NUM_TRAITS } from "../config/traits.js";
import { ZONES, ZONE_NEIGHBORS } from "../config/zones.js";
import { clamp } from "./math.js";

/**
 * Inherited pre-mutation body genome from two parents (§12).
 *   parentMean = (a+b)/2
 *   drift = normal(0,1) * bodyDriftScale * 2 * sqrt(parentMean*(1-parentMean))
 *   preMutation = clamp(parentMean + drift, 0, 1)
 * Consumes exactly NUM_TRAITS normal draws in canonical trait order.
 * @param {ArrayLike<number>} a parent A body genome
 * @param {ArrayLike<number>} b parent B body genome
 * @param {import("./rng.js").Rng} rng
 * @param {Object} config
 * @returns {Float64Array} pre-mutation genome (length 10)
 */
export function inheritBodyGenome(a, b, rng, config) {
  const g = new Float64Array(NUM_TRAITS);
  const scale = config.bodyDriftScale;
  for (let t = 0; t < NUM_TRAITS; t++) {
    const mean = (a[t] + b[t]) / 2;
    const drift = rng.nextNormal() * scale * 2 * Math.sqrt(mean * (1 - mean));
    g[t] = clamp(mean + drift, 0, 1);
  }
  return g;
}

/**
 * Compute the parental-use-plus-neighbours eligibility mask (§13).
 * A zone is a parental-use zone when either parent has share >= parentalUseEpsilon.
 * Eligible zones are all parental-use zones plus their graph neighbours.
 * @param {ArrayLike<number>} a parent A allocation
 * @param {ArrayLike<number>} b parent B allocation
 * @param {Object} config
 * @returns {boolean[]} length 3
 */
export function eligibleZoneMask(a, b, config) {
  const eps = config.parentalUseEpsilon;
  const nZones = ZONES.length;
  const parentalUse = new Array(nZones).fill(false);
  for (let z = 0; z < nZones; z++) {
    if (a[z] >= eps || b[z] >= eps) parentalUse[z] = true;
  }
  const eligible = parentalUse.slice();
  for (let z = 0; z < nZones; z++) {
    if (parentalUse[z]) {
      for (const nb of ZONE_NEIGHBORS[z]) eligible[nb] = true;
    }
  }
  return eligible;
}

/**
 * Inherited post-drift, masked, renormalized time allocation (§13) BEFORE the
 * allocation-mutation opportunity. Consumes exactly one normal draw per zone in
 * canonical zone order.
 *
 * Returns the eligible mask alongside so the caller can run the allocation
 * mutation opportunity and, if needed, the zero-vector fallback.
 *
 * @param {ArrayLike<number>} a parent A allocation
 * @param {ArrayLike<number>} b parent B allocation
 * @param {import("./rng.js").Rng} rng
 * @param {Object} config
 * @returns {{allocation:Float64Array, eligible:boolean[], usedFallback:boolean}}
 */
export function inheritTimeAllocation(a, b, rng, config) {
  const nZones = ZONES.length;
  const eligible = eligibleZoneMask(a, b, config);
  const mean = new Array(nZones);
  const drifted = new Array(nZones);
  const scale = config.allocationDriftScale;
  for (let z = 0; z < nZones; z++) {
    mean[z] = (a[z] + b[z]) / 2;
    // Draw drift for every zone in canonical order so consumption is fixed,
    // even for non-eligible zones whose value is discarded below.
    const drift = rng.nextNormal() * scale * 2 * Math.sqrt(mean[z] * (1 - mean[z]));
    drifted[z] = mean[z] + drift;
  }
  // 1. zero non-eligible zones; 2. clamp eligible to [0,1]; 3. renormalize.
  const masked = new Float64Array(nZones);
  let sum = 0;
  for (let z = 0; z < nZones; z++) {
    if (!eligible[z]) { masked[z] = 0; continue; }
    masked[z] = clamp(drifted[z], 0, 1);
    sum += masked[z];
  }
  let usedFallback = false;
  if (sum <= 0) {
    // Zero-vector fallback (§13 "Zero-vector fallback").
    usedFallback = true;
    // 1. restore masked parental mean
    sum = 0;
    for (let z = 0; z < nZones; z++) {
      masked[z] = eligible[z] ? Math.max(0, mean[z]) : 0;
      sum += masked[z];
    }
    if (sum <= 0) {
      // 3. one-hot at first parent's dominant zone
      let dom = 0;
      for (let z = 1; z < nZones; z++) if (a[z] > a[dom]) dom = z;
      for (let z = 0; z < nZones; z++) masked[z] = z === dom ? 1 : 0;
      sum = 1;
    }
  }
  for (let z = 0; z < nZones; z++) masked[z] = masked[z] / sum;
  return { allocation: masked, eligible, usedFallback };
}
