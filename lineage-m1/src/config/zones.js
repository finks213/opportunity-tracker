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
export const ZONES = /** @type {const} */ (["canopy", "forest_floor", "shoreline"]);

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
  [1],
  [0, 2],
  [1],
]);

/**
 * Provisional carrying capacities (contract §6). Model controls, not ecological
 * claims. Fixed before characterization.
 * @type {readonly [number, number, number]}
 */
export const ZONE_CAPACITY = Object.freeze([90, 90, 90]);

/**
 * Simple Canvas regions (fractions of the canvas width). Debug probe only;
 * never feeds back into biology.
 */
export const ZONE_CANVAS_REGIONS = Object.freeze([
  { id: "canopy", x0: 0.0, x1: 1 / 3 },
  { id: "forest_floor", x0: 1 / 3, x1: 2 / 3 },
  { id: "shoreline", x0: 2 / 3, x1: 1.0 },
]);
