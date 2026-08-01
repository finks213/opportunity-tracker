# LINEAGE M1 — Revision-8 Repair Record

A narrow closure pass on the **six findings of the revision-7 structural audit**.
No new architecture, no feature work, no unrestricted search for further defects.

**Audited artifact:** `LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV7.zip`
**Audited SHA-256:** `3098e856600af55c231e26fc33aecfd8168e9d580050ce436a00dc242b71e1a9`

Every finding was **reproduced against that exact artifact before any production
change**. All six reproduced as reported; I disputed none of them.

---

## Repair matrix

| # | Finding | Severity | Production files changed | Regression test |
|---|---|---|---|---|
| 1 | the status derivation accepts invalid external states and can emit an unauthorised status | Medium-Critical | `tools/gateRegistry.mjs` | `test/status-derivation-hardening.test.js` (8) |
| 2 | the tree-integrity gate succeeds with failed or unparseable rounds | Medium-Critical | `tools/proveTreeIntegrity.mjs` | `test/test-tree-integrity.test.js` (+2) |
| 3 | a rendered legibility frame can still show non-baseline biology | Medium | `src/main.js` | `test/legibility-invariant.test.js` (+3) |
| 4 | the provenance writer does not refuse a dirty source tree | Medium | `tools/writeProvenance.mjs` | `test/provenance-binding.test.js` (+1) |
| 5 | the delivery repeated the file-count error in its headline claim | Medium-Minor | delivery message + record | `test/provenance-binding.test.js` |
| 6 | the generated revision history omits the failed revision-6 audit | Medium-Minor | `tools/writeFinalReport.mjs` | `test/status-consistency.test.js` |

---

## Finding 1 — invalid external states and unauthorised statuses

**Observed before repair**, with every other condition satisfied:

```
ipad PASS       -> M1_ACCEPTED                                completion=true
ipad SATISFIED  -> M1_ACCEPTED                                completion=true
ipad MEASURED   -> M1_ACCEPTED                                completion=true

ipad missing    -> M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING
ipad UNVERIFIED -> M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING
ipad BANANA     -> M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING

external record proposing the removed status
                -> {"status":"M1_ALL_GATES_SATISFIED","authorised":false}
```

Three separate defects behind one symptom: one satisfaction vocabulary for every
gate, so a *measurement* satisfied the acceptance gate; no classification of the
device value, so anything unrecognised fell through to "pending"; and
`blockedStatus()` returning an external record's string without checking it.

**Repair.** The device gate has its own vocabulary — only `PASS` satisfies it.
`classifyIpadStatus()` is total: `satisfied`, `failed`, `pending` (exactly
`PENDING_HUMAN_DEVICE_TEST`), or `unknown`, and `unknown` blocks with the value
quoted. Every proposed status is validated, refusals are recorded in the blocker
list rather than swallowed, and a final guard re-checks the published status.

**After repair**

```
ipad PASS       -> M1_ACCEPTED                                                completion=true
ipad SATISFIED  -> M1_BLOCKED — PHYSICAL IPAD ACCEPTANCE STATUS UNREADABLE (SATISFIED)
ipad MEASURED   -> M1_BLOCKED — PHYSICAL IPAD ACCEPTANCE STATUS UNREADABLE (MEASURED)
ipad missing    -> M1_BLOCKED — PHYSICAL IPAD ACCEPTANCE STATUS UNREADABLE (no value)
ipad BANANA     -> M1_BLOCKED — PHYSICAL IPAD ACCEPTANCE STATUS UNREADABLE (BANANA)
removed status  -> M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED
```

**A further hole my own sweep found, which the audit did not name.** The first fix
checked `isContractAuthorisedStatus()`. `M1_ACCEPTED` *is* authorised, so an
UNSATISFIED gate proposing it as its `milestoneStatusWhenUnsatisfied` produced
acceptance:

```
FALSE ACCEPTANCE {"other":"PENDING","proposal":"M1_ACCEPTED","status":"M1_ACCEPTED"}
```

