// @ts-check
/**
 * §22 legibility mode must BE the defining fixture for as long as it is active, not
 * merely when it is entered (revision-7 repair, revision-6 structural audit
 * Finding 1).
 *
 * Reproduced against revision 6 through ordinary controls:
 *
 *   enter legibility        mode=legibility generation=0 baseline=true
 *   press Step              mode=legibility generation=1 baseline=false
 *   load fixture + webbing  mode=legibility variant=high_webbing baseline=false
 *
 * The label kept claiming the prescribed §22 world while the world underneath it was
 * a different one — the exact condition the manual device procedure depends on. The
 * revision-6 tests proved correctness on ENTRY, which is why this survived.
 *
 * The invariant is now continuous: any control that advances or replaces biology
 * leaves the mode first, and `renderPanels()` re-checks it every frame.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ProbeApp } from "../src/main.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(HERE, "..", "fixtures", "defining_fixture_v1.json"), "utf8");

function stubElement() {
  return {
    textContent: "", hidden: true, innerHTML: "", value: "",
    addEventListener() {},
    getBoundingClientRect: () => ({ width: 1100, height: 620, left: 0, top: 0 }),
  };
}

/** A ProbeApp on stubs, with the fixture always available. */
function harness() {
  const prior = {
    fetch: globalThis.fetch, raf: globalThis.requestAnimationFrame,
    add: globalThis.addEventListener, dpr: globalThis.devicePixelRatio,
  };
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => RAW });
  globalThis.devicePixelRatio = 1;
  globalThis.addEventListener = () => {};
  globalThis.requestAnimationFrame = () => 0;
  const els = new Map();
  const canvas = {
    ...stubElement(),
    getContext: () => new Proxy({}, { get: () => () => {} }),
    width: 1100, height: 620,
  };
  const app = new ProbeApp(canvas, {
    getElementById: (id) => { if (!els.has(id)) els.set(id, stubElement()); return els.get(id); },
  });
  const restore = () => {
    globalThis.fetch = prior.fetch;
    globalThis.requestAnimationFrame = prior.raf;
    globalThis.addEventListener = prior.add;
    globalThis.devicePixelRatio = prior.dpr;
  };
  return { app, restore };
}

/** The invariant itself: whenever the mode is active, the world is the baseline. */
function assertInvariant(app, label) {
  if (app.manualTestMode !== "legibility") return;
  assert.equal(
    app.isBaselineFixtureActive(),
    true,
    `${label}: legibility mode is active over a world that is not the baseline fixture`
  );
}

test("§22 — legibility mode is the baseline fixture on entry", async (t) => {
  const { app, restore } = harness();
  t.after(restore);
  assert.equal(await app.setManualTestMode("legibility"), true);
  assert.equal(app.manualTestMode, "legibility");
  assert.equal(app.state.generation, 0);
  assert.equal(app.fixtureVariant, "baseline");
  assertInvariant(app, "entry");
});

test("§22 — Step leaves legibility mode instead of advancing under it", async (t) => {
  const { app, restore } = harness();
  t.after(restore);
  await app.setManualTestMode("legibility");
  app.stepOnce();
  // Revision 6: mode=legibility, generation=1, baseline=false.
  assert.equal(app.state.generation, 1, "the step must still happen — the control is not disabled");
  assert.notEqual(app.manualTestMode, "legibility", "but the mode must not survive it");
  assert.match(app.legibilityExitReason, /generation 0/, "and the user must be told why");
  assertInvariant(app, "after Step");
});

test("§22 — Run leaves legibility mode before any frame advances", async (t) => {
  const { app, restore } = harness();
  t.after(restore);
  await app.setManualTestMode("legibility");
  app.setRunning(true);
  assert.notEqual(app.manualTestMode, "legibility");
  assert.equal(app.running, true);
  assertInvariant(app, "after Run");
  // Advancing frames afterwards cannot bring the label back.
  for (let i = 0; i < 5; i++) app.advance();
  assertInvariant(app, "after frames");
});

test("§22 — the webbing override leaves legibility mode", async (t) => {
  const { app, restore } = harness();
  t.after(restore);
  await app.setManualTestMode("legibility");
  assert.equal(await app.loadDefiningFixture({ highWebbing: true }), true);
  // Revision 6: mode=legibility, variant=high_webbing, baseline=false.
  assert.equal(app.fixtureVariant, "high_webbing", "the load must still happen");
  assert.notEqual(app.manualTestMode, "legibility");
  assert.match(app.legibilityExitReason, /webbing override/);
  assertInvariant(app, "after webbing override");
});

