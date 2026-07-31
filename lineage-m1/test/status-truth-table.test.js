// @ts-check
/**
 * The milestone status must follow the §26 truth table, and may take only the three
 * values the frozen contract authorises (revision-7 repair, revision-6 structural
 * audit Finding 2).
 *
 * Contract v3.3 §26 permits:
 *
 *   M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING
 *   M1_ACCEPTED
 *   M1_BLOCKED
 *
 * Revision 6 invented `M1_ALL_GATES_SATISFIED` for the everything-passes case,
 * selected a blocked string when only the device test was outstanding, and listed
 * both passing statuses as permanently forbidden in source. Reproduced with every
 * external input satisfied:
 *
 *   {"status":"M1_ALL_GATES_SATISFIED","mayDeclareCompletion":true,"blockers":[]}
 *
 * So no accumulation of evidence could ever reach a contract-authorised passing
 * state — the opposite of an evidence-derived status. Every test here fails against
 * revision 6.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  deriveGateStatuses, deriveMilestoneStatus, readExternalStatuses,
  isContractAuthorisedStatus, CONTRACT_STATUS, REPAIRS_REQUIRED_STATUS,
} from "../tools/gateRegistry.mjs";
import { parseTap, stripCommentsAndStrings } from "../tools/writeFinalReport.mjs";
import { MILESTONE_STATUS } from "../src/config/milestoneStatus.js";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/**
 * A fully GREEN run, synthesised from the committed one.
 *
 * Deliberately not "the committed TAP, which is green": during a convergence round
 * that file legitimately carries failures — including this file's own, the first
 * time it runs — and a truth-table test whose green row depends on the repository
 * being green measures the repository instead of the derivation. Both earlier
 * revisions learned this the same way.
 */
const COMMITTED = parseTap(read("audit/test-results.txt"));
const GREEN = (() => {
  const perTest = new Map();
  for (const name of COMMITTED.perTest.keys()) perTest.set(name, true);
  return { tests: perTest.size, pass: perTest.size, fail: 0, perTest };
})();

/** A run with one failure, built from the committed one. */
function redRun() {
  const perTest = new Map(GREEN.perTest);
  const first = [...perTest.keys()][0];
  perTest.set(first, false);
  return { tests: GREEN.tests, pass: GREEN.pass - 1, fail: 1, perTest };
}

const ext = (over = {}) => ({
  desktopCanvasMemory: { status: "MEASURED", priority: 9 },
  stageAOrder: { status: "SATISFIED", priority: 3, milestoneStatusWhenUnsatisfied: "M1_BLOCKED — §24 STAGE A PROCESS DECISION OUTSTANDING" },
  independentClosureAudit: { status: "SATISFIED", priority: 1, milestoneStatusWhenUnsatisfied: REPAIRS_REQUIRED_STATUS },
  ipadGate: { status: "PENDING_HUMAN_DEVICE_TEST", priority: 2, milestoneStatusWhenUnsatisfied: "M1_BLOCKED — PHYSICAL IPAD ACCEPTANCE NOT PERFORMED" },
  ...over,
});

const statusFor = (run, external) => deriveMilestoneStatus(deriveGateStatuses(run, external), external);

test("§26 — the contract truth table, row by row", () => {
  // | automated | iPad | other decisions | required status |
  const rows = [
    ["any failure, iPad pass, others satisfied", redRun(), ext({ ipadGate: { status: "PASS", priority: 2 } }), CONTRACT_STATUS.BLOCKED],
    ["pass, iPad pending, others satisfied", GREEN, ext(), CONTRACT_STATUS.GATES_PASS_IPAD_PENDING],
    ["pass, iPad failed, others satisfied", GREEN, ext({ ipadGate: { status: "FAIL", priority: 2 } }), CONTRACT_STATUS.BLOCKED],
    ["pass, iPad pass, others satisfied", GREEN, ext({ ipadGate: { status: "PASS", priority: 2 } }), CONTRACT_STATUS.ACCEPTED],
  ];
  for (const [label, run, external, required] of rows) {
    const m = statusFor(run, external);
    if (required === CONTRACT_STATUS.BLOCKED) {
      assert.ok(
        m.status === CONTRACT_STATUS.BLOCKED || m.status.startsWith(`${CONTRACT_STATUS.BLOCKED} — `),
        `${label}: expected a blocked status, got "${m.status}"`
      );
    } else {
      assert.equal(m.status, required, label);
    }
    assert.ok(isContractAuthorisedStatus(m.status), `${label}: "${m.status}" is not authorised by §26`);
  }
});

