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

Node.js 18 or newer. **Zero runtime dependencies** — no install step is needed.

## Commands

```bash
# every build-blocking invariant and contract test
npm test                 # === node --test test/

# the defining fixture matched trajectory gate (seeds 1..200, 90 generations)
npm run fixture          # writes audit/fixture-results.json

# the predeclared 500-seed characterization batch (180 generations)
npm run characterize     # writes audit/characterization-results.json

# render CHARACTERIZATION.md from the raw audit JSON only
npm run report

# serve the Canvas probe at http://localhost:8080/
npm run serve
```

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
test/           seventeen build-blocking contract test files
tools/          fixture, characterization, report, and static-server scripts
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
| `FINAL_REPORT.md` | gate-by-gate results and status |
| `AUDIT_PACKAGE_MANIFEST.md` | bundle contents, commands, hashes |

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

Revision 3. Revision 2 was audited twice and both audits returned
`BREAKS-FOUND` with ten verified defects, including a CRITICAL path-traversal
defect in `tools/serve.mjs`. All ten are repaired here, each independently
reproduced first, but **no automated-gate pass is self-certified**: the status
holds until revision 3 survives independent re-audit.

Separately pending: `PROCESS WAIVER: PENDING PRINCIPAL DECISION` and
`IPAD TEST: PENDING_HUMAN_DEVICE_TEST`. See `FINAL_REPORT.md` §1b and
`DECISIONS.md` D-025 through D-034.
