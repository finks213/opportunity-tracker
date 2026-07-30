# LINEAGE Milestone 1 — Implementation Plan

Authority: `LINEAGE_M1_WORLD_MODEL_CONTRACT_v3_3.md` (binding), then
`LINEAGE_PRODUCT_NORTH_STAR.md`, then `reference/*.py` (defective historical
reference only). No earlier LINEAGE brief, audit, or architecture document was
requested, read, searched for, or inferred from during this implementation.

This plan maps every contract section to the modules and tests that implement
and prove it.

---

## 1. Contract section → module → test map

| Contract § | Requirement | Module(s) | Test(s) |
|---|---|---|---|
| §3 | ES2023 modules, zero runtime deps, `node:test` | `package.json`, all `src/` | whole suite runs on `node --test` |
| §4 | Observer cannot alter biology | `src/core/*` (no observer imports), `src/observer/*` | `observer-invariance.test.js`, `dependency-boundary.test.js` |
| §5.1–5.2 | Individual + canonical biological state shape | `src/core/individual.js` | `birth-immutability.test.js`, `lifecycle-contract.test.js` |
| §5.3 | Observer state is a separate root | `src/observer/tracerChannels.js` | `observer-invariance.test.js` |
| §5.4 | Debug-only current zone bins, canonical tie-break | `src/observer/currentZoneBins.js` | `dependency-boundary.test.js` (exclusion), probe |
| §5.5–5.6 | Genealogy vs tracer separation | `src/core/genealogy.js`, `src/observer/tracerChannels.js` | `genealogy-integrity.test.js` |
| §6 | Three zones, adjacency, capacities | `src/config/zones.js`, `src/config/modelConfig.js` | `spatial-integrity.test.js` |
| §7 | 120 founders, exact centroids, no founder noise | `src/core/individual.js` | `spatial-integrity.test.js` (adjacency case 4) |
| §8 | Exactly ten traits, three exactly neutral | `src/config/traits.js` | `neutral-traits.test.js` |
| §9 | Performance layer + frozen meaningful-trait probe | `src/core/performance.js` | `meaningful-trait-context.test.js` |
| §10 | Zone-first survival composition | `src/core/survival.js` | `survival-composition.test.js` |
| §11 | Frozen lifecycle + target-generation numbering | `src/core/simulation.js`, `src/core/events.js` | `lifecycle-contract.test.js`, `mating-integrity.test.js` |
| §12 | Body inheritance/mutation, separate ID namespace | `src/core/inheritance.js`, `src/core/mutation.js`, `src/core/events.js` | `full-path-mutation-independence.test.js`, `mutation-provenance.test.js` |
| §13 + §13.1 | Allocation inheritance + frozen mutation opportunity | `src/core/inheritance.js`, `src/core/mutation.js` | `allocation-mutation-contract.test.js`, `spatial-integrity.test.js` |
| §14 | Event record shapes | `src/core/events.js`, `src/observer/matingAnnotations.js` | `mating-integrity.test.js`, `lifecycle-contract.test.js` |
| §15 | 360-generation retention + boundary records | `src/core/genealogy.js` | `genealogy-retention-boundary.test.js` |
| §16 | Independent observer tracer channels | `src/observer/tracerChannels.js` | `observer-invariance.test.js` |
| §17 | Two RNG roots, serializable PRNG, normal cache | `src/core/rng.js` | `rng-integrity.test.js` |
| §18 | Canonical biological serialization | `src/core/canonicalSerialize.js` | `observer-invariance.test.js`, `rng-integrity.test.js` |
| §19 A/B/C | Fixture raw hash, envelope round trip, hydration | `src/fixtures/definingFixtureV1.js`, `src/fixtures/nodeFixtureIO.js` | `defining-fixture-snapshot.test.js` |
| §19 D, 19.2–19.4 | Paired worlds + probability + trajectory gates | `src/fixtures/definingFixtureV1.js`, `tools/runFixture.mjs` | `defining-fixture.test.js` |
| §20.1–20.13 | All build-blocking invariants | as above | every `test/*.test.js` file (seventeen at revision 1; thirty-one at revision 4 after three audit repair passes) |
| §21 | Predeclared characterization | `tools/runCharacterization.mjs`, `tools/writeCharacterization.mjs` | `CHARACTERIZATION_PLAN.md` → `CHARACTERIZATION.md` |
| §22 | Crude Canvas probe + iPad gate | `index.html`, `src/debug/*` | `IPAD_TEST_CHECKLIST.md` (human) |
| §23 | Directory structure | repository layout | — |
| §26–§27 | Reports and audit bundle | `FINAL_REPORT.md`, `AUDIT_PACKAGE_MANIFEST.md`, `audit/*` | — |

