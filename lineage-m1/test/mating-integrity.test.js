// @ts-check
/**
 * Contract §20.10 (mating half) and §14.3 — biological mating event integrity
 * across all runs.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { formMatingPairs, fisherYatesShuffle } from "../src/core/mating.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { makeIndividual } from "../src/core/individual.js";
import { createSimRng } from "../src/core/rng.js";
import { dot } from "../src/core/math.js";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";

const C = currentModelConfig;

/** Run a world and validate every mating event it produced. */
function validateMatingEvents(state, generations) {
  /** @type {Map<number, {parentIds:null|number[], birthGeneration:number}>} */
  const knownChildren = new Map();
  for (let g = 0; g < generations; g++) {
    const before = new Map(state.currentIndividuals.map((i) => [i.id, { ...i, age: i.ageGenerations }]));
    advanceGeneration(state);
    const targetGeneration = state.generation;
    const events = state.biologicalMatingEvents.filter((e) => e.generation === targetGeneration);
    const byId = new Map(state.currentIndividuals.map((i) => [i.id, i]));

    const seenParents = new Set();
    for (const ev of events) {
      assert.notEqual(ev.parentAId, ev.parentBId, "parents must be distinct");
      // Both were alive before the transition and eligible after aging.
      assert.ok(before.has(ev.parentAId), `parent ${ev.parentAId} was not alive`);
      assert.ok(before.has(ev.parentBId), `parent ${ev.parentBId} was not alive`);
      const ageA = byId.get(ev.parentAId).ageGenerations;
      const ageB = byId.get(ev.parentBId).ageGenerations;
      assert.ok(ageA >= 1 && ageA <= 6, `parent A age ${ageA}`);
      assert.ok(ageB >= 1 && ageB <= 6, `parent B age ${ageB}`);

      // Each parent appears in at most one pair that generation.
      assert.ok(!seenParents.has(ev.parentAId), `parent ${ev.parentAId} paired twice`);
      assert.ok(!seenParents.has(ev.parentBId), `parent ${ev.parentBId} paired twice`);
      seenParents.add(ev.parentAId);
      seenParents.add(ev.parentBId);

      // Overlap meets the configured minimum.
      assert.ok(ev.overlap >= C.minimumMatingOverlap, `overlap ${ev.overlap} below minimum`);
      const recomputed = dot(byId.get(ev.parentAId).timeAllocation, byId.get(ev.parentBId).timeAllocation);
      assert.ok(Math.abs(recomputed - ev.overlap) <= 1e-15, "recorded overlap must match the parents' allocations");

      // Exactly two children whose parent ids match the event.
      assert.equal(ev.childIds.length, 2, "childIds.length === 2");
      for (const childId of ev.childIds) {
        const child = byId.get(childId);
        assert.ok(child, `child ${childId} must exist`);
        assert.deepEqual(Array.from(child.parentIds), [ev.parentAId, ev.parentBId]);
        assert.equal(child.birthGeneration, targetGeneration);
        knownChildren.set(childId, { parentIds: child.parentIds, birthGeneration: child.birthGeneration });
      }

      // No observer or zone-bin field may exist in the event.
      assert.deepEqual(
        Object.keys(ev).sort(),
        ["childIds", "generation", "id", "overlap", "parentAId", "parentBId"],
        "mating event must contain exactly the §14.3 fields"
      );
    }
  }
  return knownChildren;
}

test("§20.10/§14.3 — every biological mating event is valid across a random world", () => {
  const state = createInitialState(51);
  const children = validateMatingEvents(state, 20);
  assert.ok(children.size > 0, "expected children to be born");
});

test("§20.10/§14.3 — every biological mating event is valid across the fixture world", () => {
  const { envelope } = loadValidatedFixture();
  const state = hydrateDefiningFixtureV1(envelope, 52);
  validateMatingEvents(state, 15);
});

