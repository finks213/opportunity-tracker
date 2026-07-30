// @ts-check
/**
 * The maintained focal witnesses must survive normal UI operation, and following a
 * focal lineage must show the contribution that was actually propagated
 * (contract §16; revision-6 repairs, Break 2 / MC-3 / R6-D, R6-E).
 *
 * Reproduced against revision 5, both findings:
 *
 *   channels after fixture load [ 'maintained:canopy', 'maintained:shoreline' ]
 *   channels after Clear Tracers []
 *   at generation 400, 270 living -> FOCAL_ANCESTRY_UNRESOLVABLE
 *
 *   maintained positive: 83  range 0.09375 .. 0.40625  sum 22.23046875
 *   followed   positive: 83  range 1 .. 1              sum 83
 *
 * The first is a reachable one-click destruction of the evidence the revision-5
 * focal repair depends on. The second replaces quantitative inherited contribution
 * with binary membership under the name of the focal lineage. Every test below
 * fails against revision 5.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ProbeApp } from "../src/main.js";
import { MAINTAINED_CHANNEL_PREFIX, selectableChannelIds } from "../src/observer/tracerChannels.js";
import { wireControls } from "../src/debug/controls.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(HERE, "..", "fixtures", "defining_fixture_v1.json"), "utf8");

function stubElement() {
  return {
    textContent: "", hidden: true, innerHTML: "", value: "",
    addEventListener() {},
    getBoundingClientRect: () => ({ width: 1100, height: 620, left: 0, top: 0 }),
  };
}

async function loadedApp() {
  const prior = { fetch: globalThis.fetch, raf: globalThis.requestAnimationFrame, add: globalThis.addEventListener };
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => RAW });
  globalThis.devicePixelRatio = 1;
  globalThis.addEventListener = () => {};
  globalThis.requestAnimationFrame = () => 0;
  const canvas = { ...stubElement(), getContext: () => new Proxy({}, { get: () => () => {} }), width: 1100, height: 620 };
  const app = new ProbeApp(canvas, { getElementById: () => stubElement() });
  await app.loadDefiningFixture();
  const restore = () => {
    globalThis.fetch = prior.fetch;
    globalThis.requestAnimationFrame = prior.raf;
    globalThis.addEventListener = prior.add;
  };
  return { app, restore };
}

const maintainedIds = (app) =>
  [...app.observer.channels.keys()].filter((k) => k.startsWith(MAINTAINED_CHANNEL_PREFIX));

test("§16 — Clear Tracers removes user channels and keeps the protected witnesses", async () => {
  const { app, restore } = await loadedApp();
  try {
    app.followFocalLineage("mine", "canopy");
    assert.ok(app.observer.channels.has("mine"), "the user channel must exist first");
    assert.deepEqual(maintainedIds(app).sort(), ["maintained:canopy", "maintained:shoreline"]);

    app.clearTracers();

    assert.equal(app.observer.channels.has("mine"), false, "user channels must be cleared");
    assert.deepEqual(
      maintainedIds(app).sort(),
      ["maintained:canopy", "maintained:shoreline"],
      "protected witnesses must survive the visible Clear control"
    );
  } finally { restore(); }
});

test("§16 — the reachable history: load, Clear, advance past the retention window, follow", async () => {
  // Exactly the sequence the repair order specifies, through the supplied control.
  const { app, restore } = await loadedApp();
  try {
    app.clearTracers();
    for (let g = 0; g < 400; g++) app.advance();
    assert.equal(app.state.generation, 400);
    assert.ok(app.state.currentIndividuals.length > 0, "the world must still be populated");

    for (const which of ["canopy", "shoreline"]) {
      const r = app.followFocalLineage(`v-${which}`, which);
      // Revision 5 answered FOCAL_ANCESTRY_UNRESOLVABLE here.
      assert.equal(r.created, true, `${which}: the protected witness must still resolve past generation 360`);
      assert.equal(r.source, "maintained-channel");
      assert.ok(r.founderCount > 0);
      // ...and it must be the RIGHT lineage: the witness's founders are the
      // envelope's founders.
      const expected = which === "canopy"
        ? app.fixtureEnvelope.canopyFocalIds
        : app.fixtureEnvelope.shorelineFocalIds;
      assert.deepEqual(app.observer.channels.get(`maintained:${which}`).founderIds, expected);
    }
  } finally { restore(); }
});

test("§16 — the Clear control wired into the UI is the protecting one", () => {
  // A protecting method is worthless if the button calls something else. This
  // checks the actual wiring, not a method in isolation.
  const handlers = new Map();
  const doc = {
    getElementById: (id) => ({
      ...stubElement(),
      addEventListener: (ev, fn) => handlers.set(`${id}:${ev}`, fn),
    }),
  };
  const calls = [];
  const app = /** @type {any} */ ({
    clearTracers: () => calls.push("clearTracers"),
    observer: { channels: new Map() },
    setRunning() {}, stepOnce() {}, setShowRawValues() {}, setActiveChannel() {},
    resetRandomWorld() {}, loadDefiningFixture: async () => true, setManualTestMode: async () => true,
    createTracer() {}, followNewHabitatGroup() {}, renderPanels() {}, refreshChannelSelect() {},
    setSeed() {}, advance() {},
  });
  wireControls(app, doc);
  const clear = [...handlers.entries()].find(([k]) => /clear/i.test(k));
  assert.ok(clear, "a clear control must be wired");
  clear[1]({ preventDefault() {} });
  assert.deepEqual(calls, ["clearTracers"], "the control must call the protecting clear, not channels.clear()");
});

