# LINEAGE M1 — Revision-5 Repair Record

Required by the revision-5 delivery specification. One section per verified defect:
the command that reproduced it, the observed revision-4 result, the repair, the
revision-5 result, and the **committed** regression test.

Authority: `LINEAGE_M1_WORLD_MODEL_CONTRACT_v3_3` (binding).
Status during and after this pass:

```
M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED
PROCESS WAIVER: PENDING PRINCIPAL DECISION
IPAD TEST:      PENDING_HUMAN_DEVICE_TEST
```

Inputs: the AFE-Δ revision-4 BREAK-REPORT and `LINEAGE_M1_REV4_STRUCTURAL_AUDIT.md`
(artifact SHA-256 `0f5023030551bfd9fcc7baa123d1a27dae0dc951ceb23d31adb405a2c4d630b6`).
Both returned `BREAKS-FOUND`; both were read as primary evidence.

Method for every defect, without exception:

1. reproduce independently against revision 4 and record the exact command and output;
2. repair the production code, not the test;
3. **commit a regression test** — ad hoc verification is not closure;
4. rerun the affected evidence generator;
5. document any numerical change.

**Nothing here weakens a contract threshold.** Where a test I wrote encoded my own
wrong expectation, that is stated as such rather than quietly corrected.

**Preserved from revision 4, unchanged and re-verified:** server path containment,
complete model-definition construction, deep-frozen shipped model tables, bounded
genealogy and observer memory, exact edge-only traversal experiments, the exact
200-seed fixture gate, one-hydration fixture cloning, post-survival unmatched-adult
measurement, complete per-zone carrier reporting, observer callbacks outside the
biological transaction, sequential legibility reset, mixed-world versus edge-only
evidence separation, the corrected median, and consistent blocked status.

---

## R5-1 / BUG 1 — Focal lineage reported extinct after retention removed the path (MEDIUM-CRITICAL)

Contract §16.

**Reproduce**

```bash
node -e '
const run = async () => {
  const { createInitialState } = await import("./src/core/individual.js");
  const { advanceGeneration } = await import("./src/core/simulation.js");
  const { currentModelConfig: C } = await import("./src/config/modelConfig.js");
  const T = await import("./src/observer/tracerChannels.js");
  const s = createInitialState(1, C);
  const f = s.currentIndividuals.slice(0, 12).map((i) => i.id);
  const obs = T.createObserverState();
  T.createTracerChannel(obs, "witness", f, s.currentIndividuals.map((i) => i.id));
  const onBirth = T.tracerBirthHook(obs), afterGeneration = T.observerAfterGenerationHook(obs);
  for (const mark of [12, 360, 361, 400, 800]) {
    while (s.generation < mark) advanceGeneration(s, C, { onBirth, afterGeneration });
    const living = s.currentIndividuals.map(i => i.id);
    const ch = obs.channels.get("witness");
    const positive = living.filter(id => (ch.values.get(id) ?? 0) > 0);
    console.log("gen", s.generation, "living", living.length,
      "positive", positive.length,
      "resolver", T.resolveLivingDescendants(s, f).descendantIds.length);
  }
};
run();'
```

**Observed on revision 4**

```
gen 12  living 214  positive 59   resolver 59
gen 360 living 268  positive 268  resolver 268
gen 361 living 286  positive 286  resolver 286
gen 400 living 293  positive 293  resolver 0     <- UI: FOCAL_LINEAGE_UNAVAILABLE
gen 800 living 273  positive 273  resolver 0
```

A continuously propagated witness channel is an independent ancestry oracle. At
generations 400 and 800 **every living animal** carried positive focal contribution
while reconstruction found nothing. The lineage was alive; only the historical path
through the rolling 360-generation genealogy was gone, and the UI asserted
biological absence.

**Repair**

- `resolveLivingDescendants()` now also returns `historicalPathIntact`,
  `oldestRetainedGeneration` and `zeroIsTrustworthy`. A zero result may be read as
  extinction **only** when the requested founders are still inside the retained
  window.
