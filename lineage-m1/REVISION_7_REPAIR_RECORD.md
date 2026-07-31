# LINEAGE M1 — Revision-7 Repair Record

A narrow closure pass on the **six findings of the revision-6 structural audit**.
No new architecture, no feature work, no unrestricted search for further defects.

**Audited artifact:** `LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV6.zip`
**Audited SHA-256:** `37324f0cc9198411d72dec2aec729fa71d10da24b4109a167430de8af929efc7`

Every finding was **reproduced against that exact artifact before any production
change**. The "observed before repair" blocks below are verbatim output from those
runs. All six reproduced exactly as reported; I disputed none of them.

---

## Repair matrix

| # | Finding | Severity | Reproduction | Production files changed | Regression test | Result |
|---|---|---|---|---|---|---|
| 1 | legibility mode does not preserve the defining fixture | Medium-Critical | controls after mode entry | `src/main.js` | `test/legibility-invariant.test.js` (8) | invariant continuous and re-checked each frame |
| 2 | the status machine contradicts the §26 status law | Medium-Critical | derive with all inputs satisfied | `tools/gateRegistry.mjs`, `src/config/milestoneStatus.js` | `test/status-truth-table.test.js` (6) | the contract truth table, both passing states reachable |
| 3 | provenance binds neither the shipped source nor the exact TAP | Medium | tamper in an extraction | `tools/writeProvenance.mjs`, `tools/verifyProvenance.mjs` | `test/provenance-binding.test.js` (8) | every shipped file bound, TAP by bytes |
| 4 | a hostile `Error` getter escapes observer isolation | Medium | throwing `message` accessor | `src/core/simulation.js` | `test/generation-result-immutable.test.js` (+5) | nothing escapes diagnostic capture |
| 5 | random reset publishes incomplete observer-world state | Medium-Minor | load webbing fixture, reset | `src/main.js` | `test/world-reset-completeness.test.js` (5) | every world-identity field republished |
| 6 | current artifacts retain obsolete audit revisions | Medium-Minor | grep the two documents | `tools/writeFinalReport.mjs`, manifest, README, checklist | `test/status-consistency.test.js` (+1) | generated from one revision value |

---

## Finding 1 — legibility mode does not preserve the defining fixture

**Observed before repair**, through ordinary controls:

```
on entry     : mode=legibility generation=0 baseline=true variant=baseline
after Step   : mode=legibility generation=1 baseline=false
after webbing: mode=legibility variant=high_webbing baseline=false worldSource=defining_fixture
```

§22 defines the mode AS the unmodified defining fixture at generation zero. Revision
6 verified that only while entering, so `stepOnce()`, `setRunning(true)` and a
high-webbing load each left the label in place over a world it no longer described —
and the manual device procedure depends on exactly that label.

**Repair.** The invariant is continuous. `leaveLegibilityMode(reason)` is called by
every control that advances or replaces biology, before the change commits, and the
user is told why the mode ended. `renderPanels()` calls
`enforceLegibilityInvariant()` on every frame as a backstop, so no frame can be
painted under the label against a non-baseline world even by a path that bypasses the
controls.

A baseline **reload** deliberately keeps the mode: it re-establishes the same world,
so there is nothing to invalidate.

**After repair**

```
after Step   : mode=null generation=1 baseline=false
after webbing: mode=null variant=high_webbing baseline=false
```

**Regression.** `test/legibility-invariant.test.js` covers the five paths the audit
named plus the render-time backstop, and finishes with an eleven-step control
sequence that asserts the invariant after every step — and that the mode is still
usable at the end rather than permanently burned.

---

## Finding 2 — the status state machine contradicts the frozen §26 status law

**Observed before repair**, with every external input satisfied:

```json
{"status":"M1_ALL_GATES_SATISFIED","mayDeclareCompletion":true,"blockers":[],
 "automatedGatesPass":true,"externalBlockers":[]}
```

and with only the device test outstanding:

```
"M1_BLOCKED — PHYSICAL IPAD ACCEPTANCE NOT PERFORMED"
```

