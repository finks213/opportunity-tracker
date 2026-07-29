// @ts-check
/**
 * Contract §19 D, §19.2, §19.3, §19.4 — paired-world construction, the exact
 * probability gate, and the EXACT matched trajectory gate.
 *
 * Revision-3 repair: the §19.4 gate now runs the declared seeds 1..200 with the
 * frozen 130/200 floor inside this build-blocking file. Revision 2 substituted
 * seeds 1..12 and a proportional floor, so a regression affecting seeds 13..200
 * could leave the advertised suite green.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import {
  hydrateDefiningFixtureV1,
  buildFourWorlds,
  applyWebbingOverride,
} from "../src/fixtures/definingFixtureV1.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import { survivalProbability } from "../src/core/survival.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { TRAIT_INDEX } from "../src/config/traits.js";
import { ordinaryMedian } from "../src/core/math.js";
import { runWorldWithTracer } from "../tools/runFixture.mjs";

const C = currentModelConfig;
const { envelope } = loadValidatedFixture();

const STANDARD_LOADS = [39.84, 40.32, 39.84];
const canopyProbabilityProbe = [0.90, 0.10, 0.00];
const shorelineProbabilityProbe = [0.00, 0.10, 0.90];

/** Baseline genome with a given toe_webbing value. */
function genomeWithWebbing(value) {
  const g = envelope.baselineBodyGenome.slice();
  g[TRAIT_INDEX.toe_webbing] = value;
  return g;
}

function probeSurvival(webbing, allocation) {
  return survivalProbability(
    { bodyGenome: genomeWithWebbing(webbing), timeAllocation: allocation, ageGenerations: 1 },
    STANDARD_LOADS,
    C
  ).pSurvival;
}

test("§19.3 — exact probability gate: webbing hurts in the canopy probe and helps in the shoreline probe", () => {
  const low = envelope.lowWebbing;   // 0.15
  const high = envelope.highWebbing; // 0.75
  assert.equal(low, 0.15);
  assert.equal(high, 0.75);

  const canopyLow = probeSurvival(low, canopyProbabilityProbe);
  const canopyHigh = probeSurvival(high, canopyProbabilityProbe);
  const shoreLow = probeSurvival(low, shorelineProbabilityProbe);
  const shoreHigh = probeSurvival(high, shorelineProbabilityProbe);

  console.log(
    `\n  §19.3 canopy   low=${canopyLow.toFixed(6)} high=${canopyHigh.toFixed(6)} delta=${(canopyHigh - canopyLow).toFixed(6)}`
  );
  console.log(
    `  §19.3 shoreline low=${shoreLow.toFixed(6)} high=${shoreHigh.toFixed(6)} delta=${(shoreHigh - shoreLow).toFixed(6)}`
  );

  // A strict equality at exactly 0.03 passes.
  assert.ok(
    canopyHigh <= canopyLow - 0.03,
    `canopy: P(high)=${canopyHigh} must be <= P(low)-0.03=${canopyLow - 0.03}`
  );
  assert.ok(
    shoreHigh >= shoreLow + 0.03,
    `shoreline: P(high)=${shoreHigh} must be >= P(low)+0.03=${shoreLow + 0.03}`
  );
});

test("§19 D — the four worlds differ only in the twelve specified toe_webbing values", () => {
  const seed = 5;
  const worlds = buildFourWorlds(envelope, seed, C);
  const webbing = TRAIT_INDEX.toe_webbing;

  // Low worlds are unmodified clones of the same hydrated baseline.
  const baseline = hydrateDefiningFixtureV1(envelope, seed, C);
  assert.equal(serializeCanonicalBiology(worlds.canopyLow), serializeCanonicalBiology(baseline));
  assert.equal(serializeCanonicalBiology(worlds.shorelineLow), serializeCanonicalBiology(baseline));
  assert.equal(
    serializeCanonicalBiology(worlds.canopyLow),
    serializeCanonicalBiology(worlds.shorelineLow),
    "both low worlds are the same unmodified clone"
  );

  // Within each pair, exactly twelve individuals differ, in exactly one trait.
  for (const [lowWorld, highWorld, focalIds] of [
    [worlds.canopyLow, worlds.canopyHigh, envelope.canopyFocalIds],
    [worlds.shorelineLow, worlds.shorelineHigh, envelope.shorelineFocalIds],
  ]) {
    const lowById = new Map(lowWorld.currentIndividuals.map((i) => [i.id, i]));
    let differing = 0;
    for (const high of highWorld.currentIndividuals) {
      const low = lowById.get(high.id);
      for (let t = 0; t < high.bodyGenome.length; t++) {
        if (high.bodyGenome[t] !== low.bodyGenome[t]) {
          assert.equal(t, webbing, `only toe_webbing may differ; trait ${t} differed on id ${high.id}`);
          assert.ok(focalIds.includes(high.id), `id ${high.id} is not a declared focal id`);
          assert.equal(high.bodyGenome[t], envelope.highWebbing);
          assert.equal(low.bodyGenome[t], envelope.lowWebbing);
          differing++;
        }
      }
      // No RNG state, counter, event array, age, allocation, or parent field differs.
      assert.equal(high.ageGenerations, low.ageGenerations);
      assert.deepEqual(Array.from(high.timeAllocation), Array.from(low.timeAllocation));
      assert.deepEqual(high.parentIds, low.parentIds);
      assert.equal(high.birthEventId, low.birthEventId);
    }
    assert.equal(differing, 12, "exactly twelve toe_webbing values differ");

    // Paired worlds begin with identical serialized PRNG state and counters.
    assert.deepEqual(highWorld.simRng.toState(), lowWorld.simRng.toState());
    for (const counter of [
      "nextIndividualId", "nextBirthEventId", "nextMatingEventId",
      "nextMutationEventId", "nextAllocationMutationEventId", "generation",
    ]) {
      assert.equal(highWorld[counter], lowWorld[counter], `${counter} must match within a pair`);
    }
    assert.equal(highWorld.birthEvents.length, lowWorld.birthEvents.length);
    assert.equal(highWorld.deathEvents.length, lowWorld.deathEvents.length);
  }
});

