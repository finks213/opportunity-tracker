// @ts-check
/**
 * Canvas-probe world identity and tracer initialization (revision-3 repairs).
 *
 * Two confirmed defects:
 *
 * 1. `fixtureEnvelope` cache presence was used as a proxy for "the current world
 *    is the fixture". The sequence
 *        load fixture -> reset random world -> enter legibility mode
 *    left the RANDOM world on screen while legibility mode claimed to show the
 *    defining fixture required by §22.
 *
 * 2. Tracer creation used the cached fixture focal ids whenever metadata had ever
 *    been loaded, so it could seed fixture ids into a random world, or seed
 *    twelve already-dead ids at a later generation. Either produced a
 *    valid-looking channel with a permanent living contribution of 0 — which a
 *    user cannot distinguish from a lineage that genuinely died out.
 *
 * These run the real controller logic against a minimal DOM/fetch stub, so they
 * exercise `ProbeApp` itself rather than a reimplementation.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import { hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { currentModelConfig as C } from "../src/config/modelConfig.js";
import { TRAIT_INDEX } from "../src/config/traits.js";
import { livingFounderContribution } from "../src/observer/tracerChannels.js";
import { stripCommentsAndStrings } from "../tools/writeFinalReport.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_TEXT = readFileSync(join(HERE, "..", "fixtures", "defining_fixture_v1.json"), "utf8");

/** Minimal DOM stub: only what ProbeApp touches. */
function makeDomStub() {
  const elements = new Map();
  const mk = (id) => ({
    id, textContent: "", innerHTML: "", hidden: false, value: "",
    checked: false, addEventListener() {}, getBoundingClientRect: () => ({ x: 0, y: 0, width: 800, height: 400 }),
  });
  for (const id of ["status", "notice", "inspector", "run-state", "channel-select", "seed-input", "world"]) {
    elements.set(id, mk(id));
  }
  return { getElementById: (id) => elements.get(id) ?? null, _elements: elements };
}

/** Canvas 2D stub sufficient for the probe's draw calls. */
function makeCanvasStub() {
  const noop = () => {};
  const ctx = new Proxy(
    { canvas: null, setTransform: noop, getImageData: () => ({ data: [] }) },
    { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? noop : undefined), set: (t, k, v) => ((t[k] = v), true) }
  );
  return {
    width: 800, height: 400,
    getContext: () => ctx,
    addEventListener() {},
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 800, height: 400 }),
  };
}

/** Build a ProbeApp with stubs installed. Returns {app, restore}. */
async function makeApp({ failFixture = false } = {}) {
  const savedFetch = globalThis.fetch;
  const savedRAF = globalThis.requestAnimationFrame;
  const savedDPR = globalThis.devicePixelRatio;
  const savedAdd = globalThis.addEventListener;

  globalThis.fetch = async () =>
    failFixture
      ? { ok: false, status: 503, text: async () => "" }
      : { ok: true, status: 200, text: async () => FIXTURE_TEXT };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.devicePixelRatio = 1;
  if (typeof globalThis.addEventListener !== "function") globalThis.addEventListener = () => {};

  const { ProbeApp } = await import("../src/main.js");
  const app = new ProbeApp(/** @type {any} */ (makeCanvasStub()), /** @type {any} */ (makeDomStub()));
  app.probe.cssWidth = 800;
  app.probe.cssHeight = 400;
  return {
    app,
    restore() {
      globalThis.fetch = savedFetch;
      globalThis.requestAnimationFrame = savedRAF;
      globalThis.devicePixelRatio = savedDPR;
      globalThis.addEventListener = savedAdd;
    },
  };
}

