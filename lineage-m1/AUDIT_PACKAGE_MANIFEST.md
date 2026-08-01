# LINEAGE Milestone 1 — Audit Package Manifest

Bundle: `LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV8_1.zip`
Contents: the complete `lineage-m1/` project directory required by contract §23.

---

## 1. Environment and versions

| Field | Value |
|---|---|
| Node version (official evidence run) | v22.22.2, recorded in `audit/build-environment.json` |
| Declared runtime support | `node >=18`, UNCHANGED — the range the project claims to RUN on |
| Node majors actually EXECUTED | **20, 21, 22**. The full suite passes on each, and each renders `FINAL_REPORT.md` to identical bytes. This is a subset of the declared range and is not a claim about every major in it; `runtime-matrix.config.json` declares the requirement and `audit/runtime-matrix.json` records the result (revision-6 R6-I) |
| npm version | 10.9.7 |
| Operating system (final run) | Linux 6.18.5 x86_64 |
| Runtime dependencies | none (`dependencies` is empty) |
| Dev dependencies | `playwright` ^1.56.1, pinned by `package-lock.json`; used ONLY by `tools/measureDesktop.mjs` |
| Final config version | `lineage-m1-config-2` |
| Final **complete model-definition** hash (config-2) | `dc444865163deb32a7a9d80bd23f576d1ab5a936896298b5cd13faac6f513b3d` |
| Tuning-config-only hash (subset, config-2) | `edb81695973b81ab8f87f7ef9dde9d8c5b3d4c7dfbeb45f385547edd86ee86de` |
| Complete model-definition hash (config-1) | `4724f9b98be6457bcd962f5f8f0851493884b9e882a87d84e939a237fa878119` |
| Runtime model identity (config-2, 128-bit FNV-1a, isomorphic to the SHA-256 above) | `69dee399ec8a50cc7e1231959d2e31af` |
| Superseded config retained | `lineage-m1-config-1` as `legacyModelConfigV1` |
| **Final reported status** | **`M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED`** |
| Bundle revision | **8**, correction **1** — the revision-8 closure pass, plus a surgical acceptance-tooling correction for the five defects of the revision-8 bounded closure audit. The biological model is FROZEN: `src/` is byte-identical to the revision-8 bundle apart from `src/config/milestoneStatus.js`, which is report policy with no importer in `src/`, and the authoritative model hash is unchanged |
| Automated implementation gates | **NOT CLAIMED** — repaired and re-run, but no pass is self-certified until revision 8 survives independent re-audit. Every gate row in `FINAL_REPORT.md` is now DERIVED from named test results (`audit/gate-summary.json`), so the report cannot assert a pass the run does not evidence |
| Physical iPad gate | `PENDING_HUMAN_DEVICE_TEST` |
| §24 Stage A planning order | VIOLATED — unrepairable, principal decision required (DECISIONS.md D-024). **Not** the only blocker. |
| Revision-8.1 delivery correction | `REVISION_8_1_DELIVERY_CORRECTION.md` — the five acceptance/evidence defects, each reproduced against the delivered revision-8 artifact before repair |
| Revision-8 repair record | `REVISION_8_REPAIR_RECORD.md` — per-finding reproduction against the delivered revision-7 artifact, repair, regression test and post-repair result |
| Revision-7 repair record | `REVISION_7_REPAIR_RECORD.md` — per-finding reproduction against the delivered revision-6 artifact, repair, regression test and post-repair result |
| Revision-6 repair record | `REVISION_6_REPAIR_RECORD.md` — retained |
| Revision-5 repair record | `REVISION_5_REPAIR_RECORD.md` — per-defect reproduction command, observed revision-4 result, repair, revision-5 result, and the COMMITTED regression test |
| Revision-4 repair record | `REVISION_4_REPAIR_RECORD.md` — retained |
| Revision-5 decisions | `DECISIONS.md` D-044 … D-052, plus the withdrawn revision-4 claims |
| Revision-4 decisions | `DECISIONS.md` D-035 … D-043 — retained |

---

## 2. Exact clean-run commands

