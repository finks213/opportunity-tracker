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

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const roundsIdx = args.indexOf("--rounds");
  const rounds = roundsIdx >= 0 ? Number(args[roundsIdx + 1]) : 3;
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

  /** Run the suite once. */
  const runSuite = () => new Promise((res) => {
    const child = spawn(
      "sh",
      ["-c", `node --test --test-timeout=3600000 --test-concurrency=${concurrency} test/*.test.js`],
      { cwd: ROOT }
    );
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => {
      const grab = (k) => {
        const m = out.match(new RegExp(`^# ${k} (\\d+)$`, "m"));
        return m ? Number(m[1]) : null;
      };
      res({
        exitCode: code,
        tests: grab("tests"),
        pass: grab("pass"),
        fail: grab("fail"),
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
  const record = {
    schema: "lineage-m1-tree-integrity-1",
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
    allRunsGreen: runs.every((r) => r.fail === 0 && r.exitCode === 0),
  };
  writeFileSync(join(ROOT, "audit", "tree-integrity.json"), JSON.stringify(record, null, 2));
  console.error(
    `\ntree-integrity.json: ${samples} samples across ${rounds} run(s), ` +
    `deviations ${deviations.length}, unchanged throughout: ${record.treeUnchangedThroughout}, ` +
    `all runs green: ${record.allRunsGreen}`
  );
  if (!record.treeUnchangedThroughout) process.exitCode = 1;
}
