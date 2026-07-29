// @ts-check
/**
 * Complete model identity and state/config binding (revision-3 repairs).
 *
 * Two confirmed defects are covered:
 *
 * 1. §9 requires trait effects to live in versioned configuration, and the
 *    reports use a hash to identify the model that produced the evidence.
 *    Revision 2 hashed only the tuning config, so mutating `EFFECT[0][0]` moved
 *    production survival from 0.1224 to 0.95 while the reported hash was
 *    unchanged. The hash now covers the complete model definition.
 *
 * 2. `advanceGeneration()` accepted any configuration and defaulted to the
 *    current one, so a config-1 state advanced under config 2 kept its config-1
 *    label. Two different worlds could carry the same configuration label.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  currentModelConfig,
  legacyModelConfigV1,
  modelDefinitionFor,
  founderAgeForId,
  deepFreeze,
} from "../src/config/modelConfig.js";
import { buildModelDefinition } from "../src/config/modelDefinition.js";
import { canonicalStringify } from "../src/core/canonicalSerialize.js";
import { createInitialState, makeEmptyState } from "../src/core/individual.js";
import { advanceGeneration, runGenerations, assertConfigMatchesState } from "../src/core/simulation.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import { hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { EFFECT, UPKEEP, TRAITS, PERFORMANCE_DIMENSIONS } from "../src/config/traits.js";
import { ZONES, ZONE_NEIGHBORS } from "../src/config/zones.js";
import { createSimRng } from "../src/core/rng.js";

const hashOf = (obj) => createHash("sha256").update(canonicalStringify(obj)).digest("hex");

// ---------------------------------------------------------------------------
// 1. The model hash must cover every biology-affecting value
// ---------------------------------------------------------------------------

test("§9 — the model definition contains every biology-affecting value", () => {
  const d = modelDefinitionFor(currentModelConfig);
  for (const field of [
    "traitOrder", "performanceDimensionOrder", "traitEffectMatrix", "upkeepCosts",
    "zoneOrder", "zoneAdjacency", "zoneWeights", "zoneCapacity", "zoneScarcity",
    "ancestorBodyGenome", "canopyHeavy", "forestFloorHeavy", "shorelineHeavy",
    "founderAgeValues", "founderGenomeSpread", "startingPopulation",
    "selectionSlope", "fitnessZero", "minZoneSurvival", "maxZoneSurvival",
    "minIndividualSurvival", "maxIndividualSurvival", "ageSurvivalMultiplier",
    "matingOverlapExponent", "minimumMatingOverlap", "offspringPerPair",
    "bodyDriftScale", "bodyMutationProbabilityPerChild",
    "bodyMutationMagnitudeMin", "bodyMutationMagnitudeMax",
    "parentalUseEpsilon", "allocationDriftScale",
    "allocationMutationProbabilityPerChild",
    "allocationMutationTransferMin", "allocationMutationTransferMax",
    "genealogyRetentionWindow", "version",
  ]) {
    assert.ok(field in d, `model definition must include ${field}`);
  }
  // And it must actually mirror the live tables.
  assert.deepEqual(d.traitEffectMatrix, EFFECT.map((r) => Array.from(r)));
  assert.deepEqual(d.upkeepCosts, Array.from(UPKEEP));
  assert.deepEqual(d.zoneAdjacency, ZONE_NEIGHBORS.map((n) => Array.from(n)));
  assert.deepEqual(d.traitOrder, Array.from(TRAITS));
  assert.deepEqual(d.performanceDimensionOrder, Array.from(PERFORMANCE_DIMENSIONS));
  assert.deepEqual(d.zoneOrder, Array.from(ZONES));
});

test("§9 — changing any trait effect changes the model hash", () => {
  const baseline = hashOf(modelDefinitionFor(currentModelConfig));
  // Build a definition from a perturbed effect matrix without mutating the
  // frozen live table (which is now immutable anyway).
  const perturbed = buildModelDefinition(currentModelConfig);
  perturbed.traitEffectMatrix[0][0] = perturbed.traitEffectMatrix[0][0] + 1.0;
  assert.notEqual(hashOf(perturbed), baseline, "a changed trait effect must move the hash");

  // Every single cell matters.
  for (let t = 0; t < 3; t++) {
    for (let dim = 0; dim < 3; dim++) {
      const p = buildModelDefinition(currentModelConfig);
      p.traitEffectMatrix[t][dim] = p.traitEffectMatrix[t][dim] + 0.5;
      assert.notEqual(hashOf(p), baseline, `EFFECT[${t}][${dim}] must affect the hash`);
    }
  }
});

test("§9 — changing upkeep, adjacency, or founder ages changes the model hash", () => {
  const baseline = hashOf(modelDefinitionFor(currentModelConfig));

  const upkeep = buildModelDefinition(currentModelConfig);
  upkeep.upkeepCosts[0] += 0.01;
  assert.notEqual(hashOf(upkeep), baseline, "upkeep must affect the hash");

  const adjacency = buildModelDefinition(currentModelConfig);
  adjacency.zoneAdjacency[0] = [1, 2]; // illegal canopy-shoreline edge
  assert.notEqual(hashOf(adjacency), baseline, "adjacency must affect the hash");

  const ages = buildModelDefinition({ ...currentModelConfig, founderAgeValues: [2] });
  assert.notEqual(hashOf(ages), baseline, "founder ages must affect the hash");

  const order = buildModelDefinition(currentModelConfig);
  order.traitOrder = [...order.traitOrder].reverse();
  assert.notEqual(hashOf(order), baseline, "trait order must affect the hash");

  const caps = buildModelDefinition({ ...currentModelConfig, zoneCapacity: [90, 90, 90] });
  assert.notEqual(hashOf(caps), baseline, "zone capacity must affect the hash");
});

test("§9 — the two configurations produce different model hashes", () => {
  assert.notEqual(
    hashOf(modelDefinitionFor(currentModelConfig)),
    hashOf(modelDefinitionFor(legacyModelConfigV1))
  );
});

// ---------------------------------------------------------------------------
// 2. Immutability and non-sharing
// ---------------------------------------------------------------------------

/** Walk every nested object/array and assert it is frozen. */
function assertDeeplyFrozen(value, path = "config") {
  if (value === null || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value), `${path} must be frozen`);
  for (const key of Object.keys(value)) assertDeeplyFrozen(value[key], `${path}.${key}`);
}

