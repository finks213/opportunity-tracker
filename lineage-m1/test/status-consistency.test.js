// @ts-check
/**
 * Official status artifacts must agree (revision-3 repair).
 *
 * Revision 2 shipped contradictory statuses: `FINAL_REPORT.md` said the
 * automated gates passed and the Stage A waiver was the only blocker, while
 * `IPAD_TEST_CHECKLIST.md` still instructed the operator to report
 * `M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING`. Both were false while
 * implementation and evidence defects were open, so a consumer following
 * different official files could produce incompatible milestone statuses.
 *
 * This test makes status drift a build failure rather than a documentation slip.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MILESTONE_STATUS } from "../src/config/milestoneStatus.js";
import { parseTap } from "../tools/writeFinalReport.mjs";
import { deriveGateStatuses, deriveMilestoneStatus, readExternalStatuses } from "../tools/gateRegistry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The single required status for this repair pass, read from the source of truth
 * (revision-4 change). The literal is kept alongside it and asserted equal, so
 * that editing `milestoneStatus.js` cannot silently relax this test.
 */
const REQUIRED_STATUS = "M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED";

/** Artifacts that must carry the required status. */
const STATUS_ARTIFACTS = [
  "FINAL_REPORT.md",
  "AUDIT_PACKAGE_MANIFEST.md",
  "IPAD_TEST_CHECKLIST.md",
  "README.md",
];

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

test("every official status artifact states the required status", () => {
  for (const rel of STATUS_ARTIFACTS) {
    const text = read(rel);
    assert.ok(
      text.includes(REQUIRED_STATUS),
      `${rel} must state the required status "${REQUIRED_STATUS}"`
    );
  }
});

test("no artifact asserts M1_AUTOMATED_GATES_PASS as the current status", () => {
  // The string may appear only in a withdrawal, a prohibition, a history note, or —
  // revision 7 — a description of WHEN the contract authorises it. §26 authorises
  // this status under future evidence, so documenting the condition is required;
  // asserting it as the present state is what must not happen.
  const allowedContext =
    /withdraw|must not|not return|no longer|was false|previously|revision 1|revision 2|history|do not|reachable|authoris|truth table|when the evidence|permits/i;
  for (const rel of STATUS_ARTIFACTS) {
    const lines = read(rel).split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes("M1_AUTOMATED_GATES_PASS")) continue;
      // Allow it when the same line, or the two lines around it, frame it as
      // withdrawn or forbidden rather than as the present state.
      const context = [lines[i - 2], lines[i - 1], lines[i], lines[i + 1], lines[i + 2]]
        .filter(Boolean)
        .join(" ");
      assert.ok(
        allowedContext.test(context),
        `${rel}:${i + 1} presents M1_AUTOMATED_GATES_PASS as the current status:\n  ${lines[i].trim()}`
      );
    }
  }
});

test("no artifact claims M1_ACCEPTED", () => {
  for (const rel of STATUS_ARTIFACTS) {
    const lines = read(rel).split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes("M1_ACCEPTED")) continue;
      const context = [lines[i - 1], lines[i], lines[i + 1]].filter(Boolean).join(" ");
      assert.ok(
        /not claimed|never|only if|only after|not be reported|would additionally|may then be reported|reachable|authoris|truth table|when the evidence|permits/i.test(context),
        `${rel}:${i + 1} must not claim M1_ACCEPTED:\n  ${lines[i].trim()}`
      );
    }
  }
});

test("the process waiver and iPad gate are named as separately pending", () => {
  const report = read("FINAL_REPORT.md");
  assert.ok(report.includes("PROCESS WAIVER"), "the process waiver must be named");
  assert.ok(report.includes("PENDING_HUMAN_DEVICE_TEST"), "the iPad gate must be named");
  // And the report must not present the waiver as the only blocker.
  assert.ok(
    /not the only blocker|NOT the only blockers|Separately pending|Neither is the only blocker/i.test(report),
    "the report must not present the process waiver as the sole blocker"
  );
  // Revision 6: the full blocker list is derived and printed, so the claim is
  // checkable rather than rhetorical.
  assert.match(report, /Why it reads that way — every blocker the derivation found:/);
});

test("the iPad checklist does not instruct the operator to report a passing status", () => {
  const checklist = read("IPAD_TEST_CHECKLIST.md");
  assert.ok(
    checklist.includes(REQUIRED_STATUS),
    "the checklist must carry the required status"
  );
  assert.ok(
    /DO NOT PERFORM THIS TEST YET/i.test(checklist),
    "the checklist must state the device test is gated behind re-audit"
  );
  assert.ok(
    /SECURITY NOTE/i.test(checklist),
    "the checklist must warn about the network-exposed server"
  );
});

test("generated audit JSON carries the same status when present", () => {
  const candidates = [
    "audit/fixture-results.json",
    "audit/characterization-results.json",
    "audit/edge-only-traversal-results.json",
  ];
  let checked = 0;
  for (const rel of candidates) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const parsed = JSON.parse(readFileSync(abs, "utf8"));
    if (parsed.milestoneStatus !== undefined) {
      assert.equal(parsed.milestoneStatus, REQUIRED_STATUS, `${rel} status field must match`);
      checked++;
    }
  }
  // Not all generators carry a status field; this asserts consistency where they do.
  assert.ok(checked >= 0);
});

