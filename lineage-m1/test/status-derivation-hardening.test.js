// @ts-check
/**
 * The status derivation must reject invalid external evidence rather than turn it
 * into a favourable status (revision-8 repair, revision-7 structural audit
 * Finding 1).
 *
 * Three executed reproductions against revision 7, all with every other condition
 * satisfied:
 *
 *   ipad PASS / SATISFIED / MEASURED  -> M1_ACCEPTED, completion=true
 *   ipad missing / UNVERIFIED / BANANA -> M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING
 *   stageAOrder proposing the removed status -> {"status":"M1_ALL_GATES_SATISFIED"}
 *
 * `MEASURED` means a measurement happened, not that it passed. An unknown value is
 * not "pending". And a status string §26 does not authorise may never be published,
 * whatever an external record proposes.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  deriveGateStatuses, deriveMilestoneStatus, isContractAuthorisedStatus,
  classifyIpadStatus, CONTRACT_STATUS, REPAIRS_REQUIRED_STATUS,
} from "../tools/gateRegistry.mjs";
import { parseTap } from "../tools/writeFinalReport.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** A synthetic fully green run, so this file tests the derivation, not the repo. */
const GREEN = (() => {
  const committed = parseTap(read("audit/test-results.txt"));
  const perTest = new Map();
  for (const name of committed.perTest.keys()) perTest.set(name, true);
  return { tests: perTest.size, pass: perTest.size, fail: 0, perTest };
})();

const ext = (ipad, over = {}) => ({
  desktopCanvasMemory: { status: "MEASURED", priority: 9 },
  stageAOrder: { status: "SATISFIED", priority: 3 },
  independentClosureAudit: { status: "SATISFIED", priority: 1 },
  ...(ipad === undefined ? {} : { ipadGate: { status: ipad, priority: 2,
    milestoneStatusWhenUnsatisfied: "M1_BLOCKED — PHYSICAL IPAD ACCEPTANCE NOT PERFORMED" } }),
  ...over,
});
const derive = (external) => deriveMilestoneStatus(deriveGateStatuses(GREEN, external), external);

test("§26 — only PASS satisfies the physical device gate", () => {
  assert.equal(derive(ext("PASS")).status, CONTRACT_STATUS.ACCEPTED);
  for (const near of ["SATISFIED", "MEASURED", "COMPLETE", "DONE", "OK"]) {
    const m = derive(ext(near));
    assert.notEqual(m.status, CONTRACT_STATUS.ACCEPTED, `"${near}" must not satisfy the device gate`);
    assert.equal(m.mayDeclareCompletion, false);
    assert.ok(isContractAuthorisedStatus(m.status));
  }
});

test("§26 — an absent, unreadable or unknown device value BLOCKS, never 'pending'", () => {
  for (const bad of [undefined, "", "UNVERIFIED", "BANANA", "pending?", "PENDING"]) {
    const m = derive(ext(bad));
    assert.notEqual(
      m.status, CONTRACT_STATUS.GATES_PASS_IPAD_PENDING,
      `"${String(bad)}" must not be read as the contract's pending state`
    );
    assert.ok(m.status.startsWith(CONTRACT_STATUS.BLOCKED), `"${String(bad)}" must block, got "${m.status}"`);
    assert.equal(m.mayDeclareCompletion, false);
  }
  // The one value that DOES mean pending.
  assert.equal(derive(ext("PENDING_HUMAN_DEVICE_TEST")).status, CONTRACT_STATUS.GATES_PASS_IPAD_PENDING);
});

test("§26 — the device classifier is total and explicit", () => {
  assert.equal(classifyIpadStatus("PASS"), "satisfied");
  assert.equal(classifyIpadStatus("FAIL"), "failed");
  assert.equal(classifyIpadStatus("PENDING_HUMAN_DEVICE_TEST"), "pending");
  for (const unknown of [undefined, null, "", "MEASURED", "BANANA", 42, {}]) {
    assert.equal(classifyIpadStatus(/** @type {any} */ (unknown)), "unknown", `${String(unknown)} must be unknown`);
  }
});