```bash
# from the bundle root, after extracting. No install step is required for the
# simulation, the tests, or any evidence generator EXCEPT the desktop measurement
# (step 6b), which needs the `playwright` devDependency and its Chromium binary.
cd lineage-m1

# 1. every build-blocking invariant and contract test  (exit 0; the raw count is
#    whatever audit/test-results.txt records — no count is asserted in prose)
#    This INCLUDES the exact 200-seed §19.4 fixture gate, so it is slow (~10 min).
npm test                              # node --test --test-timeout=3600000 test/*.test.js

#    To PUBLISH the raw output as audit evidence, use this instead. It writes to a
#    temporary file and renames it over audit/test-results.txt only after the suite
#    exits, so report-integrity.test.js compares FINAL_REPORT.md against the last
#    COMPLETE run rather than the half-written file of the run executing it:
npm run audit:tests

# 2. the defining fixture matched trajectory gate, seeds 1..200 at generation 90
node tools/runFixture.mjs             # writes audit/fixture-results.json   (~180 s)

# 3. the predeclared 500-seed characterization batch, 180 generations
node tools/runCharacterization.mjs                                  # ~7 min
node tools/runCharacterization.mjs --config v1 \
     --out audit/characterization-results-config1.json              # §21.7 side-by-side, ~12 min

# 4. the DECLARED edge-only adjacency-traversal experiment, seeds 1..500 each way
node tools/runEdgeOnlyTraversal.mjs   # writes audit/edge-only-traversal-results.json  (~9 min)

# 5. observer-invariance hashes and reference-file hashes
node tools/writeAuditEvidence.mjs

# 6. render CHARACTERIZATION.md from the raw audit JSON only
node tools/writeCharacterization.mjs

# 6b. reproducible desktop Canvas measurement (revision 4). Requires the
#     playwright devDependency and its Chromium binary:
npm install && npx playwright install chromium
npm run audit:desktop                 # writes audit/desktop-measurements.json

# 6c. record the environment of the OFFICIAL evidence run. FINAL_REPORT.md reads
#     this file instead of the live runtime, so re-rendering on a different
#     supported Node does not change the report's bytes (revision-5 R5-6).
npm run audit:environment             # writes audit/build-environment.json

# 6d. generate FINAL_REPORT.md and audit/gate-summary.json from the raw evidence.
#     Never edit FINAL_REPORT.md by hand; test/report-integrity.test.js fails if
#     you do. Every gate row is DERIVED from the named tests in the published TAP
#     (revision-5 R5-7), so run this AFTER `npm run audit:tests`.
npm run report:final

# 6e. refresh the generated path inventory in section 7 of this manifest.
npm run manifest:paths

# 6f. cross-runtime proof: render the report under every Node major present and
#     hash the result; run the determinism-critical tests on each (revision-5
#     R5-6). Run after 6d, because it compares against the committed report.
npm run audit:runtime-matrix          # writes audit/runtime-matrix.json  (~6 min)

# 6g. source-tree integrity proof: sample every file under src/ continuously while
#     the full suite runs at high concurrency, and record any deviation
#     (revision-5 R5-8).
npm run audit:tree-integrity          # writes audit/tree-integrity.json  (~9 min)

# 6h. bind the bundle to its source revision: commit, tree hash, model identity and
#     a hash for every report and evidence file (revision-6 R6-L). Run LAST, after
#     every other artifact is final, and re-run after any commit.
npm run audit:provenance              # writes audit/provenance.json

#     From an extraction of the delivered archive, an auditor verifies all of it
#     with no network and no dependency:
npm run audit:verify-provenance

#     Steps 1, 6d and 6f form a fixed point: the suite checks the report, the
#     report is generated from the suite's published TAP, and the matrix hashes
#     the committed report. Run `audit:tests` -> `manifest:paths` -> `report:final`
#     -> `audit:runtime-matrix` -> `audit:tests` and the last run is green with the
#     report unchanged. That convergence is the intended state, not a workaround.

# 7. the Canvas probe (desktop measurement and the manual iPad modes)
#    Containment is covered by test/server-containment.test.js; run the suite
#    before exposing this on a network.
node tools/serve.mjs 8080                    # binds 0.0.0.0 for the iPad workflow
node tools/serve.mjs 8080 --host 127.0.0.1   # loopback only

# optional: the retained pre-declaration calibration sweep (DECISIONS.md D-010)
node tools/calibrationSweep.mjs
```

---

## 3. Required hashes

### Checked-in fixture (§19 A)

| File | SHA-256 |
|---|---|
| `fixtures/defining_fixture_v1.json` | `c80aaa523d3b3eec2655502b4eaebdbbb4d12f71f8b3378d9d3be60797342b78` |

Matches the value frozen in the contract. Verified before parsing on every run
by `src/fixtures/nodeFixtureIO.js` and asserted by
`test/defining-fixture-snapshot.test.js`.

### Quarantined Python references (§1, §27)

Copied byte-for-byte from the starter and never imported by any source module.
All three match `SHA256_MANIFEST.json` from `LINEAGE_CLAUDE_CODE_STARTER_v3_3`:

