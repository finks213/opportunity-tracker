# LINEAGE M1 — Revision-4 Repair Record

Required by the revision-4 delivery specification. One section per verified
defect, with the command used to reproduce it, the observed revision-3 result,
the repair, the revision-4 result, and the regression test.

Authority: `LINEAGE_M1_WORLD_MODEL_CONTRACT_v3_3` (binding).
Status during and after this pass:

```
M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED
PROCESS WAIVER: PENDING PRINCIPAL DECISION
IPAD TEST:      PENDING_HUMAN_DEVICE_TEST
```

Inputs: the AFE-Δ revision-3 implementation BREAK-REPORT and
`LINEAGE_M1_REV3_STRUCTURAL_AUDIT.md`. Both returned `BREAKS-FOUND`; both were
read as primary evidence, not only through the consolidated repair order.

Method for every defect, without exception:

1. reproduce independently and record the exact command and its output;
2. repair the production code, not the test;
3. add a regression test and **verify it fails against revision 3** by
   temporarily reinstating the revision-3 behaviour;
4. rerun the affected evidence generator;
5. verify unrelated results are unchanged, and document any numerical change.

Nothing here weakens a contract threshold, and no test was modified to bless
existing behaviour. Where a test I wrote turned out to encode my own wrong
expectation, that is stated as such.

**Preserved from revision 3, unchanged:** the biological lifecycle, the fixture
gates, the `tools/serve.mjs` containment repair, the isolated edge-only traversal
experiment, and the bounded long-run observer/genealogy memory. Those repairs are
materially real and revision 4 does not reopen them. The revision-4 additions are
checked against them in §"Non-regression" below.

---

## R4-1 — Generation advancement was not atomic against observer failure (HIGH)

Contract §§4, 16: observers must not be able to affect biology.

**Reproduce**

```bash
node -e '
const run = async () => {
  const { createInitialState } = await import("./src/core/individual.js");
  const { advanceGeneration } = await import("./src/core/simulation.js");
  const { currentModelConfig: C } = await import("./src/config/modelConfig.js");
  const { serializeCanonicalBiology } = await import("./src/core/canonicalSerialize.js");
  const clean = createInitialState(1, C); advanceGeneration(clean, C);
  const s = createInitialState(1, C);
  try { advanceGeneration(s, C, { onBirth: () => { throw new Error("observer boom"); } }); }
  catch (e) { console.log("threw out of the biological core:", e.message); }
  console.log("generation", s.generation, "population", s.currentIndividuals.length);
  console.log("gen-1 births", s.birthEvents.filter(b => b.generation === 1).length,
              "deaths", s.deathEvents.filter(e => e.generation === 1).length,
              "matings", s.biologicalMatingEvents.filter(e => e.generation === 1).length);
  console.log("bytes == untouched gen 0:", serializeCanonicalBiology(s) === serializeCanonicalBiology(createInitialState(1, C)));
  console.log("bytes == completed gen 1:", serializeCanonicalBiology(s) === serializeCanonicalBiology(clean));
};
run();'
```

**Observed on revision 3**

```
threw out of the biological core: observer boom
generation 0
population 120          (the old individuals)
gen-1 births 2   deaths 54   matings 1
bytes == untouched gen 0: false
bytes == completed gen 1: false
```

A torn world: partial generation-1 events recorded, the generation counter not
advanced, the population still the old one. An observer-layer exception could
corrupt canonical biological state — the exact thing §4 and §16 forbid.

**Cause** — `hooks.onBirth` was invoked *inside* the biological transaction, in
the birth loop.

**Repair** — `src/core/simulation.js`. Birth records are collected into a local
`birthRecords` array during the transaction and dispatched only after the commit
point, each call individually exception-isolated. Errors are recorded on
`state.lastGenerationResult.observerErrors`, which is outside canonical biology
(it is excluded from `canonicalBiologyObject`). Added
`advanceGenerationAndCollect(state, config)` for callers that want the records
without hooks at all.

