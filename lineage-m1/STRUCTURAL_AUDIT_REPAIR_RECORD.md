# LINEAGE M1 — Revision-3 Structural Audit Repair Record

Required by the revision-3 delivery specification. One row per verified defect,
with the command used to reproduce it, the observed result, the repair, and the
regression test that fails on revision 2.

Authority: `LINEAGE_M1_WORLD_MODEL_CONTRACT_v3_3`.
Status during this pass: `M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED`.

Inputs: the AFE-Δ revision-2 implementation BREAK-REPORT (pass 2) and
`LINEAGE_M1_REV2_STRUCTURAL_AUDIT.md`. Both returned `BREAKS-FOUND`.

Method for every defect: reproduce independently → record command and result →
repair production code → add a regression test that fails on revision 2 → rerun
the relevant evidence generator → verify unrelated biological results are
unchanged → document any numerical change.

---

## BUG 1 — Device-test server path traversal (CRITICAL)

**Reproduce**

```bash
cd lineage-m1
echo "secret-canary-content" > ../lineage-m1-secret.txt
node tools/serve.mjs 8111 &
curl -s -w "\nHTTP:%{http_code}\n" "http://localhost:8111/..%2flineage-m1-secret.txt"
```

**Observed on revision 2**

```
secret-canary-content
HTTP:200
```

**Cause** — `resolved.startsWith(ROOT)` is a string-prefix test. With root
`/.../lineage-m1`, the sibling `/.../lineage-m1-secret.txt` shares the prefix.

**Repair** — `tools/serve.mjs`: containment via `path.relative()`; single-pass
percent-decoding; refusal of malformed encoding, control bytes, NULs and
backslashes; `realpath` re-verification against symlink escape; GET/HEAD only; no
directory listing; `x-content-type-options: nosniff`.

**Observed on revision 3** — `403 forbidden`, no body.

**Regression test** — `test/server-containment.test.js` (4 tests).

**Evidence regenerated** — none required; `audit/test-results.txt` now contains
the containment tests.

---

## BUG 2 — Reported configuration identity does not identify the model (HIGH)

**Reproduce**

```bash
node --input-type=module -e '
import { EFFECT } from "./src/config/traits.js";
import { survivalProbability } from "./src/core/survival.js";
import { currentModelConfig as C } from "./src/config/modelConfig.js";
import { createHash } from "node:crypto";
import { canonicalStringify } from "./src/core/canonicalSerialize.js";
const g=[0.15,0.45,0.4,0.45,0.4,0.4,0.35,0.5,0.5,0.5];
const before = survivalProbability({bodyGenome:g,timeAllocation:[1,0,0],ageGenerations:1},[39.84,40.32,39.84],C).pSurvival;
const hashBefore = createHash("sha256").update(canonicalStringify(C)).digest("hex");
EFFECT[0][0] = 5.0;                       // revision 2: EFFECT was mutable
const after = survivalProbability({bodyGenome:g,timeAllocation:[1,0,0],ageGenerations:1},[39.84,40.32,39.84],C).pSurvival;
const hashAfter = createHash("sha256").update(canonicalStringify(C)).digest("hex");
console.log({before, after, hashUnchanged: hashBefore === hashAfter});
'
```

**Observed on revision 2** — survival changed; `hashUnchanged: true`.

**Repair** — new `src/config/modelDefinition.js` builds one complete model
definition covering trait order, dimension order, trait-effect matrix, upkeep,
zone order, adjacency, weights, capacities, scarcity, ancestor genome, founder
centroids, founder ages and spread, starting population, and every survival,
lifecycle, mutation, mating and genealogy constant. Generators publish
`modelDefinitionHash` over it and keep `tuningConfigHash` as a labelled subset.
`deepFreeze` replaces shallow freezing; `EFFECT` and its rows, `UPKEEP`, `ZONES`
and `ZONE_NEIGHBORS` are frozen; `legacyModelConfigV1` is built with
`deepClonePlain` so it shares no mutable nested references; the stale
`ZONE_CAPACITY` export is removed; `founderAgeForId(id, config)` uses the supplied
configuration.

**Observed on revision 3** — `EFFECT` is frozen, so the mutation throws in strict
mode; any perturbed definition changes `modelDefinitionHash`.

**Numerical change documented** — the published hash changed because its input
changed: `dc444865163deb32a7a9d80bd23f576d1ab5a936896298b5cd13faac6f513b3d`
(complete) versus `edb81695973b81ab8f87f7ef9dde9d8c5b3d4c7dfbeb45f385547edd86ee86de`
(the tuning-config-only value revision 2 published). No biological value changed.

**Regression test** — `test/model-identity.test.js`.

---

## BUG 3 — State progression not bound to `state.configVersion` (HIGH)

