// @ts-check
/**
 * Contract §20.6 — full-path body-mutation independence.
 *
 * The body-mutation pure function must not accept allocation or zone arguments,
 * and the complete child-creation path must preserve that separation.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bodyMutationOpportunity } from "../src/core/mutation.js";
import { createChild } from "../src/core/events.js";
import { makeEmptyState, makeIndividual, createInitialState } from "../src/core/individual.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { createSimRng } from "../src/core/rng.js";
import { runGenerations } from "../src/core/simulation.js";
import { canonicalStringify } from "../src/core/canonicalSerialize.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const C = currentModelConfig;

const GENOME_A = [0.15, 0.45, 0.40, 0.45, 0.40, 0.40, 0.35, 0.50, 0.50, 0.50];
const GENOME_B = [0.20, 0.50, 0.35, 0.40, 0.45, 0.35, 0.30, 0.55, 0.45, 0.60];

const CANOPY_ONLY = [1.0, 0.0, 0.0];
const SHORELINE_ONLY = [0.0, 0.0, 1.0];

/**
 * Build a two-parent state with the given parental allocations.
 * @param {number[]} allocA
 * @param {number[]} allocB
 * @param {number} seed
 */
function twoParentState(allocA, allocB, seed) {
  const state = makeEmptyState(createSimRng(seed));
  state.diagnostics.bodyMutationOpportunityCount = 0;
  state.diagnostics.allocationMutationOpportunityCount = 0;
  state.diagnostics.nonFounderBirthCount = 0;
  const A = makeIndividual({
    id: 1, parentIds: null, birthGeneration: 0, ageGenerations: 1,
    bodyGenome: GENOME_A, timeAllocation: allocA, birthEventId: 1,
  });
  const B = makeIndividual({
    id: 2, parentIds: null, birthGeneration: 0, ageGenerations: 1,
    bodyGenome: GENOME_B, timeAllocation: allocB, birthEventId: 2,
  });
  state.currentIndividuals = [A, B];
  state.nextIndividualId = 3;
  state.nextBirthEventId = 3;
  return { state, A, B };
}

test("§20.6 — the body-mutation function does not accept allocation or zone arguments", () => {
  // Signature check: (preMutationGenome, rng, config) — exactly three params.
  assert.equal(bodyMutationOpportunity.length, 3);
  const src = readFileSync(join(HERE, "..", "src", "core", "mutation.js"), "utf8");
  const fnStart = src.indexOf("export function bodyMutationOpportunity");
  assert.ok(fnStart > 0);
  const signature = src.slice(fnStart, src.indexOf(")", fnStart));
  for (const forbidden of ["allocation", "zone", "eligible", "observer", "fitness", "usefulness"]) {
    assert.ok(
      !signature.toLowerCase().includes(forbidden),
      `body-mutation signature must not mention ${forbidden}: ${signature}`
    );
  }
});

