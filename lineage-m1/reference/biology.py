"""
BIOLOGY TABLE
=============
This file is the design surface. Everything a person would want to tune lives
here. The engine (engine.py) contains no biology at all.

STRUCTURE
  Traits have FIXED functional effects on performance dimensions.
  Environments WEIGHT which dimensions matter.
  Environment MODIFIERS handle the case where a trait's function itself changes
  -- fur failing at depth, smell failing underwater, eyes failing in darkness.

This is deliberately NOT a trait x environment table. A trait does one thing.
The environment decides whether that thing is worth anything.

THE DESIGN LAW
  Every trait must have EITHER a direct trade-off in another dimension,
  OR at least one environment where its function is switched off.
  A trait with a pure benefit and no cost is an upgrade, not an adaptation,
  and it will dominate everywhere. Tested by analyze.py, experiment 2.
"""

import numpy as np

# ---------------------------------------------------------------------------
# PERFORMANCE DIMENSIONS
# ---------------------------------------------------------------------------
# Five was the target. Movement had to split by medium, or webbing cannot
# simultaneously help in water and hurt on land -- which is the whole point.
# UPKEEP is a cost, subtracted rather than weighted.

# "defence" is the sixth dimension. Without it, armour is harmful in every
# environment -- it costs movement and buys nothing the model can see -- which
# made armoured animals impossible and the dragon unreachable. Predation is a
# real pressure and it needs somewhere to live.
DIMS = ["move_land", "move_water", "warmth", "sensing", "feeding", "defence"]
D = {d: i for i, d in enumerate(DIMS)}
NDIM = len(DIMS)


# ---------------------------------------------------------------------------
# TRAITS
# ---------------------------------------------------------------------------
# Every trait is something a mammal body plan could plausibly vary in.
# No trait is filtered by usefulness -- any of these can surface anywhere.
#
# Complex adaptations are NOT traits. Echolocation is click_vocalization +
# high_freq_hearing + directional_hearing. Flight is skin_membrane + a light
# frame. They combine in ENDPOINTS below.

