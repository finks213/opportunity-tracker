// @ts-check
/**
 * Verify a bundle against its own provenance record (revision-6 L-1 / R6-L,
 * strengthened in revision 7 after the revision-6 structural audit's Finding 3).
 *
 * Run from an extraction of the delivered archive. It recomputes the SHA-256 and
 * byte count of EVERY shipped file and reports any that differs, is missing, or is
 * present but unrecorded. It needs no network, no `.git`, and no dependency.
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
 * the delivery. Every shipped file is now recorded and verified, and the raw TAP is
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
if (isMain) {
  const rec = JSON.parse(readFileSync(join(ROOT, "audit", "provenance.json"), "utf8"));
  const r = verifyProvenance(ROOT, { tapMayDiffer: process.argv.includes("--tap-may-differ") });
  console.log(`source commit : ${rec.source.resolved ? rec.source.commit : "UNRESOLVED"}`);
  console.log(`model identity: ${rec.model.modelDefinitionHash}`);
  console.log(`files recorded: ${rec.fileCount}`);
  console.log(`files verified: ${r.checked}`);
  console.log(`tree digest   : ${r.treeDigestMatches ? "matches" : "DOES NOT MATCH"}`);
  for (const m of r.mismatches) console.log(`MISMATCH   ${m}`);
  for (const m of r.missing) console.log(`MISSING    ${m}`);
  for (const m of r.unrecorded) console.log(`UNRECORDED ${m}`);
  console.log(r.ok ? "PROVENANCE OK" : "PROVENANCE FAILED");
  if (!r.ok) process.exitCode = 1;
}
