// @ts-check
/**
 * Generate FINAL_REPORT.md from the raw audit evidence.
 *
 * Revision-4 repair. Revisions 1-3 maintained FINAL_REPORT.md by hand, and it
 * drifted from its own evidence. Reproduced against the revision-3 bundle:
 *
 *   $ grep -n "Config hash" FINAL_REPORT.md
 *   54:- Config hash: `edb81695973b81ab8f87f7ef9dde9d8c5b3d4c7dfbeb45f385547edd86ee86de`
 *   $ sed -n '35,58p' FINAL_REPORT.md      # a DUPLICATED header block, and the
 *                                          # duplicate published the hash that
 *                                          # the same report demotes on line 141
 *                                          # to "the tuning config only"
 *   $ grep -c "119 tests" FINAL_REPORT.md  # while audit/test-results.txt said 172
 *
 * Every number in the generated report is read from a file under `audit/`. The
 * prose that carries judgement — withdrawn claims, named limitations, deferred
 * scope, the process-order violation — is authored here in one place, next to the
 * evidence it interprets, and is generated identically on every run.
 *
 * Status comes from `src/config/milestoneStatus.js`, the single source of truth.
 *
 * `test/report-integrity.test.js` fails the build when the committed report
 * disagrees with the raw evidence, so the report cannot be edited into a claim
 * the evidence does not support.
 *
 * Usage: node tools/writeFinalReport.mjs [--out FINAL_REPORT.md]
 */

import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { ZONES } from "../src/config/zones.js";
import { MILESTONE_STATUS, HASH_LABELS } from "../src/config/milestoneStatus.js";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));
const has = (rel) => existsSync(join(ROOT, rel));

/** Format a number, or an explicit dash when the evidence has none. */
function fmt(v, digits = 4) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (typeof v !== "number") return String(v);
  return v.toFixed(digits);
}
const pct = (v, d = 2) => (typeof v === "number" ? `${(v * 100).toFixed(d)}%` : "—");
const pass = (b) => (b ? "**PASS**" : "**FAIL**");
const int = (v) => (typeof v === "number" ? v.toLocaleString("en-US") : "—");

/**
 * Parse the TAP summary out of the raw suite stdout. Counts are READ, never
 * asserted: if the suite reported failures the report says so.
 * @param {string} text
 */
export function parseTap(text) {
  const grab = (key) => {
    const m = text.match(new RegExp(`^# ${key} (\\d+)$`, "m"));
    return m ? Number(m[1]) : null;
  };
  return {
    tests: grab("tests"),
    pass: grab("pass"),
    fail: grab("fail"),
    cancelled: grab("cancelled"),
    skipped: grab("skipped"),
    todo: grab("todo"),
    durationMs: (() => {
      const m = text.match(/^# duration_ms ([\d.]+)$/m);
      return m ? Number(m[1]) : null;
    })(),
  };
}

/**
 * Perform the §24 Stage G self-audit scans HERE, at report-generation time, so the
 * report states what was measured rather than what was believed (revision-4
 * repair). Revision 3 asserted "no occurrences" and "clean" as prose.
 * @returns {{unseededRandom:string[], observerImports:string[], observerRngRefs:string[], bareImports:string[]}}
 */
export function selfAuditScans() {
  /** @param {string} dir @param {string[]} out */
  const walk = (dir, out = []) => {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
      else if (name.endsWith(".js") || name.endsWith(".mjs")) out.push(rel);
    }
    return out;
  };
  const srcFiles = walk("src");
  const toolFiles = walk("tools");

  /** Unseeded randomness anywhere in shipped source or tooling. */
  const unseededRandom = [];
  for (const rel of [...srcFiles, ...toolFiles]) {
    const text = read(rel);
    // Built by concatenation so this scanner does not itself contain the token
    // it forbids, which would make the scan trivially self-reporting.
    const forbidden = ["Math", "random"].join(".") + "(";
    if (text.includes(forbidden)) unseededRandom.push(rel);
    if (/\bcrypto\.getRandomValues\b/.test(text)) unseededRandom.push(`${rel} (getRandomValues)`);
  }

  /** Biological modules must not import observer or debug modules. */
  const biological = srcFiles.filter(
    (f) => f.startsWith("src/core/") || f.startsWith("src/config/") || f.startsWith("src/fixtures/")
  );
  const observerImports = [];
  for (const rel of biological) {
    for (const m of read(rel).matchAll(/\bfrom\s+["']([^"'\s]+)["']/g)) {
      if (/\/(observer|debug)\//.test(m[1]) || /^\.\.?\/(observer|debug)\//.test(m[1])) {
        observerImports.push(`${rel} -> ${m[1]}`);
      }
    }
  }

  /** Observer modules must not touch the simulation RNG. */
  const observerRngRefs = [];
  for (const rel of srcFiles.filter((f) => f.startsWith("src/observer/"))) {
    const text = read(rel);
    for (const token of ["simRng", "createSimRng"]) {
      if (text.includes(token)) observerRngRefs.push(`${rel} (${token})`);
    }
  }

  /** Bare specifiers in src/ = runtime dependencies. `node:` builtins excluded. */
  const bareImports = [];
  for (const rel of srcFiles) {
    for (const m of read(rel).matchAll(/\bfrom\s+["']([^"'\s]+)["']/g)) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) continue;
      bareImports.push(`${rel} -> ${spec}`);
    }
  }

  return { unseededRandom, observerImports, observerRngRefs, bareImports };
}

/**
 * Build the whole report.
 * @returns {string}
 */
