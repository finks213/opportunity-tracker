// @ts-check
/**
 * Serializable seeded PRNG for LINEAGE Milestone 1.
 *
 * Contract §17 requires:
 *  - a serializable PRNG with explicit state (xoshiro128** with four uint32 words);
 *  - deterministic normal draws (Box-Muller) whose cached spare value and flag
 *    are part of the serialized RNG state;
 *  - never the platform non-deterministic random source;
 *  - cloning a state clones the exact RNG state including the normal cache;
 *  - two independent roots: simRng (biology) and uiRng (interface only).
 *
 * This module is pure numerics. It imports nothing from observer/debug code.
 */

/** Multiply two uint32 values and return a uint32 (avoids 53-bit precision loss). */
function mulu32(a, b) {
  // Split into 16-bit halves to stay exact under Number arithmetic.
  const aHi = a >>> 16;
  const aLo = a & 0xffff;
  const bHi = b >>> 16;
  const bLo = b & 0xffff;
  const lo = aLo * bLo;
  const mid = ((aLo * bHi) + (aHi * bLo)) & 0xffff;
  return ((lo + (mid << 16)) >>> 0);
}

/** 32-bit left rotate. */
function rotl(x, k) {
  return (((x << k) | (x >>> (32 - k))) >>> 0);
}

/**
 * splitmix32: expand a single 32-bit seed into well-mixed 32-bit words used to
 * initialize xoshiro128** state. Deterministic; no platform randomness is used.
 * @param {number} seed
 * @returns {() => number}
 */
function splitmix32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x9e3779b9) >>> 0;
    let z = a;
    z = mulu32(z ^ (z >>> 16), 0x21f0aaad);
    z = mulu32(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/**
 * @typedef {Object} SimRngState
 * @property {[number, number, number, number]} s   xoshiro128** state words
 * @property {boolean} hasSpareNormal                whether spareNormal holds a cached value
 * @property {number} spareNormal                    cached Box-Muller spare normal
 */

export class Rng {
  /**
   * @param {[number, number, number, number]} words
   * @param {boolean} [hasSpareNormal]
   * @param {number} [spareNormal]
   */
  constructor(words, hasSpareNormal = false, spareNormal = 0) {
    /** @type {[number, number, number, number]} */
    this.s = [words[0] >>> 0, words[1] >>> 0, words[2] >>> 0, words[3] >>> 0];
    this.hasSpareNormal = !!hasSpareNormal;
    this.spareNormal = spareNormal;
  }

  /**
   * Frozen constructor: build an RNG deterministically from an integer seed.
   * @param {number} seed
   * @returns {Rng}
   */
  static fromSeed(seed) {
    const sm = splitmix32(seed >>> 0);
    const w = /** @type {[number,number,number,number]} */ ([sm(), sm(), sm(), sm()]);
    // Guard against the all-zero state (xoshiro is undefined there); the
    // splitmix expansion makes this practically impossible, but be explicit.
    if ((w[0] | w[1] | w[2] | w[3]) === 0) {
      w[0] = 0x9e3779b9;
    }
    return new Rng(w, false, 0);
  }

  /** Raw xoshiro128** step. Returns a uint32. */
  nextUint32() {
    const s = this.s;
    const result = mulu32(rotl(mulu32(s[1], 5), 7), 9);
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result >>> 0;
  }

  /**
   * Uniform double in [0, 1). Uses 53 bits of randomness from two uint32 draws
   * for full double resolution.
   * @returns {number}
   */
  nextFloat() {
    const hi = this.nextUint32() >>> 5; // 27 bits
    const lo = this.nextUint32() >>> 6; // 26 bits
    return (hi * 67108864 + lo) / 9007199254740992; // / 2^53
  }

  /**
   * Standard normal draw (mean 0, sd 1) via Box-Muller. The spare value and
   * its flag are part of serializable RNG state (contract §17).
   * @returns {number}
   */
  nextNormal() {
    if (this.hasSpareNormal) {
      this.hasSpareNormal = false;
      return this.spareNormal;
    }
    // Draw two uniforms in (0,1]; guard u1 away from 0 for log().
    let u1 = this.nextFloat();
    const u2 = this.nextFloat();
    if (u1 < 1e-300) u1 = 1e-300;
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);
    this.spareNormal = z1;
    this.hasSpareNormal = true;
    return z0;
  }

  /** Deep clone including normal cache. */
  clone() {
    return new Rng(
      /** @type {[number,number,number,number]} */ ([this.s[0], this.s[1], this.s[2], this.s[3]]),
      this.hasSpareNormal,
      this.spareNormal
    );
  }

  /**
   * Serialize to a plain, JSON-safe object. Included in canonical biological
   * serialization for simRng.
   * @returns {SimRngState}
   */
  toState() {
    return {
      s: [this.s[0], this.s[1], this.s[2], this.s[3]],
      hasSpareNormal: this.hasSpareNormal,
      spareNormal: this.spareNormal,
    };
  }

  /**
   * @param {SimRngState} state
   * @returns {Rng}
   */
  static fromState(state) {
    return new Rng(
      /** @type {[number,number,number,number]} */ (state.s),
      state.hasSpareNormal,
      state.spareNormal
    );
  }
}

/**
 * Frozen simulation RNG constructor referenced by fixture hydration (§19 C).
 * @param {number} trajectorySeed
 * @returns {Rng}
 */
export function createSimRng(trajectorySeed) {
  return Rng.fromSeed(trajectorySeed);
}

/**
 * Independent UI RNG root (Canvas jitter, manual-test ordering). Never touches
 * biological state (§17).
 * @param {number} seed
 * @returns {Rng}
 */
export function createUiRng(seed) {
  return Rng.fromSeed(seed);
}
