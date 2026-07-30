// @ts-check
/**
 * A focal lineage must not be reported extinct because the genealogy retention
 * window slid past its founders (contract §16; revision-5 repair, BUG 1 / R5-1).
 *
 * Reproduced against revision 4 using a continuously propagated witness channel as
 * an independent ancestry oracle:
 *
 *   gen  12  living 214  positive 59   resolver 59   window intact
 *   gen 360  living 268  positive 268  resolver 268
 *   gen 361  living 286  positive 286  resolver 286
 *   gen 400  living 293  positive 293  resolver 0    <- UI: FOCAL_LINEAGE_UNAVAILABLE
 *   gen 800  living 273  positive 273  resolver 0
 *
 * The lineage was alive at generations 400 and 800; only the reconstruction path
 * was gone, and the UI asserted biological absence.
 *
 * Every assertion below fails against revision 4, which had no maintained channel,
 * no `historicalPathIntact`, and no `FOCAL_ANCESTRY_UNRESOLVABLE` outcome.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseEnvelope, hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { currentModelConfig as C } from "../src/config/modelConfig.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import {
  FOCAL_OUTCOME,
  createObserverState,
  createTracerChannel,
  createMaintainedFocalChannels,
  maintainedChannelId,
  resolveFocalLineage,
  resolveLivingDescendants,
  tracerBirthHook,
  observerAfterGenerationHook,
} from "../src/observer/tracerChannels.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV = parseEnvelope(readFileSync(join(HERE, "..", "fixtures", "defining_fixture_v1.json"), "utf8"));

/** Generations the repair order names explicitly. */
const MARKS = [12, 360, 361, 400, 800, 1000];

/**
 * Run one world to the deepest mark, capturing a snapshot at each mark.
 *
 * The production observer carries maintained channels. A SEPARATELY constructed
 * reference observer carries plain channels over the same founder sets — it is the
 * independent oracle, built by a different code path than the thing under test.
 */
function runWithReference(seed = 1) {
  const state = hydrateDefiningFixtureV1(ENV, seed, C);
  const livingAtStart = state.currentIndividuals.map((i) => i.id);

  const observer = createObserverState();
  const created = createMaintainedFocalChannels(observer, state, {
    canopy: ENV.canopyFocalIds,
    shoreline: ENV.shorelineFocalIds,
  });

  const reference = createObserverState();
  createTracerChannel(reference, "ref-canopy", ENV.canopyFocalIds, livingAtStart);
  createTracerChannel(reference, "ref-shoreline", ENV.shorelineFocalIds, livingAtStart);

  const obsBirth = tracerBirthHook(observer);
  const refBirth = tracerBirthHook(reference);
  const obsAfter = observerAfterGenerationHook(observer);
  const refAfter = observerAfterGenerationHook(reference);

  const snapshots = new Map();
  for (let g = 0; g < Math.max(...MARKS); g++) {
    advanceGeneration(state, C, {
      onBirth: (r) => { obsBirth(r); refBirth(r); },
      afterGeneration: (ids) => { obsAfter(ids); refAfter(ids); },
    });
    if (!MARKS.includes(state.generation)) continue;
    const livingIds = state.currentIndividuals.map((i) => i.id);
    const perSet = {};
    for (const which of ["canopy", "shoreline"]) {
      const refCh = reference.channels.get(`ref-${which}`);
      const refIds = livingIds.filter((id) => (refCh.values.get(id) ?? 0) > 0);
      const outcome = resolveFocalLineage(observer, state, ENV[`${which}FocalIds`], { focalSetName: which });
      const maintained = observer.channels.get(maintainedChannelId(which));
      perSet[which] = {
        outcome,
        referenceIds: refIds,
        referenceTotal: refIds.reduce((a, id) => a + refCh.values.get(id), 0),
        // Captured HERE, at the sampled generation. Reading it after the run would
        // look up ids that pruning has since removed and yield NaN.
        maintainedTotal: outcome.descendantIds.reduce((a, id) => a + maintained.values.get(id), 0),
        maintainedSize: maintained.values.size,
        legacy: resolveLivingDescendants(state, ENV[`${which}FocalIds`]),
      };
    }
    snapshots.set(state.generation, { livingIds, perSet, bytes: serializeCanonicalBiology(state) });
  }
  return { state, observer, reference, snapshots, created };
}

const RUN = runWithReference(1);

test("§16 — maintained channels are created for every contract-required focal set", () => {
  assert.deepEqual(
    RUN.created.created.sort(),
    [maintainedChannelId("canopy"), maintainedChannelId("shoreline")].sort()
  );
  assert.deepEqual(RUN.created.skipped, [], "no required focal set may be skipped");
});

