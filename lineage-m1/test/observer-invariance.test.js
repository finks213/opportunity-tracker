// @ts-check
/**
 * Contract §20.2 and §19 "Observer independence within fixture".
 *
 * From one identical biological serialization and seed, run scheduled observer
 * actions versus no observer actions and compare canonical biological BYTES
 * after every generation, including RNG state. No float tolerance is used.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import { TRAIT_INDEX } from "../src/config/traits.js";
import {
  createObserverState,
  createTracerChannel,
  tracerBirthHook,
  livingFounderContribution,
} from "../src/observer/tracerChannels.js";
import { zoneBinCounts } from "../src/observer/currentZoneBins.js";
import { annotateMatingEvent } from "../src/observer/matingAnnotations.js";

const GENERATIONS = 25;
const SEED = 99;

/**
 * The five required observer strategies from §19.
 * Each returns an onBirth hook plus a per-generation action.
 */
function makeStrategies(envelope) {
  return {
    followNothing: () => ({ hook: undefined, perGeneration: () => {} }),

    canopyHighWebbingTracer: (state) => {
      const observer = createObserverState();
      createTracerChannel(observer, "canopyHigh", envelope.canopyFocalIds, state.currentIndividuals.map((i) => i.id));
      return { hook: tracerBirthHook(observer), perGeneration: () => {}, observer };
    },

    shorelineHighWebbingTracer: (state) => {
      const observer = createObserverState();
      createTracerChannel(observer, "shorelineHigh", envelope.shorelineFocalIds, state.currentIndividuals.map((i) => i.id));
      return { hook: tracerBirthHook(observer), perGeneration: () => {}, observer };
    },

    highCoatShadeTracer: (state) => {
      const observer = createObserverState();
      const shade = TRAIT_INDEX.coat_shade;
      const founders = state.currentIndividuals
        .filter((i) => i.bodyGenome[shade] >= 0.5)
        .map((i) => i.id);
      createTracerChannel(observer, "highCoatShade", founders, state.currentIndividuals.map((i) => i.id));
      return { hook: tracerBirthHook(observer), perGeneration: () => {}, observer };
    },

    multipleChannelsWithSwitching: (state) => {
      const observer = createObserverState();
      const ids = state.currentIndividuals.map((i) => i.id);
      createTracerChannel(observer, "chanA", envelope.canopyFocalIds, ids);
      createTracerChannel(observer, "chanB", envelope.shorelineFocalIds, ids);
      const hook = tracerBirthHook(observer);
      let flip = 0;
      return {
        hook,
        observer,
        perGeneration: (s) => {
          // Aggressive observer activity: switch channels, create and delete a
          // channel, read zone bins, annotate mating, inspect individuals.
          flip++;
          observer.activeChannel = flip % 2 === 0 ? "chanA" : "chanB";
          const liveIds = s.currentIndividuals.map((i) => i.id);
          createTracerChannel(observer, `ephemeral-${flip}`, liveIds.slice(0, 3), liveIds);
          observer.channels.delete(`ephemeral-${flip - 1}`);
          zoneBinCounts(s.currentIndividuals);
          const byId = new Map(s.currentIndividuals.map((i) => [i.id, i]));
          for (const ev of s.biologicalMatingEvents.slice(-5)) annotateMatingEvent(ev, byId);
          observer.inspectedIds = liveIds.slice(0, 7);
          livingFounderContribution(observer, "chanA", liveIds);
        },
      };
    },
  };
}

test("§20.2/§19 — canonical biological bytes match after every generation across all observer strategies", () => {
  const { envelope } = loadValidatedFixture();
  const strategies = makeStrategies(envelope);
  const names = Object.keys(strategies);

  // Baseline: follow nothing.
  const baselineState = hydrateDefiningFixtureV1(envelope, SEED);
  const baselineHashes = [serializeCanonicalBiology(baselineState)];
  for (let g = 0; g < GENERATIONS; g++) {
    advanceGeneration(baselineState);
    baselineHashes.push(serializeCanonicalBiology(baselineState));
  }

  for (const name of names) {
    const state = hydrateDefiningFixtureV1(envelope, SEED);
    const strategy = strategies[name](state);
    assert.equal(
      serializeCanonicalBiology(state),
      baselineHashes[0],
      `${name}: creating observer state must not change generation-0 bytes`
    );
    for (let g = 0; g < GENERATIONS; g++) {
      advanceGeneration(state, undefined, strategy.hook ? { onBirth: strategy.hook } : {});
      strategy.perGeneration(state);
      assert.equal(
        serializeCanonicalBiology(state),
        baselineHashes[g + 1],
        `${name}: biological bytes diverged at generation ${g + 1}`
      );
    }
  }
});

