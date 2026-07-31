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

test("§23/§27 — every SHIPPED file is bound, not a selected subset", () => {
  // REVISION-7 (Finding 3). Revision 6 recorded 20 files: named audit evidence, a
  // few generated documents and the fixture. src/, test/, tools/, the browser files
  // and the package files were never bound.
  const p = readJson("audit/provenance.json");
  assert.ok(p.files, "the record must carry a per-file map of everything shipped");
  assert.ok(p.fileCount >= 100, `far too few files recorded (${p.fileCount})`);
  for (const rel of ["src/main.js", "src/core/math.js", "src/core/simulation.js",
    "test/report-integrity.test.js", "tools/writeFinalReport.mjs", "package.json",
    "package-lock.json", "index.html", "fixtures/defining_fixture_v1.json",
    "audit/test-results.txt", "FINAL_REPORT.md"]) {
    assert.ok(p.files[rel], `${rel} must be bound by the provenance record`);
    assert.match(p.files[rel].sha256, /^[0-9a-f]{64}$/);
  }
  assert.match(p.shippedTreeDigest, /^[0-9a-f]{64}$/, "one digest must identify the whole tree");
});

test("§23/§27 — verification recomputes every recorded hash", () => {
  // The suite republishes audit/test-results.txt before this can be re-recorded, so
  // the TAP is allowed to differ HERE — and its recorded counts are still checked.
  // The delivered archive is verified strictly; see the tamper tests below.
  const r = verifyProvenance(ROOT, { tapMayDiffer: true });
  assert.deepEqual(r.mismatches, [], "a recorded hash disagrees with the shipped file");
  assert.deepEqual(r.missing, [], "the record names a file that is not here");
  assert.deepEqual(r.unrecorded, [], "a shipped file is not recorded — no undisclosed bytes");
  assert.equal(r.treeDigestMatches, true);
  assert.ok(r.checked >= 100, `too few files verified (${r.checked})`);
});

test("§23/§27 — the binding covers the model identity and the published run", () => {
  const p = readJson("audit/provenance.json");
  const char = readJson("audit/characterization-results.json");
  const summary = readJson("audit/gate-summary.json");
  assert.equal(p.model.modelDefinitionHash, char.modelDefinitionHash);
  assert.equal(p.testResults.tests, summary.suite.tests);
  assert.equal(p.testResults.pass, summary.suite.pass);
  assert.equal(p.testResults.fail, summary.suite.fail);
  assert.equal(p.testResults.boundBy, "bytes", "revision 6 bound it by counts only");
  assert.deepEqual(p.milestone, summary.milestone);
});

test("§27 — the archive hash is honestly absent and the commit claim is honest", () => {
  const p = readJson("audit/provenance.json");
  assert.equal(p.archive.sha256, null);
  assert.match(p.archive.note, /cannot contain its own hash/);
  // Revision 6 suggested `git cat-file -t <commit>`, which proves only that the
  // object exists. The record must not claim that proves tree equality.
  assert.ok(p.commitBinding, "the commit claim must be stated explicitly");
  assert.match(p.commitBinding.notClaimed, /existence of the commit object/i);
  assert.ok(!/cat-file -t/.test(JSON.stringify(p.verification)), "the misleading command must be gone");
});

/** Copy the shipped tree to a scratch directory. Nothing in ROOT is touched. */
function scratchCopy() {
  const dir = mkdtempSync(join(tmpdir(), "lineage-prov-"));
  for (const name of readdirSync(ROOT)) {
    if (name === "node_modules" || name === ".git") continue;
    cpSync(join(ROOT, name), join(dir, name), { recursive: true });
  }
  return dir;
}

test("§27 — tampering with ANY shipped file is detected", () => {
  // The four the audit named, each on its own copy: a production file, a test file,
  // a tool file, and a non-summary line of the raw TAP. Revision 6 detected none of
  // them and printed PROVENANCE OK, exit 0.
  const cases = [
    ["production source", "src/core/math.js", (t) => t + "\n// tampered\n"],
    ["test file", "test/report-integrity.test.js", (t) => t + "\n// tampered\n"],
    ["tool file", "tools/writeFinalReport.mjs", (t) => t + "\n// tampered\n"],
    ["a non-summary TAP line", "audit/test-results.txt", (t) => t.replace(/^ok 1 - .*$/m, "ok 1 - FABRICATED")],
    ["evidence", "audit/fixture-results.json", (t) => t.replace(/\}\s*$/, ', "tampered": true}')],
  ];
  for (const [label, rel, mutate] of cases) {
    const dir = scratchCopy();
    try {
      assert.equal(verifyProvenance(dir).ok, true, `${label}: the untampered copy must verify`);
      const target = join(dir, rel);
      writeFileSync(target, mutate(readFileSync(target, "utf8")));
      const after = verifyProvenance(dir);
      assert.equal(after.ok, false, `${label}: tampering with ${rel} must be detected`);
      assert.match(after.mismatches.join(" "), new RegExp(rel.replace(/[/.]/g, "\\$&")));
      assert.equal(after.treeDigestMatches, true, "the digest covers recorded hashes, not the tree on disk");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("§27 — an ADDED or REMOVED file is detected too", () => {
  const dir = scratchCopy();
  try {
    writeFileSync(join(dir, "src", "planted.js"), "// not in the record\n");
    const added = verifyProvenance(dir);
    assert.equal(added.ok, false, "an unrecorded file must fail verification");
    assert.ok(added.unrecorded.includes("src/planted.js"));
    rmSync(join(dir, "src", "planted.js"));

    rmSync(join(dir, "src", "core", "math.js"));
    const removed = verifyProvenance(dir);
    assert.equal(removed.ok, false, "a missing file must fail verification");
    assert.ok(removed.missing.includes("src/core/math.js"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("§27 — the strict path is the default; leniency is opt-in and still checks counts", () => {
  const dir = scratchCopy();
  try {
    const tapPath = join(dir, "audit", "test-results.txt");
    const original = readFileSync(tapPath, "utf8");
    writeFileSync(tapPath, original.replace(/^ok 1 - .*$/m, "ok 1 - FABRICATED"));
    assert.equal(verifyProvenance(dir).ok, false, "strict is the default");
    // Even the lenient path rejects a TAP whose COUNTS were changed.
    writeFileSync(tapPath, original.replace(/^# pass (\d+)$/m, "# pass 1"));
    const lenient = verifyProvenance(dir, { tapMayDiffer: true });
    assert.equal(lenient.ok, false, "leniency must not extend to the counts");
    assert.match(lenient.mismatches.join(" "), /recorded pass/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
