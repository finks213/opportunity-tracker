# LINEAGE Milestone 1 — Characterization

Generated from `audit/characterization-results.json` by
`tools/writeCharacterization.mjs`. Every number below is read from that raw
file; none is retyped by hand.

Characterization **describes this first implementation**. It does not define
biological truth, is not an ecological claim, and is not frozen as a future
regression target (contract §21).

- configuration: `lineage-m1-config-2`
- complete model-definition hash: `undefined`
- tuning-config-only hash (subset, for reference): `undefined`

The model-definition hash covers **every** biology-affecting value, including
the trait-effect matrix, upkeep costs, zone adjacency, and the trait/dimension
orders. Revision 2 published only the tuning-config hash, which excluded those,
so a mutated trait effect could change survival without moving the reported
hash (DECISIONS.md D-026).
- declared seeds: 1..500
- declared duration: 180 generations per seed unless extinct

## §21.4 Population guardrails

| Guardrail | Required | Measured | Result |
|---|---|---|---|
| whole-world extinction by generation 180 | < 5% | 0.00% | PASS |
| median total living population | 90..360 | 256.0 | PASS |
| median effective load — canopy | >= 15 | 117.22 | PASS |
| median effective load — forest_floor | >= 15 | 108.18 | PASS |
| median effective load — shoreline | >= 15 | 30.53 | PASS |
| median concentration | <= 0.80 | 0.4686 | PASS |

**All §21.4 guardrails: PASS**

### Concentration statistic

Defined exactly as §21.4 requires, for every non-extinct seed at generation 180:

```
totalLoad_s     = sum_z( zoneLoad_s[z] )
concentration_s = max_z( zoneLoad_s[z] / totalLoad_s )
```

Included seeds: **500** (extinct seeds excluded only because
`totalLoad_s = 0`; they remain fully counted by the extinction guardrail).
Ordinary median of those values: **0.4686**.

Every seed-level concentration value is preserved in
`audit/characterization-results.json` under `concentrationValues` and per-seed
under `seeds[].concentration`. Per-zone medians, a median-population seed, and
independently combined median zone shares are **not** substituted.

## §21.3 Mutation supply by birth dominant-zone bin

Mutation generation is evaluated as **events per birth**, not final carriers.

| Birth zone bin | Births | Body-mutation opportunities | Body-mutation events | Events / birth | Positive webbing events | Crossing <0.20 → >=0.35 |
|---|---|---|---|---|---|---|
| canopy | 6070525 | 6070525 | 1212149 | 0.1997 | 60700 | 18535 |
| forest_floor | 3010385 | 3010385 | 602533 | 0.2002 | 30077 | 9201 |
| shoreline | 1974834 | 1974834 | 395397 | 0.2002 | 19750 | 2187 |

### Declared minimal functionality

- at least one positive webbing event among canopy-dominant births: **PASS**
- at least one among shoreline-dominant births: **PASS**
- opportunity identity (`bodyMutationOpportunityCount === allocationMutationOpportunityCount === nonFounderBirthCount`) holds for every seed: **PASS**

### Surviving webbing carriers, by birth dominant-zone bin

Carrier definition (declared): `bodyGenome[toe_webbing] >= 0.35`, measured at generation 180.
Time allocation is immutable at birth, so a living individual's
`argmax(timeAllocation)` **is** its birth dominant-zone bin.

Reported per bin so that mutation supply (above) can be compared directly
against post-selection carrier survival in the same zone — which is the
comparison §21.3 exists to protect.

| Birth zone bin | Carriers age 1 | age 2 | age 3+ | Final living | Final carriers | Final prevalence | Median per-seed prevalence | Seeds with any living in bin |
|---|---|---|---|---|---|---|---|---|
| canopy | 1364 | 696 | 631 | 74438 | 5386 | 0.0724 | 0.0360 | 498 of 500 |
| forest_floor | 1356 | 674 | 632 | 52708 | 5275 | 0.1001 | 0.0394 | 500 of 500 |
| shoreline | 125 | 81 | 59 | 919 | 490 | 0.5332 | 0.0172 | 62 of 500 |

World-wide totals for cross-checking:

| Measure | Value |
|---|---|
| carriers at age 1 (batch total) | 2845 |
| carriers at age 2 (batch total) | 1451 |
| carriers at age 3+ (batch total) | 1322 |
| median final carrier prevalence | 0.0373 |

