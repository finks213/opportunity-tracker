# LINEAGE Milestone 1 — Final Implementation Report

## Status

```
M1_BLOCKED — AWAITING PRINCIPAL DECISION ON THE PROCESS WAIVER
```

**This report is revision 2, issued after an external implementation audit
(AFE-Δ break-report, pass 1) returned `BREAKS-FOUND` against revision 1.**

Component status:

| Component | Status |
|---|---|
| automated implementation gates | **PASS** — post-repair, re-run from clean |
| the six confirmed implementation/evidence defects | **REPAIRED** — each independently reproduced here first |
| physical iPad gate | `PENDING_HUMAN_DEVICE_TEST` — not self-certified |
| §24 Stage A pre-code planning order | **VIOLATED** — unrepairable; principal decision required |

The overall status is held at `M1_BLOCKED` for one reason: the process-order
violation (D-000, D-024) cannot be repaired retrospectively and cannot be waived
by the implementer. It requires one explicit recorded principal decision —
`PROCESS WAIVER ACCEPTED` or `BUILD REJECTED FOR PROCESS NONCOMPLIANCE`. Until
that exists, this repository does **not** claim full compliance with the
complete v3.3 build procedure.

Revision 1 reported `M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING`. That verdict
did not survive audit and has been withdrawn. `M1_ACCEPTED` is not claimed and
would additionally require the physical iPad gate to pass.

Two statements the contract requires verbatim:

> **The model is authored and is not biologically validated.** Every trait
> effect, zone weight, capacity, and selection constant is a model control
> chosen to satisfy authored product gates. No number in this report is an
> ecological claim or a statement about any real species.

> **Milestone 1 is not the playable student game.** There is no watch/flag/decide
> loop, no surfaced variation cards, no inspection UI, no prediction or journal
> screens, no collection, no explanations, no teacher view, and no UI framework.

- Configuration: `lineage-m1-config-2`
- Config hash: `edb81695973b81ab8f87f7ef9dde9d8c5b3d4c7dfbeb45f385547edd86ee86de`
- Node: v22.22.2 · Linux 6.18.5 x86_64
- Fixture SHA-256: `c80aaa523d3b3eec2655502b4eaebdbbb4d12f71f8b3378d9d3be60797342b78` ✔ matches the frozen value

---

## 1. Gate-by-gate results

Nothing below is hidden behind a summary. Failures, pending items, and named
uncertainties appear in the same table as the passes.

| # | Gate | Contract § | Result |
|---|---|---|---|
| 1 | Full test suite (119 tests) | §20 | **PASS** — 119/119, exit 0 (3 new regression tests added by the repairs) |
| 2 | Fixture raw SHA-256 integrity | §19 A | **PASS** |
| 3 | Fixture-envelope canonical round trip | §19 B | **PASS** |
| 4 | Deterministic hydration | §19 C | **PASS** |
| 5 | Paired-world construction | §19 D | **PASS** — exactly 12 toe_webbing values differ |
| 6 | Exact probability gate | §19.3 | **PASS** |
| 7 | Matched trajectory gate, seeds 1..200 | §19.4 | **PASS** |
| 8 | Meaningful-trait contextual gate | §9 / §20.5 | **PASS** — all seven traits |
| 9 | Birth immutability | §20.1 | **PASS** |
| 10 | Observer-state invariance | §20.2 | **PASS** — byte-identical |
| 11 | No observer dependencies in biology | §20.3 | **PASS** — static import scan |
| 12 | Neutral-trait integrity | §20.4 | **PASS** — exactly zero |
| 13 | Full-path body-mutation independence | §20.6 | **PASS** |
| 14 | Mutation provenance and counter ownership | §20.7 | **PASS** |
| 15 | Allocation-mutation opportunity contract | §20.8 | **PASS** — draw counts asserted directly |
| 16 | Spatial integrity and adjacency | §20.9 | **PASS** — zero fallbacks |
| 17 | Lifecycle and mating contract | §20.10 | **PASS** |
| 18 | Genealogy integrity + forced 360-boundary | §20.11 | **PASS** — crossed at generation 400 |
| 18b | Genealogy boundary records bounded | §15 | **PASS** — post-repair; stored set equals required set at generations 400/460/520/600 |
| 19 | Exact survival composition | §20.12 | **PASS** — to 1e-12 |
| 20 | RNG integrity | §20.13 | **PASS** |
| 21 | Population guardrails, 500 seeds | §21.4 | **PASS** — all four |
| 22 | Mutation-supply minimal functionality | §21.3 | **PASS** |
| 23 | Desktop Canvas measurement | §22 | **PASS** (headless Chromium) |
| 24 | Canonical config provenance | §18 / §21.7 | **PASS** — post-repair |
| 25 | Legibility mode contains fixture + zones + pairs | §22 | **PASS** — post-repair |
| 26 | **Physical iPad acceptance** | §22 | **PENDING_HUMAN_DEVICE_TEST** |
| 27 | **§24 Stage A pre-code planning order** | §24 | **VIOLATED — principal decision required** |