Contract v3.3 §26 permits three statuses and no others:
`M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING`, `M1_ACCEPTED`, `M1_BLOCKED`. Revision
6 invented a fourth, never produced either passing one, and listed both of them as
**permanently forbidden** in `src/config/milestoneStatus.js`. So no accumulation of
evidence could ever move the milestone to a state the contract authorises — the exact
opposite of the evidence-derived architecture revision 6 claimed. The audit was right
to call this oracle drift: the injection test asserted the invented status, so code
and test agreed with each other and neither agreed with §26.

**Repair.** `deriveMilestoneStatus()` implements the truth table exactly:

| automated | iPad | other binding decisions | status |
|---|---|---|---|
| any failure or unverified | any | any | `M1_BLOCKED — <reason>` |
| pass | pending | satisfied | `M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING` |
| pass | failed | satisfied | `M1_BLOCKED — <reason>` |
| pass | pass | satisfied | `M1_ACCEPTED` |
| pass | any | any unsatisfied | `M1_BLOCKED — <reason>` |

`isContractAuthorisedStatus()` is the single check that nothing else can be
published. `milestoneStatus.js` now carries `authorisedStatuses` — the three the
contract permits — instead of a permanent ban on two of them. Claim hygiene is kept
by `statusesRequiringDerivation`: a document may state a passing status exactly when
the derivation currently produces it.

**After repair**

```
all satisfied        -> M1_ACCEPTED                                   accepted: true
only iPad pending    -> M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING   accepted: false
iPad failed          -> M1_BLOCKED — PHYSICAL IPAD ACCEPTANCE FAILED  accepted: false
as shipped           -> M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED
```

The shipped status is unchanged: the closure audit, the Stage A decision and the
Canvas measurement are all unsatisfied, so the evidence still derives blocked.

**Regression.** `test/status-truth-table.test.js` walks the table row by row, proves
`M1_ACCEPTED` is reachable and is the only status that may declare completion, and
sweeps the whole input space (2 runs × 5 iPad statuses × 4 other statuses) requiring
every result to be contract-authorised and the invented status never to reappear.

---

## Finding 3 — provenance binds neither the shipped source nor the exact raw TAP

**Observed before repair.** In a copy of the extracted bundle I changed
`src/core/math.js` and rewrote a non-summary line of `audit/test-results.txt`,
keeping the counts:

```
source commit : ce0ddfbacf3404c9d21444c8b9513e2d39194453
files verified: 20
PROVENANCE OK
exit=0
```

The record bound 20 selected files to itself. `src/`, `test/`, `tools/`, the browser
files and the package files were never hashed, and the TAP was exempted from its own
recorded SHA-256 in favour of three summary counts. My revision-6 record disclosed
the weaker TAP binding but also claimed the bundle was bound to a source commit; as
the audit says, that broader claim was not true.

**Repair.** `audit/provenance.json` records **every shipped file except itself**,
with SHA-256 and byte count, plus one `shippedTreeDigest` over the whole set. The
exclusion is structural, not a gap: a file cannot contain its own hash. The archive
as a whole is bound externally, by the ZIP SHA-256 published with the delivery.
`tools/verifyProvenance.mjs` recomputes all of it, rejects any unrecorded or missing
file, and binds the raw TAP by its exact bytes. The commit claim is stated honestly:
the byte binding is self-contained and complete, and verifying that the recorded
commit's git tree equals the extraction additionally requires a clone, because `.git`
is not shipped. The misleading `git cat-file -t` suggestion is gone.

One deliberate, documented exception: the in-suite check passes `tapMayDiffer`,
because a suite run republishes `audit/test-results.txt` before it can be re-recorded.
Even then the recorded counts are still verified, the **default is strict**, and the
delivered archive is built after the final `npm run audit:provenance` and verified
strictly from its own extraction.

**After repair** — each tamper on its own copy:

```
production source   src/core/math.js                 -> PROVENANCE FAILED
test file           test/report-integrity.test.js    -> PROVENANCE FAILED
tool file           tools/writeFinalReport.mjs       -> PROVENANCE FAILED
non-summary TAP     audit/test-results.txt           -> PROVENANCE FAILED
added file          src/planted.js                   -> UNRECORDED
removed file        src/core/math.js                 -> MISSING
```

---

## Finding 4 — a hostile `Error` getter escapes observer exception isolation

**Observed before repair**, with an `Error` whose `message` getter throws:

```json
{"escaped":"hostile message getter","generation":1,"hasResult":false}
```