---

## 2. Dependency boundaries

The one-way rule, enforced by `dependency-boundary.test.js` with a static import
scan:

```
src/config/  ──►  (nothing)
src/core/    ──►  src/config/, src/core/
src/fixtures/──►  src/config/, src/core/
src/observer/──►  src/config/, src/core/          (reads biology, never writes)
src/debug/   ──►  everything                       (leaf; nothing imports it)
```

`src/core/**` and `src/fixtures/**` must never import `src/observer/**` or
`src/debug/**`. No production source file may contain `Math.random`.

Observer code receives biological data only as read-only inputs (ids and
already-fixed parent ids). It never receives `simRng`.

---

## 3. Execution order (contract §24)

- **Stage A — preflight.** Copy Python references and the fixture unchanged;
  verify all starter SHA-256 hashes; write `PLAN.md`, `DECISIONS.md`,
  `CHARACTERIZATION_PLAN.md`; establish dependency boundaries; implement and
  test the RNG; lock the fixture snapshot test.
- **Stage B — deterministic biological core.** Config → individuals/state →
  initial population → performance → zone survival → lifecycle → mating → body
  inheritance/mutation → allocation inheritance/mutation → events/genealogy →
  canonical serialization.
- **Stage C — observer layer.** Tracer channels and debug zone bins only after
  the core passes; prove observer-state invariance before any debug interaction.
- **Stage D — defining fixture.** Exact probability gate (§19.3) and matched
  trajectory gate (§19.4). No tuning against random-world output before this.
- **Stage E — random characterization.** Predeclared 500-seed batch; write
  `CHARACTERIZATION.md`; record every tuning change.
- **Stage F — Canvas probe.** Only after all automated invariants pass; desktop
  measurements; generate `IPAD_TEST_CHECKLIST.md`.
- **Stage G — self-audit.** `Math.random` scan; observer-import scan; clean
  re-run of all tests; fixture and characterization re-run; observer-strategy
  comparison; reference-file hash verification; deferred-feature list.

---

## 4. Determinism strategy

1. One serializable `simRng` (`xoshiro128**`, four uint32 words) carries all and
   only biological randomness. The Box–Muller spare value and its flag are part
   of serialized RNG state.
2. Draw order is fixed by the lifecycle: one survival draw per individual in
   ascending id order; one Fisher–Yates shuffle of eligible parents; one draw
   per successful mate selection; then per child, in this exact order — ten body
   drift normals, the body-mutation opportunity, three allocation drift normals,
   the allocation-mutation opportunity.
3. Body inheritance and the body-mutation opportunity complete before any
   allocation-related draw, so identical parental body genomes plus identical
   RNG state give identical child body genomes regardless of parental allocation.
4. Observer callbacks (`onBirth`) run after biology is fully fixed and are handed
   only ids. They cannot reach `simRng`.
5. Canonical serialization compares bytes, never floats with a tolerance.

---

## 5. Deliverables

Source and tests per §23; `audit/test-results.txt`,
`audit/fixture-results.json`, `audit/characterization-results.json`,
`audit/observer-invariance-hashes.json`, `audit/reference-file-hashes.json`;
`README.md`, `DECISIONS.md`, `CHARACTERIZATION_PLAN.md`, `CHARACTERIZATION.md`,
`IPAD_TEST_CHECKLIST.md`, `FINAL_REPORT.md`, `AUDIT_PACKAGE_MANIFEST.md`; and
the `LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE.zip` required by §27.

## 6. Explicitly out of scope

Everything in the contract's §2 "Do not implement" list: the watch/flag/decide
loop, surfaced variation cards, inspection UI, prediction/journal screens,
polished art, sound, collection, explanations, myths, teacher dashboard,
persistence, service workers, React or any framework, persistent display-cluster
identity, cluster split/merge history, divergence claims, cohort-ending rules,
inferred reproductive isolation, and any additional zones or traits.
