// @ts-check
/**
 * Run the defining-fixture matched trajectory gate (contract §19.4) and write
 * audit/fixture-results.json.
 *
 * For each trajectory seed in the fixture's declared range, build the four
 * worlds (§19.2), attach the measurement tracer at generation 0 from the
 * corresponding twelve focal ids, run to the declared measurement generation
 * (or extinction), and record living founder contribution per world.
 *
 * Usage: node tools/runFixture.mjs [--seeds N] [--out path]
 */

import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { loadValidatedFixture } from "../src/fixtures/nodeFixtureIO.js";
import { buildFourWorlds } from "../src/fixtures/definingFixtureV1.js";
import { advanceGeneration, isExtinct } from "../src/core/simulation.js";
import { currentModelConfig, modelDefinitionFor } from "../src/config/modelConfig.js";
import { canonicalStringify } from "../src/core/canonicalSerialize.js";
import { ordinaryMedian } from "../src/core/math.js";
import {
  createObserverState,
  createTracerChannel,
  tracerBirthHook,
  observerAfterGenerationHook,
  livingFounderContribution,
} from "../src/observer/tracerChannels.js";

/**
 * Run one world with a measurement tracer to the measurement generation.
 * @param {Object} state hydrated biological state
 * @param {number[]} focalIds
 * @param {number} measurementGeneration
 * @param {Object} config
 */
export function runWorldWithTracer(state, focalIds, measurementGeneration, config) {
  const observer = createObserverState();
  createTracerChannel(observer, "focal", focalIds, state.currentIndividuals.map((i) => i.id));
  const hook = tracerBirthHook(observer);
  const prune = observerAfterGenerationHook(observer);
  let extinctAt = null;
  for (let g = 0; g < measurementGeneration; g++) {
    if (isExtinct(state)) { extinctAt = state.generation; break; }
    advanceGeneration(state, config, { onBirth: hook, afterGeneration: prune });
  }
  if (isExtinct(state) && extinctAt === null) extinctAt = state.generation;
  const livingIds = state.currentIndividuals.map((i) => i.id);
  return {
    contribution: livingFounderContribution(observer, "focal", livingIds),
    population: livingIds.length,
    generation: state.generation,
    extinctAt,
  };
}

/**
 * Execute the full paired fixture experiment.
 * @param {Object} opts
 * @returns {Object} results object
 */