A blocked-case proposal must itself be a blocked status. `isBlockedStatus()` now
gates it, and the sweep — 13 device values × 6 other values × 6 proposals — requires
that completion is declared only when the device status classifies as satisfied.

---

## Finding 2 — the tree-integrity gate accepted red or unparseable rounds

**Observed before repair.** The shipped record contained three red rounds while
every downstream artifact reported success:

```
round 1: 381/384, 3 failing, exit 1
round 2: 381/384, 3 failing, exit 1
round 3: 381/384, 3 failing, exit 1
allRunsGreen: false
exit condition in the tool: only treeUnchangedThroughout
gate summary meanwhile: 35 PASS, 0 FAIL, "met"
```

Nothing read `allRunsGreen`: the command keyed on file mutation alone, and no test
checked the record. The audit's second path is the same shape — under a runtime
whose summary form the parser did not recognise, a round recorded `null/null` and
the command still exited 0.

**Repair.** The record carries `allRunsParsed` and `proofValid`, and the command
exits nonzero unless the whole proof holds. The TAP reporter is pinned so the
summary form is not the runtime's choice, and an unparseable round is recorded as
such with a note. Two new tests close the loop: the committed record must be a valid
proof, and the exit condition must be `proofValid` rather than the revision-7
condition.

---

## Finding 3 — the legibility backstop was not in the frame path

**Observed before repair**, through the published probe operation:

```
enter legibility
lineageProbe.advance()
before frame: mode=legibility, generation=1, baseline=false
after frame:  mode=legibility, generation=1, baseline=false
```

The controls were repaired in revision 7, but `frame()` calls `renderLegibility()`
directly and never went through `renderPanels()`, where the backstop lived. The
revision-7 test drove state and then called `renderPanels()` — it never exercised
the real loop.

**Repair.** `frame()` enforces the invariant immediately before deciding what to
draw, and `renderLegibility()` enforces it again and falls back to the ordinary
render rather than painting a legibility layout over a non-baseline world. Three new
tests drive the actual frame path, including a forced running frame.

---

## Finding 4 — the provenance writer was fail-open on a dirty tree

**Observed before repair**, in a real repository with tracked source modified:

```
provenance.json: commit f49972a19093, 134 files hashed, working tree clean: false
uncommittedPaths: ["M lineage-m1/src/core/math.js"]
exit=0
```

Revision 7 claimed the writer "refuses to be written against a half-committed tree".
It recorded the dirty state and succeeded. The claim was true of the *suite*, not of
the generator.

**Repair.** The writer checks before writing anything, names every dirty path, and
exits nonzero without touching the existing record. `--allow-dirty` exists for local
inspection and stamps the record `provisional` with the dirty paths and the note
"NOT a delivery record". The regression builds a real git repository, commits a
baseline, dirties tracked production source, and requires the refusal — then checks
that the escape hatch marks the record unusable.

---

## Finding 5 — the delivery repeated the file-count error

The archive ships 135 regular files; the provenance record covers 134, excluding
itself. My delivery message said "strict provenance over all 134 shipped files",
which is wrong, and the accurate wording appeared later in the same message — a
self-contradiction on the exact defect the previous correction was for.

**Repair.** The counts in this delivery are read from the artifact rather than
typed, and the regression already computes the shipped count and requires the
recorded count to be exactly one less. The wording used from now on is: *N files
ship; the provenance record covers N−1, excluding only itself; the archive as a
whole is bound by its published ZIP SHA-256.*

---

## Finding 6 — the generated history omitted the revision-6 audit

The revision-7 report said revisions 1 through 5 were audited, while revision 6 had
also been audited and returned six defects.

**Repair.** The sentence is generated from the revision value: *"Revisions 1 through
N−1 were each independently audited and each returned BREAKS-FOUND."* It cannot fall
behind again without the revision value being wrong, which other tests catch.

---

## Non-regression

None of these six repairs is a biological change. The regenerated evidence is
compared against revision 7 in the delivery summary; the fixture, model identity,
characterization and traversal figures are unchanged.
