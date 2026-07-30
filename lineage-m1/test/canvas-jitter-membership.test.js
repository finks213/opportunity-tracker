// @ts-check
/**
 * Canvas jitter cache must be pruned by SET MEMBERSHIP, never by count
 * (contract §22 bounded observer/debug state).
 *
 * Revision-4 repair. Revision 3's `pruneJitterTo` opened with
 *
 *     if (this.jitter.size <= rendered.length) return 0;
 *
 * which is a count comparison masquerading as a membership check. Reproduced
 * against revision 3:
 *
 *   cached {1,2}   rendered {3,4}  -> removed 0, jitter.size 4  (expected 2 / 2)
 *   cached {1..50} rendered {51..99} -> removed 0, jitter.size 99 (expected 50 / 49)
 *
 * Stale ids therefore accumulated whenever the population held steady while
 * membership turned over — which is the normal case for an overlapping-generation
 * lifecycle.
 *
 * WHICH TESTS DISCRIMINATE. Verified by temporarily reinstating the revision-3
 * shortcut and re-running this file (6 pass, 3 fail):
 *
 *   FAIL on revision 3 (these are the regression tests):
 *     - equal cached and rendered COUNTS with disjoint membership
 *     - a cache SMALLER than the rendered set
 *     - duplicate rendered ids
 *
 *   PASS on revision 3 (non-regression coverage — the shortcut never fired
 *   because `jitter.size > rendered.length` in these cases):
 *     - cache larger than the rendered set
 *     - partial overlap
 *     - empty rendered set
 *     - empty cache with empty rendered set
 *     - repeated/idempotent pruning
 *     - steady population with complete turnover
 *
 * The three failing cases are stated first so the discriminating evidence is not
 * buried; the rest exist to prove the repair did not break correct behaviour.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { CanvasProbe } from "../src/debug/canvasProbe.js";

/** A CanvasProbe with no DOM: only the jitter cache and a stub uiRng. */
function makeProbe() {
  const probe = Object.create(CanvasProbe.prototype);
  probe.jitter = new Map();
  let n = 0;
  // Deterministic and distinguishable, so a "kept" entry can be told from a
  // silently re-created one.
  probe.uiRng = { nextFloat: () => (n = (n + 1) % 1000) / 1000 };
  return probe;
}

/** @param {any} probe @param {number[]} ids */
function seed(probe, ids) {
  for (const id of ids) probe.jitterFor(id);
}

/** @param {number} a @param {number} b */
function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** @param {number[]} ids */
function rendered(ids) {
  return ids.map((id) => ({ id }));
}

test("§22 — equal cached and rendered COUNTS with disjoint membership still prune", () => {
  // The exact revision-3 counterexample: sizes are equal, so the count shortcut
  // returned 0 and left every stale entry in place.
  const probe = makeProbe();
  seed(probe, [1, 2]);
  const removed = probe.pruneJitterTo(rendered([3, 4]));
  assert.equal(removed, 2, "both stale ids must be removed");
  assert.equal(probe.jitter.size, 0, "no stale entry may survive");
  assert.ok(!probe.jitter.has(1));
  assert.ok(!probe.jitter.has(2));
});

test("§22 — a cache SMALLER than the rendered set still prunes its stale ids", () => {
  // jitter.size (50) < rendered.length (49 -> 60): the shortcut fired here too.
  const probe = makeProbe();
  seed(probe, range(1, 50));
  const removed = probe.pruneJitterTo(rendered(range(51, 110)));
  assert.equal(removed, 50, "all 50 stale ids must be removed even though the cache was smaller");
  assert.equal(probe.jitter.size, 0);
});

test("§22 — a cache LARGER than the rendered set prunes to exactly the rendered ids", () => {
  const probe = makeProbe();
  seed(probe, range(1, 400));
  const keep = range(390, 400);
  const removed = probe.pruneJitterTo(rendered(keep));
  assert.equal(removed, 389);
  assert.equal(probe.jitter.size, keep.length);
  assert.deepEqual([...probe.jitter.keys()].sort((a, b) => a - b), keep);
});

test("§22 — partial overlap keeps exactly the intersection and drops exactly the rest", () => {
  const probe = makeProbe();
  seed(probe, [10, 11, 12, 13, 14]);
  const kept = new Map([...probe.jitter].filter(([id]) => id >= 13));
  const removed = probe.pruneJitterTo(rendered([13, 14, 15, 16]));
  assert.equal(removed, 3, "10, 11 and 12 must go");
  assert.deepEqual([...probe.jitter.keys()].sort((a, b) => a - b), [13, 14]);
  // Surviving entries must be the SAME objects — pruning must not perturb
  // retained jitter, or animals would jump between frames.
  for (const [id, value] of kept) assert.equal(probe.jitter.get(id), value);
  // 15 and 16 are rendered but not yet cached; pruning must not fabricate them.
  assert.ok(!probe.jitter.has(15));
  assert.ok(!probe.jitter.has(16));
});

test("§22 — an EMPTY rendered set clears the whole cache", () => {
  const probe = makeProbe();
  seed(probe, range(1, 25));
  const removed = probe.pruneJitterTo(rendered([]));
  assert.equal(removed, 25);
  assert.equal(probe.jitter.size, 0, "an empty world must leave no cached jitter");
});

test("§22 — an empty cache with an empty rendered set is a no-op, not an error", () => {
  const probe = makeProbe();
  assert.equal(probe.pruneJitterTo(rendered([])), 0);
  assert.equal(probe.jitter.size, 0);
});

test("§22 — repeated pruning is deterministic and idempotent", () => {
  const probe = makeProbe();
  seed(probe, range(1, 60));
  const keep = range(30, 45);
  const first = probe.pruneJitterTo(rendered(keep));
  const snapshot = new Map(probe.jitter);
  for (let i = 0; i < 5; i++) {
    assert.equal(probe.pruneJitterTo(rendered(keep)), 0, "a settled cache must remove nothing further");
  }
  assert.equal(first, 44);
  assert.equal(probe.jitter.size, keep.length);
  for (const [id, value] of snapshot) assert.equal(probe.jitter.get(id), value, `entry ${id} must be untouched`);
});

test("§22 — duplicate rendered ids do not corrupt the kept set", () => {
  const probe = makeProbe();
  seed(probe, [1, 2, 3, 4]);
  const removed = probe.pruneJitterTo(rendered([2, 2, 3, 3, 3]));
  assert.equal(removed, 2);
  assert.deepEqual([...probe.jitter.keys()].sort((a, b) => a - b), [2, 3]);
});

test("§22 — steady population with complete turnover stays bounded over many frames", () => {
  // The realistic failure: population size never changes, so a count shortcut
  // never fires, while membership rolls over completely every frame.
  const probe = makeProbe();
  const POP = 200;
  for (let frame = 0; frame < 300; frame++) {
    const ids = range(frame * POP + 1, frame * POP + POP);
    for (const id of ids) probe.jitterFor(id);
    probe.pruneJitterTo(rendered(ids));
    assert.equal(
      probe.jitter.size,
      POP,
      `frame ${frame}: cache must stay bounded at the rendered population, not grow`
    );
  }
});