**Revision-4 result** — the same command reports the observer error isolated,
`generation 1`, the new population, the full generation-1 event set, and
`bytes == completed gen 1: true`.

**Regression test** — `test/observer-transaction-integrity.test.js` (8 tests).
Throwing at the first, a middle, the final, and every birth; throwing from
`afterGeneration`; 25 consecutive generations with both hooks throwing; the
hook-free API compared byte-for-byte against the hook API; `runGenerations`
isolation; and a check that a well-behaved observer still receives every birth.
All 8 fail against revision 3.

---

## R4-2 — Focal lineage was reseeded rather than resolved (MEDIUM-CRITICAL)

Contract §16: observer state is derived; the observer never defines biology.

**Reproduce**

```bash
node -e '
const run = async () => {
  const { ProbeApp } = await import("./src/main.js");
  console.log("methods:", Object.getOwnPropertyNames(ProbeApp.prototype).filter(m => /lineage|tracer|focal/i.test(m)));
};
run();'
grep -n "slice(0, *[0-9]\+)" src/main.js
```

**Observed on revision 3** — the "follow the focal lineage" control created a
tracer channel from *the first N living individuals*, and the "new habitat group"
control did the same with a different slice. Neither resolved the actual
descendants of the focal founders: after any turnover the channel followed a
freshly picked set of animals while the UI still called it the focal lineage. A
tracer created at generation 10 reported contribution 0 with no explanation.

**Repair** — `src/observer/tracerChannels.js` gained
`resolveLivingDescendants(state, founderIds)`, a forward union pass over
`retainedGenealogy` sorted by `childId`, plus a `TracerFounderError` that rejects
founders that are not alive (`FOUNDERS_NOT_ALIVE`) and an empty founder set
(`EMPTY_FOUNDER_SET`). `src/main.js` now has `followFocalLineage()` (genealogy
resolved, returns `FOCAL_LINEAGE_UNAVAILABLE` rather than silently following
strangers) and a separately named `followNewHabitatGroup()`, dispatched through
`createTracer()`. An empty focal set means "follow nothing" — no channel is
created — rather than an error, so existing evidence generators keep working.

**Revision-4 result** — descent is verified by an independent backward
breadth-first search over **both** parents, and the resolver is additionally
checked for false negatives ("must not MISS a descendant").

**Regression test** — `test/focal-lineage-integrity.test.js` (11 tests) and 4
added cases in `test/probe-world-identity.test.js`. They fail against revision 3.

*Correction to my own work:* my first version of this test walked only
`parentIds[0]` and produced a false failure ("id 720 must trace back"). The test
was wrong, not the resolver. It was replaced with the two-parent BFS above.

---

## R4-3 — Canonical state was bound to the version label, not the model (MEDIUM)

Contract §§18, 21.7: a labelled world must be the world the label names.

**Reproduce**

```bash
node -e '
const run = async () => {
  const { createInitialState } = await import("./src/core/individual.js");
  const { advanceGeneration } = await import("./src/core/simulation.js");
  const { currentModelConfig } = await import("./src/config/modelConfig.js");
  const { deepClonePlain } = await import("./src/config/modelDefinition.js");
  const forged = deepClonePlain(currentModelConfig);
  forged.zoneCapacity = [200, 200, 200];   // same version string, different model
  const a = createInitialState(5, currentModelConfig);
  for (let i = 0; i < 40; i++) advanceGeneration(a, currentModelConfig);
  const b = createInitialState(5, currentModelConfig);
  for (let i = 0; i < 40; i++) advanceGeneration(b, forged);   // accepted?
  console.log("same configVersion:", a.configVersion === b.configVersion);
  console.log("populations:", a.currentIndividuals.length, b.currentIndividuals.length);
};
run();'
```

**Observed on revision 3** — accepted. Two different models produced two
different worlds under one identical `configVersion` label, because
`assertConfigMatchesState` compared only the version string.

