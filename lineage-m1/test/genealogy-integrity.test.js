// @ts-check
/**
 * Contract §20.11 (integrity half) — genealogy coherence.
 * The forced retention-boundary crossing lives in
 * genealogy-retention-boundary.test.js.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration, runGenerations } from "../src/core/simulation.js";
import { resolveParent } from "../src/core/genealogy.js";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";

test("§20.11 — every retained parent ID resolves to an individual or an explicit boundary record", () => {
  const state = createInitialState(61);
  runGenerations(state, 40);
  for (const record of state.retainedGenealogy) {
    if (record.parentIds === null) continue;
    for (const parentId of record.parentIds) {
      const r = resolveParent(state, parentId);
      assert.notEqual(r.kind, "unresolved", `parent ${parentId} of child ${record.childId} is unresolved`);
    }
  }
  // Living individuals' parents also resolve.
  for (const ind of state.currentIndividuals) {
    if (ind.parentIds === null) continue;
    for (const parentId of ind.parentIds) {
      assert.notEqual(resolveParent(state, parentId).kind, "unresolved");
    }
  }
});

test("§20.11 — individual IDs are never reused", () => {
  const state = createInitialState(62);
  const everSeen = new Set();
  const check = () => {
    for (const ind of state.currentIndividuals) everSeen.add(ind.id);
  };
  check();
  let lastNextId = state.nextIndividualId;
  for (let g = 0; g < 30; g++) {
    advanceGeneration(state);
    // The id counter only ever advances.
    assert.ok(state.nextIndividualId >= lastNextId, "nextIndividualId must never decrease");
    lastNextId = state.nextIndividualId;
    check();
  }
  // Every id ever seen is strictly less than the counter, and each id maps to
  // exactly one birth record.
  const birthChildIds = state.retainedGenealogy.map((r) => r.childId);
  assert.equal(new Set(birthChildIds).size, birthChildIds.length, "one birth record per id");
  for (const id of everSeen) assert.ok(id < state.nextIndividualId);
});

test("§20.11 — birth generations precede child generations and no cycles exist", () => {
  const state = createInitialState(63);
  runGenerations(state, 30);
  const genByChild = new Map(state.retainedGenealogy.map((r) => [r.childId, r.generation]));
  for (const ind of state.currentIndividuals) genByChild.set(ind.id, ind.birthGeneration);

  for (const record of state.retainedGenealogy) {
    if (record.parentIds === null) continue;
    for (const parentId of record.parentIds) {
      // A parent id is always smaller than its child id (monotonic assignment),
      // which alone forbids cycles.
      assert.ok(parentId < record.childId, `parent ${parentId} must have a smaller id than child ${record.childId}`);
      const parentGen = genByChild.get(parentId);
      if (parentGen !== undefined) {
        assert.ok(
          parentGen < record.generation,
          `parent ${parentId} (gen ${parentGen}) must precede child ${record.childId} (gen ${record.generation})`
        );
      }
    }
  }
});

test("§20.11 — pruning is deterministic: identical runs produce identical genealogy", () => {
  const a = createInitialState(64);
  const b = createInitialState(64);
  runGenerations(a, 25);
  runGenerations(b, 25);
  assert.deepEqual(a.retainedGenealogy, b.retainedGenealogy);
  assert.deepEqual(a.prunedAncestorBoundaries, b.prunedAncestorBoundaries);
});

test("§15 — genealogy and mating cores stay coherent in the fixture world", () => {
  const { envelope } = loadValidatedFixture();
  const state = hydrateDefiningFixtureV1(envelope, 65);
  runGenerations(state, 30);
  // Every mating event's children exist as birth records with matching parents.
  const birthByChild = new Map(state.retainedGenealogy.map((r) => [r.childId, r]));
  for (const ev of state.biologicalMatingEvents) {
    for (const childId of ev.childIds) {
      const birth = birthByChild.get(childId);
      if (!birth) continue; // may be pruned in longer runs
      assert.deepEqual(Array.from(birth.parentIds), [ev.parentAId, ev.parentBId]);
      assert.equal(birth.generation, ev.generation);
    }
  }
});

test("§15 — founder records carry null parents and generation 0", () => {
  const { envelope } = loadValidatedFixture();
  const state = hydrateDefiningFixtureV1(envelope, 66);
  const founders = state.retainedGenealogy.filter((r) => r.founder);
  assert.equal(founders.length, 120);
  for (const f of founders) {
    assert.equal(f.parentIds, null);
    assert.equal(f.generation, 0);
  }
});