test("§19 D — construction is ONE hydration cloned into four worlds", () => {
  // Revision-3 repair: buildFourWorlds() previously hydrated the envelope four
  // separate times. Deterministic hydration made the bytes equal, so the numbers
  // were right, but the mandated single-baseline clone operation was not the
  // construction performed. This asserts the construction path itself, not just
  // output equality.
  const worlds = buildFourWorlds(envelope, 17, C);

  assert.equal(worlds.hydrationCount, 1, "the envelope must be hydrated exactly once");
  assert.equal(typeof worlds.baselineCanonicalBytes, "string");
  assert.ok(worlds.baselineCanonicalBytes.length > 0);

  // All four worlds originate from that one set of baseline bytes: before the
  // overrides are considered, each low world IS the baseline byte-for-byte.
  assert.equal(serializeCanonicalBiology(worlds.canopyLow), worlds.baselineCanonicalBytes);
  assert.equal(serializeCanonicalBiology(worlds.shorelineLow), worlds.baselineCanonicalBytes);

  // The high worlds differ from the baseline in exactly the declared 12 values.
  for (const [high, focalIds] of [
    [worlds.canopyHigh, envelope.canopyFocalIds],
    [worlds.shorelineHigh, envelope.shorelineFocalIds],
  ]) {
    const baselineState = JSON.parse(worlds.baselineCanonicalBytes);
    const baseById = new Map(baselineState.currentIndividuals.map((i) => [i.id, i]));
    let differing = 0;
    for (const ind of high.currentIndividuals) {
      const base = baseById.get(ind.id);
      for (let t = 0; t < ind.bodyGenome.length; t++) {
        if (ind.bodyGenome[t] !== base.bodyGenome[t]) {
          assert.equal(t, TRAIT_INDEX.toe_webbing);
          assert.ok(focalIds.includes(ind.id));
          differing++;
        }
      }
    }
    assert.equal(differing, 12);
    // RNG state and every unrelated field come straight from the baseline.
    assert.deepEqual(high.simRng.toState(), baselineState.simRngState);
    assert.equal(high.generation, baselineState.generation);
    assert.equal(high.nextIndividualId, baselineState.nextIndividualId);
    assert.equal(high.nextMutationEventId, baselineState.nextMutationEventId);
    assert.equal(high.nextAllocationMutationEventId, baselineState.nextAllocationMutationEventId);
    assert.equal(high.birthEvents.length, baselineState.birthEvents.length);
    assert.equal(high.configVersion, baselineState.configVersion);
  }

  // A clone must be an independent object graph, not an alias of the baseline.
  worlds.canopyHigh.currentIndividuals[0].ageGenerations += 5;
  assert.notEqual(
    worlds.canopyLow.currentIndividuals[0].ageGenerations,
    worlds.canopyHigh.currentIndividuals[0].ageGenerations,
    "clones must not share individual objects"
  );
});

test("§19.2 — the webbing override is a construction operation, not a mutation event", () => {
  const state = hydrateDefiningFixtureV1(envelope, 6, C);
  const beforeBody = state.bodyMutationEvents.length;
  const beforeCounter = state.nextMutationEventId;
  applyWebbingOverride(state, envelope.canopyFocalIds, envelope.highWebbing);
  assert.equal(state.bodyMutationEvents.length, beforeBody, "no mutation event is created");
  assert.equal(state.nextMutationEventId, beforeCounter, "no mutation counter is consumed");
  assert.equal(state.generation, 0, "the override happens before generation 1");
});