**Named uncertainty (not a gate failure):** shoreline *dominant-bin* occupancy is
zero in 438 of 500 seeds at generation 180, even though shoreline *load* passes
its guardrail comfortably. Detailed in §6 below and in `CHARACTERIZATION.md`.

---

## 1b. Response to the pass-1 implementation audit

The audit returned six confirmed implementation/evidence defects and one process
finding. **Every confirmed defect was independently reproduced here before being
repaired.** The reproductions matched the auditor's figures, which is itself
evidence the findings were real rather than accepted on trust.

| # | Audit finding | § | Independently reproduced | Repair | Status |
|---|---|---|---|---|---|
| 1 | Genealogy boundary records grow without bound | §15 | yes — 2,386 stored vs 108 required at gen 400 (auditor: 2,386) | D-018 | **REPAIRED** |
| 2 | Adjacency traversal measures the wrong event | §21.6 | yes — forest-floor descendants counted as traversal at gen 1 | D-019 | **REPAIRED** |
| 3 | Unmatched eligible adults counted before survival | §21.6 | yes — 120.378 reported vs 0.509 actual (auditor: 0.509) | D-020 | **REPAIRED** |
| 4 | Per-zone carrier survival absent | §21.3 | yes — `perBin` held only items 1–5 | D-021 | **REPAIRED** |
| 5 | Legacy-config states carry the wrong config version | §18 / §21.7 | yes — config-1 world serialized as `lineage-m1-config-2` | D-022 | **REPAIRED** |
| 6 | Legibility mode omits the fixture and zones | §22 | yes — `renderLegibility()` drew only the pairs | D-023 | **REPAIRED** |
| 7 | Pre-code planning order violated | §24 | already self-disclosed in D-000 | — | **UNREPAIRABLE — principal decision required** |

### Repair evidence

**Genealogy boundedness.** Stored boundary records, seed 71:

| Generation | Before repair | After repair | Exactly required |
|---|---|---|---|
| 400 | 2,386 | **108** | 108 |
| 460 | 5,796 | **118** | 118 |
| 520 | 9,770 | **117** | 117 |
| 600 | 15,356 | **137** | 137 |

**Unmatched eligible adults.** 120.378 → **0.516** per generation over the
re-run 500-seed batch, matching the auditor's independently computed 0.509 on
their ten-seed diagnostic.

**Adjacency traversal**, now measured by explicit founder-band ancestry:

| Traversal | Seeds reaching it | Earliest | Median first generation |
|---|---|---|---|
| canopy-**only** lineage → shoreline | 495 of 500 | 2 | 3 |
| shoreline-**only** lineage → canopy | 499 of 500 | 2 | 3 |

**Per-zone carrier survival**, now reported per birth dominant-zone bin. This
repair *sharpens* rather than softens the central result — it exposes exactly
the mutation-supply-versus-carrier-survival comparison §21.3 exists to protect:

| Birth zone bin | Births | Positive webbing events | Living at gen 180 | Carriers | Carrier prevalence |
|---|---|---|---|---|---|
| canopy | 6,070,525 | 60,700 | 74,438 | 5,386 | **0.0724** |
| forest_floor | 3,010,385 | 30,077 | 52,708 | 5,275 | **0.1001** |
| shoreline | 1,974,834 | 19,750 | 919 | 490 | **0.5332** |

Mutation supply per birth is essentially identical across zones (~0.0100
positive webbing events per birth in every bin), yet where shoreline-dominant
animals persist they are **53%** webbing carriers against **7%** in the canopy.
Variation is not filtered by usefulness; the consequences differ by context.

**Config provenance.** A config-1 world now serializes with
`configVersion: "lineage-m1-config-1"` and a config-2 world with
`"lineage-m1-config-2"`; the top-level report label and the canonical states
beneath it agree.

