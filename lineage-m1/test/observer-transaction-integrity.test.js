// @ts-check
/**
 * Generation advancement must be atomic against observer failure (revision-4).
 *
 * Revision 3 invoked `hooks.onBirth` INSIDE the biological transaction. Throwing
 * from that callback left canonical state between generations — reproduced at
 * seed 1:
 *
 *   state.generation                     0
 *   current population                   120 old individuals
 *   generation-1 birth events            2
 *   generation-1 death events            54
 *   generation-1 mating events           1
 *   bytes == untouched generation 0      no
 *   bytes == completed generation 1      no
 *
 * An observer-layer exception could therefore corrupt canonical biology
 * (§§4, 16). Every assertion below fails against revision 3.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration, advanceGenerationAndCollect, runGenerations } from "../src/core/simulation.js";
import { currentModelConfig as C } from "../src/config/modelConfig.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import {
  createObserverState,
  createTracerChannel,
  tracerBirthHook,
  observerAfterGenerationHook,
  livingFounderContribution,
} from "../src/observer/tracerChannels.js";

const SEED = 1;

/** The completed no-observer generation, for comparison. */
function cleanGeneration() {
  const s = createInitialState(SEED, C);
  advanceGeneration(s, C);
  return {
    bytes: serializeCanonicalBiology(s),
    rng: JSON.stringify(s.simRng.toState()),
    generation: s.generation,
    population: s.currentIndividuals.length,
    births: s.birthEvents.filter((b) => b.generation === 1).length,
    deaths: s.deathEvents.filter((e) => e.generation === 1).length,
    matings: s.biologicalMatingEvents.filter((e) => e.generation === 1).length,
  };
}

/** Throwing hooks at each position. */
function throwingHooks() {
  return {
    "first birth": () => { let n = 0; return () => { if (++n === 1) throw new Error("observer boom"); }; },
    "middle birth": () => { let n = 0; return () => { if (++n === 30) throw new Error("observer boom"); }; },
    "final birth": (total) => { let n = 0; return () => { if (++n === total) throw new Error("observer boom"); }; },
    "every birth": () => () => { throw new Error("observer boom"); },
  };
}

test("§4/§16 — an observer exception at ANY birth leaves canonical biology exactly as the clean generation", () => {
  const clean = cleanGeneration();
  assert.ok(clean.births > 0, "the reference generation must actually produce births");

  for (const [label, make] of Object.entries(throwingHooks())) {
    const s = createInitialState(SEED, C);
    const onBirth = make(clean.births);
    // The call must NOT propagate the observer error out of the biological core.
    assert.doesNotThrow(() => advanceGeneration(s, C, { onBirth }), `${label}: observer error must be isolated`);

    assert.equal(
      serializeCanonicalBiology(s),
      clean.bytes,
      `${label}: canonical bytes must equal the completed no-observer generation`
    );
    assert.equal(JSON.stringify(s.simRng.toState()), clean.rng, `${label}: RNG state must be identical`);
    assert.equal(s.generation, clean.generation, `${label}: generation must increment exactly once`);
    assert.equal(s.currentIndividuals.length, clean.population, `${label}: population must be the new population`);
    assert.equal(s.birthEvents.filter((b) => b.generation === 1).length, clean.births);
    assert.equal(s.deathEvents.filter((e) => e.generation === 1).length, clean.deaths);
    assert.equal(s.biologicalMatingEvents.filter((e) => e.generation === 1).length, clean.matings);

    // The error is recorded OUTSIDE canonical biological state.
    assert.ok(s.lastGenerationResult.observerErrors.length > 0, `${label}: the error must be reported`);
    assert.ok(!clean.bytes.includes("observerError"), "canonical bytes must not carry observer errors");
  }
});

test("§4/§16 — an exception from afterGeneration is also isolated", () => {
  const clean = cleanGeneration();
  const s = createInitialState(SEED, C);
  assert.doesNotThrow(() =>
    advanceGeneration(s, C, { afterGeneration: () => { throw new Error("prune boom"); } })
  );
  assert.equal(serializeCanonicalBiology(s), clean.bytes);
  assert.equal(JSON.stringify(s.simRng.toState()), clean.rng);
  const errs = s.lastGenerationResult.observerErrors;
  assert.equal(errs.length, 1);
  assert.equal(errs[0].phase, "afterGeneration");
});

