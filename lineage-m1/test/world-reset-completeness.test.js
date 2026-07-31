// @ts-check
/**
 * A world reset must republish EVERY field that names the world, not just the
 * biology (revision-7 repair, revision-6 structural audit Finding 5).
 *
 * Reproduced against revision 6: after loading the high-webbing fixture, recording a
 * tracer failure and resetting to a random world —
 *
 *   {"worldSource":"random",
 *    "fixtureVariant":"high_webbing",
 *    "maintainedFocalChannels":{"created":["maintained:canopy","maintained:shoreline"]},
 *    "tracerUnavailableReason":"old fixture tracer failure",
 *    "notice":"Tracer not created — old fixture tracer failure."}
 *
 * The biology was correct and everything describing it was stale — including a
 * visible notice about a world that no longer existed.
 *
 * This file checks the reset the same way the fixture-load transaction is checked:
 * by enumerating every world-identity field rather than the two or three a repair
 * happened to think of.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ProbeApp } from "../src/main.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(HERE, "..", "fixtures", "defining_fixture_v1.json"), "utf8");

function stubElement() {
  return {
    textContent: "", hidden: true, innerHTML: "", value: "",
    addEventListener() {},
    getBoundingClientRect: () => ({ width: 1100, height: 620, left: 0, top: 0 }),
  };
}

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
  return { app, restore, els };
}

/** Every field that describes WHICH world is active. */
const WORLD_IDENTITY_FIELDS = [
  "worldSource", "fixtureVariant", "maintainedFocalChannels", "manualTestMode",
  "fixtureLoadError", "tracerUnavailableReason", "legibilityExitReason", "selectedId",
];

test("§22 — a random reset clears every fixture-only identity field", async (t) => {
  const { app, restore } = harness();
  t.after(restore);

  await app.loadDefiningFixture({ highWebbing: true });
  app.tracerUnavailableReason = "old fixture tracer failure";
  assert.equal(app.fixtureVariant, "high_webbing");
  assert.ok(app.maintainedFocalChannels, "the fixture world must have created witnesses");

  app.resetRandomWorld(7);

  assert.equal(app.worldSource, "random");
  assert.equal(app.fixtureVariant, null, "revision 6 left high_webbing here");
  assert.equal(app.maintainedFocalChannels, null, "revision 6 left the fixture's witness registry here");
  assert.equal(app.tracerUnavailableReason, null, "revision 6 left a notice about the old world here");
  assert.equal(app.manualTestMode, null);
  assert.equal(app.fixtureLoadError, null);
  assert.equal(app.selectedId, null);
});

test("§22 — no world-identity field survives a reset with a fixture-era value", async (t) => {
  // Enumerated rather than hand-picked: every field is dirtied first, so a field
  // added later that nobody remembers to clear fails this test.
  const { app, restore } = harness();
  t.after(restore);
  await app.loadDefiningFixture({ highWebbing: true });
  app.tracerUnavailableReason = "old fixture tracer failure";
  app.legibilityExitReason = "stale exit reason";
  app.fixtureLoadError = "stale error";
  app.selectedId = 5;

  app.resetRandomWorld(11);

  for (const field of WORLD_IDENTITY_FIELDS) {
    if (field === "worldSource") {
      assert.equal(app.worldSource, "random");
      continue;
    }
    assert.equal(app[field], null, `${field} must be republished by a reset, not left from the fixture world`);
  }
  // The observer really is empty: no channel from the previous world remains.
  assert.equal(app.observer.channels.size, 0);
  assert.equal(app.observer.activeChannel, null);
});

test("§22 — the visible notice does not describe the previous world", async (t) => {
  const { app, restore, els } = harness();
  t.after(restore);
  await app.loadDefiningFixture({ highWebbing: true });
  app.tracerUnavailableReason = "old fixture tracer failure";
  app.renderPanels();
  assert.match(els.get("notice").textContent, /old fixture tracer failure/);

  app.resetRandomWorld(3);
  app.renderPanels();
  assert.ok(
    !/old fixture tracer failure/.test(els.get("notice").textContent),
    "the notice must not survive the world it described"
  );
});

test("§22 — the reset biology is a genuine random world, unchanged by this repair", async (t) => {
  const { app, restore } = harness();
  t.after(restore);
  await app.loadDefiningFixture();
  const fixtureBytes = serializeCanonicalBiology(app.state);
  app.resetRandomWorld(7);
  const randomBytes = serializeCanonicalBiology(app.state);
  assert.notEqual(randomBytes, fixtureBytes);
  assert.equal(app.state.generation, 0);
  assert.equal(app.seed, 7);

  // Same seed, same world: clearing metadata did not touch determinism.
  const { app: other, restore: restoreOther } = harness();
  t.after(restoreOther);
  other.resetRandomWorld(7);
  assert.equal(serializeCanonicalBiology(other.state), randomBytes);
});

test("§22 — the envelope cache may persist, because it is not world identity", async (t) => {
  // Deliberate: the parsed envelope is a file cache, and a reset does not invalidate
  // the FILE. What must not persist is anything claiming that world is active.
  const { app, restore } = harness();
  t.after(restore);
  await app.loadDefiningFixture();
  app.resetRandomWorld(2);
  assert.notEqual(app.fixtureEnvelope, null, "the parsed envelope may stay cached");
  assert.equal(app.worldSource, "random", "but nothing may claim the fixture is active");
  assert.equal(app.fixtureVariant, null);
});
