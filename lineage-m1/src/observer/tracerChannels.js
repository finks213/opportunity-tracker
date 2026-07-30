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
  const living = new Set(currentIndividualIds);

  // §16 permits retroactive founder selection ONLY for animals already alive.
  //
  // Revision-4 repair. Revision 3 inserted every non-living requested founder at
  // value 1, producing a valid-looking channel with zero living contribution and
  // no way for the caller to distinguish "the followed contribution is genuinely
  // zero" from "the channel was built from dead ids". Invalid founder sets are
  // now rejected outright.
  const invalid = founderIds.filter((id) => !living.has(id));
  if (invalid.length > 0) {
    throw new TracerFounderError(
      `cannot create tracer "${channelId}": ${invalid.length} requested founder id(s) are not currently alive ` +
      `(${invalid.slice(0, 8).join(", ")}${invalid.length > 8 ? ", …" : ""}). ` +
      "§16 permits retroactive selection only for animals already alive.",
      { channelId, invalidFounderIds: invalid, reason: "FOUNDERS_NOT_ALIVE" }
    );
  }
  if (founderIds.length === 0) {
    throw new TracerFounderError(
      `cannot create tracer "${channelId}": the founder set is empty.`,
      { channelId, invalidFounderIds: [], reason: "EMPTY_FOUNDER_SET" }
    );
  }

  const values = new Map();
  const founderSet = new Set(founderIds);
  for (const id of currentIndividualIds) values.set(id, founderSet.has(id) ? 1 : 0);
  observer.channels.set(channelId, { founderIds: founderIds.slice(), values });
  if (observer.activeChannel === null) observer.activeChannel = channelId;
}

/**
 * Thrown when a tracer channel is requested from founders that are not currently
 * alive, or from an empty founder set. Carries a machine-readable reason so a
 * caller can surface an explicit unavailable state instead of a plausible
 * zero-contribution channel.
 */
export class TracerFounderError extends Error {
  /**
   * @param {string} message
   * @param {{channelId:string, invalidFounderIds:number[], reason:string}} detail
   */
  constructor(message, detail) {
    super(message);
    this.name = "TracerFounderError";
    this.channelId = detail.channelId;
    this.invalidFounderIds = detail.invalidFounderIds;
    this.reason = detail.reason;
  }
}

/**
 * Resolve the living descendants of a requested founder set using genealogy.
 *
 * This is the ONLY sanctioned way to continue following a focal lineage whose
 * original members have died: it walks actual parentage, so it can never
 * substitute unrelated animals that merely occupy the same habitat.
 *
 * @param {Object} state biological state (read-only here)
 * @param {number[]} founderIds the originally requested focal ids
 * @returns {{descendantIds:number[], resolvedFromGenealogy:boolean}}
 */
export function resolveLivingDescendants(state, founderIds) {
  const requested = new Set(founderIds);
  const living = new Set(state.currentIndividuals.map((i) => i.id));

  // Any requested founder still alive is itself a living member.
  const direct = founderIds.filter((id) => living.has(id));

  // Otherwise walk parentage forward: a child descends from the focal set when
  // either parent does. Birth records are ordered by ascending child id and a
  // parent id is always smaller than its child id, so one forward pass suffices.
  const descends = new Set(requested);
  const records = state.retainedGenealogy
    .filter((r) => r.parentIds !== null)
    .slice()
    .sort((a, b) => a.childId - b.childId);
  for (const r of records) {
    if (descends.has(r.parentIds[0]) || descends.has(r.parentIds[1])) {
      descends.add(r.childId);
    }
  }
  const descendantIds = state.currentIndividuals
    .map((i) => i.id)
    .filter((id) => descends.has(id));

  return {
    descendantIds,
    resolvedFromGenealogy: direct.length === 0 && descendantIds.length > 0,
  };
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
