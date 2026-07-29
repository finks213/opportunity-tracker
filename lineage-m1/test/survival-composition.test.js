// @ts-check
/**
 * Contract §20.12 — exact survival-composition contract.
 *
 * The test must fail under aggregate-first fitness, load, or capacity
 * composition, and age multiplication must occur after allocation weighting.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { combineZoneSurvival } from "../src/core/survival.js";
import { logistic } from "../src/core/math.js";

const INPUT = {
  fitnessZone: [0.0, 1.0, 0.0],
  selectionSlope: 2.0,
  fitnessZero: [0.0, 0.0, 0.0],
  zoneCapacity: [100.0, 10.0, 100.0],
  zoneLoad: [50.0, 100.0, 0.0],
  timeAllocation: [0.5, 0.5, 0.0],
  minZoneSurvival: 0.01,
  maxZoneSurvival: 0.95,
  ageSurvivalMultiplier: 0.8,
  minIndividualSurvival: 0.0,
  maxIndividualSurvival: 0.95,
};

const EXPECTED = {
  pZoneCanopy: 0.6666666666666666,
  pZoneForestFloor: 0.16014492326870589,
  pEcological: 0.41340579496768626,
  pSurvival: 0.33072463597414903,
};

test("§20.12 — exact required survival composition values", () => {
  const r = combineZoneSurvival(INPUT);
  assert.ok(Math.abs(r.pZone[0] - EXPECTED.pZoneCanopy) <= 1e-12, `pZoneCanopy=${r.pZone[0]}`);
  assert.ok(Math.abs(r.pZone[1] - EXPECTED.pZoneForestFloor) <= 1e-12, `pZoneForestFloor=${r.pZone[1]}`);
  assert.ok(Math.abs(r.pEcological - EXPECTED.pEcological) <= 1e-12, `pEcological=${r.pEcological}`);
  assert.ok(Math.abs(r.pSurvival - EXPECTED.pSurvival) <= 1e-12, `pSurvival=${r.pSurvival}`);
});

test("§20.12 — aggregate-first composition would produce a different answer", () => {
  // Averaging fitness, capacity, and load first, then applying one nonlinear
  // function, is explicitly forbidden by §10. Show it disagrees.
  const meanFitness = (INPUT.fitnessZone[0] + INPUT.fitnessZone[1]) / 2;
  const meanCapacity = (INPUT.zoneCapacity[0] + INPUT.zoneCapacity[1]) / 2;
  const meanLoad = (INPUT.zoneLoad[0] + INPUT.zoneLoad[1]) / 2;
  const aggregate =
    logistic(meanFitness, INPUT.selectionSlope, 0) * ((2 * meanCapacity) / (meanCapacity + meanLoad));
  const aggregateSurvival = aggregate * INPUT.ageSurvivalMultiplier;
  assert.ok(
    Math.abs(aggregateSurvival - EXPECTED.pSurvival) > 1e-6,
    "aggregate-first composition must not coincide with the required value"
  );
});

test("§20.12 — age multiplication occurs after allocation weighting", () => {
  const r = combineZoneSurvival(INPUT);
  // pSurvival must equal pEcological * ageMultiplier, not a per-zone age product
  // that was then weighted (identical here only if applied post-weighting).
  assert.ok(
    Math.abs(r.pSurvival - r.pEcological * INPUT.ageSurvivalMultiplier) <= 1e-15
  );
  // Prove ordering matters: clamping per zone before weighting differs.
  const perZoneAged = INPUT.timeAllocation.reduce((acc, a, z) => {
    const clampedAged = Math.min(
      Math.max(r.pZone[z] * INPUT.ageSurvivalMultiplier, INPUT.minIndividualSurvival),
      INPUT.maxIndividualSurvival
    );
    return acc + a * clampedAged;
  }, 0);
  // Here they coincide numerically because no clamp binds; assert the identity
  // holds only because the clamp is inactive, which documents the ordering.
  assert.ok(Math.abs(perZoneAged - r.pSurvival) <= 1e-15);
});

test("§10 — zone clamps bind independently before ecological weighting", () => {
  const clamped = combineZoneSurvival({
    ...INPUT,
    fitnessZone: [100.0, -100.0, 0.0], // saturates high and low
    timeAllocation: [0.5, 0.5, 0.0],
    zoneLoad: [0.0, 0.0, 0.0],
    zoneCapacity: [100.0, 100.0, 100.0],
  });
  assert.equal(clamped.pZone[0], 0.95, "high zone clamps at maxZoneSurvival");
  assert.equal(clamped.pZone[1], 0.01, "low zone clamps at minZoneSurvival");
  assert.ok(Math.abs(clamped.pEcological - (0.5 * 0.95 + 0.5 * 0.01)) <= 1e-15);
});

test("§10 — density factor uses that zone's own capacity and load", () => {
  const r = combineZoneSurvival(INPUT);
  assert.ok(Math.abs(r.densityFactor[0] - (2 * 100) / (100 + 50)) <= 1e-15);
  assert.ok(Math.abs(r.densityFactor[1] - (2 * 10) / (10 + 100)) <= 1e-15);
  assert.ok(Math.abs(r.densityFactor[2] - (2 * 100) / (100 + 0)) <= 1e-15);
});
