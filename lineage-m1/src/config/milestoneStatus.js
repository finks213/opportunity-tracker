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

/**
 * REVISION-6 REPAIR (M-2 / R6-J). This file no longer ASSERTS the milestone
 * status. Revision 5 kept `status` and `mayDeclareCompletion` as literals here, so
 * the overall verdict could not move without a human editing source — a controlled
 * failing run changed gate rows while the milestone verdict kept whatever had been
 * typed. The status is now DERIVED by `tools/gateRegistry.mjs`
 * (`deriveMilestoneStatus`) from the published test results plus the externally
 * determined statuses in `audit/external-gate-status.json`.
 *
 * What remains here is policy that is not an evidence question: which statuses the
 * contract authorises at all, and which revision and date the generated artifacts
 * carry.
 *
 * @type {Readonly<{revision:number, reportDate:string, authorisedStatuses:readonly string[], statusesRequiringDerivation:readonly string[], statusIsDerived:boolean, derivedBy:string}>}
 */
export const MILESTONE_STATUS = Object.freeze({
  /** Revision of the implementation and of every generated report. */
  revision: 8,

  /**
   * Correction number WITHIN this revision; 0 is the original delivery.
   *
   * Revision 8.1 is a surgical acceptance-tooling correction, not a new revision:
   * the biological model is frozen, and `src/` is byte-identical to the revision-8
   * bundle. `archiveTag` names the archive so the delivered file and the provenance
   * record cannot disagree about which artifact is which.
   */
  revisionCorrection: 1,
  archiveTag: "8_1",
  reportDate: "2026-08-01",

  /**
   * The three statuses contract v3.3 §26 authorises. Nothing else may be published
   * as the milestone status, and `tools/gateRegistry.mjs` can produce nothing else.
   *
   * REVISION-7 REPAIR (Finding 2). Revision 6 listed `M1_AUTOMATED_GATES_PASS` and
   * `M1_ACCEPTED` here as PERMANENTLY forbidden, and the derivation invented
   * `M1_ALL_GATES_SATISFIED` for the everything-passes case. The milestone could
   * therefore never reach a contract-authorised passing state no matter what the
   * evidence said — a policy decision baked into source, which is exactly what the
   * derived-status architecture was supposed to remove. These two are not forbidden;
   * they are unreachable *while the evidence does not support them*, which is a
   * different thing and is decided by `deriveMilestoneStatus()`.
   */
  authorisedStatuses: Object.freeze([
    "M1_BLOCKED",
    "M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING",
    "M1_ACCEPTED",
  ]),

  /**
   * Statuses no artifact may ASSERT unless the derivation currently produces them.
   * This is a claim-hygiene rule, not a ban: the check is against the derived
   * status, so a document may state a passing status exactly when the evidence
   * derives it.
   */
  statusesRequiringDerivation: Object.freeze([
    "M1_AUTOMATED_GATES_PASS",
    "M1_ACCEPTED",
  ]),

  /** Stated explicitly so no reader looks for a status literal that is not here. */
  statusIsDerived: true,
  derivedBy: "tools/gateRegistry.mjs deriveMilestoneStatus(), from audit/test-results.txt and audit/external-gate-status.json",
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