test("§11 step 5 — only survivors aged 1..5 are eligible; no self-mating", () => {
  const genome = [0.15, 0.45, 0.4, 0.45, 0.4, 0.4, 0.35, 0.5, 0.5, 0.5];
  const alloc = [0.9, 0.1, 0.0];
  const mk = (id, age) =>
    makeIndividual({ id, parentIds: null, birthGeneration: 0, ageGenerations: age,
      bodyGenome: genome, timeAllocation: alloc, birthEventId: id });
  // ages 0 and 6 are ineligible; 1..5 are eligible.
  const survivors = [mk(1, 0), mk(2, 1), mk(3, 5), mk(4, 6), mk(5, 3)];
  const pairs = formMatingPairs(survivors, C, createSimRng(5));
  const usedIds = new Set();
  for (const p of pairs) {
    assert.notEqual(p.parentAId, p.parentBId);
    for (const id of [p.parentAId, p.parentBId]) {
      assert.ok(![1, 4].includes(id), `id ${id} is age-ineligible and must not mate`);
      assert.ok(!usedIds.has(id), "each individual belongs to at most one pair");
      usedIds.add(id);
    }
  }
  // Three eligible animals -> exactly one pair, one left unpaired.
  assert.equal(pairs.length, 1);
});

test("§11 step 7 — candidates below the minimum overlap are ineligible", () => {
  const genome = [0.15, 0.45, 0.4, 0.45, 0.4, 0.4, 0.35, 0.5, 0.5, 0.5];
  const mk = (id, alloc) =>
    makeIndividual({ id, parentIds: null, birthGeneration: 0, ageGenerations: 2,
      bodyGenome: genome, timeAllocation: alloc, birthEventId: id });
  // Pure canopy and pure shoreline overlap = 0 -> no pair possible.
  const survivors = [mk(1, [1, 0, 0]), mk(2, [0, 0, 1])];
  const pairs = formMatingPairs(survivors, C, createSimRng(6));
  assert.equal(pairs.length, 0, "zero overlap cannot form a pair");

  // Overlap exactly at the minimum is eligible (>= minimumMatingOverlap).
  const a = [0.2, 0.8, 0.0];
  const b = [0.1, 0.9, 0.0];
  assert.ok(dot(a, b) >= C.minimumMatingOverlap);
  const pairs2 = formMatingPairs([mk(1, a), mk(2, b)], C, createSimRng(7));
  assert.equal(pairs2.length, 1);
});

test("§11 step 6 — the Fisher-Yates shuffle is deterministic and a permutation", () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  const a = fisherYatesShuffle(ids.slice(), createSimRng(101));
  const b = fisherYatesShuffle(ids.slice(), createSimRng(101));
  assert.deepEqual(a, b, "same seed gives the same order");
  assert.deepEqual(a.slice().sort((x, y) => x - y), ids, "result is a permutation");
  const c = fisherYatesShuffle(ids.slice(), createSimRng(102));
  assert.notDeepEqual(a, c, "different seeds give different orders");
});

test("§11 step 7 — mate selection uses only allocation overlap, never trait values", () => {
  const alloc = [0.5, 0.5, 0.0];
  const mk = (id, genome) =>
    makeIndividual({ id, parentIds: null, birthGeneration: 0, ageGenerations: 2,
      bodyGenome: genome, timeAllocation: alloc, birthEventId: id });
  const wildlyDifferent = [
    mk(1, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    mk(2, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    mk(3, [0.5, 0.2, 0.9, 0.1, 0.3, 0.7, 0.4, 0.6, 0.8, 0.2]),
    mk(4, [0.15, 0.45, 0.4, 0.45, 0.4, 0.4, 0.35, 0.5, 0.5, 0.5]),
  ];
  const identical = [
    mk(1, [0.15, 0.45, 0.4, 0.45, 0.4, 0.4, 0.35, 0.5, 0.5, 0.5]),
    mk(2, [0.15, 0.45, 0.4, 0.45, 0.4, 0.4, 0.35, 0.5, 0.5, 0.5]),
    mk(3, [0.15, 0.45, 0.4, 0.45, 0.4, 0.4, 0.35, 0.5, 0.5, 0.5]),
    mk(4, [0.15, 0.45, 0.4, 0.45, 0.4, 0.4, 0.35, 0.5, 0.5, 0.5]),
  ];
  const pairsA = formMatingPairs(wildlyDifferent, C, createSimRng(303));
  const pairsB = formMatingPairs(identical, C, createSimRng(303));
  assert.deepEqual(pairsA, pairsB, "genome differences must not change pairing at all");
});

test("§14.3 — mating event ids are unique and strictly increasing", () => {
  const state = createInitialState(53);
  for (let g = 0; g < 12; g++) advanceGeneration(state);
  const ids = state.biologicalMatingEvents.map((e) => e.id);
  for (let i = 1; i < ids.length; i++) assert.ok(ids[i] > ids[i - 1]);
  assert.equal(new Set(ids).size, ids.length);
});
