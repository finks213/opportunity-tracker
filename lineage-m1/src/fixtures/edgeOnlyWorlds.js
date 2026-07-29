// @ts-check
/**
 * Edge-only adjacency-traversal worlds (revision-3 repair).
 *
 * `CHARACTERIZATION_PLAN.md` §5 declares traversal as the first generation at
 * which a descendant reaches the opposite edge zone **in a world descended only
 * from canopy-heavy founders**, and symmetrically for shoreline-heavy founders.
 *
 * Revision 2 measured something else: it built the ordinary mixed 120-founder
 * world and filtered by an ancestry bitmask. The other 80 founders remained
 * ecologically active, so they still altered zone loads, density factors,
 * survival probabilities, mating-candidate availability, mating order, and
 * population dynamics. A lineage that stays genetically single-band is not
 * ecologically isolated. Two auditors independently confirmed the substitution,
 * and an edge-only counterfactual produced different results (500/500 rather
 * than 495/500 and 499/500).
 *
 * This module builds the declared experiment literally: a world containing ONLY
 * the 40 founders of one edge band.
 *
 * FROZEN INITIALIZER — every choice below is fixed and documented so the
 * experiment is reproducible and auditable:
 *
 *  - retained founder ids: canopy = 1..40, shoreline = 81..120 (the original
 *    ids from the mixed initializer are PRESERVED, not renumbered, so band
 *    membership stays legible in the records);
 *  - founder body genomes: produced by the same per-founder draw sequence as
 *    the mixed initializer, so a retained founder has the genome it would have
 *    had in the mixed world at the same seed;
 *  - founder allocations: the exact band centroid, no noise (§7);
 *  - founder ages: `founderAgeForId(id, config)`, i.e. the same age that id
 *    would have had in the mixed world;
 *  - founder birth events: one per retained founder, generation 0,
 *    `founder: true`, `birthEventId === id`;
 *  - starting population: 40;
 *  - `nextIndividualId` and `nextBirthEventId`: 121, i.e. past every retained
 *    id, so no id is ever reused and ids remain globally unique;
 *  - all event counters start at 1;
 *  - `simRngState`: `createSimRng(seed)` advanced by exactly the draws the mixed
 *    initializer would have consumed for all 120 founders (10 normals each),
 *    so the post-initialization RNG state matches the mixed world at the same
 *    seed and the two experiments are RNG-comparable;
 *  - zone capacities: UNCHANGED from the configuration. The zones still exist;
 *    only the founding population differs. Rescaling capacity would change the
 *    density regime and make the comparison meaningless;
 *  - duration and extinction handling: identical to the declared batch — run to
 *    the requested generation count, stopping early on extinction;
 *  - meaningful-use threshold: `config.parentalUseEpsilon`.
 */

import { makeEmptyState, makeIndividual } from "../core/individual.js";
import { createSimRng } from "../core/rng.js";
import { currentModelConfig, founderAgeForId } from "../config/modelConfig.js";
import { NUM_TRAITS } from "../config/traits.js";
import { clamp } from "../core/math.js";
import { ZONE_INDEX } from "../config/zones.js";

/** Frozen declaration of the two edge-only experiments. */
export const EDGE_ONLY_EXPERIMENTS = Object.freeze({
  canopyOnly: Object.freeze({
    name: "canopyOnly",
    founderIdStart: 1,
    founderIdEndInclusive: 40,
    bandKey: "canopyHeavy",
    /** The opposite edge zone this world must reach to count as traversal. */
    targetZoneIndex: ZONE_INDEX.shoreline,
    targetZoneName: "shoreline",
  }),
  shorelineOnly: Object.freeze({
    name: "shorelineOnly",
    founderIdStart: 81,
    founderIdEndInclusive: 120,
    bandKey: "shorelineHeavy",
    targetZoneIndex: ZONE_INDEX.canopy,
    targetZoneName: "canopy",
  }),
});

/** Total founders in the mixed initializer, used to match RNG consumption. */
const MIXED_FOUNDER_COUNT = 120;

/**
 * Build an isolated single-band world containing only that band's 40 founders.
 *
 * @param {{founderIdStart:number, founderIdEndInclusive:number, bandKey:string}} experiment
 * @param {number} trajectorySeed
 * @param {Object} [config]
 * @returns {Object} biological state at generation 0
 */
export function createEdgeOnlyState(experiment, trajectorySeed, config = currentModelConfig) {
  const rng = createSimRng(trajectorySeed);
  const state = makeEmptyState(rng, config);
  const bandAllocation = config[experiment.bandKey];

  // Walk the SAME per-founder draw sequence the mixed initializer uses, so a
  // retained founder gets the genome it would have had at this seed, and the
  // post-initialization RNG state matches the mixed world exactly.
  for (let id = 1; id <= MIXED_FOUNDER_COUNT; id++) {
    const genome = new Float64Array(NUM_TRAITS);
    for (let t = 0; t < NUM_TRAITS; t++) {
      genome[t] = clamp(
        config.ancestorBodyGenome[t] + rng.nextNormal() * config.founderGenomeSpread,
        0,
        1
      );
    }
    if (id < experiment.founderIdStart || id > experiment.founderIdEndInclusive) {
      continue; // draws consumed, founder not retained
    }
    const ind = makeIndividual({
      id,
      parentIds: null,
      birthGeneration: 0,
      ageGenerations: founderAgeForId(id, config),
      bodyGenome: genome,
      timeAllocation: bandAllocation, // exact centroid, no noise (§7)
      birthEventId: id,
    });
    state.currentIndividuals.push(ind);
    const birth = { id, generation: 0, childId: id, parentIds: null, founder: true };
    state.birthEvents.push(birth);
    state.retainedGenealogy.push({ ...birth });
  }

  // Past every retained id, so ids are never reused.
  state.nextIndividualId = MIXED_FOUNDER_COUNT + 1;
  state.nextBirthEventId = MIXED_FOUNDER_COUNT + 1;
  return state;
}

/**
 * Frozen declaration record for the audit report.
 * @param {Object} [config]
 */
export function edgeOnlyDeclaration(config = currentModelConfig) {
  return {
    schema: "lineage-m1-edge-only-experiment-1",
    rationale:
      "CHARACTERIZATION_PLAN.md declares traversal in a world descended only from one edge band. " +
      "Revision 2 measured an ancestry subset inside the mixed 120-founder world, which is a different ecological system.",
    experiments: {
      canopyOnly: {
        retainedFounderIds: "1..40",
        bandAllocation: Array.from(config.canopyHeavy),
        targetZone: "shoreline",
      },
      shorelineOnly: {
        retainedFounderIds: "81..120",
        bandAllocation: Array.from(config.shorelineHeavy),
        targetZone: "canopy",
      },
    },
    startingPopulation: 40,
    founderIdsPreserved: true,
    nextIndividualId: MIXED_FOUNDER_COUNT + 1,
    nextBirthEventId: MIXED_FOUNDER_COUNT + 1,
    eventCountersStartAt: 1,
    rngInitialization:
      "createSimRng(seed), then advanced by the exact per-founder draws the mixed initializer consumes for all 120 founders (10 normals each), so post-initialization RNG state matches the mixed world at the same seed.",
    capacityTreatment: `unchanged from configuration: [${config.zoneCapacity.join(", ")}]`,
    extinctionHandling: "run stops early if the world becomes extinct; the seed is reported as extinct",
    meaningfulUseThreshold: config.parentalUseEpsilon,
  };
}
