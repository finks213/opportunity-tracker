// @ts-check
/**
 * The acceptance tooling must fail closed on hostile or degenerate input
 * (revision-8.1 repair, revision-8 bounded closure audit, Findings 1-4).
 *
 * All four were reproduced against the delivered
 * `LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV8.zip`
 * (SHA-256 a3c6feb1d96f80526584300cf6ef13729e99f3c6a791ca91dc7da753d09dbd65):
 *
 *   $ node tools/proveTreeIntegrity.mjs --rounds 0
 *   exit=0  rounds=0  runs=0  allRunsGreen=true  proofValid=true
 *   $ node tools/proveTreeIntegrity.mjs --rounds banana
 *   exit=0  rounds=null  runs=0  allRunsGreen=true  proofValid=true
 *
 *   synthetic all-green input, stageAOrder proposing status prose ->
 *   {"status":"M1_BLOCKED — TOTALLY FABRICATED\nM1_ACCEPTED","rejectedStatusStrings":[]}
 *
 *   dirty tracked nested/audit/provenance.json -> writer exited 0, "working tree clean: false"
 *   provisional record (--allow-dirty)         -> strict verifier printed "PROVENANCE OK", exit 0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  parseRounds, evaluateProof, readIntegrityConfig,
} from "../tools/proveTreeIntegrity.mjs";
import { deliveryDisqualifiers } from "../tools/verifyProvenance.mjs";
import {
  deriveGateStatuses, deriveMilestoneStatus, isContractAuthorisedStatus,
  blockedStatusForGate, CONTRACT_STATUS, REPAIRS_REQUIRED_STATUS,
} from "../tools/gateRegistry.mjs";
import { parseTap } from "../tools/writeFinalReport.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const CONFIG = readIntegrityConfig(ROOT);

/* ------------------------------------------------------------------ Finding 1 */