**Legibility mode.** One deterministic mode now shows the defining fixture, all
three zone regions with per-zone occupancy counts, and the ten randomized
webbing pairs simultaneously; entering the mode auto-loads the fixture.

### Consistency check

The repairs changed measurement and retention code, not biological trajectories.
As expected, the re-run guardrails are numerically identical to revision 1
(median population 256; zone loads 117.22 / 108.18 / 30.53; concentration
0.4686), and the fixture gate reproduces exactly (canopy 200/200, shoreline
197/200). That the biology did not move is the correct outcome and is itself a
check that the repairs were confined to what they claimed.

### Findings the audit retracted on self-verification

Recorded so they are not mistaken for unaddressed defects: the missing lockfile
(none exists — there are no dependencies); the governing contract not being
inside the bundle (the handoff did not require duplicating it); shoreline
dominant-bin collapse being a v3.3 gate failure (the frozen gate is load-based
and passes); and the capacity change being a silent tune-away (the failing
original, the new value, the rationale, and both full batches are all retained).

---

## 2. Fixture results

### §19.3 exact probability gate

Baseline genome, standard loads `[39.84, 40.32, 39.84]`, age 1.

| Probe | low webbing (0.15) | high webbing (0.75) | Δ | Required | Result |
|---|---|---|---|---|---|
| canopy `[0.90, 0.10, 0.00]` | 0.579632 | 0.195758 | **−0.383874** | `<= −0.03` | **PASS** |
| shoreline `[0.00, 0.10, 0.90]` | 0.579632 | 0.904958 | **+0.325326** | `>= +0.03` | **PASS** |

The same variation has opposite directional consequences in the two contexts.

### §19.4 matched trajectory gate

Seeds `1..200`, 90 completed generations, four worlds per seed.

| Measure | Canopy | Shoreline |
|---|---|---|
| median low-webbing contribution | 29.3652 | 18.2986 |
| median high-webbing contribution | **0.3605** | **43.7529** |
| required direction | high < low | high > low |
| direction holds | **yes** | **yes** |
| successful seeds | **200 / 200** | **197 / 200** |
| required successes | >= 130 | >= 130 |
| exact ties (counted as *not* successful) | 0 | 0 |

Also reported, as §19.4 requires:

- focal-contribution extinction count: **84** (of 800 world-runs)
- whole-world extinction count: **0**
- total-population distributions: `audit/fixture-results.json` → `totalPopulationDistributions`
- full paired difference distributions: same file → `pairedDifferenceDistributions`

Measured medians are **not** frozen as future targets in this session.

---

## 3. Meaningful-trait gate (§9)

Exact three-zone delta vectors, emitted by the build-blocking test:

| Trait | canopy | forest_floor | shoreline | Verdict |
|---|---|---|---|---|
| `toe_webbing` | −0.394064 | −0.077299 | **+0.320181** | positive at shoreline, adverse in canopy |
| `curved_claws` | **+0.454421** | +0.035301 | −0.236447 | positive in canopy, adverse at shoreline |
| `dense_fur` | +0.062551 | **+0.184805** | −0.145120 | positive inland, adverse at shoreline |
| `long_hindlimbs` | +0.192220 | **+0.377034** | −0.220446 | positive inland, adverse at shoreline |
| `strong_tail` | −0.129755 | −0.165676 | **+0.289158** | positive at shoreline, adverse inland |
| `large_eyes` | +0.072942 | **+0.253996** | −0.114328 | positive inland, adverse at shoreline |
| `streamlined_body` | −0.278264 | −0.070471 | **+0.358206** | positive at shoreline, adverse in canopy |

Every meaningful trait has a positive context **and** a different adverse-or-
inactive context. None is beneficial everywhere; none is harmful everywhere. No
floor was weakened after seeing a result.

Neutral traits `coat_shade`, `ear_tip_shape`, `tail_tip_marking` produce a
**maximum absolute exact difference of 0** across performance dimensions, zone
fitness, survival probabilities, mating weights, allocation inheritance, and
mutation probabilities. They are zero by construction in both the effect matrix
and the upkeep vector, so this is an invariant rather than a measurement.

---

## 4. Observer-invariance evidence

`audit/observer-invariance-hashes.json` records the SHA-256 of the canonical
biological serialization after **every** generation, for all five required
observer strategies in the defining fixture:

1. follow nothing;
2. tracer from canopy high-webbing founders;
3. tracer from shoreline high-webbing founders;
4. tracer from high `coat_shade` founders;
5. multiple channels with switching, creation, deletion, zone-bin reads,
   mating annotations, and inspection.

