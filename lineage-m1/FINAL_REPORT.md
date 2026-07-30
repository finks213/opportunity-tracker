# LINEAGE Milestone 1 — Final Implementation Report

> **GENERATED FILE.** Produced by `tools/writeFinalReport.mjs` (`npm run report:final`)
> from the raw evidence under `audit/` and from `src/config/milestoneStatus.js`. Do not
> hand-edit: `test/report-integrity.test.js` fails the build when this file disagrees
> with the raw evidence, and any manual change is overwritten on the next generation.

## Status

```
M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED
```

**This report is revision 4** (generated 2026-07-30). Revisions 1, 2 and 3 were each
audited and each returned `BREAKS-FOUND`. The status stays at the value above and
**must not** advance until revision 4 survives independent re-audit by both the
structural code audit and the AFE-Δ evidence and claim audit.

Separately pending, and NOT the only blockers:

```
PROCESS WAIVER: PENDING PRINCIPAL DECISION
IPAD TEST: PENDING_HUMAN_DEVICE_TEST
```

Revision 2 stated that the Stage A process waiver was the only remaining blocker.
That was false while implementation and evidence defects were open, and it is
withdrawn. Revision 1 reported `M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING`; that
was withdrawn in revision 2 and is not reinstated here.

**No claim is made in this report that the automated gates pass.** The repaired gates
were re-run and their results are reported below as evidence for the next audit, not
as a self-certification.

---

Two statements the contract requires verbatim:

> **The model is authored and is not biologically validated.** Every trait
> effect, zone weight, capacity, and selection constant is a model control
> chosen to satisfy authored product gates. No number in this report is an
> ecological claim or a statement about any real species.

> **Milestone 1 is not the playable student game.** There is no watch/flag/decide
> loop, no surfaced variation cards, no inspection UI, no prediction or journal
> screens, no collection, no explanations, no teacher view, and no UI framework.

### Build identity

Exactly one identity block appears in this report. Revision 3 printed two, and the
duplicate published the tuning-only subset hash as though it were the config hash.

| Field | Value |
|---|---|
| Configuration | `lineage-m1-config-2` |
| **`modelDefinitionHash`** (authoritative) | `dc444865163deb32a7a9d80bd23f576d1ab5a936896298b5cd13faac6f513b3d` |
| `tuningConfigHash` (**NONAUTHORITATIVE**) | `edb81695973b81ab8f87f7ef9dde9d8c5b3d4c7dfbeb45f385547edd86ee86de` |
| Fixture SHA-256 | `c80aaa523d3b3eec2655502b4eaebdbbb4d12f71f8b3378d9d3be60797342b78` |
| Evidence-run runtime | v22.22.2 · linux x64 |
| Declared runtime support | `node >=18` |

- `modelDefinitionHash`: SHA-256 over the complete model definition — every biology-affecting value.
- `tuningConfigHash`: NONAUTHORITATIVE. SHA-256 over the tuning-config subset only. Published as the config hash by revisions 1-2, which is why a trait-effect change could move survival without moving the hash. Retained solely so older evidence files remain traceable; it does not identify the model.

The runtime row is read from `audit/build-environment.json`, recorded once by the official
evidence run. Revision 4 embedded the LIVE `process.version` here, and because the suite
requires this file to be byte-identical to a fresh render, the report could only match on the
exact Node patch that generated it — Node 20 and Node 24 each failed byte equality while
satisfying the declared `node >=18`. Support stays at `>=18`; the verifier's runtime is simply
no longer part of the report bytes. See `audit/runtime-matrix.json` for the majors actually
exercised.

---

## 1. Gate-by-gate results

Nothing below is hidden behind a summary. Failures, pending items, and named
uncertainties appear in the same table as the passes.

**Every row is derived**, not written. Each gate declares the named tests that evidence it
(`tools/gateRegistry.mjs`); the status comes from those tests' actual results in
`audit/test-results.txt`. A gate whose evidencing test did not run reads `UNVERIFIED`, never
`PASS`. Revision 4 hardcoded a literal `PASS` on every feature row, so injecting a single
failure produced `Full test suite: FAIL — 1 of 249` beside `Birth immutability: PASS`.

