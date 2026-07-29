// @ts-check
/**
 * The COMPLETE canonical biological model definition (revision-3 repair).
 *
 * Contract §9 requires trait effects to live in versioned configuration, and the
 * reports use `configVersion` plus a `configHash` to identify the model that
 * produced the evidence. Revision 2 hashed only `currentModelConfig`, which
 * excluded `EFFECT`, `UPKEEP`, zone adjacency, and the trait/dimension orders.
 * An auditor mutated `EFFECT[0][0]`, changed production survival from
 * 0.1224 to 0.95, and the reported hash did not move.
 *
 * This module builds one object containing EVERY biology-affecting value, so the
 * hash of that object is a complete model identity. It is the single hash input
 * used by every evidence generator.
 *
 * It also provides `deepFreeze`, because `Object.freeze` is shallow: revision 2
 * left `zoneWeights` and its rows mutable, and config-1 and config-2 shared
 * those same nested array references.
 */

import {
  TRAITS,
  PERFORMANCE_DIMENSIONS,
  EFFECT,
  UPKEEP,
} from "./traits.js";
import { ZONES, ZONE_NEIGHBORS } from "./zones.js";

/**
 * Recursively freeze an object, its arrays, and their elements.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) {
    // Still walk children: a frozen parent may hold unfrozen children.
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

/** Deep structural clone of plain arrays/objects, so nothing is shared. */
export function deepClonePlain(value) {
  if (Array.isArray(value)) return value.map(deepClonePlain);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = deepClonePlain(value[key]);
    return out;
  }
  return value;
}

/**
 * Build the complete model-definition object for a given tuning configuration.
 *
 * Every biology-affecting value the contract names is present:
 * trait order, performance-dimension order, trait-effect matrix, upkeep costs,
 * zone order, adjacency, zone weights, zone capacities, ancestor genome, founder
 * allocation centroids, founder age values, survival constants, lifecycle
 * constants, body-mutation constants, allocation-mutation constants, mating
 * constants, and genealogy constants.
 *
 * @param {Object} config a tuning configuration (currentModelConfig-shaped)
 * @returns {Object} plain, deeply-cloned, hashable model definition
 */
export function buildModelDefinition(config) {
  return deepClonePlain({
    modelDefinitionSchema: "lineage-m1-model-definition-1",
    version: config.version,

    // ---- ordering (load-bearing everywhere) ----
    traitOrder: Array.from(TRAITS),
    performanceDimensionOrder: Array.from(PERFORMANCE_DIMENSIONS),
    zoneOrder: Array.from(ZONES),

    // ---- trait biology (§9) ----
    traitEffectMatrix: EFFECT.map((row) => Array.from(row)),
    upkeepCosts: Array.from(UPKEEP),

    // ---- spatial model (§6) ----
    zoneAdjacency: ZONE_NEIGHBORS.map((n) => Array.from(n)),
    zoneCapacity: Array.from(config.zoneCapacity),
    zoneWeights: config.zoneWeights.map((row) => Array.from(row)),
    zoneScarcity: Array.from(config.zoneScarcity),

    // ---- initial state (§7) ----
    startingPopulation: config.startingPopulation,
    ancestorBodyGenome: Array.from(config.ancestorBodyGenome),
    founderGenomeSpread: config.founderGenomeSpread,
    founderAgeValues: Array.from(config.founderAgeValues),
    canopyHeavy: Array.from(config.canopyHeavy),
    forestFloorHeavy: Array.from(config.forestFloorHeavy),
    shorelineHeavy: Array.from(config.shorelineHeavy),

    // ---- survival (§10) ----
    selectionSlope: config.selectionSlope,
    fitnessZero: Array.from(config.fitnessZero),
    minZoneSurvival: config.minZoneSurvival,
    maxZoneSurvival: config.maxZoneSurvival,
    minIndividualSurvival: config.minIndividualSurvival,
    maxIndividualSurvival: config.maxIndividualSurvival,
    ageSurvivalMultiplier: Array.from(config.ageSurvivalMultiplier),

    // ---- mating and lifecycle (§11) ----
    matingOverlapExponent: config.matingOverlapExponent,
    minimumMatingOverlap: config.minimumMatingOverlap,
    offspringPerPair: config.offspringPerPair,

    // ---- body inheritance and mutation (§12) ----
    bodyDriftScale: config.bodyDriftScale,
    bodyMutationProbabilityPerChild: config.bodyMutationProbabilityPerChild,
    bodyMutationMagnitudeMin: config.bodyMutationMagnitudeMin,
    bodyMutationMagnitudeMax: config.bodyMutationMagnitudeMax,

    // ---- allocation inheritance and mutation (§13) ----
    parentalUseEpsilon: config.parentalUseEpsilon,
    allocationDriftScale: config.allocationDriftScale,
    allocationMutationProbabilityPerChild: config.allocationMutationProbabilityPerChild,
    allocationMutationTransferMin: config.allocationMutationTransferMin,
    allocationMutationTransferMax: config.allocationMutationTransferMax,

    // ---- genealogy (§15) ----
    genealogyRetentionWindow: config.genealogyRetentionWindow,
  });
}
