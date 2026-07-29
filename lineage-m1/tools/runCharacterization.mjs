// @ts-check
/**
 * Predeclared random-world characterization batch (contract §21).
 * Writes audit/characterization-results.json.
 *
 * Everything measured here was declared in CHARACTERIZATION_PLAN.md before the
 * batch was run. Nothing below selects or reshapes a metric after seeing results.
 *
 * Usage: node tools/runCharacterization.mjs [--seeds N] [--config v1|v2] [--out path]
 */

import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createInitialState } from "../src/core/individual.js";
import { advanceGeneration, isExtinct } from "../src/core/simulation.js";
import { computeZoneLoads, survivalProbability } from "../src/core/survival.js";
import { currentModelConfig, legacyModelConfigV1 } from "../src/config/modelConfig.js";
import { canonicalStringify } from "../src/core/canonicalSerialize.js";
import { ordinaryMedian } from "../src/core/math.js";
import { ZONES } from "../src/config/zones.js";
import { TRAITS, TRAIT_INDEX, MEANINGFUL_TRAIT_INDICES, NEUTRAL_TRAIT_INDICES } from "../src/config/traits.js";
import { argmax } from "../src/core/math.js";
import { performanceDimensions } from "../src/core/performance.js";

const DECLARED_SEEDS = 500;
const DECLARED_GENERATIONS = 180;
const WEBBING = TRAIT_INDEX.toe_webbing;
const CARRIER_THRESHOLD = 0.35;   // declared carrier definition
const CROSS_FROM = 0.20;          // declared crossing band
const CROSS_TO = 0.35;
const TRAIT_DELTA = 0.20;         // declared fixed delta for §21.5

/** Nearest-rank percentile on a sorted-ascending copy. */
function percentile(values, p) {
  if (values.length === 0) return null;
  const v = values.slice().sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * v.length));
  return v[rank - 1];
}