**Repair** — `src/config/modelDefinition.js` gained `modelIdentityDigest()`, a
128-bit FNV-1a over the canonical model text using four interleaved 32-bit lanes
(isomorphic to the SHA-256 `modelDefinitionHash`, but computable without
`node:crypto` so the browser probe can carry it). `makeEmptyState` records
`modelIdentityHash`; `canonicalBiologyObject` includes it immediately after
`configVersion`; `assertConfigMatchesState` now rejects a mismatch of **either**
the version or the complete model identity, before any RNG draw, counter, event
or canonical byte changes.

**Revision-4 result** — the forged config is rejected with a `model mismatch`
error; a same-version-different-model call throws while leaving RNG state,
counters, events, population and canonical bytes untouched.

**Regression test** — `test/model-identity.test.js`, now 20 tests including the
same-version/different-model rejection and the isomorphism between the two hash
functions. The new cases fail against revision 3.

---

## R4-4 — Legibility mode trusted a flag instead of the world (MEDIUM-CRITICAL)

Contract §22: the legibility mode must present the defining fixture.

**Reproduce** — drive `load fixture → reset random → enter legibility` and check
which world is on screen.

**Observed on revision 3** — the mode checked `worldSource === "defining_fixture"`.
That flag is correct for the sequence revision 3 tested, but it is a *claim*
about the world rather than the world itself; nothing prevented the flag and the
canonical bytes from disagreeing.

**Repair** — `src/main.js` gained `baselineFixtureCanonicalBytes()`,
`isBaselineFixtureActive()` and `ensureBaselineFixtureActive()`. Entering
legibility mode now compares the live world's canonical bytes against the
fixture's and **rehydrates** when they differ, rather than asking a flag. The
required import of `serializeCanonicalBiology` was added.

**Revision-4 result** — the prescribed acceptance procedure cannot be run against
a different world: if the active bytes are not the fixture's, the mode replaces
them.

**Regression test** — `test/probe-world-identity.test.js` (12 tests), including a
case that sets `worldSource` to `"defining_fixture"` over a random world and
requires legibility mode to still show the fixture.

---

## R4-5 — Traversal plan, labels and raw evidence disagreed (MEDIUM)

Contract §21.6.

**Reproduce**

```bash
python3 -c "import json;print([k for k in json.load(
  open('audit/characterization-results.json'))['lifecycle'] if 'Reaches' in k])"
grep -n "implemented literally" CHARACTERIZATION_PLAN.md
```

**Observed on revision 3**

```
['canopyLineageReachesShoreline', 'shorelineLineageReachesCanopy']
139:  measure is now implemented literally: founder-band ancestry is carried per
```

Revision 3 built the correct isolated experiment, but (a) the raw JSON keys were
generic, so a reader of the raw file alone read the **mixed-world** measure as
the §21.6 result, and (b) `CHARACTERIZATION_PLAN.md` still asserted "the measure
is now implemented literally" — a claim already withdrawn in
`AUDIT_PACKAGE_MANIFEST.md`.

**Repair**

- `CHARACTERIZATION_PLAN.md`: the original text is left exactly as authored, with
  a bracketed pointer added, and a dated **Amendment 1 (2026-07-30)** appended.
  The amendment tabulates what each revision actually measured, lists the two
  withdrawn sentences, names the authoritative evidence, records the key
  renaming, and states explicitly that no threshold, seed set, duration,
  initializer, experiment or measured value changed. The plan was **not**
  rewritten as though the later implementation had always existed.
- Raw keys renamed: `lifecycle.additionalMixedWorldCanopyAncestryReachesShoreline`,
  `lifecycle.additionalMixedWorldShorelineAncestryReachesCanopy`, and the
  per-seed `firstAdditionalMixedWorld…` forms. Added
  `lifecycle.authoritativeTraversalEvidence` pointing at
  `audit/edge-only-traversal-results.json`, and
  `lifecycle.additionalMixedWorldNote` stating why the mixed world cannot carry
  the claim.
- Source comments in `tools/runCharacterization.mjs` now say what the measure is
  and is not.