test("§26 — an unsatisfied non-device decision blocks even with the device test passed", () => {
  for (const gate of ["stageAOrder", "independentClosureAudit", "desktopCanvasMemory"]) {
    const external = ext({ ipadGate: { status: "PASS", priority: 2 }, [gate]: { status: "PENDING", priority: 1 } });
    const m = statusFor(GREEN, external);
    assert.ok(m.status.startsWith(CONTRACT_STATUS.BLOCKED), `${gate} unsatisfied must block, got "${m.status}"`);
    assert.equal(m.mayDeclareCompletion, false);
    assert.ok(m.blockers.some((b) => b.startsWith(gate)), `${gate} must be named as a blocker`);
  }
});

test("§26 — M1_ACCEPTED is reachable, and only when everything is satisfied", () => {
  const accepted = statusFor(GREEN, ext({ ipadGate: { status: "PASS", priority: 2 } }));
  assert.equal(accepted.status, CONTRACT_STATUS.ACCEPTED);
  assert.equal(accepted.mayDeclareCompletion, true);
  assert.deepEqual(accepted.blockers, []);

  // ...and it is the ONLY status that may declare completion.
  for (const external of [ext(), ext({ ipadGate: { status: "FAIL", priority: 2 } })]) {
    assert.equal(statusFor(GREEN, external).mayDeclareCompletion, false);
  }
  assert.equal(statusFor(redRun(), ext({ ipadGate: { status: "PASS", priority: 2 } })).mayDeclareCompletion, false);
});

test("§26 — no unauthorised status can be produced, over the whole input space", () => {
  const ipadStatuses = ["PASS", "FAIL", "PENDING_HUMAN_DEVICE_TEST", "UNVERIFIED", ""];
  const otherStatuses = ["SATISFIED", "PENDING", "VIOLATED — principal decision required", "UNVERIFIED"];
  for (const run of [GREEN, redRun()]) {
    for (const ipad of ipadStatuses) {
      for (const other of otherStatuses) {
        const external = ext({
          ipadGate: { status: ipad, priority: 2, milestoneStatusWhenUnsatisfied: "M1_BLOCKED — PHYSICAL IPAD ACCEPTANCE NOT PERFORMED" },
          stageAOrder: { status: other, priority: 3, milestoneStatusWhenUnsatisfied: "M1_BLOCKED — §24 STAGE A PROCESS DECISION OUTSTANDING" },
        });
        const m = statusFor(run, external);
        assert.ok(
          isContractAuthorisedStatus(m.status),
          `unauthorised status "${m.status}" from ipad=${ipad}, other=${other}`
        );
        assert.ok(
          !/M1_ALL_GATES_SATISFIED/.test(m.status),
          "the revision-6 invented status must never reappear"
        );
      }
    }
  }
});

test("§26 — source no longer forbids the statuses the contract authorises", () => {
  assert.deepEqual(
    [...MILESTONE_STATUS.authorisedStatuses],
    ["M1_BLOCKED", "M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING", "M1_ACCEPTED"]
  );
  assert.equal(MILESTONE_STATUS.forbiddenStatuses, undefined, "the permanent ban must be gone");
  // Scanned as code: the removed mechanism is documented in comments deliberately.
  const registry = stripCommentsAndStrings(read("tools/gateRegistry.mjs"));
  assert.ok(!/M1_ALL_GATES_SATISFIED/.test(registry), "the invented status must not exist in code");
});

test("§26 — the shipped evidence still derives the blocked status it publishes", () => {
  // This row uses the COMMITTED run, not the synthetic one: it is the claim about
  // what this bundle actually publishes.
  const external = readExternalStatuses(read);
  const m = statusFor(COMMITTED, external);
  assert.equal(m.status, REPAIRS_REQUIRED_STATUS, "the current state must be unchanged by this repair");
  assert.equal(m.mayDeclareCompletion, false);
  assert.ok(isContractAuthorisedStatus(m.status));
  assert.ok(read("FINAL_REPORT.md").includes(m.status));
});
