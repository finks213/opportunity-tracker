# LINEAGE M1 — Revision 8.1 Delivery Correction

A **surgical acceptance-tooling correction**, not a revision. No new architecture, no
feature work, no unrestricted search for further defects, and no biological change.

**Audited artifact:** `LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV8.zip`
**Audited SHA-256:** `a3c6feb1d96f80526584300cf6ef13729e99f3c6a791ca91dc7da753d09dbd65`
**Source of the defect list:** `LINEAGE_M1_REV8_BOUNDED_CLOSURE_AUDIT.md`

All five defects were **reproduced against that exact artifact before any production
change**. I disputed none of them.

---

## The biological model is frozen

Verified before any evidence was reused, as ordered:

| Check | Result |
|---|---|
| `src/` vs the delivered revision-8 bundle | identical except `src/config/milestoneStatus.js` |
| `src/config/milestoneStatus.js` — is it biology-affecting? | **No.** It has no importer anywhere in `src/`; it carries report revision/date policy and is read only by `tools/` and `test/`. The change adds `revisionCorrection` and `archiveTag`. |
| Authoritative `modelDefinitionHash`, recomputed live | `dc444865163deb32a7a9d80bd23f576d1ab5a936896298b5cd13faac6f513b3d` — unchanged |
| `fixtures/defining_fixture_v1.json` | byte-identical |
| `reference/biology.py`, `engine.py`, `analyze.py` | byte-identical |

The 200-seed fixture gate, both characterization batches, the edge-only traversal, the
observer-invariance evidence and the Canvas-memory collection were therefore **not
re-run**, and their existing evidence is reused unchanged.

---

## Repair matrix

| # | Defect | Severity | Files changed | Regression |
|---|---|---|---|---|
| 1 | tree-integrity accepts zero, negative, fractional, non-numeric or missing round counts and can certify zero executed tests | Medium-Critical | `tools/proveTreeIntegrity.mjs`, `tree-integrity.config.json` (new) | `test/acceptance-tool-hardening.test.js` (4) |
| 2 | external evidence can inject report-ready milestone prose via `M1_BLOCKED — …` | Medium-Critical | `tools/gateRegistry.mjs`, `audit/external-gate-status.json` | `test/acceptance-tool-hardening.test.js` (4) |
| 3 | the provenance writer exempts any path *ending* `audit/provenance.json` | Medium | `tools/writeProvenance.mjs` | `test/acceptance-tool-hardening.test.js` (1, real git repo) |
| 4 | strict verification accepts a record marked provisional | Medium | `tools/verifyProvenance.mjs` | `test/acceptance-tool-hardening.test.js` (2, real git repo) |
| 5 | active wording still claimed that every shipped file, with no exception stated, is internally hashed | Medium-Minor | `AUDIT_PACKAGE_MANIFEST.md`, `tools/writeManifestPaths.mjs`, `tools/writeProvenance.mjs`, `tools/verifyProvenance.mjs`, `REVISION_7_REPAIR_RECORD.md` | `test/acceptance-tool-hardening.test.js` (2) |

---

## Defect 1 — a zero-round run certified itself

`--rounds` was parsed with `Number()` and never validated, and `[].every(...)` is
`true`, so a run that executed nothing produced a valid-looking proof.

**Reproduced against the delivered artifact:**

```
$ node tools/proveTreeIntegrity.mjs --rounds 0
exit=0   rounds=0    runs=0  allRunsGreen=true  proofValid=true
$ node tools/proveTreeIntegrity.mjs --rounds -1
exit=0   rounds=-1   runs=0  allRunsGreen=true  proofValid=true
$ node tools/proveTreeIntegrity.mjs --rounds banana
exit=0   rounds=null runs=0  allRunsGreen=true  proofValid=true
$ node tools/proveTreeIntegrity.mjs --rounds          # missing value
exit=0   rounds=null runs=0                    proofValid=true
```

`--rounds 1.5` was worse than the record suggests: it did not reject the value, it
truncated it and began executing rounds.

**Repair.** `parseRounds()` validates before anything else happens — finite whole
number, at least the configured minimum, value present — and the command exits 1
**without touching the existing record**. The verdict now comes from
`evaluateProof()`, which requires positive evidence and can never be satisfied
vacuously:

- at least one executed round, and `runs.length === rounds`;
- at least `requiredRounds` rounds (3, from `tree-integrity.config.json`);
- every round parseable, green, exit 0;
- every round's test total equal to the shipped suite's total, read from the
  committed TAP — a truncated suite cannot support the claim;
