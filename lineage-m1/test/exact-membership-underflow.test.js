// @ts-check
/**
 * Exact descendant membership must not depend on a floating-point contribution
 * value (contract §16; revision-6 repair, Break 3 / R6-F).
 *
 * Tracer contribution propagates as `(parentA + parentB) / 2`. On a one-sided
 * ancestry chain — one ancestry-bearing parent and one unrelated parent every
 * generation — that halves each generation and reaches exact zero in IEEE-754
 * binary64. Reproduced against revision 5:
 *
 *   generation 1000 contribution 9.332636185032189e-302
 *   generation 1073 contribution 1e-323
 *   generation 1074 contribution 5e-324
 *   generation 1075 contribution 0
 *   first exact-zero generation 1075
 *   known descendant by parent chain true
 *   resolver outcome FOCAL_LINEAGE_EXTINCT descendantIds []
 *
 * Revision 5 used `contribution > 0` as the sole membership oracle and its own
 * regression stopped at generation 1000, just short of the boundary. At the probe's
 * 500 ms generation interval this is about nine minutes of ordinary operation.
 *
 * These tests run PAST the boundary, to generation 1100.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createObserverState, createTracerChannel, propagateBirth, pruneObserverToLiving,
  resolveFocalLineage, totalRetainedTracerEntries,
} from "../src/observer/tracerChannels.js";

/**
 * Advance a one-sided ancestry chain: the single living descendant mates with a
 * fresh unrelated animal every generation, and only the child survives.
 * @param {number} generations
 */
function oneSidedChain(generations) {
  const observer = createObserverState();
  createTracerChannel(observer, "maintained:canopy", [1], [1, 2], { protectedChannel: true });
  let nextId = 2;
  let descendant = 1;
  let firstZeroGeneration = null;
  const contributionAt = new Map();
  for (let g = 1; g <= generations; g++) {
    const outsider = ++nextId;
    const child = ++nextId;
    // The outsider is alive but unrelated: it has no entry, which reads as 0.
    propagateBirth(observer, child, descendant, outsider);
    descendant = child;
    pruneObserverToLiving(observer, [descendant]);
    const v = observer.channels.get("maintained:canopy").values.get(descendant);
    contributionAt.set(g, v);
    if (v === 0 && firstZeroGeneration === null) firstZeroGeneration = g;
  }
  const state = {
    generation: generations,
    currentIndividuals: [{ id: descendant }],
    birthRecords: [], retainedGenealogy: [],
  };
  return { observer, state, descendant, firstZeroGeneration, contributionAt };
}

test("§16 — the numeric contribution really does underflow, at generation 1075", () => {
  // If this ever stops being true the test above it stops proving anything, so the
  // boundary is asserted rather than assumed.
  const { firstZeroGeneration, contributionAt } = oneSidedChain(1100);
  assert.equal(firstZeroGeneration, 1075, "the deterministic IEEE-754 boundary");
  assert.ok(contributionAt.get(1074) > 0, "generation 1074 is still representable");
  assert.equal(contributionAt.get(1074), 5e-324, "and it is the smallest positive double");
  assert.equal(contributionAt.get(1100), 0);
});

test("§16 — a known descendant is still RESOLVED at generation 1100", () => {
  const { observer, state, descendant } = oneSidedChain(1100);
  const channel = observer.channels.get("maintained:canopy");
  assert.equal(channel.values.get(descendant), 0, "its contribution has underflowed");
  assert.equal(channel.members.has(descendant), true, "but membership is exact and survives");

  const out = resolveFocalLineage(observer, state, [1], { focalSetName: "canopy" });
  // Revision 5 answered FOCAL_LINEAGE_EXTINCT with an empty descendant list.
  assert.equal(out.outcome, "FOCAL_LINEAGE_RESOLVED");
  assert.deepEqual(out.descendantIds, [descendant]);
  assert.equal(out.detail.membershipIsExact, true);
  assert.equal(
    out.detail.contributionUnderflowedForSome,
    true,
    "and the result must say plainly that the displayed contribution underflowed"
  );
});

test("§16 — membership is inherited from EITHER parent, never averaged", () => {
  const observer = createObserverState();
  createTracerChannel(observer, "k", [1], [1, 2, 3]);
  propagateBirth(observer, 4, 1, 2);     // one member parent
  propagateBirth(observer, 5, 2, 3);     // no member parent
  propagateBirth(observer, 6, 4, 5);     // one member parent, at half contribution
  const c = observer.channels.get("k");
  assert.equal(c.members.has(4), true);
  assert.equal(c.members.has(5), false, "descent is not acquired by mating with a descendant");
  assert.equal(c.members.has(6), true);
  assert.equal(c.values.get(4), 0.5);
  assert.equal(c.values.get(6), 0.25);
});

test("§16 — adding exact membership does not unbound observer memory", () => {
  // Membership is pruned to the living by the same rule as the values map, so the
  // §15 bound the revision-3 repair established still holds.
  const observer = createObserverState();
  const living = Array.from({ length: 200 }, (_, i) => i + 1);
  createTracerChannel(observer, "k", [1], living);
  let nextId = 1000;
  for (let g = 0; g < 300; g++) {
    const children = [];
    for (let i = 0; i < 200; i++) {
      const child = ++nextId;
      propagateBirth(observer, child, living[i], living[(i + 1) % 200]);
      children.push(child);
    }
    living.splice(0, living.length, ...children);
    pruneObserverToLiving(observer, living);
  }
  const c = observer.channels.get("k");
  assert.equal(c.values.size, 200, "values stay bounded by the living population");
  assert.ok(c.members.size <= 200, `membership stays bounded too, saw ${c.members.size}`);
  assert.equal(totalRetainedTracerEntries(observer), 200);
});
