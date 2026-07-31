// @ts-check
/**
 * The frozen overlapping-generation lifecycle (contract §11).
 *
 * A call that advances a state from generation g performs the transition into
 * generation g+1. Every biological event created during that transition uses
 * generation = targetGeneration; state.generation flips to targetGeneration
 * exactly once, after the next population and all events are assembled.
 *
 * TRANSACTION LAW (revision-4 repair). The complete biological generation is
 * calculated and committed BEFORE any observer callback runs. Revision 3 invoked
 * `hooks.onBirth` inside the transaction, so an observer exception left canonical
 * state between generations: generation still 0, generation-1 death/mating/birth
 * records present, RNG and counters advanced, old population still current, and
 * canonical bytes matching neither generation. An observer-layer failure could
 * therefore corrupt canonical biology.
 *
 * Now:
 *  - birth records are COLLECTED during the transaction, never dispatched;
 *  - the transaction commits (population, generation, pruning);
 *  - observers are dispatched post-commit and each callback is exception-isolated;
 *  - observer failures are collected on the returned result, outside canonical state;
 *  - `advanceGenerationAndCollect()` offers a hook-free API returning immutable
 *    event records for the observer layer to process afterwards.
 *
 * Observer callbacks still receive only already-fixed ids, never simRng.
 */

import { survivalProbability, computeZoneLoads } from "./survival.js";
import { formMatingPairs } from "./mating.js";
import { createChild, makeDeathEvent } from "./events.js";
import { pruneGenealogy } from "./genealogy.js";
import { ZONES } from "../config/zones.js";
import { currentModelConfig, modelIdentityFor, SCHEMA_VERSION } from "../config/modelConfig.js";
import { isWellFormedModelIdentity, MODEL_IDENTITY_DIGEST_LENGTH } from "../config/modelIdentity.js";

/**
 * Advance one generation in place. Returns the same mutated state.
 * @param {Object} state biological state
 * @param {Object} [config] currentModelConfig by default
 * @param {Object} [hooks]
 * @param {(info:{childId:number, parentAId:number, parentBId:number, generation:number})=>void} [hooks.onBirth]
 *        observer-only callback invoked after each biological birth is complete
 * @param {(livingIds:number[])=>void} [hooks.afterGeneration]
 *        observer-only callback invoked once the transition is complete
 * @returns {Object} state
 */
