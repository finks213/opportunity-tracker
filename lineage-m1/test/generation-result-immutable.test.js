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

// ---------------------------------------------------------------------------
// Revision-6 repair (Break 4 / MM-1 / R6-H): the NESTED payload.
//
// The revision-5 tests above mutate the record wrapper and stop there. Both
// revision-5 audits went one level deeper and the claim failed. Reproduced with 66
// observer failures:
//
//   result frozen true | array frozen true | record frozen true
//   thrown payload frozen false | nested payload frozen false
//   state diagnostic after external mutation:
//     {"message":"FORGED","detail":{"code":"FORGED","nested":{"value":999}}}
//
// The thrown value is no longer retained at all: each failure is converted at
// capture time into an immutable plain snapshot of approved primitive fields.
// ---------------------------------------------------------------------------

/** Advance one generation whose observer throws `thrown`, and return the record. */
function recordFromThrowing(thrown) {
  const s = createInitialState(1, C);
  advanceGeneration(s, C, { onBirth: () => { throw thrown; } });
  const r = s.lastGenerationResult;
  assert.ok(r.observerErrors.length > 0, "the fixture must actually produce observer errors");
  return { state: s, record: r.observerErrors[0] };
}

test("§4 — a thrown Error is captured as an immutable snapshot, never the Error itself", () => {
  const thrown = new Error("boom");
  // @ts-expect-error deliberately attaching a mutable payload
  thrown.detail = { code: "REAL", nested: { value: 1 } };
  const { state, record } = recordFromThrowing(thrown);

  assert.ok(Object.isFrozen(record.error), "the diagnostic must be frozen");
  assert.equal(record.error.wasError, true);
  assert.equal(record.error.name, "Error");
  assert.equal(record.error.message, "boom");
  assert.equal(typeof record.error.text, "string");
  assert.ok(record.error.text.includes("boom"));

  // The arbitrary payload is not reachable at all, so it cannot be rewritten.
  assert.equal(record.error.detail, undefined, "no arbitrary payload may be exposed");
  assert.notEqual(record.error, thrown, "the thrown object itself must not be retained");

  // Mutating the ORIGINAL after the fact must not change what state reports.
  thrown.message = "FORGED";
  // @ts-expect-error deliberate
  thrown.detail.code = "FORGED";
  assert.equal(
    state.lastGenerationResult.observerErrors[0].error.message,
    "boom",
    "the snapshot must be independent of the thrown object"
  );

  // And every direct mutation attempt throws under strict mode.
  for (const [label, fn] of Object.entries({
    "rewrite message": () => { record.error.message = "FORGED"; },
    "rewrite name": () => { record.error.name = "FORGED"; },
    "rewrite text": () => { record.error.text = "FORGED"; },
    "add a field": () => { record.error.forged = true; },
    "delete a field": () => { delete record.error.message; },
    "replace the diagnostic": () => { record.error = { message: "FORGED" }; },
  })) {
    assert.throws(fn, TypeError, `${label} must throw`);
  }
});

test("§4 — a thrown NON-Error object with nested mutable data is equally contained", () => {
  const thrown = { code: "REAL", nested: { value: 1 }, toString: () => "custom-throw" };
  const { state, record } = recordFromThrowing(thrown);

  assert.ok(Object.isFrozen(record.error));
  assert.equal(record.error.wasError, false);
  assert.equal(record.error.name, "object", "a non-Error is described by its type");
  assert.equal(record.error.message, null);
  assert.equal(record.error.stack, null);
  assert.equal(record.error.text, "custom-throw");
  assert.equal(record.error.nested, undefined, "the nested payload must not be reachable");

  thrown.nested.value = 999;
  thrown.code = "FORGED";
  const viaState = state.lastGenerationResult.observerErrors[0].error;
  assert.equal(viaState.text, "custom-throw");
  assert.equal(JSON.stringify(viaState).includes("999"), false, "no forged value may reach state");
  assert.equal(JSON.stringify(viaState).includes("FORGED"), false);
});

test("§4 — a hostile thrown value cannot break the transaction or leak a mutable object", () => {
  const hostile = { get message() { throw new Error("nope"); }, toString() { throw new Error("nope"); } };
  const { record } = recordFromThrowing(hostile);
  assert.ok(Object.isFrozen(record.error));
  assert.equal(record.error.text, "[unrepresentable thrown value]");
  assert.equal(record.error.wasError, false);
});

