// @ts-check
/**
 * The declared edge-only adjacency-traversal experiment (revision-3 repair).
 *
 * Runs two isolated single-band worlds per seed and measures, in each:
 *   canopy-only world:    first generation any living descendant reaches
 *                         shoreline >= parentalUseEpsilon
 *   shoreline-only world: first generation any living descendant reaches
 *                         canopy   >= parentalUseEpsilon
 *
 * Because there is no canopy-shoreline edge, the only route is across the
 * forest-floor bridge, which requires forest-floor use to reach the parental-use
 * threshold first.
 *
 * Usage: node tools/runEdgeOnlyTraversal.mjs [--seeds N] [--generations N] [--out path]
 */

import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createEdgeOnlyState, EDGE_ONLY_EXPERIMENTS, edgeOnlyDeclaration } from "../src/fixtures/edgeOnlyWorlds.js";
import { advanceGeneration, isExtinct } from "../src/core/simulation.js";
import { currentModelConfig, modelDefinitionFor } from "../src/config/modelConfig.js";
import { canonicalStringify } from "../src/core/canonicalSerialize.js";
import { ordinaryMedian } from "../src/core/math.js";

const DECLARED_SEEDS = 500;
const DECLARED_GENERATIONS = 180;

/**
 * Run one isolated world and report when the opposite edge zone is first reached.
 * @param {Object} experiment one of EDGE_ONLY_EXPERIMENTS
 * @param {number} seed
 * @param {number} generations
 * @param {Object} config
 */
export function runEdgeOnlyWorld(experiment, seed, generations, config) {
  const state = createEdgeOnlyState(experiment, seed, config);
  const targetZone = experiment.targetZoneIndex;
  const threshold = config.parentalUseEpsilon;
  let firstGeneration = null;
  let extinctAt = null;

  for (let g = 0; g < generations; g++) {
    if (isExtinct(state)) { extinctAt = state.generation; break; }
    advanceGeneration(state, config);
    if (firstGeneration === null) {
      for (const ind of state.currentIndividuals) {
        if (ind.timeAllocation[targetZone] >= threshold) {
          firstGeneration = state.generation;
          break;
        }
      }
    }
  }
  if (isExtinct(state) && extinctAt === null) extinctAt = state.generation;

  return {
    seed,
    experiment: experiment.name,
    firstGeneration,
    reached: firstGeneration !== null,
    extinctAt,
    finalGeneration: state.generation,
    finalPopulation: state.currentIndividuals.length,
    startingPopulation: 40,
  };
}

/** Execute both experiments across the declared seed range. */
export function runEdgeOnlyExperiments(opts = {}) {
  const config = opts.config || currentModelConfig;
  const seedCount = opts.seedCount || DECLARED_SEEDS;
  const generations = opts.generations || DECLARED_GENERATIONS;

  const results = {};
  for (const key of ["canopyOnly", "shorelineOnly"]) {
    const experiment = EDGE_ONLY_EXPERIMENTS[key];
    const seeds = [];
    for (let seed = 1; seed <= seedCount; seed++) {
      seeds.push(runEdgeOnlyWorld(experiment, seed, generations, config));
      if (opts.onProgress && seed % 50 === 0) opts.onProgress(key, seed, seedCount);
    }
    const reachedGenerations = seeds.filter((s) => s.reached).map((s) => s.firstGeneration);
    results[key] = {
      experiment: key,
      targetZone: experiment.targetZoneName,
      retainedFounderIds: `${experiment.founderIdStart}..${experiment.founderIdEndInclusive}`,
      seedsReaching: reachedGenerations.length,
      ofSeeds: seeds.length,
      earliestGeneration: reachedGenerations.length ? Math.min(...reachedGenerations) : null,
      medianFirstGeneration: reachedGenerations.length ? ordinaryMedian(reachedGenerations) : null,
      latestGeneration: reachedGenerations.length ? Math.max(...reachedGenerations) : null,
      extinctSeeds: seeds.filter((s) => s.extinctAt !== null).length,
      medianFinalPopulation: seeds.filter((s) => s.extinctAt === null).length
        ? ordinaryMedian(seeds.filter((s) => s.extinctAt === null).map((s) => s.finalPopulation))
        : null,
      seeds,
    };
  }

  return {
    contractSection: "21.6 (declared edge-only adjacency traversal)",
    configVersion: config.version,
    modelDefinitionHash: createHash("sha256")
      .update(canonicalStringify(modelDefinitionFor(config)))
      .digest("hex"),
    declaredSeedRange: { start: 1, endInclusive: seedCount },
    declaredGenerations: generations,
    frozenInitializer: edgeOnlyDeclaration(config),
    canopyOnly: results.canopyOnly,
    shorelineOnly: results.shorelineOnly,
  };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const at = (f) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : undefined);
  const seedCount = at("--seeds") ? Number(at("--seeds")) : DECLARED_SEEDS;
  const generations = at("--generations") ? Number(at("--generations")) : DECLARED_GENERATIONS;
  const out = at("--out") || "audit/edge-only-traversal-results.json";

  const t0 = Date.now();
  const results = runEdgeOnlyExperiments({
    seedCount,
    generations,
    onProgress: (key, seed, n) => process.stderr.write(`  ${key} seed ${seed}/${n}\n`),
  });
  writeFileSync(out, JSON.stringify(results, null, 2));
  for (const key of ["canopyOnly", "shorelineOnly"]) {
    const r = results[key];
    console.log(
      `${key} (founders ${r.retainedFounderIds}, target ${r.targetZone}): ` +
      `reached ${r.seedsReaching}/${r.ofSeeds}, earliest gen ${r.earliestGeneration}, ` +
      `median gen ${r.medianFirstGeneration}, latest ${r.latestGeneration}, extinct ${r.extinctSeeds}`
    );
  }
  console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] -> ${out}`);
}
