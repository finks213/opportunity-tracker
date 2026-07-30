// @ts-check
/**
 * Run the report-determinism proof across every Node major available here.
 *
 * Revision-5 repair (BUG 6 / R5-6). The claim being evidenced is narrow and
 * checkable: **rendering `FINAL_REPORT.md` produces identical bytes on every
 * supported Node version**, given unchanged committed evidence. That is what makes
 * the byte-equality gate satisfiable on any `node >=18` install instead of only on
 * the patch release that generated the report.
 *
 * Revision 4 could not make this claim: the report embedded the live
 * `process.version`, so Node 20 and Node 24 each produced different bytes and
 * failed the gate while satisfying the declared engine range.
 *
 * What this tool does NOT claim: that the whole 200-seed suite was run on every
 * major (that would take hours per runtime). It renders the report and runs the
 * determinism-critical test files. The full suite's own runtime is recorded in
 * `audit/build-environment.json`.
 *
 * Usage: node tools/runRuntimeMatrix.mjs
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
 * Discover Node binaries for distinct majors. Scans each `/opt/nodeNN` directory for
 * a `bin/node` (this environment's layout) and also considers the running binary.
 * @returns {Array<{path:string, version:string, major:number}>}
 */
export function discoverRuntimes() {
  /** @type {Array<{path:string, version:string, major:number}>} */
  const found = [];
  const consider = (p) => {
    try {
      const version = execFileSync(p, ["--version"], { encoding: "utf8" }).trim();
      const major = Number(version.replace(/^v/, "").split(".")[0]);
      if (!Number.isFinite(major)) return;
      if (found.some((f) => f.major === major)) return;
      found.push({ path: p, version, major });
    } catch {
      /* not a usable node binary */
    }
  };
  for (const dir of existsSync("/opt") ? readdirSync("/opt").sort() : []) {
    const candidate = `/opt/${dir}/bin/node`;
    if (existsSync(candidate)) consider(candidate);
  }
  consider(process.execPath);
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
  const runtimes = discoverRuntimes();
  const committed = existsSync(join(ROOT, "FINAL_REPORT.md"))
    ? createHash("sha256").update(readFileSync(join(ROOT, "FINAL_REPORT.md"), "utf8")).digest("hex")
    : null;

  const results = [];
  for (const rt of runtimes) {
    const render = renderHashUnder(rt.path);
    const tests = testsUnder(rt.path);
    results.push({
      nodeVersion: rt.version,
      major: rt.major,
      binary: rt.path,
      renderedReportSha256: render.hash,
      renderedReportBytes: render.bytes,
      matchesCommittedReport: committed === null ? null : render.hash === committed,
      determinismTests: tests,
    });
    console.error(
      `${rt.version.padEnd(10)} render ${render.hash.slice(0, 12)}… ` +
      `${committed !== null && render.hash === committed ? "MATCHES committed" : "DIFFERS"} | ` +
      `tests ${tests.pass}/${tests.tests}, ${tests.fail} failing`
    );
  }

  const hashes = new Set(results.map((r) => r.renderedReportSha256));
  const record = {
    schema: "lineage-m1-runtime-matrix-1",
    contractSection: "27 (audit evidence)",
    claim:
      "Rendering FINAL_REPORT.md produces identical bytes on every Node major tested here, given " +
      "unchanged committed evidence. This is what makes the byte-equality gate satisfiable on any " +
      "`node >=18` install rather than only on the patch release that generated the report.",
    notClaimed:
      "That the full 200-seed suite was executed on every major. Only the determinism-critical test " +
      "files listed below were run per runtime; the full suite's runtime is in " +
      "audit/build-environment.json.",
    determinismTestFiles: DETERMINISM_TESTS,
    committedReportSha256: committed,
    runtimes: results,
    distinctRenderedHashes: hashes.size,
    reportBytesAreRuntimeIndependent: hashes.size === 1,
    allRuntimesMatchCommittedReport: results.every((r) => r.matchesCommittedReport === true),
    allDeterminismTestsPass: results.every((r) => r.determinismTests.fail === 0),
  };

  const out = join(ROOT, "audit", "runtime-matrix.json");
  writeFileSync(out, JSON.stringify(record, null, 2));
  console.error(
    `\nruntime-matrix.json: ${results.length} majors, ${hashes.size} distinct rendered hash(es), ` +
    `runtime-independent: ${record.reportBytesAreRuntimeIndependent}, ` +
    `all match committed: ${record.allRuntimesMatchCommittedReport}, ` +
    `all determinism tests pass: ${record.allDeterminismTestsPass}`
  );
  if (!record.reportBytesAreRuntimeIndependent || !record.allDeterminismTestsPass) process.exitCode = 1;
}