TRAITS = {

    # --- variation that mostly does nothing --------------------------------
    # This block matters more than any single adaptation below it. Without it
    # the pool contains only meaningful traits, and the central lesson of the
    # game -- that most variations do not lead to anything -- is false in the
    # engine no matter how carefully the text is worded.
    "coat_shade":         dict(warmth=+0.15, upkeep=0.0),
    "tail_length":        dict(move_land=+0.15, upkeep=0.02),
    "ear_shape":          dict(sensing=+0.15, upkeep=0.0),
    "whisker_length":     dict(sensing=+0.20, upkeep=0.0),
    "body_spotting":      dict(defence=+0.15, upkeep=0.0),
    "longer_snout":       dict(feeding=+0.20, sensing=+0.10, upkeep=0.03),
    "wider_skull":        dict(feeding=+0.15, upkeep=0.05),
    "pale_belly":         dict(defence=+0.15, upkeep=0.0),
    "extra_vertebra":     dict(move_land=+0.10, move_water=+0.10, upkeep=0.03),
    "hair_whorl":         dict(upkeep=0.0),
    "eye_colour":         dict(upkeep=0.0),
    "toe_length":         dict(move_land=+0.20, move_water=+0.10, upkeep=0.02),
    "jaw_angle":          dict(feeding=+0.20, upkeep=0.04),
    "nostril_width":      dict(sensing=+0.15, upkeep=0.02),

    # --- limbs and locomotion (all have direct trade-offs) ---
    "toe_webbing":        dict(move_land=-1.0, move_water=+1.8, upkeep=0.05),
    "curved_claws":       dict(move_land=+1.6, move_water=-0.7, upkeep=0.10),
    "long_hindlimbs":     dict(move_land=+1.7, move_water=-1.1, defence=+0.5, upkeep=0.30),
    "flexible_wrists":    dict(move_land=+1.2, move_water=-0.5, upkeep=0.08),
    "stiff_forelimbs":    dict(move_land=-1.7, move_water=+1.6, upkeep=0.05),
    "reduced_hindlimbs":  dict(move_land=-2.8, move_water=+1.9, upkeep=-0.15),
    "broad_tail":         dict(move_land=-0.7, move_water=+2.4, upkeep=0.20),
    "prehensile_tail":    dict(move_land=+1.5, move_water=-0.7, upkeep=0.15),
    "skin_membrane":      dict(move_land=+1.3, move_water=-1.2, defence=+0.6, upkeep=0.25),
    "streamlined_body":   dict(move_land=-0.9, move_water=+1.7, upkeep=0.05),
    "digging_forelimbs":  dict(move_land=-0.5, move_water=-1.0, upkeep=0.20),

    # --- skin, fur, thermal ---
    "dense_fur":          dict(warmth=+2.0, move_water=-0.9, upkeep=0.25),
    "sparse_fur":         dict(warmth=-1.6, move_water=+0.9, upkeep=-0.10),
    "subcutaneous_fat":   dict(warmth=+2.1, move_water=-0.2, upkeep=1.05),
    "large_ears":         dict(warmth=-1.3, sensing=+0.9, upkeep=0.10),
    "small_extremities":  dict(warmth=+1.1, move_land=-0.5, upkeep=0.05),
    "armor_plates":       dict(move_land=-1.3, move_water=-1.1, defence=+3.2, upkeep=0.55),

    # --- sensing (each modality is switched off somewhere) ---
    "large_eyes":         dict(sensing=+1.8, upkeep=0.45),
    "reduced_eyes":       dict(sensing=-1.5, upkeep=-0.55),
    "high_freq_hearing":  dict(sensing=+1.0, upkeep=0.38),
    "click_vocalization": dict(sensing=+0.6, upkeep=0.15),
    "directional_hearing":dict(sensing=+0.9, upkeep=0.34),
    "sensitive_whiskers": dict(sensing=+1.4, upkeep=0.46),
    "acute_smell":        dict(sensing=+1.5, upkeep=0.42),

    # --- feeding and physiology (specialised by food type via modifiers) ---
    "strong_jaw":         dict(feeding=+1.5, move_land=-0.3, upkeep=0.62),
    "grinding_teeth":     dict(feeding=+1.6, upkeep=0.46),
    "sharp_teeth":        dict(feeding=+1.6, defence=+0.4, upkeep=0.48),
    "long_tongue":        dict(feeding=+1.3, upkeep=0.50),
    "large_lungs":        dict(move_water=+1.3, move_land=-0.3, upkeep=0.45),
    "slow_metabolism":    dict(move_land=-1.1, move_water=-0.9, upkeep=-0.75),
    "large_body":         dict(warmth=+1.4, move_land=-0.9, feeding=+0.9, defence=+1.6, upkeep=1.30),
    "venom_glands":       dict(feeding=+0.7, defence=+1.5, upkeep=0.58),
}

TRAIT_NAMES = list(TRAITS.keys())
NTRAIT = len(TRAIT_NAMES)
T = {t: i for i, t in enumerate(TRAIT_NAMES)}

EFFECT = np.zeros((NTRAIT, NDIM))
UPKEEP = np.zeros(NTRAIT)
for name, spec in TRAITS.items():
    for k, v in spec.items():
        if k == "upkeep":
            UPKEEP[T[name]] = v
        else:
            EFFECT[T[name], D[k]] = v


# ---------------------------------------------------------------------------
# ENVIRONMENTS
# ---------------------------------------------------------------------------
#   weights   -- how much each performance dimension matters here
#   food      -- baseline resource level (scales carrying capacity)
#   scarcity  -- how harshly upkeep is punished
#   modifiers -- {trait: multiplier} scales the whole trait, OR
#                {trait: {dim: multiplier}} to change one function only.
#                A multiplier of 0.1 means "that does almost nothing here."

_PLANT_FOOD = {"grinding_teeth": 1.5, "long_tongue": 1.3,
               "sharp_teeth": 0.15, "venom_glands": 0.10, "strong_jaw": 0.7}
_ANIMAL_FOOD = {"sharp_teeth": 1.4, "venom_glands": 1.3, "strong_jaw": 1.2,
                "grinding_teeth": 0.15, "long_tongue": 0.4}
_UNDERWATER = {"acute_smell": 0.15, "large_eyes": 0.35,
               "sensitive_whiskers": 1.4, "high_freq_hearing": 1.5,
               "click_vocalization": 1.6, "directional_hearing": 1.4}
