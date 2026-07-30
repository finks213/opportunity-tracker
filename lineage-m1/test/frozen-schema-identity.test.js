// @ts-check
/**
 * The canonical biological schema identifier is frozen by the governing contract
 * and may not be changed by the implementation (revision-6 repair, MC-1 / R6-A).
 *
 * The contract's deterministic hydration rule requires:
 *
 *   schemaVersion = "lineage-biological-state-1"
 *
 * Revision 5 declared `lineage-biological-state-2` in `src/config/modelConfig.js`,
 * wrote it in fixture hydration, and changed `test/defining-fixture-snapshot.test.js`
 * to require the new value. Reproduced:
 *
 *   contract requires : lineage-biological-state-1
 *   revision 5 declares: lineage-biological-state-2
 *
 * Changing the code and its oracle together does not amend the frozen authority;
 * it only makes the two agree with each other.
 *
 * The bump was defended as stopping a pre-identity state from masquerading as
 * current. The second half of this file is the reason that defence does not hold:
 * every identity rejection is unconditional and fires under the restored schema, so
 * nothing was lost by restoring it. If a future change were to make an identity
 * rejection depend on the schema label again, these tests fail.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { SCHEMA_VERSION, currentModelConfig as C } from "../src/config/modelConfig.js";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import { deserializeCanonicalBiology } from "../src/fixtures/definingFixtureV1.js";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

/** The value frozen by the contract. Written out, not imported, so it is an oracle. */
const CONTRACT_SCHEMA = "lineage-biological-state-1";

test("§19 — the declared schema is the contract-frozen identifier", () => {
  assert.equal(SCHEMA_VERSION, CONTRACT_SCHEMA);
});

test("§19 — every constructed state carries the frozen identifier", () => {
  const s = createInitialState(1, C);
  assert.equal(s.schemaVersion, CONTRACT_SCHEMA);
  advanceGeneration(s, C);
  assert.equal(s.schemaVersion, CONTRACT_SCHEMA, "advancing must not relabel the schema");
  const bytes = serializeCanonicalBiology(s);
  assert.equal(JSON.parse(bytes).schemaVersion, CONTRACT_SCHEMA, "and neither must serialization");
});

test("§19 — the hydrated defining fixture carries the frozen identifier", async () => {
  const { hydrateDefiningFixtureV1, parseEnvelope } = await import("../src/fixtures/definingFixtureV1.js");
  const env = parseEnvelope(readFileSync(join(ROOT, "fixtures", "defining_fixture_v1.json"), "utf8"));
  const state = hydrateDefiningFixtureV1(env, 1, C);
  assert.equal(state.schemaVersion, CONTRACT_SCHEMA);
});

test("§19 — no source or test file requires the revision-5 schema label", () => {
  // The oracle drift itself: a test that demanded the changed value.
  for (const rel of [
    "src/config/modelConfig.js", "src/fixtures/definingFixtureV1.js", "src/core/individual.js",
    "test/defining-fixture-snapshot.test.js", "test/model-hash-provenance.test.js",
  ]) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes("lineage-biological-state-2")) continue;
      // Naming it inside an explanation of what was withdrawn is required.
      const context = lines.slice(Math.max(0, i - 12), i + 3).join(" ");
      assert.match(
        context,
        /[Rr]evision 5|withdrawn|restored|drift|MC-1|must be rejected/,
        `${rel}:${i + 1} asserts the revision-5 schema label outside a withdrawal:\n  ${lines[i].trim()}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// The identity rejections that the schema bump was supposed to provide, proven
// to hold under the restored schema.
// ---------------------------------------------------------------------------

/** Canonical bytes of a valid state, as a mutable plain object. */
function plainState() {
  return JSON.parse(serializeCanonicalBiology(createInitialState(1, C)));
}

test("§18 — a state with NO model identity is rejected under the frozen schema", () => {
  const p = plainState();
  assert.equal(p.schemaVersion, CONTRACT_SCHEMA);
  delete p.modelIdentityHash;
  assert.throws(
    () => deserializeCanonicalBiology(JSON.stringify(p)),
    /no usable model identity/,
    "deserialization must refuse it"
  );
  // ...and the guard inside advancement is independent of deserialization.
  const s = createInitialState(1, C);
  delete s.modelIdentityHash;
  assert.throws(() => advanceGeneration(s, C), /missing model identity/);
});

test("§18 — malformed and mismatched identities are rejected under the frozen schema", () => {
  for (const bad of ["", "not-a-digest", "ABCDEF", 12345, null]) {
    const s = createInitialState(1, C);
    // @ts-expect-error deliberately wrong
    s.modelIdentityHash = bad;
    assert.throws(
      () => advanceGeneration(s, C),
      /missing model identity|malformed model identity/,
      `identity ${JSON.stringify(bad)} must be rejected`
    );
  }
  const s = createInitialState(1, C);
  s.modelIdentityHash = "0".repeat(32);
  assert.throws(() => advanceGeneration(s, C), /model mismatch/);
});

test("§18 — the rejections do not depend on the schema string", () => {
  // The point of MC-1: identity enforcement is orthogonal to the label. A state
  // bearing the frozen label with a deleted identity is still refused, and a state
  // bearing any other label is refused as an unsupported schema.
  const p = plainState();
  delete p.modelIdentityHash;
  assert.throws(() => deserializeCanonicalBiology(JSON.stringify(p)), /no usable model identity/);

  const q = plainState();
  q.schemaVersion = "lineage-biological-state-2";   // the revision-5 label, now unsupported
  assert.throws(
    () => deserializeCanonicalBiology(JSON.stringify(q)),
    /unsupported biological schema/,
    "a state declaring any other schema is refused"
  );
});
