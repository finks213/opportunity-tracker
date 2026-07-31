# LINEAGE M1 — Revision-6 Repair Record

Bounded closure pass against **one consolidated defect set**: the revision-5 AFE-Δ
break-report (5 breaks) and the revision-5 structural audit (9 findings). Where the
two overlap they are treated as one finding with both identifiers; where they differ
the stricter requirement is applied.

**Audited artifact:** `LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV5.zip`
**Audited SHA-256:** `4ffc3110bba3a6aa2d4f04f23dfa709e8959f84a06471754a4f577f78b2a655e`

Every finding below was **reproduced against that exact artifact before any
production code was changed**. The "observed before repair" blocks are verbatim
output from those runs, not restatements of the audit text. Where my reproduction
disagreed with an audit, I say so.

No contract was amended in this pass. No product architecture was redesigned. No
Milestone-2 scope was added.

---

## Repair matrix

| ID | Audit | Reproduction | Production files changed | Regression test | Result |
|---|---|---|---|---|---|
| R6-A | MC-1 | `SCHEMA_VERSION` read | `src/config/modelConfig.js`, `src/fixtures/definingFixtureV1.js`, `src/core/simulation.js` | `test/frozen-schema-identity.test.js` (8) | frozen `-1` restored, all identity rejections proven under it |
| R6-B | MC-2 / Break 1 | two valid envelopes, reverse order | `src/main.js` | `test/fixture-transaction-atomicity.test.js` (6) | a superseded request commits nothing |
| R6-C | Break 1 | founder-set comparison | `src/observer/tracerChannels.js`, `src/main.js` | `test/fixture-transaction-atomicity.test.js` | exact founder-set binding; a name is not an identity |
| R6-D | Break 2 / MC-3a | Clear then advance to 400 | `src/main.js`, `src/observer/tracerChannels.js` | `test/maintained-witness-protection.test.js` (6) | witnesses protected and unselectable |
| R6-E | MC-3b | contribution range after follow | `src/main.js`, `src/observer/tracerChannels.js` | `test/maintained-witness-protection.test.js` | fractional contribution preserved by mirroring |
| R6-F | Break 3 | one-sided chain to 1100 | `src/observer/tracerChannels.js` | `test/exact-membership-underflow.test.js` (4) | exact membership survives underflow |
| R6-G | M-1 | outcome set and message scan | `src/observer/tracerChannels.js`, `src/main.js` | `test/milestone-scope-observer.test.js` (4) | group-ended logic removed |
| R6-H | Break 4 / MM-1 | mutate nested payload | `src/core/simulation.js` | `test/generation-result-immutable.test.js` (+3) | thrown object never retained |
| R6-I | Break 5 / M-3 | one-runtime clean copy | `tools/runRuntimeMatrix.mjs`, `runtime-matrix.config.json` | `test/runtime-matrix-coverage.test.js` (8) | one invariant, read by generator and test |
| R6-J | M-2 | gate constants and status literal | `tools/gateRegistry.mjs`, `tools/writeFinalReport.mjs`, `src/config/milestoneStatus.js`, `audit/external-gate-status.json` | `test/report-end-to-end-injection.test.js` (5) | status and gates derived end to end |
| R6-K | MM-2 | totals arithmetic, stale wording | `tools/gateRegistry.mjs`, `tools/writeFinalReport.mjs` | `test/report-end-to-end-injection.test.js`, `test/report-integrity.test.js` | categories partition the gate set |
| R6-L | L-1 | grep for a commit hash | `tools/writeProvenance.mjs`, `tools/verifyProvenance.mjs` | `test/provenance-binding.test.js` (5) | commit, model identity and every hash bound |

---

## R6-A / MC-1 — the contract-frozen biological schema was changed

**Observed before repair**

```
contract requires : lineage-biological-state-1
revision 5 declares: lineage-biological-state-2
```

`src/config/modelConfig.js:29` declared the changed value, fixture hydration wrote
it, and `test/defining-fixture-snapshot.test.js:117` was edited to require it. Code
and oracle agreed with each other; neither agreed with the frozen authority.