- `createMaintainedFocalChannels(observer, state, focalSets)` creates bounded
  observer-side channels for the contract-required focal sets **at world creation**,
  while every founder is still alive — the only moment a generation-zero focal set
  can be captured exactly. They may stay dormant, and they are propagated through
  every birth and pruned to the living population by the same path as any other
  channel.
- `resolveFocalLineage()` prefers the maintained channel, then trustworthy
  genealogy, and otherwise returns `FOCAL_ANCESTRY_UNRESOLVABLE`.
- Three outcomes are now distinct: `FOCAL_LINEAGE_RESOLVED`,
  `FOCAL_LINEAGE_EXTINCT`, `FOCAL_ANCESTRY_UNRESOLVABLE`. The revision-4
  `FOCAL_LINEAGE_UNAVAILABLE`, which asserted absence, is gone.
- `src/main.js` creates the maintained channels in `loadDefiningFixture()` and
  reports the unresolvable case as "cannot be established", never as extinction.

**Revision-5 result** — verified against a **separately constructed**, continuously
propagated reference observer at every generation the order names:

| generation | maintained members | reference members | ids match | totals match | bounded | revision-4 resolver |
|---|---:|---:|---|---|---|---:|
| 12 | 93 | 93 | yes | yes | yes | 93 |
| 360 | 261 | 261 | yes | yes | yes | 261 |
| 361 | 298 | 298 | yes | yes | yes | 298 |
| 400 | 270 | 270 | yes | yes | yes | **0** |
| 800 | 278 | 278 | yes | yes | yes | **0** |
| 1000 | 286 | 286 | yes | yes | yes | **0** |

Both focal sets checked at every mark. Canonical biological bytes at generation 400
are byte-identical to the same world advanced with no observer at all.

**Committed regression test** — `test/focal-lineage-retention.test.js`, 11 tests.

*Two corrections to my own work.* My first version read the maintained total after
the run finished rather than at each sampled generation, so pruned ids produced
`NaN`. And I initially asserted `FOCAL_LINEAGE_EXTINCT` for a founder id that is not
an individual at all; that was wrong — an id with no record cannot be established in
either direction, so `UNRESOLVABLE` is correct there, and claiming extinction would
be the same class of overclaim this repair removes. Both were my test bugs, not
production bugs.

---

## R5-2 / BUG 2 — Concurrent fixture loads left legibility mode on a non-baseline world (MEDIUM-CRITICAL)

Contract §22.

**Reproduce** — deferred promises controlling completion order:

```
start older "fixture + webbing override" load
→ enter legibility mode, starting a second load
→ resolve the legibility load first
→ verify mode=legibility and exact baseline=true
→ resolve the older high-webbing load last
```

**Observed on revision 4** — matching the auditor's falsifier verbatim:

```
manualTestMode: legibility
worldSource: defining_fixture
isBaselineFixtureActive(): false
olderRequestOverwroteNewerModeWorld: true
```

The mode and the source marker both claimed the defining fixture while the
biological bytes held the high-webbing override, so the prescribed device test could
run against the wrong world on a reachable UI history. A second race let a stale
fixture response replace a newer random world while the seed label kept the reset
seed.

**Repair** — `src/main.js`:

- `beginWorldChange()` issues a monotonic token; `isCurrentWorldChange(token)` says
  whether it is still the newest.
- `loadDefiningFixture()` performs all I/O first and then crosses an explicit
  **COMMIT GATE**. A superseded request returns having touched nothing: not
  biology, not `worldSource`, not the test mode, not the seed label, not tracer
  state, not the fixture variant — and not even the error message.
- `resetRandomWorld()` claims a token, so a synchronous reset invalidates in-flight
  loads.
- `setManualTestMode()` opens the transaction, threads its token through
  `ensureBaselineFixtureActive()`, and re-checks after awaiting.

**Revision-5 result**