| File | SHA-256 | Unchanged |
|---|---|---|
| `reference/biology.py` | `ecc9d143a03bf3cf4ac4fab29598acd072396227f6305b212f681b0544b3a1f8` | yes |
| `reference/engine.py` | `303859044028fa4f4d67e862792090b9094b737e4a75495c338ddde50f22247c` | yes |
| `reference/analyze.py` | `d878c440eef459aa544be0b3ff19ae202e241d690b9df5264e17eabd3d5ab494` | yes |

Machine-readable proof: `audit/reference-file-hashes.json`.

---

## 4. Raw evidence required by §27

| Path | Contents |
|---|---|
| `audit/test-results.txt` | unedited stdout/stderr from the final clean test run, including the emitted three-zone trait deltas, the §19.3 probe values, and the post-repair boundary-record counts. The TAP summary in this file is the ONLY authority for the suite count; `FINAL_REPORT.md` reads it rather than restating it |
| `audit/fixture-results.json` | seed-level paired fixture results for seeds 1..200: medians, successes, ties, focal-contribution and whole-world extinction counts, total-population distributions, full paired difference distributions, and the configuration hash |
| `audit/characterization-results.json` | raw 500-seed metrics under `lineage-m1-config-2`, sufficient to reproduce every table in `CHARACTERIZATION.md`, including every seed-level concentration value |
| `audit/characterization-results-config1.json` | the same batch under the superseded `lineage-m1-config-1`, for the §21.7 side-by-side |
| `audit/observer-invariance-hashes.json` | generation-by-generation canonical biological SHA-256 hashes for all five required observer strategies in the defining fixture (5 × 31, zero mismatches) |
| `audit/reference-file-hashes.json` | hashes proving the historical Python references remain unchanged |
| `STRUCTURAL_AUDIT_REPAIR_RECORD.md` | one row per verified defect: reproduction command, observed revision-2 result, repair, revision-3 result, and regression test |
| `audit/edge-only-traversal-results.json` | the **AUTHORITATIVE** §21.6 adjacency-traversal experiment: isolated 40-founder worlds, seeds 1..500 each direction, with the fully frozen initializer recorded under `frozenInitializer`. This file, and only this file, carries the traversal claim (see `CHARACTERIZATION_PLAN.md` Amendment 1) |
| `audit/desktop-measurements.json` | desktop Canvas frame-time, input-latency and memory measurements (headless Chromium; **not** the iPad gate). Regenerable with `npm run audit:desktop`. Includes an in-page probe of `performance.memory` resolution, a Node cross-check of generation/population/zone bins, and explicit generation semantics |
| `audit/meaningful-trait-gate.json` | the exact §9/§20.5 three-zone delta vectors and §20.4 neutral-trait maxima, emitted from the production survival path so `FINAL_REPORT.md` is generated rather than retyped |
| `audit/build-environment.json` | the environment of the OFFICIAL evidence run (Node version, platform, arch, V8) plus the declared support range. `FINAL_REPORT.md` reads this instead of the live runtime, so report bytes do not depend on which supported Node re-renders them (revision-5 R5-6) |
| `audit/runtime-matrix.json` | proof that rendering `FINAL_REPORT.md` produces identical bytes on every Node major available, and that the determinism-critical tests pass on each. States plainly what it does NOT claim: that the full 200-seed suite ran on every major |
| `audit/gate-summary.json` | the machine-readable gate table: every gate mapped to the named tests that evidence it, with derived PASS / FAIL / UNVERIFIED. Generated from the same call that renders the report's table (revision-5 R5-7) |
| `audit/external-gate-status.json` | the machine-readable statuses of the gates NO automated run can decide: the physical iPad gate, the §24 Stage A process decision, and the standing independent-closure-audit condition. `FINAL_REPORT.md` and the derived milestone status READ this file; revision 5 hardcoded these three values in `tools/gateRegistry.mjs` (revision-6 R6-J) |
| `audit/provenance.json` | binds this bundle to its source: resolved commit, branch, tree hash, the authoritative model identity, the published run's counts, and a SHA-256 and byte count for every generated report and raw evidence file. Verify with `npm run audit:verify-provenance` (revision-6 R6-L) |
| `audit/tree-integrity.json` | continuous sampling of every file under `src/` while the full suite runs at high concurrency, recording any deviation. Proves tests cannot modify or race the production tree (revision-5 R5-8) |

No failing test, unused module, superseded tuning result, or raw output was
removed because it appeared unhelpful. `tools/calibrationSweep.mjs` and
`audit/characterization-results-config1.json` are deliberately retained
superseded material.

---

## 5. Excluded path categories

Only the categories §27 permits:

| Category | Note |
|---|---|
| `.git/` | version-control metadata |
| `node_modules/` | not present; the project has no runtime dependencies |
| operating-system metadata | `.DS_Store`, `Thumbs.db` |
| temporary editor files | `*.swp`, `*~`, `.vscode/`, `.idea/` |
| replaceable caches | none present |

