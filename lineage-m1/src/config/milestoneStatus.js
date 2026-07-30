// @ts-check
/**
 * The single source of truth for the milestone's official status
 * (contract §26 status artifacts, §28 completion law).
 *
 * Revision-4 repair. Revision 3 kept the status as literal prose in four
 * documents and enforced agreement with a text scan. That caught divergence but
 * still allowed the *report* to be hand-maintained, which is how the revision-3
 * report ended up with a duplicated header block carrying a stale
 * `Config hash: edb81695…` — a hash that had already been demoted to a
 * tuning-only subset. Every generated artifact now reads its status from here.
 *
 * Changing the status is a deliberate edit to this file, not a prose edit
 * scattered across four documents.
 */

/** @type {Readonly<{status:string, processWaiver:string, ipadTest:string, revision:number, reportDate:string, forbiddenStatuses:readonly string[], mayDeclareCompletion:boolean}>} */
export const MILESTONE_STATUS = Object.freeze({
  /** The overall milestone status. */
  status: "M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED",

  /**
   * Separately pending, and explicitly NOT the only blockers. Revision 2 claimed
   * the waiver was the sole blocker while ten defects were open; that claim is
   * withdrawn.
   */
  processWaiver: "PROCESS WAIVER: PENDING PRINCIPAL DECISION",
  ipadTest: "IPAD TEST: PENDING_HUMAN_DEVICE_TEST",

  /** Revision of the implementation and of every generated report. */
  revision: 5,
  reportDate: "2026-07-30",

  /**
   * Statuses that must not be asserted as the present state by any artifact.
   * `status-consistency.test.js` enforces this.
   */
  forbiddenStatuses: Object.freeze([
    "M1_AUTOMATED_GATES_PASS",
    "M1_ACCEPTED",
  ]),

  /**
   * No generated artifact may declare completion. §24 Stage A ordering was
   * violated and is a principal decision; the physical iPad gate is unperformed.
   */
  mayDeclareCompletion: false,
});

/**
 * The identity of the authoritative model hash, so no report can quietly
 * promote a tuning-only subset hash back to "the" config hash.
 */
export const HASH_LABELS = Object.freeze({
  authoritative: "modelDefinitionHash",
  authoritativeDescription: "SHA-256 over the complete model definition — every biology-affecting value",
  nonauthoritative: "tuningConfigHash",
  nonauthoritativeDescription:
    "NONAUTHORITATIVE. SHA-256 over the tuning-config subset only. Published as the config hash by " +
    "revisions 1-2, which is why a trait-effect change could move survival without moving the hash. " +
    "Retained solely so older evidence files remain traceable; it does not identify the model.",
});
