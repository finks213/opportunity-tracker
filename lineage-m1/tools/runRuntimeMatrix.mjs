// @ts-check
/**
 * Run the report-determinism proof across the Node majors the gate requires.
 *
 * The claim being evidenced is narrow and checkable: **rendering `FINAL_REPORT.md`
 * produces identical bytes on every Node major EXERCISED HERE**, given unchanged
 * committed evidence. That is what makes the byte-equality gate satisfiable on a
 * different install rather than only on the patch release that generated the report.
 *
 * REVISION-6 REPAIR (Break 5 / M-3 / R6-I). Revision 5 had three defects here:
 *
 * 1. The generator's success condition required only "one distinct rendered hash
 *    and zero test failures" — never a minimum number of runtimes — while
 *    `test/report-determinism.test.js` independently required at least two majors.
 *    On a clean machine with one Node install the documented regeneration command
 *    therefore succeeded and produced evidence that immediately failed the
 *    build-blocking suite. Reproduced on a full clean copy:
 *
 *      v22.16.0 render 14fc43dd9078… MATCHES committed | tests 62/62, 0 failing
 *      runtime-matrix.json: 1 majors, 1 distinct rendered hash(es),
 *        runtime-independent: true, all match committed: true
 *      generator exit code: 0
 *      -> not ok 4 - §26 — the report renders identically on every recorded runtime
 *         error: 'at least two majors must be exercised, saw 1'
 *
 *    The requirement now lives in `runtime-matrix.config.json`, which BOTH the
 *    generator and the test read. There is one invariant, in one place.
 *
 * 2. Runtime discovery assumed `/opt/nodeNN`, a layout private to one build
 *    machine. Discovery now honours `LINEAGE_NODE_BINARIES` first, then nvm, then
 *    that layout, and the config file documents container and CI procedures.
 *
 * 3. The evidence was labelled "across supported Node majors" while covering three
 *    majors of an open-ended `>=18` range. The record now separates
 *    `declaredCompatibility` from `executedMajors` and states plainly that the
 *    latter is what was measured.
 *
 * Usage: node tools/runRuntimeMatrix.mjs [--probe-only]
 *   --probe-only renders and hashes under each runtime without running the
 *   determinism test files. Used by the coverage regression, which needs the
 *   generator's exit code, not its test results.
 */

import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

/** Test files whose result must not depend on the runtime. */
const DETERMINISM_TESTS = [
  "test/report-integrity.test.js",
  "test/manifest-inventory.test.js",
  "test/status-consistency.test.js",
  "test/model-identity.test.js",
  "test/model-hash-provenance.test.js",
];

/**
 * The single declaration of what coverage the gate requires. Read by this tool and
 * by `test/runtime-matrix-coverage.test.js`.
 * @param {string} [root]
 */
export function readMatrixConfig(root = ROOT) {
  return JSON.parse(readFileSync(join(root, "runtime-matrix.config.json"), "utf8"));
}

/**
 * Judge a matrix record against the config. The generator exits nonzero on exactly
 * this verdict, and the build-blocking test asserts exactly this verdict, so they
 * cannot disagree.
 *
 * @param {{runtimes:Array<{major:number}>, distinctRenderedHashes:number, allRuntimesMatchCommittedReport:boolean, allDeterminismTestsPass?:boolean|null}} record
 * @param {{requiredMajors:number[], minimumDistinctMajors:number}} config
 * @returns {{sufficient:boolean, problems:string[], executedMajors:number[], missingRequiredMajors:number[]}}
 */
