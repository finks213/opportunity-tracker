// @ts-check
/**
 * Asynchronous world-changing requests must be transactional (contract §22;
 * revision-5 repair, BUG 2 / R5-2).
 *
 * Reproduced against revision 4 with deferred promises, matching the auditor's
 * falsifier output verbatim:
 *
 *   start older "fixture + webbing override" load
 *   -> enter legibility mode, starting a second load
 *   -> resolve the legibility load first  (mode=legibility, exact baseline=true)
 *   -> resolve the older high-webbing load last
 *
 *     manualTestMode: legibility
 *     worldSource: defining_fixture
 *     isBaselineFixtureActive(): false
 *     olderRequestOverwroteNewerModeWorld: true
 *
 * The mode and the source marker both claimed the defining fixture while the
 * biological bytes held the high-webbing override, so the prescribed device test
 * could run against the wrong world on a reachable UI history.
 *
 * The revision-4 tests awaited each load serially, proving sequential histories but
 * not the control wiring, which is genuinely concurrent. These tests control
 * completion order explicitly. Every one fails against revision 4.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ProbeApp } from "../src/main.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(HERE, "..", "fixtures", "defining_fixture_v1.json"), "utf8");

/** A DOM stub sufficient for ProbeApp's constructor and renderPanels. */
function stubElement() {
  return {
    textContent: "", hidden: true, innerHTML: "", value: "",
    addEventListener() {},
    getBoundingClientRect: () => ({ width: 1100, height: 620, left: 0, top: 0 }),
  };
}

/**
 * A ProbeApp whose fetch completion this test controls.
 * @returns {{app:any, gates:Array<{ok:Function, fail:Function, reject:Function}>, restore:Function}}
 */
function harness() {
  const priorFetch = globalThis.fetch;
  const priorRaf = globalThis.requestAnimationFrame;
  const priorAdd = globalThis.addEventListener;
  const priorDpr = globalThis.devicePixelRatio;

  const gates = [];
  globalThis.fetch = () => new Promise((resolve, reject) => {
    gates.push({
      ok: () => resolve({ ok: true, status: 200, text: async () => RAW }),
      fail: () => resolve({ ok: false, status: 500, text: async () => "" }),
      reject: () => reject(new Error("network down")),
    });
  });
  globalThis.devicePixelRatio = 1;
  globalThis.addEventListener = () => {};
  globalThis.requestAnimationFrame = () => 0;

  const canvas = {
    ...stubElement(),
    getContext: () => new Proxy({}, { get: () => () => {} }),
    width: 1100, height: 620,
  };
  const app = new ProbeApp(canvas, { getElementById: () => stubElement() });

  const restore = () => {
    globalThis.fetch = priorFetch;
    globalThis.requestAnimationFrame = priorRaf;
    globalThis.addEventListener = priorAdd;
    globalThis.devicePixelRatio = priorDpr;
  };
  return { app, gates, restore };
}

test("§22 — an older fixture load cannot overwrite a newer legibility world", async () => {
  const { app, gates, restore } = harness();
  try {
    const older = app.loadDefiningFixture({ highWebbing: true });
    const newer = app.setManualTestMode("legibility");

    gates[1].ok();
    await newer;
    assert.equal(app.manualTestMode, "legibility");
    assert.equal(app.isBaselineFixtureActive(), true, "the newer load must establish the exact baseline");

    gates[0].ok();
    await older;
    // The revision-4 falsifier ended here with isBaselineFixtureActive() === false.
    assert.equal(app.manualTestMode, "legibility", "the mode must be unchanged");
    assert.equal(app.worldSource, "defining_fixture");
    assert.equal(
      app.isBaselineFixtureActive(),
      true,
      "a superseded high-webbing load must not replace the baseline the mode requires"
    );
  } finally {
    restore();
  }
});

test("§22 — a stale fixture response cannot replace a newer random world", async () => {
  const { app, gates, restore } = harness();
  try {
    const load = app.setManualTestMode("legibility");
    app.resetRandomWorld(99);
    gates[0].ok();
    await load;
    assert.equal(app.worldSource, "random", "the newer random world must survive");
    assert.equal(app.seed, 99, "the seed label must still be the reset seed");
    assert.equal(app.manualTestMode, null, "no fixture-valid mode may be left claiming the fixture");
  } finally {
    restore();
  }
});

