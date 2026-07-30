// @ts-check
/**
 * Report bytes must not depend on the runtime that renders them (contract §26;
 * revision-5 repair, BUG 6 / R5-6).
 *
 * Reproduced against revision 4. The report embedded the live `process.version`, and
 * the suite requires the committed report to be byte-identical to a fresh render, so
 * the gate could only be satisfied on the exact Node patch that generated it:
 *
 *   Node v22.22.2, the recorded bundle runtime  ->  249 passed, 0 failed, exit 0
 *   Node v20.20.2, within `node >=18`           ->   12 passed, 1 failed
 *   Node v24.14.0, within `node >=18`           ->  248 passed, 1 failed  (auditor)
 *
 * In each failing case the sole difference was the generated
 * `| Node · platform | vXX… |` line.
 *
 * Node support stays at `>=18`. The code requires nothing narrower; the fix is to
 * keep the verifier's runtime out of the report bytes, recording the OFFICIAL
 * evidence run's environment in `audit/build-environment.json` instead.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { renderFinalReport } from "../tools/writeFinalReport.mjs";
import { readMatrixConfig, evaluateCoverage } from "../tools/runRuntimeMatrix.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

test("§26 — the report contains no live runtime value", () => {
  const report = read("FINAL_REPORT.md");
  // The live values of THIS process must not appear as report content. If they did,
  // a different supported runtime would render different bytes.
  assert.ok(
    !report.includes(`| Node · platform | ${process.version}`),
    "the revision-4 live-runtime row must be gone"
  );
  // The runtime that IS named must come from committed evidence.
  const env = readJson("audit/build-environment.json");
  assert.ok(
    report.includes(`| Evidence-run runtime | ${env.evidenceRun.nodeVersion}`),
    "the report must name the evidence run's runtime, read from audit/build-environment.json"
  );
  assert.ok(
    report.includes(`| Declared runtime support | \`node ${env.declaredSupport.engines.node}\` |`),
    "the report must state the declared support range"
  );
});

test("§26 — declared Node support is unchanged at >=18", () => {
  const pkg = readJson("package.json");
  assert.equal(
    pkg.engines.node,
    ">=18",
    "support must not be narrowed merely to preserve an embedded version line"
  );
  const env = readJson("audit/build-environment.json");
  assert.equal(env.declaredSupport.engines.node, ">=18");
  assert.match(env.declaredSupport.policy, /Report determinism is achieved by keeping the/);
});

test("§26 — rendering is a pure function of committed evidence", () => {
  // Two renders in the same process must agree, and must equal the committed file.
  const a = renderFinalReport();
  const b = renderFinalReport();
  assert.equal(a, b, "rendering must be deterministic");
  assert.equal(read("FINAL_REPORT.md"), a, "the committed report must be that render");
});

test("§26 — the report renders identically on every EXECUTED runtime", () => {
  // The cross-runtime evidence is produced by `npm run audit:runtime-matrix`.
  //
  // REVISION-6 REPAIR (Break 5 / R6-I). This test used to carry its own threshold
  // ("at least two majors"), which the generator did not know about: on a machine
  // with one Node install the generator exited 0 and wrote evidence that failed
  // here immediately. Both now read `runtime-matrix.config.json` and apply the
  // SAME judgement function, so the documented regeneration command cannot succeed
  // on coverage this test rejects.
  const rel = "audit/runtime-matrix.json";
  assert.ok(existsSync(join(ROOT, rel)), `${rel} is required evidence — run npm run audit:runtime-matrix`);
  const m = readJson(rel);
  const config = readMatrixConfig(ROOT);
  const verdict = evaluateCoverage(m, config);

  assert.deepEqual(verdict.problems, [], "the committed matrix must satisfy runtime-matrix.config.json");
  assert.equal(verdict.sufficient, true);
  assert.equal(m.sufficientCoverage, true, "and the generator must have recorded the same verdict");
  assert.deepEqual(
    m.executedMajors, verdict.executedMajors,
    "the record's executed majors must match a fresh evaluation of its own runtimes"
  );
  assert.equal(m.reportBytesAreRuntimeIndependentAcrossExecutedMajors, true);
  assert.equal(m.allDeterminismTestsPass, true, "the determinism-critical tests must pass on every runtime");
  assert.equal(m.probeOnly, false, "the committed evidence must be a full run, not a coverage probe");
  for (const major of verdict.executedMajors) {
    assert.ok(major >= 18, `Node ${major} is below the declared floor`);
  }
});