export function evaluateCoverage(record, config) {
  const executedMajors = [...new Set((record.runtimes ?? []).map((r) => r.major))].sort((a, b) => a - b);
  const missingRequiredMajors = config.requiredMajors.filter((m) => !executedMajors.includes(m));
  const problems = [];
  if (executedMajors.length < config.minimumDistinctMajors) {
    problems.push(
      `only ${executedMajors.length} distinct major(s) exercised (${executedMajors.join(", ") || "none"}); ` +
      `runtime-matrix.config.json requires at least ${config.minimumDistinctMajors}`
    );
  }
  if (missingRequiredMajors.length > 0) {
    problems.push(
      `required major(s) not exercised: ${missingRequiredMajors.join(", ")}. ` +
      "See runtime-matrix.config.json -> acquisition for how to obtain them."
    );
  }
  if (record.distinctRenderedHashes !== 1) {
    problems.push(`report bytes differ across runtimes: ${record.distinctRenderedHashes} distinct hashes`);
  }
  if (record.allRuntimesMatchCommittedReport !== true) {
    problems.push("at least one runtime rendered something other than the committed report");
  }
  if (record.allDeterminismTestsPass === false) {
    problems.push("the determinism-critical tests did not pass on every runtime");
  }
  return { sufficient: problems.length === 0, problems, executedMajors, missingRequiredMajors };
}

/**
 * Discover Node binaries for distinct majors, in documented order of preference:
 *   1. `LINEAGE_NODE_BINARIES` — colon-separated explicit paths (portable)
 *   2. nvm's `$NVM_DIR/versions/node/<version>/bin/node`
 *   3. `/opt/nodeNN/bin/node` — this build machine's layout
 *   4. the running binary
 * @param {Record<string, string|undefined>} [env]
 * @returns {Array<{path:string, version:string, major:number, foundVia:string}>}
 */
export function discoverRuntimes(env = process.env) {
  /** @type {Array<{path:string, version:string, major:number, foundVia:string}>} */
  const found = [];
  const consider = (p, via) => {
    try {
      const version = execFileSync(p, ["--version"], { encoding: "utf8" }).trim();
      const major = Number(version.replace(/^v/, "").split(".")[0]);
      if (!Number.isFinite(major)) return;
      if (found.some((f) => f.major === major)) return;
      found.push({ path: p, version, major, foundVia: via });
    } catch {
      /* not a usable node binary */
    }
  };

  for (const p of (env.LINEAGE_NODE_BINARIES ?? "").split(":").filter(Boolean)) {
    consider(p, "LINEAGE_NODE_BINARIES");
  }
  const nvmDir = env.NVM_DIR ? join(env.NVM_DIR, "versions", "node") : null;
  if (nvmDir && existsSync(nvmDir)) {
    for (const dir of readdirSync(nvmDir).sort()) consider(join(nvmDir, dir, "bin", "node"), "nvm");
  }
  if (env.LINEAGE_SKIP_OPT_RUNTIMES !== "1") {
    for (const dir of existsSync("/opt") ? readdirSync("/opt").sort() : []) {
      const candidate = `/opt/${dir}/bin/node`;
      if (existsSync(candidate)) consider(candidate, "/opt layout");
    }
  }
  consider(process.execPath, "running binary");
  return found.sort((a, b) => a.major - b.major);
}

/**
 * Render the report under one runtime and hash the result, without writing it.
 * @param {string} nodePath
 */
