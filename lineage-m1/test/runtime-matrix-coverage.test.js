// @ts-check
/**
 * The runtime-matrix generator and its build-blocking test must enforce the SAME
 * coverage invariant (revision-6 repair, Break 5 / M-3 / R6-I).
 *
 * Reproduced against revision 5 on a full clean copy with one Node install:
 *
 *   $ node tools/runRuntimeMatrix.mjs
 *   v22.16.0 render 14fc43dd9078… MATCHES committed | tests 62/62, 0 failing
 *   runtime-matrix.json: 1 majors, 1 distinct rendered hash(es),
 *     runtime-independent: true, all match committed: true, all tests pass: true
 *   generator exit code: 0
 *
 *   $ node --test test/report-determinism.test.js
 *   not ok 4 - §26 — the report renders identically on every recorded runtime
 *     error: 'at least two majors must be exercised, saw 1'
 *
 * The documented regeneration command succeeded and produced evidence that
 * immediately failed the build it was supposed to reproduce. The generator now
 * exits nonzero on exactly the verdict the test asserts, and both read the
 * requirement from `runtime-matrix.config.json`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readMatrixConfig, evaluateCoverage, discoverRuntimes } from "../tools/runRuntimeMatrix.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

/** A matrix record shaped like the generator's, with N runtimes. */
const recordWith = (majors, over = {}) => ({
  runtimes: majors.map((m) => ({ major: m, nodeVersion: `v${m}.0.0`, renderedReportSha256: "abc" })),
  distinctRenderedHashes: 1,
  allRuntimesMatchCommittedReport: true,
  allDeterminismTestsPass: true,
  ...over,
});

test("§26 — the coverage requirement lives in one checked-in file", () => {
  const config = readMatrixConfig(ROOT);
  assert.ok(existsSync(join(ROOT, "runtime-matrix.config.json")), "the config must ship in the bundle");
  assert.ok(Array.isArray(config.requiredMajors) && config.requiredMajors.length >= 2);
  assert.ok(config.minimumDistinctMajors >= 2);
  assert.equal(config.declaredCompatibility, readJson("package.json").engines.node);
  // ...and it must document how to obtain the runtimes without a private layout.
  for (const key of ["preferred", "nvm", "container", "ci"]) {
    assert.ok(config.acquisition[key], `the config must document the ${key} acquisition route`);
  }
});

test("§26 — one runtime is judged INSUFFICIENT by the shared evaluator", () => {
  const config = readMatrixConfig(ROOT);
  const verdict = evaluateCoverage(recordWith([22]), config);
  assert.equal(verdict.sufficient, false, "revision 5 recorded this as a pass");
  assert.match(verdict.problems.join(" "), /only 1 distinct major/);
  assert.deepEqual(verdict.executedMajors, [22]);
  assert.ok(verdict.missingRequiredMajors.length > 0);
});

test("§26 — a matrix missing a required major is insufficient even with two runtimes", () => {
  const config = readMatrixConfig(ROOT);
  const notRequired = [...Array(40).keys()].filter((m) => m >= 18 && !config.requiredMajors.includes(m));
  const verdict = evaluateCoverage(recordWith([notRequired[0], notRequired[1]]), config);
  assert.equal(verdict.sufficient, false);
  assert.match(verdict.problems.join(" "), /required major\(s\) not exercised/);
});

test("§26 — differing bytes or an unmatched committed report are insufficient", () => {
  const config = readMatrixConfig(ROOT);
  const majors = config.requiredMajors;
  assert.equal(evaluateCoverage(recordWith(majors, { distinctRenderedHashes: 2 }), config).sufficient, false);
  assert.equal(
    evaluateCoverage(recordWith(majors, { allRuntimesMatchCommittedReport: false }), config).sufficient,
    false
  );
  assert.equal(
    evaluateCoverage(recordWith(majors, { allDeterminismTestsPass: false }), config).sufficient,
    false
  );
  assert.equal(evaluateCoverage(recordWith(majors), config).sufficient, true, "the good case must still pass");
});