Result: **5 strategies × 31 generations, zero mismatches, byte-identical.**

Additional proofs in the suite:

- observer actions do not advance `simRngState` (state compared before/after);
- canonical bytes contain none of `tracer`, `channels`, `activeChannel`,
  `inspectedIds`, `currentZoneBin`, `annotationModelVersion`, `uiRng`,
  `timestamp`, `diagnostics`;
- biological modules import no observer or debug module (static scan);
- observer modules never reference the simulation RNG at all;
- comparison uses exact bytes, never a float tolerance.

---

## 5. Mutation-provenance evidence

- Body-mutation and allocation-mutation events use **separate typed ID
  namespaces**; IDs are unique and strictly increasing *within* each array;
  numeric overlap between the two is expected and is never reported as a
  collision.
- Recording a body mutation increments only `nextMutationEventId`; recording an
  allocation mutation increments only `nextAllocationMutationEventId`.
- A failed opportunity records no event and increments neither counter (proved
  directly with both probabilities set to zero: counters stayed at 1 while
  opportunities still executed).
- Every mutation event references a child born in the **same** generation, never
  a survivor and never a founder.
- Post-values are reconstructible from `preMutationValue + requestedDelta` with
  clamping, to 1e-15.
- Both counters hydrate from the fixture exactly, and canonical serialization
  changes when either counter changes.
- Across the 500-seed batch,
  `bodyMutationOpportunityCount === allocationMutationOpportunityCount === nonFounderBirthCount`
  for **every** seed.
- Allocation-mutation draw discipline is asserted directly, not inferred: one
  draw on a failed occurrence, exactly four on every successful path including
  the no-donor and zero-realized-transfer branches.

---

## 6. Population guardrails (§21.4) and the named limitation

500 seeds × 180 generations, `lineage-m1-config-2`:

| Guardrail | Required | Measured | Result |
|---|---|---|---|
| whole-world extinction | < 5% | **0.00%** | PASS |
| median total living population | 90..360 | **256** | PASS |
| median load — canopy | >= 15 | **117.22** | PASS |
| median load — forest_floor | >= 15 | **108.18** | PASS |
| median load — shoreline | >= 15 | **30.53** | PASS |
| median concentration | <= 0.80 | **0.4686** | PASS |

Concentration used the exact §21.4 definition over all 500 non-extinct seeds;
every seed-level value is in the raw JSON.

### Named limitation — shoreline dominant-bin occupancy

| Zone | min load | median load | seeds with zero dominant-bin animals |
|---|---|---|---|
| canopy | 47.41 | 117.20 | 2 of 500 |
| forest_floor | 58.00 | 108.13 | 0 of 500 |
| **shoreline** | 13.98 | 30.52 | **438 of 500** |

All three zones remain meaningfully populated by the contract's own measure —
effective load — and no seed has any zone load below 1. But under the debug
zone-bin view, most late-run worlds contain no *shoreline-dominant* animal: the
shoreline is used part-time by many animals rather than full-time by a resident
subpopulation.

This is **not** a §25 halt condition. The zone bin is explicitly a debug-only
grouping with no persistent identity and no biological role (§5.4), and the
contract's zone-population guardrail is load-based and passes. It is reported
here rather than tuned away, and flagged as a concrete input to Milestone 2,
where a visibly empty shoreline late in a run would matter to what a child sees.

---

## 7. Tuning decisions

Every decision is in `DECISIONS.md`. The one change from a contract-stated
provisional constant:

### D-009 — `zoneCapacity` `[90,90,90]` → `[55,55,55]` (config-1 → config-2)

**Rationale:** the contract's provisional capacity yields a median generation-180
population of **421**, outside the required 90..360 band.

Per §21.7, both configurations were run over the full declared batch:

| Guardrail | Required | `lineage-m1-config-1` | `lineage-m1-config-2` |
|---|---|---|---|
| extinction rate | < 5% | 0.00% | 0.00% |
| median population | 90..360 | **421 — FAIL** | **256 — PASS** |
| median load canopy | >= 15 | 189.10 | 117.22 |
| median load forest_floor | >= 15 | 179.68 | 108.18 |
| median load shoreline | >= 15 | 51.24 | 30.53 |
| median concentration | <= 0.80 | 0.4615 | 0.4686 |
| all guardrails | — | **FAIL** | **PASS** |