Nothing else is excluded.

---

## 6. iPad gate

`IPAD_TEST_CHECKLIST.md` is included and **unfilled**. Its status is
`PENDING_HUMAN_DEVICE_TEST`. No physical-device measurement is supplied and no
threshold is claimed as met. Per §27, the absence of those optional media files
does not make the implementation accepted; the pending state is preserved.

---

## 7. Every included path

<!-- BEGIN GENERATED PATH INVENTORY -->

Generated by `node tools/writeManifestPaths.mjs` from the bundle itself.
`node tools/writeManifestPaths.mjs --check` fails if this list has gone stale, and
`test/manifest-inventory.test.js` runs that check in the build-blocking suite.

**140 files.**

The archive ships 140 files. 139 files are internally recorded and verified. `audit/provenance.json` is excluded because it cannot hash itself. The published ZIP SHA-256 binds the complete archive, including that record.

- `AUDIT_PACKAGE_MANIFEST.md`
- `CHARACTERIZATION.md`
- `CHARACTERIZATION_PLAN.md`
- `DECISIONS.md`
- `FINAL_REPORT.md`
- `IPAD_TEST_CHECKLIST.md`
- `PLAN.md`
- `README.md`
- `REVISION_4_REPAIR_RECORD.md`
- `REVISION_5_REPAIR_RECORD.md`
- `REVISION_6_REPAIR_RECORD.md`
- `REVISION_7_REPAIR_RECORD.md`
- `REVISION_8_1_DELIVERY_CORRECTION.md`
- `REVISION_8_REPAIR_RECORD.md`
- `STRUCTURAL_AUDIT_REPAIR_RECORD.md`
- `audit/build-environment.json`
- `audit/characterization-results-config1.json`
- `audit/characterization-results.json`
- `audit/desktop-measurements.json`
- `audit/edge-only-traversal-results.json`
- `audit/external-gate-status.json`
- `audit/fixture-results.json`
- `audit/gate-summary.json`
- `audit/meaningful-trait-gate.json`
- `audit/observer-invariance-hashes.json`
- `audit/provenance.json`
- `audit/reference-file-hashes.json`
- `audit/runtime-matrix.json`
- `audit/test-results.txt`
- `audit/tree-integrity.json`
- `fixtures/defining_fixture_v1.json`
- `index.html`
- `package-lock.json`
- `package.json`
- `reference/analyze.py`
- `reference/biology.py`
- `reference/engine.py`
- `runtime-matrix.config.json`
- `src/config/milestoneStatus.js`
- `src/config/modelConfig.js`
- `src/config/modelDefinition.js`
- `src/config/modelIdentity.js`
- `src/config/modelIdentityNode.js`
- `src/config/traits.js`
- `src/config/zones.js`
- `src/core/canonicalSerialize.js`
- `src/core/events.js`
- `src/core/genealogy.js`
- `src/core/individual.js`
- `src/core/inheritance.js`
- `src/core/math.js`
- `src/core/mating.js`
- `src/core/mutation.js`
- `src/core/performance.js`
- `src/core/rng.js`
- `src/core/simulation.js`
- `src/core/survival.js`
- `src/debug/animalGlyph.js`
- `src/debug/canvasProbe.js`
- `src/debug/controls.js`
- `src/debug/desktopMeasure.js`
- `src/debug/inspector.js`
- `src/fixtures/definingFixtureV1.js`
- `src/fixtures/edgeOnlyWorlds.js`
- `src/fixtures/nodeFixtureIO.js`
- `src/main.js`
- `src/observer/currentZoneBins.js`
- `src/observer/matingAnnotations.js`
- `src/observer/tracerChannels.js`
- `styles.css`
- `test/acceptance-tool-hardening.test.js`
- `test/allocation-mutation-contract.test.js`
- `test/birth-immutability.test.js`
- `test/canvas-jitter-membership.test.js`
- `test/defining-fixture-snapshot.test.js`
- `test/defining-fixture.test.js`
- `test/dependency-boundary.test.js`
- `test/desktop-measurement-reproducibility.test.js`
- `test/edge-only-traversal.test.js`
- `test/exact-membership-underflow.test.js`
- `test/external-gate-status-currency.test.js`
- `test/fixture-transaction-atomicity.test.js`
- `test/focal-lineage-integrity.test.js`
- `test/focal-lineage-retention.test.js`
- `test/frozen-schema-identity.test.js`
- `test/full-path-mutation-independence.test.js`
- `test/genealogy-integrity.test.js`
- `test/genealogy-retention-boundary.test.js`
- `test/generation-result-immutable.test.js`
- `test/helpers/scriptedRng.js`
- `test/legibility-invariant.test.js`
- `test/lifecycle-contract.test.js`
- `test/maintained-witness-protection.test.js`
- `test/manifest-inventory.test.js`
- `test/mating-integrity.test.js`
- `test/meaningful-trait-context.test.js`
- `test/median-consistency.test.js`
- `test/milestone-scope-observer.test.js`
- `test/model-hash-provenance.test.js`
- `test/model-identity.test.js`
- `test/mutation-provenance.test.js`
- `test/neutral-traits.test.js`
- `test/observer-invariance.test.js`
- `test/observer-memory-bounds.test.js`
- `test/observer-transaction-integrity.test.js`
- `test/probe-world-identity.test.js`
- `test/provenance-binding.test.js`
- `test/report-determinism.test.js`
- `test/report-end-to-end-injection.test.js`
- `test/report-integrity.test.js`
- `test/rng-integrity.test.js`
- `test/runtime-matrix-coverage.test.js`
- `test/server-containment.test.js`
- `test/spatial-integrity.test.js`
- `test/status-consistency.test.js`
- `test/status-derivation-hardening.test.js`
- `test/status-truth-table.test.js`
- `test/survival-composition.test.js`
- `test/test-tree-integrity.test.js`
- `test/traversal-label-integrity.test.js`
- `test/world-load-race.test.js`
- `test/world-reset-completeness.test.js`
- `tools/calibrationSweep.mjs`
- `tools/gateRegistry.mjs`
- `tools/measureDesktop.mjs`
- `tools/proveTreeIntegrity.mjs`
- `tools/runCharacterization.mjs`
- `tools/runEdgeOnlyTraversal.mjs`
- `tools/runFixture.mjs`
- `tools/runRuntimeMatrix.mjs`
- `tools/runTests.mjs`
- `tools/serve.mjs`
- `tools/verifyProvenance.mjs`
- `tools/writeAuditEvidence.mjs`
- `tools/writeBuildEnvironment.mjs`
- `tools/writeCharacterization.mjs`
- `tools/writeFinalReport.mjs`
- `tools/writeManifestPaths.mjs`
- `tools/writeProvenance.mjs`
- `tree-integrity.config.json`

