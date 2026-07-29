// @ts-check
/**
 * Debug probe controls (contract §22): pause, step one generation, run
 * continuously, reset seed, load the defining fixture, toggle raw values,
 * create observer tracer channels, and the two deterministic manual-test modes
 * required by the iPad gate.
 *
 * Controls mutate observer/UI state and drive the simulation loop. They never
 * touch simRng and never alter biological records.
 */

import { createUiRng } from "../core/rng.js";

/** Fixed manual-test seed declared by §22 for the legibility pair order. */
export const MANUAL_TEST_UI_SEED = 32001;

/**
 * Build the ten randomized high-versus-low webbing pairs for legibility mode.
 *
 * The pair ORDER uses uiRng with the fixed manual-test seed 32001 (§22) and
 * never touches biological state.
 *
 * The high/low SIDE assignment is balanced by construction — exactly five
 * high-left and five high-right — rather than drawn independently per row. An
 * independent per-row draw at this fixed seed produced nine high-left rows,
 * which would let a tester score 9/10 by always choosing the same side and
 * would make the ">= 8 of 10" pass law measure side bias instead of legibility.
 * Balancing keeps the check deterministic, seeded as the contract requires, and
 * genuinely diagnostic.
 *
 * @param {number[]} highIds
 * @param {number[]} lowIds
 * @returns {Array<{left:number, right:number, highIsLeft:boolean}>}
 */
export function buildLegibilityPairs(highIds, lowIds) {
  const rng = createUiRng(MANUAL_TEST_UI_SEED);
  const pairs = [];
  for (let i = 0; i < 10; i++) {
    const high = highIds[Math.min(Math.floor(rng.nextFloat() * highIds.length), highIds.length - 1)];
    const low = lowIds[Math.min(Math.floor(rng.nextFloat() * lowIds.length), lowIds.length - 1)];
    const highIsLeft = i < 5; // balanced by construction, then shuffled below
    pairs.push({
      left: highIsLeft ? high : low,
      right: highIsLeft ? low : high,
      highIsLeft,
    });
  }
  // Seeded Fisher-Yates over the ten pairs: the presentation order is
  // randomized by uiRng(32001) while the 5/5 side balance is preserved.
  for (let i = pairs.length - 1; i >= 1; i--) {
    const j = Math.floor(rng.nextFloat() * (i + 1));
    const tmp = pairs[i];
    pairs[i] = pairs[j];
    pairs[j] = tmp;
  }
  return pairs;
}

/**
 * Wire DOM controls to a probe application.
 * @param {Object} app the application object from main.js
 * @param {Document} doc
 */
export function wireControls(app, doc) {
  const byId = (id) => doc.getElementById(id);

  byId("btn-pause")?.addEventListener("click", () => app.setRunning(false));
  byId("btn-run")?.addEventListener("click", () => app.setRunning(true));
  byId("btn-step")?.addEventListener("click", () => app.stepOnce());
  byId("btn-reset")?.addEventListener("click", () => {
    const seed = Number(/** @type {HTMLInputElement} */ (byId("seed-input")).value) || 1;
    app.resetRandomWorld(seed);
  });
  byId("btn-fixture")?.addEventListener("click", () => app.loadDefiningFixture());
  byId("btn-fixture-high")?.addEventListener("click", () => app.loadDefiningFixture({ highWebbing: true }));

  byId("toggle-raw")?.addEventListener("change", (e) => {
    app.setShowRawValues(/** @type {HTMLInputElement} */ (e.target).checked);
  });

  byId("btn-tracer-canopy")?.addEventListener("click", () => app.createTracer("canopy-focal", "canopy"));
  byId("btn-tracer-shoreline")?.addEventListener("click", () => app.createTracer("shoreline-focal", "shoreline"));
  byId("btn-tracer-clear")?.addEventListener("click", () => app.clearTracers());

  byId("btn-mode-legibility")?.addEventListener("click", () => app.setManualTestMode("legibility"));
  byId("btn-mode-stress")?.addEventListener("click", () => app.setManualTestMode("render-stress"));
  byId("btn-mode-normal")?.addEventListener("click", () => app.setManualTestMode(null));

  byId("channel-select")?.addEventListener("change", (e) => {
    app.setActiveChannel(/** @type {HTMLSelectElement} */ (e.target).value || null);
  });
}