- `samplesTaken > 0` — sampling actually active;
- zero sampled deviations and an unchanged tree digest.

**After repair**, every value in the audit falsifies:

```
0        REFUSING to run: --rounds must be at least the configured minimum of 3, got 0.        exit=1
-1       REFUSING to run: --rounds must be a whole number, got "-1".                            exit=1
1.5      REFUSING to run: --rounds must be a whole number, got "1.5".                           exit=1
banana   REFUSING to run: --rounds must be a whole number, got "banana".                        exit=1
(missing) REFUSING to run: --rounds requires a value.                                           exit=1
```

The record schema is now `lineage-m1-tree-integrity-3` and carries `requiredRounds`,
`requiredTestTotal` and `proofProblems`.

## Defect 2 — evidence text became the official status

**Reproduced**, synthetic all-green run, every other gate satisfied:

```json
{
  "status": "M1_BLOCKED — TOTALLY FABRICATED\nM1_ACCEPTED",
  "mayDeclareCompletion": false,
  "rejectedStatusStrings": []
}
```

**Repair.** Evidence no longer supplies status prose *at all*. It supplies typed
conditions — a `status` value and `blocksMilestone` — and the sentence is selected in
trusted source by gate id from `BLOCKED_REASON_BY_GATE`. Any prose still present in an
evidence record is refused and recorded in `rejectedStatusStrings`, never published,
never concatenated, never rendered beside the derived status. An unknown gate id
cannot name its own reason; it gets the generic repairs-required status.
`audit/external-gate-status.json` moved to schema
`lineage-m1-external-gate-status-5` with `milestoneStatusWhenUnsatisfied` removed.

**After repair**, every hostile value maps to the same source-controlled sentence:

```
"M1_BLOCKED — TOTALLY FABRICATED\nM1_ACCEPTED"   -> "M1_BLOCKED — §24 STAGE A PROCESS DECISION OUTSTANDING"   rejected: 1
"M1_ACCEPTED"                                    -> "M1_BLOCKED — §24 STAGE A PROCESS DECISION OUTSTANDING"   rejected: 1
"M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING"    -> "M1_BLOCKED — §24 STAGE A PROCESS DECISION OUTSTANDING"   rejected: 1
"M1_BLOCKED — FABRICATED"                        -> "M1_BLOCKED — §24 STAGE A PROCESS DECISION OUTSTANDING"   rejected: 1
```

The regression also asserts the published status is a single line, free of control
characters, and that an unsatisfied gate can never produce acceptance.

## Defect 3 — suffix matching in the self-exemption

The writer filtered dirty paths with `/audit\/provenance\.json$/`, so any tracked file
whose path merely ended that way was waved through. **Reproduced**: with a tracked
`nested/audit/provenance.json` modified and no `--allow-dirty`, the writer exited 0 and
recorded `working tree clean: false`.

**Repair.** The record's own repo-relative path is computed from
`git rev-parse --show-prefix` and compared by **exact equality**. The regression builds
a real git repository, dirties `nested/audit/provenance.json`, and requires the writer
to refuse **and** to leave the previously valid record in place.

## Defect 4 — a provisional record passed strict verification

**Reproduced**: with `src/core/math.js` dirty, `writeProvenance.mjs --allow-dirty`
correctly stamped the record provisional — and `verifyProvenance.mjs` then printed
`PROVENANCE OK`, exit 0.

**Repair.** `deliveryDisqualifiers()` rejects `provisional`, `workingTreeClean: false`
(top level or under `source`), `deliveryEligible: false` and `allowDirty`. Strict
verification prints why and exits nonzero; it never prints `PROVENANCE OK`. A named
diagnostic mode, `--accept-provisional`, inspects such a record and prints
`PROVISIONAL RECORD — hashes agree, but this is NOT a delivery verification` — never
the strict verdict. The regression performs the full four-step sequence in a real git
repository.

## Defect 5 — a coverage claim with no exception stated

The claim is false by construction: the record cannot hash itself.

**Corrected everywhere in active text**, with all three values **computed** by
`tools/writeManifestPaths.mjs` from the inventory rather than typed:

> The archive ships N files. N−1 files are internally recorded and verified.
> `audit/provenance.json` is excluded because it cannot hash itself. The published ZIP
> SHA-256 binds the complete archive, including that record.

A regression scans the active documents and tools and fails on any line claiming
"every shipped file" without the exception, so the wording cannot drift back.

---

## Not done, deliberately

The physical iPad acceptance test, the desktop Canvas-memory measurement and the §24
Stage A process decision were **not** performed. The milestone status is derived, and
remains:

```
M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED
```