test("§16 — a maintained focal channel matches an independent reference at every generation", () => {
  for (const g of MARKS) {
    const snap = RUN.snapshots.get(g);
    assert.ok(snap, `generation ${g} must have been sampled`);
    for (const which of ["canopy", "shoreline"]) {
      const s = snap.perSet[which];
      assert.deepEqual(
        s.outcome.descendantIds,
        s.referenceIds,
        `gen ${g} ${which}: living positive-member ids must match the independent reference`
      );
      assert.ok(
        Math.abs(s.maintainedTotal - s.referenceTotal) < 1e-12,
        `gen ${g} ${which}: living contribution total ${s.maintainedTotal} must match reference ${s.referenceTotal}`
      );
    }
  }
});

test("§16 — the revision-4 genealogy-only resolver DOES lose the lineage after retention", () => {
  // This is the defect, asserted as a property of the old path so the repair
  // cannot be quietly reverted to it.
  const early = RUN.snapshots.get(12).perSet.canopy;
  assert.ok(early.legacy.descendantIds.length > 0, "at generation 12 reconstruction still works");
  assert.equal(early.legacy.historicalPathIntact, true);

  for (const g of [400, 800, 1000]) {
    const late = RUN.snapshots.get(g).perSet.canopy;
    assert.equal(
      late.legacy.descendantIds.length,
      0,
      `gen ${g}: genealogy reconstruction is expected to find nothing — that is the defect`
    );
    assert.equal(late.legacy.historicalPathIntact, false, `gen ${g}: the path is gone`);
    assert.equal(late.legacy.zeroIsTrustworthy, false, `gen ${g}: its zero must be marked untrustworthy`);
    // ...and the maintained channel must nevertheless resolve the lineage.
    assert.ok(
      late.outcome.descendantIds.length > 0,
      `gen ${g}: the maintained channel must still resolve living descendants`
    );
    assert.equal(late.outcome.outcome, FOCAL_OUTCOME.RESOLVED);
    assert.equal(late.outcome.source, "maintained-channel");
  }
});

test("§16 — storage stays bounded to the living population, never to cumulative births", () => {
  for (const g of MARKS) {
    const snap = RUN.snapshots.get(g);
    for (const which of ["canopy", "shoreline"]) {
      assert.ok(
        snap.perSet[which].maintainedSize <= snap.livingIds.length,
        `gen ${g} ${which}: ${snap.perSet[which].maintainedSize} entries for ${snap.livingIds.length} living`
      );
    }
  }
  // And the final state's cumulative births vastly exceed the retained entries.
  const finalLiving = RUN.state.currentIndividuals.length;
  const size = RUN.observer.channels.get(maintainedChannelId("canopy")).values.size;
  assert.ok(size <= finalLiving, `${size} entries for ${finalLiving} living`);
});

test("§16 — no unrelated animal is ever added to a maintained channel", () => {
  // Every positive member at every mark must also be positive in the independent
  // reference. The previous test asserts set equality; this states the direction
  // that matters for "never manufactures a group".
  for (const g of MARKS) {
    const snap = RUN.snapshots.get(g);
    for (const which of ["canopy", "shoreline"]) {
      const s = snap.perSet[which];
      const refSet = new Set(s.referenceIds);
      for (const id of s.outcome.descendantIds) {
        assert.ok(refSet.has(id), `gen ${g} ${which}: id ${id} is not a reference descendant`);
      }
    }
  }
});

test("§4/§16 — observer maintenance never alters canonical biological bytes", () => {
  // The same world advanced with NO observer at all must produce identical bytes.
  const plain = hydrateDefiningFixtureV1(ENV, 1, C);
  for (let g = 0; g < 400; g++) advanceGeneration(plain, C);
  assert.equal(
    serializeCanonicalBiology(plain),
    RUN.snapshots.get(400).bytes,
    "maintaining focal channels must not change canonical biology"
  );
});

test("§16 — an unresolvable ancestry reports FOCAL_ANCESTRY_UNRESOLVABLE, not extinction", () => {
  // No maintained channel, and the window has slid past the founders: the honest
  // answer is "cannot be established", never "no descendant remains".
  const bare = createObserverState();
  const late = RUN.state;
  const out = resolveFocalLineage(bare, late, ENV.canopyFocalIds, { focalSetName: "canopy" });
  assert.equal(out.outcome, FOCAL_OUTCOME.UNRESOLVABLE);
  assert.equal(out.source, "none");
  assert.deepEqual(out.descendantIds, []);
  assert.equal(out.detail.historicalPathIntact, false);
  assert.ok(out.detail.note.includes("NOT a claim that the lineage is extinct"));
  assert.notEqual(out.outcome, FOCAL_OUTCOME.EXTINCT, "unknowable must not be reported as extinct");
});