<!-- END GENERATED PATH INVENTORY -->

---

## 8. Revision history

### Revision 8 (this bundle)

A narrow closure pass on the six findings of the revision-7 structural audit, each
reproduced against the delivered revision-7 artifact
(`3098e856600af55c231e26fc33aecfd8168e9d580050ce436a00dc242b71e1a9`) before any
production change.

| # | Finding | Repair | Regression |
|---|---|---|---|
| 1 | the status derivation accepted `MEASURED`/`SATISFIED` as a passing device test, read unknown device values as "pending", and published whatever status string an external record proposed | the device gate has its own vocabulary (only `PASS` satisfies), unknown values block, and a blocked-case proposal must itself be a contract-authorised blocked status | `test/status-derivation-hardening.test.js` |
| 2 | the tree-integrity command exited 0 with red or unparseable suite rounds | the exit condition is the validity of the whole proof; the TAP reporter is pinned; an unparseable round is recorded and fails | `test/test-tree-integrity.test.js` |
| 3 | the legibility backstop was not in the animation-frame path | `frame()` and `renderLegibility()` both enforce the invariant | `test/legibility-invariant.test.js` |
| 4 | the provenance writer recorded a dirty tree and exited 0 | it refuses before writing; `--allow-dirty` marks the record provisional and is never a delivery | `test/provenance-binding.test.js` |
| 5 | the delivery message said "all 134 shipped files" when 135 ship | the count is computed from the archive, not asserted | `test/provenance-binding.test.js` |
| 6 | the generated history omitted the revision-6 audit | the history is generated from the revision value | `test/status-consistency.test.js` |

### Revision 7

A narrow closure pass on the six findings of the revision-6 structural audit, each
reproduced against the delivered revision-6 artifact
(`37324f0cc9198411d72dec2aec729fa71d10da24b4109a167430de8af929efc7`) before any
production change. `REVISION_7_REPAIR_RECORD.md` carries the verbatim pre-repair
output for every one.

