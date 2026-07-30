// @ts-check
/**
 * One authoritative model identity across every evidence file (contract §§9, 18;
 * revision-5 repair, BUG 3 / R5-4), and that identity is MANDATORY on canonical
 * state (BUG 4 / R5-3).
 *
 * Reproduced against revision 4:
 *
 *   canonical model text, 2,995 bytes      dc444865…   fixture / characterization / edge-only
 *   JSON.stringify text,   1,793 bytes     432391e5…   audit/meaningful-trait-gate.json
 *
 * Both fields were named `modelDefinitionHash`, so a consumer could not establish
 * from the named field that all required evidence belonged to one model.
 *
 *   $ node -e '... delete state.modelIdentityHash; advance under two models ...'
 *   official population after one generation: 141
 *   altered  population after one generation: 165
 *   mismatch rejection: NONE
 *   same configVersion: true lineage-m1-config-2
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  modelDefinitionHash,
  tuningConfigHash,
  canonicalModelTextFor,
} from "../src/config/modelIdentityNode.js";
import {
  canonicalModelDefinitionText,
  modelIdentityDigest,
  isWellFormedModelIdentity,
  MODEL_IDENTITY_DIGEST_PATTERN,
} from "../src/config/modelIdentity.js";
import {
  currentModelConfig,
  legacyModelConfigV1,
  modelDefinitionFor,
  modelIdentityFor,
  SCHEMA_VERSION,
} from "../src/config/modelConfig.js";
import { canonicalStringify, serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import { deserializeCanonicalBiology } from "../src/fixtures/definingFixtureV1.js";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { deepClonePlain } from "../src/config/modelDefinition.js";
import { stripCommentsAndStrings } from "../tools/writeFinalReport.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

/** Every evidence file that publishes a model identity for the CURRENT config. */
const CONFIG2_EVIDENCE = [
  "audit/fixture-results.json",
  "audit/characterization-results.json",
  "audit/edge-only-traversal-results.json",
  "audit/meaningful-trait-gate.json",
];

test("§9/§18 — every evidence file publishes the same authoritative modelDefinitionHash", () => {
  const expected = modelDefinitionHash(currentModelConfig);
  assert.match(expected, /^[0-9a-f]{64}$/);
  const seen = new Map();
  for (const rel of CONFIG2_EVIDENCE) {
    assert.ok(existsSync(join(ROOT, rel)), `${rel} must exist`);
    const d = readJson(rel);
    assert.ok(d.modelDefinitionHash, `${rel} must publish modelDefinitionHash`);
    seen.set(rel, d.modelDefinitionHash);
  }
  const distinct = new Set(seen.values());
  assert.equal(
    distinct.size,
    1,
    `evidence files disagree on the model identity:\n` +
    [...seen].map(([k, v]) => `  ${k} -> ${v}`).join("\n")
  );
  assert.equal(
    [...distinct][0],
    expected,
    "the published identity must equal the authoritative function's output"
  );
});