// ---------------------------------------------------------------------------
// REVISION-7 REPAIR (revision-6 structural audit, Finding 4).
//
// The test above covers a NON-Error with a hostile `toString`. Revision 6 guarded
// only the `text` computation and then read `err.name`, `err.message` and
// `err.stack` outside that guard — and an `Error` may legally expose any of them
// through an accessor. Reproduced with an Error whose `message` getter throws:
//
//   {"escaped":"hostile message getter","generation":1,"hasResult":false}
//
// Biology had already committed, so the caller saw a thrown transition after the
// transition succeeded and no result was published: ambiguous retry behaviour,
// which is precisely what the observer boundary exists to prevent.
// ---------------------------------------------------------------------------

/** Every requirement the audit named, for one hostile thrown value. */
function assertContained(thrown, label) {
  const clean = createInitialState(1, C);
  advanceGeneration(clean, C);
  const cleanBytes = serializeCanonicalBiology(clean);

  const s = createInitialState(1, C);
  assert.doesNotThrow(
    () => advanceGeneration(s, C, { onBirth: () => { throw thrown; } }),
    `${label}: advanceGeneration must not throw`
  );
  assert.equal(s.generation, 1, `${label}: the generation must have committed`);
  assert.equal(
    serializeCanonicalBiology(s), cleanBytes,
    `${label}: biology must equal the clean committed generation`
  );
  const r = s.lastGenerationResult;
  assert.ok(r, `${label}: lastGenerationResult must be published`);
  assert.ok(r.observerErrors.length > 0, `${label}: the failure must be recorded`);
  const d = r.observerErrors[0].error;
  assert.ok(Object.isFrozen(d), `${label}: the diagnostic must be frozen`);
  assert.equal(typeof d.text, "string", `${label}: a safe fallback text is required`);
  assert.ok(d.text.length > 0);
  assert.ok(
    typeof d.name === "string" && (d.message === null || typeof d.message === "string"),
    `${label}: every field must be a primitive or null`
  );
  return d;
}

test("§4 — an Error with a hostile message getter is contained", () => {
  const thrown = new Error("x");
  Object.defineProperty(thrown, "message", { get() { throw new Error("hostile message getter"); } });
  const d = assertContained(thrown, "hostile message");
  assert.equal(d.wasError, true);
  assert.equal(d.message, null, "an unreadable message is null, not an escape");
  assert.match(d.text, /unreadable message|Error/);
});

test("§4 — hostile name and stack accessors are contained", () => {
  for (const prop of ["name", "stack"]) {
    const thrown = new Error("boom");
    Object.defineProperty(thrown, prop, { get() { throw new Error(`hostile ${prop} getter`); } });
    const d = assertContained(thrown, `hostile ${prop}`);
    assert.ok(d[prop] === null || typeof d[prop] === "string");
  }
});

test("§4 — an Error subclass and a proxy are contained", () => {
  class Weird extends Error {
    get message() { throw new Error("subclass getter"); }
    get stack() { throw new Error("subclass stack"); }
  }
  assertContained(new Weird("x"), "Error subclass with hostile getters");

  const proxied = new Proxy(new Error("p"), {
    get() { throw new Error("proxy trap"); },
    getPrototypeOf() { throw new Error("prototype trap"); },
  });
  const d = assertContained(proxied, "hostile proxy");
  assert.equal(typeof d.text, "string");
});

test("§4 — a revoked proxy is contained", () => {
  const { proxy, revoke } = Proxy.revocable(new Error("r"), {});
  revoke();
  assertContained(proxy, "revoked proxy");
});

test("§4 — every thrown value, hostile or not, yields the same result shape", () => {
  const shapes = [];
  for (const thrown of [new Error("plain"), "a string", 42, null, undefined, { a: 1 }, Symbol("s")]) {
    const s = createInitialState(1, C);
    assert.doesNotThrow(() => advanceGeneration(s, C, { onBirth: () => { throw thrown; } }));
    const d = s.lastGenerationResult.observerErrors[0].error;
    shapes.push(Object.keys(d).sort().join(","));
    assert.ok(Object.isFrozen(d));
  }
  assert.equal(new Set(shapes).size, 1, `every diagnostic must have one shape, saw ${new Set(shapes).size}`);
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