function renderHashUnder(nodePath) {
  const script = `
    import { renderFinalReport } from "${join(ROOT, "tools", "writeFinalReport.mjs").replace(/\\/g, "/")}";
    process.stdout.write(renderFinalReport());
  `;
  const text = execFileSync(nodePath, ["--input-type=module", "-e", script], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { hash: createHash("sha256").update(text).digest("hex"), bytes: text.length };
}

/**
 * Run the determinism-critical test files under one runtime.
 * @param {string} nodePath
 */
function testsUnder(nodePath) {
  const files = DETERMINISM_TESTS.filter((f) => existsSync(join(ROOT, f)));
  try {
    const out = execFileSync(nodePath, ["--test", "--test-timeout=600000", ...files], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ...summarize(out), exitCode: 0, files };
  } catch (err) {
    const out = String(err.stdout ?? "") + String(err.stderr ?? "");
    return { ...summarize(out), exitCode: err.status ?? 1, files };
  }
}

function summarize(tap) {
  const grab = (k) => {
    const m = tap.match(new RegExp(`^# ${k} (\\d+)$`, "m"));
    return m ? Number(m[1]) : null;
  };
  const failing = [...tap.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { tests: grab("tests"), pass: grab("pass"), fail: grab("fail"), failing };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const probeOnly = process.argv.includes("--probe-only");
  const config = readMatrixConfig();
  const runtimes = discoverRuntimes();
  const committed = existsSync(join(ROOT, "FINAL_REPORT.md"))
    ? createHash("sha256").update(readFileSync(join(ROOT, "FINAL_REPORT.md"), "utf8")).digest("hex")
    : null;

  const results = [];
  for (const rt of runtimes) {
    const render = renderHashUnder(rt.path);
    const tests = probeOnly ? null : testsUnder(rt.path);
    results.push({
      nodeVersion: rt.version,
      major: rt.major,
      binary: rt.path,
      foundVia: rt.foundVia,
      renderedReportSha256: render.hash,
      renderedReportBytes: render.bytes,
      matchesCommittedReport: committed === null ? null : render.hash === committed,
      determinismTests: tests,
    });
    console.error(
      `${rt.version.padEnd(10)} render ${render.hash.slice(0, 12)}… ` +
      `${committed !== null && render.hash === committed ? "MATCHES committed" : "DIFFERS"}` +
      (tests ? ` | tests ${tests.pass}/${tests.tests}, ${tests.fail} failing` : " | tests skipped (--probe-only)")
    );
  }

  const hashes = new Set(results.map((r) => r.renderedReportSha256));
  const base = {
    schema: "lineage-m1-runtime-matrix-2",
    contractSection: "27 (audit evidence)",
    claim:
      "Rendering FINAL_REPORT.md produces identical bytes on every Node major EXERCISED BELOW, given " +
      "unchanged committed evidence. This is what makes the byte-equality gate satisfiable on another " +
      "install rather than only on the patch release that generated the report.",
    notClaimed:
      "That every major in the declared `>=18` compatibility range was exercised, and that the full " +
      "200-seed suite was executed on every major. Only the determinism-critical files listed below run " +
      "per runtime; the full suite's runtime is in audit/build-environment.json, and the majors on which " +
      "the FULL suite was run are recorded in the revision-6 repair record.",
    declaredCompatibility: config.declaredCompatibility,
    requiredMajors: config.requiredMajors,
    minimumDistinctMajors: config.minimumDistinctMajors,
    determinismTestFiles: probeOnly ? [] : DETERMINISM_TESTS,
    probeOnly,
    committedReportSha256: committed,
    runtimes: results,
    distinctRenderedHashes: hashes.size,
    reportBytesAreRuntimeIndependentAcrossExecutedMajors: hashes.size === 1,
    allRuntimesMatchCommittedReport: results.every((r) => r.matchesCommittedReport === true),
    allDeterminismTestsPass: probeOnly ? null : results.every((r) => r.determinismTests.fail === 0),
  };
  const coverage = evaluateCoverage(base, config);
  const record = {
    ...base,
    executedMajors: coverage.executedMajors,
    missingRequiredMajors: coverage.missingRequiredMajors,
    sufficientCoverage: coverage.sufficient,
    coverageProblems: coverage.problems,
  };

  const out = join(ROOT, "audit", "runtime-matrix.json");
  writeFileSync(out, JSON.stringify(record, null, 2));
  console.error(
    `\nruntime-matrix.json: executed majors [${coverage.executedMajors.join(", ")}], ` +
    `${hashes.size} distinct rendered hash(es), ` +
    `runtime-independent across executed majors: ${record.reportBytesAreRuntimeIndependentAcrossExecutedMajors}, ` +
    `all match committed: ${record.allRuntimesMatchCommittedReport}, ` +
    `sufficient coverage: ${coverage.sufficient}`
  );
  if (!coverage.sufficient) {
    for (const p of coverage.problems) console.error(`  PROBLEM: ${p}`);
    console.error(
      "\nThe matrix does NOT satisfy runtime-matrix.config.json, so this evidence would fail the " +
      "build-blocking test. Exiting nonzero rather than recording a pass."
    );
    process.exitCode = 1;
  }
}