export function advanceGeneration(state, config = currentModelConfig, hooks = {}) {
  // Revision-3 repair: bind progression to the state's configuration identity.
  //
  // Previously this accepted any configuration and defaulted to the current one,
  // so `advanceGeneration(config1State)` silently advanced a config-1 world under
  // config 2 while the state kept its `lineage-m1-config-1` label. Two different
  // biological worlds could then serialize under the same configuration label,
  // destroying replay and audit attribution.
  //
  // The check runs BEFORE any RNG draw, counter increment, event, population
  // change, or canonical byte is touched, so a rejected call is a no-op.
  assertConfigMatchesState(state, config);

  const sourceGeneration = state.generation;
  const targetGeneration = sourceGeneration + 1;
  const nZones = ZONES.length;
  const rng = state.simRng;
  const ageMult = config.ageSurvivalMultiplier;

  // Step 1 — snapshot: ordered living ids (ascending) and pre-survival loads.
  const snapshot = state.currentIndividuals.slice().sort((a, b) => a.id - b.id);
  const zoneLoad = computeZoneLoads(snapshot, nZones);

  // Step 2 — survival probabilities from the pre-survival snapshot.
  // Step 3 — one simRng draw per individual in ascending id order.
  const survivors = [];
  for (const ind of snapshot) {
    const { pSurvival } = survivalProbability(ind, zoneLoad, config);
    const draw = rng.nextFloat();
    const survives = draw < pSurvival;
    if (survives) {
      survivors.push(ind);
    } else {
      const maxAge = ind.ageGenerations >= ageMult.length - 1 || ageMult[ind.ageGenerations] === 0;
      state.deathEvents.push(
        makeDeathEvent(
          targetGeneration,
          ind,
          pSurvival,
          draw,
          maxAge ? "maximum_age" : "stochastic_survival"
        )
      );
    }
  }

  // Step 4 — age survivors by one.
  for (const s of survivors) s.ageGenerations += 1;

  // Steps 5-7 — eligibility, deterministic order, mate selection.
  const pairs = formMatingPairs(survivors, config, rng);

  // Steps 8-9 — exactly two children per pair, in pair and child-index order.
  const survivorById = new Map(survivors.map((s) => [s.id, s]));
  const newborns = [];
  /** @type {Array<{childId:number,parentAId:number,parentBId:number,generation:number}>} */
  const birthRecords = [];
  for (const pair of pairs) {
    const A = survivorById.get(pair.parentAId);
    const B = survivorById.get(pair.parentBId);
    const childIds = [];
    for (let k = 0; k < config.offspringPerPair; k++) {
      const child = createChild(state, A, B, targetGeneration, rng, config);
      newborns.push(child);
      childIds.push(child.id);
    }
    const matingEventId = state.nextMatingEventId++;
    state.biologicalMatingEvents.push({
      id: matingEventId,
      generation: targetGeneration,
      parentAId: pair.parentAId,
      parentBId: pair.parentBId,
      overlap: pair.overlap,
      childIds,
    });
    // Birth records are COLLECTED here, never dispatched to observers inside the
    // transaction. Observer processing happens only after the commit below.
    for (const id of childIds) {
      birthRecords.push({
        childId: id,
        parentAId: pair.parentAId,
        parentBId: pair.parentBId,
        generation: targetGeneration,
      });
    }
  }

  // Step 10 — next population = aged survivors + newborns, sorted by id.
  const next = survivors.concat(newborns);
  next.sort((a, b) => a.id - b.id);
  state.currentIndividuals = next;
  state.generation = targetGeneration;

  // Retention/pruning (§15) at the new generation.
  pruneGenealogy(state, config);

  // ---- COMMIT COMPLETE ----------------------------------------------------
  // Biology is now fully committed for targetGeneration. Everything below is
  // observer-side and cannot alter canonical biological state.

  const livingIds = state.currentIndividuals.map((i) => i.id);
  const births = Object.freeze(birthRecords.map((r) => Object.freeze({ ...r })));
  const frozenLivingIds = Object.freeze(livingIds.slice());

  // Observer errors are collected into a LOCAL array. Revision 4 froze the outer
  // result but left `observerErrors` and its entries mutable, and attached that
  // same object to `state.lastGenerationResult` — so an external `push()` forged
  // the diagnostic record after the generation completed (revision-5 repair,
  // BUG 9). Nothing mutable is ever exposed now.
  //
  // REVISION-6 REPAIR (Break 4 / MM-1 / R6-H). Revision 5 froze the record wrapper
  // but stored the ORIGINAL thrown value under `error`, and froze neither it nor
  // anything nested in it. Reproduced with 66 observer failures:
  //
  //   result frozen true | array frozen true | record frozen true
  //   thrown payload frozen false | nested payload frozen false
  //   state diagnostic after external mutation:
  //     {"message":"FORGED","detail":{"code":"FORGED","nested":{"value":999}}}
  //
  // The thrown object is never exposed now. Each failure is converted at capture
  // time into a plain snapshot of approved primitive fields, which is then deeply
  // frozen. An arbitrary payload cannot be reached, so it cannot be rewritten.
  /** @type {Array<Readonly<{phase:string, childId?:number, error:Object}>>} */
  const collectedErrors = [];

  // Post-commit, exception-isolated observer dispatch. An observer throwing here
  // cannot leave biology between generations: the transaction is already
  // complete, and each callback is individually guarded. Errors are recorded
  // outside canonical biological state.
  if (hooks.onBirth) {
    for (const record of births) {
      try {
        hooks.onBirth(record);
      } catch (err) {
        collectedErrors.push(
          Object.freeze({ phase: "onBirth", childId: record.childId, error: diagnosticSnapshot(err) })
        );
      }
    }
  }
  if (hooks.afterGeneration) {
    try {
      hooks.afterGeneration(frozenLivingIds);
    } catch (err) {
      collectedErrors.push(Object.freeze({ phase: "afterGeneration", error: diagnosticSnapshot(err) }));
    }
  }

  /** @type {GenerationResult} */
  const result = Object.freeze({
    generation: targetGeneration,
    births,
    livingIds: frozenLivingIds,
    // Each record was frozen at capture time, and so is the array holding them.
    observerErrors: Object.freeze(collectedErrors.slice()),
  });

  state.lastGenerationResult = result;
  return state;
}