- `CHARACTERIZATION.md` headings: "§21.6 adjacency traversal — AUTHORITATIVE
  isolated-world experiment" (first) and "Additional supporting measure —
  mixed-world single-band ancestry (NOT the §21.6 claim)" (second).
- `FINAL_REPORT.md` §6b does the same, generated from the raw files.

**Revision-4 result** — both 500-seed batches were rerun end to end under the new
key names. The measured values are unchanged: config-2 median population 256,
zone loads 117.22 / 108.18 / 30.53, concentration 0.4686, extinction 0.00%;
config-1 median population 421 (still FAIL, as required by D-009).

**Regression test** — `test/traversal-label-integrity.test.js` (6 tests). Two
fail against the revision-3 evidence files and one against the revision-3 plan;
the rest are non-regression coverage of the isolated experiment.

---

## R4-6 — FINAL_REPORT.md contradicted its own evidence (MEDIUM-CRITICAL)

Contract §§26, 27, 28.

**Reproduce**

```bash
grep -n "Config hash" FINAL_REPORT.md
sed -n '35,58p' FINAL_REPORT.md
grep -o "119 tests" FINAL_REPORT.md | head -1 ; grep "^# tests" audit/test-results.txt
```

**Observed on revision 3**

```
54:- Config hash: `edb81695973b81ab8f87f7ef9dde9d8c5b3d4c7dfbeb45f385547edd86ee86de`
```

- lines 51–57 were a **duplicated** build-identity block, and the duplicate
  published `edb81695…` as "Config hash" — the very hash that line 141 of the
  same report labels "the tuning config only", with `modelDefinitionHash` named
  as the complete one. The report contradicted itself about which hash
  identifies the model.
- the gate table said `119 tests … 119/119` while the raw TAP summary in the same
  bundle said `# tests 172`.
- the memory paragraph published a browser `performance.memory` delta as
  memory-growth evidence, from a channel never probed for resolution.

**Repair**

- `tools/writeFinalReport.mjs` generates the whole report from
  `audit/*.json`, `audit/test-results.txt` and `src/config/milestoneStatus.js`.
  One command: `npm run report:final`.
- `src/config/milestoneStatus.js` is the single source of truth for the status,
  the forbidden statuses, and `mayDeclareCompletion: false`. It also fixes the
  hash labels: `modelDefinitionHash` **authoritative**, `tuningConfigHash`
  **NONAUTHORITATIVE** with the reason stated inline.
- suite counts are **read** from the TAP summary, never restated. If the runner
  reported failures, the generated report says `FAIL`; if the summary cannot be
  parsed, it says `INCONCLUSIVE`.
- two measurements that had been hand-typed are now emitted as raw evidence:
  `audit/meaningful-trait-gate.json` (the §9/§20.5 three-zone deltas and the
  §20.4 neutral maxima) and `fixture-results.json → exactProbabilityGate` (the
  §19.3 probe values).

**Revision-4 result** — the report contains exactly one build-identity block, no
bare "Config hash:" line, the raw TAP counts, and a memory section whose
authoritative channel is `process.memoryUsage()`.

**Regression test** — `test/report-integrity.test.js` (12 tests). The strongest
assertion is byte equality between the committed `FINAL_REPORT.md` and a fresh
`renderFinalReport()`, so any hand edit fails the build. The rest check the TAP
counts, the hash labelling, the single identity block, the status source, the
§19.3 and §9 numbers **re-derived from the production survival path**, the
guardrail and named-limitation figures re-derived from the per-seed records,
agreement between `FINAL_REPORT.md` and `CHARACTERIZATION.md`, the desktop JSON
values, the traversal attribution, and two-way agreement between the manifest's
evidence list and the actual contents of `audit/`.

---

## R4-7 — The desktop measurement was unreproducible; jitter pruning compared counts (MEDIUM-CRITICAL)

Contract §22.

### R4-7a — unreproducible desktop evidence

**Reproduce (against the revision-3 bundle)**