| case | outcome |
|---|---|
| legibility resolves first, older high-webbing last | baseline still exact |
| legibility load, then reset to seed 99, fixture resolves late | random world, seed 99, mode null |
| two variants, reverse resolution order | newest requested wins |
| same in the opposite direction | newest requested wins |
| FAILED stale request | newer world intact, no error written |
| REJECTED stale request | newer world intact, no error written |
| current request's genuine failure | reported, and no mode entered |
| three concurrent loads, all 6 completion permutations | newest wins in every one |

**Committed regression test** — `test/world-load-race.test.js`, 7 tests.

---

## R5-3 / BUG 4 — Model identity was optional on canonical state (MEDIUM)

Contract §§18, 21.7.

**Reproduce**

```bash
node -e '... serialize a state, delete modelIdentityHash from the bytes,
          deserialize twice, advance one copy under the official config and the
          other under capacities [90,90,90] with the SAME version string ...'
```

**Observed on revision 4**

```
modelIdentityHash present in canonical bytes: true
schemaVersion after strip: lineage-biological-state-1
stored identity on deserialized state: undefined
official population after one generation: 141
altered  population after one generation: 165
mismatch rejection: NONE
same configVersion: true lineage-m1-config-2
```

The guard ran only when `state.modelIdentityHash !== undefined`, so it protected
newly constructed states and nothing else.

**Repair** — three holes, all closed:

1. `assertConfigMatchesState()` is unconditional. It rejects missing, `undefined`,
   `null`, empty, malformed (wrong length, uppercase, non-hex) and unknown digests
   as well as mismatches, **before** any RNG draw, counter, event, population change
   or canonical mutation.
2. `canonicalStringify()` now **throws** on an `undefined` property instead of
   silently skipping it. That silence was how the bytes lost the field in the first
   place, despite the function's own doc claiming undefined was rejected.
3. `deserializeCanonicalBiology()` refuses bytes with an unusable identity or an
   older schema. The biological schema is bumped to `lineage-biological-state-2`, so
   a pre-identity state is rejected **by version** rather than accepted.

**Revision-5 result** — every invalid case rejected with state provably untouched
(canonical bytes, RNG, generation, population, all five counters, all four event
arrays):

```
missing (deleted)        rejected  state untouched  missing model identity
undefined                rejected  state untouched  missing model identity
null                     rejected  state untouched  missing model identity
empty string             rejected  state untouched  missing model identity
malformed (short)        rejected  state untouched  malformed model identity
malformed (uppercase)    rejected  state untouched  malformed model identity
malformed (non-hex)      rejected  state untouched  malformed model identity
unknown digest           rejected  state untouched  model mismatch
valid, altered model     rejected  state untouched  model mismatch
```

and the legitimate path still advances (population 141 at generation 1).

**Committed regression test** — `test/model-hash-provenance.test.js`, tests 6–11.

---

## R5-4 / BUG 3 — Two different model hashes under one field name (MEDIUM-CRITICAL)

Contract §§9, 18.

**Reproduce**

```bash
python3 -c "
import json
for f in ['fixture-results.json','characterization-results.json',
          'edge-only-traversal-results.json','meaningful-trait-gate.json']:
    print(f, json.load(open('audit/'+f))['modelDefinitionHash'])"
```

**Observed on revision 4**

```
fixture-results.json              dc444865163deb32a7a9d80bd23f576d1ab5a936896298b5cd13faac6f513b3d
characterization-results.json     dc444865163deb32a7a9d80bd23f576d1ab5a936896298b5cd13faac6f513b3d
edge-only-traversal-results.json  dc444865163deb32a7a9d80bd23f576d1ab5a936896298b5cd13faac6f513b3d
meaningful-trait-gate.json        432391e5929bfeebf09d0c7f7b8408614fcb17a1e2e48407547c5191930e68a5
```

Three files hashed the canonical 2,995-byte text; the §9 trait evidence hashed
`JSON.stringify(modelDefinitionFor(...))`, a different 1,793-byte text. Both fields
were named `modelDefinitionHash`, so a consumer could not establish from the named
field that all required evidence belonged to one model.