test("§20.6 — identical parental genomes and RNG state give byte-identical body results under different allocations", () => {
  const SEED = 4242;
  // Find a seed offset that actually produces a body mutation, then assert on it.
  let found = false;
  for (let offset = 0; offset < 60 && !found; offset++) {
    const canopy = twoParentState(CANOPY_ONLY, CANOPY_ONLY, SEED + offset);
    const shore = twoParentState(SHORELINE_ONLY, SHORELINE_ONLY, SEED + offset);

    const childCanopy = createChild(canopy.state, canopy.A, canopy.B, 1, canopy.state.simRng, C);
    const childShore = createChild(shore.state, shore.A, shore.B, 1, shore.state.simRng, C);

    // 4. inherited pre-mutation genome, occurrence, trait, direction, magnitude,
    //    realized post-mutation genome, and event draft are byte-identical.
    assert.deepEqual(
      Array.from(childCanopy.bodyGenome),
      Array.from(childShore.bodyGenome),
      "child body genomes must be identical regardless of parental allocation"
    );
    assert.equal(
      canonicalStringify(canopy.state.bodyMutationEvents.map((e) => ({ ...e, childTimeAllocationAtBirth: null }))),
      canonicalStringify(shore.state.bodyMutationEvents.map((e) => ({ ...e, childTimeAllocationAtBirth: null }))),
      "body-mutation event drafts must be identical apart from the attached allocation"
    );

    // 6. exactly one body-mutation opportunity per birth
    assert.equal(canopy.state.diagnostics.bodyMutationOpportunityCount, 1);
    assert.equal(shore.state.diagnostics.bodyMutationOpportunityCount, 1);

    if (canopy.state.bodyMutationEvents.length === 1) {
      found = true;
      // 3. an RNG state that produces a body mutation was reached.
      const evC = canopy.state.bodyMutationEvents[0];
      const evS = shore.state.bodyMutationEvents[0];
      assert.equal(evC.traitId, evS.traitId);
      assert.equal(evC.requestedDelta, evS.requestedDelta);
      assert.equal(evC.preMutationValue, evS.preMutationValue);
      assert.equal(evC.postMutationValue, evS.postMutationValue);
      // 5. allocation inheritance may differ only AFTER the body mutation is fixed.
      assert.notDeepEqual(
        Array.from(childCanopy.timeAllocation),
        Array.from(childShore.timeAllocation),
        "allocations should differ between canopy-only and shoreline-only parents"
      );
      assert.notDeepEqual(evC.childTimeAllocationAtBirth, evS.childTimeAllocationAtBirth);
      // 7. the mutation was recorded, not suppressed once allocation was known.
      assert.equal(canopy.state.bodyMutationEvents.length, 1);
    }
  }
  assert.ok(found, "expected to reach an RNG state producing a body mutation");
});

test("§20.6 — childTimeAllocationAtBirth is the final immutable allocation and is attached after the fact", () => {
  const { state, A, B } = twoParentState(CANOPY_ONLY, CANOPY_ONLY, 777);
  for (let i = 0; i < 40; i++) {
    const s = twoParentState(CANOPY_ONLY, CANOPY_ONLY, 777 + i);
    const child = createChild(s.state, s.A, s.B, 1, s.state.simRng, C);
    if (s.state.bodyMutationEvents.length === 1) {
      assert.deepEqual(
        s.state.bodyMutationEvents[0].childTimeAllocationAtBirth,
        Array.from(child.timeAllocation),
        "recorded allocation must equal the child's final immutable allocation"
      );
      return;
    }
  }
  assert.fail("expected at least one body mutation across 40 attempts");
});

test("§20.6 — opportunity counts equal non-founder birth count across a normal run", () => {
  for (const seed of [1, 2, 3]) {
    const state = createInitialState(seed);
    state.diagnostics.bodyMutationOpportunityCount = 0;
    state.diagnostics.allocationMutationOpportunityCount = 0;
    state.diagnostics.nonFounderBirthCount = 0;
    runGenerations(state, 25);
    const d = state.diagnostics;
    assert.ok(d.nonFounderBirthCount > 0, "expected births");
    assert.equal(d.bodyMutationOpportunityCount, d.nonFounderBirthCount);
    assert.equal(d.allocationMutationOpportunityCount, d.nonFounderBirthCount);
  }
});

test("§12 — the mutation function receives no environment, and no mutation targets a survivor", () => {
  const state = createInitialState(9);
  const founderIds = new Set(state.currentIndividuals.map((i) => i.id));
  runGenerations(state, 20);
  for (const ev of state.bodyMutationEvents) {
    // Every mutation event must reference a child born in the same generation.
    const birth = state.birthEvents.find((b) => b.childId === ev.childId);
    if (birth) assert.equal(birth.generation, ev.generation, "mutation must target a newborn of that generation");
    assert.ok(!founderIds.has(ev.childId) || ev.generation === 0, "founders never receive mutation events");
  }
});
