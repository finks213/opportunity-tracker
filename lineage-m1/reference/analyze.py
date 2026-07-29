"""
BATCH ANALYSIS
==============
Runs the engine thousands of times and reports whether the biology produces
the lesson. Half the tuning problem is arithmetic and never needs children.

Questions answered:
  1. What fraction of variations land neutral?      (should be MOST)
  2. How often does a tracked lineage die?          (some, not always)
  3. Does any trait dominate everywhere?            (should be NO)
  4. Are the endpoint forms reachable?              (yes, in 8-10 rounds)
  5. How rare are the rare forms?                   (rare)
"""

import numpy as np
from collections import Counter, defaultdict
import biology as B
import engine as E

SEED_RUNS = 250


NEUTRAL_BAND = 0.02   # survival change smaller than 2 percentage points = neutral
EXPRESSED    = 0.70   # a realistically expressed new variation


def bar(frac, width=34):
    n = int(round(frac * width))
    return "#" * n + "." * (width - n)


# ---------------------------------------------------------------------------
def exp1_neutrality():
    print("=" * 72)
    print("1. HOW MANY VARIATIONS ACTUALLY MATTER?")
    print("=" * 72)
    print("Effect on survival of a new variation appearing, across every")
    print("trait in every environment. Measured as change in survival chance.\n")

    base = B.ancestor_vector()
    deltas = []
    per_env = defaultdict(list)
    per_trait = defaultdict(list)

    for env in B.ENV_NAMES:
        w, eff, scarcity, food = B.env_matrices(env)
        for tname in B.TRAIT_NAMES:
            ti = B.T[tname]
            g0 = base.copy(); g0[ti] = 0.0
            g1 = base.copy(); g1[ti] = EXPRESSED
            f0 = E.performance(g0[None, :], eff, w, scarcity)[0]
            f1 = E.performance(g1[None, :], eff, w, scarcity)[0]
            # survival is logistic in fitness; near the baseline the
            # slope is SELECTION_SLOPE * p(1-p) = SLOPE * 0.25
            d = E.SELECTION_SLOPE * 0.25 * (f1 - f0)
            deltas.append(d)
            per_env[env].append(d)
            per_trait[tname].append(d)

    deltas = np.array(deltas)
    neutral = np.abs(deltas) < NEUTRAL_BAND
    helpful = deltas >= NEUTRAL_BAND
    harmful = deltas <= -NEUTRAL_BAND

    n = len(deltas)
    print(f"  {len(B.TRAIT_NAMES)} traits x {len(B.ENV_NAMES)} environments = {n} cases\n")
    print(f"  NEUTRAL (barely matters)   {neutral.sum():4d}   {neutral.mean():5.1%}  {bar(neutral.mean())}")
    print(f"  HELPFUL                    {helpful.sum():4d}   {helpful.mean():5.1%}  {bar(helpful.mean())}")
    print(f"  HARMFUL                    {harmful.sum():4d}   {harmful.mean():5.1%}  {bar(harmful.mean())}")

    strong = np.abs(deltas) > 0.08
    print(f"\n  Strongly consequential either way: {strong.sum()} of {n} ({strong.mean():.1%})")
    print(f"  Median absolute effect on survival: {np.median(np.abs(deltas)):.3f}")

    print("\n  -- Per environment, share of variations that barely matter --")
    for env in B.ENV_NAMES:
        arr = np.array(per_env[env])
        frac = (np.abs(arr) < NEUTRAL_BAND).mean()
        print(f"    {env:<16} {frac:5.1%}  {bar(frac, 26)}")

    return per_trait


# ---------------------------------------------------------------------------
def exp2_dominance(per_trait):
    print("\n" + "=" * 72)
    print("2. DOES ANY TRAIT DOMINATE EVERYWHERE?")
    print("=" * 72)
    print("A trait that helps in every environment would be an upgrade, not")
    print("an adaptation. Each trait's effect across all 8 environments.\n")

    rows = []
    for t, ds in per_trait.items():
        ds = np.array(ds)
        good = (ds >= NEUTRAL_BAND).sum()
        bad = (ds <= -NEUTRAL_BAND).sum()
        rows.append((t, good, bad, ds.mean(), np.abs(ds).max()))
    rows.sort(key=lambda r: -r[1])

    print(f"  {'trait':<22}{'helps in':>9}{'hurts in':>10}{'mean':>9}{'peak':>8}")
    print("  " + "-" * 58)
    for t, g, b, m, pk in rows[:14] + rows[-6:]:
        # Helping "everywhere" only matters if the effect is big enough
        # to notice. A trait worth 0.02 survival in all 8 places is not
        # an upgrade, it is noise.
        flag = "  <-- DOMINANT" if (g >= 7 and pk > 0.05) else ""
        print(f"  {t:<22}{g:>6}/8 {b:>7}/8 {m:>+9.3f}{pk:>8.3f}{flag}")

    dominant = [r[0] for r in rows if r[1] >= 7 and r[4] > 0.05]
    print()
    if dominant:
        print(f"  PROBLEM: {len(dominant)} trait(s) help almost everywhere: {dominant}")
    else:
        print("  OK: no trait helps in 7 or more of the 8 environments.")


