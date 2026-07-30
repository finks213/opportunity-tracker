// @ts-check
/**
 * The bundle must identify the source revision that produced it (revision-6
 * repair, L-1 / R6-L).
 *
 * The revision-5 structural audit's finding: the archive carried a complete file
 * inventory and its own SHA-256, but no resolved source commit, so an auditor could
 * not bind the ZIP to the branch history the repair record kept calling "committed"
 * without a separate repository lookup.
 *
 * `.git` is correctly excluded by §27, so the binding ships as evidence:
 * `audit/provenance.json` records the commit, the tree hash, the authoritative model
 * identity, and a hash and byte count for every generated report and raw evidence
 * file. `tools/verifyProvenance.mjs` recomputes all of it from an extraction.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { verifyProvenance } from "../tools/verifyProvenance.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

test("§23/§27 — the bundle carries a resolved source commit", () => {
  assert.ok(existsSync(join(ROOT, "audit", "provenance.json")), "the provenance record must ship");
  const p = readJson("audit/provenance.json");
  assert.equal(p.source.resolved, true, "the commit must be resolved, not omitted");
  assert.match(p.source.commit, /^[0-9a-f]{40}$/, "a full commit hash, not an abbreviation");
  assert.match(p.source.treeHash, /^[0-9a-f]{40}$/);
  assert.ok(p.source.branch && p.source.branch.length > 0);
  assert.ok(p.source.committedAt, "and when it was committed");
});

test("§23/§27 — every hash in the record verifies against the shipped files", () => {
  const r = verifyProvenance(ROOT);
  assert.deepEqual(r.mismatches, [], "a recorded hash disagrees with the shipped file");
  assert.deepEqual(r.missing, [], "the record names a file that is not here");
  assert.deepEqual(r.unrecorded, [], "a shipped evidence file is not recorded — no undisclosed evidence");
  assert.ok(r.checked >= 12, `too few files verified (${r.checked})`);
  assert.equal(r.ok, true);
});

test("§23/§27 — the binding covers the model identity and the published run", () => {
  const p = readJson("audit/provenance.json");
  const char = readJson("audit/characterization-results.json");
  const summary = readJson("audit/gate-summary.json");
  assert.equal(p.model.modelDefinitionHash, char.modelDefinitionHash);
  assert.equal(p.testResults.tests, summary.suite.tests);
  assert.equal(p.testResults.pass, summary.suite.pass);
  assert.equal(p.testResults.fail, summary.suite.fail);
  assert.deepEqual(p.milestone, summary.milestone, "and the derived milestone status it was built under");
});

test("§27 — every audit file is covered, and the archive hash is honestly absent", () => {
  const p = readJson("audit/provenance.json");
  for (const name of readdirSync(join(ROOT, "audit"))) {
    if (name.endsWith(".partial") || name === "provenance.json") continue;
    if (`audit/${name}` === p.testResults.path) {
      // Bound by counts rather than bytes, and the record says why.
      assert.equal(p.testResults.boundBy, "counts");
      assert.match(p.testResults.note, /wall-clock lines differ/);
      continue;
    }
    assert.ok(`audit/${name}` in p.evidence, `audit/${name} must be bound by the provenance record`);
  }
  // An archive cannot contain its own hash; the record must say so rather than
  // carry a value that could not have been computed.
  assert.equal(p.archive.sha256, null);
  assert.match(p.archive.note, /cannot contain its own hash/);
  assert.match(p.archive.name, /REV6\.zip$/);
  assert.ok(p.verification.length >= 3, "and it must tell the auditor how to check all of it");
});

test("§27 — a tampered file is detected", () => {
  // The record is only worth shipping if it fails when it should. Verified against a
  // scratch copy; nothing in the repository is modified.
  const dir = mkdtempSync(join(tmpdir(), "lineage-prov-"));
  try {
    for (const rel of ["audit", "tools", "src", "fixtures", "FINAL_REPORT.md", "CHARACTERIZATION.md",
      "AUDIT_PACKAGE_MANIFEST.md", "DECISIONS.md", "REVISION_6_REPAIR_RECORD.md", "package.json"]) {
      if (existsSync(join(ROOT, rel))) cpSync(join(ROOT, rel), join(dir, rel), { recursive: true });
    }
    assert.equal(verifyProvenance(dir).ok, true, "the untampered copy must verify");
    const target = join(dir, "audit", "fixture-results.json");
    writeFileSync(target, readFileSync(target, "utf8").replace(/\}\s*$/, ', "tampered": true}'));
    const after = verifyProvenance(dir);
    assert.equal(after.ok, false, "a modified evidence file must be detected");
    assert.match(after.mismatches.join(" "), /fixture-results\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