| # | Finding | Repair | Regression |
|---|---|---|---|
| 1 | legibility mode kept its label after Step, Run or a webbing override changed the world | the §22 invariant is continuous: world-changing controls leave the mode, and every rendered frame re-checks it | `test/legibility-invariant.test.js` |
| 2 | the status machine invented `M1_ALL_GATES_SATISFIED` and permanently forbade the two contract-authorised passing statuses | the §26 truth table, with `M1_ACCEPTED` and `M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING` reachable exactly when the evidence supports them | `test/status-truth-table.test.js` |
| 3 | provenance bound 20 selected files; a changed `src/core/math.js` and a rewritten TAP line both verified OK | every shipped file except `audit/provenance.json` is hashed and verified, the TAP by its exact bytes, plus one whole-tree digest; the record itself is bound by the published ZIP SHA-256 | `test/provenance-binding.test.js` |
| 4 | an `Error` with a hostile `message` getter escaped after biology committed | every property is read through an individually guarded snapshot helper, including the `instanceof` classification | `test/generation-result-immutable.test.js` |
| 5 | a random reset left `fixtureVariant`, the witness registry and a stale notice describing the previous fixture world | reset republishes every world-identity field, enumerated rather than hand-picked | `test/world-reset-completeness.test.js` |
| 6 | the report gated the device test on revision 4 and the manifest on revision 5 | every current-revision reference is generated from one value | `test/status-consistency.test.js` |

### Revision 6

A bounded closure pass against one consolidated defect set: the revision-5 AFE-Δ
break-report (5 breaks) and the revision-5 structural audit (9 findings). Both were
reproduced against the exact audited artifact
(`4ffc3110bba3a6aa2d4f04f23dfa709e8959f84a06471754a4f577f78b2a655e`) before any
production code was changed; the observed pre-repair output for each is recorded in
`REVISION_6_REPAIR_RECORD.md`.

| # | Finding | Repair | Regression |
|---|---|---|---|
| MC-1 | the contract-frozen biological schema was changed to `-2`, and its test oracle with it | restored `lineage-biological-state-1`; every identity rejection is unconditional and proven under it | `test/frozen-schema-identity.test.js` |
| MC-2 / Break 1 | a superseded fixture request wrote the shared envelope before the commit gate | the envelope stays request-local; the whole world transaction publishes in one block | `test/fixture-transaction-atomicity.test.js` |
| Break 1 (2nd half) | a maintained witness was selected by channel NAME, so a poisoned cache showed one lineage under another's name | channels carry an exact founder-set fingerprint, and a mismatch is refused | `test/fixture-transaction-atomicity.test.js` |
| Break 2 / MC-3a | the visible Clear Tracers control deleted the maintained ancestry witnesses | witnesses are protected: not cleared, not offered as selectable tracers | `test/maintained-witness-protection.test.js` |
| MC-3b | following a focal lineage rebuilt the channel, resetting every contribution to 1 | the visible channel MIRRORS the witness, preserving the propagated fractions | `test/maintained-witness-protection.test.js` |
| Break 3 | numeric contribution underflows to zero at generation 1075, producing a false conclusion | exact membership (`A \|\| B`) is maintained beside the numeric value | `test/exact-membership-underflow.test.js` |
| M-1 | `FOCAL_LINEAGE_EXTINCT` — the "group ended" logic §16 excludes from Milestone 1 | removed; the permitted unresolved state reports the observation without a verdict | `test/milestone-scope-observer.test.js` |
| Break 4 / MM-1 | the "deeply immutable" result exposed the original thrown object and its nested payload | failures are captured as immutable plain snapshots of approved primitive fields | `test/generation-result-immutable.test.js` |
| Break 5 / M-3 | the runtime-matrix generator succeeded on coverage its own build-blocking test rejected | one invariant in `runtime-matrix.config.json`, read by generator and test alike | `test/runtime-matrix-coverage.test.js` |
| M-2 | external gates and the milestone status were source literals, not evidence | both are read/derived; a controlled failing run moves the report end to end | `test/report-end-to-end-injection.test.js` |
| MM-2 | the report's gate totals overlapped (39 of 38) and its revision wording was stale | categories partition the gate set; the wording is generated from the current revision | `test/report-end-to-end-injection.test.js`, `test/report-integrity.test.js` |
| L-1 | the bundle did not identify its source commit | `audit/provenance.json` binds commit, model identity and every evidence hash | `test/provenance-binding.test.js` |

### Revision 5

Revision 4 was audited twice — the AFE-Δ evidence and claim audit and the Solon
Code Auditor structural integrity audit — and both returned `BREAKS-FOUND` with nine
verified defects (3 MEDIUM-CRITICAL, 5 MEDIUM, 1 MEDIUM-MINOR; 0 CRITICAL, 0 HIGH).
All nine are repaired, each independently reproduced first, and each with a
**committed** regression test. Full detail: `REVISION_5_REPAIR_RECORD.md`.

