"""
SIMULATION ENGINE
=================
Contains no biology. All of that is in biology.py.

The population is a numpy array of shape (N, NTRAIT), each value 0..1.
Inheritance is blending + drift. Selection is absolute, not relative, so a
badly matched population genuinely declines instead of just reshuffling.

A "round" is one environment for GENS_PER_ROUND generations. A "run" is a
sequence of rounds.
"""

import numpy as np
import biology as B


# --- tuning knobs (engine-level, not biology) ------------------------------
GENS_PER_ROUND   = 30
BASE_SURVIVAL    = 0.55     # survival for a perfectly average animal
SELECTION_SLOPE  = 0.50     # how hard selection bites
DRIFT            = 0.120    # inheritance noise
MUTATION_RATE    = 0.20     # variation events per individual per generation
MUTATION_SIZE    = 0.30     # size of a variation bump
ASSORTATIVE      = 0.85     # chance of breeding within your own part of the habitat
OFFSPRING_FACTOR = 1.75     # offspring per surviving pair
START_POP        = 140
CAPACITY         = 260
FITNESS_ZERO     = 4.35     # fitness of a well-matched animal; sets the baseline


def performance(pop, eff, weights, scarcity):
    """Absolute fitness for every individual. Shape (N,)."""
    perf = pop @ eff                       # (N, NDIM)
    score = perf @ weights                 # (N,)
    cost = (pop @ B.UPKEEP) * scarcity
    return score - cost


def step(pop, lineage, env_name, rng):
    """One generation. Returns (pop, lineage)."""
    w, eff, scarcity, food = B.env_matrices(env_name)

    fit = performance(pop, eff, w, scarcity)

    # Survival is ABSOLUTE, not relative -- a badly matched population really
    # declines instead of just reshuffling who is best among equals.
    # A logistic curve is used so the fitness gradient is never flattened by
    # clipping: without this, density regulation pushes everyone to the same
    # survival value and selection stops working entirely.
    p_fit = 1.0 / (1.0 + np.exp(-SELECTION_SLOPE * (fit - FITNESS_ZERO)))

    # Density pressure. Food level scales the ceiling. At N = capacity this
    # is neutral; above it, survival falls off smoothly.
    cap = CAPACITY * food
    p = 2.0 * p_fit * (cap / (cap + len(pop)))
    p = np.clip(p, 0.01, 0.95)

    alive = rng.random(len(pop)) < p
    pop, lineage = pop[alive], lineage[alive]

    if len(pop) < 2:
        return pop, lineage

    # Reproduction: two survivors, blended, plus drift.
    #
    # Pairing is partly ASSORTATIVE. Animals that live in the same part of the
    # habitat breed with each other more often than with animals elsewhere.
    # Without this the tracked family's genome converges straight back to the
    # population mean and following a lineage means nothing at all.
    # With it, a followed branch stays genuinely distinct -- which is also
    # what makes the later "these groups no longer interbreed" moment real.
    n_kids = int(len(pop) * (OFFSPRING_FACTOR - 1.0))
    if n_kids > 0:
        i = rng.integers(0, len(pop), n_kids)
        j = rng.integers(0, len(pop), n_kids)

        tracked_idx = np.flatnonzero(lineage == 1)
        other_idx = np.flatnonzero(lineage == 0)
        if len(tracked_idx) > 0 and len(other_idx) > 0:
            same_group = rng.random(n_kids) < ASSORTATIVE
            i_tracked = lineage[i] == 1
            pick_tracked = same_group & i_tracked
            pick_other = same_group & ~i_tracked
            if pick_tracked.any():
                j[pick_tracked] = rng.choice(tracked_idx, pick_tracked.sum())
            if pick_other.any():
                j[pick_other] = rng.choice(other_idx, pick_other.sum())

        kids = (pop[i] + pop[j]) * 0.5
        # Drift scales with v(1-v) so it vanishes at the bounds. Clipping a
        # constant-width noise at zero ratchets every rare trait upward --
        # which put gliding membranes on grassland runners in an earlier build.
        # New variation must come from mutation events, not from bounded noise.
        kids += rng.normal(0, 1.0, kids.shape) * DRIFT * 2.0 * np.sqrt(
            np.clip(kids * (1.0 - kids), 0.0, None))
        kids = np.clip(kids, 0.0, 1.0)
        # A child belongs to the tracked family if either parent did.
        kid_lin = np.maximum(lineage[i], lineage[j])
        pop = np.vstack([pop, kids])
        lineage = np.concatenate([lineage, kid_lin])

    # Variation events. Not filtered by usefulness -- any trait, anywhere.
    n_mut = rng.poisson(MUTATION_RATE * len(pop))
    if n_mut > 0:
        who = rng.integers(0, len(pop), n_mut)
        what = rng.integers(0, B.NTRAIT, n_mut)
        sign = rng.choice([-1.0, 1.0], n_mut)
        pop[who, what] = np.clip(
            pop[who, what] + sign * MUTATION_SIZE * rng.random(n_mut), 0.0, 1.0)

    return pop, lineage


