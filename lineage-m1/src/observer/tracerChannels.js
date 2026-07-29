// @ts-check
/**
 * Observer lineage tracer channels (contract §16). Tracers live entirely outside
 * biological state. They consume no simulation randomness, never mutate
 * biology, and switching or deleting channels cannot affect the simulation.
 *
 * Channel values propagate from already-fixed parent ids after biological child
 * creation:  tracer[k][child] = (tracer[k][parentA] + tracer[k][parentB]) / 2.
 *
 * MEMORY BOUND (revision-3 repair). Revision 2 retained a value for every
 * individual that had ever lived, so a single channel grew with cumulative
 * births rather than with the living world: 21,510 entries at generation 180
 * and 107,760 by generation 800 while only ~250 animals were alive. Because
 * propagation only ever reads the values of parents — who are by construction
 * living survivors at the moment of birth — entries for dead individuals are
 * never needed again and are pruned after each generation. Pruning touches only
 * observer state and cannot change canonical biological bytes.
 */

/**
 * @typedef {Object} ObserverState
 * @property {Map<string, {founderIds:number[], values:Map<number, number>}>} channels
 * @property {string|null} activeChannel
 * @property {number[]} inspectedIds
 * @property {number[]} selectedFounderIds
 */

/** Create an empty observer state root. @returns {ObserverState} */
export function createObserverState() {
  return {
    channels: new Map(),
    activeChannel: null,
    inspectedIds: [],
    selectedFounderIds: [],
  };
}

/**
 * Create tracer channel `k` at the current generation from founder ids (§16).
 * Sets founders to 1 and all other current individuals to 0. Consumes no RNG.
 * @param {ObserverState} observer
 * @param {string} channelId
 * @param {number[]} founderIds
 * @param {number[]} currentIndividualIds all currently living ids
 */
export function createTracerChannel(observer, channelId, founderIds, currentIndividualIds) {
  const values = new Map();
  const founderSet = new Set(founderIds);
  for (const id of currentIndividualIds) values.set(id, founderSet.has(id) ? 1 : 0);
  // Founder ids not currently alive still seed at 1 (retroactive selection only
  // applies to observer state for animals already alive; guard anyway).
  for (const id of founderIds) if (!values.has(id)) values.set(id, 1);
  observer.channels.set(channelId, { founderIds: founderIds.slice(), values });
  if (observer.activeChannel === null) observer.activeChannel = channelId;
}

/**
 * Propagate tracer values to a newborn child across every channel (§16).
 * Survivors keep their existing values. Consumes no RNG.
 * @param {ObserverState} observer
 * @param {number} childId
 * @param {number} parentAId
 * @param {number} parentBId
 */
export function propagateBirth(observer, childId, parentAId, parentBId) {
  for (const channel of observer.channels.values()) {
    const a = channel.values.get(parentAId) ?? 0;
    const b = channel.values.get(parentBId) ?? 0;
    channel.values.set(childId, (a + b) / 2);
  }
}

/**
 * Build an onBirth hook for advanceGeneration that propagates all channels.
 * @param {ObserverState} observer
 * @returns {(info:{childId:number,parentAId:number,parentBId:number})=>void}
 */
export function tracerBirthHook(observer) {
  return (info) => propagateBirth(observer, info.childId, info.parentAId, info.parentBId);
}

/**
 * Remove entries for individuals that are no longer alive, in every channel.
 *
 * Safe because tracer propagation reads only parent values, and a parent is
 * always a living survivor when its child is created. Bounded independently per
 * channel, so N channels cost N x living, never N x cumulative births.
 *
 * @param {ObserverState} observer
 * @param {Iterable<number>} livingIds
 * @returns {number} number of entries removed
 */
export function pruneObserverToLiving(observer, livingIds) {
  const alive = livingIds instanceof Set ? livingIds : new Set(livingIds);
  let removed = 0;
  for (const channel of observer.channels.values()) {
    for (const id of [...channel.values.keys()]) {
      if (!alive.has(id)) {
        channel.values.delete(id);
        removed++;
      }
    }
  }
  // Inspected ids that refer to dead animals are also dropped.
  if (observer.inspectedIds.length > 0) {
    observer.inspectedIds = observer.inspectedIds.filter((id) => alive.has(id));
  }
  return removed;
}

/**
 * Build an afterGeneration hook that keeps observer state bounded to the living
 * population. Consumes no RNG and never touches biological state.
 * @param {ObserverState} observer
 * @returns {(livingIds:number[])=>void}
 */
export function observerAfterGenerationHook(observer) {
  return (livingIds) => pruneObserverToLiving(observer, livingIds);
}

/**
 * Total retained entries across all channels. Diagnostic for the memory tests.
 * @param {ObserverState} observer
 * @returns {number}
 */
export function totalRetainedTracerEntries(observer) {
  let n = 0;
  for (const channel of observer.channels.values()) n += channel.values.size;
  return n;
}

/**
 * Living founder contribution for a channel (§19.4 measurement):
 *   sum over living individuals of tracerValue[individualId].
 * @param {ObserverState} observer
 * @param {string} channelId
 * @param {number[]} livingIds
 * @returns {number}
 */
export function livingFounderContribution(observer, channelId, livingIds) {
  const channel = observer.channels.get(channelId);
  if (!channel) return 0;
  let sum = 0;
  for (const id of livingIds) sum += channel.values.get(id) ?? 0;
  return sum;
}