**No claim is made that config-2 is automatically correct.** It was adopted for
exactly one reason: config-1 misses a predeclared band. Both capacities are
authored model controls, not ecological claims. The superseded configuration is
retained in source as `legacyModelConfigV1` and its full batch output is kept at
`audit/characterization-results-config1.json`.

Other recorded decisions of substance: the shoreline `visual_sensing` weight set
to 0.0 so `large_eyes` has a genuinely adverse context (D-005); `fitnessZero`
centered on the ancestor genome (D-006); balanced 5/5 side assignment in
legibility mode so the identification check measures legibility rather than side
bias (D-016). D-000 and D-010 disclose the actual document-authoring order and
the pre-declaration calibration sweeps rather than presenting a tidier sequence.

---

## 8. Desktop Canvas measurements (§22)

Headless Chromium (Playwright 1.56.1), viewport 1280×800, DPR 1. **This is not a
substitute for the iPad gate.**

| Measure | Normal mode | Render-stress (exactly 360 glyphs) |
|---|---|---|
| frames sampled | 158 | 1527 |
| median frame time | 16.70 ms | 16.70 ms |
| 95th-percentile frame time | 17.60 ms | 19.20 ms |
| maximum after warm-up | 34.60 ms | 43.60 ms |
| p95 input-to-next-paint | 11.60 ms | 10.20 ms (20 actions) |
| page errors | 0 | 0 |

Memory across a 180-generation run: 4,204,963 → 11,898,432 bytes
(**+7.69 MB**). Raw record: `audit/desktop-measurements.json`. Note this is
below the 360-generation retention window, so it does not exercise the repaired
boundary pruning; the bounded-growth evidence is the generation-400-to-600
canonical-size test in `genealogy-retention-boundary.test.js`.

---

## 9. iPad gate status

```
PENDING_HUMAN_DEVICE_TEST
```

`IPAD_TEST_CHECKLIST.md` is generated and ready. The probe provides both required
deterministic modes: legibility mode (ten randomized high-versus-low webbing
pairs, `uiRng` seed 32001, no raw trait values) and render-stress mode (exactly
360 simultaneously visible glyphs). Pause, single-step, continuous-run, fixture
reset, and mode-switch controls are instrumented for input-to-next-paint.

No measurement is supplied. No threshold is claimed as met. Per §22 the gate
stays `PENDING_HUMAN_DEVICE_TEST` until a human performs the test on an
A14-class or newer iPad in current Safari.

Post-repair, the legibility mode now satisfies §22's composition requirement:
the defining fixture, all three zone regions with occupancy counts, and the ten
randomized pairs are present in one deterministic mode. Revision 1 split these
across two conditions, which meant the prescribed acceptance procedure could not
actually be run; that is repaired.

---

## 10. Files created

```
README.md  PLAN.md  DECISIONS.md  CHARACTERIZATION_PLAN.md  CHARACTERIZATION.md
IPAD_TEST_CHECKLIST.md  FINAL_REPORT.md  AUDIT_PACKAGE_MANIFEST.md
package.json  index.html  styles.css  .gitignore

fixtures/defining_fixture_v1.json          (unchanged, hash-verified)
reference/{biology,engine,analyze}.py      (unchanged, hash-verified, never imported)

src/config/{modelConfig,traits,zones}.js
src/core/{rng,math,individual,performance,survival,mating,inheritance,
          mutation,genealogy,events,simulation,canonicalSerialize}.js
src/fixtures/{definingFixtureV1,nodeFixtureIO}.js
src/observer/{tracerChannels,currentZoneBins,matingAnnotations}.js
src/debug/{canvasProbe,animalGlyph,inspector,controls,desktopMeasure}.js
src/main.js

test/  (17 contract test files + test/helpers/scriptedRng.js)
tools/{serve,runFixture,runCharacterization,writeCharacterization,writeAuditEvidence}.mjs
audit/{test-results.txt,fixture-results.json,characterization-results.json,
       characterization-results-config1.json,observer-invariance-hashes.json,
       reference-file-hashes.json,desktop-measurements.json}
```

Two modules and one test helper are additions to the §23 layout, all recorded in
`DECISIONS.md` D-011, and all preserving the §23 dependency boundaries. Every
file required by §23 exists at its required path, asserted by
`dependency-boundary.test.js`.

---

## 11. Known limitations

1. **The model is authored, not validated.** Trait effects, zone weights,
   capacity, `selectionSlope`, and `fitnessZero` were chosen to satisfy authored
   product gates.
