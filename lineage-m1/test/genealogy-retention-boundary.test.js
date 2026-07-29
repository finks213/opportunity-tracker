// @ts-check
/**
 * Contract §20.11 (forced boundary half) — the required test must actually
 * cross the 360-generation retention boundary.
 *
 * Runs a deterministic pedigree to generation 400 and prunes at 400. At G=400
 * with a 360-generation window, firstRetainedGeneration = 400 - 359 = 41.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/core/individual.js";
import { runGenerations, advanceGeneration, isExtinct } from "../src/core/simulation.js";
import { pruneGenealogy } from "../src/core/genealogy.js";
import { resolveParent } from "../src/core/genealogy.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import {
  createObserverState,
  createTracerChannel,
  tracerBirthHook,
} from "../src/observer/tracerChannels.js";

const C = currentModelConfig;
const WINDOW = C.genealogyRetentionWindow; // 360
const TARGET_GENERATION = 400;
const SEED = 71;

/** Build a world advanced to exactly TARGET_GENERATION. */
function buildDeep(seed, hooks = {}) {
  const state = createInitialState(seed);
  runGenerations(state, TARGET_GENERATION, C, hooks);
  return state;
}

test("§15/§20.11 — retention window is exactly 360 generations", () => {
  assert.equal(WINDOW, 360);
});

test("§20.11 — at generation 400, complete records remain only for generations 41..400", () => {
  const state = buildDeep(SEED);
  assert.ok(!isExtinct(state), "world must survive to generation 400 for this test to be meaningful");
  assert.equal(state.generation, TARGET_GENERATION);

  const firstRetained = Math.max(0, TARGET_GENERATION - (WINDOW - 1));
  assert.equal(firstRetained, 41);

  const livingIds = new Set(state.currentIndividuals.map((i) => i.id));

  // Complete birth records for generations 0..40 are absent unless the record
  // belongs to a currently living individual.
  for (const r of state.retainedGenealogy) {
    if (r.generation < firstRetained) {
      assert.ok(
        livingIds.has(r.childId),
        `birth record for generation ${r.generation} (child ${r.childId}) must be pruned unless living`
      );
    }
    assert.ok(r.generation <= TARGET_GENERATION);
  }

  // Non-parentage event arrays are pruned strictly by generation.
  for (const arr of [
    state.deathEvents,
    state.biologicalMatingEvents,
    state.bodyMutationEvents,
    state.allocationMutationEvents,
  ]) {
    for (const e of arr) {
      assert.ok(e.generation >= firstRetained, `event at generation ${e.generation} should be pruned`);
      assert.ok(e.generation <= TARGET_GENERATION);
    }
  }

  // Under the frozen lifecycle no living individual approaches the boundary.
  for (const ind of state.currentIndividuals) {
    assert.ok(ind.ageGenerations <= 6);
  }
});

test("§20.11 — every retained reference to an older parent resolves through a PrunedAncestorBoundary", () => {
  const state = buildDeep(SEED);
  let boundaryResolutions = 0;
  for (const r of state.retainedGenealogy) {
    if (r.parentIds === null) continue;
    for (const parentId of r.parentIds) {
      const res = resolveParent(state, parentId);
      assert.notEqual(res.kind, "unresolved", `unresolved parent ${parentId} of child ${r.childId}`);
      if (res.kind === "boundary") boundaryResolutions++;
    }
  }
  assert.ok(boundaryResolutions > 0, "the boundary must actually be crossed and exercised");

  // Boundary records carry the required shape.
  for (const b of state.prunedAncestorBoundaries) {
    assert.equal(typeof b.boundaryId, "number");
    assert.equal(typeof b.originalIndividualId, "number");
    assert.equal(typeof b.lastRetainedGeneration, "number");
    assert.equal(b.reason, "genealogy_retention_boundary");
  }
  // No duplicate boundary for the same original individual.
  const originals = state.prunedAncestorBoundaries.map((b) => b.originalIndividualId);
  assert.equal(new Set(originals).size, originals.length, "one boundary per pruned ancestor");
  // Boundary ids are unique and ascending.
  const ids = state.prunedAncestorBoundaries.map((b) => b.boundaryId);
  for (let i = 1; i < ids.length; i++) assert.ok(ids[i] > ids[i - 1]);
});

test("§20.11 — no unresolved original ID remains anywhere", () => {
  const state = buildDeep(SEED);
  const resolvable = new Set([
    ...state.retainedGenealogy.map((r) => r.childId),
    ...state.currentIndividuals.map((i) => i.id),
    ...state.prunedAncestorBoundaries.map((b) => b.originalIndividualId),
  ]);
  const referenced = new Set();
  for (const r of state.retainedGenealogy) {
    if (r.parentIds) for (const p of r.parentIds) referenced.add(p);
  }
  for (const i of state.currentIndividuals) {
    if (i.parentIds) for (const p of i.parentIds) referenced.add(p);
  }
  for (const id of referenced) {
    assert.ok(resolvable.has(id), `dangling parent id ${id}`);
  }
});