**Repair.** The frozen identifier is restored. The revision-5 justification — that
the bump stopped a pre-identity state masquerading as current — does not survive
inspection: R5-3 also made `modelIdentityHash` **mandatory and unconditional**, so a
state without a well-formed identity is rejected by `advanceGeneration` and by
`deserializeCanonicalBiology` on the identity check itself, whatever its schema
string says. The label was never what closed that hole.

**Regression.** `test/frozen-schema-identity.test.js` asserts the frozen value in the
declaration, in every constructed state, in serialized bytes and in fixture
hydration — and then proves, under that restored label, that a missing, `null`,
empty, malformed or mismatched identity is still rejected. It also fails if any
source or test file starts requiring the revision-5 label again outside an explicit
withdrawal.

---

## R6-B / MC-2 / Break 1 — a superseded request wrote shared state

**Observed before repair** — two structurally valid envelopes, the stale one
resolving last:

```
newer result true  | canopy first id now 1  | highWebbing 0.75
stale result false | canopy first id now 81 | highWebbing 0.99
follow outcome {"created":true,"founderCount":12,"source":"maintained-channel",
                "reason":"FOCAL_LINEAGE_RESOLVED"}
requested founders[0] 81   maintained channel founders[0] 1
requested === maintained: false
```

The rejected request returned `false` while replacing `this.fixtureEnvelope`, because
revision 5 assigned it *before* the commit gate. The structural audit's variant of
the same defect fed a later high-webbing load with `0.99` instead of `0.75`.

**Repair.** The fetched and parsed envelope stays in a request-local variable. After
the token check the whole world transaction is built and then published in one
uninterrupted block with no `await` inside it: envelope, biological state, observer
state, maintained-channel registry, fixture variant, `worldSource`, jitter, selection
and UI labels.

**Regression.** `test/fixture-transaction-atomicity.test.js` uses two DIFFERENT valid
envelopes in every completion order and asserts that a superseded request changes
neither the active world nor the cached metadata, that a later load cannot consume
stale bytes, and that a superseded *failure* posts no error label either. Revision
5's race tests resolved identical bytes, which is why they passed while this was
broken.

---

## R6-C / Break 1 (second half) — channels were selected by name

`resolveFocalLineage` matched `maintained:<name>` and used whatever it found. With a
poisoned cache the requested ids and the channel's founders diverged and the
interface reported one lineage while following another.

**Repair.** Every channel stores `founderKey`, an order-independent, duplicate-free
fingerprint of its exact founder set. Resolution compares the requested set against
it and refuses on mismatch, returning `FOCAL_ANCESTRY_UNRESOLVABLE` with both keys —
a refusal that asserts nothing about either lineage.

**After repair**

```
stale result false | canopy first id now 1 | highWebbing 0.75
requested founders[0] 1   maintained channel founders[0] 1
requested === maintained: true
```

---

## R6-D / Break 2 / MC-3a — Clear Tracers destroyed the ancestry witnesses

**Observed before repair**

```
channels after fixture load [ 'maintained:canopy', 'maintained:shoreline' ]
channels after Clear Tracers []
at generation 400, 270 living
follow after Clear: FOCAL_ANCESTRY_UNRESOLVABLE
```

`clearTracers()` called `observer.channels.clear()`, and the visible control is wired
straight to it. One click destroyed the only evidence that makes late focal
resolution possible.

**Repair.** Maintained witnesses are created `protectedChannel: true`.
`clearUserChannels()` removes everything else and nothing protected;
`selectableChannelIds()` keeps witnesses out of the channel selector, so they are
neither presented as ordinary tracers nor deletable through one.

**After repair** — the reachable history in full:

```
channels after Clear  [ 'maintained:canopy', 'maintained:shoreline' ]
follow after Clear at generation 400: {"created":true,"founderCount":270,
  "source":"maintained-channel","reason":"FOCAL_LINEAGE_RESOLVED"}
```

**Regression.** `test/maintained-witness-protection.test.js` runs load → Clear →
advance past 360 → follow both lineages, and separately asserts that the control the
UI actually wires up is the protecting one — a protecting method behind a button that
calls something else would be worthless.

---

## R6-E / MC-3b — following a lineage reset contribution to 1

**Observed before repair**, at generation 10:

```
maintained positive: 83  range 0.09375 .. 0.40625  sum 22.23046875
followed   positive: 83  range 1 .. 1              sum 83
```

