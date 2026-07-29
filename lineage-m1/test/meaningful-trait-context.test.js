// @ts-check
/**
 * Contract §9 / §20.5 — deterministic meaningful-trait contextual gate.
 *
 * Build-blocking. Uses ONE frozen probe context. No more favourable genome,
 * allocation, load, or age may be substituted. The floors are authored product
 * gates and may not be weakened after results are seen.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { survivalProbability } from "../src/core/survival.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { TRAITS, MEANINGFUL_TRAIT_INDICES } from "../src/config/traits.js";
import { ZONES } from "../src/config/zones.js";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { STANDARD_TRAIT_TEST_GENOME, STANDARD_ZONE_LOADS } from "../src/fixtures/definingFixtureV1.js";

// ---- frozen §9 probe constants ----
const standardTraitTestGenome = [0.15, 0.45, 0.40, 0.45, 0.40, 0.40, 0.35, 0.50, 0.50, 0.50];
const standardTraitTestZoneLoads = [39.84, 40.32, 39.84];
const standardTraitTestAllocations = [
  [1.0, 0.0, 0.0], // canopy
  [0.0, 1.0, 0.0], // forestFloor
  [0.0, 0.0, 1.0], // shoreline
];
const standardTraitTestAgeGenerations = 1;
const standardTraitTestAgeMultiplier = 1.0;
const traitTestLowValue = 0.2;
const traitTestHighValue = 0.8;
const meaningfulBenefitFloor = 0.01;
const meaningfulCostFloor = 0.01;
const neutralEquivalenceMargin = 0.001;
const traitGateArithmeticTolerance = 1e-12;

test("§20.5 — fixture baseline genome and standard loads exactly match the frozen §9 values", () => {
  const { envelope } = loadValidatedFixture();
  assert.deepEqual(envelope.baselineBodyGenome, standardTraitTestGenome);
  assert.deepEqual(Array.from(STANDARD_TRAIT_TEST_GENOME), standardTraitTestGenome);
  assert.deepEqual(
    [STANDARD_ZONE_LOADS.canopy, STANDARD_ZONE_LOADS.forest_floor, STANDARD_ZONE_LOADS.shoreline],
    standardTraitTestZoneLoads
  );
  assert.deepEqual(
    [envelope.standardZoneLoads.canopy, envelope.standardZoneLoads.forest_floor, envelope.standardZoneLoads.shoreline],
    standardTraitTestZoneLoads
  );
});

test("§9 — the frozen probe uses age 1 with age multiplier 1.0", () => {
  assert.equal(
    currentModelConfig.ageSurvivalMultiplier[standardTraitTestAgeGenerations],
    standardTraitTestAgeMultiplier
  );
});

/**
 * Production-path survival for the frozen probe.
 * @param {number[]} genome
 * @param {number[]} allocation
 */
function probeSurvival(genome, allocation) {
  return survivalProbability(
    {
      bodyGenome: genome,
      timeAllocation: allocation,
      ageGenerations: standardTraitTestAgeGenerations,
    },
    standardTraitTestZoneLoads,
    currentModelConfig
  ).pSurvival;
}

/**
 * Exact three-zone delta vector for one trait.
 * @param {number} traitIndex
 * @returns {number[]}
 */
function traitDeltas(traitIndex) {
  const low = standardTraitTestGenome.slice();
  const high = standardTraitTestGenome.slice();
  low[traitIndex] = traitTestLowValue;
  high[traitIndex] = traitTestHighValue;
  return standardTraitTestAllocations.map(
    (alloc) => probeSurvival(high, alloc) - probeSurvival(low, alloc)
  );
}

test("§9/§20.5 — every meaningful trait has a positive context and a different adverse-or-inactive context", () => {
  const emitted = [];
  const failures = [];

  for (const t of MEANINGFUL_TRAIT_INDICES) {
    const delta = traitDeltas(t);
    emitted.push(`${TRAITS[t]}: [${delta.map((d) => d.toFixed(6)).join(", ")}]`);

    const positiveZones = [];
    const adverseOrInactiveZones = [];
    for (let z = 0; z < ZONES.length; z++) {
      if (delta[z] >= meaningfulBenefitFloor - traitGateArithmeticTolerance) positiveZones.push(z);
      if (
        delta[z] <= -meaningfulCostFloor + traitGateArithmeticTolerance ||
        Math.abs(delta[z]) <= neutralEquivalenceMargin + traitGateArithmeticTolerance
      ) {
        adverseOrInactiveZones.push(z);
      }
    }
    // Both conditions must hold in DIFFERENT zones.
    const inDifferentZones = positiveZones.some((pz) => adverseOrInactiveZones.some((az) => az !== pz));
    if (positiveZones.length === 0) failures.push(`${TRAITS[t]} has no positive context`);
    else if (!inDifferentZones) {
      failures.push(`${TRAITS[t]} lacks a different adverse-or-inactive zone`);
    }
    // A trait beneficial in every zone, or harmful in every zone, fails.
    const beneficialEverywhere = delta.every((d) => d >= meaningfulBenefitFloor - traitGateArithmeticTolerance);
    const harmfulEverywhere = delta.every((d) => d <= -meaningfulCostFloor + traitGateArithmeticTolerance);
    if (beneficialEverywhere) failures.push(`${TRAITS[t]} is beneficial in every zone (an upgrade, not an adaptation)`);
    if (harmfulEverywhere) failures.push(`${TRAITS[t]} is harmful in every zone`);
  }

  // §20.5 requires emitting the exact three-zone delta vector for each trait.
  console.log("\n  meaningful-trait deltas [canopy, forest_floor, shoreline]:");
  for (const line of emitted) console.log(`    ${line}`);

  assert.deepEqual(failures, [], `meaningful-trait gate failures: ${failures.join("; ")}`);
});

test("§20.5 — deltas are computed from final production-path survival, not an isolated score", () => {
  // Changing a survival-pipeline clamp must change the measured delta, proving
  // the gate rides the production path rather than a bare performance score.
  const t = 0; // toe_webbing
  const before = traitDeltas(t);
  const narrowed = { ...currentModelConfig, maxZoneSurvival: 0.2 };
  const low = standardTraitTestGenome.slice();
  const high = standardTraitTestGenome.slice();
  low[t] = traitTestLowValue;
  high[t] = traitTestHighValue;
  const alloc = standardTraitTestAllocations[2];
  const narrowedDelta =
    survivalProbability({ bodyGenome: high, timeAllocation: alloc, ageGenerations: 1 }, standardTraitTestZoneLoads, narrowed).pSurvival -
    survivalProbability({ bodyGenome: low, timeAllocation: alloc, ageGenerations: 1 }, standardTraitTestZoneLoads, narrowed).pSurvival;
  assert.notEqual(narrowedDelta, before[2]);
});

test("§9 — toe_webbing is adverse in canopy and beneficial at the shoreline", () => {
  const delta = traitDeltas(0);
  assert.ok(delta[0] <= -meaningfulCostFloor + traitGateArithmeticTolerance, `canopy delta ${delta[0]} must be adverse`);
  assert.ok(delta[2] >= meaningfulBenefitFloor - traitGateArithmeticTolerance, `shoreline delta ${delta[2]} must be positive`);
});
