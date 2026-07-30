// @ts-check
/**
 * The §21.6 adjacency-traversal label must belong to the isolated edge-only
 * worlds, and only to them.
 *
 * Revision-4 repair. Revision 3 built the correct experiment but left three
 * inconsistencies that let a reader of one artefact reach the wrong conclusion:
 *
 *   1. `CHARACTERIZATION_PLAN.md` still asserted "The measure is now implemented
 *      literally" of the MIXED-world ancestry measure — a claim already
 *      withdrawn in `AUDIT_PACKAGE_MANIFEST.md`.
 *   2. the raw JSON keys were generic:
 *        $ python3 -c "import json;print([k for k in json.load(
 *              open('audit/characterization-results.json'))['lifecycle']
 *              if 'Reaches' in k])"
 *        ['canopyLineageReachesShoreline', 'shorelineLineageReachesCanopy']
 *      Nothing in those names says "mixed world", so a reader of the raw file
 *      alone reads them as the traversal result.
 *   3. the raw characterization file carried no pointer to the authoritative
 *      edge-only evidence.
 *
 * These tests fix the reconciliation in place. Tests 2 and 3 fail against the
 * revision-3 evidence file; test 1 fails against the revision-3 plan.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));

const MIXED_KEYS = [
  "additionalMixedWorldCanopyAncestryReachesShoreline",
  "additionalMixedWorldShorelineAncestryReachesCanopy",
];
const RETIRED_KEYS = [
  "canopyLineageReachesShoreline",
  "shorelineLineageReachesCanopy",
  "firstCanopyLineageReachesShoreline",
  "firstShorelineLineageReachesCanopy",
];

test("§21.6 — the plan's withdrawn claim is marked as withdrawn, and the original text survives", () => {
  const plan = read("CHARACTERIZATION_PLAN.md");
  // The original sentence must NOT be quietly deleted — the record has to show
  // what was claimed.
  assert.ok(
    plan.includes("The measure is now implemented literally"),
    "the original claim must remain visible in the plan, not be erased"
  );
  // But it must be marked, and the amendment must exist and be dated.
  assert.ok(
    plan.includes("[Partly withdrawn — see Amendment 1 (2026-07-30)"),
    "the withdrawn claim must carry a pointer to the dated amendment"
  );
  assert.ok(
    plan.includes("# Amendment 1 — adjacency-traversal measurement scope"),
    "the amendment section must exist"
  );
  assert.ok(
    plan.includes("Added 2026-07-30 (revision 4). Amendment, not a rewrite."),
    "the amendment must be dated and declare itself an amendment"
  );
  // The amendment must name the authoritative experiment and the demoted one.
  assert.ok(plan.includes("audit/edge-only-traversal-results.json"));
  assert.ok(plan.includes("src/fixtures/edgeOnlyWorlds.js"));
  for (const k of MIXED_KEYS) {
    assert.ok(plan.includes(k), `the amendment must document the new key ${k}`);
  }
});

test("§21.6 — the raw characterization keys name the mixed world explicitly", () => {
  const r = json("audit/characterization-results.json");
  const L = r.lifecycle;
  for (const k of MIXED_KEYS) {
    assert.ok(k in L, `lifecycle.${k} must exist`);
    assert.equal(typeof L[k].seedsReaching, "number");
    assert.equal(typeof L[k].ofSeeds, "number");
  }
  for (const k of RETIRED_KEYS) {
    assert.ok(!(k in L), `the ambiguous key lifecycle.${k} must be gone`);
  }
  // Per-seed records too — the ambiguity was in both places.
  assert.ok(Array.isArray(r.seeds) && r.seeds.length > 0);
  const s0 = r.seeds[0];
  assert.ok("firstAdditionalMixedWorldCanopyAncestryReachesShoreline" in s0);
  assert.ok("firstAdditionalMixedWorldShorelineAncestryReachesCanopy" in s0);
  for (const k of RETIRED_KEYS) {
    assert.ok(!(k in s0), `the ambiguous per-seed key ${k} must be gone`);
  }
  // No retired key may survive anywhere in the file, under any nesting.
  const text = read("audit/characterization-results.json");
  for (const k of RETIRED_KEYS) {
    assert.ok(!text.includes(`"${k}"`), `${k} must not appear anywhere in the raw file`);
  }
});

test("§21.6 — the raw characterization file points at the authoritative evidence", () => {
  const L = json("audit/characterization-results.json").lifecycle;
  assert.ok(
    typeof L.authoritativeTraversalEvidence === "string" &&
      L.authoritativeTraversalEvidence.includes("edge-only-traversal-results.json"),
    "the mixed-world measure must name the file that carries the real claim"
  );
  assert.match(L.additionalMixedWorldNote, /forest-floor founders are present/);
  assert.match(L.additionalMixedWorldNote, /Supporting observation only/);
});

test("§21.6 — the authoritative edge-only evidence exists and is genuinely isolated", () => {
  assert.ok(existsSync(join(ROOT, "audit", "edge-only-traversal-results.json")));
  const e = json("audit/edge-only-traversal-results.json");
  assert.match(e.contractSection, /21\.6/);
  // Exactly 40 founders, and they are an EDGE band — ids 1..40 (canopy) or
  // 81..120 (shoreline). Founder ids 41..80 are the forest-floor band and must
  // appear in neither world, or the world is not isolated.
  assert.equal(e.frozenInitializer.startingPopulation, 40, "each isolated world starts with 40 founders");
  assert.equal(e.canopyOnly.retainedFounderIds, "1..40");
  assert.equal(e.shorelineOnly.retainedFounderIds, "81..120");
  assert.equal(e.frozenInitializer.experiments.canopyOnly.retainedFounderIds, "1..40");
  assert.equal(e.frozenInitializer.experiments.shorelineOnly.retainedFounderIds, "81..120");
  for (const key of ["canopyOnly", "shorelineOnly"]) {
    const x = e[key];
    assert.equal(x.ofSeeds, 500, `${key} must run the declared 500 seeds`);
    assert.ok(x.seedsReaching >= 0 && x.seedsReaching <= x.ofSeeds);
    // Every per-seed record must confirm the 40-founder start, not just the header.
    assert.equal(x.seeds.length, x.ofSeeds);
    for (const s of x.seeds) {
      assert.equal(s.startingPopulation, 40, `${key} seed ${s.seed} must start with 40 founders`);
    }
  }
  assert.equal(e.canopyOnly.targetZone, "shoreline");
  assert.equal(e.shorelineOnly.targetZone, "canopy");
});

test("§21.6 — CHARACTERIZATION.md gives the traversal claim to the isolated worlds only", () => {
  const c = read("CHARACTERIZATION.md");
  const authoritative = "### §21.6 adjacency traversal — AUTHORITATIVE isolated-world experiment";
  const supporting = "#### Additional supporting measure — mixed-world single-band ancestry (NOT the §21.6 claim)";
  assert.ok(c.includes(authoritative), "the authoritative section heading must be present");
  assert.ok(c.includes(supporting), "the supporting section must disclaim the §21.6 label");
  assert.ok(
    c.indexOf(authoritative) < c.indexOf(supporting),
    "the authoritative result must be presented BEFORE the weaker supporting measure"
  );
  assert.ok(
    c.includes("**This subsection, and only this subsection, carries the adjacency-traversal"),
    "the scope of the claim must be stated in the rendered report"
  );
  // The renamed keys must be surfaced to the reader of the report too.
  for (const k of MIXED_KEYS) {
    assert.ok(c.includes(k), `${k} must be named in the report so raw and rendered agree`);
  }
});

test("§21.6 — no file USES a retired name as an identifier (history mentions are allowed)", () => {
  // The invariant is about identifiers, not about the English text. A file may
  // quote the old key to explain that it was renamed — that is exactly the record
  // an auditor needs — but nothing may still read, write, or emit it.
  const files = [
    "tools/runCharacterization.mjs",
    "tools/writeCharacterization.mjs",
    "tools/writeFinalReport.mjs",
    "audit/characterization-results.json",
    "audit/characterization-results-config1.json",
  ];
  for (const f of files) {
    if (!existsSync(join(ROOT, f))) continue;
    const text = read(f);
    for (const k of RETIRED_KEYS) {
      // Identifier uses: property access, computed access, and JSON key.
      const identifierUses = [
        new RegExp(`\\.${k}\\b`),           // obj.canopyLineageReachesShoreline
        new RegExp(`\\[\\s*["'\`]${k}["'\`]\\s*\\]`), // obj["canopy…"]
        new RegExp(`(^|[{,\\s])"${k}"\\s*:`, "m"),        // "canopy…": value
        new RegExp(`(^|[{,\\s])${k}\\s*:`, "m"),          // canopy…: value (object literal)
      ];
      for (const re of identifierUses) {
        assert.ok(
          !re.test(text),
          `${f} still USES the retired identifier ${k} (matched ${re})`
        );
      }
    }
  }
});

test("§21.6 — the retired names appear nowhere in the raw evidence, in any form", () => {
  // Raw JSON has no prose, so here the stricter rule applies: the string must be
  // absent entirely.
  for (const f of ["audit/characterization-results.json", "audit/characterization-results-config1.json"]) {
    if (!existsSync(join(ROOT, f))) continue;
    const text = read(f);
    for (const k of RETIRED_KEYS) {
      assert.ok(!text.includes(k), `${f} must not contain ${k} anywhere`);
    }
  }
});

test("§21.6 — where a retired name IS mentioned, it is marked as retired", () => {
  // Prose mentions must carry their context, or a reader could mistake the mention
  // for a live key.
  for (const f of ["tools/writeCharacterization.mjs", "tools/writeFinalReport.mjs", "tools/runCharacterization.mjs"]) {
    const text = read(f);
    for (const k of RETIRED_KEYS) {
      if (!text.includes(k)) continue;
      // Find each mention and require renaming/history language nearby.
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes(k)) continue;
        const context = lines.slice(Math.max(0, i - 4), i + 5).join(" ");
        assert.match(
          context,
          /renam|retired|Revision 3|revision 3|generic|superseded|Amendment/,
          `${f}:${i + 1} mentions ${k} without marking it as retired:\n  ${lines[i].trim()}`
        );
      }
    }
  }
});