def new_population(rng, n=START_POP):
    base = B.ancestor_vector()
    pop = np.clip(base + rng.normal(0, 0.05, (n, B.NTRAIT)), 0.0, 1.0)
    lineage = np.zeros(n, dtype=np.int8)
    return pop, lineage


def choose_lineage(pop, lineage, trait_idx, rng):
    """
    Tag the descendants of a few animals showing a given variation.
    This is the student tapping: it marks who we FOLLOW. It does not change
    who reproduces.

    Round 1 picks from the whole population. Every round after that picks from
    WITHIN the lineage already being followed -- the student is choosing which
    of their own descendants to follow next, which is what makes the choices
    compound into a branching history instead of resetting each round.
    """
    pool = np.flatnonzero(lineage == 1)
    if len(pool) < 12:                 # first pick, or the branch got too small
        pool = np.arange(len(pop))
    vals = pop[pool, trait_idx]
    candidates = pool[np.argsort(vals)[-25:]]
    # A variation is present in several animals, not one. Following the small
    # group that shows it means the branch is not killed by pure chance.
    n_seed = min(8, len(candidates))
    picks = rng.choice(candidates, size=n_seed, replace=False)
    lineage = np.zeros(len(pop), dtype=np.int8)
    lineage[picks] = 1
    return lineage


def run(sequence, rng, follow_traits=None, gens=GENS_PER_ROUND):
    """
    One full run. follow_traits is a list, one per round: a trait index to
    start tracking that round, or None (the student flagged nothing).

    Returns a dict of results.
    """
    pop, lineage = new_population(rng)
    history = []
    tracked_started = False

    for r, env_name in enumerate(sequence):
        if follow_traits is not None and r < len(follow_traits):
            ft = follow_traits[r]
            if ft is not None and len(pop) > 2:
                lineage = choose_lineage(pop, lineage, ft, rng)
                tracked_started = True

        for _ in range(gens):
            pop, lineage = step(pop, lineage, env_name, rng)
            if len(pop) < 2:
                break

        n_tracked = int(lineage.sum()) if len(pop) else 0
        history.append(dict(round=r, env=env_name, total=len(pop),
                            tracked=n_tracked))
        if len(pop) < 2:
            break

    result = dict(
        history=history,
        extinct_all=len(pop) < 2,
        tracked_started=tracked_started,
        tracked_extinct=tracked_started and (len(pop) < 2 or lineage.sum() < 2),
        final_pop=len(pop),
        final_tracked=int(lineage.sum()) if len(pop) else 0,
    )
    if len(pop) >= 2:
        result["mean_genome"] = pop.mean(axis=0)
        result["forms"] = B.classify(pop.mean(axis=0))
        if lineage.sum() >= 2:
            result["tracked_genome"] = pop[lineage == 1].mean(axis=0)
            result["tracked_forms"] = B.classify(pop[lineage == 1].mean(axis=0))
        else:
            result["tracked_forms"] = []
    else:
        result["forms"] = []
        result["tracked_forms"] = []
    return result