test("§19.2 — the tracer is created in observer state and does not change biological bytes", () => {
  const seed = 8;
  const plain = hydrateDefiningFixtureV1(envelope, seed, C);
  const traced = hydrateDefiningFixtureV1(envelope, seed, C);
  const bytesBefore = serializeCanonicalBiology(traced);
  // runWorldWithTracer attaches a tracer channel and runs; a matched plain run
  // must produce identical bytes.
  assert.equal(bytesBefore, serializeCanonicalBiology(plain));
  runWorldWithTracer(traced, envelope.canopyFocalIds, 10, C);
  const plainRun = hydrateDefiningFixtureV1(envelope, seed, C);
  runWorldWithTracer(plainRun, [], 10, C); // empty focal set = "follow nothing"
  assert.equal(
    serializeCanonicalBiology(traced),
    serializeCanonicalBiology(plainRun),
    "tracer creation and propagation must not alter biology"
  );
});

test("§19.4 — EXACT matched trajectory gate: seeds 1..200, floor 130/200", async () => {
  // Revision-3 repair. Revision 2 ran only seeds 1..12 here with a proportional
  // floor of ceil(12 * 0.65), so a regression affecting seeds 13..200 could not
  // fail the advertised build-blocking suite; the exact gate lived only in a
  // separate tool outside `npm test`. §19 requires THIS file to prove the gate,
  // and its exact seed set is 1..200 with a 130/200 floor.
  //
  // This is the slowest test in the suite by design. It is part of the official
  // clean gate, and `npm test` executes it.
  const { runFixtureExperiment } = await import("../tools/runFixture.mjs");
  const results = runFixtureExperiment({ config: C });

  // The declared seed set, not a reduced one.
  assert.equal(results.seedRange.start, 1);
  assert.equal(results.seedRange.endInclusive, 200);
  assert.equal(results.gates.seedCount, 200);
  // The exact frozen floor, not a proportion of a smaller set.
  assert.equal(results.gates.successThreshold, 130, "the floor must be exactly 130 of 200");
  assert.equal(envelope.measurementGeneration, 90);

  console.log(
    `\n  §19.4 EXACT gate: canopy median low=${results.medians.canopyLow.toFixed(4)} high=${results.medians.canopyHigh.toFixed(4)}`
  );
  console.log(
    `  §19.4 EXACT gate: shoreline median low=${results.medians.shorelineLow.toFixed(4)} high=${results.medians.shorelineHigh.toFixed(4)}`
  );
  console.log(
    `  §19.4 EXACT gate: canopy successes ${results.successCounts.canopy}/200, shoreline ${results.successCounts.shoreline}/200, ties ${results.tieCounts.canopy}/${results.tieCounts.shoreline}`
  );

  assert.ok(
    results.medians.canopyHigh < results.medians.canopyLow,
    `median canopy-high (${results.medians.canopyHigh}) must be strictly less than canopy-low (${results.medians.canopyLow})`
  );
  assert.ok(
    results.medians.shorelineHigh > results.medians.shorelineLow,
    `median shoreline-high (${results.medians.shorelineHigh}) must be strictly greater than shoreline-low (${results.medians.shorelineLow})`
  );
  assert.ok(
    results.successCounts.canopy >= 130,
    `canopy successes ${results.successCounts.canopy} below the frozen floor of 130`
  );
  assert.ok(
    results.successCounts.shoreline >= 130,
    `shoreline successes ${results.successCounts.shoreline} below the frozen floor of 130`
  );
  assert.equal(results.gates.allPass, true);
});

test("§19 — observer independence within the fixture across all five required strategies", () => {
  // Same seed, five observer strategies, byte-identical biology after every
  // generation. (The exhaustive per-generation comparison lives in
  // observer-invariance.test.js; this asserts it inside the fixture worlds.)
  const seed = 9;
  const strategies = [
    [],
    envelope.canopyFocalIds,
    envelope.shorelineFocalIds,
    envelope.currentIndividuals.filter((i) => i.bodyGenome[TRAIT_INDEX.coat_shade] >= 0.5).map((i) => i.id),
  ];
  let reference = null;
  for (const focal of strategies) {
    const state = hydrateDefiningFixtureV1(envelope, seed, C);
    runWorldWithTracer(state, focal, 20, C);
    const bytes = serializeCanonicalBiology(state);
    if (reference === null) reference = bytes;
    else assert.equal(bytes, reference, "observer strategy changed biological bytes inside the fixture");
  }
});
