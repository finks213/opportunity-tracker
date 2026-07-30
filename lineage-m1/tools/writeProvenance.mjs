// @ts-check
/**
 * Bind the delivered bundle to the source revision that produced it
 * (revision-6 repair, L-1 / R6-L).
 *
 * The revision-5 structural audit's finding: the bundle supplied a complete archive
 * hash and file inventory but no resolved source commit, so an auditor could not
 * bind the ZIP to the claimed branch history without a separate repository lookup —
 * while the repair record repeatedly called its tests and results "committed".
 *
 * `.git` is not shipped (contract §27 excludes it), so the binding travels as
 * evidence instead: the resolved commit, the tree hash, the authoritative model
 * identity, and a hash and byte count for every generated report and raw evidence
 * file. Anything an auditor can recompute from the extracted bundle is recorded
 * here; the one value that cannot live inside the archive is the archive's own
 * SHA-256, which is published with the delivery and recorded in
 * REVISION_6_REPAIR_RECORD.md.
 *
 * Usage: node tools/writeProvenance.mjs
 * Writes audit/provenance.json
 */

import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

/** SHA-256 and byte count of one repo-relative file. */
function fileRecord(rel) {
  const bytes = readFileSync(join(ROOT, rel));
  return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

/** Every file under a directory, repo-relative, sorted. */
function filesUnder(rel) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(join(ROOT, d)).sort()) {
      const child = `${d}/${name}`;
      if (statSync(join(ROOT, child)).isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk(rel);
  return out;
}

/** Resolve git facts, or record plainly that they were unavailable. */
function gitFacts() {
  const run = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  try {
    const commit = run(["rev-parse", "HEAD"]);
    const dirty = run(["status", "--porcelain"]);
    return {
      resolved: true,
      commit,
      shortCommit: commit.slice(0, 12),
      branch: run(["rev-parse", "--abbrev-ref", "HEAD"]),
      treeHash: run(["rev-parse", "HEAD^{tree}"]),
      committedAt: run(["log", "-1", "--format=%cI"]),
      workingTreeClean: dirty === "",
      uncommittedPaths: dirty === "" ? [] : dirty.split("\n").map((l) => l.trim()),
    };
  } catch (err) {
    return { resolved: false, reason: String(err && err.message ? err.message : err) };
  }
}

export function buildProvenance() {
  const git = gitFacts();
  const evidence = {};
  for (const rel of filesUnder("audit")) {
    if (rel.endsWith(".partial") || rel.endsWith("provenance.json")) continue;
    evidence[rel] = fileRecord(rel);
  }
  const generated = {};
  for (const rel of ["FINAL_REPORT.md", "CHARACTERIZATION.md", "AUDIT_PACKAGE_MANIFEST.md",
    "REVISION_6_REPAIR_RECORD.md", "DECISIONS.md"]) {
    if (existsSync(join(ROOT, rel))) generated[rel] = fileRecord(rel);
  }
  const fixture = fileRecord("fixtures/defining_fixture_v1.json");
  const gateSummary = JSON.parse(readFileSync(join(ROOT, "audit", "gate-summary.json"), "utf8"));
  const charEvidence = JSON.parse(readFileSync(join(ROOT, "audit", "characterization-results.json"), "utf8"));

  return {
    schema: "lineage-m1-provenance-1",
    contractSection: "23 / 27 (delivery and audit evidence)",
    purpose:
      "Bind this bundle to the source revision that produced it, without shipping .git. Every value " +
      "below is recomputable from the extracted bundle except `source.commit`, which is what the " +
      "binding exists to supply.",
    source: git,
    model: {
      configVersion: charEvidence.configVersion,
      modelDefinitionHash: charEvidence.modelDefinitionHash,
      note: "the authoritative complete-model identity; every evidence file must carry this value",
    },
    fixture: { path: "fixtures/defining_fixture_v1.json", ...fixture },
    testResults: {
      path: "audit/test-results.txt",
      ...fileRecord("audit/test-results.txt"),
      tests: gateSummary.suite.tests,
      pass: gateSummary.suite.pass,
      fail: gateSummary.suite.fail,
    },
    milestone: gateSummary.milestone,
    generated,
    evidence,
    archive: {
      name: "LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV6.zip",
      sha256: null,
      note:
        "An archive cannot contain its own hash. The SHA-256 is published with the delivery and " +
        "recorded in REVISION_6_REPAIR_RECORD.md; verify with `sha256sum` against that value, then " +
        "verify every file below against this record from the extraction.",
    },
    verification: [
      "sha256sum LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV6.zip   # compare with the published value",
      "unzip -q LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV6.zip && cd lineage-m1",
      "node tools/verifyProvenance.mjs                             # recomputes every hash below",
      "git -C <clone> cat-file -t <source.commit>                  # binds the extraction to branch history",
    ],
  };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const record = buildProvenance();
  writeFileSync(join(ROOT, "audit", "provenance.json"), JSON.stringify(record, null, 2));
  const n = Object.keys(record.evidence).length + Object.keys(record.generated).length;
  console.error(
    `provenance.json: commit ${record.source.resolved ? record.source.shortCommit : "UNRESOLVED"}, ` +
    `${n} files hashed, working tree clean: ${record.source.workingTreeClean}`
  );
}