/** Run one seed and collect every declared measure. */
function runSeed(seed, config, generations) {
  const state = createInitialState(seed, config);
  state.diagnostics.bodyMutationOpportunityCount = 0;
  state.diagnostics.allocationMutationOpportunityCount = 0;
  state.diagnostics.nonFounderBirthCount = 0;

  // §21.3 counters keyed by the child's birth dominant-zone bin.
  const perBin = ZONES.map(() => ({
    births: 0,
    bodyMutationOpportunities: 0,
    bodyMutationEvents: 0,
    positiveWebbingEvents: 0,
    crossingWebbingEvents: 0,
  }));

  // §21.6 per-generation series.
  const birthsPerGeneration = [];
  const deathsPerGeneration = [];
  const matingPairsPerGeneration = [];
  const unmatchedEligiblePerGeneration = [];
  const overlapSamples = [];
  let allocationMutationEvents = 0;
  let lowShareTargetTransfers = 0;
  let firstAdjacencyTraversalGeneration = null;

  let extinctAt = null;
  let previousBirthCount = state.birthEvents.length;
  let previousDeathCount = 0;
  let previousMatingCount = 0;
  let previousBodyMutCount = 0;
  let previousAllocMutCount = 0;

  for (let g = 0; g < generations; g++) {
    if (isExtinct(state)) { extinctAt = state.generation; break; }
    const eligibleBefore = state.currentIndividuals.filter(
      (i) => i.ageGenerations + 1 >= 1 && i.ageGenerations + 1 <= 5
    ).length;

    advanceGeneration(state, config);
    const targetGeneration = state.generation;

    const newBirths = state.birthEvents.filter((b) => b.generation === targetGeneration);
    const newDeaths = state.deathEvents.filter((e) => e.generation === targetGeneration);
    const newMatings = state.biologicalMatingEvents.filter((e) => e.generation === targetGeneration);
    birthsPerGeneration.push(newBirths.length);
    deathsPerGeneration.push(newDeaths.length);
    matingPairsPerGeneration.push(newMatings.length);
    unmatchedEligiblePerGeneration.push(Math.max(0, eligibleBefore - newMatings.length * 2));
    for (const m of newMatings) overlapSamples.push(m.overlap);

    // Bin newborns by their birth dominant-zone bin.
    const byId = new Map(state.currentIndividuals.map((i) => [i.id, i]));
    for (const b of newBirths) {
      const child = byId.get(b.childId);
      if (!child) continue;
      const bin = argmax(child.timeAllocation);
      perBin[bin].births++;
      perBin[bin].bodyMutationOpportunities++;
    }
    // Body-mutation events of this generation, binned by the recorded birth allocation.
    for (const ev of state.bodyMutationEvents.filter((e) => e.generation === targetGeneration)) {
      const bin = argmax(ev.childTimeAllocationAtBirth);
      perBin[bin].bodyMutationEvents++;
      if (ev.traitId === WEBBING && ev.requestedDelta > 0) {
        perBin[bin].positiveWebbingEvents++;
        if (ev.preMutationValue < CROSS_FROM && ev.postMutationValue >= CROSS_TO) {
          perBin[bin].crossingWebbingEvents++;
        }
      }
    }
    // Allocation-mutation frequency and adjacency traversal.
    for (const ev of state.allocationMutationEvents.filter((e) => e.generation === targetGeneration)) {
      allocationMutationEvents++;
      const toIndex = ZONES.indexOf(ev.toZone);
      if (ev.preMutationAllocation[toIndex] < config.parentalUseEpsilon) lowShareTargetTransfers++;
    }
    // Declared traversal marker: first generation any living individual holds
    // meaningful share in a zone no founder band of its own lineage began with.
    if (firstAdjacencyTraversalGeneration === null) {
      for (const ind of state.currentIndividuals) {
        const a = ind.timeAllocation;
        if (a[0] >= 0.02 && a[2] >= 0.02) { // spans both edge zones
          firstAdjacencyTraversalGeneration = targetGeneration;
          break;
        }
      }
    }
    previousBirthCount = state.birthEvents.length;
    previousDeathCount = newDeaths.length;
    previousMatingCount = newMatings.length;
    previousBodyMutCount = state.bodyMutationEvents.length;
    previousAllocMutCount = state.allocationMutationEvents.length;
  }

  const extinct = isExtinct(state);
  if (extinct && extinctAt === null) extinctAt = state.generation;

  const zoneLoad = computeZoneLoads(state.currentIndividuals, ZONES.length);
  const totalLoad = zoneLoad.reduce((a, b) => a + b, 0);
  const concentration = totalLoad > 0 ? Math.max(...zoneLoad) / totalLoad : null;

  // Carriers by age, and final prevalence.
  const carriersByAge = { age1: 0, age2: 0, age3plus: 0 };
  let carriers = 0;
  for (const ind of state.currentIndividuals) {
    if (ind.bodyGenome[WEBBING] >= CARRIER_THRESHOLD) {
      carriers++;
      if (ind.ageGenerations === 1) carriersByAge.age1++;
      else if (ind.ageGenerations === 2) carriersByAge.age2++;
      else if (ind.ageGenerations >= 3) carriersByAge.age3plus++;
    }
  }
  const ageDistribution = {};
  for (const ind of state.currentIndividuals) {
    ageDistribution[ind.ageGenerations] = (ageDistribution[ind.ageGenerations] ?? 0) + 1;
  }
  const zoneBinCounts = ZONES.map(() => 0);
  for (const ind of state.currentIndividuals) zoneBinCounts[argmax(ind.timeAllocation)]++;

  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  return {
    seed,
    extinct,
    extinctAt,
    finalGeneration: state.generation,
    population: state.currentIndividuals.length,
    zoneLoad,
    concentration,
    zoneBinCounts,
    ageDistribution,
    carriers,
    carriersByAge,
    carrierPrevalence: state.currentIndividuals.length > 0 ? carriers / state.currentIndividuals.length : null,
    perBin,
    nonFounderBirthCount: state.diagnostics.nonFounderBirthCount,
    bodyMutationOpportunityCount: state.diagnostics.bodyMutationOpportunityCount,
    allocationMutationOpportunityCount: state.diagnostics.allocationMutationOpportunityCount,
    allocationMutationEvents,
    lowShareTargetTransfers,
    firstAdjacencyTraversalGeneration,
    zeroAllocationFallbackCount: state.diagnostics.zeroAllocationFallbackCount,
    meanBirthsPerGeneration: mean(birthsPerGeneration),
    meanDeathsPerGeneration: mean(deathsPerGeneration),
    meanMatingPairsPerGeneration: mean(matingPairsPerGeneration),
    meanUnmatchedEligiblePerGeneration: mean(unmatchedEligiblePerGeneration),
    meanMatingOverlap: mean(overlapSamples),
    overlapPercentiles: {
      p5: percentile(overlapSamples, 5),
      p50: percentile(overlapSamples, 50),
      p95: percentile(overlapSamples, 95),
    },
    // Sampled genomes for §21.5 (populated by the caller for the first N seeds).
    sampleGenomes: null,
    _state: state,
  };
}