| # | Gate | Contract § | Result |
|---|---|---|---|
| 1 | Full test suite | §20 | **PASS** — 249/249, 0 failing |
| 2 | Fixture raw SHA-256 integrity | §19 A | **PASS** |
| 3 | Fixture-envelope canonical round trip | §19 B | **PASS** |
| 4 | Deterministic hydration | §19 C | **PASS** |
| 5 | Paired-world construction | §19 D | **PASS** |
| 6 | Exact probability gate | §19.3 | **PASS** |
| 7 | Matched trajectory gate, seeds 1..200 | §19.4 | **PASS** |
| 8 | Meaningful-trait contextual gate | §9 / §20.5 | **PASS** |
| 9 | Birth immutability | §20.1 | **PASS** |
| 10 | Observer-state invariance | §20.2 | **PASS** |
| 11 | No observer dependencies in biology | §20.3 | **PASS** |
| 12 | Neutral-trait integrity | §20.4 | **PASS** |
| 13 | Full-path body-mutation independence | §20.6 | **PASS** |
| 14 | Mutation provenance and counter ownership | §20.7 | **PASS** |
| 15 | Allocation-mutation opportunity contract | §20.8 | **PASS** |
| 16 | Spatial integrity and adjacency | §20.9 | **PASS** |
| 17 | Lifecycle and mating contract | §20.10 | **PASS** |
| 18 | Genealogy integrity + forced 360-boundary | §20.11 | **PASS** |
| 19 | Genealogy boundary records bounded | §15 | **PASS** |
| 20 | Exact survival composition | §20.12 | **PASS** |
| 21 | RNG integrity | §20.13 | **PASS** |
| 22 | Population guardrails, 500 seeds | §21.4 | **PASS** |
| 23 | §21.6 adjacency traversal, isolated edge-only worlds | §21.6 | **PASS** — no contract threshold applies; the measurement is reported, not scored |
| 24 | Desktop Canvas measurement, reproducible | §22 | **PASS** — §22 states no desktop pass law; the numeric pass law belongs to the iPad gate |
| 25 | Desktop **Canvas** memory growth across the 180-generation run | §22 | **UNVERIFIED** — read from `audit/desktop-measurements.json` → `desktopCanvasMemory.status`; no supported browser API exposes it on the measured build, and the Node simulation heap is NOT a substitute |
| 26 | Canonical model identity binds state progression | §18 / §21.7 | **UNVERIFIED** — no result observed for: §18 — a state missing modelIdentityHash is rejected, not advanced; §18 — a malformed or unknown model identity is rejected; §18 — same version, different model is rejected with state untouched |
| 27 | One authoritative model hash across all evidence | §9 / §18 | **UNVERIFIED** — no result observed for: §9/§18 — every evidence file publishes the same authoritative modelDefinitionHash; §9/§18 — no tool serializes or hashes the model independently |
| 28 | Legibility mode is self-contained | §22 | **PASS** |
| 29 | World loads are transactional against concurrent requests | §22 | **UNVERIFIED** — no result observed for: §22 — an older fixture load cannot overwrite a newer legibility world; §22 — a stale fixture response cannot replace a newer random world; §22 — the newest requested fixture variant wins regardless of resolution order; §22 — a failed or rejected stale request commits nothing |
| 30 | Generation advancement atomic against observer failure | §4 / §16 | **PASS** |
| 31 | Generation result is deeply immutable | §4 | **UNVERIFIED** — no result observed for: §4 — observerErrors and every error record are deeply frozen |
| 32 | Focal lineage resolved, never reseeded, never falsely terminated | §16 | **UNVERIFIED** — no result observed for: §16 — a maintained focal channel matches an independent reference at every generation; §16 — an unresolvable ancestry reports FOCAL_ANCESTRY_UNRESOLVABLE, not extinction |
| 33 | Quarantined Python references unchanged | §27 | **PASS** |
| 34 | Report agrees with the raw evidence | §26 / §27 | **PASS** |
| 35 | Tests never mutate the production source tree | §20 | **UNVERIFIED** — no result observed for: §20 — the self-audit scanner runs against an isolated tree, never src/; §20 — the production source tree is byte-identical before and after the scanner tests |
| 36 | Report bytes are runtime-independent across supported Node majors | §26 | **UNVERIFIED** — no result observed for: §26 — the report renders identically on every recorded runtime |
| 37 | **Physical iPad acceptance** | §22 | **PENDING_HUMAN_DEVICE_TEST** — no measurement supplied; not performed |
| 38 | **§24 Stage A pre-code planning order** | §24 | **VIOLATED — principal decision required** — unrepairable retrospectively; DECISIONS.md D-000 and D-024 |