```bash
grep -rl playwright package.json tools/     # (no matches)
ls package-lock.json                        # No such file or directory
npm run | grep -i desktop                   # (no script)
python3 -c "import json;m=json.load(open('audit/desktop-measurements.json'));
print(m['normalMode']['status']); print(m['normalMode']['populationAfter180Generations'])"
```

**Observed on revision 3**

```
(no playwright reference anywhere in the repository)
ls: cannot access 'package-lock.json': No such file or directory
(no audit:desktop script; tools/ contains no measureDesktop.mjs)
defining fixture · generation 181 · 234 living · canopy 118 · forest floor 116 · shoreline 0
234
```

The evidence could be read but not regenerated, and `populationAfter180Generations`
was in fact the population at generation **181**. Confirmed by an independent
Node run:

```
gen 180 pop 224 bins 118/106/0
gen 181 pop 234 bins 118/116/0     <- matches the revision-3 status line exactly
```

**Repair** — `tools/measureDesktop.mjs`, run by `npm run audit:desktop`:

| Requirement | How it is met |
|---|---|
| exact script | `tools/measureDesktop.mjs`, committed |
| browser dependency and version | `playwright` devDependency; the measured Chromium build is recorded in the output |
| lockfile | `package-lock.json` with the exact version, `resolved` URL and `integrity` hash |
| server startup and shutdown | the tool starts and stops its own ephemeral loopback server via `createStaticServer(ROOT)` |
| fixed viewport | 1280 × 800, `deviceScaleFactor` 1 |
| fixed seed | `measurementSeed` 1 (biology), probe default 1 (`uiRng`) |
| fixed modes | normal, then render-stress |
| fixed frame sample rules | frozen warm-up and sample windows; the meter discards frames inside warm-up |
| fixed generation-count semantics | `generationSemantics` block: gen 0 → N transitions → gen N, stated in the file |
| output schema | `lineage-m1-desktop-measurement-3` |
| one clean command | `npm run audit:desktop` |

Two additions beyond the requirement, both because a browser number should not be
taken on trust:

- **`headlessCrossCheck`** — the tool also runs the same fixture, seed and
  transition count in Node and compares generation, population and zone bins.
  The committed run reports `browserAgreesWithHeadless: true` (population 224,
  bins canopy 118 / forest floor 106 / shoreline 0). The desktop evidence is now
  verifiable without a browser.
- **a `performance.memory` resolution probe** — see R4-7c.

### R4-7b — the glyph count was asserted, not measured

`src/main.js` `renderStress()` now counts the glyphs it actually draws into
`lastRenderedGlyphCount`, and the tool records `renderedGlyphCount: 360` with
`glyphCountMatchesDeclaration: true` rather than restating the constant 360.

### R4-7c — browser memory growth was published from an unverified channel

**Reproduce**

```bash
node -e 'import("playwright").then(async ({chromium}) => {
  const b = await chromium.launch({headless:true}); const p = await b.newPage();
  await p.goto("about:blank");
  console.log(JSON.stringify(await p.evaluate(() => {
    const out = [performance.memory.usedJSHeapSize];
    globalThis.hold = [];
    for (let i=0;i<40;i++) globalThis.hold.push(new Float64Array(1e6));   // ~320 MB
    out.push(performance.memory.usedJSHeapSize);
    return {out, total: performance.memory.totalJSHeapSize};
  })));
  await b.close();
})'
```

**Observed**

```
{"out":[10000000,10000000],"total":10000000}
```

Allocating ~320 MB moves `usedJSHeapSize` not at all: this Chromium build
quantizes it to a fixed constant without cross-origin isolation. Any browser-side
delta from it — including zero — carries no information.

**Repair** — the tool performs that probe in-page on every run and reports
`memoryAcrossAdvance.browser.usable`. When the probe fails, `deltaBytes` is
`null` and the note reads `WITHDRAWN AS EVIDENCE`; the authoritative channel is
`node:process.memoryUsage()`, reported alongside exact, quantization-free
retained-record counts. `readMemory()` in `src/debug/desktopMeasure.js` no longer
returns `available: true`; it returns `exposed` plus `resolutionVerified: false`
and a caveat, because API presence is not resolution.