`followFocalLineage` rebuilt the visible channel with `createTracerChannel`, which
sets every selected animal to 1. The quantitative inherited contribution the
interface named was replaced by binary membership.

**Repair.** The visible channel is MIRRORED from the witness: values and exact
membership are copied, and the mirror records `mirrorOf`. Clearing the mirror cannot
touch the witness.

**After repair**

```
maintained positive: 83  range 0.09375 .. 0.40625  sum 22.23046875
followed   positive: 83  range 0.09375 .. 0.40625  sum 22.23046875
```

---

## R6-F / Break 3 — floating-point underflow at generation 1075

**Observed before repair**

```
generation 1000 contribution 9.332636185032189e-302
generation 1073 contribution 1e-323
generation 1074 contribution 5e-324
generation 1075 contribution 0
first exact-zero generation 1075
known descendant by parent chain: true
resolver outcome FOCAL_LINEAGE_EXTINCT descendantIds []
```

Membership was `contribution > 0`, and contribution halves every generation on a
one-sided chain. The committed regression stopped at generation 1000 — one
generation-block short of a deterministic boundary reachable in about nine minutes at
the probe's 500 ms interval.

**Repair.** Each channel now carries both a numeric `values` map (display and
measurement, may underflow) and an exact `members` set propagated as `A || B`
(membership, cannot underflow). Membership is pruned to the living by the same rule
as the values, so the §15 memory bound is unchanged.

**After repair**

```
generation 1075 contribution 0 | exact member: true
generation 1100 contribution 0 | exact member: true
outcome at 1100: FOCAL_LINEAGE_RESOLVED  descendants 1
detail.contributionUnderflowedForSome: true
```

**Regression.** `test/exact-membership-underflow.test.js` asserts the boundary itself
(1074 is `5e-324`, 1075 is exactly 0 — so the test cannot silently stop proving
anything), then requires `RESOLVED` at generation 1100, and separately checks that
membership is inherited from either parent rather than averaged, and that adding it
does not unbound observer memory.

---

## R6-G / M-1 — forbidden Milestone-1 "group ended" logic

Contract §16 excludes that determination from this milestone. Revision 5 introduced
it while repairing false extinction reporting: `FOCAL_LINEAGE_EXTINCT` was defined,
derived from two paths, and surfaced as "no living descendant of the … focal lineage
remains".

**Repair.** The outcome is removed. `FOCAL_OUTCOME` now offers exactly two answers:
established, or not established. Where descendants cannot be established the observer
reports the unresolved state and, when it has one, the **observation** it made
(`livingDescendantsObservedNow: 0`) with an explicit note that Milestone 1 draws no
lineage-ended conclusion from it. The user-facing message says "cannot be
established" and states that it is not a claim that the lineage ended.

**A revision-5 oracle I rewrote, and why it is not a weakened test.**
`test/focal-lineage-retention.test.js` asserted that this case *must* read
`FOCAL_LINEAGE_EXTINCT`. That assertion was wrong twice: the outcome is out of scope,
and the zero it trusted was a `contribution > 0` test that underflows. The rewritten
test keeps everything except the verdict — no substitute group, attribution to the
witness, and the observation reported rather than hidden.

---

## R6-H / Break 4 / MM-1 — mutable nested error payloads

**Observed before repair**, with 66 observer failures:

```
result frozen true | array frozen true | record frozen true
thrown payload frozen false | nested payload frozen false
state diagnostic after external mutation:
  {"message":"FORGED","detail":{"code":"FORGED","nested":{"value":999}}}
```

The record wrapper was frozen; the thrown object under `error` was not, and neither
was anything inside it. The revision-5 tests mutated the wrapper and stopped there.

**Repair.** `diagnosticSnapshot()` converts each failure at capture time into a
frozen plain object with only `name`, `message`, `stack`, `text` and `wasError` — all
primitives. The thrown value is not retained, so there is nothing left to rewrite. A
thrown value with a hostile `toString` is recorded as
`[unrepresentable thrown value]` rather than breaking the transaction.

**After repair**

```
thrown payload frozen true | nested payload frozen true
state diagnostic after external mutation: {"message":"boom"}
```

---

## R6-I / Break 5 / M-3 — the runtime matrix could invalidate its own build

