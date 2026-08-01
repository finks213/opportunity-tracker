// @ts-check
/**
 * Verify a bundle against its own provenance record (revision-6 L-1 / R6-L,
 * strengthened in revision 7 after the revision-6 structural audit's Finding 3).
 *
 * Run from an extraction of the delivered archive. It recomputes the SHA-256 and
 * byte count of every recorded file — every shipped file except `audit/provenance.json`,
 * which cannot hash itself — and reports any that differs, is missing, or is present
 * but unrecorded. The archive as a whole is bound by its published ZIP SHA-256. It
 * needs no network, no `.git`, and no dependency.
 *
 * WHAT REVISION 6 GOT WRONG. It hashed only named audit evidence, a few generated
 * documents and the fixture — 20 files. The auditor changed `src/core/math.js` and
 * rewrote a non-summary line of `audit/test-results.txt`, and this tool still
 * printed:
 *
 *   files verified: 20
 *   PROVENANCE OK
 *   exit=0
 *
 * So the record bound selected evidence to itself rather than the shipped code to
 * the delivery. Every shipped file except the record itself is now recorded and
 * verified, and the raw TAP is
 * bound by its exact bytes rather than by its three summary counts.
 *
 * Usage: node tools/verifyProvenance.mjs [--tap-may-differ]
 * Exit code 0 when everything matches.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

/** Paths that never ship, and so are never expected in the record. */
const EXCLUDED = [/^node_modules\//, /^\.git\//, /\.partial$/, /^audit\/provenance\.json$/,
  /\.DS_Store$/, /^\.vscode\//, /^\.idea\//, /~$/, /\.swp$/];

/**
 * @param {string} [root]
 * @param {{tapMayDiffer?:boolean}} [opts] `tapMayDiffer` is for the in-suite check
 *   ONLY: a suite run republishes `audit/test-results.txt` before this can be
 *   re-recorded, so the working tree legitimately differs there until
 *   `npm run audit:provenance` runs again. Even then the recorded COUNTS are still
 *   checked. The delivered archive is verified strictly, and strict is the default.
 * @returns {{ok:boolean, checked:number, mismatches:string[], missing:string[], unrecorded:string[], treeDigestMatches:boolean}}
 */
export function verifyProvenance(root = ROOT, opts = {}) {
  const rec = JSON.parse(readFileSync(join(root, "audit", "provenance.json"), "utf8"));
  const files = rec.files ?? {};
  const mismatches = [];
  const missing = [];
  let checked = 0;

  for (const [rel, expected] of Object.entries(files)) {
    const abs = join(root, rel);
    if (!existsSync(abs)) { missing.push(rel); continue; }
    const bytes = readFileSync(abs);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    checked++;
    if (sha256 === expected.sha256 && bytes.length === expected.bytes) continue;
    if (opts.tapMayDiffer === true && rel === rec.testResults.path) {
      const text = bytes.toString("utf8");
      for (const key of ["tests", "pass", "fail"]) {
        const m = text.match(new RegExp(`^# ${key} (\\d+)$`, "m"));
        const found = m ? Number(m[1]) : null;
        if (found !== rec.testResults[key]) {
          mismatches.push(`${rel}: recorded ${key} ${rec.testResults[key]}, found ${found}`);
        }
      }
      continue;
    }
    mismatches.push(
      `${rel}: recorded ${expected.sha256.slice(0, 12)}…/${expected.bytes}B, ` +
      `found ${sha256.slice(0, 12)}…/${bytes.length}B`
    );
  }

  // No undisclosed file: everything shipped must be recorded.
  const unrecorded = [];
  const walk = (d) => {
    for (const name of readdirSync(join(root, d === "" ? "." : d)).sort()) {
      const rel = d === "" ? name : `${d}/${name}`;
      if (EXCLUDED.some((re) => re.test(rel))) continue;
      if (statSync(join(root, rel)).isDirectory()) { walk(rel); continue; }
      if (!(rel in files)) unrecorded.push(rel);
    }
  };
  walk("");

  // One digest over the whole recorded tree, so a single value identifies it.
  const treeDigest = createHash("sha256");
  for (const rel of Object.keys(files).sort()) {
    treeDigest.update(rel);
    treeDigest.update("\0");
    treeDigest.update(files[rel].sha256);
    treeDigest.update("\n");
  }
  const treeDigestMatches = treeDigest.digest("hex") === rec.shippedTreeDigest;

  return {
    ok: mismatches.length === 0 && missing.length === 0 && unrecorded.length === 0 && treeDigestMatches,
    checked, mismatches, missing, unrecorded, treeDigestMatches,
  };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
/**
 * Reasons a record is unfit for delivery, whatever its hashes say.
 *
 * REVISION-8.1 REPAIR (revision-8 bounded closure audit, Finding 3B). With tracked
 * `src/core/math.js` dirty, `writeProvenance.mjs --allow-dirty` correctly stamped the
 * record provisional — and then the strict verifier printed `PROVENANCE OK`, exit 0.
 * A record explicitly labelled "NOT a delivery record" received the tool's strict
 * success verdict. Strict verification refuses these outright; `--accept-provisional`
 * inspects them locally and never prints the strict success line.
 *
 * @param {any} rec
 */
export function deliveryDisqualifiers(rec) {
  const reasons = [];
  if (rec.provisional) reasons.push("the record is marked provisional");
  if (rec.source && rec.source.workingTreeClean === false) {
    reasons.push("it was written against a working tree that was not clean");
  }
  if (rec.workingTreeClean === false) reasons.push("workingTreeClean is false");
  if (rec.deliveryEligible === false) reasons.push("deliveryEligible is false");
  if (rec.allowDirty) reasons.push("it was generated with --allow-dirty");
  return reasons;
}

if (isMain) {
  const rec = JSON.parse(readFileSync(join(ROOT, "audit", "provenance.json"), "utf8"));
  const acceptProvisional = process.argv.includes("--accept-provisional");
  const disqualifiers = deliveryDisqualifiers(rec);
  const r = verifyProvenance(ROOT, { tapMayDiffer: process.argv.includes("--tap-may-differ") });
  console.log(`source commit : ${rec.source.resolved ? rec.source.commit : "UNRESOLVED"}`);
  console.log(`model identity: ${rec.model.modelDefinitionHash}`);
  console.log(`files recorded: ${rec.fileCount}`);
  console.log(`files verified: ${r.checked}`);
  console.log(`tree digest   : ${r.treeDigestMatches ? "matches" : "DOES NOT MATCH"}`);
  for (const m of r.mismatches) console.log(`MISMATCH   ${m}`);
  for (const m of r.missing) console.log(`MISSING    ${m}`);
  for (const m of r.unrecorded) console.log(`UNRECORDED ${m}`);
  if (disqualifiers.length > 0) {
    for (const reason of disqualifiers) console.log(`PROVISIONAL ${reason}`);
    if (acceptProvisional) {
      // A named diagnostic mode. It reports the hash comparison for local
      // inspection and deliberately never prints the strict success line.
      console.log(
        r.ok
          ? "PROVISIONAL RECORD — hashes agree, but this is NOT a delivery verification"
          : "PROVISIONAL RECORD — and its hashes do not agree"
      );
    } else {
      console.log(
        "PROVENANCE FAILED — the record is provisional and unsuitable for delivery.\n" +
        "Commit the tree and re-run `npm run audit:provenance`. To inspect a provisional\n" +
        "record locally, pass --accept-provisional; it never returns the strict verdict."
      );
    }
    process.exitCode = 1;
  } else {
    console.log(r.ok ? "PROVENANCE OK" : "PROVENANCE FAILED");
    if (!r.ok) process.exitCode = 1;
  }
}
