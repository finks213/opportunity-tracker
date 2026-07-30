# LINEAGE — Milestone 1: truthful world model

This repository implements **Milestone 1 only** of LINEAGE, against
`LINEAGE_M1_WORLD_MODEL_CONTRACT_v3_3.md`.

> **Milestone 1 is not the playable student game.** It has no watch/flag/decide
> loop, no surfaced variation cards, no prediction or journal screens, no
> collection, no explanations, no teacher view, and no framework UI. It exists to
> prove the biological and observer architecture that cannot be retrofitted
> later.

> **The model is authored, not biologically validated.** Every trait effect, zone
> weight, capacity, and selection constant is a model control chosen to satisfy
> authored product gates. No number here is an ecological claim or a statement
> about any real species.

---

## The defining experiment

> The same inherited toe-webbing variation exists in a canopy-heavy group and a
> shoreline-heavy group. The canopy carriers and shoreline carriers experience
> different consequences because of where they already spend their time. The
> observer may follow either group, but the observer action cannot change the
> biological world.

Two truths coexist and are both enforced by build-blocking tests:

1. same seed + same starting biological state + different observer actions =
   **byte-identical** biological state after every generation;
2. different existing groups can have different fates because they occupy
   different zones and carry different traits.

---

## Requirements

Node.js 18 or newer. **Zero runtime dependencies** — the simulation, the tests and
every evidence generator except the desktop measurement need no install step. One
**dev** dependency, `playwright`, is used only by `npm run audit:desktop`.

## Commands

```bash
# every build-blocking invariant and contract test
npm test                 # === node --test --test-timeout=3600000 test/*.test.js

# the same suite, captured atomically as audit evidence
npm run audit:tests      # publishes audit/test-results.txt only after the run completes

# the defining fixture matched trajectory gate (seeds 1..200, 90 generations)
npm run fixture          # writes audit/fixture-results.json

# the predeclared 500-seed characterization batch (180 generations)
npm run characterize     # writes audit/characterization-results.json

# the AUTHORITATIVE §21.6 traversal experiment, isolated 40-founder worlds
npm run edge-only        # writes audit/edge-only-traversal-results.json

# observer-invariance hashes, reference hashes, and the exact §9 trait-gate deltas
npm run audit-evidence

# reproducible desktop Canvas measurement (requires the playwright devDependency)
npm install && npx playwright install chromium
npm run audit:desktop    # writes audit/desktop-measurements.json

# render CHARACTERIZATION.md from the raw audit JSON only
npm run report

# generate FINAL_REPORT.md from the raw evidence; never edit it by hand
npm run report:final

# regenerate the manifest's file inventory from the bundle itself
npm run manifest:paths

# serve the Canvas probe at http://localhost:8080/
npm run serve
```

`FINAL_REPORT.md` and the manifest's path inventory are **generated**. Editing either
by hand fails `test/report-integrity.test.js` or `test/manifest-inventory.test.js`.
Because the report states the suite counts and the suite checks the report, the
committed pair converges over one `report:final` → `audit:tests` cycle;
`tools/runTests.mjs` prints the next step.

Useful flags:

```bash
node tools/runFixture.mjs --seeds 20                    # bounded fixture slice
node tools/runCharacterization.mjs --config v1          # superseded config, for the §21.7 side-by-side
```

---

## Layout

```
src/config/     traits, zones, and the versioned model configuration
src/core/       the deterministic biological kernel (no observer imports, ever)
src/fixtures/   loader/validator for the frozen defining fixture
src/observer/   tracer channels, debug zone bins, mating annotations
src/debug/      the crude Canvas probe — reads biology, never writes to it
test/           build-blocking contract and regression test files
tools/          fixture, characterization, measurement, report, and static-server scripts
audit/          raw machine-readable evidence for the implementation audit
reference/      quarantined historical Python; defective, never imported
```

The dependency boundary is enforced by `test/dependency-boundary.test.js`:

```
config  →  (nothing)
core    →  config, core
fixtures→  config, core
observer→  config, core        (reads biology; never writes, never sees simRng)
debug   →  everything          (leaf; nothing imports it)
```

## Documents

| File | Purpose |
|---|---|
| `PLAN.md` | contract section → module → test map |
| `DECISIONS.md` | every constant, tuning change, deviation, and open uncertainty |
| `CHARACTERIZATION_PLAN.md` | predeclared batch, frozen before the batch ran |
| `CHARACTERIZATION.md` | generated from the raw audit JSON |
| `IPAD_TEST_CHECKLIST.md` | the human device gate — currently `PENDING_HUMAN_DEVICE_TEST` |
| `FINAL_REPORT.md` | **generated** — gate-by-gate results and status, rendered from `audit/` |
| `AUDIT_PACKAGE_MANIFEST.md` | bundle contents, commands, hashes; its path inventory is generated |
| `STRUCTURAL_AUDIT_REPAIR_RECORD.md` | the revision-3 repairs, per defect |
| `REVISION_4_REPAIR_RECORD.md` | the revision-4 repairs, per defect, plus six defects found by my own verification |

## The `reference/` directory

`biology.py`, `engine.py`, and `analyze.py` are **quarantined historical
references**, copied byte-for-byte and never imported by any source file. They
carry known defects the contract explicitly forbids porting: observer state
affecting mate selection, observer selection consuming simulation RNG, silent
lineage reseeding, mutations applied to already-living organisms, one global
environment instead of simultaneous zones, and a midpoint-derivative
approximation for survival effects. **No percentage measured from that kernel is
an acceptance target here.**

## Status

```
M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED
```

Revision 5. Revision 4 was audited twice — the AFE-Δ evidence and claim audit
and an independent structural code audit — and both returned `BREAKS-FOUND` with
nine verified defects. All nine are repaired here, each independently
reproduced first, but **no automated-gate pass is self-certified**: the status
holds until revision 5 survives independent re-audit.

The revision-3 biological, fixture, security, traversal and long-run memory
repairs are preserved unchanged; revision 4 adds transaction atomicity against
observer failure, genealogy-resolved focal lineages, complete model-identity
binding, self-contained legibility mode, membership-based Canvas pruning, a
reproducible desktop measurement, reconciled traversal labels, and a
`FINAL_REPORT.md` that is generated from the raw evidence instead of typed.

Eight further defects were found by my own verification and appear in neither audit
report — they are R4-9a through R4-9h in `REVISION_4_REPAIR_RECORD.md`. Three
consecutive audits found real defects and so did I after the third; that is why no
gate pass is claimed here.

Separately pending, and **not** the only blockers:
`PROCESS WAIVER: PENDING PRINCIPAL DECISION` and
`IPAD TEST: PENDING_HUMAN_DEVICE_TEST`. See `FINAL_REPORT.md`,
`REVISION_4_REPAIR_RECORD.md`, `STRUCTURAL_AUDIT_REPAIR_RECORD.md`, and
`DECISIONS.md` D-025 through D-043.