test("§9/§18 — no tool serializes or hashes the model independently", () => {
  // The invariant: only `src/config/modelIdentity*.js` may serialize the model for
  // identity. A second provenance path anywhere else is exactly how revision 4
  // ended up with two different hashes under one field name.
  const allowed = new Set(["src/config/modelIdentity.js", "src/config/modelIdentityNode.js"]);
  const offenders = [];
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) { walk(rel); continue; }
      if (name.endsWith(".js") || name.endsWith(".mjs")) files.push(rel);
    }
  };
  for (const top of ["src", "tools"]) walk(top);
  assert.ok(files.length > 20, `expected to scan the whole tree, saw ${files.length} files`);

  for (const rel of files) {
    if (allowed.has(rel)) continue;
    // Scan CODE, not prose. `writeAuditEvidence.mjs` documents the removed
    // revision-4 path in a comment; a raw substring scan flags that comment and so
    // would punish the file for recording what was fixed. Use is a violation;
    // mention is the record the audit asks for.
    const text = stripCommentsAndStrings(read(rel));
    if (/JSON\.stringify\(\s*modelDefinitionFor/.test(text)) {
      offenders.push(`${rel}: JSON.stringify(modelDefinitionFor(...)) — the revision-4 divergent path`);
    }
    // A createHash call in the same statement as a model definition.
    for (const m of text.matchAll(/createHash\([^)]*\)([^;]{0,200});/g)) {
      if (/modelDefinition|canonicalModelText|modelIdentity/.test(m[1])) {
        offenders.push(`${rel}: hashes a model definition directly — ${m[0].slice(0, 90).replace(/\s+/g, " ")}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `independent model hashing found:\n  ${offenders.join("\n  ")}`);
});

test("§9/§18 — the two digest forms are computed over the SAME canonical text", () => {
  const text = canonicalModelTextFor(currentModelConfig);
  // The canonical biological serializer must produce identical text, or the
  // duplication in modelIdentity.js has drifted.
  assert.equal(
    text,
    canonicalStringify(modelDefinitionFor(currentModelConfig)),
    "canonicalModelDefinitionText must match canonicalStringify byte-for-byte"
  );
  assert.equal(modelDefinitionHash(currentModelConfig), createHash("sha256").update(text).digest("hex"));
  assert.equal(modelIdentityFor(currentModelConfig), modelIdentityDigest(text));
  // And the runtime form is well-formed.
  assert.match(modelIdentityFor(currentModelConfig), MODEL_IDENTITY_DIGEST_PATTERN);
});

test("§9/§18 — the subset hash is different, and is never the published identity", () => {
  const subset = tuningConfigHash(currentModelConfig);
  const full = modelDefinitionHash(currentModelConfig);
  assert.notEqual(subset, full, "the two must be distinguishable");
  for (const rel of CONFIG2_EVIDENCE) {
    const d = readJson(rel);
    assert.notEqual(
      d.modelDefinitionHash,
      subset,
      `${rel} must not publish the tuning-only subset hash as the model identity`
    );
  }
});

test("§9 — changing any biology-affecting value changes the authoritative identity", () => {
  const base = modelDefinitionHash(currentModelConfig);
  const cases = {
    zoneCapacity: (c) => { c.zoneCapacity = [56, 55, 55]; },
    selectionSlope: (c) => { c.selectionSlope = c.selectionSlope + 1e-9; },
    fitnessZero: (c) => { c.fitnessZero = c.fitnessZero + 1e-9; },
    parentalUseEpsilon: (c) => { c.parentalUseEpsilon = c.parentalUseEpsilon + 1e-9; },
    offspringPerPair: (c) => { c.offspringPerPair = c.offspringPerPair + 1; },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    const forged = deepClonePlain(currentModelConfig);
    mutate(forged);
    assert.notEqual(modelDefinitionHash(forged), base, `${label} must move the authoritative identity`);
    assert.notEqual(modelIdentityFor(forged), modelIdentityFor(currentModelConfig), `${label} must move the runtime identity`);
  }
  // The two shipped configurations must not collide.
  assert.notEqual(modelDefinitionHash(legacyModelConfigV1), base);
});

// ---------------------------------------------------------------------------
// R5-3 / BUG 4 — the identity is MANDATORY on canonical state
// ---------------------------------------------------------------------------

/** Everything that must be untouched when a state is rejected. */
function snapshot(s) {
  return JSON.stringify({
    bytes: (() => { try { return serializeCanonicalBiology(s); } catch { return "UNSERIALIZABLE"; } })(),
    rng: s.simRng.toState(),
    gen: s.generation,
    pop: s.currentIndividuals.length,
    births: s.birthEvents.length,
    deaths: s.deathEvents.length,
    matings: s.biologicalMatingEvents.length,
    bodyMut: s.bodyMutationEvents.length,
    allocMut: s.allocationMutationEvents.length,
    nextId: s.nextIndividualId,
    nextBirth: s.nextBirthEventId,
    nextMating: s.nextMatingEventId,
    nextMut: s.nextMutationEventId,
    nextAlloc: s.nextAllocationMutationEventId,
  });
}

test("§18 — a state missing modelIdentityHash is rejected, not advanced", () => {
  for (const [label, value] of [["deleted", Symbol("delete")], ["undefined", undefined], ["null", null], ["empty", ""]]) {
    const s = createInitialState(5, currentModelConfig);
    if (typeof value === "symbol") delete s.modelIdentityHash;
    else s.modelIdentityHash = value;
    const before = snapshot(s);
    assert.throws(
      () => advanceGeneration(s, currentModelConfig),
      /missing model identity/,
      `${label}: must be rejected`
    );
    assert.equal(snapshot(s), before, `${label}: nothing may change`);
  }
});

test("§18 — a malformed or unknown model identity is rejected", () => {
  const malformed = ["abc123", "69DEE399EC8A50CC7E1231959D2E31AF", "z".repeat(32), "0".repeat(31), "0".repeat(33)];
  for (const bad of malformed) {
    const s = createInitialState(5, currentModelConfig);
    s.modelIdentityHash = bad;
    const before = snapshot(s);
    assert.throws(() => advanceGeneration(s, currentModelConfig), /malformed model identity/, `${bad}`);
    assert.equal(snapshot(s), before);
    assert.equal(isWellFormedModelIdentity(bad), false);
  }
  // A well-formed but unknown digest is a mismatch, not a malformation.
  const s = createInitialState(5, currentModelConfig);
  s.modelIdentityHash = "0".repeat(32);
  const before = snapshot(s);
  assert.throws(() => advanceGeneration(s, currentModelConfig), /model mismatch/);
  assert.equal(snapshot(s), before);
});

test("§18 — same version, different model is rejected with state untouched", () => {
  const altered = deepClonePlain(currentModelConfig);
  altered.zoneCapacity = [90, 90, 90];
  assert.equal(altered.version, currentModelConfig.version, "the version label is deliberately identical");

  const s = createInitialState(5, currentModelConfig);
  const before = snapshot(s);
  assert.throws(() => advanceGeneration(s, altered), /model mismatch/);
  assert.equal(snapshot(s), before, "no RNG draw, counter, event or byte may change");

  // And the legitimate model still advances.
  advanceGeneration(s, currentModelConfig);
  assert.equal(s.generation, 1);
});

test("§18 — canonical serialization is TOTAL: an undefined mandatory field throws", () => {
  // Revision 4's serializer silently skipped undefined properties, which is how
  // bytes lost the field and then deserialized into an unguarded state.
  const s = createInitialState(5, currentModelConfig);
  s.modelIdentityHash = undefined;
  assert.throws(() => serializeCanonicalBiology(s), /property "modelIdentityHash" is undefined/);
});

test("§18 — deserialization refuses bytes with no usable identity or an older schema", () => {
  const s = createInitialState(5, currentModelConfig);
  const obj = JSON.parse(serializeCanonicalBiology(s));
  const clone = () => JSON.parse(JSON.stringify(obj));

  const noField = clone(); delete noField.modelIdentityHash;
  assert.throws(() => deserializeCanonicalBiology(JSON.stringify(noField)), /no usable model identity/);

  const nulled = clone(); nulled.modelIdentityHash = null;
  assert.throws(() => deserializeCanonicalBiology(JSON.stringify(nulled)), /no usable model identity/);

  const older = clone(); older.schemaVersion = "lineage-biological-state-1";
  assert.throws(() => deserializeCanonicalBiology(JSON.stringify(older)), /unsupported biological schema/);

  // The legitimate round trip still works and still advances.
  const round = deserializeCanonicalBiology(serializeCanonicalBiology(s));
  assert.equal(round.schemaVersion, SCHEMA_VERSION);
  advanceGeneration(round, currentModelConfig);
  assert.equal(round.generation, 1);
});

test("§18 — the schema version marks the identity as part of the contract", () => {
  assert.equal(SCHEMA_VERSION, "lineage-biological-state-2");
  const s = createInitialState(1, currentModelConfig);
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.ok(isWellFormedModelIdentity(s.modelIdentityHash));
  // The identity must be inside the canonical bytes, not merely on the object.
  const bytes = serializeCanonicalBiology(s);
  assert.ok(bytes.includes(s.modelIdentityHash), "the identity must be part of canonical biology");
});