**Gate totals:** 28 PASS · 0 FAIL · 8 UNVERIFIED · 3 externally determined (of 38).

No unattributed failures: every failing test in this run, if any, maps to a declared gate.

Machine-readable form: `audit/gate-summary.json`.

**Named uncertainty (not a gate failure):** shoreline *dominant-bin* occupancy is
zero in 438 of 500 seeds at generation 180,
even though shoreline *load* passes its guardrail comfortably. Detailed in §6 below
and in `CHARACTERIZATION.md`.

### Raw suite counts, as reported by the runner

| Field | Value |
|---|---|
| tests | 249 |
| pass | 249 |
| fail | 0 |
| cancelled | 0 |
| skipped | 0 |
| todo | 0 |

Wall-clock duration is deliberately **not** reproduced here. It differs on every run,
so printing it would make the report and the results file permanently disagree and the
integrity check unsatisfiable. It is in `audit/test-results.txt` as `# duration_ms`.

Command: `npm run audit:tests` — the same suite as `npm test`
(`node --test --test-timeout=3600000 test/*.test.js`), captured atomically so this file
records a complete run. Raw stdout: `audit/test-results.txt`.

---

## 2. Fixture results

### §19.3 exact probability gate

Baseline genome, standard loads `[39.84, 40.32, 39.84]`, age 1.

| Probe | low webbing | high webbing | Δ | Required | Result |
|---|---|---|---|---|---|
| canopy | 0.579632 | 0.195758 | **-0.383874** | `<= −0.03` | **PASS** |
| shoreline | 0.579632 | 0.904958 | **+0.325326** | `>= +0.03` | **PASS** |

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

Exact three-zone delta vectors, read from `audit/meaningful-trait-gate.json`, which
is emitted by `tools/writeAuditEvidence.mjs` from the production survival path.

Probe: genome `[0.15, 0.45, 0.4, 0.45, 0.4, 0.4, 0.35, 0.5, 0.5, 0.5]`, loads `[39.84, 40.32, 39.84]`,
age 1 (age multiplier 1), low 0.2 vs high 0.8.
Frozen probe values equal the fixture's: **yes**.

| Trait | canopy | forest_floor | shoreline | Positive in | Adverse/inactive in | Passes |
|---|---|---|---|---|---|---|
| `toe_webbing` | -0.394064 | -0.077299 | 0.320181 | shoreline | canopy, forest_floor | yes |
| `curved_claws` | 0.454421 | 0.035301 | -0.236447 | canopy, forest_floor | shoreline | yes |
| `dense_fur` | 0.062551 | 0.184805 | -0.145120 | canopy, forest_floor | shoreline | yes |
| `long_hindlimbs` | 0.192220 | 0.377034 | -0.220446 | canopy, forest_floor | shoreline | yes |
| `strong_tail` | -0.129755 | -0.165676 | 0.289158 | shoreline | canopy, forest_floor | yes |
| `large_eyes` | 0.072942 | 0.253996 | -0.114328 | canopy, forest_floor | shoreline | yes |
| `streamlined_body` | -0.278264 | -0.070471 | 0.358206 | shoreline | canopy, forest_floor | yes |

Floors: benefit `>= +0.01`, cost `<= −0.01`, neutral-equivalence
margin `0.001`, arithmetic tolerance `1e-12`. No floor was
weakened after seeing a result.

Every meaningful trait has a positive context **and** a different adverse-or-inactive
context. None is beneficial everywhere; none is harmful everywhere.

### Neutral traits (§20.4)

| Trait | canopy | forest_floor | shoreline | max abs Δ |
|---|---|---|---|---|
| `coat_shade` | 0 | 0 | 0 | **0** |
| `ear_tip_shape` | 0 | 0 | 0 | **0** |
| `tail_tip_marking` | 0 | 0 | 0 | **0** |