test("§20 — every invalid --rounds value is refused, at the command level", () => {
  // The audit's exact falsifiers, run as commands against the shipped tool. Each
  // must exit nonzero AND leave the committed record untouched.
  const before = read("audit/tree-integrity.json");
  for (const argv of [["--rounds", "0"], ["--rounds", "-1"], ["--rounds", "1.5"],
    ["--rounds", "banana"], ["--rounds"], ["--rounds", ""], ["--rounds", "1e3"],
    ["--rounds", "Infinity"], ["--rounds", "NaN"], ["--rounds", " 0 "]]) {
    let exitCode = 0;
    let output = "";
    try {
      output = execFileSync(
        process.execPath, ["tools/proveTreeIntegrity.mjs", ...argv],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
      );
    } catch (err) {
      exitCode = err.status ?? 1;
      output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    assert.equal(exitCode, 1, `\`--rounds ${argv[1] ?? "(missing)"}\` must exit nonzero`);
    assert.match(output, /REFUSING to run/, "and say why, before doing any work");
    assert.match(output, /was NOT replaced/, "and state that the record was left alone");
  }
  assert.equal(read("audit/tree-integrity.json"), before, "no invalid run may touch the record");
});

test("§20 — a valid round count below the configured minimum is refused", () => {
  const required = CONFIG.requiredRounds;
  assert.ok(Number.isSafeInteger(required) && required >= 1, "the config must state a minimum");
  for (let r = 0; r < required; r++) {
    const v = parseRounds(["--rounds", String(r)], required);
    assert.equal(v.ok, false, `${r} rounds is below the minimum ${required}`);
  }
  assert.deepEqual(parseRounds(["--rounds", String(required)], required), { ok: true, rounds: required });
  assert.deepEqual(parseRounds([], required), { ok: true, rounds: required }, "the default meets it");
});

test("§20 — an empty run list can never be a proof", () => {
  // The defect itself: `[].every(...)` is true.
  const empty = {
    rounds: 0, runs: [], samplesTaken: 0, deviations: [], treeUnchangedThroughout: true,
  };
  const v = evaluateProof(empty, CONFIG);
  assert.equal(v.proofValid, false, "zero executed rounds must not certify");
  assert.ok(v.problems.some((p) => /no round was executed/.test(p)));
  assert.ok(v.problems.some((p) => /no sample was taken/.test(p)));
});

test("§20 — a proof requires the full shipped suite in every round", () => {
  const total = CONFIG.requiredTestTotal;
  assert.ok(Number.isSafeInteger(total) && total > 0, "the required total must be read from the TAP");
  const round = (over = {}) => ({ parsed: true, fail: 0, exitCode: 0, tests: total, ...over });
  const base = {
    rounds: CONFIG.requiredRounds, samplesTaken: 10, deviations: [], treeUnchangedThroughout: true,
    runs: Array.from({ length: CONFIG.requiredRounds }, () => round()),
  };
  assert.equal(evaluateProof(base, CONFIG).proofValid, true, "the good case must still pass");

  const cases = [
    ["a truncated suite", { tests: total - 1 }, /not the required/],
    ["a red round", { fail: 1 }, /not green/],
    ["a nonzero exit", { exitCode: 1 }, /not green/],
    ["an unparseable round", { parsed: false }, /could not be parsed/],
  ];
  for (const [label, over, pattern] of cases) {
    const rec = { ...base, runs: [round(over), ...base.runs.slice(1)] };
    const v = evaluateProof(rec, CONFIG);
    assert.equal(v.proofValid, false, `${label} must not certify`);
    assert.ok(v.problems.some((p) => pattern.test(p)), `${label}: ${v.problems.join("; ")}`);
  }
  for (const [label, over, pattern] of [
    ["a sampled deviation", { deviations: [{ atMs: 1 }] }, /deviation was sampled/],
    ["a changed tree", { treeUnchangedThroughout: false }, /tree changed/],
    ["no sampling", { samplesTaken: 0 }, /no sample/],
    ["fewer rounds than requested", { rounds: CONFIG.requiredRounds + 1 }, /round\(s\) recorded/],
  ]) {
    const v = evaluateProof({ ...base, ...over }, CONFIG);
    assert.equal(v.proofValid, false, `${label} must not certify`);
    assert.ok(v.problems.some((p) => pattern.test(p)), `${label}: ${v.problems.join("; ")}`);
  }
});

/* ------------------------------------------------------------------ Finding 2 */

/** A synthetic fully green run, so this file tests the derivation, not the repo. */
const GREEN = (() => {
  const committed = parseTap(read("audit/test-results.txt"));
  const perTest = new Map();
  for (const name of committed.perTest.keys()) perTest.set(name, true);
  return { tests: perTest.size, pass: perTest.size, fail: 0, perTest };
})();

const HOSTILE = [
  "M1_BLOCKED — TOTALLY FABRICATED\nM1_ACCEPTED",
  "M1_BLOCKED — FABRICATED",
  "M1_ACCEPTED",
  "M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING",
  "M1_BLOCKED \u2014 \u0007ring\u0000",
  "M1_BLOCKED — ok\r\nM1_ACCEPTED",
  "M1_ALL_GATES_SATISFIED",
  "",
];

test("§26 — no evidence-supplied string can become the milestone status", () => {
  const AUTHORISED = new Set(Object.values(CONTRACT_STATUS).filter((s) => s !== CONTRACT_STATUS.BLOCKED));
  for (const hostile of HOSTILE) {
    const external = {
      desktopCanvasMemory: { status: "MEASURED", priority: 9 },
      ipadGate: { status: "PASS", priority: 2 },
      independentClosureAudit: { status: "SATISFIED", priority: 1 },
      stageAOrder: { status: "VIOLATED", priority: 3, milestoneStatusWhenUnsatisfied: hostile },
    };
    const m = deriveMilestoneStatus(deriveGateStatuses(GREEN, external), external);

    assert.equal(m.status, blockedStatusForGate("stageAOrder"), "the status must come from source");
    assert.ok(isContractAuthorisedStatus(m.status));
    assert.equal(m.mayDeclareCompletion, false);
    // Nothing of the hostile string may survive anywhere in the published status.
    assert.ok(!m.status.includes("FABRICATED"), "fabricated text must not be published");
    assert.ok(!/[\u0000-\u001f]/.test(m.status), "no control character may reach the status");
    assert.equal(m.status.split("\n").length, 1, "the status must be exactly one line");
    assert.ok(
      !AUTHORISED.has(m.status) || m.status !== CONTRACT_STATUS.ACCEPTED,
      "an unsatisfied gate can never produce acceptance"
    );
    if (hostile.length > 0) {
      assert.ok(
        m.rejectedStatusStrings.some((s) => s.includes("stageAOrder")),
        "and the refusal must be recorded, not silent"
      );
    }
  }
});

test("§26 — the blocked sentence is chosen by gate id from source-controlled text", () => {
  for (const id of ["independentClosureAudit", "ipadGate", "stageAOrder", "desktopCanvasMemory"]) {
    const s = blockedStatusForGate(id);
    assert.ok(isContractAuthorisedStatus(s), `${id} must map to an authorised status`);
    assert.ok(s.startsWith(`${CONTRACT_STATUS.BLOCKED} — `), `${id} must map to a BLOCKED status`);
  }
  // An unknown gate cannot name its own reason.
  assert.equal(blockedStatusForGate("gate-that-does-not-exist"), REPAIRS_REQUIRED_STATUS);
  assert.equal(blockedStatusForGate("__proto__"), REPAIRS_REQUIRED_STATUS);
  assert.equal(blockedStatusForGate("constructor"), REPAIRS_REQUIRED_STATUS);
});

test("§26 — the shipped evidence file carries typed conditions, not status prose", () => {
  const doc = JSON.parse(read("audit/external-gate-status.json"));
  for (const [id, gate] of Object.entries(doc.gates)) {
    assert.equal(
      gate.milestoneStatusWhenUnsatisfied, undefined,
      `${id} must not supply report-ready status prose`
    );
    assert.equal(typeof gate.blocksMilestone, "boolean", `${id} must state a typed condition`);
    assert.equal(typeof gate.status, "string");
  }
  // No gate record may contain a milestone sentence in ANY field.
  for (const [id, gate] of Object.entries(doc.gates)) {
    for (const [key, value] of Object.entries(gate)) {
      if (typeof value !== "string" || key === "note") continue;
      assert.ok(
        !/^M1_(BLOCKED|ACCEPTED|AUTOMATED_GATES_PASS)/.test(value),
        `${id}.${key} reads as a milestone status: ${value}`
      );
    }
  }
});

test("§26 — the generated report shows only the derived status", () => {
  const report = read("FINAL_REPORT.md");
  const summary = JSON.parse(read("audit/gate-summary.json"));
  assert.ok(isContractAuthorisedStatus(summary.milestone.status));
  assert.ok(report.includes(summary.milestone.status), "the report must show the derived status");
  for (const forbidden of ["FABRICATED", "M1_ALL_GATES_SATISFIED"]) {
    assert.ok(!report.includes(forbidden), `the report must not contain ${forbidden}`);
  }
});

/* ---------------------------------------------------------------- Finding 3/4 */

/** A throwaway git repository containing a copy of the project. */
function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "lineage-prov-"));
  const project = join(dir, "lineage-m1");
  mkdirSync(project, { recursive: true });
  for (const entry of ["src", "test", "tools", "audit", "fixtures", "package.json",
    "FINAL_REPORT.md", "AUDIT_PACKAGE_MANIFEST.md", "index.html", "runtime-matrix.config.json",
    "tree-integrity.config.json"]) {
    cpSync(join(ROOT, entry), join(project, entry), { recursive: true });
  }
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@example.invalid");
  git("config", "user.name", "t");
  mkdirSync(join(project, "nested", "audit"), { recursive: true });
  writeFileSync(join(project, "nested", "audit", "provenance.json"), '{"decoy":1}\n');
  git("add", "-A");
  git("commit", "-qm", "base");
  return { dir, project, git };
}

