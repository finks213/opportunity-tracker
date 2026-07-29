// @ts-check
/**
 * Loader / validator for the frozen defining fixture (contract §19).
 *
 * This module does NOT define a second competing fixture: it loads, validates,
 * and hydrates the checked-in fixtures/defining_fixture_v1.json envelope. The
 * fixture is a fixture ENVELOPE (biological gen-0 data plus experiment
 * metadata), not a canonical biological serialization.
 *
 * Isomorphic (no node:fs / node:crypto here). Raw-byte hashing and disk IO live
 * in nodeFixtureIO.js so the browser probe can import this module directly.
 */

import { makeIndividual, makeEmptyState } from "../core/individual.js";
import { createSimRng } from "../core/rng.js";
import { computeZoneLoads } from "../core/survival.js";
import { currentModelConfig, SCHEMA_VERSION } from "../config/modelConfig.js";
import { ZONES } from "../config/zones.js";
import { TRAIT_INDEX } from "../config/traits.js";

/** Required raw SHA-256 of the checked-in fixture file (§19 A). */
export const EXPECTED_FIXTURE_SHA256 =
  "c80aaa523d3b3eec2655502b4eaebdbbb4d12f71f8b3378d9d3be60797342b78";

/** Frozen §9 standard probe genome and loads (must equal fixture values). */
export const STANDARD_TRAIT_TEST_GENOME = Object.freeze([
  0.15, 0.45, 0.4, 0.45, 0.4, 0.4, 0.35, 0.5, 0.5, 0.5,
]);
export const STANDARD_ZONE_LOADS = Object.freeze({
  canopy: 39.84,
  forest_floor: 40.32,
  shoreline: 39.84,
});

/**
 * Parse the raw fixture text into an envelope object.
 * @param {string} text
 * @returns {Object}
 */
export function parseEnvelope(text) {
  return JSON.parse(text);
}

/**
 * Validate that the parsed envelope is internally consistent with the frozen
 * §9 / §19 declarations. Throws on any violation.
 * @param {Object} env
 * @returns {{recomputedLoads:number[]}}
 */
export function assertFixtureConsistency(env) {
  if (env.fixtureSchemaVersion !== "lineage-defining-fixture-1") {
    throw new Error(`fixture: unexpected fixtureSchemaVersion ${env.fixtureSchemaVersion}`);
  }
  // baseline genome must equal the frozen §9 standard genome.
  if (env.baselineBodyGenome.length !== STANDARD_TRAIT_TEST_GENOME.length) {
    throw new Error("fixture: baselineBodyGenome length mismatch");
  }
  for (let i = 0; i < STANDARD_TRAIT_TEST_GENOME.length; i++) {
    if (env.baselineBodyGenome[i] !== STANDARD_TRAIT_TEST_GENOME[i]) {
      throw new Error(`fixture: baselineBodyGenome[${i}] != standard §9 genome`);
    }
  }
  // standardZoneLoads must equal the frozen declaration exactly.
  for (const z of ZONES) {
    if (env.standardZoneLoads[z] !== STANDARD_ZONE_LOADS[z]) {
      throw new Error(`fixture: standardZoneLoads.${z} mismatch`);
    }
  }
  // Recompute zone loads from the population and require agreement within 1e-12.
  const recomputedLoads = computeZoneLoads(env.currentIndividuals, ZONES.length);
  const declared = [STANDARD_ZONE_LOADS.canopy, STANDARD_ZONE_LOADS.forest_floor, STANDARD_ZONE_LOADS.shoreline];
  for (let z = 0; z < ZONES.length; z++) {
    if (Math.abs(recomputedLoads[z] - declared[z]) > 1e-12) {
      throw new Error(`fixture: recomputed zone load ${ZONES[z]}=${recomputedLoads[z]} differs from ${declared[z]} by > 1e-12`);
    }
  }
  if (env.currentIndividuals.length !== 120) {
    throw new Error("fixture: populationSize must be 120");
  }
  return { recomputedLoads };
}

