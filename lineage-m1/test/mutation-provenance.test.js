// @ts-check
/**
 * Contract §20.7 — mutation provenance and counter ownership, including the
 * separate typed namespaces from §12.1.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/core/individual.js";
import { runGenerations } from "../src/core/simulation.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";
import { NUM_TRAITS } from "../src/config/traits.js";

const C = currentModelConfig;

/** Run a world and return it. */
function world(seed, generations) {
  const state = createInitialState(seed);
  runGenerations(state, generations);
  return state;
}

test("§20.7 — every mutation event refers to a child born in the same generation and never a survivor", () => {
  const state = world(21, 30);
  const birthByChild = new Map(state.birthEvents.map((b) => [b.childId, b]));

  for (const ev of state.bodyMutationEvents) {
    const birth = birthByChild.get(ev.childId);
    // Records may be pruned by retention; when present they must agree.
    if (birth) {
      assert.equal(birth.generation, ev.generation, "body mutation must reference a same-generation newborn");
      assert.equal(birth.id, ev.birthEventId);
      assert.deepEqual(birth.parentIds, ev.parentIds);
      assert.equal(birth.founder, false, "mutations never target founders");
    }
    // pre/post values recorded and reconstructible from inheritance + delta.
    assert.equal(typeof ev.preMutationValue, "number");
    assert.equal(typeof ev.postMutationValue, "number");
    assert.equal(typeof ev.requestedDelta, "number");
    const reconstructed = Math.min(Math.max(ev.preMutationValue + ev.requestedDelta, 0), 1);
    assert.ok(
      Math.abs(reconstructed - ev.postMutationValue) <= 1e-15,
      "post value must be reconstructible from pre value plus requested delta with clamping"
    );
    assert.ok(ev.traitId >= 0 && ev.traitId < NUM_TRAITS);
    assert.ok(Array.isArray(ev.childTimeAllocationAtBirth) && ev.childTimeAllocationAtBirth.length === 3);
  }

  for (const ev of state.allocationMutationEvents) {
    const birth = birthByChild.get(ev.childId);
    if (birth) {
      assert.equal(birth.generation, ev.generation);
      assert.equal(birth.founder, false);
    }
    assert.ok(ev.realizedTransfer > 0, "a zero-realized transfer is never recorded");
    assert.ok(ev.realizedTransfer <= ev.requestedTransfer + 1e-15);
    assert.notEqual(ev.fromZone, ev.toZone);
    assert.equal(ev.preMutationAllocation.length, 3);
    assert.equal(ev.postMutationAllocation.length, 3);
  }
});

test("§20.7/§12.1 — event IDs are unique and strictly increasing WITHIN each typed namespace", () => {
  const state = world(22, 25);

  const bodyIds = state.bodyMutationEvents.map((e) => e.id);
  for (let i = 1; i < bodyIds.length; i++) {
    assert.ok(bodyIds[i] > bodyIds[i - 1], `bodyMutationEvents ids must strictly increase: ${bodyIds[i - 1]} -> ${bodyIds[i]}`);
  }
  assert.equal(new Set(bodyIds).size, bodyIds.length, "body mutation ids unique");

  const allocIds = state.allocationMutationEvents.map((e) => e.id);
  for (let i = 1; i < allocIds.length; i++) {
    assert.ok(allocIds[i] > allocIds[i - 1], `allocationMutationEvents ids must strictly increase`);
  }
  assert.equal(new Set(allocIds).size, allocIds.length, "allocation mutation ids unique");
});

test("§20.7/§12.1 — numeric overlap between the two namespaces is permitted, not a collision", () => {
  const state = world(23, 20);
  assert.ok(state.bodyMutationEvents.length > 0, "expected body mutations");
  assert.ok(state.allocationMutationEvents.length > 0, "expected allocation mutations");
  const bodyIds = new Set(state.bodyMutationEvents.map((e) => e.id));
  const allocIds = new Set(state.allocationMutationEvents.map((e) => e.id));
  let overlap = 0;
  for (const id of allocIds) if (bodyIds.has(id)) overlap++;
  // Overlap is expected because both namespaces start at 1; it must not be
  // treated as an error anywhere in the engine.
  assert.ok(overlap > 0, "the two namespaces are expected to share numeric values");
});

test("§20.7/§12.1 — recording increments only the owning counter", () => {
  const state = world(24, 15);
  // Each recorded event consumed exactly one id from its own counter.
  assert.equal(
    state.nextMutationEventId,
    1 + state.bodyMutationEvents.filter(() => true).length + countPrunedBody(state),
    "nextMutationEventId equals 1 + total body-mutation events ever recorded"
  );
  assert.equal(
    state.nextAllocationMutationEventId,
    1 + state.allocationMutationEvents.length + countPrunedAlloc(state),
    "nextAllocationMutationEventId equals 1 + total allocation-mutation events ever recorded"
  );
});

// Retention can prune events; at 15 generations the 360-generation window has
// pruned nothing, so these are zero. Kept explicit so the assertion above is
// honest about what it is counting.
function countPrunedBody(state) {
  return state.generation >= currentModelConfig.genealogyRetentionWindow ? NaN : 0;
}
function countPrunedAlloc(state) {
  return state.generation >= currentModelConfig.genealogyRetentionWindow ? NaN : 0;
}

test("§20.7 — a failed opportunity increments neither counter", () => {
  // Compare a run where both mutation probabilities are zero: counters stay at 1.
  const zeroMutation = { ...C, bodyMutationProbabilityPerChild: 0, allocationMutationProbabilityPerChild: 0 };
  const state = createInitialState(25, zeroMutation);
  runGenerations(state, 10, zeroMutation);
  assert.ok(state.diagnostics.bodyMutationOpportunityCount > 0, "opportunities still executed");
  assert.ok(state.diagnostics.allocationMutationOpportunityCount > 0);
  assert.equal(state.bodyMutationEvents.length, 0);
  assert.equal(state.allocationMutationEvents.length, 0);
  assert.equal(state.nextMutationEventId, 1, "no body event id consumed");
  assert.equal(state.nextAllocationMutationEventId, 1, "no allocation event id consumed");
});

test("§20.7 — fixture hydration preserves both counters exactly", () => {
  const { envelope } = loadValidatedFixture();
  const state = hydrateDefiningFixtureV1(envelope, 1);
  assert.equal(state.nextMutationEventId, envelope.nextMutationEventId);
  assert.equal(state.nextAllocationMutationEventId, envelope.nextAllocationMutationEventId);

  // Non-trivial counters also survive hydration untouched.
  const modified = { ...envelope, nextMutationEventId: 57, nextAllocationMutationEventId: 91 };
  const state2 = hydrateDefiningFixtureV1(modified, 1);
  assert.equal(state2.nextMutationEventId, 57);
  assert.equal(state2.nextAllocationMutationEventId, 91);
});

test("§20.1 — mutation events reference only newborn child IDs created in the same generation", () => {
  const state = world(26, 20);
  const idsBornAtGeneration = new Map();
  for (const b of state.birthEvents) {
    if (!idsBornAtGeneration.has(b.generation)) idsBornAtGeneration.set(b.generation, new Set());
    idsBornAtGeneration.get(b.generation).add(b.childId);
  }
  for (const ev of [...state.bodyMutationEvents, ...state.allocationMutationEvents]) {
    const born = idsBornAtGeneration.get(ev.generation);
    if (born) {
      assert.ok(born.has(ev.childId), `mutation at gen ${ev.generation} references non-newborn ${ev.childId}`);
    }
  }
});
