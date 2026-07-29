// @ts-check
/**
 * One ordinary-median implementation everywhere (revision-3 repair).
 *
 * The generated named-limitation table used `v[Math.floor(0.5 * (n - 1))]`,
 * which selects the LOWER middle observation for an even count. With 500 seeds
 * it reported item 250 instead of averaging items 250 and 251, so the table
 * disagreed with the guardrail medians:
 *
 *   canopy       117.202731  vs  117.223028
 *   forest floor 108.134923  vs  108.182136
 *   shoreline     30.523647  vs   30.529427
 */

import test from "node:test";
import assert from "node:assert/strict";
import { ordinaryMedian } from "../src/core/math.js";
import { renderCharacterization } from "../tools/writeCharacterization.mjs";

test("§19.4/§21.4 — ordinaryMedian averages the two central values for even counts", () => {
  assert.equal(ordinaryMedian([1, 2, 3, 4]), 2.5);
  assert.equal(ordinaryMedian([4, 1, 3, 2]), 2.5, "input order must not matter");
  assert.equal(ordinaryMedian([1, 2]), 1.5);
  assert.equal(ordinaryMedian([10, 20, 30, 40, 50, 60]), 35);
  // The lower-middle bug would return 2, 2, 1, and 30 respectively.
  assert.notEqual(ordinaryMedian([1, 2, 3, 4]), 2);
});

test("ordinaryMedian returns the middle value for odd counts", () => {
  assert.equal(ordinaryMedian([1, 2, 3]), 2);
  assert.equal(ordinaryMedian([5]), 5);
  assert.equal(ordinaryMedian([3, 1, 2]), 2);
  assert.equal(ordinaryMedian([1, 2, 3, 4, 5]), 3);
});

test("ordinaryMedian does not mutate its input and rejects empty input", () => {
  const input = [3, 1, 2];
  ordinaryMedian(input);
  assert.deepEqual(input, [3, 1, 2], "input array must not be reordered");
  assert.throws(() => ordinaryMedian([]), /empty input/);
});

test("ordinaryMedian handles negatives and non-integers", () => {
  assert.equal(ordinaryMedian([-2, -1, 1, 2]), 0);
  assert.equal(ordinaryMedian([0.1, 0.2, 0.3, 0.4]), (0.2 + 0.3) / 2);
  assert.equal(ordinaryMedian([-5, -3, -1]), -3);
});