test("§22 — load fixture, reset random, enter legibility: the fixture is active", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);

  const { envelope } = loadValidatedFixture();

  // 1. load the fixture
  assert.equal(await app.loadDefiningFixture(), true);
  assert.equal(app.worldSource, "defining_fixture");
  const expectedFixtureBytes = serializeCanonicalBiology(
    hydrateDefiningFixtureV1(envelope, app.seed, C)
  );
  assert.equal(serializeCanonicalBiology(app.state), expectedFixtureBytes);

  // 2. reset to a random world — the metadata cache deliberately REMAINS
  app.resetRandomWorld(1);
  assert.equal(app.worldSource, "random");
  assert.notEqual(app.fixtureEnvelope, null, "the parsed envelope may stay cached");
  const randomBytes = serializeCanonicalBiology(app.state);
  assert.notEqual(randomBytes, expectedFixtureBytes);

  // 3. enter legibility mode — this is the exact revision-2 failure path
  await app.setManualTestMode("legibility");
  assert.equal(app.manualTestMode, "legibility");
  assert.equal(app.worldSource, "defining_fixture", "legibility mode must activate the fixture world");
  assert.equal(
    serializeCanonicalBiology(app.state),
    expectedFixtureBytes,
    "the active world must be the defining fixture, not the random world"
  );
  assert.notEqual(serializeCanonicalBiology(app.state), randomBytes);
});

test("§22 — entering legibility twice is idempotent and stays on the fixture", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  await app.setManualTestMode("legibility");
  const first = serializeCanonicalBiology(app.state);
  await app.setManualTestMode("legibility");
  assert.equal(serializeCanonicalBiology(app.state), first);
  assert.equal(app.worldSource, "defining_fixture");
});

test("§22 — a failed fixture load shows an explicit error and no fixture-valid mode", async (t) => {
  const { app, restore } = await makeApp({ failFixture: true });
  t.after(restore);

  const beforeBytes = serializeCanonicalBiology(app.state);
  const ok = await app.loadDefiningFixture();
  assert.equal(ok, false, "a failed load must report failure");
  assert.equal(app.worldSource, "random", "worldSource must not claim the fixture");
  assert.ok(app.fixtureLoadError, "an explicit error must be recorded");
  assert.equal(serializeCanonicalBiology(app.state), beforeBytes, "the world must be untouched");

  // Entering legibility mode must refuse rather than render over the wrong world.
  const entered = await app.setManualTestMode("legibility");
  assert.equal(entered, false);
  assert.equal(app.manualTestMode, null, "must not enter a mode that claims to show the fixture");
  assert.equal(app.worldSource, "random");
  // And the user-visible notice says so.
  assert.match(app.doc.getElementById("notice").textContent, /could not be loaded/i);
  assert.equal(app.doc.getElementById("notice").hidden, false);
});

test("§16 — a tracer created at a later generation is seeded from LIVING individuals", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  await app.loadDefiningFixture();
  assert.equal(app.worldSource, "defining_fixture");

  // Advance 10 generations: the twelve declared focal founders are likely dead.
  for (let g = 0; g < 10; g++) app.advance();
  assert.equal(app.state.generation, 10);

  const result = app.createTracer("canopy-focal", "canopy");
  assert.equal(result.created, true, `tracer should be created: ${result.reason ?? ""}`);

  const livingIds = app.state.currentIndividuals.map((i) => i.id);
  const contribution = livingFounderContribution(app.observer, "canopy-focal", livingIds);
  assert.ok(
    contribution > 0,
    "a newly created tracer must have a positive living contribution, not a silent 0 from dead ids"
  );

  // Every seeded founder must actually be alive right now.
  const channel = app.observer.channels.get("canopy-focal");
  const livingSet = new Set(livingIds);
  for (const id of channel.founderIds) {
    assert.ok(livingSet.has(id), `tracer seeded non-living id ${id}`);
  }

  // And it keeps a positive contribution as the world advances.
  for (let g = 0; g < 5; g++) app.advance();
  const later = livingFounderContribution(
    app.observer,
    "canopy-focal",
    app.state.currentIndividuals.map((i) => i.id)
  );
  assert.ok(later > 0, "contribution must remain meaningful five generations later");
});

test("§16 — a random world never seeds a tracer from cached fixture ids", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  // Cache the fixture metadata, then move to a random world.
  await app.loadDefiningFixture();
  app.resetRandomWorld(4);
  assert.equal(app.worldSource, "random");
  assert.notEqual(app.fixtureEnvelope, null);

  for (let g = 0; g < 6; g++) app.advance();
  const result = app.createTracer("shore", "shoreline");
  assert.equal(result.created, true, result.reason ?? "");

  const livingSet = new Set(app.state.currentIndividuals.map((i) => i.id));
  const channel = app.observer.channels.get("shore");
  for (const id of channel.founderIds) {
    assert.ok(livingSet.has(id), `random-world tracer seeded non-living id ${id}`);
  }
  const contribution = livingFounderContribution(app.observer, "shore", [...livingSet]);
  assert.ok(contribution > 0, "random-world tracer must have real living contribution");
});

