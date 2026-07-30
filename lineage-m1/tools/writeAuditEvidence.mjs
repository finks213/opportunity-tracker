// @ts-check
/**
 * Generate the remaining raw audit evidence required by contract §27:
 *   audit/observer-invariance-hashes.json  — generation-by-generation canonical
 *       biological hashes for every required observer strategy in the defining
 *       fixture (§19 "Observer independence within fixture");
 *   audit/reference-file-hashes.json       — hashes proving the quarantined
 *       historical Python references remain unchanged;
 *   audit/meaningful-trait-gate.json       — the exact §9/§20.5 three-zone delta
 *       vectors and neutral-trait maxima, emitted as raw evidence so
 *       FINAL_REPORT.md can be generated from measurement rather than retyped
 *       (revision-4 repair).
 *
 * Usage: node tools/writeAuditEvidence.mjs
 */

import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { serializeCanonicalBiology } from "../src/core/canonicalSerialize.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { TRAITS, TRAIT_INDEX, MEANINGFUL_TRAIT_INDICES, NEUTRAL_TRAIT_INDICES } from "../src/config/traits.js";
import { survivalProbability } from "../src/core/survival.js";
import { ZONES } from "../src/config/zones.js";
import { modelDefinitionFor, modelIdentityFor } from "../src/config/modelConfig.js";
import { modelDefinitionHash as authoritativeModelDefinitionHash } from "../src/config/modelIdentityNode.js";
import { STANDARD_TRAIT_TEST_GENOME, STANDARD_ZONE_LOADS } from "../src/fixtures/definingFixtureV1.js";
import {
  createObserverState,
  createTracerChannel,
  tracerBirthHook,
  observerAfterGenerationHook,
  livingFounderContribution,
} from "../src/observer/tracerChannels.js";
import { zoneBinCounts } from "../src/observer/currentZoneBins.js";
import { annotateMatingEvent } from "../src/observer/matingAnnotations.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATIONS = 30;
const SEED = 19;

/** Expected reference hashes from the starter SHA256_MANIFEST.json. */
const EXPECTED_REFERENCE_HASHES = {
  "reference/biology.py": "ecc9d143a03bf3cf4ac4fab29598acd072396227f6305b212f681b0544b3a1f8",
  "reference/engine.py": "303859044028fa4f4d67e862792090b9094b737e4a75495c338ddde50f22247c",
  "reference/analyze.py": "d878c440eef459aa544be0b3ff19ae202e241d690b9df5264e17eabd3d5ab494",
};

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** Build the five required observer strategies (§19). */
function strategyFactories(envelope) {
  return {
    follow_nothing: () => ({ hook: undefined, perGeneration: () => {} }),

    tracer_canopy_high_webbing_founders: (state) => {
      const observer = createObserverState();
      createTracerChannel(observer, "canopyHigh", envelope.canopyFocalIds, state.currentIndividuals.map((i) => i.id));
      return { observer, hook: tracerBirthHook(observer), perGeneration: () => {} };
    },

    tracer_shoreline_high_webbing_founders: (state) => {
      const observer = createObserverState();
      createTracerChannel(observer, "shorelineHigh", envelope.shorelineFocalIds, state.currentIndividuals.map((i) => i.id));
      return { observer, hook: tracerBirthHook(observer), perGeneration: () => {} };
    },

    tracer_high_coat_shade_founders: (state) => {
      const observer = createObserverState();
      const shade = TRAIT_INDEX.coat_shade;
      const founders = state.currentIndividuals.filter((i) => i.bodyGenome[shade] >= 0.5).map((i) => i.id);
      if (founders.length === 0) {
        throw new Error("high coat-shade strategy selected no living founders; the fixture should contain some");
      }
      createTracerChannel(observer, "highCoatShade", founders, state.currentIndividuals.map((i) => i.id));
      return { observer, hook: tracerBirthHook(observer), perGeneration: () => {} };
    },

    multiple_channels_with_switching: (state) => {
      const observer = createObserverState();
      const ids = state.currentIndividuals.map((i) => i.id);
      createTracerChannel(observer, "chanA", envelope.canopyFocalIds, ids);
      createTracerChannel(observer, "chanB", envelope.shorelineFocalIds, ids);
      let flip = 0;
      return {
        observer,
        hook: tracerBirthHook(observer),
        perGeneration: (s) => {
          flip++;
          observer.activeChannel = flip % 2 === 0 ? "chanA" : "chanB";
          const live = s.currentIndividuals.map((i) => i.id);
          createTracerChannel(observer, `ephemeral-${flip}`, live.slice(0, 3), live);
          observer.channels.delete(`ephemeral-${flip - 1}`);
          zoneBinCounts(s.currentIndividuals);
          const byId = new Map(s.currentIndividuals.map((i) => [i.id, i]));
          for (const ev of s.biologicalMatingEvents.slice(-5)) annotateMatingEvent(ev, byId);
          observer.inspectedIds = live.slice(0, 7);
          livingFounderContribution(observer, "chanA", live);
        },
      };
    },
  };
}