Revision 6 guarded the `text` computation and then read `err.name`, `err.message` and
`err.stack` outside that guard. Biology committed correctly, then diagnostic capture
threw, so the caller saw a thrown transition **after** the transition had already
happened and with no `lastGenerationResult` published — ambiguous retry behaviour,
which is the failure the observer boundary exists to prevent. The revision-6 hostile
test used a non-`Error` with a hostile `toString`, which is why this survived.

**Repair.** Every property is read through one individually guarded helper, including
the `instanceof` classification (a proxy may throw from `getPrototypeOf`). An
unreadable field becomes `null`; an unrepresentable value becomes
`[unrepresentable thrown value]`.

**After repair**

```json
{"escaped":null,"generation":1,"hasResult":true}
```

**Regression.** Five new cases — hostile `message`, hostile `name`, hostile `stack`,
an `Error` subclass with throwing getters, a hostile proxy, a revoked proxy — each
requiring all four properties the audit named: `advanceGeneration()` does not throw,
biology equals the clean committed generation, `lastGenerationResult` exists, and the
frozen diagnostic carries a safe fallback. A seventh test requires every thrown value,
hostile or not, to yield one identical result shape.

---

## Finding 5 — random reset publishes incomplete observer-world state

**Observed before repair**, after loading the high-webbing fixture and resetting:

```json
{"worldSource":"random",
 "fixtureVariant":"high_webbing",
 "maintainedFocalChannels":{"created":["maintained:canopy","maintained:shoreline"],"skipped":[]},
 "tracerUnavailableReason":"old fixture tracer failure",
 "notice":"Tracer not created — old fixture tracer failure."}
```

The biology reset correctly and everything describing it was stale, including a
visible notice about a world that no longer existed.

**Repair.** A reset is the same complete world transaction a fixture load is: every
world-identity field is republished, and fixture-only fields go back to `null`.

**After repair**

```json
{"worldSource":"random","fixtureVariant":null,
 "maintainedFocalChannels":null,"tracerUnavailableReason":null}
```

**Regression.** `test/world-reset-completeness.test.js` dirties every field first and
then enumerates them, so a field added later that nobody remembers to clear fails the
test. It also checks the rendered notice, and that reset determinism is unchanged.

---

## Finding 6 — current artifacts retain obsolete audit revisions

**Observed before repair**

```
FINAL_REPORT.md:549: performed and is not being requested until revision 4 survives both audits.
AUDIT_PACKAGE_MANIFEST.md:27: … no pass is self-certified until revision 5 survives independent re-audit …
```

Both were emitted while the active artifact was revision 6, contradicting the R6-K
claim that revision wording is generated from the current revision.

**Repair.** Both statements are generated from `MILESTONE_STATUS.revision`, and the
manifest, README and iPad checklist read the current revision. The regression finds
any current-gating phrase naming a different revision unless the surrounding text is
explicitly historical, so this class of drift fails the build rather than surviving to
an audit.

---

## Required clean executions

| # | Required execution | Result |
|---|---|---|
| 1 | syntax checks | all source, tool and test files parse |
| 2 | dependency install from lockfile | `npm ci` exit 0, `playwright@1.56.1`, 0 vulnerabilities |
| 3 | official suite under every executed Node major | 20 · 21 · 22, all green |
| 4 | long-retention focal-lineage tests | generations 12 … 1100, unchanged |
| 5 | concurrent world-load race tests | unchanged |
| 6 | missing / malformed model-identity tests | unchanged |
| 7 | cross-evidence model-hash tests | one identity, `dc444865…` |
| 8 | exact 200-seed fixture gate | canopy 200/200, shoreline 197/200 |
| 9 | current and legacy 500-seed characterization | 256 PASS · 421 FAIL |
| 10 | edge-only 500-seed experiments | 500/500 each way, median generation 3 |
| 11 | observer invariance | byte-identical, 0 mismatches |
| 12 | observer memory and genealogy bounds | bounded, unchanged |
| 13 | browser probe | 180 frames, 360/360 glyphs, 0 page errors |
| 14 | honest browser-memory classification | `DESKTOP_CANVAS_MEMORY` UNVERIFIED |
| 15 | report failure-injection tests | end-to-end, both directions of the truth table |
| 16 | concurrent test-tree integrity checks | 3 rounds, 0 deviations |
| 17 | fixture and reference hashes | frozen values unchanged |