*Scope of the criticism, stated precisely:* the revision-3 run recorded
non-round heap values (3,759,944 → 16,290,684) on a different Chromium build
(UA `141.0.0.0` vs `141.0.7390.37`), so its channel may well have been
responsive. The defect is that revision 3 published the figure **without
verifying the channel**, and that the same code path yields a meaningless zero on
the build available now. The probe makes the answer per-run and explicit instead
of assumed.

### R4-7d — jitter pruning compared counts, not membership

**Reproduce**

```bash
# revision-3 pruneJitterTo opened with: if (this.jitter.size <= rendered.length) return 0;
cached {1,2}    rendered {3,4}      -> removed 0, jitter.size 4    (expected 2 / 0)
cached {1..50}  rendered {51..110}  -> removed 0, jitter.size 110  (expected 50 / 0)
```

Equal or smaller cache size does not imply equal membership, so stale ids
accumulated exactly when the population held steady while membership turned over
— the normal case for an overlapping-generation lifecycle.

**Repair** — the shortcut is removed; `pruneJitterTo` always prunes by set
membership.

**Revision-4 result and regression test** —
`test/canvas-jitter-membership.test.js` (9 tests) and
`test/desktop-measurement-reproducibility.test.js` (10 tests), all passing.

Verified discrimination, by temporarily reinstating the revision-3 shortcut and
re-running the jitter file (**6 pass, 3 fail**):

| Test | Against revision 3 |
|---|---|
| equal counts, disjoint membership | **FAIL** |
| cache smaller than the rendered set | **FAIL** |
| duplicate rendered ids | **FAIL** |
| cache larger than the rendered set | pass |
| partial overlap | pass |
| empty rendered set | pass |
| empty cache and empty rendered set | pass |
| repeated / idempotent pruning | pass |
| steady population, complete turnover | pass |

The six that pass are non-regression coverage: the shortcut never fired in those
shapes. This is stated rather than claiming the whole file discriminates — the
header of that test file says the same.

---

## R4-9 — Eight additional defects found by my own verification (in neither audit report)

Recorded because §28 requires remaining uncertainty to be named, and because
finding these while verifying the eight ordered repairs is evidence about the
build, not a footnote. None was reported by an auditor.

### R4-9a — The evidence capture could never satisfy the integrity test

`npm test | tee audit/test-results.txt` truncates the results file the instant the
run begins. `report-integrity.test.js` reads that file at import time, so it was
comparing `FINAL_REPORT.md` against a half-written record of *the run currently
executing it* — a check that could not pass and whose failure said nothing about
whether the report was right.

**Repair** — `tools/runTests.mjs` (`npm run audit:tests`) writes to
`audit/test-results.txt.partial` and renames it over the published file only after
the suite exits. During a run, the integrity test therefore compares the report
against the last **complete** run, which is the pair an auditor receives. The tool
prints the next step when the pair is not yet consistent.

*Honest note on convergence:* because the report states the suite counts and the
suite checks the report, the committed pair reaches consistency after a short
`report:final` → `audit:tests` cycle. That is a property of making the report
verifiable, not a defect, and the tool says so rather than hiding it.

### R4-9b — The self-audit table asserted scans it never ran

Revision 3's §13 self-audit stated "`Math.random` search: no occurrences",
"observer-import scan: clean", and "bare-specifier imports: none" as prose. They
happened to be true, but nothing executed them at report time.

**Repair** — `selfAuditScans()` in `tools/writeFinalReport.mjs` performs all four
scans while generating the report and prints the actual output, naming any offender.
`report-integrity.test.js` proves the scanner has teeth by planting each of the four
violations in turn, asserting the scan reports it, and restoring the file.

