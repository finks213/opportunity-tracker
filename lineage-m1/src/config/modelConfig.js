// @ts-check
/**
 * Versioned Milestone 1 model configuration.
 *
 * Every tuning constant lives here. Changing any of them requires a recorded
 * decision in DECISIONS.md, a bumped `version`, and a full rerun of invariants
 * and characterization (contract §21.7). The version string is copied into
 * canonical biological state as `configVersion` at hydration/initialization.
 *
 * The zone-weight vectors are in canonical performance-dimension order:
 *   [canopy_grip, land_mobility, aquatic_propulsion, aquatic_drag_reduction,
 *    thermal_retention, visual_sensing, energy_efficiency]
 * and zone rows are in canonical zone order [canopy, forest_floor, shoreline].
 */

import { deepFreeze, deepClonePlain, buildModelDefinition } from "./modelDefinition.js";
import { canonicalModelDefinitionText, modelIdentityDigest } from "./modelIdentity.js";

/**
 * Canonical biological state schema.
 *
 * Bumped to `-2` in revision 5 (R5-3 / BUG 4). Revision 4 added the mandatory
 * `modelIdentityHash` field but kept schema `-1`, the same label used before the
 * field existed, and guarded it only when present. A `-1` state with the field
 * deleted therefore advanced under an arbitrary same-version model. The bump
 * makes "carries a complete model identity" part of the schema contract, so an
 * older state is rejected by version rather than silently accepted.
 */
export const SCHEMA_VERSION = "lineage-biological-state-2";

export const currentModelConfig = deepFreeze({
  // config-1 used the contract's provisional zoneCapacity [90,90,90]; that
  // value cannot satisfy the §21.4 guardrail medianTotalPopulation <= 360
  // (measured median 418). config-2 lowers capacity to [55,55,55]. See
  // DECISIONS.md D-009 and the side-by-side characterization required by §21.7.
  version: "lineage-m1-config-2",

  // ---- world ----
  startingPopulation: 120,
  zoneCapacity: [55, 55, 55],

  // ---- founder allocation band centroids (contract §7, frozen) ----
  canopyHeavy: [0.985, 0.014, 0.001],
  forestFloorHeavy: [0.010, 0.980, 0.010],
  shorelineHeavy: [0.001, 0.014, 0.985],

  // ---- random-world body-genome initialization (§7) ----
  // One shared ancestor vector plus small seeded variation. This equals the
  // frozen fixture baseline genome so random worlds sit near the defining world.
  ancestorBodyGenome: [0.15, 0.45, 0.40, 0.45, 0.40, 0.40, 0.35, 0.50, 0.50, 0.50],
  founderGenomeSpread: 0.05,
  // Founder ages sampled deterministically from [0,1,2] (§7). Documented
  // distribution: by id modulo 3 -> {0,1,2} in equal thirds. Note the frozen
  // fixture carries its own baked founder ages {1,2,3} and is NOT re-aged.
  founderAgeValues: [0, 1, 2],

  // ---- performance -> zone fitness (§9, §10) ----
  // Zone weight rows in canonical dimension order.
  zoneWeights: [
    // cg    lm    wp    dr    th    vs    ee
    [1.6, 0.8, 0.0, 0.0, 0.3, 0.5, 0.5], // canopy
    [0.3, 1.4, 0.1, 0.0, 0.6, 1.0, 0.5], // forest_floor
    [0.0, 0.3, 1.5, 1.2, 0.4, 0.0, 0.5], // shoreline (sight degraded: vs weight 0)
  ],
  // Zone scarcity: how harshly flat upkeep is punished (§10 step 3).
  zoneScarcity: [1.0, 1.0, 1.0],
  // Logistic selection (§10). fitnessZero is centered on the ancestor genome's
  // in-zone fitness (computed from zoneWeights above) so founders sit at
  // pFit≈0.5 in their own zone and density lifts survival above that at low
  // load. Recompute if zoneWeights/EFFECT/UPKEEP change.
  selectionSlope: 1.2,
  fitnessZero: [0.606250, 1.289750, 0.139250],

  // ---- survival clamps and age curve (§10) ----
  minZoneSurvival: 0.01,
  maxZoneSurvival: 0.95,
  minIndividualSurvival: 0.0,
  maxIndividualSurvival: 0.95,
  ageSurvivalMultiplier: [1.0, 1.0, 1.0, 0.95, 0.80, 0.50, 0.0],

  // ---- mating (§11 steps 5-8) ----
  matingOverlapExponent: 2,
  minimumMatingOverlap: 0.02,
  offspringPerPair: 2,

  // ---- body inheritance and mutation (§12) ----
  bodyDriftScale: 0.08,
  bodyMutationProbabilityPerChild: 0.20,
  bodyMutationMagnitudeMin: 0.12,
  bodyMutationMagnitudeMax: 0.35,

  // ---- allocation inheritance and mutation (§13) ----
  parentalUseEpsilon: 0.02,
  allocationDriftScale: 0.05,
  allocationMutationProbabilityPerChild: 0.08,
  allocationMutationTransferMin: 0.03,
  allocationMutationTransferMax: 0.12,

  // ---- genealogy retention (§15) ----
  genealogyRetentionWindow: 360,
});