/**
 * Deterministic hydration (§19 C): envelope + trajectorySeed -> biological state.
 * Copies only biological state fields and counters; excludes fixture-only
 * metadata; initializes simRng only through createSimRng(trajectorySeed).
 * @param {Object} env
 * @param {number} trajectorySeed
 * @param {Object} [config]
 * @returns {Object} biological state
 */
export function hydrateDefiningFixtureV1(env, trajectorySeed, config = currentModelConfig) {
  const state = makeEmptyState(createSimRng(trajectorySeed));
  state.schemaVersion = SCHEMA_VERSION;
  state.configVersion = config.version;
  state.generation = env.generation;
  state.nextIndividualId = env.nextIndividualId;
  state.nextBirthEventId = env.nextBirthEventId;
  state.nextMatingEventId = env.nextMatingEventId;
  state.nextMutationEventId = env.nextMutationEventId;
  state.nextAllocationMutationEventId = env.nextAllocationMutationEventId;
  state.currentIndividuals = env.currentIndividuals.map((i) =>
    makeIndividual({
      id: i.id,
      parentIds: i.parentIds,
      birthGeneration: i.birthGeneration,
      ageGenerations: i.ageGenerations,
      bodyGenome: i.bodyGenome,
      timeAllocation: i.timeAllocation,
      birthEventId: i.birthEventId,
    })
  );
  state.birthEvents = env.birthEvents.map((b) => ({ ...b }));
  state.retainedGenealogy = env.birthEvents.map((b) => ({ ...b }));
  state.deathEvents = env.deathEvents.map((e) => ({ ...e }));
  state.biologicalMatingEvents = env.biologicalMatingEvents.map((e) => ({ ...e }));
  state.bodyMutationEvents = env.bodyMutationEvents.map((e) => ({ ...e }));
  state.allocationMutationEvents = env.allocationMutationEvents.map((e) => ({ ...e }));
  state.prunedAncestorBoundaries = env.prunedAncestorBoundaries.map((e) => ({ ...e }));
  return state;
}

/**
 * Apply the fixture toe_webbing construction override (§19.2/D) to a hydrated
 * state, in place. This is a construction operation before generation 1, NOT a
 * mutation event. Only the twelve specified toe_webbing values may change.
 * @param {Object} state
 * @param {number[]} focalIds
 * @param {number} webbingValue
 */
export function applyWebbingOverride(state, focalIds, webbingValue) {
  const w = TRAIT_INDEX.toe_webbing;
  const focal = new Set(focalIds);
  for (const ind of state.currentIndividuals) {
    if (focal.has(ind.id)) ind.bodyGenome[w] = webbingValue;
  }
}

/**
 * Build the four fixture worlds for one trajectory seed (§19.2). Each world is
 * an independently hydrated state from the same envelope and seed; the high
 * worlds receive only the declared twelve-value toe_webbing override.
 * @param {Object} env
 * @param {number} trajectorySeed
 * @param {Object} [config]
 * @returns {{canopyLow:Object, canopyHigh:Object, shorelineLow:Object, shorelineHigh:Object}}
 */
export function buildFourWorlds(env, trajectorySeed, config = currentModelConfig) {
  const highWebbing = env.highWebbing;
  const canopyLow = hydrateDefiningFixtureV1(env, trajectorySeed, config);
  const canopyHigh = hydrateDefiningFixtureV1(env, trajectorySeed, config);
  applyWebbingOverride(canopyHigh, env.canopyFocalIds, highWebbing);
  const shorelineLow = hydrateDefiningFixtureV1(env, trajectorySeed, config);
  const shorelineHigh = hydrateDefiningFixtureV1(env, trajectorySeed, config);
  applyWebbingOverride(shorelineHigh, env.shorelineFocalIds, highWebbing);
  return { canopyLow, canopyHigh, shorelineLow, shorelineHigh };
}