| # | Defect | Severity | Repair | Committed regression test |
|---|---|---|---|---|
| 1 | focal lineage reported extinct after the 360-generation window removed the reconstruction path | MEDIUM-CRITICAL | D-044 | `focal-lineage-retention.test.js` |
| 2 | concurrent fixture loads left legibility mode on a non-baseline world | MEDIUM-CRITICAL | D-045 | `world-load-race.test.js` |
| 3 | one evidence file published a different model hash under the same field name | MEDIUM-CRITICAL | D-047 | `model-hash-provenance.test.js` |
| 4 | removing the identity field reopened same-version cross-model advancement | MEDIUM | D-046 | `model-hash-provenance.test.js` |
| 5 | Node process heap published as the desktop Canvas memory measure | MEDIUM | D-048 | `desktop-measurement-reproducibility.test.js` |
| 6 | report bytes depended on the verifier's Node patch version | MEDIUM | D-049 | `report-determinism.test.js` |
| 7 | a failing suite still produced hardcoded feature passes and "reproducible: met" | MEDIUM | D-050 | `report-integrity.test.js` |
| 8 | a test mutated shared production source under concurrent execution | MEDIUM | D-051 | `test-tree-integrity.test.js` |
| 9 | the advertised immutable generation result was shallowly mutable | MEDIUM-MINOR | D-052 | `generation-result-immutable.test.js` |

Every evidence file was **regenerated**, not copied forward.

New in this revision: `src/config/modelIdentity.js`,
`src/config/modelIdentityNode.js`, `tools/gateRegistry.mjs`,
`tools/writeBuildEnvironment.mjs`, `tools/runRuntimeMatrix.mjs`,
`tools/proveTreeIntegrity.mjs`, `audit/build-environment.json`,
`audit/runtime-matrix.json`, `audit/gate-summary.json`, `audit/tree-integrity.json`,
six regression test files, and `REVISION_5_REPAIR_RECORD.md`.

Two structural changes worth an auditor's attention:

- **Every gate row in `FINAL_REPORT.md` is derived**, not written. Each gate declares
  the named tests that evidence it (`tools/gateRegistry.mjs`); a gate whose test did
  not run reads `UNVERIFIED`, and gates that are not test-evidenced at all — the
  physical iPad gate, the Stage A order, the unverified Canvas memory measure — are
  declared external and can never read `PASS`. `audit/gate-summary.json` is the
  machine-readable form.
- **Declared Node support is unchanged at `>=18`.** The determinism defect was fixed
  by removing the verifier's runtime from the report bytes, not by pinning a runtime
  to preserve an embedded version line.

### Revision 4

Revision 3 was audited twice — the AFE-Δ evidence and claim audit and an
independent structural code audit — and both returned `BREAKS-FOUND` with eight
verified defects. All eight are repaired, each independently reproduced first.
Full reproduction commands and outputs: `REVISION_4_REPAIR_RECORD.md`.

| # | Defect | Severity | Repair | Regression test |
|---|---|---|---|---|
| 1 | observer exception inside the biological transaction left a torn world | HIGH | D-035 | `observer-transaction-integrity.test.js` |
| 2 | focal lineage reseeded from the first N living instead of resolved from genealogy | MEDIUM-CRITICAL | D-036 | `focal-lineage-integrity.test.js` |
| 3 | canonical state bound to the version label, not the complete model identity | MEDIUM | D-037 | `model-identity.test.js` |
| 4 | legibility mode trusted a flag rather than the world | MEDIUM-CRITICAL | D-038 | `probe-world-identity.test.js` |
| 5 | traversal plan, labels and raw keys disagreed | MEDIUM | D-039 | `traversal-label-integrity.test.js` |
| 6 | `FINAL_REPORT.md` contradicted its own evidence (duplicate identity block, stale suite count, unverified memory figure) | MEDIUM-CRITICAL | D-040 | `report-integrity.test.js` |
| 7 | desktop measurement unreproducible; browser memory published from an unprobed channel | MEDIUM-CRITICAL | D-041, D-042 | `desktop-measurement-reproducibility.test.js` |
| 8 | Canvas jitter pruned by count instead of set membership | MEDIUM | D-043 | `canvas-jitter-membership.test.js` |

Every evidence file was **regenerated**, not copied forward. The biology did not
move: see the non-regression table in `REVISION_4_REPAIR_RECORD.md`. Four
revision-3 claims are explicitly withdrawn there and in `DECISIONS.md`.

New in this revision: `src/config/milestoneStatus.js`, `tools/measureDesktop.mjs`,
`tools/writeFinalReport.mjs`, `tools/writeManifestPaths.mjs`, `tools/runTests.mjs`,
`audit/meaningful-trait-gate.json`, `package-lock.json`, seven regression test files
(`observer-transaction-integrity`, `focal-lineage-integrity`, `canvas-jitter-membership`,
`desktop-measurement-reproducibility`, `traversal-label-integrity`, `report-integrity`,
`manifest-inventory`), `REVISION_4_REPAIR_RECORD.md`, and Amendment 1 to
`CHARACTERIZATION_PLAN.md`.