/**
 * Superseded configuration exactly as authored under the contract's provisional
 * zone capacities. Retained so §21.7's required side-by-side comparison can be
 * reproduced from a clean run. Not used by production code paths.
 */
export const legacyModelConfigV1 = deepFreeze({
  // deepClonePlain, not object spread: a spread copies nested ARRAY REFERENCES,
  // so revision 2 had config-1 and config-2 sharing zoneWeights,
  // ancestorBodyGenome, and others. Mutating one would have silently changed
  // both without either version string moving.
  ...deepClonePlain(currentModelConfig),
  version: "lineage-m1-config-1",
  zoneCapacity: [90, 90, 90],
});

/**
 * Deterministic founder age from an id (§7 documented distribution).
 * Uses the SUPPLIED configuration, never a module-global one.
 * @param {number} id 1-based individual id
 * @param {Object} [config]
 * @returns {number}
 */
export function founderAgeForId(id, config = currentModelConfig) {
  // Revision-3 repair: this previously read currentModelConfig unconditionally,
  // so a caller supplying founderAgeValues: [2] still produced ages 0,1,2.
  const vals = config.founderAgeValues;
  return vals[(id - 1) % vals.length];
}

/**
 * The COMPLETE canonical model definition for a configuration (revision-3).
 *
 * This is the only correct hash input for evidence provenance: it includes the
 * trait-effect matrix, upkeep costs, zone adjacency, and orderings that
 * `currentModelConfig` alone does not contain. Hashing the tuning config by
 * itself let a mutated trait effect change survival while the reported hash
 * stayed constant.
 *
 * @param {Object} [config]
 * @returns {Object}
 */
export function modelDefinitionFor(config = currentModelConfig) {
  return deepFreeze(buildModelDefinition(config));
}

export { deepFreeze, deepClonePlain };

/**
 * The runtime identity of a configuration's COMPLETE biological model.
 *
 * Revision-4 repair: canonical state now stores this alongside `configVersion`
 * and every transition requires both to match. Revision 3 compared only the
 * version string, so a modified model reusing `lineage-m1-config-2` was accepted
 * — capacities [90,90,90] under that version produced a different population
 * while both worlds kept the same canonical label.
 *
 * @param {Object} [config]
 * @returns {string} 32-hex-character digest of the complete model definition
 */
export function modelIdentityFor(config = currentModelConfig) {
  return modelIdentityDigest(canonicalModelDefinitionText(modelDefinitionFor(config)));
}

/**
 * Canonical text of a model definition — re-exported from `modelIdentity.js`,
 * which is the single authoritative implementation (revision-5 R5-4). Revision 4
 * defined this text here AND in `canonicalSerialize.js`, and a third
 * `JSON.stringify` path leaked into the §9 trait evidence.
 * @param {Object} definition
 * @returns {string}
 */
export function canonicalModelText(definition) {
  return canonicalModelDefinitionText(definition);
}

export { modelIdentityDigest };
