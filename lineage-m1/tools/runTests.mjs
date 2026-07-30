// @ts-check
/**
 * Run the official suite and publish its raw output atomically.
 *
 * Revision-4 repair. `FINAL_REPORT.md` is generated from
 * `audit/test-results.txt`, and `test/report-integrity.test.js` checks that the
 * two agree. Capturing the suite with `npm test | tee audit/test-results.txt`
 * truncates that file at the moment the run starts, so the integrity test read a
 * half-written file describing the very run that was executing it — it could
 * never pass, and the failure said nothing about whether the report was correct.
 *
 * This runner writes to `audit/test-results.txt.partial` and renames it over
 * `audit/test-results.txt` only after the suite exits. During a run, the
 * integrity test therefore compares the report against the last COMPLETE run,
 * which is the pair an auditor actually receives.
 *
 * The committed pair is consistent when a run reports 0 failures against a report
 * generated from the previous run's counts. Reaching that takes a short
 * regenerate-and-rerun cycle, which is expected and is why this tool prints the
 * next step.
 *
 * Usage: npm run audit:tests
 */

import { createWriteStream, renameSync, readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parseTap } from "./writeFinalReport.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const FINAL = join(ROOT, "audit", "test-results.txt");
const PARTIAL = `${FINAL}.partial`;

/** The official command, kept identical to `npm test`. */
export const SUITE_ARGS = ["--test", "--test-timeout=3600000", "test/*.test.js"];

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const previous = existsSync(FINAL) ? parseTap(readFileSync(FINAL, "utf8")) : null;
  if (previous) {
    console.error(
      `previous complete run: ${previous.pass}/${previous.tests}, ${previous.fail} failures ` +
      "(this is what report-integrity compares against during the run)"
    );
  }

  const out = createWriteStream(PARTIAL);
  // The glob is expanded by the shell, exactly as `npm test` does it.
  const child = spawn("sh", ["-c", `node ${SUITE_ARGS.join(" ")}`], { cwd: ROOT });
  child.stdout.pipe(out);
  child.stdout.pipe(process.stderr);
  child.stderr.pipe(out);
  child.stderr.pipe(process.stderr);

  child.on("close", (code) => {
    out.end(() => {
      renameSync(PARTIAL, FINAL);
      const tap = parseTap(readFileSync(FINAL, "utf8"));
      console.error("");
      console.error(`published audit/test-results.txt: ${tap.pass}/${tap.tests}, ${tap.fail} failures, exit ${code}`);
      if (tap.fail !== 0) {
        console.error("NEXT: fix the failures, or if they are report-integrity failures run");
        console.error("      `npm run report:final && npm run audit:tests` to converge the pair.");
      } else if (previous && (previous.tests !== tap.tests || previous.fail !== 0)) {
        console.error("NEXT: `npm run report:final && npm run audit:tests` — the report still");
        console.error("      describes the previous run; one more cycle makes the pair consistent.");
      } else {
        console.error("The report and the raw results are consistent and green.");
      }
      process.exitCode = code ?? 1;
    });
  });
}