*A false positive I introduced and fixed:* my first module-specifier regex,
`/from\s+["']([^"']+)["']/`, matched English prose inside a string literal
(`from "the channel was built from dead ids"`) and reported a phantom runtime
dependency. Module specifiers contain no whitespace, so the pattern now requires
`[^"'\s]+`. The scan was wrong, not the source.

### R4-9c — The §22 control inventory was never checked

Nothing verified that the controls §22 requires actually exist in `index.html`.
Revision 1's unusable legibility mode was exactly this class of defect. While
writing a browser check I guessed the raw-values toggle was `#btn-raw`; it is
`#toggle-raw`. All fifteen required controls are present — but that was luck, not
verification.

**Repair** — two tests in `test/probe-world-identity.test.js`: one asserts every
§22-required control id exists in the markup, the other asserts the five control
paths §22 names call `meter.markInput()` so their input-to-next-paint latency is
sampled.

### R4-9d — `status-consistency.test.js` hardcoded the revision number

It asserted `Bundle revision | **3**`, so it had to be edited every pass — and an
assertion that gets edited to pass is not an assertion.

**Repair** — the revision is read from `src/config/milestoneStatus.js`. The test now
also requires that no *earlier* revision is still presented as this bundle, and that
the revision history marks the current revision as "(this bundle)". A separate test
asserts the source of truth still equals the literal status string this file
enforces, so editing `milestoneStatus.js` cannot silently relax the check.

### R4-9e — The manifest path inventory was hand-maintained

**Not a reproduced defect, stated plainly.** I checked the revision-3 manifest
against the revision-3 bundle: 0 shipped-but-unlisted, 0 listed-but-unshipped. It
was accurate. But it was accurate by hand, and revision 4 adds thirteen files.

**Repair** — `tools/writeManifestPaths.mjs` (`npm run manifest:paths`) generates the
inventory from a walk of the bundle applying exactly the §27 exclusion categories.
`test/manifest-inventory.test.js` fails when it goes stale, and checks set equality
in both directions. This test is preventive and will **not** fail against revision 3.

### R4-9f — `tools/calibrationSweep.mjs` would have broken under the R4-3 repair

Once canonical state binds to the complete model identity, the calibration sweep's
`{...currentModelConfig, ...overrides}` was a different model wearing a production
version label — precisely what R4-3 forbids.

**Repair** — every variant now runs under a derived, explicitly noncanonical version
string of the form `noncanonical-calibration(lineage-m1-config-2;zoneCapacity=90/90/90)`,
and the file's header states that its output is exploratory and is not audit evidence.

### R4-9g — The report printed a value that made its own integrity check unsatisfiable

The generated report reproduced the suite's wall-clock `duration_ms`. That figure
differs on every run, so `FINAL_REPORT.md` and `audit/test-results.txt` could never
agree for more than one run, and the byte-equality check in
`report-integrity.test.js` would fail forever regardless of whether the report was
correct. I introduced this while building the generator; it is recorded because a
check that cannot pass is worse than no check.

**Repair** — the report no longer prints the duration. It says so explicitly and
points at `# duration_ms` in the raw file. A test asserts the report contains no
`| duration |` row, so this cannot be reintroduced.

### R4-9h — Two integrity tests confused quoting history with using it

My first versions of the stale-count guard and the ambiguous-field-name guard were
plain substring checks. They failed the moment §9b of the report started *quoting*
the withdrawn revision-3 claims (`"119 tests … 119/119"`,
`populationAfter180Generations: 234`) — that is, they punished the report for
recording exactly what the audit instruction requires it to record.

**Repair** — all three such guards (here and in
`test/traversal-label-integrity.test.js`) now distinguish *use* from *mention*: a
retired identifier may not appear as a property access, computed access or JSON key,
and a withdrawn figure may appear only inside a withdrawal context. The rule tested
is the real invariant, not the easiest string match.

---

## R4-8 — Process order (NOT repaired; principal-held)

The §24 Stage A pre-code planning-order violation is recorded in `DECISIONS.md`
D-000 and D-024. It is **not** decided or waived here. Per the standing
instruction, no process waiver is requested and no physical iPad test is
performed until revision 4 survives both audits.

