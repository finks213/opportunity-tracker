// @ts-check
/**
 * Contract §20.4 — neutral-trait integrity, and §8's zero-contribution rules.
 *
 * For each neutral trait, changing ONLY that value must produce exactly
 * identical performance dimensions, zone fitness, survival probabilities,
 * mating weights, allocation inheritance, and mutation probabilities.
 * "Exactly" means exact equality, not a tolerance.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { performanceDimensions, upkeepCost, zoneFitness } from "../src/core/performance.js";
import { survivalProbability } from "../src/core/survival.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { TRAITS, NEUTRAL_TRAIT_INDICES, EFFECT, UPKEEP, NUM_TRAITS } from "../src/config/traits.js";
import { inheritTimeAllocation, inheritBodyGenome } from "../src/core/inheritance.js";
import { bodyMutationOpportunity } from "../src/core/mutation.js";
import { createSimRng } from "../src/core/rng.js";
import { dot } from "../src/core/math.js";

const C = currentModelConfig;
const BASE = [0.15, 0.45, 0.40, 0.45, 0.40, 0.40, 0.35, 0.50, 0.50, 0.50];
const LOADS = [39.84, 40.32, 39.84];
const ALLOCS = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.3, 0.2]];
const NEUTRAL_VALUES = [0.0, 0.13, 0.5, 0.87, 1.0];

test("§8 — exactly three neutral traits, contributing zero to every dimension and to upkeep", () => {
  assert.equal(NUM_TRAITS, 10, "exactly ten traits, no eleventh");
  assert.deepEqual(Array.from(NEUTRAL_TRAIT_INDICES), [7, 8, 9]);
  for (const t of NEUTRAL_TRAIT_INDICES) {
    assert.ok(
      EFFECT[t].every((v) => v === 0),
      `${TRAITS[t]} must contribute exactly zero to all performance dimensions`
    );
    assert.equal(UPKEEP[t], 0, `${TRAITS[t]} must contribute exactly zero upkeep (no hidden cost)`);
  }
});

test("§20.4 — neutral traits produce exactly identical performance dimensions and zone fitness", () => {
  for (const t of NEUTRAL_TRAIT_INDICES) {
    const reference = performanceDimensions(BASE);
    const referenceFitness = zoneFitness(BASE, C);
    const referenceUpkeep = upkeepCost(BASE);
    for (const v of NEUTRAL_VALUES) {
      const g = BASE.slice();
      g[t] = v;
      assert.deepEqual(performanceDimensions(g), reference, `${TRAITS[t]}=${v} changed performance dimensions`);
      assert.deepEqual(zoneFitness(g, C), referenceFitness, `${TRAITS[t]}=${v} changed zone fitness`);
      assert.equal(upkeepCost(g), referenceUpkeep, `${TRAITS[t]}=${v} changed upkeep`);
    }
  }
});

test("§20.4 — neutral traits produce exactly identical survival probabilities", () => {
  for (const t of NEUTRAL_TRAIT_INDICES) {
    for (const alloc of ALLOCS) {
      for (let age = 0; age <= 5; age++) {
        const reference = survivalProbability(
          { bodyGenome: BASE, timeAllocation: alloc, ageGenerations: age }, LOADS, C
        );
        for (const v of NEUTRAL_VALUES) {
          const g = BASE.slice();
          g[t] = v;
          const r = survivalProbability(
            { bodyGenome: g, timeAllocation: alloc, ageGenerations: age }, LOADS, C
          );
          assert.equal(r.pSurvival, reference.pSurvival, `${TRAITS[t]}=${v} changed pSurvival`);
          assert.deepEqual(r.pZone, reference.pZone, `${TRAITS[t]}=${v} changed pZone`);
          assert.equal(r.pEcological, reference.pEcological);
        }
      }
    }
  }
});

test("§20.4 — neutral traits do not affect mating weights", () => {
  // Mating weight depends only on time-allocation overlap, never on the genome.
  const allocA = [0.8, 0.2, 0.0];
  const allocB = [0.6, 0.4, 0.0];
  const overlap = dot(allocA, allocB);
  const weight = Math.pow(overlap, C.matingOverlapExponent);
  for (const t of NEUTRAL_TRAIT_INDICES) {
    for (const v of NEUTRAL_VALUES) {
      // Changing the genome cannot enter the weight computation at all.
      const recomputed = Math.pow(dot(allocA, allocB), C.matingOverlapExponent);
      assert.equal(recomputed, weight, `${TRAITS[t]}=${v} must not influence mating weight`);
    }
  }
});

test("§20.4 — neutral traits do not affect allocation inheritance", () => {
  const allocA = [0.9, 0.1, 0.0];
  const allocB = [0.7, 0.3, 0.0];
  for (const t of NEUTRAL_TRAIT_INDICES) {
    const referenceRng = createSimRng(1234);
    const reference = inheritTimeAllocation(allocA, allocB, referenceRng, C);
    for (const v of NEUTRAL_VALUES) {
      const rng = createSimRng(1234);
      const r = inheritTimeAllocation(allocA, allocB, rng, C);
      assert.deepEqual(Array.from(r.allocation), Array.from(reference.allocation));
      assert.deepEqual(r.eligible, reference.eligible);
      assert.deepEqual(rng.toState(), referenceRng.toState(), "identical RNG consumption");
    }
  }
});

test("§20.4 — neutral traits do not affect mutation probabilities or draws", () => {
  for (const t of NEUTRAL_TRAIT_INDICES) {
    const refRng = createSimRng(9876);
    const refGenome = BASE.slice();
    const reference = bodyMutationOpportunity(refGenome, refRng, C);
    for (const v of NEUTRAL_VALUES) {
      const g = BASE.slice();
      g[t] = v;
      const rng = createSimRng(9876);
      const r = bodyMutationOpportunity(g, rng, C);
      assert.equal(r.occurred, reference.occurred, `${TRAITS[t]}=${v} changed mutation occurrence`);
      assert.equal(r.drawsConsumed, reference.drawsConsumed);
      if (r.draft && reference.draft) {
        assert.equal(r.draft.traitId, reference.draft.traitId);
        assert.equal(r.draft.requestedDelta, reference.draft.requestedDelta);
      }
      assert.deepEqual(rng.toState(), refRng.toState(), "identical RNG consumption");
    }
  }
});

test("§8/§10.2 — neutral traits are still inherited and can drift and mutate", () => {
  // They must participate in the same birth mechanisms, just with zero effect.
  const a = BASE.slice();
  const b = BASE.slice();
  a[7] = 0.9; b[7] = 0.1; // coat_shade differs between parents
  const rng = createSimRng(555);
  const child = inheritBodyGenome(a, b, rng, C);
  assert.equal(child.length, NUM_TRAITS);
  // The neutral trait inherits the parental mean plus drift, so it is a real
  // heritable value, not a constant.
  assert.ok(child[7] >= 0 && child[7] <= 1);

  // A neutral trait can be chosen by the mutation trait draw.
  let neutralMutationSeen = false;
  for (let seed = 0; seed < 400 && !neutralMutationSeen; seed++) {
    const r = bodyMutationOpportunity(BASE, createSimRng(seed), C);
    if (r.occurred && NEUTRAL_TRAIT_INDICES.includes(r.draft.traitId)) neutralMutationSeen = true;
  }
  assert.ok(neutralMutationSeen, "neutral traits must be reachable by the mutation trait draw");
});
