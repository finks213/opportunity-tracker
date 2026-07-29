// @ts-check
/**
 * Contract §20.1 — birth immutability.
 *
 * For every individual, body genome and time allocation at every later retained
 * generation must exactly equal its birth values.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";

const GENERATIONS = 30;

/**
 * Track birth values for every individual ever seen and assert they never change.
 * @param {Object} state
 */
function assertImmutableAcross(state, generations) {
  /** @type {Map<number, {genome:number[], alloc:number[], birthGeneration:number}>} */
  const birthValues = new Map();

  const record = () => {
    for (const ind of state.currentIndividuals) {
      const genome = Array.from(ind.bodyGenome);
      const alloc = Array.from(ind.timeAllocation);
      if (!birthValues.has(ind.id)) {
        birthValues.set(ind.id, { genome, alloc, birthGeneration: ind.birthGeneration });
      } else {
        const b = birthValues.get(ind.id);
        assert.deepEqual(genome, b.genome, `individual ${ind.id} body genome changed after birth`);
        assert.deepEqual(alloc, b.alloc, `individual ${ind.id} time allocation changed after birth`);
        assert.equal(ind.birthGeneration, b.birthGeneration, `individual ${ind.id} birthGeneration changed`);
      }
    }
  };

  record();
  for (let g = 0; g < generations; g++) {
    advanceGeneration(state);
    record();
  }
  return birthValues;
}

test("§20.1 — random-world individuals never change genome or allocation after birth", () => {
  const state = createInitialState(31);
  const seen = assertImmutableAcross(state, GENERATIONS);
  assert.ok(seen.size > 120, "expected new individuals to be born during the run");
});

test("§20.1 — fixture-world individuals never change genome or allocation after birth", () => {
  const { envelope } = loadValidatedFixture();
  const state = hydrateDefiningFixtureV1(envelope, 32);
  assertImmutableAcross(state, GENERATIONS);
});

test("§20.1 — only ageGenerations changes for a surviving individual", () => {
  const state = createInitialState(33);
  const before = new Map(
    state.currentIndividuals.map((i) => [
      i.id,
      { age: i.ageGenerations, genome: Array.from(i.bodyGenome), alloc: Array.from(i.timeAllocation) },
    ])
  );
  advanceGeneration(state);
  let agedCount = 0;
  for (const ind of state.currentIndividuals) {
    const b = before.get(ind.id);
    if (!b) continue; // newborn
    assert.equal(ind.ageGenerations, b.age + 1, "survivors age by exactly one");
    assert.deepEqual(Array.from(ind.bodyGenome), b.genome);
    assert.deepEqual(Array.from(ind.timeAllocation), b.alloc);
    agedCount++;
  }
  assert.ok(agedCount > 0, "expected survivors");
});

test("§12/§13 — genome and allocation arrays are copied at construction, not aliased", () => {
  const state = createInitialState(34);
  const ind = state.currentIndividuals[0];
  // The band centroid array must not be shared with the individual.
  const alloc = ind.timeAllocation;
  assert.ok(alloc instanceof Float64Array);
  const other = state.currentIndividuals[1];
  assert.notEqual(alloc, other.timeAllocation, "each individual owns its own allocation array");
  assert.notEqual(ind.bodyGenome, other.bodyGenome);
});

test("§20.1 — newborns are recorded with birthGeneration equal to the target generation", () => {
  const state = createInitialState(35);
  const knownIds = new Set(state.currentIndividuals.map((i) => i.id));
  for (let g = 1; g <= 5; g++) {
    advanceGeneration(state);
    for (const ind of state.currentIndividuals) {
      if (!knownIds.has(ind.id)) {
        assert.equal(ind.birthGeneration, g, `newborn ${ind.id} must carry birthGeneration ${g}`);
        assert.equal(ind.ageGenerations, 0);
        knownIds.add(ind.id);
      }
    }
  }
});