**Repair**

- `src/config/modelIdentity.js` — the single place the model definition is
  serialized for identity: `canonicalModelDefinitionText()`,
  `modelIdentityDigest()`, `isWellFormedModelIdentity()`. Pure and browser-safe.
- `src/config/modelIdentityNode.js` — the single SHA-256 form:
  `modelDefinitionHash(config)` and the explicitly nonauthoritative
  `tuningConfigHash(config)`. Node-only, never in the browser import graph.
- All four evidence generators call it. `modelConfig.js` delegates;
  `modelDefinition.js`'s duplicate digest is removed.

**Revision-5 result** — the published identity is **unchanged**:
`dc444865163deb32a7a9d80bd23f576d1ab5a936896298b5cd13faac6f513b3d`, and the runtime
FNV identity is **unchanged** at `69dee399ec8a50cc7e1231959d2e31af`.

I deliberately preserved the revision-4 digest algorithm byte-for-byte when moving
it. My first version added a diffusion pass, which changed the runtime identity to
`803ccf3e…` — and since `modelIdentityHash` is part of canonical biological state,
that would have moved the fixture and observer-invariance hashes for no contract
reason. The move changes location, not values.

**Committed regression test** — `test/model-hash-provenance.test.js`, tests 1–5,
including a scan that fails if any file outside the two identity modules serializes
or hashes the model.

---

## R5-5 / BUG 5 — Node process heap published as the desktop Canvas memory measure (MEDIUM)

Contract §22.

**Observed on revision 4** — structural, confirmed by reading
`measureHeadlessReference()`:

```
required subject:     browser Canvas probe over 180 generations
implemented fallback: Node biological state over 180 generations
reported field:       "authoritative" desktop Canvas memory across the run
```

That function creates no browser, Canvas, DOM, renderer, frame meter, tracer UI or
browser heap. It measures a different process, heap and object graph. The
revision-4 test asserted `authoritativeChannel === "node:process.memoryUsage()"`,
so the oracle validated the substitution instead of constraining the contract
subject.

**Repair** — two separately named results, neither able to stand in for the other:

- `desktopCanvasMemory` — the §22 subject. The only browser-side channel is probed
  each run by allocating 320 MB in the page. When the reading does not move the
  result is `status: "UNVERIFIED"`, `reason: "no reliable supported measurement
  channel"`, `deltaBytes: null`, with the probe recorded. When it does move, the
  result carries browser, API, included memory domains, generation interval,
  sampling procedure and limitations, as the order requires.
- `nodeSimulationHeap` — a separate diagnostic, `classification:
  "NODE_SIMULATION_HEAP"`, `measuresCanvasOrBrowserMemory: false`.

**Revision-5 result**

```
DESKTOP_CANVAS_MEMORY: UNVERIFIED (no reliable supported measurement channel)
NODE_SIMULATION_HEAP (separate diagnostic): heapUsed delta 50,810,784 bytes,
                                           retainedGenealogy 22,470
```

No numeric PASS is manufactured for an unmeasured subject. The gate row reads
`UNVERIFIED`, sourced from the raw JSON.

**Committed regression tests** — `test/desktop-measurement-reproducibility.test.js`
(rewritten to constrain the contract subject rather than the substitution) and the
`desktopCanvasMemory` gate in `tools/gateRegistry.mjs`, which is declared external
with a fixed non-passing status.

---

## R5-6 / BUG 6 — Report bytes depended on the verifier's Node version (MEDIUM)

Contract §26.

**Reproduce**

```bash
/opt/node20/bin/node --test test/report-integrity.test.js
```

**Observed on revision 4**

```
not ok 1 - §26 — the committed report is exactly what the generator produces
# pass 12
# fail 1

would render: | Node · platform | v20.20.2 · linux x64 |
committed:    | Node · platform | v22.22.2 · linux x64 |
```