**Reproduce**

```bash
node --input-type=module -e '
import { createInitialState } from "./src/core/individual.js";
import { advanceGeneration } from "./src/core/simulation.js";
import { legacyModelConfigV1 as L } from "./src/config/modelConfig.js";
import { serializeCanonicalBiology as ser } from "./src/core/canonicalSerialize.js";
const a = createInitialState(1, L), b = createInitialState(1, L);
advanceGeneration(a);        // revision 2: silently used config 2
advanceGeneration(b, L);
console.log({aLabel:a.configVersion, bLabel:b.configVersion,
             aPop:a.currentIndividuals.length, bPop:b.currentIndividuals.length,
             bytesEqual: ser(a)===ser(b)});
'
```

**Observed on revision 2** — both labelled `lineage-m1-config-1`, populations 132
and 160, `bytesEqual: false`.

**Repair** — `assertConfigMatchesState()` in `src/core/simulation.js`, called by
`advanceGeneration` and `runGenerations` before any RNG draw, counter, event,
population change, or canonical byte.

**Observed on revision 3** — the mismatched call throws; canonical bytes, RNG
state, every counter, and the population are unchanged.

**Regression test** — `test/model-identity.test.js`.

---

## BUG 4 — Observer and Canvas maps grow with cumulative births (HIGH)

**Reproduce** — advance seed 71 with one tracer channel and print
`channel.values.size` at generations 180/400/600/800.

**Observed on revision 2** — 21,510 / 52,194 / 80,016 / 107,760 entries for
254 / 257 / 238 / 246 living animals.

**Repair** — `pruneObserverToLiving()` and `observerAfterGenerationHook()` in
`src/observer/tracerChannels.js`; a new observer-only `afterGeneration(livingIds)`
hook in `advanceGeneration`; `CanvasProbe.pruneJitterTo()`. Safe because tracer
propagation reads only parent values and parents are always living survivors.

**Observed on revision 3** — 254 / 257 / 238 / 246 / 323 entries at generations
180/400/600/800/1000 against 134,980 cumulative births.

**Regression test** — `test/observer-memory-bounds.test.js`, including a
never-pruned reference channel proving living values are unchanged, and a
60-generation canonical-byte comparison.

**Evidence regenerated** — `audit/observer-invariance-hashes.json` (still
byte-identical across all five strategies), `audit/desktop-measurements.json`.

---

## BUG 5 — The adjacency statistic runs the wrong experiment (MEDIUM-CRITICAL)

**Reproduce** — compare the declared measure in `CHARACTERIZATION_PLAN.md` §5
against `tools/runCharacterization.mjs`: the tool initialized the mixed
120-founder world and filtered by an ancestry bitmask while the other 80 founders
stayed ecologically active.

**Observed on revision 2** — 495/500 and 499/500, labelled as the edge-only
experiment.

**Repair** — new `src/fixtures/edgeOnlyWorlds.js` builds genuinely isolated
40-founder worlds with a fully frozen, documented initializer (preserved founder
ids, birth records, starting population 40, next-id counters at 121, event
counters at 1, RNG advanced to match the mixed world at the same seed, unchanged
capacities, declared duration, extinction handling, `parentalUseEpsilon`
threshold). New `tools/runEdgeOnlyTraversal.mjs` runs seeds 1..500 each way.

**Observed on revision 3** — canopy-only → shoreline **500/500**;
shoreline-only → canopy **500/500**; median generation 3; 0 extinctions. This
matches the auditor's independent counterfactual.

**Numerical change documented** — the reported edge-only figures change from
495/500 and 499/500 to 500/500 and 500/500 because the experiment changed from the
mixed world to the declared isolated world. The mixed-world figures are retained
in `CHARACTERIZATION.md` under "Separate additional measure — mixed-world
single-band ancestry".

**Regression test** — `test/edge-only-traversal.test.js` (8 tests).

**Evidence regenerated** — `audit/edge-only-traversal-results.json` (new),
`audit/characterization-results.json`, `CHARACTERIZATION.md`.

---

## BUG 6 — Cached fixture metadata used as a proxy for the current world (MEDIUM-CRITICAL)

**Reproduce** — in the probe: load the defining fixture, reset to a random world,
then enter legibility mode; compare canonical bytes against the fixture. Also
create the focal tracer at generation 10 and read its living contribution.

**Observed on revision 2** — the random world stayed active while legibility mode
claimed the fixture; a tracer created at generation 10 seeded twelve dead ids and
its living contribution was 0 at creation and still 0 five generations later.

**Repair** — explicit `worldSource` marker outside biological state; legibility
mode rehydrates whenever `worldSource !== "defining_fixture"`; tracer creation
resolves founders against the living population and returns an explicit
`{created:false, reason}` rather than a plausible empty channel; fixture-load
failure leaves the world untouched, records an error, surfaces it in the UI, and
does not enter the mode.

