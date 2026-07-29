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

export const SCHEMA_VERSION = "lineage-biological-state-1";

export const currentModelConfig = Object.freeze({
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
export const legacyModelConfigV1 = Object.freeze({
  ...currentModelConfig,
  version: "lineage-m1-config-1",
  zoneCapacity: [90, 90, 90],
});

/**
 * Deterministic founder age from an id (§7 documented distribution).
 * @param {number} id 1-based individual id
 * @returns {number} 0, 1, or 2
 */
export function founderAgeForId(id) {
  const vals = currentModelConfig.founderAgeValues;
  return vals[(id - 1) % vals.length];
}
