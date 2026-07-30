// @ts-check
/**
 * A controlled FAILING machine-readable run must regenerate the official report
 * with its gate rows, its totals, its completion claim and the overall milestone
 * status all changed — with no source edit (revision-6 repair, M-2 / R6-J).
 *
 * The revision-5 injection proof exercised `deriveGateStatuses()` with a synthetic
 * map. The structural audit's objection was precise and correct: that proves the
 * pure function, not the evidence-to-report path. It never generated a report from a
 * failing run, never read the external evidence files, and could not show the
 * milestone verdict moving — because in revision 5 the verdict was a literal in
 * `src/config/milestoneStatus.js` that no run could reach.
 *
 * These tests copy the whole evidence tree to a temporary directory, edit only
 * machine-readable inputs there, and regenerate the real report from it. Nothing
 * writes to the repository.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { renderFinalReport, parseTap, stripCommentsAndStrings } from "../tools/writeFinalReport.mjs";
import { deriveGateStatuses, deriveMilestoneStatus, readExternalStatuses, GATES, REPAIRS_REQUIRED_STATUS }
  from "../tools/gateRegistry.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** Copy the files the report reads into a scratch tree. Nothing in ROOT is touched. */
function scratchTree() {
  const dir = mkdtempSync(join(tmpdir(), "lineage-report-"));
  for (const rel of ["audit", "src", "tools", "package.json", "AUDIT_PACKAGE_MANIFEST.md"]) {
    cpSync(join(ROOT, rel), join(dir, rel), { recursive: true });
  }
  return dir;
}

