// @ts-check
/**
 * Verify a bundle against its own provenance record (revision-6 repair, L-1 / R6-L).
 *
 * Run from an extraction of the delivered archive. It recomputes every hash and
 * byte count in `audit/provenance.json` and reports any file that differs, is
 * missing, or is present but unrecorded. It needs no network, no `.git`, and no
 * dependency.
 *
 * Usage: node tools/verifyProvenance.mjs [--expect-archive-sha256 <hex>]
 * Exit code 0 when everything matches.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

/**
 * @param {string} [root]
 * @returns {{ok:boolean, checked:number, mismatches:string[], missing:string[], unrecorded:string[]}}
 */
export function verifyProvenance(root = ROOT) {
  const rec = JSON.parse(readFileSync(join(root, "audit", "provenance.json"), "utf8"));
  const mismatches = [];
  const missing = [];
  let checked = 0;

  const check = (rel, expected) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) { missing.push(rel); return; }
    const bytes = readFileSync(abs);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    checked++;
    if (sha256 !== expected.sha256 || bytes.length !== expected.bytes) {
      mismatches.push(
        `${rel}: recorded ${expected.sha256.slice(0, 12)}…/${expected.bytes}B, ` +
        `found ${sha256.slice(0, 12)}…/${bytes.length}B`
      );
    }
  };

  for (const [rel, r] of Object.entries(rec.evidence)) check(rel, r);
  for (const [rel, r] of Object.entries(rec.generated)) check(rel, r);
  check(rec.fixture.path, rec.fixture);
  check(rec.testResults.path, rec.testResults);

  // No undisclosed evidence: every audit file must be recorded.
  const unrecorded = [];
  const walk = (d) => {
    for (const name of readdirSync(join(root, d)).sort()) {
      const child = `${d}/${name}`;
      if (statSync(join(root, child)).isDirectory()) { walk(child); continue; }
      if (child.endsWith(".partial") || child.endsWith("provenance.json")) continue;
      if (!(child in rec.evidence)) unrecorded.push(child);
    }
  };
  walk("audit");

  return {
    ok: mismatches.length === 0 && missing.length === 0 && unrecorded.length === 0,
    checked, mismatches, missing, unrecorded,
  };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const rec = JSON.parse(readFileSync(join(ROOT, "audit", "provenance.json"), "utf8"));
  const r = verifyProvenance();
  console.log(`source commit : ${rec.source.resolved ? rec.source.commit : "UNRESOLVED"}`);
  console.log(`model identity: ${rec.model.modelDefinitionHash}`);
  console.log(`files verified: ${r.checked}`);
  for (const m of r.mismatches) console.log(`MISMATCH  ${m}`);
  for (const m of r.missing) console.log(`MISSING   ${m}`);
  for (const m of r.unrecorded) console.log(`UNRECORDED ${m}`);

  const idx = process.argv.indexOf("--expect-archive-sha256");
  if (idx >= 0) {
    const expected = process.argv[idx + 1];
    console.log(
      `archive sha256: ${expected} — compare this yourself against the delivered file; ` +
      "an archive cannot contain its own hash."
    );
  }
  console.log(r.ok ? "PROVENANCE OK" : "PROVENANCE FAILED");
  if (!r.ok) process.exitCode = 1;
}