Zero by construction in both the effect matrix and the upkeep vector, so this is an
invariant rather than a measurement. The suite additionally asserts exact zero across
performance dimensions, zone fitness, survival probabilities, mating weights,
allocation inheritance, and mutation probabilities.

---

## 4. Observer-invariance evidence

`audit/observer-invariance-hashes.json` records the SHA-256 of the canonical
biological serialization after **every** generation, for every required observer
strategy in the defining fixture:

1. follow_nothing;
2. tracer_canopy_high_webbing_founders;
3. tracer_shoreline_high_webbing_founders;
4. tracer_high_coat_shade_founders;
5. multiple_channels_with_switching;

Result: **5 strategies × 31 generations, 0 mismatches, byte-identical: true.**

Additional proofs in the suite:

- observer actions do not advance the simulation RNG state (state compared before/after);
- canonical bytes contain none of `tracer`, `channels`, `activeChannel`,
  `inspectedIds`, `currentZoneBin`, `annotationModelVersion`, `uiRng`, `timestamp`,
  `diagnostics`, `lastGenerationResult`, `observerErrors`;
- biological modules import no observer or debug module (static scan);
- observer modules never reference the simulation RNG at all;
- an observer exception at **any** birth, or from `afterGeneration`, leaves canonical
  bytes and RNG state exactly equal to a clean no-observer generation
  (`observer-transaction-integrity.test.js`);
- comparison uses exact bytes, never a float tolerance.

---

## 5. Mutation-provenance evidence

- Body-mutation and allocation-mutation events use **separate typed ID namespaces**;
  IDs are unique and strictly increasing *within* each array; numeric overlap between
  the two is expected and is never reported as a collision.
- Recording a body mutation increments only `nextMutationEventId`; recording an
  allocation mutation increments only `nextAllocationMutationEventId`.
- A failed opportunity records no event and increments neither counter.
- Every mutation event references a child born in the **same** generation, never a
  survivor and never a founder.
- Post-values are reconstructible from `preMutationValue + requestedDelta` with
  clamping, to 1e-15.
- Both counters hydrate from the fixture exactly, and canonical serialization changes
  when either counter changes.
- Across the 500-seed batch,
  `bodyMutationOpportunityCount === allocationMutationOpportunityCount === nonFounderBirthCount`
  for every seed: **true**.
- Allocation-mutation draw discipline is asserted directly, not inferred: one draw on a
  failed occurrence, exactly four on every successful path including the no-donor and
  zero-realized-transfer branches.
- Allocation-mutation events per non-founder birth: **0.079884**;
  transfers into a zone whose share was below `parentalUseEpsilon`: **87,299**.

---

## 6. Population guardrails (§21.4) and the named limitation

500 seeds × 180 generations, `lineage-m1-config-2`:

| Guardrail | Required | Measured | Result |
|---|---|---|---|
| whole-world extinction | < 5% | **0.00%** | PASS |
| median total living population | 90..360 | **256.0** | PASS |
| median load — canopy | >= 15 | **117.22** | PASS |
| median load — forest_floor | >= 15 | **108.18** | PASS |
| median load — shoreline | >= 15 | **30.53** | PASS |
| median concentration | <= 0.80 | **0.4686** | PASS |

Concentration used the exact §21.4 definition over all 500 non-extinct seeds
with the ordinary median; every seed-level value is in the raw JSON.

### Named limitation — shoreline dominant-bin occupancy

| Zone | min load | median load | seeds with zero dominant-bin animals |
|---|---|---|---|
| canopy | 47.41 | 117.22 | 2 of 500 |
| forest_floor | 58.00 | 108.18 | 0 of 500 |
| **shoreline** | 13.98 | 30.53 | **438 of 500** |

All three zones remain meaningfully populated by the contract's own measure —
effective load — and no seed has any zone load below 1. But under the debug zone-bin
view, most late-run worlds contain no *shoreline-dominant* animal: the shoreline is
used part-time by many animals rather than full-time by a resident subpopulation.

This is **not** a §25 halt condition. The zone bin is explicitly a debug-only grouping
with no persistent identity and no biological role (§5.4), and the contract's
zone-population guardrail is load-based and passes. It is reported here rather than
tuned away, and flagged as a concrete input to Milestone 2, where a visibly empty
shoreline late in a run would matter to what a child sees.

---

## 6b. §21.6 adjacency traversal

