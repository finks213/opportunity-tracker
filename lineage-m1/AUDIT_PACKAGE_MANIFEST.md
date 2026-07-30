# LINEAGE Milestone 1 — Audit Package Manifest

Bundle: `LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV3.zip`
Contents: the complete `lineage-m1/` project directory required by contract §23.

---

## 1. Environment and versions

| Field | Value |
|---|---|
| Node version | v22.22.2 |
| npm version | 10.9.7 |
| Operating system (final run) | Linux 6.18.5 x86_64 |
| Runtime dependencies | none (`dependencies` is empty) |
| Final config version | `lineage-m1-config-2` |
| Final **complete model-definition** hash (config-2) | `dc444865163deb32a7a9d80bd23f576d1ab5a936896298b5cd13faac6f513b3d` |
| Tuning-config-only hash (subset, config-2) | `edb81695973b81ab8f87f7ef9dde9d8c5b3d4c7dfbeb45f385547edd86ee86de` |
| Complete model-definition hash (config-1) | `4724f9b98be6457b...` (full value in the audit JSON) |
| Superseded config retained | `lineage-m1-config-1` as `legacyModelConfigV1` |
| **Final reported status** | **`M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED`** |
| Bundle revision | **3** — after the pass-2 AFE-Δ break-report and an independent structural audit both returned `BREAKS-FOUND` |
| Automated implementation gates | **NOT CLAIMED** — repaired and re-run, but no pass is self-certified until revision 3 survives independent re-audit |
| Physical iPad gate | `PENDING_HUMAN_DEVICE_TEST` |
| §24 Stage A planning order | VIOLATED — unrepairable, principal decision required (DECISIONS.md D-024). **Not** the only blocker. |

---

## 2. Exact clean-run commands

```bash
# from the bundle root, after extracting; no install step is required
cd lineage-m1

# 1. every build-blocking invariant and contract test  (expect 172/172, exit 0)
#    This INCLUDES the exact 200-seed §19.4 fixture gate, so it is slow (~10 min).
npm test                              # node --test --test-timeout=3600000 test/*.test.js

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
| `audit/test-results.txt` | unedited stdout/stderr from the final clean test run (119/119, exit 0), including the emitted three-zone trait deltas, the §19.3 probe values, and the post-repair boundary-record counts |
| `audit/fixture-results.json` | seed-level paired fixture results for seeds 1..200: medians, successes, ties, focal-contribution and whole-world extinction counts, total-population distributions, full paired difference distributions, and the configuration hash |
| `audit/characterization-results.json` | raw 500-seed metrics under `lineage-m1-config-2`, sufficient to reproduce every table in `CHARACTERIZATION.md`, including every seed-level concentration value |
| `audit/characterization-results-config1.json` | the same batch under the superseded `lineage-m1-config-1`, for the §21.7 side-by-side |
| `audit/observer-invariance-hashes.json` | generation-by-generation canonical biological SHA-256 hashes for all five required observer strategies in the defining fixture (5 × 31, zero mismatches) |
| `audit/reference-file-hashes.json` | hashes proving the historical Python references remain unchanged |
| `STRUCTURAL_AUDIT_REPAIR_RECORD.md` | one row per verified defect: reproduction command, observed revision-2 result, repair, revision-3 result, and regression test |
| `audit/edge-only-traversal-results.json` | the DECLARED edge-only adjacency-traversal experiment: isolated 40-founder worlds, seeds 1..500 each direction, with the fully frozen initializer recorded under `frozenInitializer` |
| `audit/desktop-measurements.json` | desktop Canvas frame-time, input-latency, and memory-growth measurements (headless Chromium; **not** the iPad gate) |

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

- `AUDIT_PACKAGE_MANIFEST.md`
- `CHARACTERIZATION.md`
- `CHARACTERIZATION_PLAN.md`
- `DECISIONS.md`
- `FINAL_REPORT.md`
- `IPAD_TEST_CHECKLIST.md`
- `PLAN.md`
- `README.md`
- `STRUCTURAL_AUDIT_REPAIR_RECORD.md`
- `audit/characterization-results-config1.json`
- `audit/characterization-results.json`
- `audit/desktop-measurements.json`
- `audit/edge-only-traversal-results.json`
- `audit/fixture-results.json`
- `audit/observer-invariance-hashes.json`
- `audit/reference-file-hashes.json`
- `audit/test-results.txt`
- `fixtures/defining_fixture_v1.json`
- `index.html`
- `package.json`
- `reference/analyze.py`
- `reference/biology.py`
- `reference/engine.py`
- `src/config/modelConfig.js`
- `src/config/modelDefinition.js`
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
- `test/allocation-mutation-contract.test.js`
- `test/birth-immutability.test.js`
- `test/defining-fixture-snapshot.test.js`
- `test/defining-fixture.test.js`
- `test/dependency-boundary.test.js`
- `test/edge-only-traversal.test.js`
- `test/full-path-mutation-independence.test.js`
- `test/genealogy-integrity.test.js`
- `test/genealogy-retention-boundary.test.js`
- `test/helpers/scriptedRng.js`
- `test/lifecycle-contract.test.js`
- `test/mating-integrity.test.js`
- `test/meaningful-trait-context.test.js`
- `test/median-consistency.test.js`
- `test/model-identity.test.js`
- `test/mutation-provenance.test.js`
- `test/neutral-traits.test.js`
- `test/observer-invariance.test.js`
- `test/observer-memory-bounds.test.js`
- `test/probe-world-identity.test.js`
- `test/rng-integrity.test.js`
- `test/server-containment.test.js`
- `test/spatial-integrity.test.js`
- `test/status-consistency.test.js`
- `test/survival-composition.test.js`
- `tools/calibrationSweep.mjs`
- `tools/runCharacterization.mjs`
- `tools/runEdgeOnlyTraversal.mjs`
- `tools/runFixture.mjs`
- `tools/serve.mjs`
- `tools/writeAuditEvidence.mjs`
- `tools/writeCharacterization.mjs`

---

## 8. Revision history

### Revision 3 (this bundle)

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

Tests 119 → **172** across six new files. All 60 `.js`/`.mjs` files pass
`node --check`. Every evidence file was **regenerated**, not copied forward.

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
