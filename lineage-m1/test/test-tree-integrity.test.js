// @ts-check
/**
 * The test suite must never modify the production source tree (contract §20;
 * revision-5 repair, BUG 8 / R5-8).
 *
 * Reproduced against revision 4. `report-integrity.test.js` planted violations
 * directly into `src/` to prove its self-audit scanner had teeth, while the official
 * command runs test files in concurrent worker processes over one shared tree. A
 * filesystem watcher sampling `src/core/math.js` during the submitted test observed
 * its first line change four times, cycling through an observer import, a bare
 * import of a package that does not exist, and an unseeded-random call, before being
 * restored. Another worker importing that file mid-plant would fail on module
 * resolution. The `finally` restore protects one process's own path and provides no
 * cross-process exclusion.
 *
 * The repair makes `selfAuditScans(root)` root-parameterised, so the teeth test
 * plants into a temporary copy. These tests prove the production tree is untouched
 * and that the scanner still detects planted violations.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { selfAuditScans, stripCommentsAndStrings } from "../tools/writeFinalReport.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

/** A content hash over the whole production source tree. */
function sourceTreeDigest() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) { walk(rel); continue; }
      files.push(rel);
    }
  };
  walk("src");
  const h = createHash("sha256");
  for (const rel of files) {
    h.update(rel);
    h.update(" ");
    h.update(readFileSync(join(ROOT, rel)));
    h.update(" ");
  }
  return { digest: h.digest("hex"), fileCount: files.length };
}

/** Copy src/ into a fresh temporary root. */
function isolatedTree() {
  const dir = mkdtempSync(join(tmpdir(), "lineage-scanner-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  cpSync(join(ROOT, "src"), join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "tools"), { recursive: true });
  return dir;
}

/** The forbidden tokens, built by concatenation so this file does not contain them. */
const UNSEEDED_CALL = ["Math", "random"].join(".") + "()";
const SIM_RNG = ["sim", "Rng"].join("");

test("§20 — the self-audit scanner runs against an isolated tree, never src/", () => {
  const before = sourceTreeDigest();
  const dir = isolatedTree();
  try {
    // A clean copy scans clean.
    const clean = selfAuditScans(dir);
    assert.deepEqual(clean.unseededRandom, []);
    assert.deepEqual(clean.observerImports, []);
    assert.deepEqual(clean.observerRngRefs, []);
    assert.deepEqual(clean.bareImports, []);

    // Plant each violation IN THE COPY and require detection.
    const cases = [
      {
        file: "src/core/math.js",
        inject: 'import { zoneBinCounts } from "../observer/currentZoneBins.js";\n',
        key: "observerImports",
      },
      { file: "src/core/math.js", inject: 'import x from "some-npm-package";\n', key: "bareImports" },
      { file: "src/observer/currentZoneBins.js", inject: `const q = ${SIM_RNG};\n`, key: "observerRngRefs" },
      { file: "src/core/math.js", inject: `const r = ${UNSEEDED_CALL};\n`, key: "unseededRandom" },
    ];
    for (const c of cases) {
      const path = join(dir, c.file);
      const original = readFileSync(path, "utf8");
      writeFileSync(path, c.inject + original);
      const planted = selfAuditScans(dir);
      assert.ok(
        planted[c.key].length > 0,
        `the ${c.key} scan failed to detect a planted violation in ${c.file}`
      );
      assert.ok(
        planted[c.key].some((e) => e.includes(c.file)),
        `the ${c.key} scan did not name ${c.file}`
      );
      writeFileSync(path, original);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const after = sourceTreeDigest();
  assert.equal(after.digest, before.digest, "the production source tree must be byte-identical");
  assert.equal(after.fileCount, before.fileCount);
});

test("§20 — the production source tree is byte-identical before and after the scanner tests", () => {
  // An independent statement of the invariant: scanning the real tree repeatedly,
  // concurrently with whatever else the suite is doing, changes nothing.
  const before = sourceTreeDigest();
  for (let i = 0; i < 25; i++) selfAuditScans();
  const after = sourceTreeDigest();
  assert.equal(after.digest, before.digest);
  assert.equal(after.fileCount, before.fileCount);
});

test("§20 — no test file writes into the production tree", () => {
  // Static guarantee, so a future test cannot reintroduce the defect.
  //
  // The argument that matters differs by API: for `writeFileSync`/`rmSync` the
  // TARGET is argument 1, but for `cpSync`/`copyFileSync`/`renameSync` argument 1 is
  // the SOURCE and argument 2 is the destination. Reading a ROOT path is fine —
  // this very file copies `src/` into a temp dir — so only the destination is
  // checked for the two-argument forms. My first version of this check inspected
  // argument 1 unconditionally and flagged its own legitimate read.
  const singleTarget = /\b(writeFileSync|appendFileSync|rmSync|unlinkSync|truncateSync|mkdirSync)\s*\(\s*([^,)]+)/g;
  const destinationIsSecond = /\b(cpSync|copyFileSync|renameSync|linkSync|symlinkSync)\s*\(\s*[^,]+,\s*([^,)]+)/g;
  const offenders = [];

  const flag = (rel, api, target) => {
    const t = target.trim();
    const rootDerived = /\bROOT\b/.test(t);
    const tempDerived = /\bdir\b|tmp|temp/i.test(t);
    if (rootDerived && !tempDerived) offenders.push(`${rel}: ${api} -> ${t.slice(0, 60)}`);
  };

  for (const name of readdirSync(join(ROOT, "test")).sort()) {
    if (!name.endsWith(".js")) continue;
    const rel = `test/${name}`;
    const raw = readFileSync(join(ROOT, rel), "utf8");
    for (const m of raw.matchAll(singleTarget)) flag(rel, m[1], m[2]);
    for (const m of raw.matchAll(destinationIsSecond)) flag(rel, m[1], m[2]);
  }
  assert.deepEqual(
    offenders,
    [],
    `test files writing into the production tree:\n  ${offenders.join("\n  ")}`
  );
});

test("§20 — the comment stripper distinguishes use from mention", () => {
  // The stripper is what lets the scanner read code rather than prose. If it broke,
  // either the scanner would flag documentation (revision 4's problem) or it would
  // miss real code.
  const sample = [
    `// a comment naming ${UNSEEDED_CALL} must be ignored`,
    `/* a block comment naming ${SIM_RNG} must be ignored */`,
    `const s = "a string naming ${UNSEEDED_CALL} must be ignored";`,
    "const real = 42;",
  ].join("\n");
  const stripped = stripCommentsAndStrings(sample);
  assert.ok(!stripped.includes(UNSEEDED_CALL), "line-comment and string mentions must be removed");
  assert.ok(!stripped.includes(SIM_RNG), "block-comment mentions must be removed");
  assert.ok(stripped.includes("const real = 42;"), "real code must survive");
  // Line count is preserved so reported positions stay meaningful.
  assert.equal(stripped.split("\n").length, sample.split("\n").length);
});

test("§20 — the scanner is deterministic and side-effect free on repeated calls", () => {
  const a = JSON.stringify(selfAuditScans());
  const b = JSON.stringify(selfAuditScans());
  assert.equal(a, b, "two scans of an unchanged tree must agree exactly");
});