Eight further defects were found by my own verification and are **not** in either
audit report — including an evidence-capture path that made the report-integrity
check unpassable, and a self-audit table that asserted scans it never executed.
They are R4-9a through R4-9h in `REVISION_4_REPAIR_RECORD.md`. They are disclosed
here rather than folded silently into the eight ordered repairs.

`FINAL_REPORT.md` and the manifest path inventory are now **generated** from the
raw evidence (`npm run report:final`, `npm run manifest:paths`) and guarded by
`report-integrity.test.js` and `manifest-inventory.test.js`. No suite count is
stated in prose anywhere; `audit/test-results.txt` is the only authority.

### Revision 3

Revision 2 was audited twice — the AFE-Δ break-report (pass 2) and an independent
structural integrity audit — and both returned `BREAKS-FOUND` with ten verified
defects. All ten are repaired, each independently reproduced first:

| # | Defect | Severity | Repair | Regression test |
|---|---|---|---|---|
| 1 | device-test server path traversal | CRITICAL | D-025 | `server-containment.test.js` |
| 2 | config hash excluded EFFECT/UPKEEP/adjacency | HIGH | D-026 | `model-identity.test.js` |
| 3 | state advanced under a mismatched config label | HIGH | D-027 | `model-identity.test.js` |
| 4 | observer/Canvas memory grew with cumulative births | HIGH | D-028 | `observer-memory-bounds.test.js` |
| 5 | adjacency statistic ran the mixed world, not an edge-only world | MEDIUM-CRITICAL | D-029 | `edge-only-traversal.test.js` |
| 6 | cached fixture metadata used as world identity | MEDIUM-CRITICAL | D-030 | `probe-world-identity.test.js` |
| 7 | exact 200-seed gate outside the build-blocking suite | MEDIUM-CRITICAL | D-031 | `defining-fixture.test.js` |
| 8 | four hydrations instead of one-hydration cloning | MEDIUM | D-032 | `defining-fixture.test.js` |
| 9 | contradictory official status artifacts | MEDIUM | D-033 | `status-consistency.test.js` |
| 10 | limitation table used the lower middle value | MEDIUM-MINOR | D-034 | `median-consistency.test.js` |

Six new test files were added in that revision. Every evidence file was
**regenerated**, not copied forward. (Revision 3's manifest stated a suite count
in prose; revision 4 removes every such prose count in favour of the raw TAP
summary, because a hand-maintained count is exactly what went stale in
`FINAL_REPORT.md`.)

Two revision-2 claims are explicitly withdrawn in `FINAL_REPORT.md` §1b and
`DECISIONS.md`: that the adjacency measure was "implemented literally", and that
the automated gates passed with the Stage A waiver as the only blocker.

New in this revision: `src/config/modelDefinition.js`,
`src/fixtures/edgeOnlyWorlds.js`, `tools/runEdgeOnlyTraversal.mjs`, and
`audit/edge-only-traversal-results.json`.

### Earlier revisions

**Revision 1** reported `M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING`. An
external implementation audit against v3.3 returned `BREAKS-FOUND` with six
confirmed implementation/evidence defects and one process finding.

**Revision 2** repaired all six. Each was independently reproduced
here before repair; the reproductions matched the auditor's figures. Full detail
is in `DECISIONS.md` D-018 through D-024 and in `FINAL_REPORT.md` §1b:

1. genealogy boundary records grew without bound (§15) — CRITICAL;
2. adjacency traversal measured the wrong biological event (§21.6);
3. unmatched eligible adults were counted before survival (§21.6);
4. per-zone carrier survival was absent (§21.3);
5. legacy-config states carried the wrong canonical config version (§18/§21.7);
6. legibility mode omitted the fixture and zone regions (§22);
7. pre-code planning order (§24) — **not repairable**, principal decision required.

Three regression tests were added (116 → 119). The repairs changed measurement
and retention code, not biological trajectories: the re-run guardrails and
fixture results are numerically identical to revision 1, which is the expected
and intended outcome.

Superseded material is retained rather than deleted, per §27:
`tools/calibrationSweep.mjs` and `audit/characterization-results-config1.json`.

## 9. Authority note

This bundle is submitted for an implementation audit against
`LINEAGE_M1_WORLD_MODEL_CONTRACT_v3_3.md`. No superseded architecture brief,
earlier implementation brief, prior audit, or competing authority is included,
and none was requested, read, searched for, or inferred from during this
implementation.
