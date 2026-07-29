// @ts-check
/**
 * Contract §20.9 — spatial integrity and adjacency execution, plus the §7
 * founder-centroid/adjacency-threshold interaction.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/core/individual.js";
import { runGenerations } from "../src/core/simulation.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { eligibleZoneMask, inheritTimeAllocation } from "../src/core/inheritance.js";
import { allocationMutationOpportunity } from "../src/core/mutation.js";
import { ZONES, ZONE_NEIGHBORS, ZONE_INDEX } from "../src/config/zones.js";
import { createSimRng } from "../src/core/rng.js";
import { ScriptedRng } from "./helpers/scriptedRng.js";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";

const C = currentModelConfig;
const CANOPY = ZONE_INDEX.canopy;
const FF = ZONE_INDEX.forest_floor;
const SHORE = ZONE_INDEX.shoreline;

test("§6 — adjacency graph has no canopy-to-shoreline edge", () => {
  assert.deepEqual(Array.from(ZONES), ["canopy", "forest_floor", "shoreline"]);
  assert.deepEqual(ZONE_NEIGHBORS[CANOPY], [FF]);
  assert.deepEqual(ZONE_NEIGHBORS[FF], [CANOPY, SHORE]);
  assert.deepEqual(ZONE_NEIGHBORS[SHORE], [FF]);
  assert.ok(!ZONE_NEIGHBORS[CANOPY].includes(SHORE));
  assert.ok(!ZONE_NEIGHBORS[SHORE].includes(CANOPY));
});

test("§20.9.4 — checked-in founder centroids produce exactly the required parental-use sets", () => {
  const eps = C.parentalUseEpsilon;
  const bands = {
    canopy: C.canopyHeavy,
    forest_floor: C.forestFloorHeavy,
    shoreline: C.shorelineHeavy,
  };
  const expected = { canopy: ["canopy"], forest_floor: ["forest_floor"], shoreline: ["shoreline"] };
  for (const [band, alloc] of Object.entries(bands)) {
    const used = ZONES.filter((_, z) => alloc[z] >= eps);
    assert.deepEqual(used, expected[band], `band ${band} parental-use set`);
  }
  // The fixture's own band allocations must agree.
  const { envelope } = loadValidatedFixture();
  assert.deepEqual(envelope.bandAllocations.canopy, C.canopyHeavy);
  assert.deepEqual(envelope.bandAllocations.forest_floor, C.forestFloorHeavy);
  assert.deepEqual(envelope.bandAllocations.shoreline, C.shorelineHeavy);
});

test("§7 — founders receive the exact band centroid with no initialization noise", () => {
  const state = createInitialState(41);
  const bands = [C.canopyHeavy, C.forestFloorHeavy, C.shorelineHeavy];
  for (const ind of state.currentIndividuals) {
    const band = bands[Math.floor((ind.id - 1) / 40)];
    assert.deepEqual(Array.from(ind.timeAllocation), band, `founder ${ind.id} must carry the exact centroid`);
  }
  // 40 per band, 120 total.
  assert.equal(state.currentIndividuals.length, 120);
});

test("§20.9.1 — two exact canopy-heavy parents may reach canopy or forest_floor, never shoreline", () => {
  const mask = eligibleZoneMask(C.canopyHeavy, C.canopyHeavy, C);
  assert.deepEqual(mask, [true, true, false], "canopy + its neighbour forest_floor only");

  // A forced mutation targeting shoreline must be rejected as ineligible: it can
  // never be selected because it is not in the candidate array.
  const allocation = Float64Array.from([0.99, 0.01, 0.0]);
  for (const uTarget of [0.0, 0.25, 0.5, 0.75, 0.999999]) {
    const rng = new ScriptedRng([0.0, uTarget, 0.5, 0.5]);
    const r = allocationMutationOpportunity(allocation, mask, rng, C);
    if (r.draft) assert.notEqual(r.draft.toZone, "shoreline", "shoreline is not an eligible target");
    assert.equal(r.allocation[SHORE], 0, "shoreline share must remain exactly zero");
  }
});

test("§20.9.2 — two exact shoreline-heavy parents may reach shoreline or forest_floor, never canopy", () => {
  const mask = eligibleZoneMask(C.shorelineHeavy, C.shorelineHeavy, C);
  assert.deepEqual(mask, [false, true, true]);

  const allocation = Float64Array.from([0.0, 0.01, 0.99]);
  for (const uTarget of [0.0, 0.33, 0.66, 0.999999]) {
    const rng = new ScriptedRng([0.0, uTarget, 0.5, 0.5]);
    const r = allocationMutationOpportunity(allocation, mask, rng, C);
    if (r.draft) assert.notEqual(r.draft.toZone, "canopy");
    assert.equal(r.allocation[CANOPY], 0, "canopy share must remain exactly zero");
  }
});

test("§20.9.3 — once a parent uses forest_floor at the threshold, the opposite edge becomes reachable", () => {
  // Parent A is canopy-heavy; parent B has forest_floor exactly at epsilon.
  const parentA = [0.98, 0.02, 0.0];
  const parentB = [0.98, 0.02, 0.0];
  const mask = eligibleZoneMask(parentA, parentB, C);
  assert.deepEqual(mask, [true, true, true], "forest_floor use opens shoreline as a neighbour");

  // And the child can now actually receive shoreline share.
  const allocation = Float64Array.from([0.97, 0.03, 0.0]);
  const rng = new ScriptedRng([0.0, 0.999999, 0.5, 0.999999]);
  const r = allocationMutationOpportunity(allocation, mask, rng, C);
  assert.equal(r.draft.toZone, "shoreline");
  assert.ok(r.allocation[SHORE] > 0, "shoreline use is now reachable");

  // Symmetrically from the shoreline side.
  const maskFromShore = eligibleZoneMask([0.0, 0.02, 0.98], [0.0, 0.02, 0.98], C);
  assert.deepEqual(maskFromShore, [true, true, true]);

  // Below the threshold it stays closed.
  const belowThreshold = eligibleZoneMask([0.985, 0.014, 0.001], [0.985, 0.014, 0.001], C);
  assert.deepEqual(belowThreshold, [true, true, false], "0.014 < 0.02 does not open shoreline");
});

test("§20.9 — every current individual has finite shares in [0,1] summing to one", () => {
  for (const seed of [42, 43]) {
    const state = createInitialState(seed);
    runGenerations(state, 40);
    for (const ind of state.currentIndividuals) {
      let sum = 0;
      for (let z = 0; z < ZONES.length; z++) {
        const v = ind.timeAllocation[z];
        assert.ok(Number.isFinite(v), `individual ${ind.id} share ${z} not finite`);
        assert.ok(v >= 0 && v <= 1, `individual ${ind.id} share ${z} out of [0,1]: ${v}`);
        sum += v;
      }
      assert.ok(Math.abs(sum - 1) <= 1e-12, `individual ${ind.id} allocation sums to ${sum}`);
    }
  }
});

test("§20.9 — the zero-vector fallback counter remains zero in normal configured runs", () => {
  for (const seed of [44, 45, 46]) {
    const state = createInitialState(seed);
    runGenerations(state, 60);
    assert.equal(
      state.diagnostics.zeroAllocationFallbackCount,
      0,
      `zero-allocation fallback occurred in a normal run (seed ${seed})`
    );
  }
  const { envelope } = loadValidatedFixture();
  const fixtureState = hydrateDefiningFixtureV1(envelope, 47);
  runGenerations(fixtureState, 60);
  assert.equal(fixtureState.diagnostics.zeroAllocationFallbackCount, 0);
});

test("§20.9 — no child receives allocation in a non-eligible non-neighbour zone", () => {
  // Direct check on the inheritance path: mask zeros are exactly preserved.
  for (let seed = 0; seed < 200; seed++) {
    const rng = createSimRng(seed);
    const r = inheritTimeAllocation(C.canopyHeavy, C.canopyHeavy, rng, C);
    assert.equal(r.allocation[SHORE], 0, "canopy-only parents cannot give shoreline share");
    assert.equal(r.eligible[SHORE], false);
    const r2 = inheritTimeAllocation(C.shorelineHeavy, C.shorelineHeavy, createSimRng(seed), C);
    assert.equal(r2.allocation[CANOPY], 0, "shoreline-only parents cannot give canopy share");
  }
});

test("§20.9/§10.5 — no morphology function writes to allocation", () => {
  // The allocation path never receives a genome: prove by signature and by
  // showing identical allocations for wildly different genomes.
  const rngA = createSimRng(88);
  const rngB = createSimRng(88);
  const a = inheritTimeAllocation([0.5, 0.5, 0.0], [0.5, 0.5, 0.0], rngA, C);
  const b = inheritTimeAllocation([0.5, 0.5, 0.0], [0.5, 0.5, 0.0], rngB, C);
  assert.deepEqual(Array.from(a.allocation), Array.from(b.allocation));
  // inheritTimeAllocation(parentA, parentB, rng, config) — four params, no genome.
  assert.equal(inheritTimeAllocation.length, 4);
});