test("§16 — protected witnesses are not offered as ordinary selectable tracers", async () => {
  const { app, restore } = await loadedApp();
  try {
    assert.deepEqual(selectableChannelIds(app.observer), [], "only user channels are selectable");
    app.followFocalLineage("mine", "canopy");
    assert.deepEqual(selectableChannelIds(app.observer), ["mine"]);
    assert.equal(
      app.observer.activeChannel,
      "mine",
      "the displayed channel is the user's, never the internal witness"
    );
  } finally { restore(); }
});

test("§16 — following a focal lineage preserves the propagated fractional contribution", async () => {
  const { app, restore } = await loadedApp();
  try {
    for (let g = 0; g < 10; g++) app.advance();
    const living = app.state.currentIndividuals.map((i) => i.id);
    const maintained = app.observer.channels.get("maintained:canopy");
    const before = living.map((id) => maintained.values.get(id) ?? 0).filter((v) => v > 0);
    assert.ok(before.length > 0, "the witness must carry contribution");
    assert.ok(Math.min(...before) < 1, "and it must be fractional, or this test proves nothing");

    const r = app.followFocalLineage("visible", "canopy");
    assert.equal(r.created, true);
    assert.equal(r.mirroredFrom, "maintained:canopy", "the visible channel must mirror the witness");

    const visible = app.observer.channels.get("visible");
    const after = living.map((id) => visible.values.get(id) ?? 0).filter((v) => v > 0);
    // Revision 5: after was [1, 1, 1, ...] with sum equal to the count.
    assert.deepEqual(after.slice().sort(), before.slice().sort(), "every contribution value must survive");
    assert.equal(
      after.reduce((a, b) => a + b, 0),
      before.reduce((a, b) => a + b, 0),
      "the total inherited contribution must be unchanged by looking at it"
    );
    assert.notEqual(
      Math.max(...after), Math.min(...after),
      "a channel whose values are all identical is binary membership, not contribution"
    );
  } finally { restore(); }
});

test("§16 — the mirror is a copy, so clearing it cannot damage the witness", async () => {
  const { app, restore } = await loadedApp();
  try {
    for (let g = 0; g < 5; g++) app.advance();
    app.followFocalLineage("visible", "canopy");
    const witness = app.observer.channels.get("maintained:canopy");
    const snapshot = new Map(witness.values);
    app.clearTracers();
    assert.equal(app.observer.channels.has("visible"), false);
    assert.deepEqual(
      [...app.observer.channels.get("maintained:canopy").values.entries()].sort(),
      [...snapshot.entries()].sort(),
      "the witness must be untouched by anything done to its mirror"
    );
  } finally { restore(); }
});