**Observed before repair** on a full clean copy with one Node install:

```
$ node tools/runRuntimeMatrix.mjs
v22.22.2 render 14fc43dd9078… MATCHES committed | tests 62/62, 0 failing
runtime-matrix.json: 1 majors, 1 distinct rendered hash(es),
  runtime-independent: true, all match committed: true, all determinism tests pass: true
generator exit code: 0

$ node --test test/report-determinism.test.js
not ok 4 - §26 — the report renders identically on every recorded runtime
  error: 'at least two majors must be exercised, saw 1'
# tests 4 / pass 3 / fail 1
```

The documented regeneration command succeeded and produced evidence that immediately
failed the build it was meant to reproduce, because the generator's success condition
and the test's threshold were two separate rules.

**Repair.** `runtime-matrix.config.json` is the single declaration of required
majors, minimum distinct majors, the declared compatibility range and the acquisition
procedures. `evaluateCoverage()` is the single judgement, imported by both the
generator and the test. The generator exits nonzero and records
`sufficientCoverage: false` rather than claiming independence. Discovery honours
`LINEAGE_NODE_BINARIES` first, then nvm, then the `/opt` layout, so it no longer
depends on one machine's private filesystem; container and CI procedures are
documented in the config.

**Claim narrowed.** The record separates `declaredCompatibility` (`>=18`, what the
project claims to run on) from `executedMajors` (what was measured), and states in
`notClaimed` that not every major in the open-ended range was exercised. No artifact
describes the executed subset as "every supported Node major" — a regression scans
the report and manifest for exactly that.

---

## R6-J / M-2 — the evidence-to-report path was incomplete

Three gate rows were constants in `tools/gateRegistry.mjs` (`fixedStatus`), and
`deriveGateStatuses` returned them without opening any file — while the report said
every row was derived. The overall status and the completion flag were literals in
`src/config/milestoneStatus.js`, unreachable by any execution result.

**Repair.**

- External gates declare `evidenceSource`, `evidencePointer` and `determinedBy`, and
  their statuses are READ. A missing or unreadable input yields `UNVERIFIED` — never
  a favourable default. They are labelled external, never machine-verified.
- `deriveMilestoneStatus()` computes the status and `mayDeclareCompletion` from the
  derived gates plus those inputs, and returns the blocker list, which the report
  prints. The status STRING is selected by the evidence: the unsatisfied external
  gate with the lowest priority names it, from `audit/external-gate-status.json`.
- `renderFinalReport({root})` can render from any tree, so the injection proof
  regenerates the real report from a controlled failing run instead of exercising a
  pure function.

**Controlled failure injection, end to end.** One passing test in a copied TAP is
rewritten as failing, in a temporary tree. The regenerated report changes:

```
that gate's row                       PASS -> FAIL, naming the failing test
| Full test suite | §20 | …           -> **FAIL**
§28 every automated result …          met -> NOT met
mayDeclareCompletion                  -> false
milestone status                      -> M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED
blockers                              -> "the build-blocking suite reported failures",
                                         "1 automated gate(s) FAIL: <gate>"
```

The opposite direction is proven too: satisfying the external inputs one at a time
moves the status through each declared blocker to `M1_ALL_GATES_SATISFIED` with
`mayDeclareCompletion: true` — and even then the external gates are still labelled
external. A forbidden status (`M1_AUTOMATED_GATES_PASS`, `M1_ACCEPTED`) can never be
emitted by the derivation.

**A standing condition made explicit.** `independentClosureAudit` is recorded in the
external-status file as `PENDING`. It is why a green suite does not by itself move
the status: revisions 1–5 each paired a green in-house suite with real defects. It
binds the status without being counted as a gate.

---

## R6-K / MM-2 — generated-report integrity defects

**Observed before repair**

```
printed totals: 35 PASS · 0 FAIL · 1 UNVERIFIED · 3 externally determined (of 38)
sum of printed categories: 39 vs denominator 38
external gates read a named evidence file: desktopCanvasMemory:NONE, ipadGate:NONE,
                                           stageAOrder:NONE
stale revision-4 wording: "**must not** advance until revision 4 survives
                           independent re-audit by both the"
overall status is a source literal: true
```