2. **Shoreline dominant-bin occupancy collapses in most late random runs**
   (438/500 seeds) even though shoreline load passes its guardrail. Reported in
   §6; not tuned away.
3. **Equilibrium population is almost entirely capacity-driven.** Raising
   `fitnessZero` by +0.3 moved the median from 418 to 419, because lower survival
   lowers load, which raises the density factor and compensates.
4. **Zone loads are unequal by construction** — canopy and forest floor carry
   roughly 3.5× the shoreline load. §21.3 explicitly does not require equal
   prevalence across zones.
5. **Desktop measurements are headless Chromium on Linux**, not Safari on iPad.
6. **`performance.memory` is Chromium-only**; on Safari the probe reports memory
   as unavailable rather than guessing.
7. **The §19.4 gate is executed by `tools/runFixture.mjs`**, not inside the
   build-blocking suite; the suite runs a 12-seed directional slice to stay fast.
   The full 200-seed evidence is in `audit/fixture-results.json`.
8. **`retainedGenealogy` keeps birth records for living individuals** past the
   window; under the frozen lifecycle no living individual approaches the
   360-generation boundary, so this never grows without bound.
9. **Boundary `boundaryId` values are positional, not stable across prunes.**
   The array is rebuilt each prune as the exact required set in ascending
   original-id order, so a surviving boundary may be renumbered as older ones
   drop out. `originalIndividualId` is the stable identity;
   `lastRetainedGeneration` tracks the current window edge. This is deterministic
   and idempotent, which is what §15 and §20.11 require.
10. **Revision 1 of this report shipped six defects that its own test suite did
   not catch.** The most serious — unbounded genealogy boundary growth — passed
   because the retention test checked that old *complete* records disappear but
   never that obsolete *boundary* records do. That was a gap in my tests, not a
   contract ambiguity, and it is the clearest evidence in this bundle that a
   passing suite is not proof of contract compliance.

---

## 12. Deferred features (§2 "Do not implement")

All deliberately absent: the watch/flag/decide game loop; twelve-second surfaced
variation cards; final inspection UI; prediction and journal screens; polished
procedural animal art; sound; forms and collection; explanations; myths; teacher
dashboard; room/server persistence; service worker and offline packaging; React
or any other framework; persistent display-cluster identities; cluster
split/merge history; divergence-panel claims; final cohort-ending rules;
inferred reproductive isolation; all further zones and the full trait pool.

Persistent group identity is deliberately deferred. The biological records
created here — parentage, birth, death, mating, and both mutation event streams
with full provenance — make it addable later without rewriting the biological
kernel.

---

## 13. Self-audit (§24 Stage G)

- `Math.random` search across `src/` and `tools/`: **no occurrences** (two
  doc-comment mentions were reworded so the literal token appears nowhere in
  production sources).
- Observer-import scan of `src/core`, `src/config`, `src/fixtures`: **clean**.
- Observer modules referencing the simulation RNG: **none**.
- Bare-specifier imports (i.e. runtime dependencies): **none**; `dependencies` is
  empty.
- Full test suite re-run from clean: **119/119 pass**, raw stdout in
  `audit/test-results.txt`.
- Fixture and characterization re-run: outputs in `audit/`.
- Observer strategies compared after every generation: **byte-identical**.
- Reference files verified unchanged against the starter manifest: **all three
  match**.
- Deferred product features listed: §12 above.

## 14. Completion law (§28)

| Requirement | Status |
|---|---|
| observer actions provably cannot alter biology | met |
| body and habitat variation occur only at birth | met |
| the same webbing change has opposite consequences in the two contexts | met |
| all three zones coexist in random worlds under broad guardrails | met by load; **see the named §6 limitation on dominant-bin occupancy** |
| mutation generation auditable separately from carrier survival | met |
| genealogy and mating cores remain coherent | met |
| neutral traits are exactly neutral | met |
| the difference is visible in the diagnostic probe | met on desktop; **iPad legibility pending human test** |
| every automated result reproducible from a clean run | met — 119/119 from clean; fixture and both batches re-run |
| remaining uncertainty named rather than hidden | met — §6, §11, and the full audit response in §1b |

**Completion is nonetheless NOT declared.** §24 Stage A ordering was violated
and cannot be repaired retrospectively (D-000, D-024). That is a principal
decision, not an implementer decision, and the status stays `M1_BLOCKED` until it
is recorded. The physical iPad gate also remains `PENDING_HUMAN_DEVICE_TEST`.