The auditor observed the same on Node v24.14.0 (248 passed, 1 failed). All three
runtimes satisfy the declared `node >=18`, so a clean supported environment could
not run the advertised build-blocking suite without first rewriting the report.

**Repair — support stays at `>=18`.** The code requires nothing narrower: it uses
only stable built-ins and `node:test`. Pinning an exact runtime to preserve an
embedded version line would be fixing the artifact to suit the bug. Instead the
verifier's runtime is removed from the report bytes:

- `tools/writeBuildEnvironment.mjs` (`npm run audit:environment`) records the
  **official evidence run's** environment into `audit/build-environment.json`.
- The report reads that file. Its rows are now `Evidence-run runtime` and
  `Declared runtime support`, both from committed evidence.
- `tools/runRuntimeMatrix.mjs` (`npm run audit:runtime-matrix`) renders the report
  under every Node major available and hashes the result, writing
  `audit/runtime-matrix.json`.

**Revision-5 result** — recorded in `audit/runtime-matrix.json`; see the runtime
matrix in `FINAL_REPORT.md`. The claim evidenced is narrow and checkable: rendering
produces **identical bytes** on every major tested, given unchanged committed
evidence. What is *not* claimed is that the full 200-seed suite ran on every major;
the determinism-critical files did, and the full suite's runtime is in
`audit/build-environment.json`.

**Committed regression test** — `test/report-determinism.test.js`, 4 tests,
including one asserting `engines.node === ">=18"` so support cannot be narrowed to
paper over a determinism bug.

---

## R5-7 / BUG 7 — A failing suite still produced hardcoded feature passes (MEDIUM)

Contract §§20, 26, 28.

**Reproduce**

```bash
# change the committed TAP summary from 249/249 to 248/249 and regenerate
python3 - <<'EOF'
p="audit/test-results.txt"; s=open(p).read()
open(p,'w').write(s.replace("# pass 249","# pass 248",1).replace("# fail 0","# fail 1",1))
EOF
npm run report:final
grep -n "Full test suite\|Birth immutability\|Canonical model identity\|reproducible" FINAL_REPORT.md
```

**Observed on revision 4**

```
| 1 | Full test suite | §20 | **FAIL** — 1 of 249 failing |
| 9 | Birth immutability | §20.1 | **PASS** |
| 25 | Canonical model identity binds state progression | §18 / §21.7 | **PASS** |
| every automated result reproducible from a clean run | met — 248/249 from clean |
```

Only gate 1 was derived. Every feature row was a literal `**PASS**`, and the
completion table emitted `met` regardless of the failure count, so the report could
contradict itself and preserve a feature-level PASS while that feature's own test
was the one that failed.

**Repair**

- `tools/gateRegistry.mjs` declares, for every gate, the **named tests** that
  evidence it.
- `parseTap()` records per-test pass/fail, so a gate's status is attributed:
  `PASS` (all mapped tests ran and passed), `FAIL` (any mapped test failed),
  `UNVERIFIED` (no result observed, or the suite has a failure that cannot be
  attributed to any gate).
- Gates that are not test-evidenced — the physical iPad gate, the Stage A process
  order, the unverified Canvas memory measure — are declared `external` with a
  fixed non-passing status. They are never derived and can never read `PASS`.
- The §28 completion row is derived: `met` requires a fully green suite **and**
  every derived gate passing.
- `audit/gate-summary.json` is the machine-readable form, generated from the same
  call that renders the table.

**Revision-5 result — controlled failure injection.** See
"Failure injection" below for the exact before/after.

**Committed regression tests** — `test/report-integrity.test.js`, extended with
per-gate failure-injection cases.

---

## R5-8 / BUG 8 — A test mutated shared production source under concurrent execution (MEDIUM)

Contract §20.

**Reproduce** — sample `src/core/math.js` continuously while the test runs:

```bash
(while :; do head -1 src/core/math.js; done | uniq) &
node --test test/report-integrity.test.js
```

**Observed on revision 4**