**Repair.** The categories partition the gate set: an externally determined gate is
counted once, as external, and never again under its status. The report prints the
arithmetic explicitly and the sum is asserted. The revision wording is generated from
the current revision and the derived blocker list rather than typed. Every gate row
names its evidence source — the named tests for a machine-verified gate, the named
input file for an external one.

---

## R6-L / L-1 — the bundle did not identify its source

**Repair.** `audit/provenance.json` binds the delivery to its source without shipping
`.git`: resolved commit, branch, tree hash, commit time, working-tree cleanliness,
the authoritative `modelDefinitionHash`, the fixture hash, the published run's counts
and the derived milestone status, plus a SHA-256 and byte count for every generated
report and every raw evidence file. `tools/verifyProvenance.mjs` recomputes all of it
from an extraction with no network and no dependency.

The one value that cannot be inside the archive is the archive's own SHA-256; the
record says so plainly and points at the published value rather than carrying a
number it could not have computed.

**Regression.** `test/provenance-binding.test.js` requires a resolved 40-character
commit, verifies every recorded hash against the shipped files, requires that no
audit file is unrecorded, and — the part that makes the record worth shipping —
tampers with an evidence file in a scratch copy and requires the verification to
fail.

---

## Findings I did NOT accept as stated

**"The tree-integrity monitor's claim is stronger than a polling watcher can prove."**
The structural audit is right, and counted no defect for it. I agree with the
narrower reading: sampling establishes that no mutation was observed across
1,000,000+ samples and that the previous mutation path is gone by construction, not
that no sub-sample transient could ever occur. The wording in the revision-5 record
is left as written and this qualification is recorded here rather than the claim
being quietly restated.

**The AFE-Δ audit did not complete the 300-test suite independently** and said so.
That is a limitation of that pass, not a defect, and no repair is claimed for it.

---

## Required clean executions

Every artifact below was regenerated **after the last production edit**. Nothing is
carried over from revision 5, including the evidence that turned out identical.

| # | Required execution | Command | Result |
|---|---|---|---|
| 1 | syntax checks | `node --check` over `src/`, `tools/`, `test/` | 94 files, **all parsed clean** |
| 2 | dependency install from lockfile | `npm ci` in an empty directory from `package.json` + `package-lock.json` | **exit 0**, `playwright@1.56.1`, 0 vulnerabilities |
| 3 | official suite under every executed Node major | `node --test test/*.test.js` under each | `v20.20.2` **349/349** · `v21.7.3` **349/349** · `v22.22.2` **349/349**. **Node 18 and 19 are not installed here and were NOT run**; the declared range stays `>=18` because nothing in the code requires more, and `runtime-matrix.config.json` records the requirement rather than a claim about the whole range |
| 4 | long-retention focal-lineage tests | `test/focal-lineage-retention.test.js`, `test/exact-membership-underflow.test.js` | asserted at generations 12, 360, 361, 400, 800, 1000 **and 1075/1100** — past the underflow boundary revision 5 stopped short of |
| 5 | concurrent world-load race tests | `test/world-load-race.test.js`, `test/fixture-transaction-atomicity.test.js` | 13 tests; two DIFFERENT valid envelopes in every completion order |
| 6 | missing / malformed model-identity tests | `test/frozen-schema-identity.test.js`, `test/model-hash-provenance.test.js` | missing, `undefined`, `null`, empty, malformed and mismatched all rejected — under the restored frozen schema |
| 7 | cross-evidence model-hash tests | `test/model-hash-provenance.test.js` | one identity across all evidence: `dc444865…` |
| 8 | exact 200-seed fixture gate | `node tools/runFixture.mjs` | canopy **200/200**, shoreline **197/200** (floor 130), `allPass: true` |
| 9 | current and legacy 500-seed characterization | `node tools/runCharacterization.mjs`, `--config v1` | config-2 median **256 PASS**; config-1 median **421 FAIL** |
| 10 | edge-only 500-seed experiments | `node tools/runEdgeOnlyTraversal.mjs` | **500/500** each direction, median first generation **3**, 0 extinct |
| 11 | observer invariance | `node tools/writeAuditEvidence.mjs` | 5 strategies × 31 generations, **byte-identical**, 0 mismatches |
| 12 | observer memory and genealogy bounds | suite + `npm run audit:desktop` | after 180 generations: 224 living, 22,470 retained genealogy records; exact membership pruned by the same rule, so the §15 bound is unchanged |
| 13 | browser probe | `npm run audit:desktop` (Playwright, headless Chromium) | 180 frames, 360/360 stress glyphs counted, 0 page errors, Node cross-check AGREES |
| 14 | honest browser-memory classification | same run | `DESKTOP_CANVAS_MEMORY` **UNVERIFIED**, no number, no substitute; `NODE_SIMULATION_HEAP` separate and self-declared as not the §22 subject |
| 15 | report failure-injection tests | `test/report-end-to-end-injection.test.js` | end-to-end: a failing TAP regenerates the real report with gate row, suite row, §28 claim, completion flag and milestone status all changed |
| 16 | concurrent test-tree integrity checks | `npm run audit:tree-integrity` | 3 rounds at concurrency 4, **975,753 samples**, **0 deviations**, all rounds **349/349** |
| 17 | fixture and reference hashes | suite + `node tools/writeAuditEvidence.mjs` | fixture `c80aaa52…` matches the frozen value; all 3 quarantined Python references unchanged |

