// @ts-check
/**
 * The authoritative SHA-256 model identity — Node only (contract §§9, 18, 21.7).
 *
 * Revision-5 repair (BUG 3 / R5-4). Every tool, test and report that publishes a
 * `modelDefinitionHash` MUST call `modelDefinitionHash()` from this module. No
 * caller may serialize or hash the model itself. Revision 4 had two competing
 * hash paths under one field name, and the §9 trait evidence carried the wrong
 * one (`432391e5…` instead of `dc444865…`).
 *
 * NODE ONLY. This module imports `node:crypto` and must never appear in the
 * browser probe's import graph. The browser uses the universal FNV-1a form in
 * `modelIdentity.js`, computed over the same canonical text.
 * `test/dependency-boundary.test.js` asserts that nothing reachable from
 * `src/main.js` imports this file.
 */

import { createHash } from "node:crypto";
import { canonicalModelDefinitionText } from "./modelIdentity.js";
import { currentModelConfig, modelDefinitionFor } from "./modelConfig.js";

/**
 * The canonical text for a configuration's complete model definition.
 * @param {Object} [config]
 * @returns {string}
 */
export function canonicalModelTextFor(config = currentModelConfig) {
  return canonicalModelDefinitionText(modelDefinitionFor(config));
}

/**
 * THE authoritative published model identity: SHA-256 over the canonical text of
 * the complete model definition.
 *
 * @param {Object} [config]
 * @returns {string} 64 lowercase hex characters
 */
export function modelDefinitionHash(config = currentModelConfig) {
  return createHash("sha256").update(canonicalModelTextFor(config)).digest("hex");
}

/**
 * The tuning-config subset hash. **NONAUTHORITATIVE** — retained only so
 * revision-1 and revision-2 evidence stays traceable. It does not identify the
 * model: a changed trait effect moves survival without moving this value.
 *
 * @param {Object} [config]
 * @returns {string} 64 lowercase hex characters
 */
export function tuningConfigHash(config = currentModelConfig) {
  return createHash("sha256").update(canonicalModelDefinitionText(config)).digest("hex");
}