test("§16 — no living candidates yields an explicit unavailable result, not a zero channel", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  // Empty the world so no candidate can exist.
  app.state.currentIndividuals = [];
  const result = app.createTracer("nobody", "shoreline");
  assert.equal(result.created, false);
  assert.ok(result.reason, "an explicit reason must be supplied");
  assert.equal(app.observer.channels.has("nobody"), false, "no plausible empty channel may be created");
  assert.match(app.doc.getElementById("notice").textContent, /Tracer not created/i);
});

test("§22 — worldSource is observer-side only and never enters canonical biology", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  await app.loadDefiningFixture();
  const bytes = serializeCanonicalBiology(app.state);
  for (const forbidden of ["worldSource", "defining_fixture", "fixtureLoadError", "tracerUnavailable"]) {
    assert.ok(!bytes.includes(forbidden), `canonical bytes must not contain ${forbidden}`);
  }
});

// ---------------------------------------------------------------------------
// Revision-4: legibility mode must establish the BASELINE fixture every entry
// ---------------------------------------------------------------------------

test("§22 — advancing a fixture world then entering legibility restores the exact baseline", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  const { envelope } = loadValidatedFixture();
  const baselineBytes = serializeCanonicalBiology(hydrateDefiningFixtureV1(envelope, 1, C));

  await app.loadDefiningFixture();
  assert.equal(serializeCanonicalBiology(app.state), baselineBytes);

  // Advance ten generations. `worldSource` stays "defining_fixture" — which is
  // exactly why revision 3 failed to reload here.
  for (let g = 0; g < 10; g++) app.advance();
  assert.equal(app.worldSource, "defining_fixture", "origin marker is unchanged by advancing");
  assert.equal(app.state.generation, 10);
  assert.notEqual(serializeCanonicalBiology(app.state), baselineBytes);
  assert.equal(app.isBaselineFixtureActive(), false, "an advanced world is NOT the baseline fixture");

  const entered = await app.setManualTestMode("legibility");
  assert.notEqual(entered, false);
  assert.equal(app.state.generation, 0, "legibility must restore generation 0");
  assert.equal(app.state.currentIndividuals.length, 120);
  assert.equal(
    serializeCanonicalBiology(app.state),
    baselineBytes,
    "legibility must restore the EXACT baseline fixture bytes"
  );
  assert.equal(app.isBaselineFixtureActive(), true);
});

test("§22 — entering legibility after ONE generation also restores the baseline", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  const { envelope } = loadValidatedFixture();
  const baselineBytes = serializeCanonicalBiology(hydrateDefiningFixtureV1(envelope, 1, C));
  await app.loadDefiningFixture();
  app.advance();
  assert.equal(app.state.generation, 1);
  await app.setManualTestMode("legibility");
  assert.equal(serializeCanonicalBiology(app.state), baselineBytes);
  assert.equal(app.state.generation, 0);
});

test("§22 — the high-webbing fixture is replaced by the unmodified baseline on entry", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  const { envelope } = loadValidatedFixture();
  const baselineBytes = serializeCanonicalBiology(hydrateDefiningFixtureV1(envelope, 1, C));
  const webbing = TRAIT_INDEX.toe_webbing;

  // Load the fixture WITH the experimental override.
  await app.loadDefiningFixture({ highWebbing: true });
  assert.equal(app.worldSource, "defining_fixture");
  const overridden = app.state.currentIndividuals.filter((i) => i.bodyGenome[webbing] === envelope.highWebbing);
  assert.equal(overridden.length, 24, "both focal groups should carry the override");
  assert.notEqual(serializeCanonicalBiology(app.state), baselineBytes);
  assert.equal(app.isBaselineFixtureActive(), false);

  await app.setManualTestMode("legibility");
  assert.equal(
    serializeCanonicalBiology(app.state),
    baselineBytes,
    "legibility must show the UNMODIFIED baseline, with no experimental override"
  );
  // Every animal is back at the low baseline webbing value.
  for (const ind of app.state.currentIndividuals) {
    assert.equal(ind.bodyGenome[webbing], envelope.lowWebbing, `id ${ind.id} still carries an override`);
  }
  assert.equal(app.state.generation, 0);
});