test("every nested configuration object and array is deeply frozen", () => {
  assertDeeplyFrozen(currentModelConfig, "currentModelConfig");
  assertDeeplyFrozen(legacyModelConfigV1, "legacyModelConfigV1");
  // The live biology tables too.
  assert.ok(Object.isFrozen(EFFECT), "EFFECT must be frozen");
  for (let i = 0; i < EFFECT.length; i++) {
    assert.ok(Object.isFrozen(EFFECT[i]), `EFFECT[${i}] must be frozen`);
  }
  assert.ok(Object.isFrozen(UPKEEP), "UPKEEP must be frozen");
  assert.ok(Object.isFrozen(ZONES), "ZONES must be frozen");
  assert.ok(Object.isFrozen(ZONE_NEIGHBORS));
  for (const n of ZONE_NEIGHBORS) assert.ok(Object.isFrozen(n));
});

test("config 1 and config 2 share no mutable nested references", () => {
  const shared = [];
  for (const key of Object.keys(currentModelConfig)) {
    const a = currentModelConfig[key];
    const b = legacyModelConfigV1[key];
    if (a !== null && typeof a === "object" && a === b) shared.push(key);
  }
  assert.deepEqual(shared, [], `configs must not share nested references: ${shared.join(", ")}`);
  // Spot-check the ones revision 2 shared via object spread.
  assert.notEqual(currentModelConfig.zoneWeights, legacyModelConfigV1.zoneWeights);
  assert.notEqual(currentModelConfig.ancestorBodyGenome, legacyModelConfigV1.ancestorBodyGenome);
  assert.notEqual(currentModelConfig.fitnessZero, legacyModelConfigV1.fitnessZero);
  assert.notEqual(currentModelConfig.ageSurvivalMultiplier, legacyModelConfigV1.ageSurvivalMultiplier);
});

test("deepFreeze freezes nested structures", () => {
  const o = deepFreeze({ a: [1, [2, 3]], b: { c: [4] } });
  assert.ok(Object.isFrozen(o));
  assert.ok(Object.isFrozen(o.a));
  assert.ok(Object.isFrozen(o.a[1]));
  assert.ok(Object.isFrozen(o.b));
  assert.ok(Object.isFrozen(o.b.c));
});

// ---------------------------------------------------------------------------
// 3. founderAgeForId uses the SUPPLIED configuration
// ---------------------------------------------------------------------------

test("§7 — a supplied founderAgeValues of [2] creates founders of age 2", () => {
  assert.equal(founderAgeForId(1, { founderAgeValues: [2] }), 2);
  assert.equal(founderAgeForId(2, { founderAgeValues: [2] }), 2);
  assert.equal(founderAgeForId(37, { founderAgeValues: [2] }), 2);

  const cfg = { ...currentModelConfig, version: "test-ages", founderAgeValues: [2] };
  const state = createInitialState(1, cfg);
  const ages = new Set(state.currentIndividuals.map((i) => i.ageGenerations));
  assert.deepEqual([...ages], [2], "every founder must be age 2 under the supplied distribution");

  // And the default distribution still holds.
  const dflt = createInitialState(1, currentModelConfig);
  assert.deepEqual(
    dflt.currentIndividuals.slice(0, 6).map((i) => i.ageGenerations),
    [0, 1, 2, 0, 1, 2]
  );
});