**Observed on revision 3** — after the failing sequence,
`worldSource === "defining_fixture"` with 120 animals at generation 0; a tracer
created at generation 10 has 12 living founders and contribution 12. Confirmed
both in `ProbeApp` unit tests and in headless Chromium.

**Regression test** — `test/probe-world-identity.test.js` (7 tests).

---

## BUG 7 — The exact 200-seed fixture gate is not in the build-blocking test (MEDIUM-CRITICAL)

**Reproduce** — read `test/defining-fixture.test.js`: `SLICE = 12` and a floor of
`Math.ceil(SLICE * 0.65)`.

**Repair** — that file now runs `runFixtureExperiment()` over the declared seeds
1..200 and asserts `seedRange`, `seedCount === 200`,
`successThreshold === 130`, `measurementGeneration === 90`, both median
directions, and both success floors. `npm test` runs it with a raised timeout.

**Observed on revision 3**, from `audit/test-results.txt` under the official
command:

```
§19.4 EXACT gate: canopy successes 200/200, shoreline 197/200, ties 0/0
```

**Regression test** — the gate itself is now the test.

---

## BUG 8 — Paired fixture worlds not built by one-hydration cloning (MEDIUM)

**Reproduce** — read `buildFourWorlds()`: four separate
`hydrateDefiningFixtureV1` calls.

**Repair** — one hydration; `serializeCanonicalBiology` of that baseline; four
clones via a new `deserializeCanonicalBiology`; then only the declared overrides.
Returns `hydrationCount` and `baselineCanonicalBytes` so the construction is
assertable.

**Observed on revision 3** — `hydrationCount === 1`; both low worlds equal the
baseline bytes exactly; each high world differs in exactly the twelve declared
`toe_webbing` values; RNG state and counters come from the baseline; clones are
independent object graphs.

**Regression test** — `test/defining-fixture.test.js`.

**Numerical change** — none. The fixture gate reproduces exactly.

---

## BUG 9 — Official status artifacts contradict the actual state (MEDIUM)

**Reproduce** — compare `FINAL_REPORT.md`, `AUDIT_PACKAGE_MANIFEST.md`, and
`IPAD_TEST_CHECKLIST.md`.

**Observed on revision 2** — the report claimed the automated gates passed with
the Stage A waiver as the only blocker; the checklist still instructed the
operator to report `M1_AUTOMATED_GATES_PASS — IPAD TEST PENDING`.

**Repair** — all four artifacts now read
`M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED`, with
`PROCESS WAIVER: PENDING PRINCIPAL DECISION` and
`IPAD TEST: PENDING_HUMAN_DEVICE_TEST` named as separately pending. The checklist
gains a "DO NOT PERFORM THIS TEST YET" gate and a server security note.

**Regression test** — `test/status-consistency.test.js` makes status drift a build
failure.

---

## BUG 10 — A generated "median" table uses the lower middle value (MEDIUM-MINOR)

**Reproduce** — read `tools/writeCharacterization.mjs`:
`v[Math.floor(0.5 * (n - 1))]`.

**Observed on revision 2** — canopy 117.202731 in the limitation table against
117.223028 in the guardrail table (also 108.134923 vs 108.182136 and 30.523647 vs
30.529427).

**Repair** — the shared `ordinaryMedian` for the centre; nearest-rank only for the
5th/95th tails.

**Observed on revision 3** — both tables print 117.22 / 108.18 / 30.53.

**Regression test** — `test/median-consistency.test.js`, including a synthetic
even-count batch rendered through the real generator.

---

## Non-regression checks

Confirmed still holding after the revision-3 repairs:

| Check | Result |
|---|---|
| genealogy boundary records exactly bounded | 108 / 118 / 117 / 137 at generations 400/460/520/600 |
| unmatched adults counted post-survival | 0.5164 per generation |
| all seven per-bin mutation/carrier measures present | yes |
| birth-only body mutation | yes |
| birth-only allocation mutation | yes |
| zone-first survival composition | exact to 1e-12 |
| exact two-child lifecycle | yes |
| observer actions biologically inert | byte-identical, 5 strategies × 31 generations |
| separate mutation-ID namespaces | yes |
| defining fixture byte-identical | `c80aaa52…42b78` |
| all three Python references byte-identical | yes |
| §21.4 guardrails (config-2) | median population 256; loads 117.22 / 108.18 / 30.53; concentration 0.468617 |
| §19.4 fixture gate | canopy 200/200, shoreline 197/200 |

Biological trajectories did not move. That is the intended outcome: the repairs
were confined to security, provenance, retention, measurement, and reporting.