test("§22 — a baseline fixture reload keeps the mode, because it keeps the world", async (t) => {
  const { app, restore } = harness();
  t.after(restore);
  await app.setManualTestMode("legibility");
  assert.equal(await app.loadDefiningFixture(), true);
  assert.equal(app.manualTestMode, "legibility", "reloading the same baseline is not a violation");
  assert.equal(app.isBaselineFixtureActive(), true);
  assertInvariant(app, "after baseline reload");
});

test("§22 — a random reset leaves legibility mode", async (t) => {
  const { app, restore } = harness();
  t.after(restore);
  await app.setManualTestMode("legibility");
  app.resetRandomWorld(9);
  assert.equal(app.manualTestMode, null);
  assert.equal(app.worldSource, "random");
  assertInvariant(app, "after random reset");
});

test("§22 — every rendered frame under the label is the baseline, whatever happened", async (t) => {
  // The backstop: even if some future path changes the world without going through
  // a control, rendering re-checks the invariant and drops the label.
  const { app, restore } = harness();
  t.after(restore);
  await app.setManualTestMode("legibility");
  // Change the world behind the controller's back.
  app.state.generation = 3;
  app.renderPanels();
  assert.notEqual(app.manualTestMode, "legibility", "rendering must not paint a false legibility frame");
  assert.match(app.legibilityExitReason, /no longer the unmodified defining fixture/);
});

test("§22 — the whole control surface preserves the invariant, in sequence", async (t) => {
  const { app, restore } = harness();
  t.after(restore);
  const steps = [
    ["enter", async () => { await app.setManualTestMode("legibility"); }],
    ["step", async () => app.stepOnce()],
    ["re-enter", async () => { await app.setManualTestMode("legibility"); }],
    ["run", async () => app.setRunning(true)],
    ["stop", async () => app.setRunning(false)],
    ["re-enter", async () => { await app.setManualTestMode("legibility"); }],
    ["webbing", async () => { await app.loadDefiningFixture({ highWebbing: true }); }],
    ["re-enter", async () => { await app.setManualTestMode("legibility"); }],
    ["reset", async () => app.resetRandomWorld(3)],
    ["re-enter", async () => { await app.setManualTestMode("legibility"); }],
    ["baseline reload", async () => { await app.loadDefiningFixture(); }],
  ];
  for (const [label, run] of steps) {
    await run();
    app.renderPanels();
    assertInvariant(app, label);
  }
  // ...and the mode is still usable at the end, not permanently burned.
  assert.equal(app.manualTestMode, "legibility");
  assert.equal(app.isBaselineFixtureActive(), true);
});

// ---------------------------------------------------------------------------
// REVISION-8 REPAIR (revision-7 structural audit, Finding 3).
//
// The tests above drive the CONTROLS and then call `renderPanels()`. The animation
// loop does not go through `renderPanels()` on every frame: `frame()` calls
// `renderLegibility()` directly. `advance()` is exported and the live app is
// published as `globalThis.lineageProbe` for manual measurement, so:
//
//   enter legibility; lineageProbe.advance()
//   before frame: mode=legibility generation=1 baseline=false
//   after  frame: mode=legibility generation=1 baseline=false
//
// A legibility frame was rendered over a non-baseline world. These tests drive the
// REAL frame path.
// ---------------------------------------------------------------------------

test("§22 — the animation frame itself enforces the invariant", async (t) => {
  const { app, restore } = harness();
  t.after(restore);
  await app.setManualTestMode("legibility");

  // The exposed operation the probe publishes for manual measurement.
  app.advance();
  assert.equal(app.state.generation, 1, "the advance must really have happened");
  assert.equal(app.isBaselineFixtureActive(), false);

  // One frame through the actual loop entry point.
  app.frame(0);

  assert.notEqual(
    app.manualTestMode, "legibility",
    "a frame may not be rendered under the legibility label over a non-baseline world"
  );
  assertInvariant(app, "after frame()");
});

test("§22 — renderLegibility refuses to paint a legibility frame off-baseline", async (t) => {
  // Defence in depth: called directly, it must not draw the legibility layout over
  // a world that is not the baseline.
  const { app, restore } = harness();
  t.after(restore);
  await app.setManualTestMode("legibility");
  app.advance();
  app.renderLegibility();
  assert.notEqual(app.manualTestMode, "legibility");
  assertInvariant(app, "after renderLegibility()");
});

test("§22 — a running world never renders a legibility frame", async (t) => {
  const { app, restore } = harness();
  t.after(restore);
  await app.setManualTestMode("legibility");
  // Force the running path without going through setRunning(), the way a stale
  // caller or a restored session might.
  app.running = true;
  app.lastAdvance = -100000;
  app.frame(1000);
  assertInvariant(app, "after a running frame");
  assert.notEqual(app.manualTestMode, "legibility");
});
