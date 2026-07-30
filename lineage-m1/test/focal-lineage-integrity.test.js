// @ts-check
/**
 * No silent focal-lineage reseeding, in either layer (revision-4).
 *
 * 2A — probe level. Revision 3 fell back to "the first twelve current animals
 * with sufficient habitat use" when the focal members were gone. Those animals
 * are not necessarily descendants of the requested lineage, so the interface
 * presented a newly selected habitat group as continuation of the focal group.
 *
 * 2B — constructor level. `createTracerChannel()` inserted requested ids even
 * when the animals were not alive:
 *
 *   for (const id of founderIds) if (!values.has(id)) values.set(id, 1);
 *
 * Reproduced: channel `dead` from founder 99 with living `[1,2,3]` returned keys
 * `[1,2,3,99]`, founders `[99]`, living contribution `0` — a plausible zero
 * channel the caller could not distinguish from a genuinely extinct lineage.
 * §16 permits retroactive selection only for animals already alive.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createObserverState,
  createTracerChannel,
  resolveLivingDescendants,
  livingFounderContribution,
  TracerFounderError,
} from "../src/observer/tracerChannels.js";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { currentModelConfig as C } from "../src/config/modelConfig.js";
import { hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { FOCAL_OUTCOME } from "../src/observer/tracerChannels.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_TEXT = readFileSync(join(HERE, "..", "fixtures", "defining_fixture_v1.json"), "utf8");

// --------------------------------------------------------------------------
// 2B — the exported constructor
// --------------------------------------------------------------------------

test("§16 — dead founder ids produce an explicit rejection, not a zero channel", () => {
  const observer = createObserverState();
  // The exact revision-3 falsifier.
  assert.throws(
    () => createTracerChannel(observer, "dead", [99], [1, 2, 3]),
    (err) => {
      assert.ok(err instanceof TracerFounderError);
      assert.equal(err.reason, "FOUNDERS_NOT_ALIVE");
      assert.deepEqual(err.invalidFounderIds, [99]);
      return true;
    }
  );
  assert.equal(observer.channels.has("dead"), false, "no plausible channel may be created");
});

test("§16 — absent, empty, and partially-invalid founder sets are all rejected", () => {
  const observer = createObserverState();
  for (const [label, founders, reason] of [
    ["absent id", [500], "FOUNDERS_NOT_ALIVE"],
    ["empty set", [], "EMPTY_FOUNDER_SET"],
    ["mixed valid + dead", [1, 99], "FOUNDERS_NOT_ALIVE"],
    ["all dead", [98, 99], "FOUNDERS_NOT_ALIVE"],
  ]) {
    assert.throws(
      () => createTracerChannel(observer, `t-${label}`, founders, [1, 2, 3]),
      (err) => err.reason === reason,
      `${label} must be rejected with ${reason}`
    );
    assert.equal(observer.channels.size, 0, `${label}: no channel may be created`);
  }
});

test("§16 — no nonliving id is ever inserted into the tracer map", () => {
  const observer = createObserverState();
  createTracerChannel(observer, "ok", [1, 2], [1, 2, 3]);
  const keys = [...observer.channels.get("ok").values.keys()].sort((a, b) => a - b);
  assert.deepEqual(keys, [1, 2, 3], "only current living ids may appear");
  assert.equal(observer.channels.get("ok").values.get(1), 1);
  assert.equal(observer.channels.get("ok").values.get(3), 0);
  // And the living contribution is genuinely positive.
  assert.equal(livingFounderContribution(observer, "ok", [1, 2, 3]), 2);
});

test("§16 — the constructor source contains no dead-id insertion loop", () => {
  const src = readFileSync(join(HERE, "..", "src", "observer", "tracerChannels.js"), "utf8");
  assert.ok(
    !/for \(const id of founderIds\) if \(!values\.has\(id\)\) values\.set\(id, 1\)/.test(src),
    "the revision-3 dead-founder insertion must be gone"
  );
});

// --------------------------------------------------------------------------
// Genealogical descendant resolution
// --------------------------------------------------------------------------

test("§16 — living descendants are resolved from actual parentage", () => {
  const state = createInitialState(3, C);
  const focal = state.currentIndividuals.slice(0, 12).map((i) => i.id);

  // At generation 0 the focal animals are themselves alive.
  const atZero = resolveLivingDescendants(state, focal);
  assert.deepEqual(atZero.descendantIds, focal);
  assert.equal(atZero.resolvedFromGenealogy, false, "no genealogy walk needed while founders live");

  for (let g = 0; g < 12; g++) advanceGeneration(state, C);

  const later = resolveLivingDescendants(state, focal);
  const living = new Set(state.currentIndividuals.map((i) => i.id));
  for (const id of later.descendantIds) {
    assert.ok(living.has(id), `resolved id ${id} must be alive`);
  }
  // Every resolved individual must genuinely descend from the focal set.
  //
  // Verified with an INDEPENDENT backward breadth-first search over BOTH parents.
  // (A single-parent walk up parentIds[0] is wrong: a descent path can pass
  // through either parent at any level.)
  const byChild = new Map(state.retainedGenealogy.map((r) => [r.childId, r]));
  const focalSet = new Set(focal);
  const descendsFromFocal = (startId) => {
    const queue = [startId];
    const seen = new Set();
    while (queue.length > 0) {
      const id = queue.shift();
      if (focalSet.has(id)) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const rec = byChild.get(id);
      if (!rec || rec.parentIds === null) continue;
      queue.push(rec.parentIds[0], rec.parentIds[1]);
    }
    return false;
  };
  for (const id of later.descendantIds) {
    assert.ok(descendsFromFocal(id), `id ${id} must trace back to the focal set`);
  }
  assert.ok(later.descendantIds.length > 0, "expected living descendants after 12 generations");

  // And the resolver must not MISS a genuine living descendant.
  const resolvedSet = new Set(later.descendantIds);
  for (const ind of state.currentIndividuals) {
    if (descendsFromFocal(ind.id)) {
      assert.ok(resolvedSet.has(ind.id), `resolver missed living descendant ${ind.id}`);
    }
  }
});

test("§16 — unrelated habitat occupants are never returned as descendants", () => {
  const state = createInitialState(5, C);
  // Follow the SHORELINE band, then check that canopy-band animals are excluded.
  const shorelineFocal = state.currentIndividuals.filter((i) => i.id >= 81).slice(0, 12).map((i) => i.id);
  for (let g = 0; g < 8; g++) advanceGeneration(state, C);
  const resolved = new Set(resolveLivingDescendants(state, shorelineFocal).descendantIds);

  // Build the true descendant set independently.
  const descends = new Set(shorelineFocal);
  for (const r of state.retainedGenealogy.slice().sort((a, b) => a.childId - b.childId)) {
    if (r.parentIds && (descends.has(r.parentIds[0]) || descends.has(r.parentIds[1]))) descends.add(r.childId);
  }
  for (const id of resolved) {
    assert.ok(descends.has(id), `id ${id} is not a genuine descendant of the shoreline focal set`);
  }
  // Some living animals must be excluded, or the test proves nothing.
  const excluded = state.currentIndividuals.filter((i) => !resolved.has(i.id));
  assert.ok(excluded.length > 0, "expected some living animals to be excluded");
});

// --------------------------------------------------------------------------
// 2A — probe level
// --------------------------------------------------------------------------

function makeDomStub() {
  const mk = (id) => ({
    id, textContent: "", innerHTML: "", hidden: false, value: "",
    checked: false, addEventListener() {}, getBoundingClientRect: () => ({ x: 0, y: 0, width: 800, height: 400 }),
  });
  const map = new Map(["status", "notice", "inspector", "run-state", "channel-select", "seed-input", "world"].map((id) => [id, mk(id)]));
  return { getElementById: (id) => map.get(id) ?? null };
}
function makeCanvasStub() {
  const noop = () => {};
  const ctx = new Proxy({ setTransform: noop, getImageData: () => ({ data: [] }) },
    { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? noop : undefined), set: (t, k, v) => ((t[k] = v), true) });
  return { width: 800, height: 400, getContext: () => ctx, addEventListener() {}, getBoundingClientRect: () => ({ x: 0, y: 0, width: 800, height: 400 }) };
}
async function makeApp() {
  const saved = { fetch: globalThis.fetch, raf: globalThis.requestAnimationFrame, dpr: globalThis.devicePixelRatio };
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => FIXTURE_TEXT });
  globalThis.requestAnimationFrame = () => 0;
  globalThis.devicePixelRatio = 1;
  if (typeof globalThis.addEventListener !== "function") globalThis.addEventListener = () => {};
  const { ProbeApp } = await import("../src/main.js");
  const app = new ProbeApp(/** @type {any} */ (makeCanvasStub()), /** @type {any} */ (makeDomStub()));
  app.probe.cssWidth = 800; app.probe.cssHeight = 400;
  return { app, restore() { globalThis.fetch = saved.fetch; globalThis.requestAnimationFrame = saved.raf; globalThis.devicePixelRatio = saved.dpr; } };
}