// ---------------------------------------------------------------------------
// 4. State progression is bound to the state's configuration identity
// ---------------------------------------------------------------------------

test("a config-1 state cannot be advanced with config 2, and vice versa", () => {
  const s1 = createInitialState(1, legacyModelConfigV1);
  assert.equal(s1.configVersion, "lineage-m1-config-1");
  assert.throws(() => advanceGeneration(s1, currentModelConfig), /configuration mismatch/);
  // The default parameter is config 2, so a bare call must also be rejected.
  assert.throws(() => advanceGeneration(s1), /configuration mismatch/);
  assert.throws(() => runGenerations(s1, 5), /configuration mismatch/);

  const s2 = createInitialState(1, currentModelConfig);
  assert.throws(() => advanceGeneration(s2, legacyModelConfigV1), /configuration mismatch/);
  assert.throws(() => runGenerations(s2, 5, legacyModelConfigV1), /configuration mismatch/);
});

test("rejection leaves canonical bytes and RNG state completely unchanged", () => {
  const s = createInitialState(7, legacyModelConfigV1);
  const bytesBefore = serializeCanonicalBiology(s);
  const rngBefore = JSON.stringify(s.simRng.toState());
  const countersBefore = [
    s.generation, s.nextIndividualId, s.nextBirthEventId, s.nextMatingEventId,
    s.nextMutationEventId, s.nextAllocationMutationEventId,
  ];
  const populationBefore = s.currentIndividuals.length;

  assert.throws(() => advanceGeneration(s, currentModelConfig));

  assert.equal(serializeCanonicalBiology(s), bytesBefore, "canonical bytes must be untouched");
  assert.equal(JSON.stringify(s.simRng.toState()), rngBefore, "RNG must not have advanced");
  assert.deepEqual(
    [s.generation, s.nextIndividualId, s.nextBirthEventId, s.nextMatingEventId,
     s.nextMutationEventId, s.nextAllocationMutationEventId],
    countersBefore,
    "no counter may move"
  );
  assert.equal(s.currentIndividuals.length, populationBefore);
  assert.equal(s.deathEvents.length, 0);
  assert.equal(s.biologicalMatingEvents.length, 0);
});

test("matching configuration advances normally under both configs", () => {
  const s1 = createInitialState(3, legacyModelConfigV1);
  advanceGeneration(s1, legacyModelConfigV1);
  assert.equal(s1.generation, 1);
  assert.equal(s1.configVersion, "lineage-m1-config-1");

  const s2 = createInitialState(3, currentModelConfig);
  advanceGeneration(s2, currentModelConfig);
  assert.equal(s2.generation, 1);
  assert.equal(s2.configVersion, "lineage-m1-config-2");

  // The two worlds genuinely differ, and each keeps its own truthful label.
  assert.notEqual(serializeCanonicalBiology(s1), serializeCanonicalBiology(s2));
});

test("the revision-2 falsifier no longer produces two worlds with one label", () => {
  // Revision 2: both states labelled config-1, populations 132 and 160,
  // canonical bytes different. Now the mismatched call cannot happen at all.
  const a = createInitialState(1, legacyModelConfigV1);
  const b = createInitialState(1, legacyModelConfigV1);
  assert.throws(() => advanceGeneration(a)); // would have used config 2 silently
  advanceGeneration(b, legacyModelConfigV1);
  // `a` never advanced, so there is no divergent same-label pair.
  assert.equal(a.generation, 0);
  assert.equal(b.generation, 1);
});

test("fixture hydration also binds the state to the supplied configuration", () => {
  const { envelope } = loadValidatedFixture();
  const legacy = hydrateDefiningFixtureV1(envelope, 1, legacyModelConfigV1);
  assert.equal(legacy.configVersion, "lineage-m1-config-1");
  assert.throws(() => advanceGeneration(legacy, currentModelConfig), /configuration mismatch/);
  advanceGeneration(legacy, legacyModelConfigV1);
  assert.equal(legacy.generation, 1);
});

test("assertConfigMatchesState is exported and usable directly", () => {
  const s = makeEmptyState(createSimRng(1), currentModelConfig);
  assert.doesNotThrow(() => assertConfigMatchesState(s, currentModelConfig));
  assert.throws(() => assertConfigMatchesState(s, legacyModelConfigV1), /configuration mismatch/);
});
