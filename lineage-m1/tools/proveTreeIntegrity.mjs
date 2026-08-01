// @ts-check
/**
 * Prove the production source tree cannot be modified or raced by the test suite
 * (contract §20; revision-5 repair, BUG 8 / R5-8).
 *
 * This is the evidence the repair order asks for: run the full suite repeatedly at
 * high concurrency while a watcher samples every file under `src/`, and require that
 * the tree's content hash never changes at any instant, not merely at the end.
 *
 * Revision 4 would fail this. A watcher during its suite observed
 * `src/core/math.js` cycling through three planted variants — including an import of
 * a package that does not exist — because the scanner-teeth test wrote into the live
 * tree while `node --test` ran files in concurrent workers.
 *
 * Usage: node tools/proveTreeIntegrity.mjs [--rounds N]
 * Writes audit/tree-integrity.json
 */

import { writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

/** Every file under src/, sorted. */
function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) { walk(rel); continue; }
      files.push(rel);
    }
  };
  walk("src");
  return files;
}

/** Content hash over the whole tree, plus each file's own hash. */
export function treeSnapshot() {
  const files = sourceFiles();
  const perFile = {};
  const h = createHash("sha256");
  for (const rel of files) {
    const bytes = readFileSync(join(ROOT, rel));
    perFile[rel] = createHash("sha256").update(bytes).digest("hex");
    h.update(rel); h.update(" "); h.update(bytes); h.update(" ");
  }
  return { digest: h.digest("hex"), fileCount: files.length, perFile };
}

/**
 * The round count and the required test total, read from the checked-in config so
 * the generator and the build-blocking test enforce one requirement.
 *
 * @param {string} root
 */