Equal final carrier prevalence across zones is **not** required and is not
expected: differential survival should make it unlikely (§21.3).

## §21.5 Trait-effect characterization

Exact logistic survival differences for a declared fixed delta of +0.20 applied
to one trait at a time on genomes sampled from the batch, with each zone's
one-hot allocation, age 1, and the batch-median zone loads. Derivative-at-the-
midpoint approximations are not used.

| Trait | Zone | n | Median Δp | 5th | 95th | Classification |
|---|---|---|---|---|---|---|
| toe_webbing | canopy | 1000 | -0.0548 | -0.0892 | -0.0298 | harmful |
| toe_webbing | forest_floor | 1000 | -0.0076 | -0.0113 | -0.0048 | effectively inactive |
| toe_webbing | shoreline | 1000 | 0.1426 | 0.0712 | 0.2158 | helpful |
| curved_claws | canopy | 975 | 0.0244 | 0.0049 | 0.0620 | helpful |
| curved_claws | forest_floor | 975 | 0.0023 | 0.0005 | 0.0044 | effectively inactive |
| curved_claws | shoreline | 975 | -0.0285 | -0.0731 | -0.0060 | harmful |
| dense_fur | canopy | 999 | 0.0050 | 0.0024 | 0.0094 | effectively inactive |
| dense_fur | forest_floor | 999 | 0.0161 | 0.0093 | 0.0248 | helpful |
| dense_fur | shoreline | 999 | -0.0256 | -0.0482 | -0.0110 | harmful |
| long_hindlimbs | canopy | 966 | 0.0093 | 0.0016 | 0.0250 | effectively inactive |
| long_hindlimbs | forest_floor | 966 | 0.0204 | 0.0038 | 0.0469 | helpful |
| long_hindlimbs | shoreline | 966 | -0.0234 | -0.0654 | -0.0036 | harmful |
| strong_tail | canopy | 1000 | -0.0116 | -0.0207 | -0.0060 | harmful |
| strong_tail | forest_floor | 1000 | -0.0168 | -0.0248 | -0.0108 | harmful |
| strong_tail | shoreline | 1000 | 0.0635 | 0.0303 | 0.1052 | helpful |
| large_eyes | canopy | 998 | 0.0056 | 0.0021 | 0.0110 | effectively inactive |
| large_eyes | forest_floor | 998 | 0.0214 | 0.0083 | 0.0337 | helpful |
| large_eyes | shoreline | 998 | -0.0196 | -0.0380 | -0.0065 | harmful |
| streamlined_body | canopy | 1000 | -0.0273 | -0.0469 | -0.0144 | harmful |
| streamlined_body | forest_floor | 1000 | -0.0068 | -0.0102 | -0.0043 | effectively inactive |
| streamlined_body | shoreline | 1000 | 0.0835 | 0.0403 | 0.1354 | helpful |

### Neutral traits

Exact causal difference must be zero **by invariant**, not inferred from noisy
correlations (§21.5).

| Neutral trait | Max absolute exact difference | Exactly zero |
|---|---|---|
| coat_shade | 0 | yes |
| ear_tip_shape | 0 | yes |
| tail_tip_marking | 0 | yes |

## §21.6 Lifecycle characterization

| Measure | Value |
|---|---|
| mean births per generation | 122.84 |
| mean deaths per generation | 122.09 |
| mean mating pairs per generation | 61.42 |
| mean unmatched eligible adults per generation | 0.52 |
| mean mating overlap | 0.4584 |
| mating overlap, 5th percentile (median across seeds) | 0.3186 |
| mating overlap, 95th percentile (median across seeds) | 0.8835 |
| median population in current zone bin — canopy | 159.0 |
| median population in current zone bin — forest_floor | 95.0 |
| median population in current zone bin — shoreline | 0.0 |
| allocation-mutation events per non-founder birth | 0.0799 |
| allocation transfers into a below-threshold zone | 87299 |
| zero-allocation fallbacks (must be 0) | 0 |

### Named limitation — zone load versus zone-bin occupancy

Reported because it is a real property of this implementation, not tuned away.

| Zone | min load | 5th | median | 95th | seeds with **zero** dominant-bin animals |
|---|---|---|---|---|---|
| canopy | 47.41 | 86.48 | 117.22 | 140.06 | 2 of 500 |
| forest_floor | 58.00 | 84.94 | 108.18 | 130.84 | 0 of 500 |
| shoreline | 13.98 | 18.59 | 30.53 | 56.63 | 438 of 500 |