_DRY_OPEN = {"sensitive_whiskers": 0.15, "click_vocalization": 0.15,
             "high_freq_hearing": 0.15, "directional_hearing": 0.15}

ENVIRONMENTS = {
    "dense_canopy": dict(
        weights=dict(move_land=1.5, move_water=0.0, warmth=0.4, sensing=0.8, feeding=1.0, defence=0.5),
        food=1.0, scarcity=1.0,
        modifiers={**_PLANT_FOOD, "sensitive_whiskers": 0.4,
                   "digging_forelimbs": 0.2, "click_vocalization": 0.5,
                   "long_hindlimbs": {"move_land": 0.45},
                   "skin_membrane": {"move_land": 0.35},
                   "dense_fur": {"warmth": -0.3},
                   "subcutaneous_fat": {"warmth": -0.2},
                   "high_freq_hearing": 0.6, "directional_hearing": 0.6,
                   "curved_claws": {"move_land": 1.3},
                   "prehensile_tail": {"move_land": 1.3}},
    ),
    "open_woodland": dict(
        weights=dict(move_land=1.2, move_water=0.1, warmth=0.5, sensing=0.9, feeding=1.0, defence=0.8),
        food=1.05, scarcity=1.0,
        modifiers={"grinding_teeth": 1.2, "sensitive_whiskers": 0.4,
                   "digging_forelimbs": 0.5, "venom_glands": 0.6,
                   "dense_fur": {"warmth": 0.4},
                   "high_freq_hearing": 0.5, "directional_hearing": 0.5},
    ),
    "forest_floor": dict(
        weights=dict(move_land=1.0, move_water=0.2, warmth=0.6, sensing=1.1, feeding=1.1, defence=1.0),
        food=1.0, scarcity=1.0,
        modifiers={**_ANIMAL_FOOD, "acute_smell": 1.3, "large_eyes": 0.7},
    ),
    "open_grassland": dict(
        weights=dict(move_land=1.7, move_water=0.0, warmth=0.8, sensing=0.9, feeding=1.1, defence=1.5),
        food=1.1, scarcity=1.15,
        modifiers={**_PLANT_FOOD, **_DRY_OPEN, "large_eyes": 1.3,
                   "digging_forelimbs": 0.4,
                   "curved_claws": {"move_land": -0.3},
                   "prehensile_tail": {"move_land": -0.4},
                   "flexible_wrists": {"move_land": -0.2},
                   "skin_membrane": {"move_land": -0.8},
                   "long_hindlimbs": {"move_land": 1.4},
                   "small_extremities": {"move_land": 0.6, "warmth": 1.2}},
    ),
    "burrow_system": dict(
        # Dark, tight, low food. Eyes are worth nothing; losing them is a saving.
        weights=dict(move_land=1.3, move_water=0.0, warmth=0.9, sensing=1.4, feeding=1.0, defence=0.3),
        food=0.8, scarcity=1.25,
        modifiers={**_ANIMAL_FOOD, "large_eyes": -0.25,
                   "reduced_eyes": {"sensing": 0.05},
                   "digging_forelimbs": {"move_land": -8.0},
                   "sensitive_whiskers": 1.8, "acute_smell": 1.4,
                   "long_hindlimbs": {"move_land": -0.6}, "prehensile_tail": {"move_land": -0.4},
                   "curved_claws": {"move_land": 0.4},
                   "large_body": 0.3, "skin_membrane": {"move_land": -1.0}},
    ),
    "shoreline": dict(
        # Cloudy with sediment. Sight is degraded; touch is better.
        weights=dict(move_land=0.8, move_water=0.9, warmth=0.8, sensing=1.0, feeding=1.1, defence=0.9),
        food=1.15, scarcity=1.0,
        modifiers={**_ANIMAL_FOOD, "large_eyes": 0.4, "sensitive_whiskers": 1.5,
                   "acute_smell": 0.6, "strong_jaw": 1.4},
    ),
    "shallow_sea": dict(
        weights=dict(move_land=0.25, move_water=1.5, warmth=1.2, sensing=1.0, feeding=1.1, defence=1.1),
        food=1.2, scarcity=1.0,
        modifiers={**_ANIMAL_FOOD, **_UNDERWATER, "digging_forelimbs": 0.1,
                   "skin_membrane": 0.3},
    ),
    "open_ocean": dict(
        # No light, so eyes have nothing to gather. Deep water squeezes the air
        # out of fur, so it insulates far less AND drags more.
        weights=dict(move_land=0.05, move_water=1.7, warmth=1.6, sensing=1.3, feeding=1.1, defence=1.3),
        food=1.15, scarcity=1.05,
        modifiers={**_ANIMAL_FOOD, **_UNDERWATER,
                   "large_eyes": -0.20,
                   "reduced_eyes": {"sensing": 0.10},
                   "dense_fur": {"warmth": 0.15, "move_water": 2.0},
                   "high_freq_hearing": 1.9, "click_vocalization": 2.0,
                   "directional_hearing": 1.7,
                   "digging_forelimbs": 0.1, "skin_membrane": 0.2},
    ),
}

