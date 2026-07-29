// @ts-check
/**
 * Contract §20.13 — RNG integrity, plus the §17 random-number architecture.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { Rng, createSimRng, createUiRng } from "../src/core/rng.js";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import {
  createObserverState,
  createTracerChannel,
  livingFounderContribution,
} from "../src/observer/tracerChannels.js";
import { zoneBinCounts } from "../src/observer/currentZoneBins.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const TOOLS = join(HERE, "..", "tools");

/** Recursively list .js/.mjs files under a directory. */
function listSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSources(full));
    else if (/\.(js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

test("§20.13 — no production source file contains Math.random", () => {
  const offenders = [];
  for (const file of [...listSources(SRC), ...listSources(TOOLS)]) {
    const text = readFileSync(file, "utf8");
    if (text.includes("Math.random")) offenders.push(relative(join(HERE, ".."), file));
  }
  assert.deepEqual(offenders, [], `Math.random found in: ${offenders.join(", ")}`);
});

test("§17 — the PRNG is serializable with explicit state and reproduces exactly", () => {
  const a = createSimRng(2024);
  const drawsA = Array.from({ length: 50 }, () => a.nextFloat());
  const b = createSimRng(2024);
  const drawsB = Array.from({ length: 50 }, () => b.nextFloat());
  assert.deepEqual(drawsB, drawsA, "same seed reproduces the same sequence");
  assert.deepEqual(b.toState(), a.toState());

  // Restore mid-stream and continue identically.
  const mid = a.toState();
  const restored = Rng.fromState(mid);
  const tailA = Array.from({ length: 20 }, () => a.nextFloat());
  const tailR = Array.from({ length: 20 }, () => restored.nextFloat());
  assert.deepEqual(tailR, tailA, "restored state reproduces the next draws");
});

test("§17/§20.13 — uniform draws lie in [0,1) and use four uint32 state words", () => {
  const rng = createSimRng(31337);
  const state = rng.toState();
  assert.equal(state.s.length, 4);
  for (const w of state.s) {
    assert.ok(Number.isInteger(w) && w >= 0 && w <= 0xffffffff, `state word out of uint32 range: ${w}`);
  }
  for (let i = 0; i < 20000; i++) {
    const u = rng.nextFloat();
    assert.ok(u >= 0 && u < 1, `uniform draw out of [0,1): ${u}`);
  }
});

test("§20.13 — the normal-draw cache serializes correctly", () => {
  const rng = createSimRng(4242);
  // First normal fills the spare; the flag must be part of serialized state.
  const first = rng.nextNormal();
  const stateWithSpare = rng.toState();
  assert.equal(stateWithSpare.hasSpareNormal, true, "spare normal must be recorded in state");
  assert.equal(typeof stateWithSpare.spareNormal, "number");

  // Restoring mid-cache must return the cached spare, not a fresh Box-Muller pair.
  const restored = Rng.fromState(stateWithSpare);
  const secondOriginal = rng.nextNormal();
  const secondRestored = restored.nextNormal();
  assert.equal(secondRestored, secondOriginal, "cached spare must survive serialization");
  assert.equal(restored.toState().hasSpareNormal, false, "consuming the spare clears the flag");
  assert.equal(typeof first, "number");

  // And a state serialized without a spare behaves identically too.
  const afterConsume = rng.toState();
  assert.equal(afterConsume.hasSpareNormal, false);
  const r2 = Rng.fromState(afterConsume);
  assert.equal(r2.nextNormal(), rng.nextNormal());
});

test("§17 — cloning a biological state clones the exact RNG state", () => {
  const rng = createSimRng(777);
  for (let i = 0; i < 13; i++) rng.nextFloat();
  rng.nextNormal(); // leave a cached spare
  const clone = rng.clone();
  assert.deepEqual(clone.toState(), rng.toState());
  const a = Array.from({ length: 25 }, () => rng.nextFloat());
  const b = Array.from({ length: 25 }, () => clone.nextFloat());
  assert.deepEqual(b, a, "cloned states produce identical subsequent draws");
});

test("§20.13 — UI actions do not change simRngState", () => {
  const state = createInitialState(88);
  advanceGeneration(state);
  const before = state.simRng.toState();
  const beforeBytes = serializeCanonicalBiology(state);

  // Exercise the UI RNG heavily and every observer read path.
  const ui = createUiRng(32001);
  for (let i = 0; i < 500; i++) ui.nextFloat();
  const observer = createObserverState();
  const ids = state.currentIndividuals.map((i) => i.id);
  createTracerChannel(observer, "ui-test", ids.slice(0, 5), ids);
  livingFounderContribution(observer, "ui-test", ids);
  zoneBinCounts(state.currentIndividuals);

  assert.deepEqual(state.simRng.toState(), before, "uiRng must not touch simRngState");
  assert.equal(serializeCanonicalBiology(state), beforeBytes);
});

test("§17 — simRng and uiRng are independent roots and are never shared", () => {
  const sim = createSimRng(5);
  const ui = createUiRng(5);
  // Same seed gives the same stream, but they are distinct objects: advancing
  // one must never advance the other.
  const simBefore = sim.toState();
  for (let i = 0; i < 100; i++) ui.nextFloat();
  assert.deepEqual(sim.toState(), simBefore);
  assert.notEqual(sim, ui);
});

test("§18 — canonical serialization includes complete simRng state needed to reproduce the next draw", () => {
  const state = createInitialState(91);
  advanceGeneration(state);
  const bytes = serializeCanonicalBiology(state);
  const parsed = JSON.parse(bytes);
  assert.ok(parsed.simRngState, "simRngState must be present");
  assert.equal(parsed.simRngState.s.length, 4);
  assert.equal(typeof parsed.simRngState.hasSpareNormal, "boolean");
  assert.equal(typeof parsed.simRngState.spareNormal, "number");

  // Reconstructing from the serialized state reproduces the next draws.
  const restored = Rng.fromState(parsed.simRngState);
  const expected = Array.from({ length: 10 }, () => state.simRng.nextFloat());
  const actual = Array.from({ length: 10 }, () => restored.nextFloat());
  assert.deepEqual(actual, expected);
});

test("§17 — the PRNG never emits an all-zero state from a zero seed", () => {
  const rng = createSimRng(0);
  const s = rng.toState().s;
  assert.ok(s.some((w) => w !== 0), "xoshiro is undefined at the all-zero state");
  const draws = Array.from({ length: 100 }, () => rng.nextFloat());
  assert.ok(new Set(draws).size > 90, "a zero seed must still produce a varied stream");
});