/** §21.5 trait-effect characterization from sampled realistic genomes. */
function traitEffectCharacterization(sampledGenomes, medianZoneLoads, config) {
  const oneHot = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const out = {};
  for (const t of MEANINGFUL_TRAIT_INDICES) {
    out[TRAITS[t]] = {};
    for (let z = 0; z < ZONES.length; z++) {
      const diffs = [];
      for (const genome of sampledGenomes) {
        const base = Array.from(genome);
        const bumped = base.slice();
        bumped[t] = Math.min(1, Math.max(0, base[t] + TRAIT_DELTA));
        if (bumped[t] === base[t]) continue; // no headroom; excluded
        const pBase = survivalProbability(
          { bodyGenome: base, timeAllocation: oneHot[z], ageGenerations: 1 }, medianZoneLoads, config
        ).pSurvival;
        const pBumped = survivalProbability(
          { bodyGenome: bumped, timeAllocation: oneHot[z], ageGenerations: 1 }, medianZoneLoads, config
        ).pSurvival;
        diffs.push(pBumped - pBase); // exact logistic difference, not a derivative
      }
      const median = diffs.length ? ordinaryMedian(diffs) : null;
      out[TRAITS[t]][ZONES[z]] = {
        n: diffs.length,
        median,
        p5: percentile(diffs, 5),
        p95: percentile(diffs, 95),
        classification:
          median === null ? "INCONCLUSIVE" : median >= 0.01 ? "helpful" : median <= -0.01 ? "harmful" : "effectively inactive",
      };
    }
  }
  // Neutral traits: exact causal difference must be zero by invariant.
  const neutral = {};
  for (const t of NEUTRAL_TRAIT_INDICES) {
    let maxAbs = 0;
    for (const genome of sampledGenomes.slice(0, 50)) {
      const base = Array.from(genome);
      const bumped = base.slice();
      bumped[t] = Math.min(1, base[t] + TRAIT_DELTA);
      for (let z = 0; z < ZONES.length; z++) {
        const d =
          survivalProbability({ bodyGenome: bumped, timeAllocation: oneHot[z], ageGenerations: 1 }, medianZoneLoads, config).pSurvival -
          survivalProbability({ bodyGenome: base, timeAllocation: oneHot[z], ageGenerations: 1 }, medianZoneLoads, config).pSurvival;
        maxAbs = Math.max(maxAbs, Math.abs(d));
      }
      // Performance dimensions must be identical too.
      const pa = performanceDimensions(base);
      const pb = performanceDimensions(bumped);
      for (let d = 0; d < pa.length; d++) maxAbs = Math.max(maxAbs, Math.abs(pa[d] - pb[d]));
    }
    neutral[TRAITS[t]] = { maxAbsoluteExactDifference: maxAbs, exactlyZero: maxAbs === 0 };
  }
  return { meaningful: out, neutral };
}