test("§26 — the GENERATOR exits nonzero when coverage is insufficient", () => {
  // The integration half: not the evaluator in isolation, but the actual command,
  // restricted to one runtime the way an ordinary clean machine would be. Rendering
  // only (`--probe-only`) keeps this fast; coverage is judged before any test run.
  const dir = mkdtempSync(join(tmpdir(), "lineage-runtime-"));
  try {
    for (const rel of ["src", "tools", "audit", "test", "fixtures", "package.json", "FINAL_REPORT.md",
      "AUDIT_PACKAGE_MANIFEST.md", "runtime-matrix.config.json", "CHARACTERIZATION.md"]) {
      cpSync(join(ROOT, rel), join(dir, rel), { recursive: true });
    }
    let status = 0;
    let stderr = "";
    try {
      execFileSync(process.execPath, [join(dir, "tools", "runRuntimeMatrix.mjs"), "--probe-only"], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          // Exactly one runtime, and no private /opt discovery: a clean machine.
          LINEAGE_NODE_BINARIES: process.execPath,
          LINEAGE_SKIP_OPT_RUNTIMES: "1",
          NVM_DIR: "",
        },
      });
    } catch (err) {
      status = err.status ?? 1;
      stderr = String(err.stderr ?? "");
    }
    assert.notEqual(status, 0, "the generator must NOT report success from one runtime");
    assert.match(stderr, /sufficient coverage: false|PROBLEM:/);

    const written = JSON.parse(readFileSync(join(dir, "audit", "runtime-matrix.json"), "utf8"));
    assert.equal(written.sufficientCoverage, false, "and the record must say so, not claim independence");
    assert.ok(written.coverageProblems.length > 0);
    assert.deepEqual(written.executedMajors, [Number(process.version.replace(/^v/, "").split(".")[0])]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("§26/§27 — the committed matrix certifies the committed report, not an older one", () => {
  // Found while assembling revision 8: the shipped matrix recorded
  // committedReportSha256 f2487caa8… while FINAL_REPORT.md hashed bee593df1…. The
  // matrix's whole claim — "these majors render THE COMMITTED REPORT identically" —
  // was therefore about a report that no longer shipped, and nothing in the suite
  // said so. The report deliberately embeds no matrix figures (see the test below),
  // so this binding cannot loop: regenerating the matrix never moves the report.
  const m = readJson("audit/runtime-matrix.json");
  const actual = createHash("sha256")
    .update(readFileSync(join(ROOT, "FINAL_REPORT.md")))
    .digest("hex");
  assert.equal(
    m.committedReportSha256, actual,
    "the matrix certifies a stale report — re-run `npm run audit:runtime-matrix` after the report changes"
  );
  assert.equal(m.allRuntimesMatchCommittedReport, true);
  assert.equal(m.allDeterminismTestsPass, true);
  assert.equal(m.sufficientCoverage, true);
  assert.deepEqual(m.coverageProblems, []);
});

test("§26 — the committed record separates DECLARED compatibility from EXECUTED majors", () => {
  const m = readJson("audit/runtime-matrix.json");
  const config = readMatrixConfig(ROOT);
  assert.equal(m.declaredCompatibility, config.declaredCompatibility);
  assert.ok(Array.isArray(m.executedMajors) && m.executedMajors.length >= config.minimumDistinctMajors);
  // The overclaim itself: a subset of an open-ended range described as all of it.
  assert.ok(
    !/every (declared )?supported Node major|all supported Node majors/i.test(JSON.stringify(m)),
    "the record must not describe the executed subset as every supported major"
  );
  assert.match(m.notClaimed, /every major in the declared/i, "and it must say what it does not claim");
});

test("§26 — no artifact describes the executed subset as every supported major", () => {
  const m = readJson("audit/runtime-matrix.json");
  const executed = m.executedMajors.join(", ");
  for (const rel of ["FINAL_REPORT.md", "AUDIT_PACKAGE_MANIFEST.md"]) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/supported Node major/i.test(lines[i])) continue;
      const context = lines.slice(Math.max(0, i - 3), i + 4).join(" ");
      assert.ok(
        /executed|tested|exercised|revision 5|withdrawn|not claimed/i.test(context),
        `${rel}:${i + 1} claims coverage of supported majors without naming what was executed:\n  ${lines[i].trim()}`
      );
    }
  }

  // The exact majors must be named in the MANIFEST rather than in the report.
  // `FINAL_REPORT.md` deliberately does not embed matrix figures: the matrix hashes
  // the committed report, so a report that quoted the matrix could never converge —
  // the same circularity that moved the runtime row into `audit/build-environment.json`
  // in revision 5. The report points at the file; the manifest states the numbers.
  const manifest = readFileSync(join(ROOT, "AUDIT_PACKAGE_MANIFEST.md"), "utf8");
  assert.ok(
    manifest.includes(executed),
    `AUDIT_PACKAGE_MANIFEST.md must name the executed majors (${executed})`
  );
  assert.ok(
    readFileSync(join(ROOT, "FINAL_REPORT.md"), "utf8").includes("audit/runtime-matrix.json"),
    "and the report must point at the record that lists them"
  );
});

test("§26 — discovery does not depend on one machine's private layout", () => {
  // An explicit binary list must be honoured with no /opt and no nvm present.
  const found = discoverRuntimes({
    LINEAGE_NODE_BINARIES: process.execPath,
    LINEAGE_SKIP_OPT_RUNTIMES: "1",
    NVM_DIR: "",
  });
  assert.ok(found.length >= 1);
  assert.equal(found[0].foundVia, "LINEAGE_NODE_BINARIES");
});