**Authoritative evidence: the isolated edge-only worlds only.** See
`CHARACTERIZATION_PLAN.md` Amendment 1 (dated) for why the mixed-world measure does
not carry this claim.

| Experiment | Retained founders | Target zone | Seeds reaching | Earliest | Median first generation | Latest | Extinct seeds |
|---|---|---|---|---|---|---|---|
| canopyOnly | 1..40 | shoreline | **500 of 500** | 2 | 3.0 | 10 | 0 |
| shorelineOnly | 81..120 | canopy | **500 of 500** | 2 | 3.0 | 8 | 0 |

40 founders only, no forest-floor founders at all. Because there is no
canopy-shoreline edge, the opposite edge zone is reachable only across the
forest-floor bridge. The frozen initializer is recorded in the raw JSON under
`frozenInitializer`.

### Supporting measure only — mixed-world single-band ancestry (NOT the §21.6 claim)

Raw keys `additionalMixedWorldCanopyAncestryReachesShoreline` and
`additionalMixedWorldShorelineAncestryReachesCanopy`, renamed in revision 4.

| Measure (mixed 120-founder world) | Seeds | Earliest | Median first generation |
|---|---|---|---|
| canopy-only-ancestry → shoreline | 495 of 500 | 2 | 3.0 |
| shoreline-only-ancestry → canopy | 499 of 500 | 2 | 3.0 |

All 120 founders remain present and ecologically active in this world, so they still
affect zone loads, density factors, survival probabilities, mating availability,
mating order, and population dynamics. A lineage that stays genetically single-band is
not an isolated world.

---

## 7. Tuning decisions

Every decision is in `DECISIONS.md`. The one change from a contract-stated provisional
constant:

### D-009 — `zoneCapacity` `[90,90,90]` → `[55,55,55]`

**Rationale:** the contract's provisional capacity yields a median generation-180
population of **421.0**, outside the required 90..360 band.

Per §21.7, both configurations were run over the full declared batch:

| Guardrail | Required | `lineage-m1-config-1` | `lineage-m1-config-2` |
|---|---|---|---|
| extinction rate | < 5% | 0.00% | 0.00% |
| median population | 90..360 | **421.0 — FAIL** | **256.0 — PASS** |
| median load canopy | >= 15 | 189.10 | 117.22 |
| median load forest_floor | >= 15 | 179.68 | 108.18 |
| median load shoreline | >= 15 | 51.24 | 30.53 |
| median concentration | <= 0.80 | 0.4615 | 0.4686 |
| all guardrails | — | **FAIL** | **PASS** |

**No claim is made that the newer configuration is automatically correct.** It was
adopted for exactly one reason: the older one misses a predeclared band. Both
capacities are authored model controls, not ecological claims. The superseded
configuration is retained in source as `legacyModelConfigV1` and its full batch output
is kept at `audit/characterization-results-config1.json`.

Other recorded decisions of substance: the shoreline `visual_sensing` weight set to
0.0 so `large_eyes` has a genuinely adverse context (D-005); `fitnessZero` centered on
the ancestor genome (D-006); balanced 5/5 side assignment in legibility mode so the
identification check measures legibility rather than side bias (D-016). D-000 and
D-010 disclose the actual document-authoring order and the pre-declaration calibration
sweeps rather than presenting a tidier sequence.

---

## 8. Desktop Canvas measurement (§22)

Headless Chromium 141.0.7390.37, viewport 1280×800,
device-pixel ratio 1. **This is not a substitute for the iPad gate.**

Reproducible from this bundle with one command:

```
npm install && npx playwright install chromium
npm run audit:desktop
```

The driver (`tools/measureDesktop.mjs`) freezes every parameter, starts and stops its
own ephemeral loopback server, and writes the schema below.

**What is pinned, precisely.** `package-lock.json` pins the `playwright` package to an
exact version with an integrity hash. That package determines which Chromium build
`npx playwright install chromium` fetches, but the browser BINARY is downloaded, not
vendored, so the build actually used is recorded in the output rather than asserted:
`browser.version` above is the version this run measured (141.0.7390.37).
A different environment may resolve a different Chromium build; the tool reports what
it ran, which is why the memory channel is probed per run rather than assumed.