```
OBSERVED: // @ts-check
OBSERVED: import { zoneBinCounts } from "../observer/currentZoneBins.js";
OBSERVED: // @ts-check
OBSERVED: import x from "some-npm-package";
OBSERVED: // @ts-check
OBSERVED: const r = Math.random();
OBSERVED: // @ts-check
```

`some-npm-package` does not exist. `node --test` runs test files in concurrent
worker processes over one shared tree, so another worker importing that file
mid-plant would fail on module resolution. The `finally` restore protects one
process's own path and provides no cross-process exclusion.

**Repair**

- `selfAuditScans(root)` is root-parameterised. The teeth test copies `src/` into a
  temporary directory and plants there; nothing writes to the production tree.
- The scanner reads **code, not prose**. Revision 4 matched raw file text, so a doc
  comment merely *naming* a forbidden token was reported as a violation — which is
  why earlier revisions had to reword comments to appease it. `stripComments()` and
  `stripCommentsAndStrings()` separate use from mention.
  - Token scans use comments **and** strings stripped.
  - Import scans use comments stripped and strings **kept** — erasing string
    contents also erases the module specifier, so `from "../observer/x.js"` becomes
    `from ""` and no import can be detected. My first version made that mistake and
    the planted-violation test silently detected nothing.
- `tools/proveTreeIntegrity.mjs` (`npm run audit:tree-integrity`) runs the full
  suite repeatedly at high concurrency while continuously sampling every file under
  `src/`, and records every deviation into `audit/tree-integrity.json`. The
  invariant is checked **at every instant**, not merely before and after.

**Committed regression tests** — `test/test-tree-integrity.test.js`, 5 tests,
including a static check that no test file passes a ROOT-derived path to a write
API.

*Correction to my own work.* My first version of that static check inspected
argument 1 unconditionally, and so flagged its own legitimate
`cpSync(join(ROOT, "src"), join(dir, "src"))` — a *read* from ROOT. For
`cpSync`/`copyFileSync`/`renameSync` the destination is argument 2. The check was
wrong, not the code.

---

## R5-9 / BUG 9 — The advertised immutable generation result was shallowly mutable (MEDIUM-MINOR)

Contract §4.

**Reproduce**

```bash
node -e '... advanceGenerationAndCollect, then r.observerErrors.push({...}) ...'
```

**Observed on revision 4**

```
outer result frozen: true | births frozen: true | livingIds frozen: true
observerErrors frozen: false
external push succeeded: true -> 1 entries
forged entry visible on state: FORGED
```

The same object is attached to `state.lastGenerationResult`, so a consumer could
add, remove or replace observer failure records after the generation completed and
thereby forge the diagnostic result.

**Repair** — `src/core/simulation.js` collects errors into a local array and
assembles the result **frozen**, with every error record frozen. Nothing mutable is
ever exposed.

**Revision-5 result** — under strict mode (ESM), all twelve mutation attempts throw
`TypeError` and no value changes:

```
push / pop / replace entry / mutate field / add field / delete field
replace the array / push onto births / mutate a birth / mutate livingIds
replace generation / add a field to the result
```

**Committed regression test** — `test/generation-result-immutable.test.js`, 5 tests.

---

## Failure injection (R5-7 proof)

The derivation is a pure function of a parsed run, so injection happens in memory —
nothing is written to disk and no evidence file is doctored.

`test/report-integrity.test.js` builds a **synthetic fully-green run** from the
registry itself, then falsifies it one gate at a time. For **every** test-evidenced
gate it flips exactly one of that gate's declared tests to failing and requires:

```
that gate's row            PASS -> FAIL
the failing test           named in the row
the full-suite row         FAIL
§28 completion claim       "met" -> "NOT met"
```

Three further controlled cases:

| Injection | Required outcome |
|---|---|
| a failing test **no gate declares** | every test-evidenced gate degrades to `UNVERIFIED`; none may keep a PASS this run cannot support |
| a gate's evidencing test **absent from the run** | that gate reads `UNVERIFIED` and names the missing test; never `PASS` |
| a fully-green run | externally determined gates *still* do not read `PASS` — `ipadGate` stays `PENDING_HUMAN_DEVICE_TEST`, `desktopCanvasMemory` stays `UNVERIFIED`, `stageAOrder` stays `VIOLATED` |

*A brittleness I introduced and fixed.* My first version derived the baseline from the
**committed** results file, so the injection tests failed during the tree-integrity
rounds — when that file legitimately carried failures. Deriving the baseline from the
registry makes each injection a controlled experiment on the derivation logic, which
is the thing under test.

The revision-4 behaviour, for comparison, reproduced by editing the committed TAP
summary to 248/249 and regenerating:

```
| 1  | Full test suite                        | §20        | **FAIL** — 1 of 249 failing |
| 9  | Birth immutability                     | §20.1      | **PASS** |
| 25 | Canonical model identity binds state…  | §18/§21.7  | **PASS** |
| every automated result reproducible from a clean run | met — 248/249 from clean |
```

---

## Source-tree integrity (R5-8 proof)

`npm run audit:tree-integrity` runs the full suite repeatedly at high concurrency
while continuously sampling every file under `src/`. The invariant is checked **at
every instant**, not before and after.

| Field | Value |
|---|---:|
| full-suite rounds | 2 |
| test-file concurrency | 4 |
| files watched | 31 |
| samples taken | 712,760 |
| **deviations observed** | **0** |
| tree unchanged throughout | **True** |
| baseline digest | `304ef686f17b37eec59ebd8d71f28cdd…` |
| final digest | `304ef686f17b37eec59ebd8d71f28cdd…` |

Revision 4 would fail this. A watcher during its suite observed `src/core/math.js`
cycling through three planted variants, one of them importing a package that does not
exist.

The rounds themselves reported failures — the report/gate-consistency tests, because
the report and the results file were mid-convergence during those rounds. That is
recorded in `audit/tree-integrity.json` under `runs`, and it does not affect the
tree-integrity claim, which is about file mutation.

---

## Runtime matrix (R5-6 proof)

Figures below are the final revision-5 run, `audit/runtime-matrix.json`.

| Runtime | Major | Rendered report SHA-256 | Matches committed | Determinism tests |
|---|---:|---|---|---|
| `v20.20.2` | 20 | `14fc43dd9078671d3f29b45746c30e1d…` | True | 62 / 62, 0 failing |
| `v21.7.3` | 21 | `14fc43dd9078671d3f29b45746c30e1d…` | True | 62 / 62, 0 failing |
| `v22.22.2` | 22 | `14fc43dd9078671d3f29b45746c30e1d…` | True | 62 / 62, 0 failing |

| Field | Value |
|---|---|
| distinct rendered hashes | **1** |
| report bytes runtime-independent | **True** |
| all runtimes match the committed report | **True** |
| declared support | `node >=18`, **unchanged** |

What this does **not** claim: that the full 200-seed suite ran on every major. Only
the determinism-critical files did; the full suite's runtime is recorded in
`audit/build-environment.json`.

---

## Non-regression

The revision-5 repairs touch observer retention, world-load transactions, identity
binding, memory classification, report generation and test isolation. None is a
biological change, and the fully regenerated evidence confirms the biology did not
move:

| Measure | Revision 4 | Revision 5 |
|---|---|---|
| §19.3 canopy Δ | −0.383874 | −0.383874 |
| §19.3 shoreline Δ | +0.325326 | +0.325326 |
| §19.4 canopy successes | 200 / 200 | 200 / 200 |
| §19.4 shoreline successes | 197 / 200 | 197 / 200 |
| §19.4 medians (canopy low / high) | 29.3652 / 0.3605 | 29.3652 / 0.3605 |
| §19.4 medians (shoreline low / high) | 18.2986 / 43.7529 | 18.2986 / 43.7529 |
| config-2 median population | 256 | 256 |
| config-2 median zone loads | 117.22 / 108.18 / 30.53 | 117.22 / 108.18 / 30.53 |
| config-2 median concentration | 0.4686 | 0.4686 |
| config-1 median population | 421 (FAIL) | 421 (FAIL) |
| edge-only reaches | 500/500 both directions | 500/500 both directions |
| edge-only median first generation | 3 | 3 |
| authoritative `modelDefinitionHash` | `dc444865…` | `dc444865…` |
| runtime model identity | `69dee399…` | `69dee399…` |
| fixture SHA-256 | matches the frozen value | matches the frozen value |
| quarantined Python references | all unchanged | all unchanged |