test("§4 — no event is duplicated and a retry cannot advance the world twice", () => {
  const clean = cleanGeneration();
  const s = createInitialState(SEED, C);
  advanceGeneration(s, C, { onBirth: () => { throw new Error("boom"); } });
  assert.equal(s.generation, 1);

  // "Retrying observer handling" must not advance biology again: re-processing
  // the recorded result is a pure observer operation.
  const bytesAfterFirst = serializeCanonicalBiology(s);
  const observer = createObserverState();
  createTracerChannel(observer, "retry", s.currentIndividuals.slice(0, 3).map((i) => i.id), s.currentIndividuals.map((i) => i.id));
  const hook = tracerBirthHook(observer);
  for (const record of s.lastGenerationResult.births) {
    hook(record); // replay the immutable records, no biology involved
  }
  assert.equal(s.generation, 1, "replaying observer records must not advance the generation");
  assert.equal(serializeCanonicalBiology(s), bytesAfterFirst, "replay must not change canonical bytes");

  // Event ids remain unique — nothing was double-recorded.
  const birthIds = s.birthEvents.map((b) => b.id);
  assert.equal(new Set(birthIds).size, birthIds.length);
  const matingIds = s.biologicalMatingEvents.map((e) => e.id);
  assert.equal(new Set(matingIds).size, matingIds.length);
  assert.equal(s.birthEvents.filter((b) => b.generation === 1).length, clean.births);
});

test("§4 — the returned generation result is immutable and outside canonical state", () => {
  const s = createInitialState(SEED, C);
  const result = advanceGenerationAndCollect(s, C);
  assert.ok(Object.isFrozen(result), "the result record must be frozen");
  assert.ok(Object.isFrozen(result.births));
  for (const b of result.births) assert.ok(Object.isFrozen(b));
  assert.ok(Object.isFrozen(result.livingIds));
  assert.equal(result.generation, 1);
  assert.equal(result.births.length, s.birthEvents.filter((b) => b.generation === 1).length);
  assert.deepEqual([...result.livingIds], s.currentIndividuals.map((i) => i.id));

  const bytes = serializeCanonicalBiology(s);
  for (const forbidden of ["lastGenerationResult", "observerErrors", "livingIds"]) {
    assert.ok(!bytes.includes(forbidden), `canonical bytes must not contain ${forbidden}`);
  }
});

test("§4 — the hook-free API and the hook API produce identical biology", () => {
  const a = createInitialState(7, C);
  const b = createInitialState(7, C);
  advanceGenerationAndCollect(a, C);
  advanceGeneration(b, C, {});
  assert.equal(serializeCanonicalBiology(a), serializeCanonicalBiology(b));
});

test("§4/§16 — a throwing observer over many generations never diverges from clean biology", () => {
  const plain = createInitialState(11, C);
  const failing = createInitialState(11, C);
  for (let g = 0; g < 25; g++) {
    advanceGeneration(plain, C);
    advanceGeneration(failing, C, {
      onBirth: () => { throw new Error("boom"); },
      afterGeneration: () => { throw new Error("boom"); },
    });
    assert.equal(
      serializeCanonicalBiology(failing),
      serializeCanonicalBiology(plain),
      `diverged at generation ${g + 1}`
    );
  }
  assert.equal(failing.generation, 25);
});

test("§16 — a successful observer still receives every birth, and tracer values stay correct", () => {
  // The repair must not silently stop delivering births to well-behaved observers.
  const state = createInitialState(13, C);
  const observer = createObserverState();
  createTracerChannel(observer, "k", state.currentIndividuals.slice(0, 12).map((i) => i.id), state.currentIndividuals.map((i) => i.id));
  const onBirth = tracerBirthHook(observer);
  const afterGeneration = observerAfterGenerationHook(observer);

  let delivered = 0;
  for (let g = 0; g < 10; g++) {
    advanceGeneration(state, C, {
      onBirth: (r) => { delivered++; onBirth(r); },
      afterGeneration,
    });
    assert.equal(state.lastGenerationResult.observerErrors.length, 0, "a well-behaved observer records no errors");
    assert.equal(delivered, state.lastGenerationResult.births.length + (g > 0 ? delivered - state.lastGenerationResult.births.length : 0));
  }
  const ids = state.currentIndividuals.map((i) => i.id);
  assert.ok(livingFounderContribution(observer, "k", ids) > 0, "tracer must still track real contribution");
  assert.ok(delivered > 0);
});

test("§4 — runGenerations is equally isolated", () => {
  const plain = createInitialState(17, C);
  const failing = createInitialState(17, C);
  runGenerations(plain, 12, C);
  assert.doesNotThrow(() =>
    runGenerations(failing, 12, C, { onBirth: () => { throw new Error("boom"); } })
  );
  assert.equal(serializeCanonicalBiology(failing), serializeCanonicalBiology(plain));
  assert.equal(failing.generation, 12);
});