export function readIntegrityConfig(root = ROOT) {
  const config = JSON.parse(readFileSync(join(root, "tree-integrity.config.json"), "utf8"));
  const tap = readFileSync(join(root, config.requiredTestTotalSource), "utf8");
  const plan = tap.match(/^1\.\.(\d+)$/m);
  const summary = tap.match(/^[#\s]*tests\s+(\d+)$/m);
  const requiredTestTotal = plan ? Number(plan[1]) : summary ? Number(summary[1]) : null;
  return { ...config, requiredTestTotal };
}

/**
 * Validate `--rounds` BEFORE any sampling or writing.
 *
 * REVISION-8.1 REPAIR (revision-8 bounded closure audit, Finding 1). The value was
 * parsed with `Number()` and never checked, and `[].every(...)` is `true`, so a run
 * that executed nothing certified itself:
 *
 *   $ node tools/proveTreeIntegrity.mjs --rounds 0
 *   exit=0  rounds=0  runs=0  allRunsGreen=true  proofValid=true
 *   $ node tools/proveTreeIntegrity.mjs --rounds banana
 *   exit=0  rounds=null  runs=0  allRunsGreen=true  proofValid=true
 *
 * Zero, negative, fractional, non-numeric and missing values now fail closed,
 * before the existing record is touched.
 *
 * @param {string[]} args
 * @param {number} requiredRounds
 * @returns {{ok:true, rounds:number}|{ok:false, problem:string}}
 */
export function parseRounds(args, requiredRounds) {
  const idx = args.indexOf("--rounds");
  if (idx < 0) return { ok: true, rounds: requiredRounds };
  const raw = args[idx + 1];
  if (raw === undefined || raw.startsWith("--")) {
    return { ok: false, problem: "--rounds requires a value" };
  }
  if (!/^\d+$/.test(raw.trim())) {
    return {
      ok: false,
      problem: `--rounds must be a whole number, got ${JSON.stringify(raw)}`,
    };
  }
  const rounds = Number(raw.trim());
  if (!Number.isSafeInteger(rounds)) {
    return { ok: false, problem: `--rounds must be a finite integer, got ${JSON.stringify(raw)}` };
  }
  if (rounds < requiredRounds) {
    return {
      ok: false,
      problem: `--rounds must be at least the configured minimum of ${requiredRounds}, got ${rounds}`,
    };
  }
  return { ok: true, rounds };
}

/**
 * Is this record a proof? Positive evidence only — never a vacuous `every()` over
 * an empty array.
 *
 * @param {any} record
 * @param {{requiredRounds:number, requiredTestTotal:number|null}} config
 */
export function evaluateProof(record, config) {
  const problems = [];
  const runs = Array.isArray(record.runs) ? record.runs : [];
  if (runs.length === 0) problems.push("no round was executed");
  if (runs.length !== record.rounds) {
    problems.push(`${runs.length} round(s) recorded for a requested ${record.rounds}`);
  }
  if (runs.length < config.requiredRounds) {
    problems.push(`fewer than the required ${config.requiredRounds} round(s)`);
  }
  if (!(record.samplesTaken > 0)) problems.push("no sample was taken; nothing was watched");
  if (!record.treeUnchangedThroughout) problems.push("the source tree changed during the runs");
  if ((record.deviations ?? []).length > 0) problems.push("a source deviation was sampled");
  for (const [i, r] of runs.entries()) {
    if (!r.parsed) { problems.push(`round ${i + 1}: the suite summary could not be parsed`); continue; }
    if (r.fail !== 0 || r.exitCode !== 0) problems.push(`round ${i + 1}: the suite run was not green`);
    if (config.requiredTestTotal !== null && r.tests !== config.requiredTestTotal) {
      problems.push(
        `round ${i + 1}: ran ${r.tests} test(s), not the required ${config.requiredTestTotal}`
      );
    }
  }
  return { proofValid: problems.length === 0, problems };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const config = readIntegrityConfig();
  const parsedRounds = parseRounds(args, config.requiredRounds);
  if (!parsedRounds.ok) {
    console.error(
      `REFUSING to run: ${parsedRounds.problem}.\n` +
      "No sampling was performed and audit/tree-integrity.json was NOT replaced."
    );
    process.exit(1);
  }
  const rounds = parsedRounds.rounds;
  const concurrency = Math.max(4, cpus().length);

  const baseline = treeSnapshot();
  console.error(`baseline: ${baseline.fileCount} files, digest ${baseline.digest.slice(0, 16)}…`);
  console.error(`running ${rounds} round(s) of the full suite at concurrency ${concurrency}`);

  /** @type {Array<{atMs:number, digest:string, changedFiles:string[]}>} */
  const deviations = [];
  let samples = 0;
  let running = true;
  const started = Date.now();

  // Sample as fast as the filesystem allows for the whole duration of the runs.
  const sample = () => {
    if (!running) return;
    samples++;
    const now = treeSnapshot();
    if (now.digest !== baseline.digest) {
      const changed = Object.keys(baseline.perFile).filter(
        (k) => baseline.perFile[k] !== now.perFile[k]
      );
      const added = Object.keys(now.perFile).filter((k) => !(k in baseline.perFile));
      const removed = Object.keys(baseline.perFile).filter((k) => !(k in now.perFile));
      deviations.push({
        atMs: Date.now() - started,
        digest: now.digest,
        changedFiles: [...changed, ...added.map((a) => `+${a}`), ...removed.map((r) => `-${r}`)],
      });
    }
    setImmediate(sample);
  };
  setImmediate(sample);

  /**
   * Run the suite once.
   *
   * REVISION-8 REPAIR (revision-7 structural audit, Finding 2, second half). The
   * parser recognised only `# tests`-style TAP summary lines. Under Node 24 the
   * default reporter emitted a different form, so a fresh one-round run recorded
   *
   *   round 1: null/null, null failing, exit 0
   *   allRunsGreen: false        process exit: 0
   *
   * and the command still succeeded. The reporter is pinned to TAP so the output
   * form is not the runtime's choice, and an unparseable round is recorded as such
   * and fails the command.
   */
  const runSuite = () => new Promise((res) => {
    const child = spawn(
      "sh",
      ["-c",
        `node --test --test-reporter=tap --test-timeout=3600000 ` +
        `--test-concurrency=${concurrency} test/*.test.js`],
      {
        cwd: ROOT,
        // Marks the suite as running INSIDE this proof. The record-validity test
        // asserts `proofValid` only outside that context: while the proof is being
        // produced, the record on disk is still the previous run's, so requiring it
        // to be valid here would make a failed record permanently unfixable.
        env: { ...process.env, LINEAGE_IN_TREE_INTEGRITY: "1" },
      }
    );
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => {
      const grab = (k) => {
        const m = out.match(new RegExp(`^[#\\s]*${k}\\s+(\\d+)$`, "m"));
        return m ? Number(m[1]) : null;
      };
      const tests = grab("tests");
      const pass = grab("pass");
      const fail = grab("fail");
      const parsed = tests !== null && pass !== null && fail !== null;
      res({
        exitCode: code,
        tests, pass, fail,
        parsed,
        parseNote: parsed ? null : "the suite summary could not be parsed from this run's output",
        failing: [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]),
      });
    });
  });

  const runs = [];
  for (let r = 0; r < rounds; r++) {
    const result = await runSuite();
    runs.push(result);
    console.error(
      `round ${r + 1}: ${result.pass}/${result.tests}, ${result.fail} failing, exit ${result.exitCode}` +
      (result.failing.length ? `\n  ${result.failing.join("\n  ")}` : "")
    );
  }
  running = false;

  const final = treeSnapshot();
  // `runs.length > 0` is required explicitly: `[].every(...)` is true, which is how
  // a zero-round run certified itself before revision 8.1.
  const allRunsParsed = runs.length > 0 && runs.every((r) => r.parsed);
  const allRunsGreen =
    runs.length > 0 && runs.every((r) => r.parsed && r.fail === 0 && r.exitCode === 0);
  const record = {
    schema: "lineage-m1-tree-integrity-3",
    requiredRounds: config.requiredRounds,
    requiredTestTotal: config.requiredTestTotal,
    contractSection: "20 (build-blocking suite integrity)",
    claim:
      "The production source tree under src/ is never modified at any instant while the full suite " +
      "runs at high concurrency. Sampled continuously, not merely compared before and after.",
    concurrency,
    rounds,
    samplesTaken: samples,
    baselineDigest: baseline.digest,
    finalDigest: final.digest,
    fileCount: baseline.fileCount,
    treeUnchangedThroughout: deviations.length === 0 && final.digest === baseline.digest,
    deviations,
    runs,
    allRunsParsed,
    allRunsGreen,
  };
  // REVISION-8 (Finding 2): a proof whose own rounds were red or unparseable is not
  // a proof. REVISION-8.1 (Finding 1): nor is one that executed nothing, sampled
  // nothing, or ran a suite other than the one that ships. `proofValid` is the one
  // field the build-blocking test reads, and it is now positive evidence only.
  const verdict = evaluateProof(record, config);
  record.proofValid = verdict.proofValid;
  record.proofProblems = verdict.problems;
  writeFileSync(join(ROOT, "audit", "tree-integrity.json"), JSON.stringify(record, null, 2));
  console.error(
    `\ntree-integrity.json: ${samples} samples across ${rounds} run(s), ` +
    `deviations ${deviations.length}, unchanged throughout: ${record.treeUnchangedThroughout}, ` +
    `all runs parsed: ${allRunsParsed}, all runs green: ${allRunsGreen}, ` +
    `proof valid: ${record.proofValid}`
  );
  if (!record.proofValid) {
    for (const problem of verdict.problems) console.error(`  PROBLEM: ${problem}`);
    console.error(
      "\nThis evidence does NOT prove the claim, so the command exits nonzero rather than " +
      "recording a proof it did not obtain."
    );
    process.exitCode = 1;
  }
}
