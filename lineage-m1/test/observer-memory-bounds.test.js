// @ts-check
/**
 * Observer and Canvas memory bounds (revision-3 repair).
 *
 * Revision 2 retained a tracer value for every individual that had ever lived,
 * so a single channel grew with cumulative births rather than the living world.
 * Executed at seed 71:
 *
 *   generation 180: 254 living, 21,510 tracer entries
 *   generation 400: 257 living, 52,194
 *   generation 600: 238 living, 80,016
 *   generation 800: 246 living, 107,760
 *
 * Canvas jitter had the same shape. Every assertion below fails on revision 2.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { currentModelConfig as C } from "../src/config/modelConfig.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import {
  createObserverState,
  createTracerChannel,
  tracerBirthHook,
  observerAfterGenerationHook,
  pruneObserverToLiving,
  totalRetainedTracerEntries,
  livingFounderContribution,
} from "../src/observer/tracerChannels.js";

const SEED = 71;
const CHECKPOINTS = [180, 400, 600, 800, 1000];

test("§16 — tracer entries track the living population, not cumulative births", () => {
  const state = createInitialState(SEED, C);
  const observer = createObserverState();
  createTracerChannel(observer, "focal", [1, 2, 3, 4, 5], state.currentIndividuals.map((i) => i.id));
  const onBirth = tracerBirthHook(observer);
  const afterGeneration = observerAfterGenerationHook(observer);

  let cumulativeBirths = 0;
  const observed = [];
  let advanced = 0;
  for (const target of CHECKPOINTS) {
    while (advanced < target && state.currentIndividuals.length > 0) {
      const before = state.nextIndividualId;
      advanceGeneration(state, C, { onBirth, afterGeneration });
      cumulativeBirths += state.nextIndividualId - before;
      advanced++;
    }
    const living = state.currentIndividuals.length;
    const entries = totalRetainedTracerEntries(observer);
    observed.push({ generation: state.generation, living, entries, cumulativeBirths });

    // The bound: retained entries never exceed the living population.
    assert.ok(
      entries <= living,
      `generation ${state.generation}: ${entries} tracer entries for ${living} living individuals`
    );
    // And they are decisively below cumulative births once the run is long.
    if (cumulativeBirths > living * 4) {
      assert.ok(
        entries < cumulativeBirths / 2,
        `generation ${state.generation}: entries ${entries} scale with cumulative births ${cumulativeBirths}`
      );
    }
    // No dead id may remain.
    const alive = new Set(state.currentIndividuals.map((i) => i.id));
    for (const id of observer.channels.get("focal").values.keys()) {
      assert.ok(alive.has(id), `dead id ${id} still retained at generation ${state.generation}`);
    }
  }
  console.log(
    "\n  tracer bound: " +
    observed.map((o) => `gen ${o.generation}: living=${o.living} entries=${o.entries} (births=${o.cumulativeBirths})`).join("\n                ")
  );
});

test("§16 — tracer values for living descendants remain correct after pruning", () => {
  const state = createInitialState(11, C);
  const observer = createObserverState();
  // Follow the whole canopy band so descendants certainly survive.
  const founders = state.currentIndividuals.filter((i) => i.id <= 40).map((i) => i.id);
  createTracerChannel(observer, "canopy", founders, state.currentIndividuals.map((i) => i.id));
  const onBirth = tracerBirthHook(observer);
  const afterGeneration = observerAfterGenerationHook(observer);

  // A parallel, never-pruned reference channel computed the same way.
  const reference = new Map();
  for (const ind of state.currentIndividuals) reference.set(ind.id, founders.includes(ind.id) ? 1 : 0);

  for (let g = 0; g < 40; g++) {
    const seen = new Set(state.currentIndividuals.map((i) => i.id));
    advanceGeneration(state, C, {
      onBirth: (info) => {
        // reference propagation, unpruned
        const a = reference.get(info.parentAId) ?? 0;
        const b = reference.get(info.parentBId) ?? 0;
        reference.set(info.childId, (a + b) / 2);
        onBirth(info);
      },
      afterGeneration,
    });
    assert.ok(seen.size > 0);
  }

  const channel = observer.channels.get("canopy");
  let compared = 0;
  for (const ind of state.currentIndividuals) {
    assert.equal(
      channel.values.get(ind.id),
      reference.get(ind.id),
      `pruning changed the tracer value of living individual ${ind.id}`
    );
    compared++;
  }
  assert.ok(compared > 0, "expected living individuals to compare");

  // The measurement the fixture gate depends on is unaffected.
  const livingIds = state.currentIndividuals.map((i) => i.id);
  const pruned = livingFounderContribution(observer, "canopy", livingIds);
  const unpruned = livingIds.reduce((s, id) => s + (reference.get(id) ?? 0), 0);
  assert.equal(pruned, unpruned, "living founder contribution must be identical");
});

test("§4/§16 — observer pruning does not alter canonical biological bytes", () => {
  const plain = createInitialState(23, C);
  const observed = createInitialState(23, C);
  const observer = createObserverState();
  createTracerChannel(observer, "k", [1, 2, 3], observed.currentIndividuals.map((i) => i.id));
  const onBirth = tracerBirthHook(observer);
  const afterGeneration = observerAfterGenerationHook(observer);

  for (let g = 0; g < 60; g++) {
    advanceGeneration(plain, C);
    advanceGeneration(observed, C, { onBirth, afterGeneration });
    assert.equal(
      serializeCanonicalBiology(observed),
      serializeCanonicalBiology(plain),
      `biology diverged at generation ${g + 1}`
    );
  }
});

test("§16 — results remain deterministic with pruning enabled", () => {
  const run = () => {
    const state = createInitialState(31, C);
    const observer = createObserverState();
    createTracerChannel(observer, "k", [1, 5, 9], state.currentIndividuals.map((i) => i.id));
    const onBirth = tracerBirthHook(observer);
    const afterGeneration = observerAfterGenerationHook(observer);
    for (let g = 0; g < 50; g++) advanceGeneration(state, C, { onBirth, afterGeneration });
    const ids = state.currentIndividuals.map((i) => i.id);
    return {
      bytes: serializeCanonicalBiology(state),
      contribution: livingFounderContribution(observer, "k", ids),
      entries: totalRetainedTracerEntries(observer),
    };
  };
  const a = run();
  const b = run();
  assert.equal(a.bytes, b.bytes);
  assert.equal(a.contribution, b.contribution);
  assert.equal(a.entries, b.entries);
});

test("§16 — multiple channels stay bounded independently, not multiplicatively", () => {
  const state = createInitialState(41, C);
  const observer = createObserverState();
  const ids = state.currentIndividuals.map((i) => i.id);
  const CHANNELS = 5;
  for (let k = 0; k < CHANNELS; k++) {
    createTracerChannel(observer, `chan${k}`, [1 + k * 8, 2 + k * 8], ids);
  }
  const onBirth = tracerBirthHook(observer);
  const afterGeneration = observerAfterGenerationHook(observer);
  for (let g = 0; g < 200; g++) advanceGeneration(state, C, { onBirth, afterGeneration });

  const living = state.currentIndividuals.length;
  const total = totalRetainedTracerEntries(observer);
  // Each channel is bounded by the living population, so the total is bounded by
  // channels x living — never by channels x cumulative births.
  assert.ok(
    total <= CHANNELS * living,
    `${total} entries across ${CHANNELS} channels for ${living} living individuals`
  );
  for (const [name, channel] of observer.channels) {
    assert.ok(channel.values.size <= living, `${name} holds ${channel.values.size} for ${living} living`);
  }
  console.log(`\n  ${CHANNELS} channels at generation ${state.generation}: living=${living} totalEntries=${total}`);
});

test("§16 — pruneObserverToLiving drops dead ids and stale inspected ids", () => {
  const observer = createObserverState();
  createTracerChannel(observer, "k", [1, 2], [1, 2, 3, 4, 5]);
  observer.inspectedIds = [1, 2, 3, 4, 5];
  assert.equal(observer.channels.get("k").values.size, 5);

  const removed = pruneObserverToLiving(observer, [1, 3]);
  assert.equal(removed, 3);
  assert.deepEqual([...observer.channels.get("k").values.keys()].sort((a, b) => a - b), [1, 3]);
  assert.deepEqual(observer.inspectedIds, [1, 3]);
  // Values for retained ids are untouched.
  assert.equal(observer.channels.get("k").values.get(1), 1);
  assert.equal(observer.channels.get("k").values.get(3), 0);
});

test("§22 — Canvas jitter cache is bounded to rendered individuals", async () => {
  // Exercise CanvasProbe's pruning without a DOM by driving pruneJitterTo directly.
  const { CanvasProbe } = await import("../src/debug/canvasProbe.js");
  const probe = Object.create(CanvasProbe.prototype);
  probe.jitter = new Map();
  probe.uiRng = { nextFloat: () => 0.5 };

  // Simulate 5,000 individuals passing through the renderer over time.
  for (let id = 1; id <= 5000; id++) probe.jitterFor(id);
  assert.equal(probe.jitter.size, 5000);

  // Only 250 are currently rendered.
  const rendered = Array.from({ length: 250 }, (_, k) => ({ id: 4751 + k }));
  const removed = probe.pruneJitterTo(rendered);
  assert.equal(removed, 4750);
  assert.equal(probe.jitter.size, 250, "jitter must be bounded by rendered individuals");
  for (const r of rendered) assert.ok(probe.jitter.has(r.id));
});
