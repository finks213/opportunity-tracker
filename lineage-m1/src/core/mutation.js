// @ts-check
/**
 * Birth-only body-mutation and allocation-mutation opportunities.
 *
 * Body mutation: contract §12. The pure function receives ONLY the genome, RNG,
 * and config — never allocation, zone, observer, fitness, or usefulness (§20.6).
 *
 * Allocation mutation: the exact frozen §13.1 opportunity. Draw consumption is
 * binding on every branch: a failed occurrence consumes exactly one draw; a
 * successful occurrence consumes exactly four draws whether or not a donor
 * exists; candidate count never changes the number of draws.
 *
 * Neither function assigns event ids or touches the state counters; the event
 * assembler (events.js) does that so counter ownership stays centralized (§12.1).
 */

import { NUM_TRAITS } from "../config/traits.js";
import { ZONES } from "../config/zones.js";
import { clamp } from "./math.js";

/**
 * @typedef {Object} BodyMutationResult
 * @property {boolean} occurred
 * @property {Float64Array} genome                post-mutation genome (new array)
 * @property {null|{traitId:number, preMutationValue:number, requestedDelta:number, postMutationValue:number}} draft
 * @property {number} drawsConsumed
 */

/**
 * Execute exactly one body-mutation opportunity on a pre-mutation genome (§12).
 * @param {ArrayLike<number>} preMutationGenome
 * @param {import("./rng.js").Rng} rng
 * @param {Object} config
 * @returns {BodyMutationResult}
 */
export function bodyMutationOpportunity(preMutationGenome, rng, config) {
  const genome = Float64Array.from(preMutationGenome);
  const uOccurrence = rng.nextFloat();
  if (!(uOccurrence < config.bodyMutationProbabilityPerChild)) {
    return { occurred: false, genome, draft: null, drawsConsumed: 1 };
  }
  const uTrait = rng.nextFloat();
  const traitId = Math.min(Math.floor(uTrait * NUM_TRAITS), NUM_TRAITS - 1);
  const uDir = rng.nextFloat();
  const direction = uDir < 0.5 ? -1 : 1;
  const uMag = rng.nextFloat();
  const magnitude =
    config.bodyMutationMagnitudeMin +
    uMag * (config.bodyMutationMagnitudeMax - config.bodyMutationMagnitudeMin);
  const requestedDelta = direction * magnitude;
  const preMutationValue = genome[traitId];
  const postMutationValue = clamp(preMutationValue + requestedDelta, 0, 1);
  genome[traitId] = postMutationValue;
  return {
    occurred: true,
    genome,
    draft: { traitId, preMutationValue, requestedDelta, postMutationValue },
    drawsConsumed: 4,
  };
}

/**
 * @typedef {Object} AllocationMutationResult
 * @property {boolean} occurred    occurrence draw succeeded (opportunity proceeded)
 * @property {boolean} recorded    an event should be recorded (positive realized transfer)
 * @property {Float64Array} allocation resulting allocation (possibly unchanged)
 * @property {null|{fromZone:string, toZone:string, requestedTransfer:number, realizedTransfer:number, preMutationAllocation:number[], postMutationAllocation:number[]}} draft
 * @property {number} drawsConsumed
 */

/**
 * Execute exactly one allocation-mutation opportunity following §13.1 exactly.
 * @param {Float64Array} allocationIn normalized post-drift child allocation
 * @param {boolean[]} eligible parental-use-plus-neighbours mask
 * @param {import("./rng.js").Rng} rng
 * @param {Object} config
 * @returns {AllocationMutationResult}
 */
