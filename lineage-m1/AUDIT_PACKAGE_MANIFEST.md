# LINEAGE Milestone 1 — Audit Package Manifest

Bundle: `LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE.zip`
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
| Final config hash (SHA-256 of canonical config) | `edb81695973b81ab8f87f7ef9dde9d8c5b3d4c7dfbeb45f385547edd86ee86de` |
| Superseded config retained | `lineage-m1-config-1` as `legacyModelConfigV1` |
| **Final reported status** | **`M1_BLOCKED — AWAITING PRINCIPAL DECISION ON THE PROCESS WAIVER`** |
| Bundle revision | **2** — post-repair, after the pass-1 implementation audit returned `BREAKS-FOUND` |
| Automated implementation gates | PASS (119/119 tests, fixture and both 500-seed batches re-run from clean) |
| Physical iPad gate | `PENDING_HUMAN_DEVICE_TEST` |
| §24 Stage A planning order | VIOLATED — unrepairable, principal decision required (DECISIONS.md D-024) |

---

## 2. Exact clean-run commands

```bash
# from the bundle root, after extracting; no install step is required
cd lineage-m1

# 1. every build-blocking invariant and contract test  (expect 119/119, exit 0)
node --test test/*.test.js            # or: npm test   (expect 119/119)

# 2. the defining fixture matched trajectory gate, seeds 1..200 at generation 90
node tools/runFixture.mjs             # writes audit/fixture-results.json   (~180 s)

# 3. the predeclared 500-seed characterization batch, 180 generations
node tools/runCharacterization.mjs                                  # ~7 min
node tools/runCharacterization.mjs --config v1 \
     --out audit/characterization-results-config1.json              # §21.7 side-by-side, ~12 min

# 4. observer-invariance hashes and reference-file hashes
node tools/writeAuditEvidence.mjs

# 5. render CHARACTERIZATION.md from the raw audit JSON only
node tools/writeCharacterization.mjs

# 6. the Canvas probe (desktop measurement and the manual iPad modes)
node tools/serve.mjs 8080             # then open http://localhost:8080/

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
- `audit/characterization-results-config1.json`
- `audit/characterization-results.json`
- `audit/desktop-measurements.json`
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
- `test/full-path-mutation-independence.test.js`
- `test/genealogy-integrity.test.js`
- `test/genealogy-retention-boundary.test.js`
- `test/helpers/scriptedRng.js`
- `test/lifecycle-contract.test.js`
- `test/mating-integrity.test.js`
- `test/meaningful-trait-context.test.js`
- `test/mutation-provenance.test.js`
- `test/neutral-traits.test.js`
- `test/observer-invariance.test.js`
- `test/rng-integrity.test.js`
- `test/spatial-integrity.test.js`
- `test/survival-composition.test.js`
- `tools/calibrationSweep.mjs`
- `tools/runCharacterization.mjs`
- `tools/runFixture.mjs`
- `tools/serve.mjs`
- `tools/writeAuditEvidence.mjs`
- `tools/writeCharacterization.mjs`

---

## 8. Revision history

**Revision 1** reported `M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING`. An
external implementation audit against v3.3 returned `BREAKS-FOUND` with six
confirmed implementation/evidence defects and one process finding.

**Revision 2** (this bundle) repairs all six. Each was independently reproduced
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