# ---------------------------------------------------------------------------
def exp3_outcomes(n_runs=SEED_RUNS, seed=1):
    print("\n" + "=" * 72)
    print("3. WHAT HAPPENS TO A LINEAGE THE STUDENT FOLLOWS?")
    print("=" * 72)
    print("Coastal sequence. Compares tapping at random against tapping the")
    print("variation that suits the water -- the difference between the two is")
    print("whether reasoning is worth anything.\n")

    water = [B.T[t] for t in ["toe_webbing", "streamlined_body", "broad_tail",
                              "large_lungs", "reduced_hindlimbs", "stiff_forelimbs",
                              "subcutaneous_fat", "click_vocalization",
                              "high_freq_hearing", "directional_hearing"]]
    land = [B.T[t] for t in ["curved_claws", "prehensile_tail", "long_hindlimbs",
                             "skin_membrane", "digging_forelimbs", "large_eyes",
                             "grinding_teeth", "dense_fur"]]
    seq = B.SEQUENCES["coastal_descent"]

    for label, pool in [("taps at random", None),
                        ("taps water-suited variations", water),
                        ("taps land-suited variations", land)]:
        rng = np.random.default_rng(seed)
        out = Counter()
        for _ in range(n_runs):
            follows = []
            for _ in seq:
                if rng.random() < 0.55:
                    follows.append(int(rng.integers(0, B.NTRAIT)) if pool is None
                                   else int(rng.choice(pool)))
                else:
                    follows.append(None)
            r = E.run(seq, rng, follow_traits=follows)
            if r["extinct_all"]:
                out["world died"] += 1
            elif r["final_tracked"] < 2:
                out["followed lineage died out"] += 1
            elif r["final_tracked"] > r["final_pop"] * 0.5:
                out["followed lineage spread widely"] += 1
            else:
                out["followed lineage persisted"] += 1
        print(f"  student {label}")
        for k in ["followed lineage spread widely", "followed lineage persisted",
                  "followed lineage died out", "world died"]:
            v = out.get(k, 0)
            print(f"     {k:<32}{v/n_runs:6.1%}  {bar(v/n_runs, 20)}")
        print()


def exp4_stasis(n_runs=SEED_RUNS, seed=2):
    print("\n" + "=" * 72)
    print("4. IF THE STUDENT FOLLOWS NOTHING, DO THEY GET PUNISHED?")
    print("=" * 72)
    print("Following nothing must not itself cause decline -- that teaches")
    print("upgrade-or-die. Comparing follow-nothing against follow-randomly.\n")

    seq = B.SEQUENCES["coastal_descent"]

    for label, rate in [("follows NOTHING", 0.0), ("follows randomly", 0.55)]:
        rng = np.random.default_rng(seed)
        survived, pops = 0, []
        for _ in range(n_runs):
            follows = [rng.integers(0, B.NTRAIT) if rng.random() < rate else None
                       for _ in seq]
            r = E.run(seq, rng, follow_traits=follows)
            if not r["extinct_all"]:
                survived += 1
                pops.append(r["final_pop"])
        med = int(np.median(pops)) if pops else 0
        print(f"  {label:<20} population survived {survived/n_runs:6.1%}   "
              f"median final size {med}")

    print("\n  These should be nearly identical. The world runs either way;")
    print("  what the student tracks changes what they LEARN, not who lives.")


# ---------------------------------------------------------------------------
def exp5_forms(n_runs=SEED_RUNS, seed=3):
    print("\n" + "=" * 72)
    print("5. WHICH FORMS ARE REACHABLE, AND HOW OFTEN?")
    print("=" * 72)
    print("Forms are recognised by functional threshold, not by recipe.")
    print(f"{n_runs} runs per environment sequence.\n")

    for seq_name, seq in B.SEQUENCES.items():
        rng = np.random.default_rng(seed)
        found = Counter()
        alive = 0
        for _ in range(n_runs):
            follows = [rng.integers(0, B.NTRAIT) if rng.random() < 0.55 else None
                       for _ in seq]
            r = E.run(seq, rng, follow_traits=follows)
            if r["extinct_all"]:
                continue
            alive += 1
            for f in set(r["forms"]) | set(r.get("tracked_forms", [])):
                found[f] += 1

        print(f"  [{seq_name}]  ({alive} surviving runs)")
        if not found:
            print("     nothing reached a recognised form")
        for f, c in found.most_common():
            print(f"     {f:<18}{c:5d}  {c/max(alive,1):6.1%}  {bar(c/max(alive,1), 18)}")
        print()


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    pt = exp1_neutrality()
    exp2_dominance(pt)
    exp3_outcomes()
    exp4_stasis()
    exp5_forms()