export function allocationMutationOpportunity(allocationIn, eligible, rng, config) {
  const nZones = ZONES.length;
  const allocation = Float64Array.from(allocationIn);

  // 1. Occurrence draw — always consumed.
  const uOccurrence = rng.nextFloat();
  if (!(uOccurrence < config.allocationMutationProbabilityPerChild)) {
    return { occurred: false, recorded: false, allocation, draft: null, drawsConsumed: 1 };
  }

  // Snapshot pre-mutation allocation for the audit record.
  const preMutationAllocation = Array.from(allocation);

  // 2. Target candidates.
  const eps = config.parentalUseEpsilon;
  /** @type {number[]} */
  const lowShareTargets = [];
  for (let z = 0; z < nZones; z++) {
    if (eligible[z] && allocation[z] < eps) lowShareTargets.push(z);
  }
  /** @type {number[]} */
  let targetCandidates;
  if (lowShareTargets.length > 0) {
    targetCandidates = lowShareTargets;
  } else {
    targetCandidates = [];
    for (let z = 0; z < nZones; z++) if (eligible[z]) targetCandidates.push(z);
  }
  if (targetCandidates.length === 0) {
    throw new Error("allocationMutationOpportunity: empty target-candidate array (contract violation)");
  }

  // 3. Target draw — always consumed after a successful occurrence.
  const uTarget = rng.nextFloat();
  const targetIndex = Math.min(
    Math.floor(uTarget * targetCandidates.length),
    targetCandidates.length - 1
  );
  const target = targetCandidates[targetIndex];

  // 4. Donor candidates: eligible zones other than target with share > 0.
  /** @type {number[]} */
  const donorCandidates = [];
  /** @type {number[]} */
  const donorWeights = [];
  for (let z = 0; z < nZones; z++) {
    if (eligible[z] && z !== target && allocation[z] > 0) {
      donorCandidates.push(z);
      donorWeights.push(allocation[z]);
    }
  }

  // 5. Donor draw — always consumed after a successful occurrence.
  const uDonor = rng.nextFloat();
  let donor = -1;
  if (donorCandidates.length > 0) {
    let weightSum = 0;
    for (const w of donorWeights) weightSum += w;
    const threshold = uDonor * weightSum;
    let cumulative = 0;
    for (let i = 0; i < donorCandidates.length; i++) {
      cumulative += donorWeights[i];
      if (cumulative > threshold) { donor = donorCandidates[i]; break; }
    }
    // Because uDonor < 1, the final candidate is selected if none earlier exceeded.
    if (donor === -1) donor = donorCandidates[donorCandidates.length - 1];
  }

  // 6. Transfer draw — always consumed after a successful occurrence.
  const uTransfer = rng.nextFloat();
  const requestedTransfer =
    config.allocationMutationTransferMin +
    uTransfer * (config.allocationMutationTransferMax - config.allocationMutationTransferMin);

  // 7. No-donor branch: four draws consumed, no change, no event.
  if (donor === -1) {
    return { occurred: true, recorded: false, allocation, draft: null, drawsConsumed: 4 };
  }

  // 8. Apply transfer.
  const realizedTransfer = Math.min(requestedTransfer, allocation[donor]);
  if (!(realizedTransfer > 0)) {
    return { occurred: true, recorded: false, allocation, draft: null, drawsConsumed: 4 };
  }

  // 9. Subtract from donor, add to target; clamp residue, renormalize.
  allocation[donor] = allocation[donor] - realizedTransfer;
  allocation[target] = allocation[target] + realizedTransfer;
  let sum = 0;
  for (let z = 0; z < nZones; z++) {
    allocation[z] = clamp(allocation[z], 0, 1);
    sum += allocation[z];
  }
  for (let z = 0; z < nZones; z++) allocation[z] = allocation[z] / sum;

  // 10. Record (id assignment + increment happen in the event assembler).
  return {
    occurred: true,
    recorded: true,
    allocation,
    draft: {
      fromZone: ZONES[donor],
      toZone: ZONES[target],
      requestedTransfer,
      realizedTransfer,
      preMutationAllocation,
      postMutationAllocation: Array.from(allocation),
    },
    drawsConsumed: 4,
  };
}
