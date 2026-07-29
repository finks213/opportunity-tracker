// @ts-check
/**
 * Trait and performance-dimension definitions (contract §8 and §9).
 *
 * Exactly ten body traits in canonical order: seven meaningful, three neutral.
 * Each value is a continuous number in [0,1].
 *
 * The performance layer is an explicit body-trait -> performance mapping
 * followed by zone weighting (contract §9). It is deliberately NOT a primary
 * trait x zone table.
 */

/** Canonical trait order (contract §8). Indices 0..6 meaningful, 7..9 neutral. */
export const TRAITS = /** @type {const} */ ([
  "toe_webbing",       // 0
  "curved_claws",      // 1
  "dense_fur",         // 2
  "long_hindlimbs",    // 3
  "strong_tail",       // 4
  "large_eyes",        // 5
  "streamlined_body",  // 6
  "coat_shade",        // 7 neutral
  "ear_tip_shape",     // 8 neutral
  "tail_tip_marking",  // 9 neutral
]);

export const TRAIT_INDEX = Object.freeze(
  Object.fromEntries(TRAITS.map((t, i) => [t, i]))
);

export const NUM_TRAITS = TRAITS.length; // 10

/** Indices of the seven meaningful traits. */
export const MEANINGFUL_TRAIT_INDICES = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
/** Indices of the three neutral traits. */
export const NEUTRAL_TRAIT_INDICES = Object.freeze([7, 8, 9]);

/** Canonical performance dimensions (contract §9). */
export const PERFORMANCE_DIMENSIONS = /** @type {const} */ ([
  "canopy_grip",             // 0
  "land_mobility",           // 1
  "aquatic_propulsion",      // 2
  "aquatic_drag_reduction",  // 3
  "thermal_retention",       // 4
  "visual_sensing",          // 5
  "energy_efficiency",       // 6
]);

export const NUM_DIMENSIONS = PERFORMANCE_DIMENSIONS.length; // 7

const CG = 0, LM = 1, WP = 2, DR = 3, TH = 4, VS = 5, EE = 6;

/**
 * EFFECT[trait][dim]: linear contribution of a trait value in [0,1] to each
 * performance dimension. Neutral traits (7,8,9) are all zeros by construction,
 * which is what makes the neutral-trait invariant (§20.4) hold exactly.
 *
 * Authored relations required by §9 (these are model assumptions, not validated
 * biology):
 *  - toe_webbing       + aquatic_propulsion, - canopy_grip, small energy cost
 *  - curved_claws      + canopy_grip, - aquatic_propulsion, energy cost
 *  - dense_fur         + thermal_retention, - aquatic_drag_reduction (more drag), energy cost
 *  - long_hindlimbs    + land_mobility, - aquatic_drag_reduction, energy cost
 *  - strong_tail       + aquatic_propulsion, - land_mobility (land control cost), energy cost
 *  - large_eyes        + visual_sensing, energy cost
 *  - streamlined_body  + aquatic_drag_reduction, - canopy_grip (climbing/turning)
 *
 * The "energy_efficiency" dimension carries the "energy" half of each trait's
 * cost; the flat "upkeep" half lives in UPKEEP below (§10 subtracts upkeep after
 * weighting). Both channels are genuinely used.
 *
 * @type {number[][]}
 */
export const EFFECT = buildEffect();

function buildEffect() {
  const E = [];
  for (let i = 0; i < NUM_TRAITS; i++) E.push(new Array(NUM_DIMENSIONS).fill(0));
  //                    CG     LM     WP     DR     TH     VS     EE
  E[0][CG] = -1.5;  E[0][WP] = 2.0;  E[0][EE] = -0.15;                 // toe_webbing
  E[1][CG] = 1.6;   E[1][WP] = -0.6; E[1][EE] = -0.30;                 // curved_claws
  E[2][DR] = -1.0;  E[2][TH] = 2.0;  E[2][EE] = -0.30;                 // dense_fur
  E[3][LM] = 1.6;   E[3][DR] = -1.0; E[3][EE] = -0.40;                 // long_hindlimbs
  E[4][LM] = -0.5;  E[4][WP] = 1.2;  E[4][EE] = -0.25;                 // strong_tail
  E[5][VS] = 1.8;   E[5][EE] = -0.60;                                  // large_eyes
  E[6][CG] = -0.8;  E[6][DR] = 1.6;  E[6][EE] = -0.10;                 // streamlined_body
  // traits 7,8,9 remain all-zero (neutral).
  return E;
}

/**
 * Flat metabolic upkeep per trait (positive cost), subtracted after zone
 * weighting and scaled by zone scarcity (§10 step 3). Neutral traits cost zero.
 * @type {number[]}
 */
export const UPKEEP = Object.freeze([
  0.05, // toe_webbing
  0.10, // curved_claws
  0.15, // dense_fur
  0.15, // long_hindlimbs
  0.10, // strong_tail
  0.25, // large_eyes
  0.05, // streamlined_body
  0.0,  // coat_shade (neutral)
  0.0,  // ear_tip_shape (neutral)
  0.0,  // tail_tip_marking (neutral)
]);