/** Rewrite one passing test line in a TAP file as a failing one. */
function failOneTest(tapText, testName) {
  const before = tapText;
  const out = tapText.replace(
    new RegExp(`^ok (\\d+) - ${testName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"),
    (_, n) => `not ok ${n} - ${testName}`
  );
  assert.notEqual(out, before, `the TAP must contain a passing "${testName}" to falsify`);
  return out
    .replace(/^# pass (\d+)$/m, (_, n) => `# pass ${Number(n) - 1}`)
    .replace(/^# fail (\d+)$/m, (_, n) => `# fail ${Number(n) + 1}`);
}

test("§26/§28 — a failing run regenerates a report whose gate, totals and STATUS all change", () => {
  const dir = scratchTree();
  try {
    // Pick a real gate and one of the real tests that evidences it.
    const gate = GATES.find((g) => (g.tests ?? []).length > 0 && g.id !== "fullSuite");
    const victim = gate.tests[0];

    const cleanReport = renderFinalReport({ root: dir });
    const cleanTap = parseTap(readFileSync(join(dir, "audit", "test-results.txt"), "utf8"));
    assert.equal(cleanTap.fail, 0, "the committed run must be green, or this experiment proves nothing");
    assert.ok(cleanReport.includes(`| ${gate.label} |`), "the gate must appear in the clean report");

    // ---- inject: one passing test becomes failing, in the machine-readable input ----
    const tapPath = join(dir, "audit", "test-results.txt");
    writeFileSync(tapPath, failOneTest(readFileSync(tapPath, "utf8"), victim));
    const failedReport = renderFinalReport({ root: dir });

    // 1. that gate's row flips and names the failing test
    const row = failedReport.split("\n").find((l) => l.includes(`| ${gate.label} |`));
    assert.ok(row.includes("**FAIL**"), `${gate.id} must read FAIL:\n  ${row}`);
    assert.ok(row.includes(victim), "and the row must name the test that failed");

    // 2. the whole-suite row flips
    assert.match(failedReport, /\| Full test suite \| §20 \|[^|]*\| \*\*FAIL\*\*/);

    // 3. the §28 completion claim flips
    assert.ok(cleanReport.includes("| every automated result reproducible from a clean run | met"));
    assert.ok(failedReport.includes("| every automated result reproducible from a clean run | NOT met"));
    assert.match(failedReport, /mayDeclareCompletion: false/);

    // 4. the overall MILESTONE STATUS is derived, and names the new blocker
    assert.ok(failedReport.includes(REPAIRS_REQUIRED_STATUS), "the derived status must read blocked");
    assert.match(failedReport, /- the build-blocking suite reported failures/);
    assert.match(failedReport, new RegExp(`automated gate\\(s\\) FAIL: .*${gate.id}`));

    // 5. nothing in the repository changed to make this happen
    assert.equal(read("FINAL_REPORT.md"), renderFinalReport(), "the real report must be untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("§26 — an EXTERNAL status change alone moves the milestone status, with no source edit", () => {
  // The other half of R6-J: external gates are read, not written. Flipping them in
  // the machine-readable input must move the verdict; flipping them to PASS must NOT
  // make an external gate machine-verified.
  const dir = scratchTree();
  try {
    const extPath = join(dir, "audit", "external-gate-status.json");
    const ext = JSON.parse(readFileSync(extPath, "utf8"));

    // As shipped: blocked, and the blocker list names the closure audit.
    const before = renderFinalReport({ root: dir });
    assert.ok(before.includes(REPAIRS_REQUIRED_STATUS));
    assert.match(before, /- independentClosureAudit: PENDING/);

    // Satisfy the closure audit only: the status must move to the NEXT blocker's
    // status, and must still not declare completion.
    ext.gates.independentClosureAudit.status = "SATISFIED";
    writeFileSync(extPath, JSON.stringify(ext, null, 2));
    const partly = renderFinalReport({ root: dir });
    assert.ok(!partly.includes(REPAIRS_REQUIRED_STATUS), "the status must have moved");
    assert.match(partly, /M1_BLOCKED — PHYSICAL IPAD ACCEPTANCE NOT PERFORMED/);
    assert.match(partly, /mayDeclareCompletion: false/);

    // Satisfy everything external: only then may completion be declared — and the
    // Canvas-memory gate is still read from its own measurement file, so it must be
    // satisfied there rather than here.
    ext.gates.ipadGate.status = "PASS";
    ext.gates.stageAOrder.status = "SATISFIED";
    writeFileSync(extPath, JSON.stringify(ext, null, 2));
    const deskPath = join(dir, "audit", "desktop-measurements.json");
    const desk = JSON.parse(readFileSync(deskPath, "utf8"));
    desk.desktopCanvasMemory.status = "MEASURED";
    writeFileSync(deskPath, JSON.stringify(desk, null, 2));

    const all = renderFinalReport({ root: dir });
    assert.match(all, /M1_ALL_GATES_SATISFIED/);
    assert.match(all, /mayDeclareCompletion: true/);
    // ...and even then the external gates are still labelled external, never
    // presented as machine-verified.
    assert.match(all, /None of these is machine-verified/);

    // A forbidden status may never be produced by the derivation.
    for (const forbidden of ["M1_AUTOMATED_GATES_PASS", "M1_ACCEPTED"]) {
      const statusBlock = all.slice(all.indexOf("## Status"), all.indexOf("**This status is DERIVED"));
      assert.ok(!statusBlock.includes(forbidden), `the derivation must never emit ${forbidden}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("§26 — a MISSING external input is UNVERIFIED, never a favourable default", () => {
  const dir = scratchTree();
  try {
    rmSync(join(dir, "audit", "external-gate-status.json"));
    const report = renderFinalReport({ root: dir });
    assert.ok(report.includes(REPAIRS_REQUIRED_STATUS) || /M1_BLOCKED/.test(report));
    assert.match(report, /\| `ipadGate` \| UNVERIFIED \|/);
    assert.match(report, /mayDeclareCompletion: false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("§26 — external gate statuses are read from files, not written in source", () => {
  // A static check that closes the loophole rather than the symptom: no external
  // gate may carry a hardcoded status in the registry.
  // Scanned as CODE: this file documents the removed `fixedStatus` mechanism in
  // comments on purpose, and a mention is not a use.
  const registry = stripCommentsAndStrings(read("tools/gateRegistry.mjs"));
  assert.ok(!/fixedStatus/.test(registry), "revision 5 declared external statuses as `fixedStatus` literals");
  for (const g of GATES.filter((x) => x.evidence === "external")) {
    assert.ok(g.evidenceSource, `${g.id} must name the file its status is read from`);
    assert.ok(existsSync(join(ROOT, g.evidenceSource)), `${g.evidenceSource} must exist`);
    assert.ok(g.determinedBy, `${g.id} must say who determines it`);
  }
  // ...and the milestone status is not a literal in source either.
  const status = read("src/config/milestoneStatus.js");
  assert.ok(!/status:\s*"M1_/.test(status), "the milestone status must not be a source literal");
  assert.match(status, /statusIsDerived: true/);
});

test("§20/§26 — the committed report and gate summary agree with a fresh derivation", () => {
  const tap = parseTap(read("audit/test-results.txt"));
  const external = readExternalStatuses(read);
  const derived = deriveGateStatuses(tap, external);
  const milestone = deriveMilestoneStatus(derived, external);
  const summary = JSON.parse(read("audit/gate-summary.json"));

  assert.deepEqual(summary.milestone, milestone, "the committed summary must match a fresh derivation");
  assert.ok(read("FINAL_REPORT.md").includes(milestone.status));
  // The partition property, checked against the committed file.
  const s = summary.summary;
  assert.equal(
    s.pass + s.fail + s.unverified + s.external,
    s.total,
    `the categories must partition the gates: ${s.pass}+${s.fail}+${s.unverified}+${s.external} != ${s.total}`
  );
});