/** Execute the full declared batch. */
export function runCharacterization(opts = {}) {
  const config = opts.config || currentModelConfig;
  const seedCount = opts.seedCount || DECLARED_SEEDS;
  const generations = opts.generations || DECLARED_GENERATIONS;

  const seeds = [];
  const sampledGenomes = [];
  for (let seed = 1; seed <= seedCount; seed++) {
    const r = runSeed(seed, config, generations);
    // §21.5 declared sampling: first 25 non-extinct seeds, first 40 individuals.
    if (!r.extinct && sampledGenomes.length < 1000 && seeds.filter((s) => !s.extinct).length < 25) {
      for (const ind of r._state.currentIndividuals.slice(0, 40)) {
        sampledGenomes.push(Array.from(ind.bodyGenome));
      }
    }
    delete r._state;
    seeds.push(r);
    if (opts.onProgress && (seed % 25 === 0 || seed === seedCount)) opts.onProgress(seed, seedCount);
  }

  const nonExtinct = seeds.filter((s) => !s.extinct);
  const extinctCount = seeds.length - nonExtinct.length;
  const extinctionRate = extinctCount / seeds.length;

  const populations = nonExtinct.map((s) => s.population);
  const medianPopulation = populations.length ? ordinaryMedian(populations) : null;
  const medianZoneLoads = ZONES.map((_, z) =>
    nonExtinct.length ? ordinaryMedian(nonExtinct.map((s) => s.zoneLoad[z])) : null
  );
  const concentrationValues = nonExtinct.map((s) => s.concentration).filter((c) => c !== null);
  const medianConcentration = concentrationValues.length ? ordinaryMedian(concentrationValues) : null;

  // §21.4 guardrails.
  const guardrails = {
    extinctionRate,
    extinctionRatePass: extinctionRate < 0.05,
    medianPopulation,
    medianPopulationPass: medianPopulation !== null && medianPopulation >= 90 && medianPopulation <= 360,
    medianZoneLoads,
    medianZoneLoadsPass: medianZoneLoads.every((v) => v !== null && v >= 15),
    medianConcentration,
    medianConcentrationPass: medianConcentration !== null && medianConcentration <= 0.80,
    concentrationIncludedSeedCount: concentrationValues.length,
  };
  guardrails.allPass =
    guardrails.extinctionRatePass &&
    guardrails.medianPopulationPass &&
    guardrails.medianZoneLoadsPass &&
    guardrails.medianConcentrationPass;

  // §21.3 aggregate mutation supply by bin.
  const mutationSupply = ZONES.map((zone, z) => {
    const agg = { zone, births: 0, bodyMutationOpportunities: 0, bodyMutationEvents: 0, positiveWebbingEvents: 0, crossingWebbingEvents: 0 };
    for (const s of seeds) {
      agg.births += s.perBin[z].births;
      agg.bodyMutationOpportunities += s.perBin[z].bodyMutationOpportunities;
      agg.bodyMutationEvents += s.perBin[z].bodyMutationEvents;
      agg.positiveWebbingEvents += s.perBin[z].positiveWebbingEvents;
      agg.crossingWebbingEvents += s.perBin[z].crossingWebbingEvents;
    }
    agg.bodyMutationEventsPerBirth = agg.births > 0 ? agg.bodyMutationEvents / agg.births : null;
    agg.positiveWebbingEventsPerBirth = agg.births > 0 ? agg.positiveWebbingEvents / agg.births : null;
    return agg;
  });
  const canopyBin = mutationSupply[0];
  const shorelineBin = mutationSupply[2];
  const minimalFunctionality = {
    canopyPositiveWebbingEvent: canopyBin.positiveWebbingEvents >= 1,
    shorelinePositiveWebbingEvent: shorelineBin.positiveWebbingEvents >= 1,
  };
  minimalFunctionality.allPass =
    minimalFunctionality.canopyPositiveWebbingEvent && minimalFunctionality.shorelinePositiveWebbingEvent;

  const carrierSummary = {
    medianCarrierPrevalence: nonExtinct.length
      ? ordinaryMedian(nonExtinct.map((s) => s.carrierPrevalence ?? 0))
      : null,
    carriersAge1: seeds.reduce((a, s) => a + s.carriersByAge.age1, 0),
    carriersAge2: seeds.reduce((a, s) => a + s.carriersByAge.age2, 0),
    carriersAge3plus: seeds.reduce((a, s) => a + s.carriersByAge.age3plus, 0),
  };

  const traitEffects =
    sampledGenomes.length > 0
      ? traitEffectCharacterization(sampledGenomes, medianZoneLoads, config)
      : { meaningful: {}, neutral: {}, note: "INCONCLUSIVE: no non-extinct seeds to sample" };

  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const lifecycle = {
    meanBirthsPerGeneration: mean(seeds.map((s) => s.meanBirthsPerGeneration)),
    meanDeathsPerGeneration: mean(seeds.map((s) => s.meanDeathsPerGeneration)),
    meanMatingPairsPerGeneration: mean(seeds.map((s) => s.meanMatingPairsPerGeneration)),
    meanUnmatchedEligiblePerGeneration: mean(seeds.map((s) => s.meanUnmatchedEligiblePerGeneration)),
    meanMatingOverlap: mean(seeds.map((s) => s.meanMatingOverlap)),
    overlapP5: ordinaryMedian(seeds.map((s) => s.overlapPercentiles.p5 ?? 0)),
    overlapP95: ordinaryMedian(seeds.map((s) => s.overlapPercentiles.p95 ?? 0)),
    medianZoneBinCounts: ZONES.map((_, z) =>
      nonExtinct.length ? ordinaryMedian(nonExtinct.map((s) => s.zoneBinCounts[z])) : null
    ),
    allocationMutationEventsPerNonFounderBirth:
      seeds.reduce((a, s) => a + s.allocationMutationEvents, 0) /
      Math.max(1, seeds.reduce((a, s) => a + s.nonFounderBirthCount, 0)),
    lowShareTargetTransfers: seeds.reduce((a, s) => a + s.lowShareTargetTransfers, 0),
    seedsReachingAdjacencyTraversal: seeds.filter((s) => s.firstAdjacencyTraversalGeneration !== null).length,
    medianFirstAdjacencyTraversalGeneration: (() => {
      const v = seeds.map((s) => s.firstAdjacencyTraversalGeneration).filter((x) => x !== null);
      return v.length ? ordinaryMedian(v) : null;
    })(),
    totalZeroAllocationFallbacks: seeds.reduce((a, s) => a + s.zeroAllocationFallbackCount, 0),
  };

  const opportunityIdentityHolds = seeds.every(
    (s) =>
      s.bodyMutationOpportunityCount === s.nonFounderBirthCount &&
      s.allocationMutationOpportunityCount === s.nonFounderBirthCount
  );

  return {
    contractSection: "21",
    configVersion: config.version,
    configHash: createHash("sha256").update(canonicalStringify(config)).digest("hex"),
    declaredSeedRange: { start: 1, endInclusive: seedCount },
    declaredGenerations: generations,
    guardrails,
    mutationSupply,
    minimalFunctionality,
    carrierSummary,
    traitEffects,
    lifecycle,
    opportunityIdentityHolds,
    concentrationValues, // every seed-level value, as §21.4 requires
    seeds: seeds.map((s) => ({ ...s, perBin: s.perBin })),
  };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const at = (flag) => (args.indexOf(flag) >= 0 ? args[args.indexOf(flag) + 1] : undefined);
  const seedCount = at("--seeds") ? Number(at("--seeds")) : DECLARED_SEEDS;
  const configName = at("--config") || "v2";
  const config = configName === "v1" ? legacyModelConfigV1 : currentModelConfig;
  const out = at("--out") || `audit/characterization-results${configName === "v1" ? "-config1" : ""}.json`;

  const t0 = Date.now();
  const results = runCharacterization({
    seedCount,
    config,
    onProgress: (s, n) => process.stderr.write(`  seed ${s}/${n}\n`),
  });
  writeFileSync(out, JSON.stringify(results, null, 2));
  const g = results.guardrails;
  console.log(`characterization (${config.version}, seeds 1..${seedCount}, ${results.declaredGenerations} generations)`);
  console.log(`  extinction rate        ${(g.extinctionRate * 100).toFixed(2)}%  (need < 5%)      ${g.extinctionRatePass ? "PASS" : "FAIL"}`);
  console.log(`  median population      ${g.medianPopulation}  (need 90..360)      ${g.medianPopulationPass ? "PASS" : "FAIL"}`);
  console.log(`  median zone loads      [${g.medianZoneLoads.map((v) => v?.toFixed(1)).join(", ")}]  (need >= 15 each)  ${g.medianZoneLoadsPass ? "PASS" : "FAIL"}`);
  console.log(`  median concentration   ${g.medianConcentration?.toFixed(4)}  (need <= 0.80, n=${g.concentrationIncludedSeedCount})  ${g.medianConcentrationPass ? "PASS" : "FAIL"}`);
  console.log(`  minimal functionality  canopy=${results.minimalFunctionality.canopyPositiveWebbingEvent} shoreline=${results.minimalFunctionality.shorelinePositiveWebbingEvent}  ${results.minimalFunctionality.allPass ? "PASS" : "FAIL"}`);
  console.log(`  opportunity identity   ${results.opportunityIdentityHolds ? "PASS" : "FAIL"}`);
  console.log(`  ALL GUARDRAILS: ${g.allPass ? "PASS" : "FAIL"}   [${((Date.now() - t0) / 1000).toFixed(1)}s] -> ${out}`);
}