test("§4/§17 — observer actions do not consume or alter simRng state", () => {
  const { envelope } = loadValidatedFixture();
  const state = hydrateDefiningFixtureV1(envelope, 7);
  const before = state.simRng.toState();

  const observer = createObserverState();
  const ids = state.currentIndividuals.map((i) => i.id);
  createTracerChannel(observer, "a", envelope.canopyFocalIds, ids);
  createTracerChannel(observer, "b", envelope.shorelineFocalIds, ids);
  observer.activeChannel = "b";
  observer.channels.delete("a");
  zoneBinCounts(state.currentIndividuals);
  livingFounderContribution(observer, "b", ids);

  assert.deepEqual(state.simRng.toState(), before, "no observer action may advance simRng");
});

test("§16 — tracer channels are independent, overlapping, in [0,1], and do not normalize against each other", () => {
  const { envelope } = loadValidatedFixture();
  const state = hydrateDefiningFixtureV1(envelope, 3);
  const observer = createObserverState();
  const ids = state.currentIndividuals.map((i) => i.id);
  // Deliberately overlapping founder sets.
  createTracerChannel(observer, "canopy", [1, 2, 3, 4], ids);
  createTracerChannel(observer, "overlap", [3, 4, 5, 6], ids);

  const hook = tracerBirthHook(observer);
  for (let g = 0; g < 12; g++) advanceGeneration(state, undefined, { onBirth: hook });

  const live = state.currentIndividuals.map((i) => i.id);
  let sawOverlap = false;
  for (const id of live) {
    const a = observer.channels.get("canopy").values.get(id) ?? 0;
    const b = observer.channels.get("overlap").values.get(id) ?? 0;
    assert.ok(a >= 0 && a <= 1, `channel value out of range: ${a}`);
    assert.ok(b >= 0 && b <= 1, `channel value out of range: ${b}`);
    if (a > 0 && b > 0) sawOverlap = true;
  }
  assert.ok(sawOverlap, "overlapping founder sets must produce individuals contributing to both channels");

  // Channels do not sum to one across channels.
  const totalA = live.reduce((s, id) => s + (observer.channels.get("canopy").values.get(id) ?? 0), 0);
  const totalB = live.reduce((s, id) => s + (observer.channels.get("overlap").values.get(id) ?? 0), 0);
  assert.ok(totalA > 0 && totalB > 0);
});

test("§16 — child tracer value is the mean of its two parents' values", () => {
  const { envelope } = loadValidatedFixture();
  const state = hydrateDefiningFixtureV1(envelope, 11);
  const observer = createObserverState();
  createTracerChannel(observer, "k", envelope.canopyFocalIds, state.currentIndividuals.map((i) => i.id));
  const hook = tracerBirthHook(observer);

  advanceGeneration(state, undefined, { onBirth: hook });

  const gen1 = state.biologicalMatingEvents.filter((e) => e.generation === 1);
  assert.ok(gen1.length > 0, "expected mating events at generation 1");
  const channel = observer.channels.get("k");
  for (const ev of gen1) {
    const expected = ((channel.values.get(ev.parentAId) ?? 0) + (channel.values.get(ev.parentBId) ?? 0)) / 2;
    for (const childId of ev.childIds) {
      assert.equal(channel.values.get(childId), expected);
    }
  }
});

test("§18 — canonical biological serialization excludes observer and debug material", () => {
  const { envelope } = loadValidatedFixture();
  const state = hydrateDefiningFixtureV1(envelope, 2);
  const observer = createObserverState();
  createTracerChannel(observer, "secretChannel", [1, 2], state.currentIndividuals.map((i) => i.id));
  observer.inspectedIds = [1, 2, 3];
  advanceGeneration(state, undefined, { onBirth: tracerBirthHook(observer) });

  const bytes = serializeCanonicalBiology(state);
  for (const forbidden of [
    "secretChannel", "tracer", "channels", "activeChannel", "inspectedIds",
    "currentZoneBin", "annotationModelVersion", "camera", "uiRng", "timestamp", "diagnostics",
  ]) {
    assert.ok(!bytes.includes(forbidden), `canonical bytes must not contain ${forbidden}`);
  }
  // But it must contain the required biological fields.
  for (const required of [
    "schemaVersion", "configVersion", "generation", "nextIndividualId",
    "nextMutationEventId", "nextAllocationMutationEventId", "currentIndividuals",
    "bodyGenome", "timeAllocation", "simRngState",
  ]) {
    assert.ok(bytes.includes(required), `canonical bytes must contain ${required}`);
  }
});