test("§16 — following a focal lineage resolves descendants, never habitat substitutes", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  await app.loadDefiningFixture();
  for (let g = 0; g < 10; g++) app.advance();

  const result = app.followFocalLineage("canopy-focal", "canopy");
  assert.equal(result.created, true, result.reason ?? "");

  const { envelope } = loadValidatedFixture();
  const truth = new Set(resolveLivingDescendants(app.state, envelope.canopyFocalIds).descendantIds);
  const channel = app.observer.channels.get("canopy-focal");

  // REVISION-6 RE-EXPRESSION (R6-E), same oracle, new structure. Revision 5 built
  // this channel by RE-SEEDING it from the living descendants, so `founderIds`
  // held living animals and this loop checked them. The channel is now MIRRORED
  // from the maintained witness, so `founderIds` correctly names the generation-0
  // focal set it is a lineage of, and the living animals it attributes ancestry to
  // are its members. The substitution check — the thing this test exists for — is
  // therefore made against the LIVING animals the channel claims, which is exactly
  // what a habitat substitute would corrupt.
  assert.deepEqual(
    channel.founderIds, envelope.canopyFocalIds,
    "the channel must be a lineage of the requested focal founders"
  );
  const claimed = app.state.currentIndividuals
    .map((i) => i.id)
    .filter((id) => channel.members.has(id) || (channel.values.get(id) ?? 0) > 0);
  assert.ok(claimed.length > 0, "the channel must claim someone, or this proves nothing");
  for (const id of claimed) {
    assert.ok(truth.has(id), `claimed id ${id} is not a genealogical descendant of the focal lineage`);
  }
  assert.ok(
    livingFounderContribution(app.observer, "canopy-focal", app.state.currentIndividuals.map((i) => i.id)) > 0
  );
});