ENV_NAMES = list(ENVIRONMENTS.keys())

# Pre-build per-environment matrices once. Environments never change at runtime.
_CACHE = {}
for _en, _e in ENVIRONMENTS.items():
    _w = np.array([_e["weights"][d] for d in DIMS])
    _eff = EFFECT.copy()
    for _trait, _mult in _e["modifiers"].items():
        if isinstance(_mult, dict):
            for _dim, _m in _mult.items():
                _eff[T[_trait], D[_dim]] *= _m
        else:
            _eff[T[_trait]] *= _mult
    _CACHE[_en] = (_w, _eff, _e["scarcity"], _e["food"])


def env_matrices(env_name):
    """Return (weights[NDIM], effect[NTRAIT,NDIM], scarcity, food)."""
    return _CACHE[env_name]


# ---------------------------------------------------------------------------
# ANCESTOR
# ---------------------------------------------------------------------------
ANCESTOR = {
    "curved_claws": 0.55, "prehensile_tail": 0.45, "flexible_wrists": 0.50,
    "dense_fur": 0.45, "large_eyes": 0.40, "acute_smell": 0.35,
    "sharp_teeth": 0.25, "grinding_teeth": 0.30, "long_hindlimbs": 0.25,
}
ANCESTOR_BASE = 0.06


def ancestor_vector():
    v = np.full(NTRAIT, ANCESTOR_BASE)
    for k, val in ANCESTOR.items():
        v[T[k]] = val
    return v


# ---------------------------------------------------------------------------
# ENDPOINT FORMS
# ---------------------------------------------------------------------------
# Recognised by FUNCTIONAL THRESHOLD, not by recipe. Several routes reach each.

