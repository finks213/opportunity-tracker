// @ts-check
/**
 * The declared edge-only adjacency-traversal experiment (revision-3 repair).
 *
 * `CHARACTERIZATION_PLAN.md` §5 declares traversal in a world descended ONLY
 * from one edge founder band. Revision 2 measured an ancestry subset inside the
 * ordinary mixed 120-founder world, where the other 80 founders still altered
 * zone loads, density factors, survival, mating availability, mating order, and
 * population dynamics. Two auditors confirmed the substitution; an independent
 * edge-only counterfactual produced 500/500 where the mixed world reported
 * 495/500 and 499/500 — different systems, different results.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createEdgeOnlyState,
  EDGE_ONLY_EXPERIMENTS,
  edgeOnlyDeclaration,
} from "../src/fixtures/edgeOnlyWorlds.js";
import { runEdgeOnlyWorld } from "../tools/runEdgeOnlyTraversal.mjs";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { currentModelConfig as C } from "../src/config/modelConfig.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import { ZONE_INDEX } from "../src/config/zones.js";

test("the canopy experiment contains ONLY canopy-heavy founders", () => {
  const state = createEdgeOnlyState(EDGE_ONLY_EXPERIMENTS.canopyOnly, 1, C);
  assert.equal(state.currentIndividuals.length, 40, "exactly the 40 canopy founders");
  const ids = state.currentIndividuals.map((i) => i.id);
  assert.deepEqual(ids, Array.from({ length: 40 }, (_, k) => k + 1), "ids 1..40, preserved");

  for (const ind of state.currentIndividuals) {
    assert.deepEqual(
      Array.from(ind.timeAllocation),
      Array.from(C.canopyHeavy),
      `founder ${ind.id} must carry the canopy centroid`
    );
    // No forest-floor or shoreline founder may be present.
    assert.ok(ind.id >= 1 && ind.id <= 40);
  }
  // No forest-floor band allocation and no shoreline band allocation exist.
  const allocations = new Set(state.currentIndividuals.map((i) => i.timeAllocation.join(",")));
  assert.equal(allocations.size, 1, "a single-band world has exactly one founder allocation");
  assert.ok(!allocations.has(C.forestFloorHeavy.join(",")));
  assert.ok(!allocations.has(C.shorelineHeavy.join(",")));
});

test("the shoreline experiment contains ONLY shoreline-heavy founders", () => {
  const state = createEdgeOnlyState(EDGE_ONLY_EXPERIMENTS.shorelineOnly, 1, C);
  assert.equal(state.currentIndividuals.length, 40);
  const ids = state.currentIndividuals.map((i) => i.id);
  assert.deepEqual(ids, Array.from({ length: 40 }, (_, k) => k + 81), "ids 81..120, preserved");
  const allocations = new Set(state.currentIndividuals.map((i) => i.timeAllocation.join(",")));
  assert.deepEqual([...allocations], [Array.from(C.shorelineHeavy).join(",")]);
  assert.ok(!allocations.has(C.canopyHeavy.join(",")));
  assert.ok(!allocations.has(C.forestFloorHeavy.join(",")));
});

test("the frozen initializer is fully declared and internally consistent", () => {
  const d = edgeOnlyDeclaration(C);
  for (const field of [
    "experiments", "startingPopulation", "founderIdsPreserved",
    "nextIndividualId", "nextBirthEventId", "eventCountersStartAt",
    "rngInitialization", "capacityTreatment", "extinctionHandling",
    "meaningfulUseThreshold",
  ]) {
    assert.ok(field in d, `the declaration must record ${field}`);
  }
  assert.equal(d.startingPopulation, 40);
  assert.equal(d.meaningfulUseThreshold, C.parentalUseEpsilon);

  const state = createEdgeOnlyState(EDGE_ONLY_EXPERIMENTS.canopyOnly, 3, C);
  assert.equal(state.nextIndividualId, d.nextIndividualId, "ids never reused");
  assert.equal(state.nextBirthEventId, d.nextBirthEventId);
  assert.equal(state.nextMatingEventId, 1);
  assert.equal(state.nextMutationEventId, 1);
  assert.equal(state.nextAllocationMutationEventId, 1);
  assert.equal(state.generation, 0);
  // Founder birth records: one per retained founder, generation 0, founder true.
  assert.equal(state.birthEvents.length, 40);
  for (const b of state.birthEvents) {
    assert.equal(b.generation, 0);
    assert.equal(b.founder, true);
    assert.equal(b.parentIds, null);
    assert.equal(b.id, b.childId, "birthEventId === id");
  }
  // Capacity is unchanged: only the founding population differs.
  assert.ok(d.capacityTreatment.includes(String(C.zoneCapacity[0])));
});

test("post-initialization RNG state and founder genomes match the mixed world at the same seed", () => {
  // This is what makes the edge-only and mixed-world results RNG-comparable.
  for (const seed of [1, 2, 7]) {
    const edge = createEdgeOnlyState(EDGE_ONLY_EXPERIMENTS.canopyOnly, seed, C);
    const mixed = createInitialState(seed, C);
    assert.deepEqual(
      edge.simRng.toState(),
      mixed.simRng.toState(),
      `seed ${seed}: post-initialization RNG state must match the mixed world`
    );
    // A retained founder has the genome it would have had in the mixed world.
    const mixedById = new Map(mixed.currentIndividuals.map((i) => [i.id, i]));
    for (const ind of edge.currentIndividuals) {
      assert.deepEqual(
        Array.from(ind.bodyGenome),
        Array.from(mixedById.get(ind.id).bodyGenome),
        `seed ${seed}: founder ${ind.id} genome must match the mixed world`
      );
      assert.equal(ind.ageGenerations, mixedById.get(ind.id).ageGenerations);
    }
  }
});

test("the opposite-edge event is measured FROM the isolated world", () => {
  // Canopy-only: the shoreline is only reachable across the forest-floor bridge,
  // because there is no canopy-shoreline edge.
  const canopy = runEdgeOnlyWorld(EDGE_ONLY_EXPERIMENTS.canopyOnly, 1, 40, C);
  assert.equal(canopy.experiment, "canopyOnly");
  assert.equal(canopy.startingPopulation, 40);
  assert.ok(canopy.reached, "the canopy-only world should reach the shoreline");
  assert.ok(canopy.firstGeneration >= 2, "traversal needs at least the forest-floor step first");

  const shoreline = runEdgeOnlyWorld(EDGE_ONLY_EXPERIMENTS.shorelineOnly, 1, 40, C);
  assert.equal(shoreline.experiment, "shorelineOnly");
  assert.ok(shoreline.reached);
  assert.ok(shoreline.firstGeneration >= 2);

  // Verify the measured condition directly: at the reported generation, some
  // living individual really does hold >= epsilon in the opposite edge zone.
  const state = createEdgeOnlyState(EDGE_ONLY_EXPERIMENTS.canopyOnly, 1, C);
  for (let g = 0; g < canopy.firstGeneration; g++) advanceGeneration(state, C);
  const reached = state.currentIndividuals.some(
    (i) => i.timeAllocation[ZONE_INDEX.shoreline] >= C.parentalUseEpsilon
  );
  assert.ok(reached, "the reported generation must actually satisfy the measured condition");

  // And it was NOT already satisfied one generation earlier.
  const earlier = createEdgeOnlyState(EDGE_ONLY_EXPERIMENTS.canopyOnly, 1, C);
  for (let g = 0; g < canopy.firstGeneration - 1; g++) advanceGeneration(earlier, C);
  const tooEarly = earlier.currentIndividuals.some(
    (i) => i.timeAllocation[ZONE_INDEX.shoreline] >= C.parentalUseEpsilon
  );
  assert.equal(tooEarly, false, "firstGeneration must be the FIRST generation satisfying it");
});

test("the edge-only experiment is deterministic", () => {
  for (const key of ["canopyOnly", "shorelineOnly"]) {
    const a = runEdgeOnlyWorld(EDGE_ONLY_EXPERIMENTS[key], 5, 30, C);
    const b = runEdgeOnlyWorld(EDGE_ONLY_EXPERIMENTS[key], 5, 30, C);
    assert.deepEqual(a, b, `${key} must be deterministic`);
  }
  // And the state itself is byte-reproducible.
  const s1 = createEdgeOnlyState(EDGE_ONLY_EXPERIMENTS.canopyOnly, 9, C);
  const s2 = createEdgeOnlyState(EDGE_ONLY_EXPERIMENTS.canopyOnly, 9, C);
  assert.equal(serializeCanonicalBiology(s1), serializeCanonicalBiology(s2));
});

test("the isolated world is genuinely a different system from the mixed world", () => {
  // The whole point of the repair: removing the other 80 founders changes the
  // ecology, so the two measurements are not interchangeable.
  const edge = createEdgeOnlyState(EDGE_ONLY_EXPERIMENTS.canopyOnly, 1, C);
  const mixed = createInitialState(1, C);
  assert.equal(edge.currentIndividuals.length, 40);
  assert.equal(mixed.currentIndividuals.length, 120);

  advanceGeneration(edge, C);
  advanceGeneration(mixed, C);
  assert.notEqual(
    serializeCanonicalBiology(edge),
    serializeCanonicalBiology(mixed),
    "the isolated and mixed worlds must not be treated as the same experiment"
  );
});

test("§20.9 — the isolated worlds still respect the adjacency graph", () => {
  // A canopy-only world must never produce shoreline share before forest-floor
  // use reaches the parental-use threshold: there is no canopy-shoreline edge.
  const state = createEdgeOnlyState(EDGE_ONLY_EXPERIMENTS.canopyOnly, 2, C);
  let sawForestFloorAtThreshold = false;
  for (let g = 0; g < 12; g++) {
    advanceGeneration(state, C);
    const anyShoreline = state.currentIndividuals.some(
      (i) => i.timeAllocation[ZONE_INDEX.shoreline] >= C.parentalUseEpsilon
    );
    if (!sawForestFloorAtThreshold) {
      assert.equal(
        anyShoreline,
        false,
        `generation ${state.generation}: shoreline reached before any forest-floor use met the threshold`
      );
    }
    if (
      state.currentIndividuals.some(
        (i) => i.timeAllocation[ZONE_INDEX.forest_floor] >= C.parentalUseEpsilon
      )
    ) {
      sawForestFloorAtThreshold = true;
    }
    // Allocations remain valid throughout.
    for (const ind of state.currentIndividuals) {
      const sum = ind.timeAllocation[0] + ind.timeAllocation[1] + ind.timeAllocation[2];
      assert.ok(Math.abs(sum - 1) <= 1e-12);
    }
  }
  assert.ok(sawForestFloorAtThreshold, "the forest-floor bridge must actually be crossed");
  assert.equal(state.diagnostics.zeroAllocationFallbackCount, 0);
});
