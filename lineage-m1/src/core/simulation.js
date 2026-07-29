// @ts-check
/**
 * The frozen overlapping-generation lifecycle (contract §11).
 *
 * A call that advances a state from generation g performs the transition into
 * generation g+1. Every biological event created during that transition uses
 * generation = targetGeneration; state.generation flips to targetGeneration
 * exactly once, after the next population and all events are assembled.
 *
 * Determinism law: observer callbacks run only AFTER biological child creation
 * from already-fixed parent ids and never touch simRng or biological state.
 */

import { survivalProbability, computeZoneLoads } from "./survival.js";
import { formMatingPairs } from "./mating.js";
import { createChild, makeDeathEvent } from "./events.js";
import { pruneGenealogy } from "./genealogy.js";
import { ZONES } from "../config/zones.js";
import { currentModelConfig } from "../config/modelConfig.js";

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
    // Observer-only birth notification, after biology is fully fixed.
    if (hooks.onBirth) {
      for (const id of childIds) {
        hooks.onBirth({ childId: id, parentAId: pair.parentAId, parentBId: pair.parentBId, generation: targetGeneration });
      }
    }
  }

  // Step 10 — next population = aged survivors + newborns, sorted by id.
  const next = survivors.concat(newborns);
  next.sort((a, b) => a.id - b.id);
  state.currentIndividuals = next;
  state.generation = targetGeneration;

  // Retention/pruning (§15) at the new generation.
  pruneGenealogy(state, config);

  // Observer-only notification, after biology is completely fixed. Used by the
  // observer layer to keep its own maps bounded to the living population. It
  // receives ids only, consumes no simRng, and cannot alter canonical bytes.
  if (hooks.afterGeneration) {
    hooks.afterGeneration(state.currentIndividuals.map((i) => i.id));
  }

  return state;
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