test("§26 — a proposal for the blocked case must itself be a BLOCKED status", () => {
  // Found by the sweep below, not by the audit: `M1_ACCEPTED` is contract-authorised,
  // so a first fix that checked only authorisation let an UNSATISFIED gate propose
  // acceptance — and got it.
  const external = ext("PASS", {
    stageAOrder: { status: "PENDING", priority: 1, milestoneStatusWhenUnsatisfied: "M1_ACCEPTED" },
  });
  const m = derive(external);
  assert.notEqual(m.status, CONTRACT_STATUS.ACCEPTED, "an unsatisfied gate must not yield acceptance");
  assert.equal(m.mayDeclareCompletion, false);
  assert.ok(m.status.startsWith(CONTRACT_STATUS.BLOCKED));
  assert.ok(m.rejectedStatusStrings.some((r) => r.includes("M1_ACCEPTED")));
});

test("§26 — an unauthorised status proposed by an external record is refused", () => {
  const external = ext("PASS", {
    stageAOrder: { status: "PENDING", priority: 1, milestoneStatusWhenUnsatisfied: "M1_ALL_GATES_SATISFIED" },
  });
  const m = derive(external);
  assert.ok(isContractAuthorisedStatus(m.status), `published "${m.status}", which §26 does not authorise`);
  assert.equal(m.status, REPAIRS_REQUIRED_STATUS, "an unusable proposal falls back to the blocked status");
  assert.ok(
    m.rejectedStatusStrings.some((r) => r.includes("M1_ALL_GATES_SATISFIED")),
    "and the refusal must be recorded, not silent"
  );
  assert.ok(m.blockers.some((b) => /does not authorise/.test(b)));
});

test("§26 — a lower-priority AUTHORISED proposal is used when a higher one is refused", () => {
  const external = ext("PASS", {
    stageAOrder: { status: "PENDING", priority: 1, milestoneStatusWhenUnsatisfied: "TOTALLY_MADE_UP" },
    independentClosureAudit: { status: "PENDING", priority: 2, milestoneStatusWhenUnsatisfied: REPAIRS_REQUIRED_STATUS },
  });
  const m = derive(external);
  assert.equal(m.status, REPAIRS_REQUIRED_STATUS);
  assert.ok(isContractAuthorisedStatus(m.status));
});

test("§26 — no input in a wide sweep produces an unauthorised status or false acceptance", () => {
  const ipadValues = [undefined, "", "PASS", "FAIL", "FAILED", "REJECTED", "PENDING_HUMAN_DEVICE_TEST",
    "MEASURED", "SATISFIED", "UNVERIFIED", "BANANA", "pass", "  PASS  "];
  const otherValues = ["SATISFIED", "PASS", "MEASURED", "PENDING", "UNVERIFIED", "VIOLATED — principal decision required"];
  const proposals = [undefined, "M1_ALL_GATES_SATISFIED", "M1_ACCEPTED", REPAIRS_REQUIRED_STATUS, "", "nonsense"];
  let accepted = 0;
  for (const ipad of ipadValues) {
    for (const other of otherValues) {
      for (const proposal of proposals) {
        const external = ext(ipad, {
          stageAOrder: { status: other, priority: 3, milestoneStatusWhenUnsatisfied: proposal },
        });
        const m = derive(external);
        assert.ok(
          isContractAuthorisedStatus(m.status),
          `unauthorised "${m.status}" from ipad=${String(ipad)}, other=${other}, proposal=${String(proposal)}`
        );
        if (m.mayDeclareCompletion) {
          accepted++;
          assert.equal(m.status, CONTRACT_STATUS.ACCEPTED);
          assert.equal(classifyIpadStatus(ipad), "satisfied",
            `completion declared while the device status was "${String(ipad)}"`);
        }
      }
    }
  }
  assert.ok(accepted > 0, "the accepting path must be reachable, or this sweep proves nothing");
});

test("§26 — the shipped evidence still derives the blocked status it publishes", () => {
  const committed = parseTap(read("audit/test-results.txt"));
  const external = JSON.parse(read("audit/gate-summary.json")).externalStatuses;
  const m = deriveMilestoneStatus(deriveGateStatuses(committed, external), external);
  assert.equal(m.status, REPAIRS_REQUIRED_STATUS);
  assert.equal(m.mayDeclareCompletion, false);
});