/**
 * Convert an arbitrary thrown value into an immutable plain diagnostic snapshot
 * (revision-6 repair, Break 4 / MM-1 / R6-H).
 *
 * Only these fields are kept, all primitives, all frozen:
 *
 *   name         constructor/`name` of the thrown value, or its typeof
 *   message      `message` if it is a string, else null
 *   stack        `stack` if it is a string, else null
 *   text         a safe string representation, always present
 *   wasError     whether the thrown value was an Error instance
 *
 * The thrown object itself is deliberately NOT retained. Retaining it is what let
 * external code rewrite `message`, rewrite nested payload properties and add new
 * ones, all visible afterwards through `state.lastGenerationResult`.
 *
 * @param {unknown} err
 * @returns {Readonly<{name:string, message:string|null, stack:string|null, text:string, wasError:boolean}>}
 */
export function diagnosticSnapshot(err) {
  // REVISION-7 REPAIR (Finding 4). Revision 6 guarded only the `text` computation
  // and then read `err.name`, `err.message` and `err.stack` outside that guard. An
  // Error may legally expose any of them through an accessor, and an accessor may
  // throw. Reproduced with an `Error` whose `message` getter throws:
  //
  //   {"escaped":"hostile message getter","generation":1,"hasResult":false}
  //
  // Biology had already committed, so the caller saw a thrown transition AFTER the
  // transition succeeded, with no `lastGenerationResult` published — ambiguous retry
  // behaviour, which is the failure mode the observer boundary exists to prevent.
  //
  // Every property is now read through one individually guarded helper, including
  // the `instanceof` classification. Nothing about an arbitrary thrown value —
  // Error subclass, proxy, revoked proxy, hostile accessor — can escape this
  // function.
  const safe = (read, fallback = null) => {
    try {
      const v = read();
      return typeof v === "string" ? v : fallback;
    } catch {
      return fallback;
    }
  };
  let isError;
  try {
    isError = err instanceof Error;
  } catch {
    // A proxy may throw from its `getPrototypeOf` trap.
    isError = false;
  }
  const name = safe(() => (isError ? err.name : typeof err), isError ? "Error" : "unknown");
  const message = isError ? safe(() => err.message) : null;
  const stack = isError ? safe(() => err.stack) : null;
  const text = safe(
    () => (isError ? `${name}: ${message ?? "[unreadable message]"}` : String(err)),
    "[unrepresentable thrown value]"
  );
  return Object.freeze({
    name: name ?? "unknown",
    message,
    stack,
    text: text ?? "[unrepresentable thrown value]",
    wasError: isError,
  });
}

/**
 * @typedef {Object} GenerationResult
 * @property {number} generation                 the completed target generation
 * @property {ReadonlyArray<{childId:number,parentAId:number,parentBId:number,generation:number}>} births
 *           immutable birth records, in creation order
 * @property {ReadonlyArray<number>} livingIds   living ids after the transition
 * @property {Array<{phase:string, childId?:number, error:unknown}>} observerErrors
 *           observer failures, collected outside canonical biological state
 */