---

## Non-regression

The revision-4 repairs touch transaction ordering, observer resolution, identity
binding, probe composition, debug-cache pruning, measurement tooling, labels and
report generation. None of them is a biological change, and the regenerated
evidence confirms that the biology did not move:

| Measure | Revision 3 | Revision 4 |
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
| config-2 extinction rate | 0.00% | 0.00% |
| config-1 median population | 421 (FAIL) | 421 (FAIL) |
| observer invariance | 5 strategies × 31 generations, 0 mismatches | 5 × 31, 0 mismatches |
| reference-file hashes | all unchanged | all unchanged |
| fixture SHA-256 | matches the frozen value | matches the frozen value |

That the biology did not move is the intended outcome and is itself a check that
the repairs stayed inside their stated scope.

**Numerical changes that DID occur, and why:**

| Value | Revision 3 | Revision 4 | Reason |
|---|---|---|---|
| desktop `finalStateGeneration` | 181 (mislabelled 180) | 180 | the run now performs exactly 180 transitions and says so |
| desktop population | 234 | 224 | consequence of the above; 224 is the generation-180 figure, independently confirmed in Node |
| desktop memory delta (browser) | 12,530,740 bytes | `null`, withdrawn | the channel failed its resolution probe on this build |
| raw traversal key names | generic | `additionalMixedWorld…` | R4-5; the values are unchanged |

---

## Files added or changed in revision 4

**Production**

- `src/core/simulation.js` — post-commit observer dispatch, `advanceGenerationAndCollect`, complete model-identity check
- `src/observer/tracerChannels.js` — `resolveLivingDescendants`, `TracerFounderError`, founder validation
- `src/main.js` — `followFocalLineage`, `followNewHabitatGroup`, `createTracer`, `ensureBaselineFixtureActive`, `zoneBinCountsForMeasurement`, counted stress glyphs
- `src/config/modelDefinition.js` — `modelIdentityDigest`
- `src/config/modelConfig.js` — `modelIdentityFor`
- `src/core/individual.js` — `modelIdentityHash` on state
- `src/core/canonicalSerialize.js` — `modelIdentityHash` in canonical bytes
- `src/debug/canvasProbe.js` — membership-only jitter pruning
- `src/debug/desktopMeasure.js` — honest `readMemory()`
- `src/config/milestoneStatus.js` — **new**, single source of truth for status and hash labels

**Tooling**

- `tools/measureDesktop.mjs` — **new**, reproducible desktop measurement
- `tools/writeFinalReport.mjs` — **new**, generates `FINAL_REPORT.md`
- `tools/writeAuditEvidence.mjs` — emits `audit/meaningful-trait-gate.json`
- `tools/runFixture.mjs` — emits `exactProbabilityGate`
- `tools/runCharacterization.mjs` — renamed keys, corrected labels
- `tools/writeCharacterization.mjs` — traversal-attribution headings
- `package.json` / `package-lock.json` — `playwright` devDependency, `audit:desktop`, `report:final`

**Tests (new)** — seven files

- `test/observer-transaction-integrity.test.js`
- `test/focal-lineage-integrity.test.js`
- `test/canvas-jitter-membership.test.js`
- `test/desktop-measurement-reproducibility.test.js`
- `test/traversal-label-integrity.test.js`
- `test/report-integrity.test.js`
- `test/manifest-inventory.test.js`

Per-file test counts are deliberately not stated here: `audit/test-results.txt` is
the only authority for counts, and a hand-maintained count is exactly what went
stale in the revision-3 report.

**Tests (extended)** — `test/model-identity.test.js`,
`test/probe-world-identity.test.js`, `test/status-consistency.test.js`,
`test/median-consistency.test.js`

**Documents** — `CHARACTERIZATION_PLAN.md` Amendment 1 (dated),
`AUDIT_PACKAGE_MANIFEST.md`, `README.md`, `IPAD_TEST_CHECKLIST.md`,
`DECISIONS.md`, and this record.