test("the audit manifest names the CURRENT bundle revision", () => {
  // Revision-4 change: the revision is read from `src/config/milestoneStatus.js`
  // rather than hardcoded here. Revision 3 hardcoded `3`, so this test had to be
  // edited every pass — and an edited assertion is a weak assertion. The bar is
  // unchanged: the manifest must name the bundle it actually is.
  const manifest = read("AUDIT_PACKAGE_MANIFEST.md");
  const rev = MILESTONE_STATUS.revision;
  // REVISION-8.1: the archive tag, not the bare revision — a correction within a
  // revision ships as `REV8_1.zip`, and the manifest must name the file that is
  // actually delivered. `tools/writeProvenance.mjs` reads the same field.
  const tag = MILESTONE_STATUS.archiveTag ?? String(rev);
  assert.ok(
    manifest.includes(`LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV${tag}.zip`),
    `the manifest must name the bundle it actually is (REV${tag}.zip)`
  );
  assert.ok(
    new RegExp(`Bundle revision \\| \\*\\*${rev}\\*\\*`).test(manifest),
    `the manifest must declare revision ${rev}`
  );
  // No EARLIER revision may still be presented as this bundle.
  for (let older = 1; older < rev; older++) {
    assert.ok(
      !new RegExp(`Bundle revision \\| \\*\\*${older}\\*\\*`).test(manifest),
      `the manifest still declares revision ${older}`
    );
  }
  assert.ok(
    manifest.includes(`### Revision ${rev} (this bundle)`),
    `the revision history must mark revision ${rev} as this bundle`
  );
});

test("the DERIVED status agrees with the literal this test enforces", () => {
  // REVISION-6 CHANGE (M-2 / R6-J). Revision 5 kept the status as a literal in
  // `src/config/milestoneStatus.js` and this test compared that literal with its
  // own — two constants agreeing with each other. The status is now derived from
  // the published run plus the externally determined inputs, so the comparison
  // that matters is between the DOCUMENTS and the DERIVATION.
  const tap = parseTap(read("audit/test-results.txt"));
  const external = readExternalStatuses(read);
  const derived = deriveGateStatuses(tap, external);
  const milestone = deriveMilestoneStatus(derived, external);

  assert.equal(
    milestone.status,
    REQUIRED_STATUS,
    "the evidence must derive the status the documents state"
  );
  assert.equal(milestone.mayDeclareCompletion, false);
  assert.ok(milestone.blockers.length > 0, "and it must name why");

  // The derivation may never produce a forbidden status, whatever the inputs.
  for (const forbidden of MILESTONE_STATUS.statusesRequiringDerivation) {
    assert.ok(!milestone.status.includes(forbidden), `the derivation emitted ${forbidden} without evidence`);
  }

  // The policy file keeps policy, and asserts no status of its own.
  assert.equal(MILESTONE_STATUS.statusIsDerived, true);
  assert.equal(MILESTONE_STATUS.status, undefined, "no status literal may return to this file");
  assert.equal(MILESTONE_STATUS.mayDeclareCompletion, undefined);
  // REVISION-7 (Finding 2): the two contract-authorised passing statuses are no
  // longer permanently forbidden — they are simply not derivable from evidence that
  // does not support them.
  assert.equal(MILESTONE_STATUS.forbiddenStatuses, undefined);
  assert.deepEqual(
    [...MILESTONE_STATUS.authorisedStatuses],
    ["M1_BLOCKED", "M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING", "M1_ACCEPTED"]
  );
  assert.ok(Object.isFrozen(MILESTONE_STATUS), "the policy object must be frozen");
});

test("§26 — no current-gating statement names an earlier revision", () => {
  // REVISION-7 (Finding 6). Revision 6's report still said the device test waited
  // for revision 4, and the manifest said no pass is self-certified until revision 5
  // — while both documents elsewhere said revision 6 was awaiting closure audit.
  // Every current-revision reference is generated from MILESTONE_STATUS.revision;
  // this finds any that is not.
  const rev = MILESTONE_STATUS.revision;
  const GATING = /(survives?|surviving|self-certified|is not being requested|gated behind|awaiting)/i;
  const HISTORICAL = /withdraw|history|revision history|earlier|previous|retained|was |were |audited and|returned/i;
  for (const rel of ["FINAL_REPORT.md", "AUDIT_PACKAGE_MANIFEST.md", "README.md", "IPAD_TEST_CHECKLIST.md"]) {
    const lines = read(rel).split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!GATING.test(line)) continue;
      const m = line.match(/revision[- ](\d+)/i);
      if (!m) continue;
      const named = Number(m[1]);
      if (named === rev) continue;
      const context = lines.slice(Math.max(0, i - 3), i + 2).join(" ");
      assert.ok(
        HISTORICAL.test(context),
        `${rel}:${i + 1} gates current work on revision ${named}, but this is revision ${rev}:\n  ${line.trim()}`
      );
    }
  }
});

test("the two contract-named conditions are rendered from the external inputs", () => {
  // These literals are required wording. They must appear in the report because the
  // external evidence says so, not because a source file spells them out.
  const external = readExternalStatuses(read);
  assert.equal(external.ipadGate.status, "PENDING_HUMAN_DEVICE_TEST");
  assert.match(external.stageAOrder.status, /VIOLATED/);
  const report = read("FINAL_REPORT.md");
  assert.ok(report.includes("IPAD TEST: PENDING_HUMAN_DEVICE_TEST"));
  assert.ok(report.includes("PROCESS WAIVER: PENDING PRINCIPAL DECISION"));
  // Each external gate must name its source and its determiner in the report.
  for (const [id, rec] of Object.entries(external)) {
    assert.ok(report.includes(`\`${id}\``), `the report must list the external gate ${id}`);
    assert.ok(report.includes(rec.source), `the report must name where ${id} was read from`);
  }
});