test("§22 — the newest requested fixture variant wins regardless of resolution order", async () => {
  // Baseline requested last, high-webbing resolves last.
  {
    const { app, gates, restore } = harness();
    try {
      const first = app.loadDefiningFixture({ highWebbing: true });
      const second = app.loadDefiningFixture({ highWebbing: false });
      gates[1].ok();
      await second;
      assert.equal(app.isBaselineFixtureActive(), true);
      gates[0].ok();
      await first;
      assert.equal(app.isBaselineFixtureActive(), true, "the newest requested variant must win");
    } finally { restore(); }
  }
  // High-webbing requested last, in the opposite completion order.
  {
    const { app, gates, restore } = harness();
    try {
      const first = app.loadDefiningFixture({ highWebbing: false });
      const second = app.loadDefiningFixture({ highWebbing: true });
      gates[0].ok();
      await first;
      gates[1].ok();
      await second;
      assert.equal(
        app.isBaselineFixtureActive(),
        false,
        "the newest requested variant is the override, so the baseline must NOT be active"
      );
      assert.equal(app.worldSource, "defining_fixture");
    } finally { restore(); }
  }
});

test("§22 — a failed or rejected stale request commits nothing", async () => {
  for (const mode of ["fail", "reject"]) {
    const { app, gates, restore } = harness();
    try {
      const stale = app.loadDefiningFixture();
      app.resetRandomWorld(77);
      gates[0][mode]();
      await stale;
      assert.equal(app.worldSource, "random", `${mode}: the newer random world must survive`);
      assert.equal(app.seed, 77, `${mode}: the seed label must be untouched`);
      assert.equal(
        app.fixtureLoadError,
        null,
        `${mode}: a superseded request must not even write an error message onto a newer world`
      );
      assert.equal(app.manualTestMode, null);
    } finally { restore(); }
  }
});

test("§22 — the CURRENT request's genuine failure is still reported honestly", async () => {
  // The repair must not swallow real failures. A failure of the newest request
  // must set the error and refuse to enter a fixture-valid mode.
  for (const mode of ["fail", "reject"]) {
    const { app, gates, restore } = harness();
    try {
      const only = app.setManualTestMode("legibility");
      gates[0][mode]();
      await only;
      assert.ok(app.fixtureLoadError, `${mode}: a current failure must be recorded`);
      assert.equal(app.manualTestMode, null, `${mode}: no mode may claim a world that failed to load`);
    } finally { restore(); }
  }
});

test("§22 — world-change tokens are monotonic and only the newest may commit", () => {
  const { app, restore } = harness();
  try {
    const a = app.beginWorldChange();
    const b = app.beginWorldChange();
    const c = app.beginWorldChange();
    assert.ok(a < b && b < c, "tokens must strictly increase");
    assert.equal(app.isCurrentWorldChange(c), true);
    assert.equal(app.isCurrentWorldChange(b), false);
    assert.equal(app.isCurrentWorldChange(a), false);
    // A synchronous reset supersedes in-flight loads.
    app.resetRandomWorld(3);
    assert.equal(app.isCurrentWorldChange(c), false, "resetRandomWorld must claim a newer token");
  } finally { restore(); }
});

test("§22 — three concurrent requests leave exactly the newest world, in every completion order", async () => {
  // Exhaustive over the 6 permutations of resolving three overlapping loads.
  const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for (const order of permutations) {
    const { app, gates, restore } = harness();
    try {
      const p0 = app.loadDefiningFixture({ highWebbing: true });
      const p1 = app.loadDefiningFixture({ highWebbing: true });
      const p2 = app.loadDefiningFixture({ highWebbing: false }); // newest: baseline
      const promises = [p0, p1, p2];
      for (const i of order) {
        gates[i].ok();
        await promises[i];
      }
      await Promise.all(promises);
      assert.equal(
        app.isBaselineFixtureActive(),
        true,
        `completion order ${order.join(",")}: the newest request (baseline) must win`
      );
    } finally { restore(); }
  }
});