test("§20.11 — a second prune produces byte-identical state", () => {
  const state = buildDeep(SEED);
  const before = serializeCanonicalBiology(state);
  pruneGenealogy(state, C);
  const after = serializeCanonicalBiology(state);
  assert.equal(after, before, "pruning must be idempotent");
  pruneGenealogy(state, C);
  assert.equal(serializeCanonicalBiology(state), before, "and remain idempotent on repetition");
});

test("§20.11 — retained complete-event counts do not grow beyond the window when advancing farther", () => {
  const state = buildDeep(SEED);
  const spanOf = (arr) => {
    if (arr.length === 0) return 0;
    const gens = arr.map((e) => e.generation);
    return Math.max(...gens) - Math.min(...gens) + 1;
  };
  for (const arr of [state.deathEvents, state.biologicalMatingEvents]) {
    assert.ok(spanOf(arr) <= WINDOW, `retained event span ${spanOf(arr)} exceeds the ${WINDOW}-generation window`);
  }

  // Advance 60 more generations; the window must slide, not grow.
  const genealogyBefore = state.retainedGenealogy.length;
  for (let i = 0; i < 60; i++) advanceGeneration(state);
  assert.equal(state.generation, TARGET_GENERATION + 60);
  const newFirstRetained = state.generation - (WINDOW - 1);
  for (const e of state.deathEvents) assert.ok(e.generation >= newFirstRetained);
  for (const e of state.biologicalMatingEvents) assert.ok(e.generation >= newFirstRetained);
  for (const arr of [state.deathEvents, state.biologicalMatingEvents]) {
    assert.ok(spanOf(arr) <= WINDOW);
  }
  assert.ok(Number.isFinite(genealogyBefore));
});

test("§15 — stored boundary records equal the EXACT set still required, at every depth", () => {
  // Regression test for an audit finding: carrying previously created boundary
  // records forward made prunedAncestorBoundaries grow without bound (15,356
  // stored vs 137 required at generation 600), violating §15's "minimum
  // explicit boundary records" and "no unlimited append-only history".
  const state = createInitialState(SEED);
  const checkpoints = [400, 460, 520, 600];
  const observed = [];
  let advanced = 0;
  for (const target of checkpoints) {
    while (advanced < target) {
      if (isExtinct(state)) break;
      advanceGeneration(state);
      advanced++;
    }
    // The exact set of parent ids referenced but not directly resolvable.
    const resolvable = new Set(state.retainedGenealogy.map((r) => r.childId));
    for (const ind of state.currentIndividuals) resolvable.add(ind.id);
    const required = new Set();
    const consider = (parentIds) => {
      if (!parentIds) return;
      for (const p of parentIds) if (!resolvable.has(p)) required.add(p);
    };
    for (const r of state.retainedGenealogy) consider(r.parentIds);
    for (const ind of state.currentIndividuals) consider(ind.parentIds);

    const stored = state.prunedAncestorBoundaries.map((b) => b.originalIndividualId).sort((a, b) => a - b);
    const needed = [...required].sort((a, b) => a - b);
    assert.deepEqual(
      stored,
      needed,
      `generation ${state.generation}: stored ${stored.length} boundary records but exactly ${needed.length} are required`
    );
    observed.push({ generation: state.generation, count: stored.length });
  }
  console.log(`\n  boundary-record counts: ${observed.map((o) => `gen ${o.generation}=${o.count}`).join(", ")}`);

  // And the count must not grow without bound as the window slides.
  const last = observed[observed.length - 1].count;
  const first = observed[0].count;
  assert.ok(
    last < first * 10,
    `boundary records grew from ${first} to ${last}; retention is not bounded`
  );
});

test("§15 — canonical state size stabilizes once the window is full", () => {
  const state = createInitialState(SEED);
  runGenerations(state, 400, C);
  const sizeAt400 = serializeCanonicalBiology(state).length;
  runGenerations(state, 200, C);
  const sizeAt600 = serializeCanonicalBiology(state).length;
  // Population fluctuates, so allow generous headroom; unbounded boundary
  // accumulation previously inflated this by megabytes.
  assert.ok(
    sizeAt600 < sizeAt400 * 1.5,
    `canonical state grew from ${sizeAt400} to ${sizeAt600} bytes between generations 400 and 600`
  );
});

test("§20.11 — observer actions do not alter boundary creation or pruning bytes", () => {
  const plain = buildDeep(SEED);

  const observer = createObserverState();
  const observed = createInitialState(SEED);
  createTracerChannel(observer, "k", [1, 2, 3, 4, 5], observed.currentIndividuals.map((i) => i.id));
  runGenerations(observed, TARGET_GENERATION, C, { onBirth: tracerBirthHook(observer) });

  assert.equal(
    serializeCanonicalBiology(observed),
    serializeCanonicalBiology(plain),
    "observer activity must not change genealogy, boundaries, or any pruned byte"
  );
  assert.deepEqual(observed.prunedAncestorBoundaries, plain.prunedAncestorBoundaries);
});