export function buildObserverInvarianceEvidence() {
  const { envelope, rawSha256 } = loadValidatedFixture();
  const factories = strategyFactories(envelope);
  /** @type {Record<string, string[]>} */
  const perStrategy = {};

  for (const [name, make] of Object.entries(factories)) {
    const state = hydrateDefiningFixtureV1(envelope, SEED, currentModelConfig);
    const strategy = make(state);
    const hashes = [sha256(serializeCanonicalBiology(state))];
    for (let g = 0; g < GENERATIONS; g++) {
      advanceGeneration(
        state,
        currentModelConfig,
        strategy.observer
          ? { onBirth: strategy.hook, afterGeneration: observerAfterGenerationHook(strategy.observer) }
          : {}
      );
      strategy.perGeneration(state);
      hashes.push(sha256(serializeCanonicalBiology(state)));
    }
    perStrategy[name] = hashes;
  }

  const names = Object.keys(perStrategy);
  const baseline = perStrategy[names[0]];
  const mismatches = [];
  for (const name of names.slice(1)) {
    for (let g = 0; g < baseline.length; g++) {
      if (perStrategy[name][g] !== baseline[g]) {
        mismatches.push({ strategy: name, generation: g, expected: baseline[g], actual: perStrategy[name][g] });
      }
    }
  }

  return {
    contractSection: "19 / 20.2",
    description:
      "SHA-256 of canonical biological serialization after every generation, for every required observer strategy in the defining fixture.",
    fixtureRawSha256: rawSha256,
    configVersion: currentModelConfig.version,
    trajectorySeed: SEED,
    generations: GENERATIONS,
    strategies: names,
    hashesByStrategyAndGeneration: perStrategy,
    mismatches,
    allStrategiesByteIdentical: mismatches.length === 0,
  };
}

export function buildReferenceHashEvidence() {
  const files = Object.keys(EXPECTED_REFERENCE_HASHES);
  const entries = files.map((rel) => {
    const bytes = readFileSync(join(ROOT, rel));
    const actual = sha256(bytes);
    const expected = EXPECTED_REFERENCE_HASHES[rel];
    return { path: rel, bytes: bytes.length, expectedSha256: expected, actualSha256: actual, unchanged: actual === expected };
  });
  return {
    contractSection: "1 / 24 Stage G / 27",
    description:
      "Hashes proving the quarantined historical Python references were copied unchanged and never modified. These files are defective references and are never imported by any source module.",
    expectedSource: "SHA256_MANIFEST.json from LINEAGE_CLAUDE_CODE_STARTER_v3_3",
    files: entries,
    allUnchanged: entries.every((e) => e.unchanged),
  };
}

/**
 * Exact §9/§20.5 meaningful-trait gate evidence (revision-4 repair).
 *
 * Revision 3's FINAL_REPORT.md carried this table as hand-typed prose. Emitting
 * it as raw evidence means the report and the gate cannot drift: the numbers in
 * the report are read from this file, and `report-integrity.test.js` compares
 * both against a fresh computation.
 *
 * The probe constants below are the frozen §9 values, identical to those
 * asserted by `test/meaningful-trait-context.test.js`.
 */