| Measure | Normal mode | Render-stress |
|---|---|---|
| glyphs drawn | live world (224 animals) | 360 (declared 360, matches: true) |
| frames sampled | 180 | 1462 |
| median frame time | 16.70 ms | 16.70 ms |
| 95th-percentile frame time | 17.50 ms | 17.40 ms |
| maximum after warm-up | 23.30 ms | 51.00 ms |
| p95 input-to-next-paint | not sampled | 13.20 ms (21 actions) |
| page errors | 0 | 0 |

### Generation semantics (explicit, not inferred)

A freshly hydrated fixture is generation 0. The run performs exactly
180 transitions, so the final state is generation
**180** with **224** living animals. Revision 3 reported
`generation: 181` beside a field named `populationAfter180Generations`; that ambiguity
is gone.

Independently cross-checked against a fresh Node run of the same fixture, seed and
transition count: **agrees**
(population 224, zone bins canopy 118, forest_floor 106, shoreline 0).

### Window scope

Desktop windows: 2000 ms warm-up, 3000 ms normal sample,
20000 ms stress sample. The iPad gate requires
30000 ms warm-up and 180000 ms of stress sampling.
**Satisfies the iPad gate's windows: false.** These desktop numbers are
not measured against the iPad pass law and do not advance that gate.

### Memory across the 180-generation run

Two separately named results. Neither stands in for the other.

#### `DESKTOP_CANVAS_MEMORY` — the §22 subject: **UNVERIFIED**

```
DESKTOP_CANVAS_MEMORY: UNVERIFIED
reason: no reliable supported measurement channel
```

The only browser-side channel available, performance.memory.usedJSHeapSize, was probed by allocating 320000000 bytes in the page; the reading did not move (10000000 before and after). This Chromium build quantizes the value, so no browser-side delta from it carries information. No other supported API exposes Canvas/renderer memory to page script.

`deltaBytes` is `null`, deliberately. Revision 4 published a Node process-heap delta here
and called it the authoritative Canvas measure; a numeric answer to a question the run did
not ask is worse than an honest `UNVERIFIED`. The probe result is in the raw JSON under
`desktopCanvasMemory.resolutionProbe`.

#### `NODE_SIMULATION_HEAP` — a separate diagnostic, NOT the §22 subject

| Field | Value |
|---|---|
| channel | `node:process.memoryUsage()` |
| measures Canvas or browser memory | **false** |
| heapUsed before → after | 24,962,128 → 75,772,912 bytes (Δ 50,810,784) |
| RSS before → after | 93,675,520 → 160,890,880 bytes (Δ 67,215,360) |
| retained genealogy records | 22,470 |
| living individuals | 224 |

This runs biological state forward in Node. It creates no browser, Canvas, DOM, renderer, frame
meter, tracer UI or browser heap, so it measures a different process and object graph and cannot
answer the Canvas requirement. Its useful part is the exact, quantization-free retained-record
counts.

Exact retained-record counts are the quantization-free growth measure. This
180-generation window is **below** the 360-generation genealogy retention boundary,
so it does not exercise boundary pruning; the retention bound itself is tested
through generation 1000 by `observer-memory-bounds.test.js` and
`genealogy-retention-boundary.test.js`.

---

## 9. iPad gate status

```
PENDING_HUMAN_DEVICE_TEST
```

`IPAD_TEST_CHECKLIST.md` is generated and ready. The probe provides both required
deterministic modes: legibility mode (the defining fixture with all three zones
visible **and** ten randomized high-versus-low webbing pairs, `uiRng` seed 32001, no
raw trait values) and render-stress mode (exactly 360 simultaneously visible glyphs,
counted rather than asserted). Pause, single-step, continuous-run, fixture reset, and
mode-switch controls are instrumented for input-to-next-paint.

Legibility mode is self-contained: entering it **rehydrates the defining fixture**
rather than trusting a flag, so the prescribed procedure cannot be run against a
different world.

**No measurement is supplied. No threshold is claimed as met.** Per §22 the gate stays
`PENDING_HUMAN_DEVICE_TEST` until a human performs the test on an A14-class or newer
iPad in current Safari. Per the standing instruction, the physical test has not been
performed and is not being requested until revision 4 survives both audits.

---

## 9b. Claims withdrawn from earlier revisions

