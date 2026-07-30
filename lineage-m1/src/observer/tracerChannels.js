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

  // Revision-5 repair (BUG 1 / R5-1). Distinguish "no living descendants" from
  // "the reconstruction path is gone". The retained genealogy is a rolling
  // 360-generation window: once it slides past the records joining the requested
  // founders to the retained ones, no retained record has a parent in the seeded
  // set and this pass legitimately finds nothing — even when every living animal
  // descends from those founders. Reproduced at generation 400: 293 living, 293
  // with positive focal contribution, resolver 0.
  //
  // `historicalPathIntact` is true only when the requested founders themselves
  // are still inside the retained window, which is the only case in which a zero
  // result may be read as biological absence.
  const oldestRetainedGeneration = state.retainedGenealogy.length > 0
    ? Math.min(...state.retainedGenealogy.map((r) => r.generation))
    : 0;
  const retainedIds = new Set(state.retainedGenealogy.map((r) => r.childId));
  const foundersInWindow = founderIds.filter((id) => living.has(id) || retainedIds.has(id));
  const historicalPathIntact = foundersInWindow.length === founderIds.length;

  return {
    descendantIds,
    resolvedFromGenealogy: direct.length === 0 && descendantIds.length > 0,
    historicalPathIntact,
    oldestRetainedGeneration,
    // A zero result is only trustworthy when the path was intact.
    zeroIsTrustworthy: descendantIds.length > 0 || historicalPathIntact,
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

// ---------------------------------------------------------------------------
// Maintained focal-lineage channels (revision-5 repair, BUG 1 / R5-1)
// ---------------------------------------------------------------------------
//
// THE PROBLEM. `resolveLivingDescendants()` reconstructs descent from the rolling
// biological genealogy, which the contract bounds to a 360-generation retention
// window (§15). Once that window slides past the records joining the
// generation-zero focal founders to the retained ones, reconstruction is
// impossible — reproduced at generation 400: 293 living animals, all 293 with
// positive focal contribution from a continuously propagated witness channel, and
// a resolver result of 0. The UI reported `FOCAL_LINEAGE_UNAVAILABLE`, asserting
// biological absence of a lineage that was demonstrably alive.
//
// THE FIX. Rolling genealogy is no longer the sole source for late activation of a
// PREDEFINED focal set. Channels for the contract-required focal sets are created
// when the fixture world is created and propagated continuously through every
// birth thereafter, whether or not any UI is showing them. Late activation exposes
// the maintained channel instead of reconstructing.
//
// BOUNDEDNESS. These channels are pruned to the living population every
// generation by the same `pruneObserverToLiving()` path as any other channel, so
// storage stays O(channels x living) — never O(births). That bound is asserted
// through generation 1000.
//
// OBSERVER SEPARATION. This is observer state. It is never written into canonical
// biological bytes, never consulted by biology, and never touches `simRng`.

/**
 * Channel-id prefix marking a maintained (dormant-capable) focal channel. The
 * prefix is how `pruneObserverToLiving` and the UI tell maintained channels from
 * ad-hoc user channels without a second registry.
 */
export const MAINTAINED_CHANNEL_PREFIX = "maintained:";

/** The channel id for a named predefined focal set. */
export function maintainedChannelId(focalSetName) {
  return `${MAINTAINED_CHANNEL_PREFIX}${focalSetName}`;
}

/**
 * Outcome names for a focal-lineage request. Distinguishing these three is the
 * whole point of the repair.
 */
export const FOCAL_OUTCOME = Object.freeze({
  /** Living descendants were established (from a maintained channel or genealogy). */
  RESOLVED: "FOCAL_LINEAGE_RESOLVED",
  /** The lineage genuinely has no living descendants; the evidence supports that. */
  EXTINCT: "FOCAL_LINEAGE_EXTINCT",
  /**
   * Neither a maintained channel nor an intact reconstruction path exists, so
   * ancestry cannot be established either way. This asserts nothing about
   * biology — unlike `FOCAL_LINEAGE_UNAVAILABLE`, which asserted absence.
   */
  UNRESOLVABLE: "FOCAL_ANCESTRY_UNRESOLVABLE",
});

/**
 * Create the maintained channels for the predefined focal sets of a freshly
 * created world. Call this immediately after the world is constructed, while every
 * founder is still alive — that is the only moment at which a generation-zero
 * focal set can be captured exactly.
 *
 * @param {ObserverState} observer
 * @param {Object} state biological state at its creation generation
 * @param {Record<string, number[]>} focalSets name -> founder ids
 * @returns {{created:string[], skipped:Array<{name:string, reason:string}>}}
 */
export function createMaintainedFocalChannels(observer, state, focalSets) {
  const livingIds = state.currentIndividuals.map((i) => i.id);
  const living = new Set(livingIds);
  const created = [];
  const skipped = [];
  for (const name of Object.keys(focalSets).sort()) {
    const founderIds = focalSets[name];
    if (!Array.isArray(founderIds) || founderIds.length === 0) {
      skipped.push({ name, reason: "EMPTY_FOUNDER_SET" });
      continue;
    }
    const absent = founderIds.filter((id) => !living.has(id));
    if (absent.length > 0) {
      // Refuse rather than fabricate: a maintained channel that starts from dead
      // ids would carry a permanently zero contribution and look authoritative.
      skipped.push({ name, reason: `FOUNDERS_NOT_ALIVE(${absent.length})` });
      continue;
    }
    const id = maintainedChannelId(name);
    createTracerChannel(observer, id, founderIds, livingIds);
    created.push(id);
  }
  return { created, skipped };
}

/**
 * Resolve a focal-lineage request, preferring the maintained channel.
 *
 * Order of authority:
 *   1. a maintained channel for this focal set — continuously propagated, so it
 *      is correct at any generation;
 *   2. genealogy reconstruction — correct only while the retention window still
 *      contains the founders;
 *   3. neither -> `FOCAL_ANCESTRY_UNRESOLVABLE`.
 *
 * @param {ObserverState} observer
 * @param {Object} state
 * @param {number[]} founderIds
 * @param {{focalSetName?:string}} [opts]
 * @returns {{outcome:string, source:string, descendantIds:number[], channelId:string|null, detail:Object}}
 */
export function resolveFocalLineage(observer, state, founderIds, opts = {}) {
  const livingIds = state.currentIndividuals.map((i) => i.id);

  // 1. Maintained channel, if one exists for this named set.
  const channelId = opts.focalSetName ? maintainedChannelId(opts.focalSetName) : null;
  const channel = channelId ? observer.channels.get(channelId) : undefined;
  if (channel) {
    const descendantIds = livingIds.filter((id) => (channel.values.get(id) ?? 0) > 0);
    return {
      outcome: descendantIds.length > 0 ? FOCAL_OUTCOME.RESOLVED : FOCAL_OUTCOME.EXTINCT,
      source: "maintained-channel",
      descendantIds,
      channelId,
      detail: {
        note:
          "Contribution comes from a channel propagated continuously since the world was created, " +
          "so it is independent of the genealogy retention window.",
      },
    };
  }

  // 2. Genealogy reconstruction, and only when its answer is trustworthy.
  const r = resolveLivingDescendants(state, founderIds);
  if (r.descendantIds.length > 0) {
    return {
      outcome: FOCAL_OUTCOME.RESOLVED,
      source: "genealogy",
      descendantIds: r.descendantIds,
      channelId: null,
      detail: { historicalPathIntact: r.historicalPathIntact },
    };
  }
  if (r.zeroIsTrustworthy) {
    return {
      outcome: FOCAL_OUTCOME.EXTINCT,
      source: "genealogy",
      descendantIds: [],
      channelId: null,
      detail: {
        historicalPathIntact: true,
        note: "The requested founders are still inside the retained window, so zero means zero.",
      },
    };
  }

  // 3. Unknowable. Say so; do not assert absence.
  return {
    outcome: FOCAL_OUTCOME.UNRESOLVABLE,
    source: "none",
    descendantIds: [],
    channelId: null,
    detail: {
      historicalPathIntact: false,
      oldestRetainedGeneration: r.oldestRetainedGeneration,
      currentGeneration: state.generation,
      note:
        "The 360-generation genealogy retention window no longer contains the requested focal " +
        "founders, and no maintained channel exists for this set. Living contribution cannot be " +
        "established in either direction. This is NOT a claim that the lineage is extinct.",
    },
  };
}
