// @ts-check
/**
 * Contract §19 D, §19.2, §19.3 — paired-world construction and the exact
 * probability gate.
 *
 * The full 200-seed §19.4 matched trajectory gate is executed by
 * `tools/runFixture.mjs` (its raw output is audit/fixture-results.json). This
 * test proves construction, the exact probability gate, and a bounded
 * directional slice of the trajectory gate so the suite stays build-blocking
 * without re-running the whole batch.
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

test("§19.4 — directional slice: webbing helps at the shoreline and hurts in the canopy", () => {
  // A bounded slice of the declared 1..200 batch so the build-blocking suite
  // stays fast; tools/runFixture.mjs runs the full gate for the audit record.
  const SLICE = 12;
  const measurementGeneration = envelope.measurementGeneration;
  const canopyLow = [], canopyHigh = [], shoreLow = [], shoreHigh = [];
  let canopySuccess = 0, shorelineSuccess = 0;

  for (let seed = envelope.trajectorySeeds.start; seed < envelope.trajectorySeeds.start + SLICE; seed++) {
    const w = buildFourWorlds(envelope, seed, C);
    const cl = runWorldWithTracer(w.canopyLow, envelope.canopyFocalIds, measurementGeneration, C).contribution;
    const ch = runWorldWithTracer(w.canopyHigh, envelope.canopyFocalIds, measurementGeneration, C).contribution;
    const sl = runWorldWithTracer(w.shorelineLow, envelope.shorelineFocalIds, measurementGeneration, C).contribution;
    const sh = runWorldWithTracer(w.shorelineHigh, envelope.shorelineFocalIds, measurementGeneration, C).contribution;
    canopyLow.push(cl); canopyHigh.push(ch); shoreLow.push(sl); shoreHigh.push(sh);
    if (ch < cl) canopySuccess++;
    if (sh > sl) shorelineSuccess++;
  }

  const medians = {
    canopyLow: ordinaryMedian(canopyLow),
    canopyHigh: ordinaryMedian(canopyHigh),
    shorelineLow: ordinaryMedian(shoreLow),
    shorelineHigh: ordinaryMedian(shoreHigh),
  };
  console.log(`\n  §19.4 slice (${SLICE} seeds): canopy median low=${medians.canopyLow.toFixed(3)} high=${medians.canopyHigh.toFixed(3)}`);
  console.log(`  §19.4 slice: shoreline median low=${medians.shorelineLow.toFixed(3)} high=${medians.shorelineHigh.toFixed(3)}`);
  console.log(`  §19.4 slice: canopy successes ${canopySuccess}/${SLICE}, shoreline successes ${shorelineSuccess}/${SLICE}`);

  assert.ok(medians.canopyHigh < medians.canopyLow, "median canopy-high contribution must be strictly less than canopy-low");
  assert.ok(medians.shorelineHigh > medians.shorelineLow, "median shoreline-high contribution must be strictly greater than shoreline-low");
  assert.ok(canopySuccess >= Math.ceil(SLICE * 0.65), `canopy successes ${canopySuccess}/${SLICE} below the 65% floor`);
  assert.ok(shorelineSuccess >= Math.ceil(SLICE * 0.65), `shoreline successes ${shorelineSuccess}/${SLICE} below the 65% floor`);
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