test("§16 — a vanished focal lineage never yields a substitute, and says which case it is", async (t) => {
  // REVISION-5 UPDATE, and why it is not a weakened test.
  //
  // This test previously required the literal reason `FOCAL_LINEAGE_UNAVAILABLE`.
  // That outcome name is gone because it asserted biological absence in a case where
  // absence had not been established — the defect the revision-4 audit found as BUG 1
  // (at generation 400: 293 living animals, all 293 with positive focal contribution,
  // and the UI saying "no living descendant remains").
  //
  // The property this test actually guards is unchanged and still enforced in full:
  // no substitute channel is ever created, and the caller is told the truth. What
  // changed is that the truth is now one of two distinguishable answers:
  //
  //   FOCAL_LINEAGE_EXTINCT        evidenced absence
  //   FOCAL_ANCESTRY_UNRESOLVABLE  cannot be established either way
  //
  // Both are asserted to be non-substituting below. Accepting either is not a
  // loosened bar: the old single name could not express the difference, which is
  // precisely what made it wrong.
  const { app, restore } = await makeApp();
  t.after(restore);
  await app.loadDefiningFixture();

  // Force the focal lineage out of existence while leaving other animals alive.
  const { envelope } = loadValidatedFixture();
  const focal = new Set(envelope.canopyFocalIds);
  app.state.currentIndividuals = app.state.currentIndividuals.filter((i) => !focal.has(i.id));
  app.state.retainedGenealogy = app.state.retainedGenealogy.filter((r) => !focal.has(r.childId));
  // The maintained channel was created from the ORIGINAL founders, which have just
  // been removed, so it too must now report no living contribution.
  assert.ok(app.state.currentIndividuals.length > 0, "other animals must remain alive");
  assert.ok(
    app.state.currentIndividuals.some((i) => i.timeAllocation[0] >= 0.5),
    "canopy-using animals must remain, so a substitute WOULD have been available"
  );

  const result = app.followFocalLineage("canopy-focal", "canopy");
  assert.equal(result.created, false, "no channel may be created");
  assert.ok(
    result.reason === FOCAL_OUTCOME.EXTINCT || result.reason === FOCAL_OUTCOME.UNRESOLVABLE,
    `expected an EXTINCT or UNRESOLVABLE outcome, got ${result.reason}`
  );
  assert.equal(app.observer.channels.has("canopy-focal"), false, "no channel may be created");
  // The reason surfaced to the user must name the case, and must never be the
  // revision-4 name that conflated the two.
  assert.match(app.tracerUnavailableReason, /FOCAL_LINEAGE_EXTINCT|FOCAL_ANCESTRY_UNRESOLVABLE/);
  assert.ok(
    !app.tracerUnavailableReason.includes("FOCAL_LINEAGE_UNAVAILABLE"),
    "the retired outcome name must not reappear"
  );
  // And no unrelated animal was followed under the focal label.
  for (const [id] of app.observer.channels) {
    assert.ok(!id.includes("canopy-focal"), `a substitute channel ${id} must not exist`);
  }
});

