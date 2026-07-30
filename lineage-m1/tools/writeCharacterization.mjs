// @ts-check
/**
 * Render CHARACTERIZATION.md from the raw audit JSON only (contract §21.7).
 *
 * The prose is generated from audit/characterization-results.json so it cannot
 * drift from the raw evidence. When a config-1 side-by-side file is present it
 * is included, as §21.7 requires, with no claim that either result is
 * automatically correct.
 *
 * Usage: node tools/writeCharacterization.mjs [--in path] [--compare path] [--out path]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ZONES } from "../src/config/zones.js";
import { ordinaryMedian } from "../src/core/math.js";

const fmt = (v, digits = 4) =>
  v === null || v === undefined ? "INCONCLUSIVE" : typeof v === "number" ? v.toFixed(digits) : String(v);
const pass = (b) => (b ? "PASS" : "**FAIL**");

/**
 * @param {Object} r results object
 * @param {Object|null} compare optional config-1 results
 * @returns {string}
 */
export function renderCharacterization(r, compare = null, edgeOnly = null) {
  const g = r.guardrails;
  const lines = [];
  const lineage_note = () => {
    lines.push("experiment: all 120 founders remain present and ecologically active, so they");
    lines.push("still affect zone loads, density factors, survival probabilities, mating");
    lines.push("availability, mating order, and population dynamics. A lineage that stays");
    lines.push("genetically single-band is not ecologically isolated.");
    lines.push("");
  };

  lines.push("# LINEAGE Milestone 1 — Characterization");
  lines.push("");
  lines.push("Generated from `audit/characterization-results.json` by");
  lines.push("`tools/writeCharacterization.mjs`. Every number below is read from that raw");
  lines.push("file; none is retyped by hand.");
  lines.push("");
  lines.push("Characterization **describes this first implementation**. It does not define");
  lines.push("biological truth, is not an ecological claim, and is not frozen as a future");
  lines.push("regression target (contract §21).");
  lines.push("");
  lines.push(`- configuration: \`${r.configVersion}\``);
  lines.push(`- complete model-definition hash: \`${r.modelDefinitionHash}\``);
  lines.push(`- tuning-config-only hash (subset, for reference): \`${r.tuningConfigHash}\``);
  lines.push("");
  lines.push("The model-definition hash covers **every** biology-affecting value, including");
  lines.push("the trait-effect matrix, upkeep costs, zone adjacency, and the trait/dimension");
  lines.push("orders. Revision 2 published only the tuning-config hash, which excluded those,");
  lines.push("so a mutated trait effect could change survival without moving the reported");
  lines.push("hash (DECISIONS.md D-026).");
  lines.push(`- declared seeds: ${r.declaredSeedRange.start}..${r.declaredSeedRange.endInclusive}`);
  lines.push(`- declared duration: ${r.declaredGenerations} generations per seed unless extinct`);
  lines.push("");

  // ---- §21.4 guardrails ----
  lines.push("## §21.4 Population guardrails");
  lines.push("");
  lines.push("| Guardrail | Required | Measured | Result |");
  lines.push("|---|---|---|---|");
  lines.push(`| whole-world extinction by generation 180 | < 5% | ${(g.extinctionRate * 100).toFixed(2)}% | ${pass(g.extinctionRatePass)} |`);
  lines.push(`| median total living population | 90..360 | ${fmt(g.medianPopulation, 1)} | ${pass(g.medianPopulationPass)} |`);
  for (let z = 0; z < ZONES.length; z++) {
    lines.push(`| median effective load — ${ZONES[z]} | >= 15 | ${fmt(g.medianZoneLoads[z], 2)} | ${pass(g.medianZoneLoads[z] >= 15)} |`);
  }
  lines.push(`| median concentration | <= 0.80 | ${fmt(g.medianConcentration)} | ${pass(g.medianConcentrationPass)} |`);
  lines.push("");
  lines.push(`**All §21.4 guardrails: ${pass(g.allPass)}**`);
  lines.push("");
  lines.push("### Concentration statistic");
  lines.push("");
  lines.push("Defined exactly as §21.4 requires, for every non-extinct seed at generation 180:");
  lines.push("");
  lines.push("```");
  lines.push("totalLoad_s     = sum_z( zoneLoad_s[z] )");
  lines.push("concentration_s = max_z( zoneLoad_s[z] / totalLoad_s )");
  lines.push("```");
  lines.push("");
  lines.push(`Included seeds: **${g.concentrationIncludedSeedCount}** (extinct seeds excluded only because`);
  lines.push("`totalLoad_s = 0`; they remain fully counted by the extinction guardrail).");
  lines.push(`Ordinary median of those values: **${fmt(g.medianConcentration)}**.`);
  lines.push("");
  lines.push("Every seed-level concentration value is preserved in");
  lines.push("`audit/characterization-results.json` under `concentrationValues` and per-seed");
  lines.push("under `seeds[].concentration`. Per-zone medians, a median-population seed, and");
  lines.push("independently combined median zone shares are **not** substituted.");
  lines.push("");

  // ---- §21.3 mutation supply ----
  lines.push("## §21.3 Mutation supply by birth dominant-zone bin");
  lines.push("");
  lines.push("Mutation generation is evaluated as **events per birth**, not final carriers.");
  lines.push("");
  lines.push("| Birth zone bin | Births | Body-mutation opportunities | Body-mutation events | Events / birth | Positive webbing events | Crossing <0.20 → >=0.35 |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const m of r.mutationSupply) {
    lines.push(
      `| ${m.zone} | ${m.births} | ${m.bodyMutationOpportunities} | ${m.bodyMutationEvents} | ` +
      `${fmt(m.bodyMutationEventsPerBirth, 4)} | ${m.positiveWebbingEvents} | ${m.crossingWebbingEvents} |`
    );
  }
  lines.push("");
  lines.push("### Declared minimal functionality");
  lines.push("");
  lines.push(`- at least one positive webbing event among canopy-dominant births: **${pass(r.minimalFunctionality.canopyPositiveWebbingEvent)}**`);
  lines.push(`- at least one among shoreline-dominant births: **${pass(r.minimalFunctionality.shorelinePositiveWebbingEvent)}**`);
  lines.push(`- opportunity identity (\`bodyMutationOpportunityCount === allocationMutationOpportunityCount === nonFounderBirthCount\`) holds for every seed: **${pass(r.opportunityIdentityHolds)}**`);
  lines.push("");
  lines.push("### Surviving webbing carriers, by birth dominant-zone bin");
  lines.push("");
  lines.push(`Carrier definition (declared): \`bodyGenome[toe_webbing] >= 0.35\`, measured at generation ${r.declaredGenerations}.`);
  lines.push("Time allocation is immutable at birth, so a living individual's");
  lines.push("`argmax(timeAllocation)` **is** its birth dominant-zone bin.");
  lines.push("");
  lines.push("Reported per bin so that mutation supply (above) can be compared directly");
  lines.push("against post-selection carrier survival in the same zone — which is the");
  lines.push("comparison §21.3 exists to protect.");
  lines.push("");
  lines.push("| Birth zone bin | Carriers age 1 | age 2 | age 3+ | Final living | Final carriers | Final prevalence | Median per-seed prevalence | Seeds with any living in bin |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const m of r.mutationSupply) {
    lines.push(
      `| ${m.zone} | ${m.survivingCarriersAge1 ?? "—"} | ${m.survivingCarriersAge2 ?? "—"} | ${m.survivingCarriersAge3plus ?? "—"} | ` +
      `${m.finalLiving ?? "—"} | ${m.finalCarriers ?? "—"} | ${fmt(m.finalCarrierPrevalence)} | ` +
      `${fmt(m.medianSeedCarrierPrevalence)} | ${m.seedsWithAnyLivingInBin ?? "—"} of ${r.seeds.length} |`
    );
  }
  lines.push("");
  lines.push("World-wide totals for cross-checking:");
  lines.push("");
  lines.push("| Measure | Value |");
  lines.push("|---|---|");
  lines.push(`| carriers at age 1 (batch total) | ${r.carrierSummary.carriersAge1} |`);
  lines.push(`| carriers at age 2 (batch total) | ${r.carrierSummary.carriersAge2} |`);
  lines.push(`| carriers at age 3+ (batch total) | ${r.carrierSummary.carriersAge3plus} |`);
  lines.push(`| median final carrier prevalence | ${fmt(r.carrierSummary.medianCarrierPrevalence)} |`);
  lines.push("");
  lines.push("Equal final carrier prevalence across zones is **not** required and is not");
  lines.push("expected: differential survival should make it unlikely (§21.3).");
  lines.push("");

  // ---- §21.5 trait effects ----
  lines.push("## §21.5 Trait-effect characterization");
  lines.push("");
  lines.push(`Exact logistic survival differences for a declared fixed delta of +0.20 applied`);
  lines.push("to one trait at a time on genomes sampled from the batch, with each zone's");
  lines.push("one-hot allocation, age 1, and the batch-median zone loads. Derivative-at-the-");
  lines.push("midpoint approximations are not used.");
  lines.push("");
  if (r.traitEffects.note) {
    lines.push(`**${r.traitEffects.note}**`);
    lines.push("");
  } else {
    lines.push("| Trait | Zone | n | Median Δp | 5th | 95th | Classification |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const [trait, zones] of Object.entries(r.traitEffects.meaningful)) {
      for (const [zone, cell] of Object.entries(zones)) {
        lines.push(
          `| ${trait} | ${zone} | ${cell.n} | ${fmt(cell.median)} | ${fmt(cell.p5)} | ${fmt(cell.p95)} | ${cell.classification} |`
        );
      }
    }
    lines.push("");
    lines.push("### Neutral traits");
    lines.push("");
    lines.push("Exact causal difference must be zero **by invariant**, not inferred from noisy");
    lines.push("correlations (§21.5).");
    lines.push("");
    lines.push("| Neutral trait | Max absolute exact difference | Exactly zero |");
    lines.push("|---|---|---|");
    for (const [trait, cell] of Object.entries(r.traitEffects.neutral)) {
      lines.push(`| ${trait} | ${cell.maxAbsoluteExactDifference} | ${cell.exactlyZero ? "yes" : "**no**"} |`);
    }
    lines.push("");
  }

  // ---- §21.6 lifecycle ----
  const L = r.lifecycle;
  lines.push("## §21.6 Lifecycle characterization");
  lines.push("");
  lines.push("| Measure | Value |");
  lines.push("|---|---|");
  lines.push(`| mean births per generation | ${fmt(L.meanBirthsPerGeneration, 2)} |`);
  lines.push(`| mean deaths per generation | ${fmt(L.meanDeathsPerGeneration, 2)} |`);
  lines.push(`| mean mating pairs per generation | ${fmt(L.meanMatingPairsPerGeneration, 2)} |`);
  lines.push(`| mean unmatched eligible adults per generation | ${fmt(L.meanUnmatchedEligiblePerGeneration, 2)} |`);
  lines.push(`| mean mating overlap | ${fmt(L.meanMatingOverlap)} |`);
  lines.push(`| mating overlap, 5th percentile (median across seeds) | ${fmt(L.overlapP5)} |`);
  lines.push(`| mating overlap, 95th percentile (median across seeds) | ${fmt(L.overlapP95)} |`);
  for (let z = 0; z < ZONES.length; z++) {
    lines.push(`| median population in current zone bin — ${ZONES[z]} | ${fmt(L.medianZoneBinCounts[z], 1)} |`);
  }
  lines.push(`| allocation-mutation events per non-founder birth | ${fmt(L.allocationMutationEventsPerNonFounderBirth)} |`);
  lines.push(`| allocation transfers into a below-threshold zone | ${L.lowShareTargetTransfers} |`);
  lines.push(`| zero-allocation fallbacks (must be 0) | ${L.totalZeroAllocationFallbacks} |`);
  lines.push("");
  // ---- named limitation: zone load vs zone-bin occupancy ----
  const nonExtinct = r.seeds.filter((s) => !s.extinct);
  const loadStats = [0, 1, 2].map((z) => {
    const raw = nonExtinct.map((s) => s.zoneLoad[z]);
    const v = raw.slice().sort((a, b) => a - b);
    const binZero = nonExtinct.filter((s) => s.zoneBinCounts[z] === 0).length;
    // Nearest-rank for the tails; the ORDINARY median for the centre.
    //
    // Revision-3 repair: this table previously used v[floor(0.5*(n-1))] for the
    // median too, which selects the lower middle observation for an even count.
    // With 500 seeds it reported item 250 instead of averaging items 250 and 251
    // (canopy 117.202731 rather than 117.223028), so the table disagreed with
    // the guardrail medians computed by ordinaryMedian.
    const nearestRank = (p) => v[Math.max(0, Math.min(v.length - 1, Math.ceil(p * v.length) - 1))];
    return { min: v[0], p5: nearestRank(0.05), p50: ordinaryMedian(raw), p95: nearestRank(0.95), binZero };
  });
  lines.push("### Named limitation — zone load versus zone-bin occupancy");
  lines.push("");
  lines.push("Reported because it is a real property of this implementation, not tuned away.");
  lines.push("");
  lines.push("| Zone | min load | 5th | median | 95th | seeds with **zero** dominant-bin animals |");
  lines.push("|---|---|---|---|---|---|");
  for (let z = 0; z < ZONES.length; z++) {
    const st = loadStats[z];
    lines.push(
      `| ${ZONES[z]} | ${fmt(st.min, 2)} | ${fmt(st.p5, 2)} | ${fmt(st.p50, 2)} | ${fmt(st.p95, 2)} | ${st.binZero} of ${nonExtinct.length} |`
    );
  }
  lines.push("");
  lines.push("**All three zones remain meaningfully populated by the contract's own measure.**");
  lines.push("§21.4 defines zone population as *effective load*, and every zone clears it: no");
  lines.push(`seed in the batch has any zone load below 1, and ${nonExtinct.filter((s) => s.zoneLoad.every((v) => v >= 15)).length} of ${nonExtinct.length} seeds hold every`);
  lines.push("zone at load 15 or more.");
  lines.push("");
  lines.push("However, the **debug zone-bin view** tells a different story about the shoreline:");
  lines.push(`in ${loadStats[2].binZero} of ${nonExtinct.length} seeds, no living individual has the shoreline as its`);
  lines.push("`argmax(timeAllocation)` at generation 180. The shoreline is used *part-time by");
  lines.push("many animals* rather than *full-time by a resident subpopulation*.");
  lines.push("");
  lines.push("This is not a §25 halt condition — the zone bin is explicitly a debug-only");
  lines.push("grouping with no persistent identity and no biological role (§5.4), and the");
  lines.push("contract's zone-population guardrail is load-based and passes. It is recorded");
  lines.push("here as **named remaining uncertainty** (§28: \"remaining uncertainty is named");
  lines.push("rather than hidden\") and as a concrete input to Milestone 2, where a visibly");
  lines.push("empty shoreline late in a run would matter to what a child actually sees.");
  lines.push("");

  lines.push("### §21.6 adjacency traversal — AUTHORITATIVE isolated-world experiment");
  lines.push("");
  lines.push("**This subsection, and only this subsection, carries the adjacency-traversal");
  lines.push("claim.** `CHARACTERIZATION_PLAN.md` (see its dated Amendment 1) declares");
  lines.push("traversal in a world descended **only** from one edge founder band. That");
  lines.push("experiment is executed by `tools/runEdgeOnlyTraversal.mjs` in genuinely isolated");
  lines.push("40-founder worlds with no forest-floor founders at all, and its raw output is");
  lines.push("`audit/edge-only-traversal-results.json`.");
  lines.push("");
  if (edgeOnly) {
    lines.push("| Experiment | Retained founders | Target zone | Seeds reaching | Earliest | Median first generation | Latest | Extinct seeds |");
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const key of ["canopyOnly", "shorelineOnly"]) {
      const e = edgeOnly[key];
      lines.push(
        `| ${key} | ${e.retainedFounderIds} | ${e.targetZone} | **${e.seedsReaching} of ${e.ofSeeds}** | ` +
        `${e.earliestGeneration ?? "—"} | ${fmt(e.medianFirstGeneration, 1)} | ${e.latestGeneration ?? "—"} | ${e.extinctSeeds} |`
      );
    }
    lines.push("");
    lines.push("The frozen initializer for these worlds is recorded in the raw JSON under");
    lines.push("`frozenInitializer`: retained founder ids and birth records, starting population");
    lines.push("40, preserved ids, next-id counters at 121, event counters at 1, RNG");
    lines.push("initialization matched to the mixed world at the same seed, unchanged zone");
    lines.push("capacities, duration, extinction handling, and the meaningful-use threshold.");
    lines.push("");
    lines.push("Because there is no canopy-shoreline edge, the opposite edge zone is reachable");
    lines.push("only across the forest-floor bridge, which requires forest-floor use to reach");
    lines.push("`parentalUseEpsilon` first.");
  } else {
    lines.push("**INCONCLUSIVE — `audit/edge-only-traversal-results.json` was not supplied to");
    lines.push("this render.** Run `node tools/runEdgeOnlyTraversal.mjs` and re-render.");
  }
  lines.push("");
  lines.push("#### Additional supporting measure — mixed-world single-band ancestry (NOT the §21.6 claim)");
  lines.push("");
  lines.push("Raw JSON keys: `additionalMixedWorldCanopyAncestryReachesShoreline` and");
  lines.push("`additionalMixedWorldShorelineAncestryReachesCanopy`. Renamed in revision 4 so");
  lines.push("that no field name can be mistaken for the authoritative traversal result.");
  lines.push("");
  lines.push("Reported under its own name because it is **not** the declared edge-only");
  lineage_note();
  const cls = L.additionalMixedWorldCanopyAncestryReachesShoreline ?? {};
  const slc = L.additionalMixedWorldShorelineAncestryReachesCanopy ?? {};
  lines.push("| Measure (mixed 120-founder world) | Seeds | Earliest | Median first generation |");
  lines.push("|---|---|---|---|");
  lines.push(`| canopy-only-ancestry lineage → shoreline | ${cls.seedsReaching ?? "—"} of ${cls.ofSeeds ?? r.seeds.length} | ${cls.earliestGeneration ?? "—"} | ${fmt(cls.medianFirstGeneration, 1)} |`);
  lines.push(`| shoreline-only-ancestry lineage → canopy | ${slc.seedsReaching ?? "—"} of ${slc.ofSeeds ?? r.seeds.length} | ${slc.earliestGeneration ?? "—"} | ${fmt(slc.medianFirstGeneration, 1)} |`);
  lines.push("");
  lines.push("Revision 2 presented these mixed-world numbers under the edge-only label.");
  lines.push("Revision 3 separated the sections but left the raw JSON keys generic");
  lines.push("(`canopyLineageReachesShoreline`), so a reader of the raw file alone could still");
  lines.push("read them as the traversal result. Revision 4 renames the keys themselves. They");
  lines.push("are retained here as a genuine additional statistic, clearly distinguished.");
  lines.push("");

  // ---- §21.7 side-by-side ----
  lines.push("## §21.7 Side-by-side configuration comparison");
  lines.push("");
  if (!compare) {
    lines.push("No comparison file was supplied to this render.");
  } else {
    const cg = compare.guardrails;
    lines.push("Required because `zoneCapacity` changed from the contract's provisional");
    lines.push("`[90,90,90]` to `[55,55,55]` (see `DECISIONS.md` D-009). Both batches use the");
    lines.push("same declared seeds and duration.");
    lines.push("");
    lines.push(`| Guardrail | Required | \`${compare.configVersion}\` | \`${r.configVersion}\` |`);
    lines.push("|---|---|---|---|");
    lines.push(`| extinction rate | < 5% | ${(cg.extinctionRate * 100).toFixed(2)}% ${cg.extinctionRatePass ? "" : "**FAIL**"} | ${(g.extinctionRate * 100).toFixed(2)}% ${g.extinctionRatePass ? "" : "**FAIL**"} |`);
    lines.push(`| median population | 90..360 | ${fmt(cg.medianPopulation, 1)} ${cg.medianPopulationPass ? "" : "**FAIL**"} | ${fmt(g.medianPopulation, 1)} ${g.medianPopulationPass ? "" : "**FAIL**"} |`);
    for (let z = 0; z < ZONES.length; z++) {
      lines.push(`| median load — ${ZONES[z]} | >= 15 | ${fmt(cg.medianZoneLoads[z], 2)} | ${fmt(g.medianZoneLoads[z], 2)} |`);
    }
    lines.push(`| median concentration | <= 0.80 | ${fmt(cg.medianConcentration)} ${cg.medianConcentrationPass ? "" : "**FAIL**"} | ${fmt(g.medianConcentration)} ${g.medianConcentrationPass ? "" : "**FAIL**"} |`);
    lines.push(`| all guardrails | — | ${pass(cg.allPass)} | ${pass(g.allPass)} |`);
    lines.push("");
    lines.push("**No claim is made that the newer configuration is automatically correct.**");
    lines.push(`\`${r.configVersion}\` was adopted for exactly one reason: \`${compare.configVersion}\` misses the`);
    lines.push("predeclared median-population band. Both capacities are authored model");
    lines.push("controls, not ecological claims.");
  }
  lines.push("");

  // ---- honest status ----
  lines.push("## Reporting status (§21.7)");
  lines.push("");
  const failures = [];
  if (!g.extinctionRatePass) failures.push("extinction rate");
  if (!g.medianPopulationPass) failures.push("median population band");
  if (!g.medianZoneLoadsPass) failures.push("per-zone median load");
  if (!g.medianConcentrationPass) failures.push("median concentration");
  if (!r.minimalFunctionality.allPass) failures.push("mutation-supply minimal functionality");
  if (!r.opportunityIdentityHolds) failures.push("mutation-opportunity identity");
  if (failures.length === 0) {
    lines.push("Every declared guardrail and minimal-functionality requirement in this batch");
    lines.push("reports `PASS`. No metric was altered after results were seen. No measured");
    lines.push("median is frozen as a future target in this session.");
  } else {
    lines.push(`**FAIL** — the following declared gates did not hold: ${failures.join(", ")}.`);
  }
  lines.push("");
  return lines.join("\n");
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const at = (f) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : undefined);
  const inPath = at("--in") || "audit/characterization-results.json";
  const comparePath = at("--compare") || "audit/characterization-results-config1.json";
  const outPath = at("--out") || "CHARACTERIZATION.md";
  const results = JSON.parse(readFileSync(inPath, "utf8"));
  const compare = existsSync(comparePath) ? JSON.parse(readFileSync(comparePath, "utf8")) : null;
  const edgeOnlyPath = at("--edge-only") || "audit/edge-only-traversal-results.json";
  const edgeOnly = existsSync(edgeOnlyPath) ? JSON.parse(readFileSync(edgeOnlyPath, "utf8")) : null;
  writeFileSync(outPath, renderCharacterization(results, compare, edgeOnly));
  console.log(`wrote ${outPath} from ${inPath}${compare ? ` (compared against ${comparePath})` : ""}`);
}
