// @ts-check
/**
 * The generation result must be DEEPLY immutable (contract §4; revision-5 repair,
 * BUG 9 / R5-9).
 *
 * Reproduced against revision 4:
 *
 *   outer result frozen        true
 *   births frozen              true
 *   living IDs frozen          true
 *   observerErrors frozen      false     <-
 *   external push() succeeds   true      <-
 *   attached state record changes true   <-
 *
 * The same object is attached to `state.lastGenerationResult` and the public method
 * describes it as an immutable event record, so a consumer could add, remove or
 * replace observer failure records after the generation completed and thereby forge
 * the diagnostic result.
 *
 * ESM is always strict mode, so every mutation attempt below must THROW, not fail
 * silently. Each assertion fails against revision 4.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration, advanceGenerationAndCollect } from "../src/core/simulation.js";
import { currentModelConfig as C } from "../src/config/modelConfig.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";

/** A generation whose observers all threw, so observerErrors is non-empty. */
function withObserverErrors() {
  const s = createInitialState(1, C);
  advanceGeneration(s, C, {
    onBirth: () => { throw new Error("boom"); },
    afterGeneration: () => { throw new Error("prune"); },
  });
  return s;
}

test("§4 — observerErrors and every error record are deeply frozen", () => {
  const s = withObserverErrors();
  const r = s.lastGenerationResult;
  assert.ok(r.observerErrors.length > 0, "the fixture must actually produce observer errors");
  assert.ok(Object.isFrozen(r), "the outer result must be frozen");
  assert.ok(Object.isFrozen(r.births), "births must be frozen");
  assert.ok(Object.isFrozen(r.livingIds), "livingIds must be frozen");
  assert.ok(Object.isFrozen(r.observerErrors), "observerErrors must be frozen");
  for (const e of r.observerErrors) {
    assert.ok(Object.isFrozen(e), "each observer-error record must be frozen");
  }
  for (const b of r.births) assert.ok(Object.isFrozen(b), "each birth record must be frozen");
});

test("§4 — every mutation of the result throws and changes nothing", () => {
  const s = withObserverErrors();
  const r = s.lastGenerationResult;
  const before = JSON.stringify({
    n: r.observerErrors.length,
    phases: r.observerErrors.map((e) => e.phase),
    births: r.births.length,
    living: r.livingIds.length,
  });

  const attempts = {
    "push onto observerErrors": () => r.observerErrors.push({ phase: "FORGED" }),
    "pop from observerErrors": () => r.observerErrors.pop(),
    "replace an error entry": () => { r.observerErrors[0] = { phase: "FORGED" }; },
    "mutate an error field": () => { r.observerErrors[0].phase = "FORGED"; },
    "add a field to an error": () => { r.observerErrors[0].forged = true; },
    "delete an error field": () => { delete r.observerErrors[0].phase; },
    "replace the observerErrors array": () => { r.observerErrors = []; },
    "push onto births": () => r.births.push({}),
    "mutate a birth record": () => { r.births[0].childId = -1; },
    "mutate livingIds": () => { r.livingIds[0] = -1; },
    "replace generation": () => { r.generation = 999; },
    "add a field to the result": () => { r.forged = true; },
  };
  for (const [label, fn] of Object.entries(attempts)) {
    assert.throws(fn, TypeError, `${label} must throw under strict mode`);
  }

  const after = JSON.stringify({
    n: r.observerErrors.length,
    phases: r.observerErrors.map((e) => e.phase),
    births: r.births.length,
    living: r.livingIds.length,
  });
  assert.equal(after, before, "no value may change");
});

test("§4 — the state-attached record cannot be altered through the returned one", () => {
  const s = withObserverErrors();
  const returned = s.lastGenerationResult;
  const n = s.lastGenerationResult.observerErrors.length;
  assert.throws(() => returned.observerErrors.push({ phase: "FORGED" }), TypeError);
  assert.equal(
    s.lastGenerationResult.observerErrors.length,
    n,
    "the record attached to state must be unchanged"
  );
  assert.ok(
    s.lastGenerationResult.observerErrors.every((e) => e.phase !== "FORGED"),
    "no forged phase may appear on state"
  );
});

test("§4 — a clean generation's result is equally frozen, with an empty frozen error array", () => {
  const s = createInitialState(1, C);
  const r = advanceGenerationAndCollect(s, C);
  assert.deepEqual([...r.observerErrors], [], "a clean run records no errors");
  assert.ok(Object.isFrozen(r.observerErrors), "the empty array must still be frozen");
  assert.throws(() => r.observerErrors.push({ phase: "FORGED" }), TypeError);
});

test("§4 — freezing does not put observer errors into canonical biology", () => {
  const s = withObserverErrors();
  const bytes = serializeCanonicalBiology(s);
  for (const forbidden of ["observerError", "lastGenerationResult", "livingIds", "FORGED"]) {
    assert.ok(!bytes.includes(forbidden), `canonical bytes must not contain ${forbidden}`);
  }
  // And the biology equals a clean no-observer generation.
  const clean = createInitialState(1, C);
  advanceGeneration(clean, C);
  assert.equal(bytes, serializeCanonicalBiology(clean));
});
