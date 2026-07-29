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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The single required status for this repair pass. */
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
  // The string may appear only in a withdrawal, prohibition, or history note.
  const allowedContext = /withdraw|must not|not return|no longer|was false|previously|revision 1|revision 2|history|do not/i;
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
        /not claimed|never|only if|only after|not be reported|would additionally|may then be reported/i.test(context),
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
    /not the only blocker|NOT the only blockers|Separately pending/i.test(report),
    "the report must not present the process waiver as the sole blocker"
  );
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

test("the audit manifest names the revision-3 bundle", () => {
  const manifest = read("AUDIT_PACKAGE_MANIFEST.md");
  assert.ok(
    manifest.includes("LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV3.zip"),
    "the manifest must name the revision-3 bundle"
  );
  assert.ok(/Bundle revision \| \*\*3\*\*/.test(manifest), "the manifest must declare revision 3");
});