export function buildMeaningfulTraitGateEvidence() {
  const genome = [0.15, 0.45, 0.40, 0.45, 0.40, 0.40, 0.35, 0.50, 0.50, 0.50];
  const zoneLoads = [39.84, 40.32, 39.84];
  const allocations = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const ageGenerations = 1;
  const lowValue = 0.2;
  const highValue = 0.8;
  const benefitFloor = 0.01;
  const costFloor = 0.01;
  const neutralMargin = 0.001;
  const tolerance = 1e-12;

  // The frozen probe values must equal the fixture's, or the gate is measuring
  // something other than the contract's standard genome.
  const fixtureGenomeMatches =
    Array.from(STANDARD_TRAIT_TEST_GENOME).every((v, i) => v === genome[i]) &&
    STANDARD_ZONE_LOADS.canopy === zoneLoads[0] &&
    STANDARD_ZONE_LOADS.forest_floor === zoneLoads[1] &&
    STANDARD_ZONE_LOADS.shoreline === zoneLoads[2];

  const survival = (g, alloc) =>
    survivalProbability({ bodyGenome: g, timeAllocation: alloc, ageGenerations }, zoneLoads, currentModelConfig)
      .pSurvival;

  const deltasFor = (traitIndex) => {
    const low = genome.slice();
    const high = genome.slice();
    low[traitIndex] = lowValue;
    high[traitIndex] = highValue;
    return allocations.map((alloc) => survival(high, alloc) - survival(low, alloc));
  };

  const meaningful = MEANINGFUL_TRAIT_INDICES.map((t) => {
    const delta = deltasFor(t);
    const positiveZones = [];
    const adverseOrInactiveZones = [];
    for (let z = 0; z < ZONES.length; z++) {
      if (delta[z] >= benefitFloor - tolerance) positiveZones.push(ZONES[z]);
      if (delta[z] <= -costFloor + tolerance || Math.abs(delta[z]) <= neutralMargin + tolerance) {
        adverseOrInactiveZones.push(ZONES[z]);
      }
    }
    const inDifferentZones = positiveZones.some((p) => adverseOrInactiveZones.some((a) => a !== p));
    return {
      trait: TRAITS[t],
      traitIndex: t,
      deltaByZone: { canopy: delta[0], forest_floor: delta[1], shoreline: delta[2] },
      positiveZones,
      adverseOrInactiveZones,
      passes: positiveZones.length > 0 && adverseOrInactiveZones.length > 0 && inDifferentZones,
    };
  });

  const neutral = NEUTRAL_TRAIT_INDICES.map((t) => {
    const delta = deltasFor(t);
    return {
      trait: TRAITS[t],
      traitIndex: t,
      deltaByZone: { canopy: delta[0], forest_floor: delta[1], shoreline: delta[2] },
      maxAbsoluteDelta: Math.max(...delta.map(Math.abs)),
    };
  });

  return {
    contractSection: "9 / 20.5 (meaningful-trait contextual gate) and 20.4 (neutral-trait integrity)",
    configVersion: currentModelConfig.version,
    // Revision-5 repair (BUG 3 / R5-4). This line used
    // `JSON.stringify(modelDefinitionFor(...))`, a DIFFERENT 1,793-byte text
    // hashing to 432391e5…, while every other evidence file published the
    // canonical 2,995-byte text hashing to dc444865… under the same field name.
    modelDefinitionHash: authoritativeModelDefinitionHash(currentModelConfig),
    modelIdentityHash: modelIdentityFor(currentModelConfig),
    probe: {
      genome,
      zoneLoads,
      allocations,
      ageGenerations,
      ageSurvivalMultiplier: currentModelConfig.ageSurvivalMultiplier[ageGenerations],
      lowValue,
      highValue,
      benefitFloor,
      costFloor,
      neutralEquivalenceMargin: neutralMargin,
      arithmeticTolerance: tolerance,
      fixtureGenomeMatches,
    },
    meaningful,
    neutral,
    allMeaningfulPass: meaningful.every((m) => m.passes),
    allNeutralExactlyZero: neutral.every((n) => n.maxAbsoluteDelta === 0),
  };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const observer = buildObserverInvarianceEvidence();
  writeFileSync(join(ROOT, "audit", "observer-invariance-hashes.json"), JSON.stringify(observer, null, 2));
  console.log(
    `observer-invariance-hashes.json: ${observer.strategies.length} strategies x ${observer.generations + 1} generations, byte-identical: ${observer.allStrategiesByteIdentical}`
  );

  const refs = buildReferenceHashEvidence();
  writeFileSync(join(ROOT, "audit", "reference-file-hashes.json"), JSON.stringify(refs, null, 2));
  console.log(`reference-file-hashes.json: all unchanged: ${refs.allUnchanged}`);
  for (const f of refs.files) console.log(`  ${f.path} ${f.unchanged ? "OK" : "CHANGED"} ${f.actualSha256}`);

  const gateEvidence = buildMeaningfulTraitGateEvidence();
  writeFileSync(join(ROOT, "audit", "meaningful-trait-gate.json"), JSON.stringify(gateEvidence, null, 2));
  console.log(
    `meaningful-trait-gate.json: ${gateEvidence.meaningful.length} meaningful traits pass: ` +
    `${gateEvidence.allMeaningfulPass}; neutral traits exactly zero: ${gateEvidence.allNeutralExactlyZero}`
  );

  if (
    !observer.allStrategiesByteIdentical ||
    !refs.allUnchanged ||
    !gateEvidence.allMeaningfulPass ||
    !gateEvidence.allNeutralExactlyZero ||
    !gateEvidence.probe.fixtureGenomeMatches
  ) {
    process.exitCode = 1;
  }
}