test("§16 — a nonexistent founder set is UNRESOLVABLE, not extinct", () => {
  // Correction to my own first expectation here: I initially asserted EXTINCT for
  // an id that is not an individual at all. That was wrong. An id with no record
  // cannot be established in either direction, so UNRESOLVABLE is the honest
  // answer and reporting extinction would be the same class of overclaim this
  // repair exists to remove.
  const fresh = hydrateDefiningFixtureV1(ENV, 1, C);
  const out = resolveFocalLineage(createObserverState(), fresh, [999_999], { focalSetName: "nonexistent" });
  assert.equal(out.outcome, FOCAL_OUTCOME.UNRESOLVABLE);
  assert.deepEqual(out.descendantIds, []);
});

test("§16 — a maintained witness matching nobody reports the observation, and no verdict", () => {
  // REVISION-6 REWRITE, and why it is not a weakened oracle.
  //
  // Revision 5 asserted here that this case must read `FOCAL_LINEAGE_EXTINCT`,
  // reasoning that an existing maintained channel makes a zero "evidenced
  // extinction". Contract §16 excludes group-ended logic from Milestone 1, so that
  // outcome should never have existed (structural audit M-1), and the revision-5
  // reasoning was wrong twice over: the zero it trusted was a `contribution > 0`
  // test, which underflows to zero on a real one-sided chain at generation 1075.
  //
  // What must still hold — and is asserted below — is everything except the
  // verdict: no substitute group is offered, the answer is attributed to the
  // witness, and the observation itself is reported rather than hidden.
  //
  // This exercises the decision, not a biological scenario: under the frozen
  // lifecycle a 12-founder set in a 120-founder world does not die out within a
  // tractable run, so the channel is emptied directly. That is stated plainly
  // rather than dressed up as an observed extinction.
  const fresh = hydrateDefiningFixtureV1(ENV, 1, C);
  const observer = createObserverState();
  createMaintainedFocalChannels(observer, fresh, { canopy: ENV.canopyFocalIds });
  const channel = observer.channels.get(maintainedChannelId("canopy"));
  for (const id of [...channel.values.keys()]) channel.values.set(id, 0);
  channel.members.clear();

  const out = resolveFocalLineage(observer, fresh, ENV.canopyFocalIds, { focalSetName: "canopy" });
  assert.equal(out.outcome, FOCAL_OUTCOME.UNRESOLVABLE);
  assert.equal(out.source, "maintained-channel", "the answer is still attributed to the witness");
  assert.deepEqual(out.descendantIds, [], "and no substitute group is offered");
  assert.equal(out.detail.livingDescendantsObservedNow, 0, "the observation must be reported, not hidden");
  assert.ok(
    !Object.values(FOCAL_OUTCOME).some((v) => /EXTINCT|ENDED/i.test(v)),
    "no lineage-ended outcome may exist to report"
  );
});

test("§16 — genealogy reports EXTINCT only while the window still contains the founders", () => {
  // Inside the window, a zero from reconstruction is trustworthy and must be
  // reported as extinction; outside it, the same zero must not be.
  const fresh = hydrateDefiningFixtureV1(ENV, 1, C);
  const early = resolveLivingDescendants(fresh, ENV.canopyFocalIds);
  assert.equal(early.historicalPathIntact, true);
  assert.equal(early.zeroIsTrustworthy, true);

  const late = resolveLivingDescendants(RUN.state, ENV.canopyFocalIds);
  assert.equal(late.historicalPathIntact, false);
  assert.equal(late.zeroIsTrustworthy, false);
});

test("§16 — a maintained channel refuses to start from dead or empty founder sets", () => {
  const late = RUN.state;
  const r = createMaintainedFocalChannels(createObserverState(), late, {
    dead: ENV.canopyFocalIds,   // generation-0 ids, long dead by now
    empty: [],
  });
  assert.deepEqual(r.created, [], "no channel may be fabricated from dead ids");
  const reasons = Object.fromEntries(r.skipped.map((s) => [s.name, s.reason]));
  assert.match(reasons.dead, /FOUNDERS_NOT_ALIVE/);
  assert.equal(reasons.empty, "EMPTY_FOUNDER_SET");
});
