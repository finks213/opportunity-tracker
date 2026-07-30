// @ts-check
/**
 * THE authoritative model-identity functions (contract §§9, 18, 21.7).
 *
 * Revision-5 repair. Revision 4 had three separate serializations of the model
 * definition in flight, two of which were hashed and both fields named
 * `modelDefinitionHash`:
 *
 *   canonicalStringify(modelDefinitionFor(c))   2,995 bytes  dc444865…  fixture, characterization, edge-only
 *   canonicalModelText(modelDefinitionFor(c))   2,995 bytes  dc444865…  runtime identity input (same text)
 *   JSON.stringify(modelDefinitionFor(c))       1,793 bytes  432391e5…  audit/meaningful-trait-gate.json
 *
 * The §9 trait evidence therefore carried a model identity contradicting the one
 * printed in the report and carried by every other config-2 evidence file. A
 * consumer could not establish from the named field that all required evidence
 * belonged to one model.
 *
 * This module is now the ONLY place the model definition is serialized for
 * identity. No tool, test, report or state may serialize or hash the model
 * independently — `test/model-hash-provenance.test.js` enforces that by scanning
 * for competing serializations.
 *
 * BROWSER SAFETY. Everything here is pure and dependency-free, so the Canvas
 * probe can carry the same identity as the Node evidence. The SHA-256 form needs
 * `node:crypto` and therefore lives in the Node-only companion module
 * `modelIdentityNode.js`, which browser code must never import.
 *
 * TWO DIGESTS, ONE TEXT. `modelDefinitionHash` (SHA-256, Node) and
 * `modelIdentityFor` (128-bit FNV-1a, universal) are computed over the *same*
 * canonical text. That isomorphism is asserted by the test suite. The SHA-256
 * form is the authoritative published identity; the FNV form exists only because
 * the browser has no `node:crypto` and the contract forbids a runtime
 * dependency.
 */

/**
 * The one canonical text of a model definition — the sole digest input.
 *
 * Deterministic and key-sorted, with 17-significant-digit floats, matching the
 * canonical biological serializer byte-for-byte. It is duplicated here rather
 * than imported because `canonicalSerialize.js` imports config, so importing it
 * from config would be circular. `test/model-hash-provenance.test.js` asserts
 * the two produce identical text for the shipped model, so the duplication
 * cannot silently drift.
 *
 * @param {Object} definition a complete model definition
 * @returns {string}
 */
export function canonicalModelDefinitionText(definition) {
  const walk = (v) => {
    if (v === null) return "null";
    if (Array.isArray(v)) return "[" + v.map(walk).join(",") + "]";
    if (typeof v === "object") {
      return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + walk(v[k])).join(",") + "}";
    }
    if (typeof v === "number") {
      return Number.isInteger(v) ? String(v === 0 ? 0 : v) : v.toPrecision(17);
    }
    return JSON.stringify(v);
  };
  return walk(definition);
}

/** Length of the runtime identity digest, in hex characters. */
export const MODEL_IDENTITY_DIGEST_LENGTH = 32;

/** A well-formed runtime identity digest: exactly 32 lowercase hex characters. */
export const MODEL_IDENTITY_DIGEST_PATTERN = /^[0-9a-f]{32}$/;

/**
 * 128-bit FNV-1a over the canonical text, as four interleaved 32-bit lanes.
 *
 * Universal (no `node:crypto`), deterministic, and dependency-free, so the
 * browser probe and the Node evidence carry the same identity value.
 *
 * @param {string} canonicalText
 * @returns {string} 32 lowercase hex characters
 */
export function modelIdentityDigest(canonicalText) {
  // Four interleaved 32-bit FNV-1a lanes give a 128-bit digest without BigInt.
  //
  // This is the EXACT revision-4 algorithm, preserved byte-for-byte. It moved
  // module in revision 5 (R5-4) so that the model is serialized and digested in
  // one place, and the move must not change any value: `modelIdentityHash` is
  // part of canonical biological state, so altering this function would move the
  // fixture and observer-invariance hashes for no contract reason. The digest is
  // unchanged; only its location is.
  let h0 = 0x811c9dc5, h1 = 0x01000193, h2 = 0x9e3779b9, h3 = 0x85ebca6b;
  for (let i = 0; i < canonicalText.length; i++) {
    const c = canonicalText.charCodeAt(i);
    h0 = Math.imul(h0 ^ c, 0x01000193) >>> 0;
    h1 = Math.imul(h1 ^ (c + i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c ^ (i << 3)), 0x01000193) >>> 0;
    h3 = Math.imul(h3 ^ (c + (i << 7)), 0x01000193) >>> 0;
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h0) + hex(h1) + hex(h2) + hex(h3);
}

/**
 * True when a value is a well-formed runtime identity digest.
 *
 * Used by the mandatory canonical-state guard (revision-5 R5-3), which must
 * reject not only mismatches but missing, null, empty and malformed values.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isWellFormedModelIdentity(value) {
  return typeof value === "string" && MODEL_IDENTITY_DIGEST_PATTERN.test(value);
}
