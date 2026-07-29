// @ts-check
/**
 * Biological event assembly (contract §14) and the binding child-creation order
 * (§11 step 9). This module owns the mutation-event ID namespaces (§12.1):
 *  - body-mutation events consume and increment nextMutationEventId;
 *  - allocation-mutation events consume and increment nextAllocationMutationEventId;
 *  - a failed opportunity records no event and increments no counter.
 */

import { makeIndividual } from "./individual.js";
import { inheritBodyGenome, inheritTimeAllocation } from "./inheritance.js";
import { bodyMutationOpportunity, allocationMutationOpportunity } from "./mutation.js";

/**
 * Create one child from two parents following the binding step-9 order.
 * Assigns ids monotonically and records events into `state`. Returns the child.
 *
 * @param {Object} state biological state (mutated: counters, event arrays)
 * @param {import("./individual.js").Individual} parentA
 * @param {import("./individual.js").Individual} parentB
 * @param {number} targetGeneration g+1
 * @param {import("./rng.js").Rng} rng simRng
 * @param {Object} config
 * @returns {import("./individual.js").Individual}
 */
export function createChild(state, parentA, parentB, targetGeneration, rng, config) {
  const parentIds = /** @type {[number,number]} */ ([parentA.id, parentB.id]);

  // 1. inherited pre-mutation body genome from both parents.
  const preMutationGenome = inheritBodyGenome(parentA.bodyGenome, parentB.bodyGenome, rng, config);

  // 2. exactly one body-mutation opportunity (pure of allocation/zone).
  const bodyMut = bodyMutationOpportunity(preMutationGenome, rng, config);
  state.diagnostics.bodyMutationOpportunityCount++;
  const finalGenome = bodyMut.genome;

  // 3. inherited time allocation from both parents (post-drift, masked, normalized).
  const alloc = inheritTimeAllocation(parentA.timeAllocation, parentB.timeAllocation, rng, config);
  if (alloc.usedFallback) state.diagnostics.zeroAllocationFallbackCount++;

  // 4. exactly one allocation-mutation opportunity (frozen §13.1).
  const allocMut = allocationMutationOpportunity(alloc.allocation, alloc.eligible, rng, config);
  state.diagnostics.allocationMutationOpportunityCount++;
  const finalAllocation = allocMut.allocation;

  // 7. assign ids monotonically; 8. ageGenerations = 0.
  const childId = state.nextIndividualId++;
  const birthEventId = state.nextBirthEventId++;
  const child = makeIndividual({
    id: childId,
    parentIds,
    birthGeneration: targetGeneration,
    ageGenerations: 0,
    bodyGenome: finalGenome,
    timeAllocation: finalAllocation,
    birthEventId,
  });

  // 6. birth event.
  const birth = {
    id: birthEventId,
    generation: targetGeneration,
    childId,
    parentIds,
    founder: false,
  };
  state.birthEvents.push(birth);
  state.retainedGenealogy.push({ ...birth });
  state.diagnostics.nonFounderBirthCount++;

  // body-mutation event, if any. 5. attach final immutable birth allocation.
  if (bodyMut.occurred) {
    const bmId = state.nextMutationEventId++;
    state.bodyMutationEvents.push({
      id: bmId,
      generation: targetGeneration,
      childId,
      birthEventId,
      parentIds,
      traitId: bodyMut.draft.traitId,
      preMutationValue: bodyMut.draft.preMutationValue,
      requestedDelta: bodyMut.draft.requestedDelta,
      postMutationValue: bodyMut.draft.postMutationValue,
      childTimeAllocationAtBirth: Array.from(finalAllocation),
    });
  }

  // allocation-mutation event, if recorded.
  if (allocMut.recorded) {
    const amId = state.nextAllocationMutationEventId++;
    state.allocationMutationEvents.push({
      id: amId,
      generation: targetGeneration,
      childId,
      birthEventId,
      parentIds,
      fromZone: allocMut.draft.fromZone,
      toZone: allocMut.draft.toZone,
      requestedTransfer: allocMut.draft.requestedTransfer,
      realizedTransfer: allocMut.draft.realizedTransfer,
      preMutationAllocation: allocMut.draft.preMutationAllocation,
      postMutationAllocation: allocMut.draft.postMutationAllocation,
    });
  }

  return child;
}

/**
 * Build a death event record (§14.2).
 * @param {number} generation targetGeneration
 * @param {import("./individual.js").Individual} individual pre-aging snapshot age
 * @param {number} survivalProbability
 * @param {number} survivalDraw
 * @param {"stochastic_survival"|"maximum_age"} cause
 * @returns {Object}
 */
export function makeDeathEvent(generation, individual, survivalProbability, survivalDraw, cause) {
  return {
    generation,
    individualId: individual.id,
    ageGenerations: individual.ageGenerations,
    survivalProbability,
    survivalDraw,
    cause,
  };
}