export function runFixtureExperiment(opts = {}) {
  const config = opts.config || currentModelConfig;
  const { envelope, rawSha256 } = loadValidatedFixture();
  const seedStart = envelope.trajectorySeeds.start;
  const seedEnd = opts.seedLimit
    ? Math.min(envelope.trajectorySeeds.endInclusive, seedStart + opts.seedLimit - 1)
    : envelope.trajectorySeeds.endInclusive;
  const measurementGeneration = envelope.measurementGeneration;

  const seedResults = [];
  for (let seed = seedStart; seed <= seedEnd; seed++) {
    const worlds = buildFourWorlds(envelope, seed, config);
    const cLow = runWorldWithTracer(worlds.canopyLow, envelope.canopyFocalIds, measurementGeneration, config);
    const cHigh = runWorldWithTracer(worlds.canopyHigh, envelope.canopyFocalIds, measurementGeneration, config);
    const sLow = runWorldWithTracer(worlds.shorelineLow, envelope.shorelineFocalIds, measurementGeneration, config);
    const sHigh = runWorldWithTracer(worlds.shorelineHigh, envelope.shorelineFocalIds, measurementGeneration, config);
    seedResults.push({
      seed,
      canopy: { low: cLow, high: cHigh, difference: cHigh.contribution - cLow.contribution },
      shoreline: { low: sLow, high: sHigh, difference: sHigh.contribution - sLow.contribution },
    });
    if (opts.onProgress) opts.onProgress(seed, seedEnd);
  }

  const canopyLowC = seedResults.map((r) => r.canopy.low.contribution);
  const canopyHighC = seedResults.map((r) => r.canopy.high.contribution);
  const shoreLowC = seedResults.map((r) => r.shoreline.low.contribution);
  const shoreHighC = seedResults.map((r) => r.shoreline.high.contribution);

  // Success: shoreline high > low; canopy high < low. Exact ties are recorded
  // separately and count as NOT successful (§19.4).
  const canopySuccess = seedResults.filter((r) => r.canopy.high.contribution < r.canopy.low.contribution).length;
  const canopyTies = seedResults.filter((r) => r.canopy.high.contribution === r.canopy.low.contribution).length;
  const shorelineSuccess = seedResults.filter((r) => r.shoreline.high.contribution > r.shoreline.low.contribution).length;
  const shorelineTies = seedResults.filter((r) => r.shoreline.high.contribution === r.shoreline.low.contribution).length;

  const focalExtinctionCount = seedResults.reduce((acc, r) => {
    let n = 0;
    for (const w of [r.canopy.low, r.canopy.high, r.shoreline.low, r.shoreline.high]) {
      if (w.contribution === 0) n++;
    }
    return acc + n;
  }, 0);
  const wholeWorldExtinctionCount = seedResults.reduce((acc, r) => {
    let n = 0;
    for (const w of [r.canopy.low, r.canopy.high, r.shoreline.low, r.shoreline.high]) {
      if (w.extinctAt !== null) n++;
    }
    return acc + n;
  }, 0);

  const medians = {
    canopyLow: ordinaryMedian(canopyLowC),
    canopyHigh: ordinaryMedian(canopyHighC),
    shorelineLow: ordinaryMedian(shoreLowC),
    shorelineHigh: ordinaryMedian(shoreHighC),
  };

  const seedCount = seedResults.length;
  const successThreshold = Math.ceil(seedCount * 0.65);
  const gates = {
    medianShorelineHighGreaterThanLow: medians.shorelineHigh > medians.shorelineLow,
    medianCanopyHighLessThanLow: medians.canopyHigh < medians.canopyLow,
    shorelineSuccessAtLeastThreshold: shorelineSuccess >= successThreshold,
    canopySuccessAtLeastThreshold: canopySuccess >= successThreshold,
    successThreshold,
    seedCount,
  };
  gates.allPass =
    gates.medianShorelineHighGreaterThanLow &&
    gates.medianCanopyHighLessThanLow &&
    gates.shorelineSuccessAtLeastThreshold &&
    gates.canopySuccessAtLeastThreshold;

    // Hash the COMPLETE model definition, not just the tuning config: revision 2
  // hashed `config` alone, which excluded EFFECT, UPKEEP, adjacency, and the
  // trait/dimension orders, so a mutated trait effect could change survival
  // while this hash stayed constant.
  const modelDefinition = modelDefinitionFor(config);
  const modelDefinitionHash = createHash("sha256").update(canonicalStringify(modelDefinition)).digest("hex");
  const tuningConfigHash = createHash("sha256").update(canonicalStringify(config)).digest("hex");

  return {
    contractSection: "19.4",
    fixtureRawSha256: rawSha256,
    configVersion: config.version,
    modelDefinitionHash,
    tuningConfigHash,
    modelDefinition,
    measurementGeneration,
    seedRange: { start: seedStart, endInclusive: seedEnd },
    medians,
    successCounts: { canopy: canopySuccess, shoreline: shorelineSuccess },
    tieCounts: { canopy: canopyTies, shoreline: shorelineTies },
    focalContributionExtinctionCount: focalExtinctionCount,
    wholeWorldExtinctionCount,
    totalPopulationDistributions: {
      canopyLow: seedResults.map((r) => r.canopy.low.population),
      canopyHigh: seedResults.map((r) => r.canopy.high.population),
      shorelineLow: seedResults.map((r) => r.shoreline.low.population),
      shorelineHigh: seedResults.map((r) => r.shoreline.high.population),
    },
    pairedDifferenceDistributions: {
      canopy: seedResults.map((r) => r.canopy.difference),
      shoreline: seedResults.map((r) => r.shoreline.difference),
    },
    gates,
    seedResults,
  };
}

// Run the batch only when executed directly, never when imported by a test.
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const seedsIdx = args.indexOf("--seeds");
  const outIdx = args.indexOf("--out");
  const seedLimit = seedsIdx >= 0 ? Number(args[seedsIdx + 1]) : undefined;
  const out = outIdx >= 0 ? args[outIdx + 1] : "audit/fixture-results.json";
  const t0 = Date.now();
  const results = runFixtureExperiment({
    seedLimit,
    onProgress: (seed, end) => {
      if (seed % 10 === 0 || seed === end) {
        process.stderr.write(`  seed ${seed}/${end}\n`);
      }
    },
  });
  writeFileSync(out, JSON.stringify(results, null, 2));
  const g = results.gates;
  console.log(`fixture gate (${results.seedRange.start}..${results.seedRange.endInclusive}), config ${results.configVersion}`);
  console.log(`  median canopy   low=${results.medians.canopyLow.toFixed(4)} high=${results.medians.canopyHigh.toFixed(4)} -> high<low ${g.medianCanopyHighLessThanLow}`);
  console.log(`  median shoreline low=${results.medians.shorelineLow.toFixed(4)} high=${results.medians.shorelineHigh.toFixed(4)} -> high>low ${g.medianShorelineHighGreaterThanLow}`);
  console.log(`  canopy successes    ${results.successCounts.canopy}/${g.seedCount} (need >= ${g.successThreshold}) ties=${results.tieCounts.canopy}`);
  console.log(`  shoreline successes ${results.successCounts.shoreline}/${g.seedCount} (need >= ${g.successThreshold}) ties=${results.tieCounts.shoreline}`);
  console.log(`  ALL PASS: ${g.allPass}   [${((Date.now() - t0) / 1000).toFixed(1)}s] -> ${out}`);
}
