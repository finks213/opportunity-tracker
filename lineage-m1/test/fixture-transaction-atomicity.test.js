// @ts-check
/**
 * A superseded world-changing request must commit NOTHING — including the cached
 * fixture envelope (contract §22; revision-6 repair, MC-2 / Break 1 / R6-B, R6-C).
 *
 * Revision 5 passed its race tests because every one of them resolved the SAME
 * envelope bytes, so "the stale request committed nothing" and "the stale request
 * committed identical data" were indistinguishable. Both revision-5 audits used two
 * DIFFERENT valid envelopes and the repair fell over. Reproduced against revision 5:
 *
 *   newer result true  | canopy first id now 1  | highWebbing 0.75
 *   stale result false | canopy first id now 81 | highWebbing 0.99
 *   follow outcome {"created":true,...,"reason":"FOCAL_LINEAGE_RESOLVED"}
 *   requested founders[0] 81   maintained channel founders[0] 1
 *   requested ids equal created ids false
 *
 * The rejected request replaced shared fixture metadata, and the interface then
 * reported one lineage while following another. Every test below fails against
 * revision 5.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ProbeApp } from "../src/main.js";
import { founderSetKey } from "../src/observer/tracerChannels.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(HERE, "..", "fixtures", "defining_fixture_v1.json"), "utf8");

/** A second STRUCTURALLY VALID envelope that is not the checked-in one. */
function variantEnvelope() {
  const base = JSON.parse(RAW);
  const v = JSON.parse(RAW);
  // Swap the two focal sets and move the experimental webbing value. Both remain
  // internally consistent, so the validator accepts them; they simply describe a
  // different world than the checked-in fixture.
  v.canopyFocalIds = base.shorelineFocalIds.slice();
  v.shorelineFocalIds = base.canopyFocalIds.slice();
  v.highWebbing = 0.99;
  return JSON.stringify(v);
}

function stubElement() {
  return {
    textContent: "", hidden: true, innerHTML: "", value: "",
    addEventListener() {},
    getBoundingClientRect: () => ({ width: 1100, height: 620, left: 0, top: 0 }),
  };
}

/**
 * A ProbeApp whose fetch bodies AND completion order this test controls.
 * @param {string[]} bodies one body per fetch, in call order
 */
function harness(bodies) {
  const prior = {
    fetch: globalThis.fetch, raf: globalThis.requestAnimationFrame,
    add: globalThis.addEventListener, dpr: globalThis.devicePixelRatio,
  };
  const gates = [];
  let n = 0;
  globalThis.fetch = () => {
    const body = bodies[Math.min(n++, bodies.length - 1)];
    return new Promise((resolve, reject) => {
      gates.push({
        ok: () => resolve({ ok: true, status: 200, text: async () => body }),
        fail: () => resolve({ ok: false, status: 500, text: async () => "" }),
        reject: () => reject(new Error("network down")),
      });
    });
  };
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
    globalThis.fetch = prior.fetch;
    globalThis.requestAnimationFrame = prior.raf;
    globalThis.addEventListener = prior.add;
    globalThis.devicePixelRatio = prior.dpr;
  };
  return { app, gates, restore };
}

test("§22 — a stale request with DIFFERENT valid bytes commits no envelope, no metadata", async () => {
  const { app, gates, restore } = harness([variantEnvelope(), RAW]);
  try {
    const stale = app.loadDefiningFixture();     // request 1: the variant
    app.fixtureEnvelope = null;                  // force request 2 to fetch as well
    const newer = app.loadDefiningFixture();     // request 2: the checked-in fixture

    gates[1].ok();
    assert.equal(await newer, true, "the newest request must commit");
    const committed = JSON.parse(RAW);
    assert.deepEqual(app.fixtureEnvelope.canopyFocalIds, committed.canopyFocalIds);
    assert.equal(app.fixtureEnvelope.highWebbing, committed.highWebbing);

    gates[0].ok();
    assert.equal(await stale, false, "the superseded request must be rejected");

    // The revision-5 falsifier ended here with 81 and 0.99.
    assert.deepEqual(
      app.fixtureEnvelope.canopyFocalIds,
      committed.canopyFocalIds,
      "a rejected request must not replace the cached focal metadata"
    );
    assert.equal(
      app.fixtureEnvelope.highWebbing,
      committed.highWebbing,
      "a rejected request must not replace the cached experimental value"
    );
    assert.equal(app.worldSource, "defining_fixture");
    assert.equal(app.fixtureVariant, "baseline", "the variant label belongs to the committed world");
  } finally {
    restore();
  }
});

