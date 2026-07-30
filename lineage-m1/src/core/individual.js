// @ts-check
/**
 * Biological individual and biological-state construction (contract §5.1, §5.2,
 * §7). Body genome and time allocation are immutable after birth; no observer
 * field is ever stored on a biological individual.
 */

import { Rng, createSimRng } from "./rng.js";
import { currentModelConfig, SCHEMA_VERSION, founderAgeForId, modelIdentityFor } from "../config/modelConfig.js";
import { NUM_TRAITS } from "../config/traits.js";
import { clamp } from "./math.js";

/**
 * @typedef {Object} Individual
 * @property {number} id
 * @property {null|[number,number]} parentIds
 * @property {number} birthGeneration
 * @property {number} ageGenerations
 * @property {Float64Array} bodyGenome        length 10, immutable after birth
 * @property {Float64Array} timeAllocation    length 3, sums to 1, immutable after birth
 * @property {number} birthEventId
 */

/**
 * Create an individual record. Copies array inputs into fresh Float64Arrays so
 * the stored inherited values cannot be mutated through the caller's reference.
 * @param {Object} f
 * @param {number} f.id
 * @param {null|[number,number]} f.parentIds
 * @param {number} f.birthGeneration
 * @param {number} f.ageGenerations
 * @param {ArrayLike<number>} f.bodyGenome
 * @param {ArrayLike<number>} f.timeAllocation
 * @param {number} f.birthEventId
 * @returns {Individual}
 */
export function makeIndividual(f) {
  return {
    id: f.id,
    parentIds: f.parentIds,
    birthGeneration: f.birthGeneration,
    ageGenerations: f.ageGenerations,
    bodyGenome: Float64Array.from(f.bodyGenome),
    timeAllocation: Float64Array.from(f.timeAllocation),
    birthEventId: f.birthEventId,
  };
}

/**
 * Create an empty canonical biological state shell (contract §5.2).
 *
 * `configVersion` records the configuration that actually produced the state,
 * so canonical bytes carry true provenance. Callers running a non-default
 * configuration must pass it here; defaulting silently to the current config
 * would make a legacy-config state falsely claim it was built under the
 * current one.
 *
 * @param {Rng} simRng
 * @param {Object} [config]
 * @returns {Object}
 */
export function makeEmptyState(simRng, config = currentModelConfig) {
  return {
    schemaVersion: SCHEMA_VERSION,
    configVersion: config.version,
    // Runtime identity of the COMPLETE biological model that produced this state
    // (revision-4 repair). Bound at every transition, so a modified model reusing
    // the same version string is rejected rather than silently accepted.
    modelIdentityHash: modelIdentityFor(config),
    generation: 0,
    nextIndividualId: 1,
    nextBirthEventId: 1,
    nextMatingEventId: 1,
    nextMutationEventId: 1,            // body-mutation namespace only
    nextAllocationMutationEventId: 1,  // allocation-mutation namespace only
    currentIndividuals: [],
    retainedGenealogy: [],             // birth-record view retained per §15
    birthEvents: [],
    deathEvents: [],
    biologicalMatingEvents: [],
    bodyMutationEvents: [],
    allocationMutationEvents: [],
    prunedAncestorBoundaries: [],
    simRng,
    // Immutable record of the last completed generation, for post-commit
    // observer processing. Excluded from canonical serialization (§18).
    lastGenerationResult: null,
    // diagnostics excluded from canonical serialization (§18)
    diagnostics: {
      zeroAllocationFallbackCount: 0,
      bodyMutationOpportunityCount: 0,
      allocationMutationOpportunityCount: 0,
      nonFounderBirthCount: 0,
    },
  };
}

/**
 * Build the default random-world starting population (contract §7): 120 animals
 * in three equal allocation bands (40/40/40) with EXACT band centroids and no
 * founder-allocation noise. Body genomes are the shared ancestor vector plus
 * small seeded variation. Founder ages sampled from [0,1,2] by id.
 *
 * This is the random-world initializer used for characterization; the frozen
 * defining fixture is hydrated separately and is NOT produced here.
 *
 * @param {number} trajectorySeed
 * @param {Object} [config]
 * @returns {Object} biological state at generation 0
 */
export function createInitialState(trajectorySeed, config = currentModelConfig) {
  const rng = createSimRng(trajectorySeed);
  const state = makeEmptyState(rng, config);
  const bands = [
    { alloc: config.canopyHeavy, count: 40 },
    { alloc: config.forestFloorHeavy, count: 40 },
    { alloc: config.shorelineHeavy, count: 40 },
  ];
  let id = 1;
  for (const band of bands) {
    for (let k = 0; k < band.count; k++) {
      // Body genome: ancestor + seeded normal spread, clamped to [0,1].
      const genome = new Float64Array(NUM_TRAITS);
      for (let t = 0; t < NUM_TRAITS; t++) {
        genome[t] = clamp(
          config.ancestorBodyGenome[t] + rng.nextNormal() * config.founderGenomeSpread,
          0,
          1
        );
      }
      const birthEventId = state.nextBirthEventId++;
      const ind = makeIndividual({
        id,
        parentIds: null,
        birthGeneration: 0,
        ageGenerations: founderAgeForId(id, config),
        bodyGenome: genome,
        timeAllocation: band.alloc, // exact centroid, no noise (§7)
        birthEventId,
      });
      state.currentIndividuals.push(ind);
      const birth = { id: birthEventId, generation: 0, childId: id, parentIds: null, founder: true };
      state.birthEvents.push(birth);
      state.retainedGenealogy.push({ ...birth });
      state.nextIndividualId = id + 1;
      id++;
    }
  }
  return state;
}