**All three zones remain meaningfully populated by the contract's own measure.**
§21.4 defines zone population as *effective load*, and every zone clears it: no
seed in the batch has any zone load below 1, and 497 of 500 seeds hold every
zone at load 15 or more.

However, the **debug zone-bin view** tells a different story about the shoreline:
in 438 of 500 seeds, no living individual has the shoreline as its
`argmax(timeAllocation)` at generation 180. The shoreline is used *part-time by
many animals* rather than *full-time by a resident subpopulation*.

This is not a §25 halt condition — the zone bin is explicitly a debug-only
grouping with no persistent identity and no biological role (§5.4), and the
contract's zone-population guardrail is load-based and passes. It is recorded
here as **named remaining uncertainty** (§28: "remaining uncertainty is named
rather than hidden") and as a concrete input to Milestone 2, where a visibly
empty shoreline late in a run would matter to what a child actually sees.

### Adjacency traversal — the DECLARED edge-only-world experiment

`CHARACTERIZATION_PLAN.md` declares traversal in a world descended **only**
from one edge founder band. That experiment is executed by
`tools/runEdgeOnlyTraversal.mjs` in genuinely isolated 40-founder worlds and its
raw output is `audit/edge-only-traversal-results.json`.

| Experiment | Retained founders | Target zone | Seeds reaching | Earliest | Median first generation | Latest | Extinct seeds |
|---|---|---|---|---|---|---|---|
| canopyOnly | 1..40 | shoreline | **500 of 500** | 2 | 3.0 | 10 | 0 |
| shorelineOnly | 81..120 | canopy | **500 of 500** | 2 | 3.0 | 8 | 0 |

The frozen initializer for these worlds is recorded in the raw JSON under
`frozenInitializer`: retained founder ids and birth records, starting population
40, preserved ids, next-id counters at 121, event counters at 1, RNG
initialization matched to the mixed world at the same seed, unchanged zone
capacities, duration, extinction handling, and the meaningful-use threshold.

Because there is no canopy-shoreline edge, the opposite edge zone is reachable
only across the forest-floor bridge, which requires forest-floor use to reach
`parentalUseEpsilon` first.

#### Separate additional measure — mixed-world single-band ancestry

Reported under its own name because it is **not** the declared edge-only
experiment: all 120 founders remain present and ecologically active, so they
still affect zone loads, density factors, survival probabilities, mating
availability, mating order, and population dynamics. A lineage that stays
genetically single-band is not ecologically isolated.

| Measure (mixed 120-founder world) | Seeds | Earliest | Median first generation |
|---|---|---|---|
| canopy-only-ancestry lineage → shoreline | 495 of 500 | 2 | 3.0 |
| shoreline-only-ancestry lineage → canopy | 499 of 500 | 2 | 3.0 |

Revision 2 presented these mixed-world numbers under the edge-only label. They
are retained here as a genuine additional statistic, clearly distinguished.

## §21.7 Side-by-side configuration comparison

Required because `zoneCapacity` changed from the contract's provisional
`[90,90,90]` to `[55,55,55]` (see `DECISIONS.md` D-009). Both batches use the
same declared seeds and duration.

| Guardrail | Required | `lineage-m1-config-1` | `lineage-m1-config-2` |
|---|---|---|---|
| extinction rate | < 5% | 0.00%  | 0.00%  |
| median population | 90..360 | 421.0 **FAIL** | 256.0  |
| median load — canopy | >= 15 | 189.10 | 117.22 |
| median load — forest_floor | >= 15 | 179.68 | 108.18 |
| median load — shoreline | >= 15 | 51.24 | 30.53 |
| median concentration | <= 0.80 | 0.4615  | 0.4686  |
| all guardrails | — | **FAIL** | PASS |

**No claim is made that the newer configuration is automatically correct.**
`lineage-m1-config-2` was adopted for exactly one reason: `lineage-m1-config-1` misses the
predeclared median-population band. Both capacities are authored model
controls, not ecological claims.

## Reporting status (§21.7)

Every declared guardrail and minimal-functionality requirement in this batch
reports `PASS`. No metric was altered after results were seen. No measured
median is frozen as a future target in this session.