test("§22 — the poisoned-cache consequence: a LATER load cannot consume stale bytes", async () => {
  // The delayed failure the structural audit described: the stale write is invisible
  // until some later operation reads the cache.
  const { app, gates, restore } = harness([variantEnvelope(), RAW]);
  try {
    const stale = app.loadDefiningFixture();
    app.fixtureEnvelope = null;
    const newer = app.loadDefiningFixture();
    gates[1].ok(); await newer;
    gates[0].ok(); await stale;

    // Now perform the later high-webbing load that revision 5 fed with 0.99.
    const later = await app.loadDefiningFixture({ highWebbing: true });
    assert.equal(later, true);
    assert.equal(
      app.fixtureEnvelope.highWebbing,
      JSON.parse(RAW).highWebbing,
      "the later load must use the committed envelope's value, not a rejected request's"
    );
    assert.equal(app.fixtureVariant, "high_webbing");
  } finally {
    restore();
  }
});

test("§22 — reverse completion order, both directions, commits exactly the newest", async () => {
  for (const order of ["newest-last", "newest-first"]) {
    const bodies = [variantEnvelope(), RAW];
    const { app, gates, restore } = harness(bodies);
    try {
      const first = app.loadDefiningFixture();
      app.fixtureEnvelope = null;
      const second = app.loadDefiningFixture();
      if (order === "newest-first") {
        gates[1].ok(); await second; gates[0].ok(); await first;
      } else {
        gates[0].ok(); gates[1].ok(); await first; await second;
      }
      const committed = JSON.parse(RAW);
      assert.deepEqual(
        app.fixtureEnvelope.canopyFocalIds,
        committed.canopyFocalIds,
        `${order}: the newest request's envelope must be the active one`
      );
      // ...and the maintained witness must belong to that same envelope.
      const channel = app.observer.channels.get("maintained:canopy");
      assert.equal(
        channel.founderKey,
        founderSetKey(committed.canopyFocalIds),
        `${order}: the maintained witness must be bound to the committed founder set`
      );
    } finally {
      restore();
    }
  }
});

test("§16 — a focal request is refused when the witness holds a different founder set", async () => {
  // Direct check of the binding itself, independent of how the mismatch arises.
  const { app, gates, restore } = harness([RAW]);
  try {
    const p = app.loadDefiningFixture(); gates[0].ok(); await p;
    // Simulate any path that could leave the two out of step.
    app.fixtureEnvelope = { ...app.fixtureEnvelope, canopyFocalIds: app.fixtureEnvelope.shorelineFocalIds.slice() };
    const r = app.followFocalLineage("visible", "canopy");
    assert.equal(r.created, false, "a name match is not an identity match");
    assert.equal(r.reason, "FOCAL_ANCESTRY_UNRESOLVABLE");
    assert.equal(r.detail.founderSetMismatch, true);
    assert.notEqual(r.detail.requestedFounderKey, r.detail.maintainedFounderKey);
    assert.match(app.tracerUnavailableReason, /different founder set/);
    // Refusing to follow must assert nothing about the lineage's fate. An explicit
    // DISCLAIMER is required, not forbidden, so this checks for an affirmative
    // claim rather than for the word.
    assert.ok(
      !/\b(is|are|has|have|was|were)\s+(extinct|ended)\b/i.test(app.tracerUnavailableReason) &&
      !/no living descendant .*remains/i.test(app.tracerUnavailableReason),
      `the message must not assert a fate:\n  ${app.tracerUnavailableReason}`
    );
    assert.match(
      app.tracerUnavailableReason,
      /NOT a claim that the lineage ended/,
      "and it must say plainly that it is not such a claim"
    );
  } finally {
    restore();
  }
});

test("§22 — requested, bound and displayed founder identity agree after a reload", async () => {
  const { app, gates, restore } = harness([RAW]);
  try {
    const p1 = app.loadDefiningFixture(); gates[0].ok(); await p1;
    const p2 = await app.loadDefiningFixture({ highWebbing: true });   // envelope already cached
    assert.equal(p2, true);
    for (const which of ["canopy", "shoreline"]) {
      const requested = which === "canopy"
        ? app.fixtureEnvelope.canopyFocalIds
        : app.fixtureEnvelope.shorelineFocalIds;
      const channel = app.observer.channels.get(`maintained:${which}`);
      assert.equal(channel.founderKey, founderSetKey(requested), `${which}: binding must survive a reload`);
      const r = app.followFocalLineage(`v-${which}`, which);
      assert.equal(r.created, true, `${which}: the bound witness must resolve`);
      assert.deepEqual(
        app.observer.channels.get(`v-${which}`).founderIds,
        channel.founderIds,
        `${which}: the displayed channel must carry the requested founders`
      );
    }
  } finally {
    restore();
  }
});

test("§22 — a failed stale request commits neither an error label nor a world", async () => {
  const { app, gates, restore } = harness([variantEnvelope(), RAW]);
  try {
    const stale = app.loadDefiningFixture();
    app.fixtureEnvelope = null;
    const newer = app.loadDefiningFixture();
    gates[1].ok(); await newer;
    gates[0].fail();                       // the superseded request fails outright
    assert.equal(await stale, false);
    assert.equal(app.fixtureLoadError, null, "a superseded failure must not post an error either");
    assert.equal(app.worldSource, "defining_fixture");
    assert.deepEqual(app.fixtureEnvelope.canopyFocalIds, JSON.parse(RAW).canopyFocalIds);
  } finally {
    restore();
  }
});