test("§16 — following a NEW habitat group is a separately named action", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  await app.loadDefiningFixture();
  const { envelope } = loadValidatedFixture();
  const focal = new Set(envelope.canopyFocalIds);
  app.state.currentIndividuals = app.state.currentIndividuals.filter((i) => !focal.has(i.id));

  // The focal action refuses — with either honest non-substituting outcome. The
  // revision-4 literal `FOCAL_LINEAGE_UNAVAILABLE` is retired (see the test above);
  // what matters here is unchanged: the focal action refuses while the separately
  // named new-group action succeeds.
  const refusal = app.followFocalLineage("focal", "canopy");
  assert.equal(refusal.created, false);
  assert.ok(
    refusal.reason === FOCAL_OUTCOME.EXTINCT || refusal.reason === FOCAL_OUTCOME.UNRESOLVABLE,
    `expected an EXTINCT or UNRESOLVABLE refusal, got ${refusal.reason}`
  );
  // ...while the explicitly-named new-group action succeeds and is clearly distinct.
  const newGroup = app.followNewHabitatGroup("new-canopy-group", "canopy");
  assert.equal(newGroup.created, true, newGroup.reason ?? "");
  assert.ok(app.observer.channels.has("new-canopy-group"));
  assert.equal(app.observer.channels.has("focal"), false);
  // Both methods exist and are distinct functions.
  assert.notEqual(app.followFocalLineage, app.followNewHabitatGroup);
});

test("§16 — a random world uses the new-group action, never a focal-lineage claim", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  await app.loadDefiningFixture();     // cache the envelope
  app.resetRandomWorld(4);             // then move to a random world
  const result = app.createTracer("shore", "shoreline");
  assert.equal(result.created, true, result.reason ?? "");
  const living = new Set(app.state.currentIndividuals.map((i) => i.id));
  for (const id of app.observer.channels.get("shore").founderIds) {
    assert.ok(living.has(id), `random-world tracer seeded non-living id ${id}`);
  }
  // Asking for a focal lineage in a random world is explicitly refused.
  const focal = app.followFocalLineage("focal", "canopy");
  assert.equal(focal.created, false);
  assert.equal(focal.reason, "FOCAL_LINEAGE_REQUIRES_FIXTURE");
});

test("§16 — no living candidates yields an explicit reason, not an empty channel", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  app.state.currentIndividuals = [];
  const result = app.followNewHabitatGroup("nobody", "shoreline");
  assert.equal(result.created, false);
  assert.equal(result.reason, "NO_LIVING_CANDIDATES");
  assert.equal(app.observer.channels.has("nobody"), false);
});