test("the generated limitation table agrees with the guardrail medians", () => {
  // A synthetic 4-seed batch with an EVEN count, where the lower-middle bug and
  // the ordinary median disagree by construction.
  const zoneLoads = [
    [10, 100, 1],
    [20, 110, 2],
    [30, 120, 3],
    [40, 130, 4],
  ];
  const seeds = zoneLoads.map((load, i) => ({
    seed: i + 1,
    extinct: false,
    population: 100 + i,
    zoneLoad: load,
    concentration: Math.max(...load) / load.reduce((a, b) => a + b, 0),
    zoneBinCounts: [1, 1, 0],
    ageDistribution: {},
    carriers: 0,
    carriersByAge: { age1: 0, age2: 0, age3plus: 0 },
    carrierPrevalence: 0,
    perBin: [0, 1, 2].map(() => ({
      births: 10, bodyMutationOpportunities: 10, bodyMutationEvents: 2,
      positiveWebbingEvents: 1, crossingWebbingEvents: 0,
      survivingCarriersAge1: 0, survivingCarriersAge2: 0, survivingCarriersAge3plus: 0,
      finalLiving: 1, finalCarriers: 0, finalCarrierPrevalence: 0,
    })),
    nonFounderBirthCount: 30,
    bodyMutationOpportunityCount: 30,
    allocationMutationOpportunityCount: 30,
    allocationMutationEvents: 2,
    lowShareTargetTransfers: 1,
    firstCanopyLineageReachesShoreline: 3,
    firstShorelineLineageReachesCanopy: 3,
    zeroAllocationFallbackCount: 0,
    meanBirthsPerGeneration: 1, meanDeathsPerGeneration: 1,
    meanMatingPairsPerGeneration: 1, meanUnmatchedEligiblePerGeneration: 0,
    meanMatingOverlap: 0.5, overlapPercentiles: { p5: 0.3, p50: 0.5, p95: 0.9 },
  }));

  const expectedMedians = [0, 1, 2].map((z) => ordinaryMedian(zoneLoads.map((l) => l[z])));
  // Ordinary medians are 25, 115, 2.5 — the lower-middle bug would give 20, 110, 2.
  assert.deepEqual(expectedMedians, [25, 115, 2.5]);

  const results = {
    contractSection: "21",
    configVersion: "test-config",
    modelDefinitionHash: "deadbeef",
    tuningConfigHash: "cafebabe",
    declaredSeedRange: { start: 1, endInclusive: 4 },
    declaredGenerations: 180,
    guardrails: {
      extinctionRate: 0, extinctionRatePass: true,
      medianPopulation: ordinaryMedian(seeds.map((s) => s.population)),
      medianPopulationPass: true,
      medianZoneLoads: expectedMedians,
      medianZoneLoadsPass: false,
      medianConcentration: ordinaryMedian(seeds.map((s) => s.concentration)),
      medianConcentrationPass: true,
      concentrationIncludedSeedCount: 4,
      allPass: false,
    },
    mutationSupply: [0, 1, 2].map((z) => ({
      zone: ["canopy", "forest_floor", "shoreline"][z],
      births: 40, bodyMutationOpportunities: 40, bodyMutationEvents: 8,
      positiveWebbingEvents: 4, crossingWebbingEvents: 0,
      bodyMutationEventsPerBirth: 0.2, positiveWebbingEventsPerBirth: 0.1,
      survivingCarriersAge1: 0, survivingCarriersAge2: 0, survivingCarriersAge3plus: 0,
      finalLiving: 4, finalCarriers: 0, finalCarrierPrevalence: 0,
      medianSeedCarrierPrevalence: 0, seedsWithAnyLivingInBin: 4,
    })),
    minimalFunctionality: { canopyPositiveWebbingEvent: true, shorelinePositiveWebbingEvent: true, allPass: true },
    carrierSummary: { medianCarrierPrevalence: 0, carriersAge1: 0, carriersAge2: 0, carriersAge3plus: 0 },
    traitEffects: { meaningful: {}, neutral: {}, note: "synthetic" },
    lifecycle: {
      meanBirthsPerGeneration: 1, meanDeathsPerGeneration: 1,
      meanMatingPairsPerGeneration: 1, meanUnmatchedEligiblePerGeneration: 0,
      meanMatingOverlap: 0.5, overlapP5: 0.3, overlapP95: 0.9,
      medianZoneBinCounts: [1, 1, 0],
      allocationMutationEventsPerNonFounderBirth: 0.07,
      lowShareTargetTransfers: 4,
      canopyLineageReachesShoreline: { seedsReaching: 4, ofSeeds: 4, medianFirstGeneration: 3, earliestGeneration: 3 },
      shorelineLineageReachesCanopy: { seedsReaching: 4, ofSeeds: 4, medianFirstGeneration: 3, earliestGeneration: 3 },
      totalZeroAllocationFallbacks: 0,
    },
    opportunityIdentityHolds: true,
    concentrationValues: seeds.map((s) => s.concentration),
    seeds,
  };

  const md = renderCharacterization(results, null);

  // The guardrail table and the limitation table must print the SAME medians.
  for (const m of expectedMedians) {
    const printed = m.toFixed(2);
    const occurrences = md.split(printed).length - 1;
    assert.ok(
      occurrences >= 2,
      `median ${printed} should appear in both the guardrail and limitation tables (found ${occurrences})`
    );
  }
  // And the lower-middle values must NOT appear as a median anywhere.
  for (const wrong of ["20.00", "110.00", "2.00"]) {
    const line = md.split("\n").find((l) => l.includes("median effective load") && l.includes(wrong));
    assert.equal(line, undefined, `lower-middle value ${wrong} must not be reported as a median`);
  }
});