ENDPOINTS = {
    # CALIBRATED, not guessed. Every threshold was set from the measured
    # distribution of final population means across 50 runs of the sequence
    # that should reach it. A "need" sits near the 40th-50th percentile, so
    # roughly half of well-played runs arrive and half fall short.
    #
    # There is no "must have lost its fur" clause on the cetacean forms.
    # Blending inheritance leaves fur near 0.45 even after ten ocean rounds;
    # demanding it fall below 0.40 would make the form unreachable. A form is
    # defined by what the body gained, not by what it failed to lose.

    "primate_like": dict(
        need=[("prehensile_tail", .80), ("flexible_wrists", .76), ("curved_claws", .80)],
        avoid=[("toe_webbing", .35), ("skin_membrane", .55)]),

    "glider_like": dict(
        need=[("skin_membrane", .60), ("curved_claws", .70)],
        avoid=[("click_vocalization", .50), ("large_body", .40)]),

    "bat_like": dict(
        need=[("skin_membrane", .55), ("click_vocalization", .45),
              ("high_freq_hearing", .45), ("directional_hearing", .42)],
        avoid=[("large_body", .40)]),

    "mole_like": dict(
        need=[("digging_forelimbs", .80), ("sensitive_whiskers", .76)],
        avoid=[("large_eyes", .45)]),

    "runner_like": dict(
        need=[("long_hindlimbs", .85), ("grinding_teeth", .80),
              ("small_extremities", .40)],
        avoid=[("toe_webbing", .35), ("curved_claws", .55)]),

    "armoured_grazer": dict(
        need=[("armor_plates", .75), ("large_body", .70), ("grinding_teeth", .75)],
        avoid=[("sharp_teeth", .55)]),

    "predator_like": dict(
        need=[("sharp_teeth", .70), ("strong_jaw", .55), ("acute_smell", .65)],
        avoid=[("toe_webbing", .40), ("broad_tail", .40), ("armor_plates", .50)]),

    # The aquatic forms are NESTED, easiest to hardest, so a coastal run
    # almost always lands somewhere rather than on nothing. Requiring five
    # traits to clear at once made cetacean_like a 6% event: even with each
    # threshold at the median, the joint probability collapses. Each form is
    # now defined by the three traits that actually make it recognisable.
    "otter_like": dict(
        need=[("toe_webbing", .40), ("dense_fur", .42), ("streamlined_body", .38)],
        avoid=[("reduced_hindlimbs", .50), ("broad_tail", .66)]),

    "seal_like": dict(
        need=[("subcutaneous_fat", .33), ("streamlined_body", .40),
              ("large_lungs", .32)],
        avoid=[("broad_tail", .62)]),

    "cetacean_like": dict(
        need=[("broad_tail", .55), ("reduced_hindlimbs", .34),
              ("subcutaneous_fat", .35)],
        avoid=[]),

    "dolphin_like": dict(   # cetacean plus all three parts of echolocation
        need=[("broad_tail", .55), ("reduced_hindlimbs", .34),
              ("subcutaneous_fat", .35), ("click_vocalization", .38),
              ("high_freq_hearing", .40), ("directional_hearing", .38)],
        avoid=[]),

    # --- rare recombination. Every part is real and mammalian: bats fly,
    # pangolins are armoured, platypuses and slow lorises are venomous,
    # elephants are large. Nothing here crosses a body plan. The combination
    # is what is mythical, which is also how myths actually get built.
    "dragon_like": dict(
        need=[("skin_membrane", .55), ("armor_plates", .50),
              ("venom_glands", .50), ("large_body", .45)],
        avoid=[]),

    "unicorn_like": dict(   # the UNarmoured giant grazer -- rarer than armoured
        need=[("long_hindlimbs", .85), ("grinding_teeth", .80),
              ("large_body", .70)],
        avoid=[("sharp_teeth", .50), ("armor_plates", .55), ("curved_claws", .55)]),
}


def classify(mean_genome):
    """Every endpoint form whose functional threshold this population meets."""
    found = []
    for name, spec in ENDPOINTS.items():
        ok = all(mean_genome[T[t]] >= v for t, v in spec["need"])
        if ok:
            ok = all(mean_genome[T[t]] < v for t, v in spec["avoid"])
        if ok:
            found.append(name)
    return found


# ---------------------------------------------------------------------------
# ENVIRONMENT SEQUENCES
# ---------------------------------------------------------------------------
SEQUENCES = {
    # A land animal cannot undo many rounds of land adaptation in only two or
    # three. The tail of each sequence has to be long enough for the new
    # environment to actually rework the body.
    "coastal_descent": ["dense_canopy", "open_woodland", "forest_floor",
                        "shoreline", "shoreline", "shallow_sea", "shallow_sea",
                        "shallow_sea", "open_ocean", "open_ocean",
                        "open_ocean", "open_ocean", "open_ocean", "open_ocean"],
    # NOTE: 14 rounds. Blending inheritance halves every selection response,
    # so a body reworked over eight land rounds needs a long tail of water
    # rounds to be reworked back. Shorter sequences leave the animal stranded
    # halfway -- which is itself a legitimate outcome (see otter_like/seal_like).
    "stay_arboreal":   ["dense_canopy", "dense_canopy", "open_woodland",
                        "dense_canopy", "dense_canopy", "open_woodland",
                        "dense_canopy", "dense_canopy", "dense_canopy",
                        "dense_canopy", "dense_canopy", "open_woodland",
                        "dense_canopy", "dense_canopy"],
    "grassland_drift": ["dense_canopy", "open_woodland", "forest_floor",
                        "open_grassland", "open_grassland", "open_grassland",
                        "open_grassland", "open_grassland", "open_grassland",
                        "open_grassland", "open_grassland", "open_grassland",
                        "open_grassland", "open_grassland"],
    "underground":     ["dense_canopy", "open_woodland", "forest_floor",
                        "burrow_system", "burrow_system", "burrow_system",
                        "burrow_system", "burrow_system", "burrow_system",
                        "burrow_system", "burrow_system", "burrow_system",
                        "burrow_system", "burrow_system"],
}
