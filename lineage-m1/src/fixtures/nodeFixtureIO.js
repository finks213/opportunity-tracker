// @ts-check
/**
 * Node-only fixture IO: raw-byte reading and SHA-256 hashing (contract §19 A).
 * Imported by tests and tools, never by the browser Canvas probe.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  EXPECTED_FIXTURE_SHA256,
  parseEnvelope,
  assertFixtureConsistency,
} from "./definingFixtureV1.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the checked-in fixture. */
export const FIXTURE_PATH = join(HERE, "..", "..", "fixtures", "defining_fixture_v1.json");

/**
 * SHA-256 hex of a byte buffer.
 * @param {Buffer|Uint8Array} bytes
 * @returns {string}
 */
export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Read raw fixture bytes. @returns {Buffer} */
export function readFixtureBytes() {
  return readFileSync(FIXTURE_PATH);
}

/** Read fixture text (utf-8). @returns {string} */
export function readFixtureText() {
  return readFileSync(FIXTURE_PATH, "utf8");
}

/**
 * Read, hash-verify (§19 A), parse, and consistency-check the fixture.
 * Throws on any mismatch. Returns the parsed envelope and raw hash.
 * @returns {{envelope:Object, rawSha256:string, recomputedLoads:number[]}}
 */
export function loadValidatedFixture() {
  const bytes = readFixtureBytes();
  const rawSha256 = sha256Hex(bytes);
  if (rawSha256 !== EXPECTED_FIXTURE_SHA256) {
    throw new Error(`fixture raw SHA-256 mismatch: got ${rawSha256}, expected ${EXPECTED_FIXTURE_SHA256}`);
  }
  const envelope = parseEnvelope(bytes.toString("utf8"));
  const { recomputedLoads } = assertFixtureConsistency(envelope);
  return { envelope, rawSha256, recomputedLoads };
}
