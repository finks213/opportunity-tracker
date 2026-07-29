// @ts-check
/**
 * Zone definitions for LINEAGE Milestone 1 (contract §6).
 *
 * Exactly three simultaneous zones with the adjacency graph:
 *   canopy <-> forest_floor <-> shoreline
 * There is no canopy-to-shoreline edge.
 *
 * Zone order is canonical and load-bearing everywhere in the engine.
 */

/** @type {readonly ["canopy","forest_floor","shoreline"]} */
export const ZONES = Object.freeze(/** @type {const} */ (["canopy", "forest_floor", "shoreline"]));

/** Canonical zone index lookup. */
export const ZONE_INDEX = Object.freeze({
  canopy: 0,
  forest_floor: 1,
  shoreline: 2,
});

/**
 * Adjacency as index neighbour lists in canonical zone order.
 * canopy(0)~forest_floor(1); forest_floor(1)~canopy(0),shoreline(2); shoreline(2)~forest_floor(1).
 * @type {readonly number[][]}
 */
export const ZONE_NEIGHBORS = Object.freeze([
  Object.freeze([1]),
  Object.freeze([0, 2]),
  Object.freeze([1]),
]);

// NOTE (revision-3 repair): a `ZONE_CAPACITY = [90,90,90]` constant was
// previously exported here while the operative configuration used [55,55,55].
// That was a second, stale source of truth for a superseded value. Zone
// capacities now live ONLY in the versioned model configuration
// (`currentModelConfig.zoneCapacity`, mirrored into the canonical model
// definition), so there is exactly one authority.

/**
 * Simple Canvas regions (fractions of the canvas width). Debug probe only;
 * never feeds back into biology.
 */
export const ZONE_CANVAS_REGIONS = Object.freeze([
  { id: "canopy", x0: 0.0, x1: 1 / 3 },
  { id: "forest_floor", x0: 1 / 3, x1: 2 / 3 },
  { id: "shoreline", x0: 2 / 3, x1: 1.0 },
]);
