// @ts-check
/**
 * Generate the remaining raw audit evidence required by contract §27:
 *   audit/observer-invariance-hashes.json  — generation-by-generation canonical
 *       biological hashes for every required observer strategy in the defining
 *       fixture (§19 "Observer independence within fixture");
 *   audit/reference-file-hashes.json       — hashes proving the quarantined
 *       historical Python references remain unchanged.
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
import { TRAIT_INDEX } from "../src/config/traits.js";
import {
  createObserverState,
  createTracerChannel,
  tracerBirthHook,
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
      advanceGeneration(state, currentModelConfig, strategy.hook ? { onBirth: strategy.hook } : {});
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

  if (!observer.allStrategiesByteIdentical || !refs.allUnchanged) process.exitCode = 1;
}