Stated here in the report itself, not only in the repair record, because a reader
of this file alone must not be able to carry forward a claim that has been retracted.

### Withdrawn in revision 4 (from revision 3)

1. **`populationAfter180Generations: 234`** in `audit/desktop-measurements.json` — that
   figure is the population at generation **181**, not 180. Independently confirmed:
   generation 180 → 224 living, generation 181 → 234 living. See §8 and D-041.
2. **The desktop `memoryGrowthAcross180Generations.deltaBytes` figure as memory-growth
   evidence** — published from a `performance.memory` channel that was never verified
   to respond to allocation. See §8 and D-042.
3. **"Config hash: `edb81695…`"** in the revision-3 report header — that is the
   tuning-only subset hash, which the same report elsewhere states does not identify
   the model. The authoritative identity is `modelDefinitionHash`. See the build
   identity block above and D-040.
4. **"119 tests … 119/119"** in the revision-3 gate table — the raw TAP summary in the
   same bundle reported 172. No suite count is stated in prose any more; §1 reads it
   from `audit/test-results.txt`. See D-040.
5. **"The measure is now implemented literally"** in `CHARACTERIZATION_PLAN.md`, of the
   mixed-world ancestry measure — it measured ancestry inside a mixed world, while the
   declaration asks for an isolated world. Marked in place and superseded by the dated
   Amendment 1. See §6b and D-039.

### Withdrawn earlier, and not reinstated

6. **"Adjacency traversal … implemented literally … the declared measure itself is
   unchanged"** (revision 2) — false; it measured a mixed-world ancestry subset. D-029.
7. **"Automated implementation gates: PASS"** and **"the overall status is held at
   `M1_BLOCKED` for one reason"** (revision 2) — false while implementation and evidence
   defects were open. D-033.
8. **`M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING`** (revision 1) — withdrawn in
   revision 2 after six confirmed defects.

---

## 10. Self-audit (§24 Stage G)

Each scan below was executed by `tools/writeFinalReport.mjs` while generating this
file. The result column is the scan's actual output, not a remembered claim.

| Check | Result |
|---|---|
| unseeded-random search across `src/` and `tools/` | no occurrences |
| observer/debug imports in `src/core`, `src/config`, `src/fixtures` | clean |
| observer modules referencing the simulation RNG | none |
| bare-specifier imports in `src/` (runtime dependencies) | none; `dependencies` is empty |
| full test suite from clean | 249/249, 0 failures |
| observer strategies compared after every generation | byte-identical: true |
| quarantined Python references unchanged | true (3 files) |
| fixture, both characterization batches, edge-only, desktop | regenerated for this revision |

`playwright` is a **devDependency** used only by the desktop measurement; no runtime
dependency was added and the shipped simulation still imports nothing outside `node:`.

---

## 11. Known limitations

1. **The model is authored, not validated.** Trait effects, zone weights, capacity,
   `selectionSlope`, and `fitnessZero` were chosen to satisfy authored product gates.
2. **Shoreline dominant-bin occupancy collapses in most late random runs**
   (438/500 seeds) even though shoreline load passes its guardrail.
   Reported in §6; not tuned away.
3. **Equilibrium population is almost entirely capacity-driven.** Raising `fitnessZero`
   by +0.3 moved the median only marginally, because lower survival lowers load, which
   raises the density factor and compensates.
4. **Zone loads are unequal by construction** — canopy and forest floor carry roughly
   3.5× the shoreline load. §21.3 explicitly does not require equal prevalence across
   zones.
5. **Desktop measurements are headless Chromium on Linux**, not Safari on iPad, and use
   shorter windows than the iPad gate.
6. **`performance.memory` carries no usable resolution in this Chromium build** and is
   absent on Safari. It is probed at run time and withdrawn as evidence when
   unresponsive, rather than reported as a growth figure.
7. **The full §19.4 200-seed run is executed by `tools/runFixture.mjs`**, while the
   build-blocking suite runs the exact 200-seed gate assertions plus a fast directional
   slice. The full evidence is in `audit/fixture-results.json`.
8. **`retainedGenealogy` keeps birth records for living individuals** past the window;
   under the frozen lifecycle no living individual approaches the 360-generation
   boundary, so this never grows without bound.
