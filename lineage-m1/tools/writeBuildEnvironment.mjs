// @ts-check
/**
 * Record the environment of the official evidence run as committed evidence.
 *
 * Revision-5 repair (BUG 6 / R5-6). `FINAL_REPORT.md` embedded the LIVE
 * `process.version`, `process.platform` and `process.arch`, and the suite requires
 * the committed report to be byte-identical to a fresh render. So the report could
 * only match on the exact Node patch release that generated it:
 *
 *   Node v22.22.2  ->  249 passed, 0 failed, exit 0
 *   Node v20.20.2  ->  12 passed, 1 failed   (report byte equality)
 *   Node v24.14.0  ->  248 passed, 1 failed  (auditor's run, same cause)
 *
 * All three satisfy the declared `node >=18` engine range, so a clean supported
 * environment could not run the advertised build-blocking suite.
 *
 * THE FIX, and what it deliberately does NOT do. Node support stays at `>=18`.
 * The code genuinely does not require anything narrower — it uses only stable
 * built-ins and `node:test`, and the suite passes on 20, 22 and 24 once the report
 * stops embedding the verifier's runtime. Pinning an exact runtime merely to
 * preserve an embedded version line would be fixing the artifact to suit the bug.
 *
 * Instead the environment of the OFFICIAL evidence run is captured here, once, into
 * `audit/build-environment.json`. `FINAL_REPORT.md` reads that file, so the report
 * describes the environment that produced the evidence rather than the environment
 * of whoever re-renders it. Report bytes become runtime-independent.
 *
 * Usage: node tools/writeBuildEnvironment.mjs
 */

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

/**
 * The environment of this run, as evidence.
 * @returns {Object}
 */
export function buildEnvironmentRecord() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  return {
    schema: "lineage-m1-build-environment-1",
    contractSection: "27 (audit evidence)",
    note:
      "The environment of the OFFICIAL evidence run, captured once by " +
      "`npm run audit:environment`. FINAL_REPORT.md reads this file instead of the live " +
      "runtime, so report bytes do not depend on which supported Node version re-renders " +
      "them. Regenerate this only when regenerating the evidence it describes.",
    evidenceRun: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      v8: process.versions.v8,
      // Endianness matters for nothing here, but recording it costs nothing and
      // makes the record complete for a float-sensitive model.
      endianness: new DataView(new Uint16Array([1]).buffer).getUint16(0, true) === 1 ? "LE" : "BE",
    },
    declaredSupport: {
      engines: pkg.engines,
      policy:
        "Node >=18, unchanged. The implementation uses only stable built-ins and node:test; " +
        "nothing in it requires a narrower range. Report determinism is achieved by keeping the " +
        "verifier's runtime out of the report bytes, not by pinning the runtime.",
      verifiedMajors: "recorded in audit/runtime-matrix.json by `npm run audit:runtime-matrix`",
    },
  };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const out = join(ROOT, "audit", "build-environment.json");
  const record = buildEnvironmentRecord();
  writeFileSync(out, JSON.stringify(record, null, 2));
  console.log(
    `build-environment.json: ${record.evidenceRun.nodeVersion} · ` +
    `${record.evidenceRun.platform} ${record.evidenceRun.arch} (engines ${record.declaredSupport.engines.node})`
  );
}
