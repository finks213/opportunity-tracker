// @ts-check
/**
 * The active external-gate evidence must describe the status law the code actually
 * implements, and must gate on the CURRENT revision (revision-7 delivery
 * correction, from the revision-7 structural audit).
 *
 * Revision 7 removed `M1_ALL_GATES_SATISFIED` from the derivation, but
 * `audit/external-gate-status.json` — the machine-readable input the report system
 * consumes — still published the obsolete rule and still said "until an independent
 * closure audit of revision 6". Reproduced against the delivered revision-7 bundle:
 *
 *   audit/external-gate-status.json:5   "…the status is `M1_ALL_GATES_SATISFIED`."
 *   audit/external-gate-status.json:12  "…closure audit of revision 6 says otherwise"
 *   audit/external-gate-status.json:30  "…held until revision 6 survives"
 *
 * The generated status was correct because that prose does not drive the
 * calculation, but an evidence package that contradicts itself is not a truthful
 * one. These tests make the contradiction a build failure.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { CONTRACT_STATUS, isContractAuthorisedStatus, readExternalStatuses, GATES }
  from "../tools/gateRegistry.mjs";
import { MILESTONE_STATUS } from "../src/config/milestoneStatus.js";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const RAW = read("audit/external-gate-status.json");
const DOC = JSON.parse(RAW);

test("§26 — the file describes no status the contract does not authorise", () => {
  // Any M1_* token in this file must be a contract-authorised status, whatever
  // sentence it appears in — EXCEPT inside `statusPolicyNote`, which is the
  // withdrawal record and must name the removed status to be useful. That is the
  // same mention-versus-use rule the report and manifest checks apply.
  const withdrawal = DOC.statusPolicyNote ?? "";
  const active = Object.entries(DOC)
    .filter(([k]) => k !== "statusPolicyNote")
    .map(([, v]) => JSON.stringify(v))
    .join("\n");
  const tokens = [...active.matchAll(/M1_[A-Z_]+(?:\s+—\s+[^`"\\]+?)?(?=[`"\\.,]|\s*\\n)/g)].map((m) => m[0].trim());
  assert.ok(tokens.length > 0, "the file must describe the statuses at all");
  for (const token of tokens) {
    assert.ok(
      isContractAuthorisedStatus(token),
      `the active evidence describes "${token}", which §26 does not authorise`
    );
  }
  assert.ok(
    !/M1_ALL_GATES_SATISFIED/.test(active),
    "the revision-6 invented status must be gone from every field that states policy"
  );
  // ...and where it IS named, it must be named as removed.
  if (/M1_ALL_GATES_SATISFIED/.test(withdrawal)) {
    assert.match(withdrawal, /does not authorise|removed|obsolete/i, "it may only appear as a withdrawal");
  }
});

test("§26 — the described policy names every branch of the implemented truth table", () => {
  const policy = DOC.statusPolicy;
  assert.ok(policy, "the file must state the policy it is an input to");
  for (const status of [CONTRACT_STATUS.BLOCKED, CONTRACT_STATUS.GATES_PASS_IPAD_PENDING, CONTRACT_STATUS.ACCEPTED]) {
    assert.ok(policy.includes(status), `the policy must name ${status}`);
  }
  assert.match(policy, /deriveMilestoneStatus/, "and must name the function that implements it");
  assert.match(policy, /never selects the string itself/, "and must keep the implementation out of the choice");
});

test("§26 — every gate's declared blocked status is contract-authorised", () => {
  for (const [id, gate] of Object.entries(DOC.gates)) {
    if (gate.milestoneStatusWhenUnsatisfied === undefined) continue;
    assert.ok(
      isContractAuthorisedStatus(gate.milestoneStatusWhenUnsatisfied),
      `${id} declares "${gate.milestoneStatusWhenUnsatisfied}", which §26 does not authorise`
    );
  }
});

test("§26 — the file gates on the CURRENT revision, not a superseded one", () => {
  const rev = MILESTONE_STATUS.revision;
  const GATING = /(survives?|surviving|says otherwise|held until|awaiting|closure audit of)/i;
  const HISTORICAL = /through \d+ each returned|Revisions \d+ (through|to)|earlier|previously|withdrawn/i;
  for (const line of RAW.split("\n")) {
    if (!GATING.test(line)) continue;
    for (const m of line.matchAll(/revision (\d+)/gi)) {
      if (Number(m[1]) === rev) continue;
      assert.ok(
        HISTORICAL.test(line),
        `the active evidence gates on revision ${m[1]}, but this is revision ${rev}:\n  ${line.trim()}`
      );
    }
  }
});

test("§26 — every external gate the registry reads is present here, and readable", () => {
  const external = readExternalStatuses(read);
  for (const g of GATES.filter((x) => x.evidence === "external")) {
    assert.ok(external[g.id], `${g.id} must resolve to a status`);
    assert.notEqual(external[g.id].status, undefined);
    assert.ok(external[g.id].source, `${g.id} must name where its status came from`);
  }
  // ...and the standing condition that keeps the milestone blocked is declared.
  assert.ok(external.independentClosureAudit, "the closure-audit condition must be recorded");
  assert.equal(external.independentClosureAudit.status, "PENDING");
});