test("§22 — a random world entering legibility lands on the exact baseline fixture", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  const { envelope } = loadValidatedFixture();
  const baselineBytes = serializeCanonicalBiology(hydrateDefiningFixtureV1(envelope, 1, C));
  app.resetRandomWorld(1);
  for (let g = 0; g < 5; g++) app.advance();
  await app.setManualTestMode("legibility");
  assert.equal(serializeCanonicalBiology(app.state), baselineBytes);
  assert.equal(app.worldSource, "defining_fixture");
  assert.equal(app.state.generation, 0);
});

test("§22 — isBaselineFixtureActive distinguishes origin from exact identity", async (t) => {
  const { app, restore } = await makeApp();
  t.after(restore);
  assert.equal(app.isBaselineFixtureActive(), false, "a random world is not the baseline");
  await app.loadDefiningFixture();
  assert.equal(app.isBaselineFixtureActive(), true);
  app.advance();
  assert.equal(app.worldSource, "defining_fixture", "origin still says fixture");
  assert.equal(app.isBaselineFixtureActive(), false, "but identity says it is no longer the baseline");
});

test("§22 — every control the contract requires exists in the probe markup", () => {
  // §22 lists the required controls explicitly. A missing one means the
  // prescribed iPad procedure cannot be carried out, which is exactly the class
  // of defect that made revision 1's legibility mode unusable. Checked
  // statically against index.html so it is fast and needs no browser.
  const html = readFileSync(join(HERE, "..", "index.html"), "utf8");
  const required = {
    "world canvas": "world",
    "living count / generation status": "status",
    "pause": "btn-pause",
    "step one generation": "btn-step",
    "run continuously": "btn-run",
    "reset seed": "seed-input",
    "reset random world": "btn-reset",
    "load the defining fixture": "btn-fixture",
    "raw allocations and genome toggle": "toggle-raw",
    "tracer channel creation": "btn-tracer-canopy",
    "tracer channel selection": "channel-select",
    "click-to-inspect panel": "inspector",
    "legibility mode": "btn-mode-legibility",
    "render-stress mode": "btn-mode-stress",
    "normal mode": "btn-mode-normal",
  };
  const missing = [];
  for (const [what, id] of Object.entries(required)) {
    if (!html.includes(`id="${id}"`)) missing.push(`${what} (id="${id}")`);
  }
  assert.deepEqual(missing, [], `index.html is missing required §22 controls: ${missing.join("; ")}`);
});

test("§22 — the mode-switch and run controls are instrumented for input latency", () => {
  // §22 requires pause, single-step, continuous-run, fixture reset and mode-switch
  // to be instrumented so input-to-next-paint can be recorded.
  //
  // Revision-5 change: locate each method's DEFINITION, not its first textual
  // mention. The previous version searched for the first occurrence of the name,
  // which after revision 5 lands inside a doc comment describing the world-load race
  // — so it inspected prose instead of the method body. Same use-versus-mention
  // distinction applied elsewhere in this pass. The bar is unchanged.
  const main = readFileSync(join(HERE, "..", "src", "main.js"), "utf8");
  const code = stripCommentsAndStrings(main);

  /** Find `name(...) {` at method-definition position and return its body slice. */
  const bodyOf = (name) => {
    const re = new RegExp(`(?:^|\\n)\\s{2}(?:async\\s+)?${name}\\s*\\(`, "m");
    const m = re.exec(code);
    if (!m) return null;
    return code.slice(m.index, m.index + 1200);
  };

  const required = ["setRunning", "stepOnce", "loadDefiningFixture", "resetRandomWorld", "setManualTestMode"];
  for (const name of required) {
    const body = bodyOf(name);
    assert.ok(body, `${name} must exist as a method`);
    assert.ok(
      body.includes("markInput"),
      `${name} must call meter.markInput() so its input-to-next-paint latency is sampled`
    );
  }

  // At least the five §22 control paths must be instrumented.
  const marks = [...code.matchAll(/markInput\(\)/g)].length;
  assert.ok(marks >= 5, `expected at least 5 instrumented control paths, found ${marks}`);
});