/**
 * Advance one generation and return the immutable event record, without any
 * observer hooks. This is the strongest separation the contract describes: the
 * biological core computes and commits, and the caller processes the returned
 * records afterwards.
 * @param {Object} state
 * @param {Object} [config]
 * @returns {GenerationResult}
 */
export function advanceGenerationAndCollect(state, config = currentModelConfig) {
  advanceGeneration(state, config, {});
  return state.lastGenerationResult;
}

/**
 * Reject a configuration whose version does not match the state's recorded
 * `configVersion`. Throws before mutating anything (contract §18 provenance,
 * §21.7 side-by-side integrity).
 * @param {Object} state
 * @param {Object} config
 */
export function assertConfigMatchesState(state, config) {
  if (config.version !== state.configVersion) {
    throw new Error(
      `configuration mismatch: state.configVersion="${state.configVersion}" but supplied config.version="${config.version}". ` +
      "A biological state may only be advanced under the model that produced it."
    );
  }
  // Revision-4 repair: the version string alone is reusable. Revision 3 accepted
  // a modified model that kept `lineage-m1-config-2` — capacities [90,90,90]
  // under that version produced a different population while both worlds
  // retained the same canonical label. Bind to the COMPLETE model identity.
  //
  // REVISION-5 REPAIR (BUG 4 / R5-3). The revision-4 check was conditional on
  // `state.modelIdentityHash !== undefined`, so it protected only newly
  // constructed states. Reproduced: one same-schema canonical state with the
  // field deleted was deserialized twice and advanced under two different
  // models, giving populations 141 and 165 with no rejection, both labelled
  // `lineage-m1-config-2`. The field is now MANDATORY, and the biological schema
  // version was bumped so a pre-identity state cannot masquerade as current.
  const stored = state.modelIdentityHash;
  if (stored === undefined || stored === null || stored === "") {
    throw new Error(
      "missing model identity: canonical biological state must carry `modelIdentityHash`. " +
      `State schema "${state.schemaVersion}" was accepted, but no complete-model identity is ` +
      "recorded, so the model that produced this state cannot be established. This check is " +
      "UNCONDITIONAL and independent of the schema label: a state without a complete model " +
      "identity is rejected rather than advanced, whatever schema version it declares."
    );
  }
  if (!isWellFormedModelIdentity(stored)) {
    throw new Error(
      `malformed model identity: state.modelIdentityHash=${JSON.stringify(stored)} is not a ` +
      `${MODEL_IDENTITY_DIGEST_LENGTH}-character lowercase hex digest. A canonical state may not ` +
      "be advanced under an unverifiable identity."
    );
  }
  const suppliedIdentity = modelIdentityFor(config);
  if (stored !== suppliedIdentity) {
    throw new Error(
      `model mismatch: state.modelIdentityHash="${stored}" but the supplied model hashes to ` +
      `"${suppliedIdentity}" under the same version "${config.version}". ` +
      "Two materially different biological models may not share one canonical identity."
    );
  }
}

/**
 * True when the biological world is extinct (no living individuals).
 * @param {Object} state
 * @returns {boolean}
 */
export function isExtinct(state) {
  return state.currentIndividuals.length === 0;
}

/**
 * Run `state` forward up to `generations` transitions, stopping early on
 * extinction. Optional per-generation observer hooks.
 * @param {Object} state
 * @param {number} generations
 * @param {Object} [config]
 * @param {Object} [hooks]
 * @returns {Object} state
 */
export function runGenerations(state, generations, config = currentModelConfig, hooks = {}) {
  // Fail fast before the first transition rather than partway through a batch.
  assertConfigMatchesState(state, config);
  for (let i = 0; i < generations; i++) {
    if (isExtinct(state)) break;
    advanceGeneration(state, config, hooks);
  }
  return state;
}