/**
 * Run a tool in the scratch project; never throws.
 *
 * `spawnSync`, not `execFileSync`: these tools print their summary and their
 * refusals on stderr, which `execFileSync` discards on a zero exit.
 */
function runTool(project, tool, args = []) {
  const r = spawnSync(process.execPath, [`tools/${tool}`, ...args],
    { cwd: project, encoding: "utf8" });
  return { exitCode: r.status ?? 1, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

test("§23/§27 — only the EXACT root record is exempt from the dirty-tree refusal", () => {
  const { dir, project } = scratchRepo();
  try {
    const good = runTool(project, "writeProvenance.mjs");
    assert.equal(good.exitCode, 0, `a clean tree must be writable: ${good.output}`);
    const valid = readFileSync(join(project, "audit", "provenance.json"), "utf8");

    // The audit's falsifier: a tracked path that merely ENDS with the record's name.
    writeFileSync(join(project, "nested", "audit", "provenance.json"), '{"decoy":2}\n');
    const r = runTool(project, "writeProvenance.mjs");
    assert.equal(r.exitCode, 1, `nested/audit/provenance.json must not be exempt: ${r.output}`);
    assert.match(r.output, /REFUSING to write/);
    assert.match(r.output, /nested\/audit\/provenance\.json/);
    assert.equal(
      readFileSync(join(project, "audit", "provenance.json"), "utf8"), valid,
      "the valid record must survive the refusal"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("§23/§27 — strict verification refuses a provisional record", () => {
  const { dir, project } = scratchRepo();
  try {
    // 1. a dirty tree
    const math = join(project, "src", "core", "math.js");
    writeFileSync(math, `${readFileSync(math, "utf8")}\n// dirty\n`);

    // 2. a provisional record, via the permitted local override
    const written = runTool(project, "writeProvenance.mjs", ["--allow-dirty"]);
    assert.equal(written.exitCode, 0, written.output);
    assert.match(written.output, /PROVISIONAL/);
    const rec = JSON.parse(readFileSync(join(project, "audit", "provenance.json"), "utf8"));
    assert.ok(rec.provisional, "the record must say so");
    assert.match(
      JSON.stringify(rec.provisional), /NOT a delivery record/,
      "and say why, in the record itself"
    );
    assert.deepEqual(
      deliveryDisqualifiers(rec).length > 0, true,
      "and the verifier must be able to tell"
    );

    // 3. strict verification
    const strict = runTool(project, "verifyProvenance.mjs");

    // 4. nonzero, and never the strict success line
    assert.equal(strict.exitCode, 1, `strict verification must fail: ${strict.output}`);
    assert.ok(!/^PROVENANCE OK$/m.test(strict.output), "a provisional record must never verify OK");
    assert.match(strict.output, /provisional/i);
    assert.match(strict.output, /unsuitable for delivery/i);

    // The named diagnostic mode may inspect it, but never returns the strict verdict.
    const diag = runTool(project, "verifyProvenance.mjs", ["--accept-provisional"]);
    assert.ok(!/^PROVENANCE OK$/m.test(diag.output), "not even in diagnostic mode");
    assert.match(diag.output, /NOT a delivery verification/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("§23/§27 — every disqualifying marker is caught, not just `provisional`", () => {
  assert.deepEqual(deliveryDisqualifiers({ source: { workingTreeClean: true } }), []);
  for (const rec of [
    { provisional: true },
    { workingTreeClean: false },
    { deliveryEligible: false },
    { allowDirty: true },
    { source: { workingTreeClean: false } },
  ]) {
    assert.ok(deliveryDisqualifiers(rec).length > 0, `${JSON.stringify(rec)} must disqualify`);
  }
});

/* ------------------------------------------------------------------ Finding 5 */

test("§27 — active text does not claim every shipped file is internally hashed", () => {
  // The claim is false by construction: the record cannot hash itself.
  const active = ["AUDIT_PACKAGE_MANIFEST.md", "README.md", "FINAL_REPORT.md",
    "REVISION_8_1_DELIVERY_CORRECTION.md", "tools/writeProvenance.mjs", "tools/verifyProvenance.mjs"];
  for (const rel of active) {
    let text;
    try { text = read(rel); } catch { continue; }
    for (const [i, line] of text.split("\n").entries()) {
      if (!/every shipped file|all shipped files/i.test(line)) continue;
      assert.ok(
        /except|EXCEPT/.test(line),
        `${rel}:${i + 1} claims every shipped file is covered without the exception:\n  ${line.trim()}`
      );
    }
  }
});

test("§27 — the manifest states shipped, recorded and excluded counts, all computed", () => {
  const manifest = read("AUDIT_PACKAGE_MANIFEST.md");
  // Checked against the manifest's OWN generated inventory, which is produced from
  // disk by `tools/writeManifestPaths.mjs` and staleness-checked by
  // `test/manifest-inventory.test.js`. Deliberately NOT against
  // `audit/provenance.json`: that record is rewritten at the end of the delivery
  // sequence, so binding this assertion to it would make the check depend on the
  // order artifacts happen to be regenerated in rather than on their agreement.
  const inventory = manifest.match(/^\*\*(\d+) files\.\*\*$/m);
  assert.ok(inventory, "the generated inventory must state a file count");
  const shipped = Number(inventory[1]);
  const listed = [...manifest.matchAll(/^- `([^`]+)`$/gm)].map((m) => m[1]);
  assert.equal(listed.length, shipped, "the stated count must equal the listed paths");
  assert.ok(listed.includes("audit/provenance.json"), "the record itself ships");
  assert.match(
    manifest,
    new RegExp(`The archive ships ${shipped} files\\. ${shipped - 1} files are internally recorded`),
    `the sentence must state ${shipped} shipped and ${shipped - 1} recorded`
  );
  assert.match(manifest, /`audit\/provenance\.json` is excluded because it cannot hash itself/);
  assert.match(manifest, /ZIP SHA-256 binds the complete archive, including that record/);
});