Exact figures for this revision are in the delivery section below.

---

## Non-regression

The six repairs touch controller mode handling, status derivation, provenance
tooling, diagnostic capture and generated wording. **None is a biological change**,
and the fully regenerated evidence confirms the biology is identical to revisions 5
and 6: §19.3 deltas, 200/200 and 197/200, medians 256 and 421, 500/500 traversal both
directions at median generation 3, observer invariance byte-identical, and
`modelDefinitionHash` `dc444865…`.

**Changes that DID occur, and why:**

| Value | Revision 6 | Revision 7 | Reason |
|---|---|---|---|
| status when everything is satisfied | `M1_ALL_GATES_SATISFIED` | `M1_ACCEPTED` | Finding 2: the contract's own status |
| status when only the device test is outstanding | a blocked string | `M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING` | Finding 2 |
| source status policy | two statuses permanently forbidden | the three the contract authorises | Finding 2 |
| files bound by provenance | 20 | every shipped file except the record itself | Finding 3 |
| raw TAP binding | three summary counts | exact bytes | Finding 3 |
| legibility mode | verified on entry | invariant while active | Finding 1 |
| reset | biology and channels | every world-identity field | Finding 5 |


---

## Delivery correction (after the revision-7 structural audit)

The revision-7 structural audit found no surviving functional defect in the six
repaired areas, and three delivery defects. All three were reproduced against the
delivered artifact
(`7cae9566df99585aff5684d48974237074dce9afe2326c9654aeefbf210d71dd`).

**D-1 — the stated commit and the recorded commit disagreed.** The delivery message
named `13d1e75dbbf1b36cf2e2c0657516567029721632`; `audit/provenance.json` inside the
archive recorded `a942a5b260f577b642022069421a2357869d4ec0`, with
`workingTreeClean: false` and two uncommitted paths. The byte-level binding was real
— every recorded hash verified — but the archive was bound to a repository state no
single commit described, and my two statements about the source revision did not
match. The cause was the ordering: provenance is written after the commit it
describes, that write was then committed, and I named the later commit.

Repaired by stating the relationship exactly rather than hoping the two coincide.
`audit/provenance.json` now carries `archiveRelationToCommit`, which names the
commit it describes, that commit's tree hash, the single file that may differ
(itself, since no file can contain its own hash) and a `diff -r` command that proves
it. `test/provenance-binding.test.js` fails if the record is ever written against a
tree that is dirty for any other reason, so a half-committed delivery cannot recur.

**D-2 — the active external-gate evidence carried the obsolete status law.**
`audit/external-gate-status.json` still said the everything-satisfied status is
`M1_ALL_GATES_SATISFIED` — removed from the derivation by Finding 2 — and still
gated on revision 6. That prose does not drive the calculation, so the generated
status was correct, but an evidence package that contradicts itself is not truthful.
The file now states the implemented §26 truth table and gates on revision 7;
`test/external-gate-status-currency.test.js` fails if the file and the code diverge
again, or if it gates on a superseded revision.

**D-3 — the file-count language was wrong.** The repair record said "129 files" while
the record held 133 and the extraction held one more than that. The correct statement
is: the record covers every shipped file **except itself**, and the archive as a whole
is bound externally by its published ZIP SHA-256. The regression now computes the
shipped count and requires the recorded count to be exactly one less.

**On the fragility the audit identified.** The observation is fair: the evidence
pipeline is self-referential — tests publish the TAP, the report reads the TAP,
provenance hashes both, tree-integrity runs the tests again. Most of my convergence
trouble came from that shape, not from the simulation. Two structural changes in this
correction reduce it: provenance now refuses to be written against a half-committed
tree, and the delivery procedure below is a fixed sequence ending with provenance and
the archive, with nothing running in between. I have not redesigned the pipeline
further, because that is outside a narrow delivery correction.

### Delivery procedure, in order

```
1. every evidence generator, and the full suite, until the committed pair is green
2. commit everything                       -> one authoritative commit X
3. npm run audit:provenance                -> records X against a clean tree
4. build the archive                       -> equals X's tree plus audit/provenance.json
5. verify the archive from a fresh extraction: strict provenance + the full suite
6. commit the provenance record and push; the delivery names X, as provenance does
```