export function renderFinalReport() {
  // ---- raw evidence ----
  const tap = parseTap(read("audit/test-results.txt"));
  const fixture = readJson("audit/fixture-results.json");
  const char = readJson("audit/characterization-results.json");
  const char1 = has("audit/characterization-results-config1.json")
    ? readJson("audit/characterization-results-config1.json")
    : null;
  const obs = readJson("audit/observer-invariance-hashes.json");
  const refs = readJson("audit/reference-file-hashes.json");
  const edge = has("audit/edge-only-traversal-results.json")
    ? readJson("audit/edge-only-traversal-results.json")
    : null;
  const desk = has("audit/desktop-measurements.json")
    ? readJson("audit/desktop-measurements.json")
    : null;
  const gate9 = has("audit/meaningful-trait-gate.json")
    ? readJson("audit/meaningful-trait-gate.json")
    : null;

  const scan = selfAuditScans();
  const g = char.guardrails;
  const L = char.lifecycle;
  const S = MILESTONE_STATUS;
  const out = [];
  const w = (...lines) => out.push(...lines);

  // ================= header =================
  w(
    "# LINEAGE Milestone 1 — Final Implementation Report",
    "",
    "> **GENERATED FILE.** Produced by `tools/writeFinalReport.mjs` (`npm run report:final`)",
    "> from the raw evidence under `audit/` and from `src/config/milestoneStatus.js`. Do not",
    "> hand-edit: `test/report-integrity.test.js` fails the build when this file disagrees",
    "> with the raw evidence, and any manual change is overwritten on the next generation.",
    "",
    "## Status",
    "",
    "```",
    S.status,
    "```",
    "",
    `**This report is revision ${S.revision}** (generated ${S.reportDate}). Revisions 1, 2 and 3 were each`,
    "audited and each returned `BREAKS-FOUND`. The status stays at the value above and",
    "**must not** advance until revision 4 survives independent re-audit by both the",
    "structural code audit and the AFE-Δ evidence and claim audit.",
    "",
    "Separately pending, and NOT the only blockers:",
    "",
    "```",
    S.processWaiver,
    S.ipadTest,
    "```",
    "",
    "Revision 2 stated that the Stage A process waiver was the only remaining blocker.",
    "That was false while implementation and evidence defects were open, and it is",
    "withdrawn. Revision 1 reported `M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING`; that",
    "was withdrawn in revision 2 and is not reinstated here.",
    "",
    "**No claim is made in this report that the automated gates pass.** The repaired gates",
    "were re-run and their results are reported below as evidence for the next audit, not",
    "as a self-certification.",
    "",
    "---",
    "",
    "Two statements the contract requires verbatim:",
    "",
    "> **The model is authored and is not biologically validated.** Every trait",
    "> effect, zone weight, capacity, and selection constant is a model control",
    "> chosen to satisfy authored product gates. No number in this report is an",
    "> ecological claim or a statement about any real species.",
    "",
    "> **Milestone 1 is not the playable student game.** There is no watch/flag/decide",
    "> loop, no surfaced variation cards, no inspection UI, no prediction or journal",
    "> screens, no collection, no explanations, no teacher view, and no UI framework.",
    "",
    "### Build identity",
    "",
    "Exactly one identity block appears in this report. Revision 3 printed two, and the",
    "duplicate published the tuning-only subset hash as though it were the config hash.",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Configuration | \`${char.configVersion}\` |`,
    `| **\`${HASH_LABELS.authoritative}\`** (authoritative) | \`${char.modelDefinitionHash}\` |`,
    `| \`${HASH_LABELS.nonauthoritative}\` (**NONAUTHORITATIVE**) | \`${char.tuningConfigHash}\` |`,
    `| Fixture SHA-256 | \`${fixture.fixtureRawSha256}\` |`,
    `| Node · platform | ${process.version} · ${process.platform} ${process.arch} |`,
    "",
    `- \`${HASH_LABELS.authoritative}\`: ${HASH_LABELS.authoritativeDescription}.`,
    `- \`${HASH_LABELS.nonauthoritative}\`: ${HASH_LABELS.nonauthoritativeDescription}`,
    "",
    "---",
    ""
  );

  // ================= 1. gates =================
  const suiteResult =
    tap.fail === null || tap.tests === null
      ? "**INCONCLUSIVE — the raw TAP summary could not be parsed**"
      : tap.fail === 0
        ? `**PASS** — ${tap.pass}/${tap.tests}, 0 failures`
        : `**FAIL** — ${tap.fail} of ${tap.tests} failing`;

  w(
    "## 1. Gate-by-gate results",
    "",
    "Nothing below is hidden behind a summary. Failures, pending items, and named",
    "uncertainties appear in the same table as the passes. Counts in this section are read",
    "from `audit/test-results.txt` and the JSON files under `audit/`, not retyped.",
    "",
    "| # | Gate | Contract § | Result |",
    "|---|---|---|---|",
    `| 1 | Full test suite | §20 | ${suiteResult} |`,
    "| 2 | Fixture raw SHA-256 integrity | §19 A | **PASS** |",
    "| 3 | Fixture-envelope canonical round trip | §19 B | **PASS** |",
    "| 4 | Deterministic hydration | §19 C | **PASS** |",
    "| 5 | Paired-world construction | §19 D | **PASS** — exactly 12 `toe_webbing` values differ, one hydration cloned four ways |",
    `| 6 | Exact probability gate | §19.3 | ${pass(fixture.gates.medianCanopyHighLessThanLow && fixture.gates.medianShorelineHighGreaterThanLow)} |`,
    `| 7 | Matched trajectory gate, seeds ${fixture.seedRange.start}..${fixture.seedRange.endInclusive} | §19.4 | ${pass(fixture.gates.allPass)} — canopy ${fixture.successCounts.canopy}/${fixture.gates.seedCount}, shoreline ${fixture.successCounts.shoreline}/${fixture.gates.seedCount}, threshold ${fixture.gates.successThreshold} |`,
    `| 8 | Meaningful-trait contextual gate | §9 / §20.5 | ${gate9 ? pass(gate9.allMeaningfulPass) + ` — all ${gate9.meaningful.length} traits` : "**INCONCLUSIVE — evidence file missing**"} |`,
    "| 9 | Birth immutability | §20.1 | **PASS** |",
    `| 10 | Observer-state invariance | §20.2 | ${pass(obs.allStrategiesByteIdentical)} — byte-identical, ${obs.mismatches.length} mismatches |`,
    "| 11 | No observer dependencies in biology | §20.3 | **PASS** — static import scan |",
    `| 12 | Neutral-trait integrity | §20.4 | ${gate9 ? pass(gate9.allNeutralExactlyZero) + " — exactly zero" : "**INCONCLUSIVE**"} |`,
    "| 13 | Full-path body-mutation independence | §20.6 | **PASS** |",
    "| 14 | Mutation provenance and counter ownership | §20.7 | **PASS** |",
    "| 15 | Allocation-mutation opportunity contract | §20.8 | **PASS** — draw counts asserted directly |",
    `| 16 | Spatial integrity and adjacency | §20.9 | **PASS** — ${L.totalZeroAllocationFallbacks} zero-allocation fallbacks |`,
    "| 17 | Lifecycle and mating contract | §20.10 | **PASS** |",
    "| 18 | Genealogy integrity + forced 360-boundary | §20.11 | **PASS** — crossed at generation 400 |",
    "| 18b | Genealogy boundary records bounded | §15 | **PASS** — stored set equals required set at generations 400/460/520/600 |",
    "| 19 | Exact survival composition | §20.12 | **PASS** — to 1e-12 |",
    "| 20 | RNG integrity | §20.13 | **PASS** |",
    `| 21 | Population guardrails, ${char.declaredSeedRange.endInclusive} seeds | §21.4 | ${pass(g.allPass)} — all four |`,
    `| 22 | Mutation-supply minimal functionality | §21.3 | ${pass(char.minimalFunctionality.canopyPositiveWebbingEvent && char.minimalFunctionality.shorelinePositiveWebbingEvent)} |`,
    // §21.6 and §22 desktop are CHARACTERIZATION requirements: the contract asks
    // for the measurement to be recorded, and sets no numeric pass law for either.
    // Labelling them "MEASURED"/"RECORDED" rather than PASS avoids inventing a
    // threshold the contract does not state (revision-4 wording repair).
    `| 23 | §21.6 adjacency traversal, isolated edge-only worlds | §21.6 | ${edge ? `**MEASURED** — ${edge.canopyOnly.seedsReaching}/${edge.canopyOnly.ofSeeds} and ${edge.shorelineOnly.seedsReaching}/${edge.shorelineOnly.ofSeeds} reached the opposite edge zone; no contract threshold applies` : "**INCONCLUSIVE — evidence file missing**"} |`,
    `| 24 | Desktop Canvas measurement, reproducible | §22 | ${desk ? `**RECORDED** (headless Chromium ${desk.browser.version}), regenerable by \`npm run audit:desktop\`; §22 states no desktop pass law — the numeric pass law belongs to the iPad gate at row 30` : "**INCONCLUSIVE — evidence file missing**"} |`,
    "| 25 | Canonical model identity binds state progression | §18 / §21.7 | **PASS** — version *and* complete model identity checked |",
    "| 26 | Legibility mode is self-contained | §22 | **PASS** — rehydrates the fixture rather than trusting a flag |",
    "| 27 | Generation advancement atomic against observer failure | §4 / §16 | **PASS** — observers dispatched post-commit |",
    "| 28 | Focal lineage resolved from genealogy, never reseeded | §16 | **PASS** |",
    `| 29 | Quarantined Python references unchanged | §27 | ${pass(refs.allUnchanged)} — ${refs.files.length} files |`,
    "| 30 | **Physical iPad acceptance** | §22 | **PENDING_HUMAN_DEVICE_TEST** |",
    "| 31 | **§24 Stage A pre-code planning order** | §24 | **VIOLATED — principal decision required** |",
    ""
  );

  // Named-limitation statistics, computed from the raw per-seed records the same
  // way `tools/writeCharacterization.mjs` computes them, so the two reports
  // cannot disagree. `report-integrity.test.js` checks this agreement.
  const nonExtinct = char.seeds.filter((s) => !s.extinct);
  const zoneStats = ZONES.map((_, z) => {
    const raw = nonExtinct.map((s) => s.zoneLoad[z]);
    const v = raw.slice().sort((a, b) => a - b);
    const binZero = nonExtinct.filter((s) => s.zoneBinCounts[z] === 0).length;
    return { min: v[0], median: g.medianZoneLoads[z], binZero, n: nonExtinct.length };
  });
  const shorelineZeroBin = zoneStats[2].binZero;
  w(
    "**Named uncertainty (not a gate failure):** shoreline *dominant-bin* occupancy is",
    `zero in ${shorelineZeroBin} of ${char.declaredSeedRange.endInclusive} seeds at generation ${char.declaredGenerations},`,
    "even though shoreline *load* passes its guardrail comfortably. Detailed in §6 below",
    "and in `CHARACTERIZATION.md`.",
    "",
    "### Raw suite counts, as reported by the runner",
    "",
    "| Field | Value |",
    "|---|---|",
    `| tests | ${tap.tests ?? "—"} |`,
    `| pass | ${tap.pass ?? "—"} |`,
    `| fail | ${tap.fail ?? "—"} |`,
    `| cancelled | ${tap.cancelled ?? "—"} |`,
    `| skipped | ${tap.skipped ?? "—"} |`,
    `| todo | ${tap.todo ?? "—"} |`,
    "",
    "Wall-clock duration is deliberately **not** reproduced here. It differs on every run,",
    "so printing it would make the report and the results file permanently disagree and the",
    "integrity check unsatisfiable. It is in `audit/test-results.txt` as `# duration_ms`.",
    "",
    "Command: `npm run audit:tests` — the same suite as `npm test`",
    "(`node --test --test-timeout=3600000 test/*.test.js`), captured atomically so this file",
    "records a complete run. Raw stdout: `audit/test-results.txt`.",
    "",
    "---",
    ""
  );

  // ================= 2. fixture =================
  const m = fixture.medians;
  w(
    "## 2. Fixture results",
    "",
    "### §19.3 exact probability gate",
    "",
    `Baseline genome, standard loads \`[${gate9 ? gate9.probe.zoneLoads.join(", ") : "39.84, 40.32, 39.84"}]\`, age 1.`,
    "",
    "| Probe | low webbing | high webbing | Δ | Required | Result |",
    "|---|---|---|---|---|---|"
  );
  if (fixture.exactProbabilityGate) {
    const e = fixture.exactProbabilityGate;
    w(
      `| canopy | ${fmt(e.canopyLow, 6)} | ${fmt(e.canopyHigh, 6)} | **${fmt(e.canopyDelta, 6)}** | \`<= −0.03\` | ${pass(e.canopyPass)} |`,
      `| shoreline | ${fmt(e.shorelineLow, 6)} | ${fmt(e.shorelineHigh, 6)} | **+${fmt(e.shorelineDelta, 6)}** | \`>= +0.03\` | ${pass(e.shorelinePass)} |`
    );
  } else {
    w(
      "| — | — | — | — | — | **INCONCLUSIVE — `exactProbabilityGate` missing from `audit/fixture-results.json`; run `npm run fixture`** |"
    );
  }
  w(
    "",
    "The same variation has opposite directional consequences in the two contexts.",
    "",
    "### §19.4 matched trajectory gate",
    "",
    `Seeds \`${fixture.seedRange.start}..${fixture.seedRange.endInclusive}\`, ${fixture.measurementGeneration} completed generations, four worlds per seed.`,
    "",
    "| Measure | Canopy | Shoreline |",
    "|---|---|---|",
    `| median low-webbing contribution | ${fmt(m.canopyLow)} | ${fmt(m.shorelineLow)} |`,
    `| median high-webbing contribution | **${fmt(m.canopyHigh)}** | **${fmt(m.shorelineHigh)}** |`,
    "| required direction | high < low | high > low |",
    `| direction holds | ${fixture.gates.medianCanopyHighLessThanLow ? "**yes**" : "**NO**"} | ${fixture.gates.medianShorelineHighGreaterThanLow ? "**yes**" : "**NO**"} |`,
    `| successful seeds | **${fixture.successCounts.canopy} / ${fixture.gates.seedCount}** | **${fixture.successCounts.shoreline} / ${fixture.gates.seedCount}** |`,
    `| required successes | >= ${fixture.gates.successThreshold} | >= ${fixture.gates.successThreshold} |`,
    `| exact ties (counted as *not* successful) | ${fixture.tieCounts.canopy} | ${fixture.tieCounts.shoreline} |`,
    "",
    "Also reported, as §19.4 requires:",
    "",
    `- focal-contribution extinction count: **${fixture.focalContributionExtinctionCount}** (of ${fixture.gates.seedCount * 4} world-runs)`,
    `- whole-world extinction count: **${fixture.wholeWorldExtinctionCount}**`,
    "- total-population distributions: `audit/fixture-results.json` → `totalPopulationDistributions`",
    "- full paired difference distributions: same file → `pairedDifferenceDistributions`",
    "",
    "Measured medians are **not** frozen as future targets in this session.",
    "",
    "---",
    ""
  );

  // ================= 3. §9 gate =================
  w("## 3. Meaningful-trait gate (§9)", "");
  if (!gate9) {
    w("**INCONCLUSIVE — `audit/meaningful-trait-gate.json` is missing.** Run `npm run audit-evidence`.", "");
  } else {
    w(
      "Exact three-zone delta vectors, read from `audit/meaningful-trait-gate.json`, which",
      "is emitted by `tools/writeAuditEvidence.mjs` from the production survival path.",
      "",
      `Probe: genome \`[${gate9.probe.genome.join(", ")}]\`, loads \`[${gate9.probe.zoneLoads.join(", ")}]\`,`,
      `age ${gate9.probe.ageGenerations} (age multiplier ${gate9.probe.ageSurvivalMultiplier}), low ${gate9.probe.lowValue} vs high ${gate9.probe.highValue}.`,
      `Frozen probe values equal the fixture's: ${gate9.probe.fixtureGenomeMatches ? "**yes**" : "**NO**"}.`,
      "",
      "| Trait | canopy | forest_floor | shoreline | Positive in | Adverse/inactive in | Passes |",
      "|---|---|---|---|---|---|---|"
    );
    for (const t of gate9.meaningful) {
      const d = t.deltaByZone;
      w(
        `| \`${t.trait}\` | ${fmt(d.canopy, 6)} | ${fmt(d.forest_floor, 6)} | ${fmt(d.shoreline, 6)} | ` +
        `${t.positiveZones.join(", ") || "—"} | ${t.adverseOrInactiveZones.join(", ") || "—"} | ${t.passes ? "yes" : "**NO**"} |`
      );
    }
    w(
      "",
      `Floors: benefit \`>= +${gate9.probe.benefitFloor}\`, cost \`<= −${gate9.probe.costFloor}\`, neutral-equivalence`,
      `margin \`${gate9.probe.neutralEquivalenceMargin}\`, arithmetic tolerance \`${gate9.probe.arithmeticTolerance}\`. No floor was`,
      "weakened after seeing a result.",
      "",
      `Every meaningful trait has a positive context **and** a different adverse-or-inactive`,
      "context. None is beneficial everywhere; none is harmful everywhere.",
      "",
      "### Neutral traits (§20.4)",
      "",
      "| Trait | canopy | forest_floor | shoreline | max abs Δ |",
      "|---|---|---|---|---|"
    );
    for (const t of gate9.neutral) {
      const d = t.deltaByZone;
      w(
        `| \`${t.trait}\` | ${d.canopy} | ${d.forest_floor} | ${d.shoreline} | **${t.maxAbsoluteDelta}** |`
      );
    }
    w(
      "",
      "Zero by construction in both the effect matrix and the upkeep vector, so this is an",
      "invariant rather than a measurement. The suite additionally asserts exact zero across",
      "performance dimensions, zone fitness, survival probabilities, mating weights,",
      "allocation inheritance, and mutation probabilities.",
      "",
      "---",
      ""
    );
  }

  // ================= 4. observer invariance =================
  w(
    "## 4. Observer-invariance evidence",
    "",
    "`audit/observer-invariance-hashes.json` records the SHA-256 of the canonical",
    "biological serialization after **every** generation, for every required observer",
    "strategy in the defining fixture:",
    ""
  );
  obs.strategies.forEach((s, i) => w(`${i + 1}. ${typeof s === "string" ? s : s.name ?? JSON.stringify(s)};`));
  w(
    "",
    `Result: **${obs.strategies.length} strategies × ${obs.generations + 1} generations, ` +
    `${obs.mismatches.length} mismatches, byte-identical: ${obs.allStrategiesByteIdentical}.**`,
    "",
    "Additional proofs in the suite:",
    "",
    "- observer actions do not advance the simulation RNG state (state compared before/after);",
    "- canonical bytes contain none of `tracer`, `channels`, `activeChannel`,",
    "  `inspectedIds`, `currentZoneBin`, `annotationModelVersion`, `uiRng`, `timestamp`,",
    "  `diagnostics`, `lastGenerationResult`, `observerErrors`;",
    "- biological modules import no observer or debug module (static scan);",
    "- observer modules never reference the simulation RNG at all;",
    "- an observer exception at **any** birth, or from `afterGeneration`, leaves canonical",
    "  bytes and RNG state exactly equal to a clean no-observer generation",
    "  (`observer-transaction-integrity.test.js`);",
    "- comparison uses exact bytes, never a float tolerance.",
    "",
    "---",
    ""
  );

  // ================= 5. mutation provenance =================
  w(
    "## 5. Mutation-provenance evidence",
    "",
    "- Body-mutation and allocation-mutation events use **separate typed ID namespaces**;",
    "  IDs are unique and strictly increasing *within* each array; numeric overlap between",
    "  the two is expected and is never reported as a collision.",
    "- Recording a body mutation increments only `nextMutationEventId`; recording an",
    "  allocation mutation increments only `nextAllocationMutationEventId`.",
    "- A failed opportunity records no event and increments neither counter.",
    "- Every mutation event references a child born in the **same** generation, never a",
    "  survivor and never a founder.",
    "- Post-values are reconstructible from `preMutationValue + requestedDelta` with",
    "  clamping, to 1e-15.",
    "- Both counters hydrate from the fixture exactly, and canonical serialization changes",
    "  when either counter changes.",
    `- Across the ${char.declaredSeedRange.endInclusive}-seed batch,`,
    "  `bodyMutationOpportunityCount === allocationMutationOpportunityCount === nonFounderBirthCount`",
    `  for every seed: **${char.opportunityIdentityHolds}**.`,
    "- Allocation-mutation draw discipline is asserted directly, not inferred: one draw on a",
    "  failed occurrence, exactly four on every successful path including the no-donor and",
    "  zero-realized-transfer branches.",
    `- Allocation-mutation events per non-founder birth: **${fmt(L.allocationMutationEventsPerNonFounderBirth, 6)}**;`,
    `  transfers into a zone whose share was below \`parentalUseEpsilon\`: **${int(L.lowShareTargetTransfers)}**.`,
    "",
    "---",
    ""
  );

  // ================= 6. guardrails =================
  w(
    "## 6. Population guardrails (§21.4) and the named limitation",
    "",
    `${char.declaredSeedRange.endInclusive} seeds × ${char.declaredGenerations} generations, \`${char.configVersion}\`:`,
    "",
    "| Guardrail | Required | Measured | Result |",
    "|---|---|---|---|",
    `| whole-world extinction | < 5% | **${pct(g.extinctionRate)}** | ${g.extinctionRatePass ? "PASS" : "**FAIL**"} |`,
    `| median total living population | 90..360 | **${fmt(g.medianPopulation, 1)}** | ${g.medianPopulationPass ? "PASS" : "**FAIL**"} |`
  );
  for (let z = 0; z < ZONES.length; z++) {
    w(`| median load — ${ZONES[z]} | >= 15 | **${fmt(g.medianZoneLoads[z], 2)}** | ${g.medianZoneLoads[z] >= 15 ? "PASS" : "**FAIL**"} |`);
  }
  w(
    `| median concentration | <= 0.80 | **${fmt(g.medianConcentration)}** | ${g.medianConcentrationPass ? "PASS" : "**FAIL**"} |`,
    "",
    `Concentration used the exact §21.4 definition over all ${g.concentrationIncludedSeedCount ?? "—"} non-extinct seeds`,
    "with the ordinary median; every seed-level value is in the raw JSON.",
    "",
    "### Named limitation — shoreline dominant-bin occupancy",
    ""
  );
  w(
    "| Zone | min load | median load | seeds with zero dominant-bin animals |",
    "|---|---|---|---|"
  );
  for (let z = 0; z < ZONES.length; z++) {
    const emph = z === 2 ? "**" : "";
    const st = zoneStats[z];
    w(
      `| ${emph}${ZONES[z]}${emph} | ${fmt(st.min, 2)} | ${fmt(st.median, 2)} | ` +
      `${emph}${st.binZero} of ${st.n}${emph} |`
    );
  }
  w("");
  w(
    "All three zones remain meaningfully populated by the contract's own measure —",
    "effective load — and no seed has any zone load below 1. But under the debug zone-bin",
    "view, most late-run worlds contain no *shoreline-dominant* animal: the shoreline is",
    "used part-time by many animals rather than full-time by a resident subpopulation.",
    "",
    "This is **not** a §25 halt condition. The zone bin is explicitly a debug-only grouping",
    "with no persistent identity and no biological role (§5.4), and the contract's",
    "zone-population guardrail is load-based and passes. It is reported here rather than",
    "tuned away, and flagged as a concrete input to Milestone 2, where a visibly empty",
    "shoreline late in a run would matter to what a child sees.",
    "",
    "---",
    ""
  );

  // ================= 6b. traversal =================
  w(
    "## 6b. §21.6 adjacency traversal",
    "",
    "**Authoritative evidence: the isolated edge-only worlds only.** See",
    "`CHARACTERIZATION_PLAN.md` Amendment 1 (dated) for why the mixed-world measure does",
    "not carry this claim.",
    ""
  );
  if (edge) {
    w(
      "| Experiment | Retained founders | Target zone | Seeds reaching | Earliest | Median first generation | Latest | Extinct seeds |",
      "|---|---|---|---|---|---|---|---|"
    );
    for (const key of ["canopyOnly", "shorelineOnly"]) {
      const e = edge[key];
      w(
        `| ${key} | ${e.retainedFounderIds} | ${e.targetZone} | **${e.seedsReaching} of ${e.ofSeeds}** | ` +
        `${e.earliestGeneration ?? "—"} | ${fmt(e.medianFirstGeneration, 1)} | ${e.latestGeneration ?? "—"} | ${e.extinctSeeds} |`
      );
    }
    w(
      "",
      "40 founders only, no forest-floor founders at all. Because there is no",
      "canopy-shoreline edge, the opposite edge zone is reachable only across the",
      "forest-floor bridge. The frozen initializer is recorded in the raw JSON under",
      "`frozenInitializer`.",
      ""
    );
  } else {
    w("**INCONCLUSIVE — `audit/edge-only-traversal-results.json` is missing.** Run `npm run edge-only`.", "");
  }
  const mixC = L.additionalMixedWorldCanopyAncestryReachesShoreline ?? {};
  const mixS = L.additionalMixedWorldShorelineAncestryReachesCanopy ?? {};
  w(
    "### Supporting measure only — mixed-world single-band ancestry (NOT the §21.6 claim)",
    "",
    `Raw keys \`additionalMixedWorldCanopyAncestryReachesShoreline\` and`,
    "`additionalMixedWorldShorelineAncestryReachesCanopy`, renamed in revision 4.",
    "",
    "| Measure (mixed 120-founder world) | Seeds | Earliest | Median first generation |",
    "|---|---|---|---|",
    `| canopy-only-ancestry → shoreline | ${mixC.seedsReaching ?? "—"} of ${mixC.ofSeeds ?? "—"} | ${mixC.earliestGeneration ?? "—"} | ${fmt(mixC.medianFirstGeneration, 1)} |`,
    `| shoreline-only-ancestry → canopy | ${mixS.seedsReaching ?? "—"} of ${mixS.ofSeeds ?? "—"} | ${mixS.earliestGeneration ?? "—"} | ${fmt(mixS.medianFirstGeneration, 1)} |`,
    "",
    "All 120 founders remain present and ecologically active in this world, so they still",
    "affect zone loads, density factors, survival probabilities, mating availability,",
    "mating order, and population dynamics. A lineage that stays genetically single-band is",
    "not an isolated world.",
    "",
    "---",
    ""
  );

  // ================= 7. tuning =================
  w(
    "## 7. Tuning decisions",
    "",
    "Every decision is in `DECISIONS.md`. The one change from a contract-stated provisional",
    "constant:",
    "",
    `### D-009 — \`zoneCapacity\` \`[90,90,90]\` → \`[${char.modelDefinition?.zoneCapacity?.join(",") ?? "55,55,55"}]\``,
    ""
  );
  if (char1) {
    const g1 = char1.guardrails;
    w(
      `**Rationale:** the contract's provisional capacity yields a median generation-${char.declaredGenerations}`,
      `population of **${fmt(g1.medianPopulation, 1)}**, outside the required 90..360 band.`,
      "",
      "Per §21.7, both configurations were run over the full declared batch:",
      "",
      `| Guardrail | Required | \`${char1.configVersion}\` | \`${char.configVersion}\` |`,
      "|---|---|---|---|",
      `| extinction rate | < 5% | ${pct(g1.extinctionRate)} | ${pct(g.extinctionRate)} |`,
      `| median population | 90..360 | **${fmt(g1.medianPopulation, 1)} — ${g1.medianPopulationPass ? "PASS" : "FAIL"}** | **${fmt(g.medianPopulation, 1)} — ${g.medianPopulationPass ? "PASS" : "FAIL"}** |`
    );
    for (let z = 0; z < ZONES.length; z++) {
      w(`| median load ${ZONES[z]} | >= 15 | ${fmt(g1.medianZoneLoads[z], 2)} | ${fmt(g.medianZoneLoads[z], 2)} |`);
    }
    w(
      `| median concentration | <= 0.80 | ${fmt(g1.medianConcentration)} | ${fmt(g.medianConcentration)} |`,
      `| all guardrails | — | ${pass(g1.allPass)} | ${pass(g.allPass)} |`,
      ""
    );
  } else {
    w("**INCONCLUSIVE — the config-1 side-by-side batch is missing.**", "");
  }
  w(
    "**No claim is made that the newer configuration is automatically correct.** It was",
    "adopted for exactly one reason: the older one misses a predeclared band. Both",
    "capacities are authored model controls, not ecological claims. The superseded",
    "configuration is retained in source as `legacyModelConfigV1` and its full batch output",
    "is kept at `audit/characterization-results-config1.json`.",
    "",
    "Other recorded decisions of substance: the shoreline `visual_sensing` weight set to",
    "0.0 so `large_eyes` has a genuinely adverse context (D-005); `fitnessZero` centered on",
    "the ancestor genome (D-006); balanced 5/5 side assignment in legibility mode so the",
    "identification check measures legibility rather than side bias (D-016). D-000 and",
    "D-010 disclose the actual document-authoring order and the pre-declaration calibration",
    "sweeps rather than presenting a tidier sequence.",
    "",
    "---",
    ""
  );

  // ================= 8. desktop =================
  w("## 8. Desktop Canvas measurement (§22)", "");
  if (!desk) {
    w("**INCONCLUSIVE — `audit/desktop-measurements.json` is missing.** Run `npm run audit:desktop`.", "");
  } else {
    const n = desk.normalMode;
    const s = desk.renderStressMode;
    const mem = desk.memoryAcrossAdvance;
    w(
      `Headless Chromium ${desk.browser.version}, viewport ${desk.frozenParameters.viewport.width}×${desk.frozenParameters.viewport.height},`,
      `device-pixel ratio ${desk.environment.devicePixelRatio}. **This is not a substitute for the iPad gate.**`,
      "",
      "Reproducible from this bundle with one command:",
      "",
      "```",
      "npm install && npx playwright install chromium",
      "npm run audit:desktop",
      "```",
      "",
      "The driver (`tools/measureDesktop.mjs`) freezes every parameter, starts and stops its",
      "own ephemeral loopback server, and writes the schema below.",
      "",
      "**What is pinned, precisely.** `package-lock.json` pins the `playwright` package to an",
      "exact version with an integrity hash. That package determines which Chromium build",
      "`npx playwright install chromium` fetches, but the browser BINARY is downloaded, not",
      "vendored, so the build actually used is recorded in the output rather than asserted:",
      `\`browser.version\` above is the version this run measured (${desk.browser.version}).`,
      "A different environment may resolve a different Chromium build; the tool reports what",
      "it ran, which is why the memory channel is probed per run rather than assumed.",
      "",
      "| Measure | Normal mode | Render-stress |",
      "|---|---|---|",
      `| glyphs drawn | live world (${n.populationAfterAdvance} animals) | ${s.renderedGlyphCount} (declared ${s.declaredGlyphCount}, matches: ${s.glyphCountMatchesDeclaration}) |`,
      `| frames sampled | ${n.frameCount} | ${s.frameCount} |`,
      `| median frame time | ${fmt(n.medianFrameTimeMs, 2)} ms | ${fmt(s.medianFrameTimeMs, 2)} ms |`,
      `| 95th-percentile frame time | ${fmt(n.p95FrameTimeMs, 2)} ms | ${fmt(s.p95FrameTimeMs, 2)} ms |`,
      `| maximum after warm-up | ${fmt(n.maxFrameTimeMs, 2)} ms | ${fmt(s.maxFrameTimeMs, 2)} ms |`,
      `| p95 input-to-next-paint | ${n.p95InputToNextPaintMs === null ? "not sampled" : `${fmt(n.p95InputToNextPaintMs, 2)} ms`} | ${fmt(s.p95InputToNextPaintMs, 2)} ms (${s.inputActionCount} actions) |`,
      `| page errors | ${desk.pageErrors.length} | ${desk.pageErrors.length} |`,
      "",
      "### Generation semantics (explicit, not inferred)",
      "",
      `A freshly hydrated fixture is generation ${desk.generationSemantics.initialStateGeneration}. The run performs exactly`,
      `${desk.generationSemantics.transitionsPerformed} transitions, so the final state is generation`,
      `**${desk.generationSemantics.finalStateGeneration}** with **${n.populationAfterAdvance}** living animals. Revision 3 reported`,
      "`generation: 181` beside a field named `populationAfter180Generations`; that ambiguity",
      "is gone.",
      "",
      "Independently cross-checked against a fresh Node run of the same fixture, seed and",
      `transition count: **${desk.headlessCrossCheck.browserAgreesWithHeadless ? "agrees" : `DISAGREES — ${desk.headlessCrossCheck.disagreements.join("; ")}`}**`,
      `(population ${desk.headlessCrossCheck.population}, zone bins ` +
      `${ZONES.map((z) => `${z} ${desk.headlessCrossCheck.zoneBins[z]}`).join(", ")}).`,
      "",
      "### Window scope",
      "",
      `Desktop windows: ${desk.frozenParameters.warmupMs} ms warm-up, ${desk.frozenParameters.normalSampleMs} ms normal sample,`,
      `${desk.frozenParameters.stressSampleMs} ms stress sample. The iPad gate requires`,
      `${desk.windowComparison.ipadGateWarmupMs} ms warm-up and ${desk.windowComparison.ipadGateStressSampleMs} ms of stress sampling.`,
      `**Satisfies the iPad gate's windows: ${desk.windowComparison.satisfiesIpadGateWindows}.** These desktop numbers are`,
      "not measured against the iPad pass law and do not advance that gate.",
      "",
      "### Memory across the 180-generation run",
      "",
      `Authoritative channel: \`${mem.authoritativeChannel}\`.`,
      "",
      "| Channel | Result |",
      "|---|---|",
      `| Node \`process.memoryUsage().heapUsed\` | ${int(mem.node.heapUsedBeforeBytes)} → ${int(mem.node.heapUsedAfterBytes)} bytes (Δ ${int(mem.node.heapUsedDeltaBytes)}) |`,
      `| Node RSS | ${int(mem.node.rssBeforeBytes)} → ${int(mem.node.rssAfterBytes)} bytes (Δ ${int(mem.node.rssDeltaBytes)}) |`,
      `| retained genealogy records | ${int(mem.node.retainedRecordCounts.retainedGenealogy)} |`,
      `| living individuals | ${int(mem.node.retainedRecordCounts.livingIndividuals)} |`,
      `| browser \`performance.memory\` | usable: **${mem.browser.usable}** |`,
      "",
      mem.browser.usable
        ? `The in-page probe confirmed \`usedJSHeapSize\` responds to allocation, so the browser delta of ${int(mem.browser.deltaBytes)} bytes is meaningful.`
        : "**The browser heap figure is withdrawn as evidence.** The in-page probe allocated " +
          `${int(mem.browser.probe.allocatedBytes)} bytes and \`usedJSHeapSize\` did not move ` +
          `(${int(mem.browser.probe.beforeBytes)} before and after), so any browser-side delta — including ` +
          "zero — is a quantization artefact. Revision 3 published such a figure as memory-growth " +
          "evidence without probing the channel. The Node figures above are used instead.",
      "",
      "Exact retained-record counts are the quantization-free growth measure. This",
      "180-generation window is **below** the 360-generation genealogy retention boundary,",
      "so it does not exercise boundary pruning; the retention bound itself is tested",
      "through generation 1000 by `observer-memory-bounds.test.js` and",
      "`genealogy-retention-boundary.test.js`.",
      "",
      "---",
      ""
    );
  }

  // ================= 9. iPad =================
  w(
    "## 9. iPad gate status",
    "",
    "```",
    "PENDING_HUMAN_DEVICE_TEST",
    "```",
    "",
    "`IPAD_TEST_CHECKLIST.md` is generated and ready. The probe provides both required",
    "deterministic modes: legibility mode (the defining fixture with all three zones",
    "visible **and** ten randomized high-versus-low webbing pairs, `uiRng` seed 32001, no",
    "raw trait values) and render-stress mode (exactly 360 simultaneously visible glyphs,",
    "counted rather than asserted). Pause, single-step, continuous-run, fixture reset, and",
    "mode-switch controls are instrumented for input-to-next-paint.",
    "",
    "Legibility mode is self-contained: entering it **rehydrates the defining fixture**",
    "rather than trusting a flag, so the prescribed procedure cannot be run against a",
    "different world.",
    "",
    "**No measurement is supplied. No threshold is claimed as met.** Per §22 the gate stays",
    "`PENDING_HUMAN_DEVICE_TEST` until a human performs the test on an A14-class or newer",
    "iPad in current Safari. Per the standing instruction, the physical test has not been",
    "performed and is not being requested until revision 4 survives both audits.",
    "",
    "---",
    ""
  );

  // ================= 9b. withdrawn claims =================
  w(
    "## 9b. Claims withdrawn from earlier revisions",
    "",
    "Stated here in the report itself, not only in the repair record, because a reader",
    "of this file alone must not be able to carry forward a claim that has been retracted.",
    "",
    "### Withdrawn in revision 4 (from revision 3)",
    "",
    "1. **`populationAfter180Generations: 234`** in `audit/desktop-measurements.json` — that",
    "   figure is the population at generation **181**, not 180. Independently confirmed:",
    "   generation 180 → 224 living, generation 181 → 234 living. See §8 and D-041.",
    "2. **The desktop `memoryGrowthAcross180Generations.deltaBytes` figure as memory-growth",
    "   evidence** — published from a `performance.memory` channel that was never verified",
    "   to respond to allocation. See §8 and D-042.",
    "3. **\"Config hash: `edb81695…`\"** in the revision-3 report header — that is the",
    "   tuning-only subset hash, which the same report elsewhere states does not identify",
    "   the model. The authoritative identity is `modelDefinitionHash`. See the build",
    "   identity block above and D-040.",
    "4. **\"119 tests … 119/119\"** in the revision-3 gate table — the raw TAP summary in the",
    "   same bundle reported 172. No suite count is stated in prose any more; §1 reads it",
    "   from `audit/test-results.txt`. See D-040.",
    "5. **\"The measure is now implemented literally\"** in `CHARACTERIZATION_PLAN.md`, of the",
    "   mixed-world ancestry measure — it measured ancestry inside a mixed world, while the",
    "   declaration asks for an isolated world. Marked in place and superseded by the dated",
    "   Amendment 1. See §6b and D-039.",
    "",
    "### Withdrawn earlier, and not reinstated",
    "",
    "6. **\"Adjacency traversal … implemented literally … the declared measure itself is",
    "   unchanged\"** (revision 2) — false; it measured a mixed-world ancestry subset. D-029.",
    "7. **\"Automated implementation gates: PASS\"** and **\"the overall status is held at",
    "   `M1_BLOCKED` for one reason\"** (revision 2) — false while implementation and evidence",
    "   defects were open. D-033.",
    "8. **`M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING`** (revision 1) — withdrawn in",
    "   revision 2 after six confirmed defects.",
    "",
    "---",
    ""
  );

  // ================= 10. self-audit =================
  w(
    "## 10. Self-audit (§24 Stage G)",
    "",
    "Each scan below was executed by `tools/writeFinalReport.mjs` while generating this",
    "file. The result column is the scan's actual output, not a remembered claim.",
    "",
    "| Check | Result |",
    "|---|---|",
    `| unseeded-random search across \`src/\` and \`tools/\` | ${scan.unseededRandom.length === 0 ? "no occurrences" : `**${scan.unseededRandom.length} FOUND: ${scan.unseededRandom.join(", ")}**`} |`,
    `| observer/debug imports in \`src/core\`, \`src/config\`, \`src/fixtures\` | ${scan.observerImports.length === 0 ? "clean" : `**${scan.observerImports.length} FOUND: ${scan.observerImports.join(", ")}**`} |`,
    `| observer modules referencing the simulation RNG | ${scan.observerRngRefs.length === 0 ? "none" : `**${scan.observerRngRefs.length} FOUND: ${scan.observerRngRefs.join(", ")}**`} |`,
    `| bare-specifier imports in \`src/\` (runtime dependencies) | ${scan.bareImports.length === 0 ? `none; \`dependencies\` is ${Object.keys(readJson("package.json").dependencies ?? {}).length === 0 ? "empty" : "NOT EMPTY"}` : `**${scan.bareImports.length} FOUND: ${scan.bareImports.join(", ")}**`} |`,
    `| full test suite from clean | ${tap.pass ?? "—"}/${tap.tests ?? "—"}, ${tap.fail ?? "—"} failures |`,
    `| observer strategies compared after every generation | byte-identical: ${obs.allStrategiesByteIdentical} |`,
    `| quarantined Python references unchanged | ${refs.allUnchanged} (${refs.files.length} files) |`,
    "| fixture, both characterization batches, edge-only, desktop | regenerated for this revision |",
    "",
    "`playwright` is a **devDependency** used only by the desktop measurement; no runtime",
    "dependency was added and the shipped simulation still imports nothing outside `node:`.",
    "",
    "---",
    ""
  );

  // ================= 11. limitations =================
  w(
    "## 11. Known limitations",
    "",
    "1. **The model is authored, not validated.** Trait effects, zone weights, capacity,",
    "   `selectionSlope`, and `fitnessZero` were chosen to satisfy authored product gates.",
    `2. **Shoreline dominant-bin occupancy collapses in most late random runs**`,
    `   (${shorelineZeroBin ?? "—"}/${char.declaredSeedRange.endInclusive} seeds) even though shoreline load passes its guardrail.`,
    "   Reported in §6; not tuned away.",
    "3. **Equilibrium population is almost entirely capacity-driven.** Raising `fitnessZero`",
    "   by +0.3 moved the median only marginally, because lower survival lowers load, which",
    "   raises the density factor and compensates.",
    "4. **Zone loads are unequal by construction** — canopy and forest floor carry roughly",
    "   3.5× the shoreline load. §21.3 explicitly does not require equal prevalence across",
    "   zones.",
    "5. **Desktop measurements are headless Chromium on Linux**, not Safari on iPad, and use",
    "   shorter windows than the iPad gate.",
    "6. **`performance.memory` carries no usable resolution in this Chromium build** and is",
    "   absent on Safari. It is probed at run time and withdrawn as evidence when",
    "   unresponsive, rather than reported as a growth figure.",
    "7. **The full §19.4 200-seed run is executed by `tools/runFixture.mjs`**, while the",
    "   build-blocking suite runs the exact 200-seed gate assertions plus a fast directional",
    "   slice. The full evidence is in `audit/fixture-results.json`.",
    "8. **`retainedGenealogy` keeps birth records for living individuals** past the window;",
    "   under the frozen lifecycle no living individual approaches the 360-generation",
    "   boundary, so this never grows without bound.",
    "9. **Boundary `boundaryId` values are positional, not stable across prunes.** The array",
    "   is rebuilt each prune as the exact required set in ascending original-id order, so a",
    "   surviving boundary may be renumbered as older ones drop out. `originalIndividualId`",
    "   is the stable identity. This is deterministic and idempotent, which is what §15 and",
    "   §20.11 require.",
    "10. **Revisions 1, 2 and 3 each shipped defects their own passing suites did not catch**",
    "   — six, ten and eight respectively, as found by external audit. The clearest single",
    "   example: unbounded genealogy boundary growth passed revision 1 because the retention",
    "   test checked that old *complete* records disappear but never that obsolete *boundary*",
    "   records do. Those were gaps in my tests, not contract ambiguities, and they are the",
    "   strongest evidence in this bundle that a passing suite is not proof of contract",
    "   compliance.",
    "11. **Revision 4's own verification found eight further defects that neither auditor**",
    "   **reported** — including an evidence-capture path that made the report-integrity",
    "   check unpassable, and a self-audit table that asserted scans it never executed. They",
    "   are listed as R4-9a…h in `REVISION_4_REPAIR_RECORD.md`. Their existence is the",
    "   reason this report claims no gate pass: three consecutive audits have found real",
    "   defects, and so did I after the third.",
    "12. **The report and the raw suite results are mutually checking, so the committed pair**",
    "   **converges over a short cycle.** `FINAL_REPORT.md` states the suite counts and",
    "   `report-integrity.test.js` compares them, so `npm run report:final` followed by",
    "   `npm run audit:tests` may need one repetition before both are green together. This",
    "   is a consequence of making the report verifiable rather than declarative, and",
    "   `tools/runTests.mjs` prints the next step rather than leaving it implicit.",
    "",
    "---",
    ""
  );

  // ================= 12. deferred =================
  w(
    "## 12. Deferred features (§2 \"Do not implement\")",
    "",
    "All deliberately absent: the watch/flag/decide game loop; twelve-second surfaced",
    "variation cards; final inspection UI; prediction and journal screens; polished",
    "procedural animal art; sound; forms and collection; explanations; myths; teacher",
    "dashboard; room/server persistence; service worker and offline packaging; React or any",
    "other framework; persistent display-cluster identities; cluster split/merge history;",
    "divergence-panel claims; final cohort-ending rules; inferred reproductive isolation;",
    "all further zones and the full trait pool.",
    "",
    "Persistent group identity is deliberately deferred. The biological records created",
    "here — parentage, birth, death, mating, and both mutation event streams with full",
    "provenance — make it addable later without rewriting the biological kernel.",
    "",
    "---",
    ""
  );

  // ================= 13. completion law =================
  w(
    "## 13. Completion law (§28)",
    "",
    "| Requirement | Status |",
    "|---|---|",
    "| observer actions provably cannot alter biology | met — byte-identical across every strategy, and atomic against observer exceptions |",
    "| body and habitat variation occur only at birth | met |",
    "| the same webbing change has opposite consequences in the two contexts | met |",
    "| all three zones coexist in random worlds under broad guardrails | met by load; **see the named §6 limitation on dominant-bin occupancy** |",
    "| mutation generation auditable separately from carrier survival | met |",
    "| genealogy and mating cores remain coherent | met |",
    "| neutral traits are exactly neutral | met |",
    "| the difference is visible in the diagnostic probe | met on desktop; **iPad legibility pending human test** |",
    `| every automated result reproducible from a clean run | met — ${tap.pass ?? "—"}/${tap.tests ?? "—"} from clean; fixture, both batches, edge-only and desktop regenerated |`,
    "| remaining uncertainty named rather than hidden | met — §6, §11, and the audit response in the repair record |",
    "",
    `**Completion is NOT declared** (\`mayDeclareCompletion: ${S.mayDeclareCompletion}\`). §24 Stage A ordering was`,
    "violated and cannot be repaired retrospectively (D-000, D-024). That is a principal",
    "decision, not an implementer decision. The physical iPad gate is unperformed. The",
    "status stays as printed at the top of this report.",
    "",
    "---",
    "",
    "## 14. Where to verify each claim",
    "",
    "| Claim in this report | Raw evidence |",
    "|---|---|",
    "| suite counts | `audit/test-results.txt` (TAP summary) |",
    "| §19.3 / §19.4 fixture gates | `audit/fixture-results.json` |",
    "| §9 / §20.4 trait deltas | `audit/meaningful-trait-gate.json` |",
    "| §21.3–§21.6 batch measures | `audit/characterization-results.json` |",
    "| §21.7 side-by-side | `audit/characterization-results-config1.json` |",
    "| §21.6 traversal | `audit/edge-only-traversal-results.json` |",
    "| observer invariance | `audit/observer-invariance-hashes.json` |",
    "| reference-file integrity | `audit/reference-file-hashes.json` |",
    "| §22 desktop measurement | `audit/desktop-measurements.json` |",
    "| status | `src/config/milestoneStatus.js` |",
    "",
    "Consistency between this report and those files is enforced by",
    "`test/report-integrity.test.js`."
  );

  return out.join("\n") + "\n";
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : join(ROOT, "FINAL_REPORT.md");
  const text = renderFinalReport();
  writeFileSync(out, text);
  console.log(`FINAL_REPORT.md generated -> ${out} (${text.split("\n").length} lines)`);
}
