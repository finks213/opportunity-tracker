# LINEAGE Milestone 1 — Characterization Plan (predeclared)

**Frozen before the declared batch was run.** Contract §21 requires all
constants and decision rules to be written down before observing results.
Characterization describes this first implementation. It does not define
biological truth and is not a future regression target.

The only pre-declaration measurement activity in this session is disclosed in
`DECISIONS.md` D-010 (capacity calibration sweeps over seeds 1..40 and 1..12).
Nothing below was chosen after seeing a declared-batch result.

---

## 1. Batch definition (§21.1, §21.2)

| Parameter | Declared value |
|---|---|
| Seed set | integer seeds `1..500`, primary random-world batch |
| Duration | 180 generations per seed, unless the world becomes extinct earlier |
| Configuration | `lineage-m1-config-2` (`currentModelConfig`) |
| Side-by-side | the same batch re-run under `lineage-m1-config-1` (`legacyModelConfigV1`), per §21.7 |
| Initializer | `createInitialState(seed, config)` — 120 founders, 40 per band, exact centroids, no allocation noise |
| Observer | none attached; characterization measures biology only |

Seeds are **not** replaced after observing failures. If a seed fails, it is
reported.

## 2. Mutation-supply measures (§21.3)

Reported separately by **birth dominant-zone bin** — the child's
`argmax(timeAllocation)` at birth, canonical tie-break — for every non-founder
birth in the batch:

1. number of births;
2. body-mutation opportunities;
3. all body-mutation events;
4. positive `toe_webbing` mutation events (`traitId == 0` and
   `requestedDelta > 0`);
5. positive webbing events crossing from `preMutationValue < 0.20` to
   `postMutationValue >= 0.35`;
6. surviving webbing carriers at ages 1, 2, and 3+ (carrier ≙
   `bodyGenome[toe_webbing] >= 0.35`), sampled at generation 180;
7. final carrier prevalence at generation 180.

Mutation generation is evaluated as **events per birth**, never as final
carriers.

### Declared minimal-functionality requirements

- at least one positive webbing event among canopy-dominant births across the
  batch;
- at least one among shoreline-dominant births;
- the exact mutation-context-independence invariant
  (`full-path-mutation-independence.test.js`) passes.

Equal final carrier prevalence across zones is **not** required and is expected
not to hold, because survival differs by zone.

## 3. Population guardrails (§21.4)

Across the 500-seed batch, all four must hold:

```
wholeWorldExtinctionByGeneration180  <  5%   of 500 seeds
90  <=  medianTotalLivingPopulation(gen 180)  <=  360
medianEffectiveLoad[z](gen 180)  >=  15       for each of the three zones
medianConcentration  <=  0.80
```

Concentration is defined exactly, for every **non-extinct** seed `s` at
generation 180:

```
totalLoad_s      = sum_z( zoneLoad_s[z] )
concentration_s  = max_z( zoneLoad_s[z] / totalLoad_s )
```

Sort all `concentration_s` from non-extinct seeds; take the ordinary median (the
middle value for an odd count, the arithmetic mean of the two middle values for
an even count). Extinct seeds are excluded from this ratio only because
`totalLoad_s = 0`; they remain fully counted by the extinction guardrail.

The report must state the number of included seeds, every seed-level
concentration value, and the resulting median. Per-zone medians, a
median-population seed, or independently combined median zone shares are **not**
substitutes and will not be reported as such.

## 4. Trait-effect characterization (§21.5)

For each of the seven meaningful traits and each of the three zones:

- sample realistic genomes from the batch — declared sampling rule: the living
  population of the **first 25 non-extinct seeds** at generation 180, capped at
  the first 40 individuals per seed in ascending id order, giving up to 1000
  sampled genomes;
- for each sampled genome, compute the **exact** logistic survival difference at
  the actual baseline for a fixed delta of `+0.20` applied to that trait alone,
  clamped to `[0,1]`, with the zone's one-hot allocation, age 1, and the
  batch-median zone loads;
- report median and central 90% interval (5th and 95th percentiles, nearest-rank)
  of that difference;
- classify each trait×zone as helpful (`median >= +0.01`), harmful
  (`median <= -0.01`), or effectively inactive (otherwise).

Derivative-at-the-midpoint approximations are forbidden; exact logistic
differences are used. Neutral traits are zero by invariant and are asserted, not
inferred from correlations.

## 5. Lifecycle characterization (§21.6)

Reported across the batch:

- births per generation;
- deaths per generation;
- age distribution at generation 180;
- mating-pair count per generation;
- unmatched eligible adults per generation;
- mean and distribution of mating overlap;
- population by current zone bin;
- allocation-mutation frequency (events per non-founder birth);
- frequency and timing of adjacency traversal — declared as the first generation
  at which any living individual has `shoreline >= 0.02` in a world descended
  only from canopy-heavy founders, and symmetrically for canopy from
  shoreline-heavy founders, plus the count of allocation-mutation events whose
  `toZone` had share `< parentalUseEpsilon` before the transfer.

## 6. Reporting rules (§21.7)

- a failed directional fixture or guardrail is reported `FAIL`;
- a batch metric too sparse to characterize is reported `INCONCLUSIVE` with the
  reason;
- no metric is silently altered after results are seen;
- any tuning change requires a `DECISIONS.md` rationale, a bumped config
  version, a full rerun, and side-by-side results with no claim that the newer
  result is automatically correct;
- measured medians are **not** frozen as future targets in this session.

## 7. Raw output

`tools/runCharacterization.mjs` writes `audit/characterization-results.json`
containing the per-seed records and aggregates sufficient to reproduce every
table in `CHARACTERIZATION.md`, including every seed-level concentration value.
`tools/writeCharacterization.mjs` renders `CHARACTERIZATION.md` from that file
only, so the prose cannot drift from the raw evidence.
