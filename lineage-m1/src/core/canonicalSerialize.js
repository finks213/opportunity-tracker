// @ts-check
/**
 * Canonical serialization (contract §18) and canonical fixture-envelope
 * serialization (§19 B).
 *
 * Number encoding: integers as exact decimal strings; non-integers as stable
 * 17-significant-digit decimal strings (§18 permits 17-sig-digit decimals). The
 * same in-memory value always yields the same token, and distinct doubles yield
 * distinct tokens, so equal bytes <=> equal state (no tolerance comparison).
 *
 * Object keys are sorted recursively so the byte output is order-independent;
 * array order is preserved, so callers pre-sort arrays into canonical order.
 */

/**
 * Canonical numeric token.
 * @param {number} n
 * @returns {string}
 */
export function canonicalNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`canonicalNumber: non-finite value ${n}`);
  }
  if (Number.isInteger(n) && Math.abs(n) < 9.007199254740992e15) {
    // Normalize -0 to 0.
    return String(n === 0 ? 0 : n);
  }
  return n.toPrecision(17);
}

/**
 * Deterministic canonical stringify with recursive key sorting. Numbers use the
 * canonical token above. Undefined is rejected (must not appear canonically).
 * @param {*} value
 * @returns {string}
 */
export function canonicalStringify(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") return canonicalNumber(value);
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return JSON.stringify(value);
  if (ArrayBuffer.isView(value)) {
    // typed arrays (Float64Array etc.) -> array of canonical numbers
    const arr = /** @type {ArrayLike<number>} */ (value);
    let out = "[";
    for (let i = 0; i < arr.length; i++) {
      if (i > 0) out += ",";
      out += canonicalNumber(arr[i]);
    }
    return out + "]";
  }
  if (Array.isArray(value)) {
    let out = "[";
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out += ",";
      out += canonicalStringify(value[i]);
    }
    return out + "]";
  }
  if (t === "object") {
    const keys = Object.keys(value).sort();
    let out = "{";
    let first = true;
    for (const k of keys) {
      const v = value[k];
      if (v === undefined) continue;
      if (!first) out += ",";
      first = false;
      out += JSON.stringify(k) + ":" + canonicalStringify(v);
    }
    return out + "}";
  }
  throw new Error(`canonicalStringify: unsupported type ${t}`);
}

/**
 * Convert an individual to a canonical plain object.
 * @param {import("./individual.js").Individual} ind
 */
function individualToPlain(ind) {
  return {
    id: ind.id,
    parentIds: ind.parentIds === null ? null : [ind.parentIds[0], ind.parentIds[1]],
    birthGeneration: ind.birthGeneration,
    ageGenerations: ind.ageGenerations,
    bodyGenome: Array.from(ind.bodyGenome),
    timeAllocation: Array.from(ind.timeAllocation),
    birthEventId: ind.birthEventId,
  };
}

/**
 * Build the canonical plain object for biological state (§18 include/exclude).
 * @param {Object} state
 * @returns {Object}
 */
export function canonicalBiologyObject(state) {
  const individuals = state.currentIndividuals.slice().sort((a, b) => a.id - b.id).map(individualToPlain);
  const birthEvents = state.birthEvents.slice().sort((a, b) => a.id - b.id);
  const deathEvents = state.deathEvents
    .slice()
    .sort((a, b) => a.generation - b.generation || a.individualId - b.individualId);
  const matingEvents = state.biologicalMatingEvents.slice().sort((a, b) => a.id - b.id);
  const bodyMutationEvents = state.bodyMutationEvents.slice().sort((a, b) => a.id - b.id);
  const allocationMutationEvents = state.allocationMutationEvents.slice().sort((a, b) => a.id - b.id);
  const retainedGenealogy = state.retainedGenealogy
    .slice()
    .sort((a, b) => a.generation - b.generation || a.childId - b.childId);
  const prunedAncestorBoundaries = state.prunedAncestorBoundaries
    .slice()
    .sort((a, b) => a.boundaryId - b.boundaryId);

  return {
    schemaVersion: state.schemaVersion,
    configVersion: state.configVersion,
    generation: state.generation,
    nextIndividualId: state.nextIndividualId,
    nextBirthEventId: state.nextBirthEventId,
    nextMatingEventId: state.nextMatingEventId,
    nextMutationEventId: state.nextMutationEventId,
    nextAllocationMutationEventId: state.nextAllocationMutationEventId,
    currentIndividuals: individuals,
    retainedGenealogy,
    birthEvents,
    deathEvents,
    biologicalMatingEvents: matingEvents,
    bodyMutationEvents,
    allocationMutationEvents,
    prunedAncestorBoundaries,
    simRngState: state.simRng.toState(),
  };
}

/**
 * serializeCanonicalBiology(state) -> canonical string (§18).
 * Excludes observer state, tracer channels, zone bins, mating annotations,
 * Canvas/UI state, uiRng, timestamps, and runtime measurements.
 * @param {Object} state
 * @returns {string}
 */
export function serializeCanonicalBiology(state) {
  return canonicalStringify(canonicalBiologyObject(state));
}

/**
 * serializeCanonicalFixtureEnvelope(envelope) -> canonical string (§19 B).
 * Includes every envelope field (metadata included), recursively sorts keys,
 * preserves array order, and uses the same number rule as §18.
 * @param {Object} envelope parsed fixture-envelope object
 * @returns {string}
 */
export function serializeCanonicalFixtureEnvelope(envelope) {
  return canonicalStringify(envelope);
}