**Convergence.** `audit:tests` → `manifest:paths` → `report:final` →
`audit:runtime-matrix` → `audit:provenance` → `audit:tests` reaches a fixed point:
**349/349, 0 failures**, `FINAL_REPORT.md` byte-identical to a fresh render, all
three majors rendering `152b611238a06088…`, and `PROVENANCE OK`.

**Not run, and not claimed:** the physical iPad acceptance gate and the §24 Stage A
process decision. Both are held per the halt condition until revision 6 survives the
bounded closure audit, and both are recorded as unsatisfied external gates — which is
part of why the derived status reads blocked.

---

## Non-regression

The revision-6 repairs touch observer channel structure, world-transaction
publication, diagnostic capture, report derivation and tooling. **None is a
biological change**, and the fully regenerated evidence confirms it:

| Measure | Revision 5 | Revision 6 |
|---|---|---|
| §19.3 canopy Δ | −0.383874 | −0.383874 |
| §19.3 shoreline Δ | +0.325326 | +0.325326 |
| §19.4 canopy successes | 200 / 200 | 200 / 200 |
| §19.4 shoreline successes | 197 / 200 | 197 / 200 |
| §19.4 medians (shoreline low / high) | 18.2986 / 43.7529 | 18.2986 / 43.7529 |
| config-2 median population | 256 | 256 |
| config-2 median concentration | 0.4686 | 0.4686 |
| config-1 median population | 421 (FAIL) | 421 (FAIL) |
| edge-only reaches | 500/500 both directions | 500/500 both directions |
| edge-only median first generation | 3 | 3 |
| observer invariance | byte-identical | byte-identical |
| authoritative `modelDefinitionHash` | `dc444865…` | `dc444865…` |
| runtime model identity | `69dee399…` | `69dee399…` |
| fixture SHA-256 | frozen value | frozen value |
| quarantined Python references | unchanged | unchanged |

**Changes that DID occur, and why:**

| Value | Revision 5 | Revision 6 | Reason |
|---|---|---|---|
| biological schema | `lineage-biological-state-2` | `lineage-biological-state-1` | R6-A: the contract-frozen identifier restored |
| focal outcomes | RESOLVED / EXTINCT / UNRESOLVABLE | RESOLVED / UNRESOLVABLE | R6-G: §16 excludes group-ended logic |
| channel structure | numeric `values` only | `values` + exact `members` + `founderKey` + `protectedChannel` | R6-C, R6-D, R6-F |
| observer error records | the thrown object | an immutable primitive snapshot | R6-H |
| external gate statuses | literals in `tools/gateRegistry.mjs` | read from `audit/external-gate-status.json` | R6-J |
| milestone status | literal in `src/config/milestoneStatus.js` | derived from the run plus external inputs | R6-J |
| gate totals | 35 + 0 + 1 + 3 of 38 (sum 39) | 35 + 0 + 0 + 3 of 38 (sum 38) | R6-K: the categories partition the set |
| suite size | 300 tests | 349 tests | 49 new regression tests across the twelve findings |

**Committed suite:** 349 tests, 349 passing, 0 failing — on Node 20, 21 and 22.