9. **Boundary `boundaryId` values are positional, not stable across prunes.** The array
   is rebuilt each prune as the exact required set in ascending original-id order, so a
   surviving boundary may be renumbered as older ones drop out. `originalIndividualId`
   is the stable identity. This is deterministic and idempotent, which is what §15 and
   §20.11 require.
10. **Revisions 1, 2 and 3 each shipped defects their own passing suites did not catch**
   — six, ten and eight respectively, as found by external audit. The clearest single
   example: unbounded genealogy boundary growth passed revision 1 because the retention
   test checked that old *complete* records disappear but never that obsolete *boundary*
   records do. Those were gaps in my tests, not contract ambiguities, and they are the
   strongest evidence in this bundle that a passing suite is not proof of contract
   compliance.
11. **Revision 4's own verification found eight further defects that neither auditor**
   **reported** — including an evidence-capture path that made the report-integrity
   check unpassable, and a self-audit table that asserted scans it never executed. They
   are listed as R4-9a…h in `REVISION_4_REPAIR_RECORD.md`. Their existence is the
   reason this report claims no gate pass: three consecutive audits have found real
   defects, and so did I after the third.
12. **The report and the raw suite results are mutually checking, so the committed pair**
   **converges over a short cycle.** `FINAL_REPORT.md` states the suite counts and
   `report-integrity.test.js` compares them, so `npm run report:final` followed by
   `npm run audit:tests` may need one repetition before both are green together. This
   is a consequence of making the report verifiable rather than declarative, and
   `tools/runTests.mjs` prints the next step rather than leaving it implicit.

---

## 12. Deferred features (§2 "Do not implement")

All deliberately absent: the watch/flag/decide game loop; twelve-second surfaced
variation cards; final inspection UI; prediction and journal screens; polished
procedural animal art; sound; forms and collection; explanations; myths; teacher
dashboard; room/server persistence; service worker and offline packaging; React or any
other framework; persistent display-cluster identities; cluster split/merge history;
divergence-panel claims; final cohort-ending rules; inferred reproductive isolation;
all further zones and the full trait pool.

Persistent group identity is deliberately deferred. The biological records created
here — parentage, birth, death, mating, and both mutation event streams with full
provenance — make it addable later without rewriting the biological kernel.

---

## 13. Completion law (§28)

| Requirement | Status |
|---|---|
| observer actions provably cannot alter biology | met — byte-identical across every strategy, and atomic against observer exceptions |
| body and habitat variation occur only at birth | met |
| the same webbing change has opposite consequences in the two contexts | met |
| all three zones coexist in random worlds under broad guardrails | met by load; **see the named §6 limitation on dominant-bin occupancy** |
| mutation generation auditable separately from carrier survival | met |
| genealogy and mating cores remain coherent | met |
| neutral traits are exactly neutral | met |
| the difference is visible in the diagnostic probe | met on desktop; **iPad legibility pending human test** |
| every automated result reproducible from a clean run | NOT met — 249/249 from clean, 0 gate(s) FAIL, 8 UNVERIFIED |
| remaining uncertainty named rather than hidden | met — §6, §11, and the audit response in the repair record |

**Completion is NOT declared** (`mayDeclareCompletion: false`). §24 Stage A ordering was
violated and cannot be repaired retrospectively (D-000, D-024). That is a principal
decision, not an implementer decision. The physical iPad gate is unperformed. The
status stays as printed at the top of this report.

---

## 14. Where to verify each claim

| Claim in this report | Raw evidence |
|---|---|
| suite counts | `audit/test-results.txt` (TAP summary) |
| §19.3 / §19.4 fixture gates | `audit/fixture-results.json` |
| §9 / §20.4 trait deltas | `audit/meaningful-trait-gate.json` |
| §21.3–§21.6 batch measures | `audit/characterization-results.json` |
| §21.7 side-by-side | `audit/characterization-results-config1.json` |
| §21.6 traversal | `audit/edge-only-traversal-results.json` |
| observer invariance | `audit/observer-invariance-hashes.json` |
| reference-file integrity | `audit/reference-file-hashes.json` |
| §22 desktop measurement | `audit/desktop-measurements.json` |
| status | `src/config/milestoneStatus.js` |

Consistency between this report and those files is enforced by
`test/report-integrity.test.js`.
