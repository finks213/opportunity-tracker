// @ts-check
/**
 * Small deterministic numeric helpers shared by the biological core.
 * Pure functions only; no RNG, no observer state.
 */

/**
 * Clamp x to [lo, hi].
 * @param {number} x
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(x, lo, hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/**
 * Logistic function 1 / (1 + exp(-slope * (x - x0))).
 * @param {number} x
 * @param {number} slope
 * @param {number} x0
 * @returns {number}
 */
export function logistic(x, slope, x0) {
  return 1 / (1 + Math.exp(-slope * (x - x0)));
}

/**
 * Dot product of two equal-length numeric arrays.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {number}
 */
export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Index of the maximum value with deterministic first-wins tie-breaking in the
 * array's natural order (contract §5.4 relies on canonical zone order).
 * @param {ArrayLike<number>} a
 * @returns {number}
 */
export function argmax(a) {
  let best = 0;
  for (let i = 1; i < a.length; i++) {
    if (a[i] > a[best]) best = i;
  }
  return best;
}

/**
 * Ordinary median per contract §19.4 / §21.4: sort ascending, and for an even
 * count average the two central values (one-based positions n/2 and n/2+1).
 * Does not mutate the input.
 * @param {number[]} values
 * @returns {number}
 */
export function ordinaryMedian(values) {
  if (values.length === 0) throw new Error("ordinaryMedian: empty input");
  const v = values.slice().sort((x, y) => x - y);
  const n = v.length;
  if (n % 2 === 1) return v[(n - 1) / 2];
  const hi = n / 2; // one-based upper-middle index
  return (v[hi - 1] + v[hi]) / 2;
}