**Numerical and structural changes that DID occur, and why:**

| Value | Revision 4 | Revision 5 | Reason |
|---|---|---|---|
| biological schema version | `lineage-biological-state-1` | `lineage-biological-state-2` | R5-3: carrying a complete model identity is now part of the schema, so a pre-identity state is rejected by version |
| `audit/meaningful-trait-gate.json` → `modelDefinitionHash` | `432391e5…` | `dc444865…` | R5-4: that file used a different serialization; it now uses the one authoritative function |
| desktop memory fields | one `memoryAcrossAdvance` with a Node channel called authoritative | `desktopCanvasMemory` (UNVERIFIED) and `nodeSimulationHeap` | R5-5: the §22 subject and a Node diagnostic are different things |
| report runtime row | live `process.version` | evidence-run runtime from `audit/build-environment.json` | R5-6 |
| report gate rows | literal `PASS` per feature | derived from named test results | R5-7 |
| focal-lineage outcome names | `FOCAL_LINEAGE_UNAVAILABLE` | `RESOLVED` / `EXTINCT` / `FOCAL_ANCESTRY_UNRESOLVABLE` | R5-1: the single name asserted absence it had not established |

The schema bump is the only change that alters canonical bytes, and it is deliberate.
The two model hashes are unchanged, which is why the fixture and observer-invariance
evidence reproduces exactly.

---

## Files added or changed in revision 5

**Production**

- `src/config/modelIdentity.js` — **new**, the one canonical model text and runtime digest
- `src/config/modelIdentityNode.js` — **new**, the one SHA-256 model identity
- `src/config/modelConfig.js` — delegates to the above; schema bumped to `-2`
- `src/config/modelDefinition.js` — duplicate digest removed
- `src/core/simulation.js` — mandatory identity guard; deeply frozen result
- `src/core/canonicalSerialize.js` — total serialization; throws on undefined
- `src/fixtures/definingFixtureV1.js` — strict deserialization
- `src/observer/tracerChannels.js` — maintained focal channels, three outcomes, trustworthy-zero reporting
- `src/main.js` — world-change tokens and commit gate; maintained channels at world creation

**Tooling**

- `tools/gateRegistry.mjs` — **new**, gate-to-test mapping and status derivation
- `tools/writeBuildEnvironment.mjs` — **new**, committed evidence-run environment
- `tools/runRuntimeMatrix.mjs` — **new**, cross-runtime report determinism
- `tools/proveTreeIntegrity.mjs` — **new**, concurrent source-tree integrity proof
- `tools/writeFinalReport.mjs` — derived gates, committed environment, two memory results, code-not-prose scanner
- `tools/measureDesktop.mjs` — honest Canvas/Node memory classification
- `tools/runFixture.mjs`, `tools/runCharacterization.mjs`, `tools/runEdgeOnlyTraversal.mjs`, `tools/writeAuditEvidence.mjs` — one authoritative hash

**Tests (new, all committed)**

- `test/focal-lineage-retention.test.js`
- `test/world-load-race.test.js`
- `test/model-hash-provenance.test.js`
- `test/generation-result-immutable.test.js`
- `test/test-tree-integrity.test.js`
- `test/report-determinism.test.js`

**Tests (extended)** — `test/report-integrity.test.js`,
`test/defining-fixture-snapshot.test.js`,
`test/desktop-measurement-reproducibility.test.js`
