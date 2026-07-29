// @ts-check
/**
 * Debug probe application entry point (contract §22).
 *
 * This is NOT the student game. It exists only to answer whether a human can
 * see the biological difference the model claims to produce, and to host the
 * two deterministic manual-test modes the iPad gate requires.
 *
 * Strict separation: biology advances through advanceGeneration with simRng;
 * every UI concern uses uiRng and observer state.
 */

import { createInitialState } from "./core/individual.js";
import { advanceGeneration } from "./core/simulation.js";
import { currentModelConfig } from "./config/modelConfig.js";
import { TRAIT_INDEX } from "./config/traits.js";
import {
  parseEnvelope,
  hydrateDefiningFixtureV1,
  applyWebbingOverride,
  assertFixtureConsistency,
} from "./fixtures/definingFixtureV1.js";
import {
  createObserverState,
  createTracerChannel,
  tracerBirthHook,
} from "./observer/tracerChannels.js";
import { zoneBinCounts } from "./observer/currentZoneBins.js";
import { CanvasProbe } from "./debug/canvasProbe.js";
import { renderInspector } from "./debug/inspector.js";
import { wireControls, buildLegibilityPairs, MANUAL_TEST_UI_SEED } from "./debug/controls.js";
import { FrameMeter, environmentSnapshot } from "./debug/desktopMeasure.js";
import { drawAnimal } from "./debug/animalGlyph.js";

const GENERATION_INTERVAL_MS = 500;

class ProbeApp {
  constructor(canvas, doc) {
    this.doc = doc;
    this.probe = new CanvasProbe(canvas, 1);
    this.observer = createObserverState();
    this.state = createInitialState(1, currentModelConfig);
    this.running = false;
    this.selectedId = null;
    this.showRawValues = false;
    this.manualTestMode = null;
    this.fixtureEnvelope = null;
    this.lastAdvance = 0;
    this.meter = new FrameMeter();
    this.meter.start(0);
    this.seed = 1;

    canvas.addEventListener("click", (ev) => {
      const rect = canvas.getBoundingClientRect();
      const id = this.probe.hitTest(ev.clientX - rect.left, ev.clientY - rect.top);
      this.selectedId = id;
      this.observer.inspectedIds = id === null ? [] : [id];
      this.renderPanels();
    });

    globalThis.addEventListener("resize", () => this.probe.resize());
  }

  // ---- controls ----
  setRunning(v) { this.running = v; this.meter.markInput(); this.updateStatus(); }
  stepOnce() { this.meter.markInput(); this.advance(); this.renderPanels(); }
  setShowRawValues(v) { this.showRawValues = v; this.renderPanels(); }
  setActiveChannel(id) { this.observer.activeChannel = id; this.renderPanels(); }
  clearTracers() { this.observer.channels.clear(); this.observer.activeChannel = null; this.refreshChannelSelect(); }

  resetRandomWorld(seed) {
    this.meter.markInput();
    this.seed = seed;
    this.state = createInitialState(seed, currentModelConfig);
    this.observer = createObserverState();
    this.probe.jitter.clear();
    this.selectedId = null;
    this.manualTestMode = null;
    this.refreshChannelSelect();
    this.renderPanels();
  }

  async loadDefiningFixture(opts = {}) {
    this.meter.markInput();
    if (!this.fixtureEnvelope) {
      const response = await fetch("./fixtures/defining_fixture_v1.json");
      const text = await response.text();
      this.fixtureEnvelope = parseEnvelope(text);
      assertFixtureConsistency(this.fixtureEnvelope);
    }
    const env = this.fixtureEnvelope;
    this.state = hydrateDefiningFixtureV1(env, this.seed, currentModelConfig);
    if (opts.highWebbing) {
      // Fixture construction operation, before generation 1 (§19.2).
      applyWebbingOverride(this.state, env.canopyFocalIds, env.highWebbing);
      applyWebbingOverride(this.state, env.shorelineFocalIds, env.highWebbing);
    }
    this.observer = createObserverState();
    this.probe.jitter.clear();
    this.selectedId = null;
    this.refreshChannelSelect();
    this.renderPanels();
  }

  createTracer(channelId, which) {
    this.meter.markInput();
    const env = this.fixtureEnvelope;
    let founders;
    if (env && which === "canopy") founders = env.canopyFocalIds;
    else if (env && which === "shoreline") founders = env.shorelineFocalIds;
    else {
      // Random world: seed from the strongest current bin members.
      const bin = which === "canopy" ? 0 : 2;
      founders = this.state.currentIndividuals
        .filter((i) => i.timeAllocation[bin] >= 0.5)
        .slice(0, 12)
        .map((i) => i.id);
    }
    createTracerChannel(this.observer, channelId, founders, this.state.currentIndividuals.map((i) => i.id));
    this.refreshChannelSelect();
    this.renderPanels();
  }

  setManualTestMode(mode) {
    this.meter.markInput();
    this.manualTestMode = mode;
    if (mode === "render-stress") {
      // Exactly 360 simultaneously visible glyphs (§22). Rendering benchmark
      // only: it does not alter the biological acceptance model, so it runs on
      // a throwaway state built purely for drawing.
      this.running = false;
      this.meter.start(30000);
    }
    this.renderPanels();
  }

  // ---- simulation ----
  advance() {
    if (this.state.currentIndividuals.length === 0) return;
    advanceGeneration(this.state, currentModelConfig, {
      onBirth: tracerBirthHook(this.observer),
    });
  }

  // ---- rendering ----
  frame(timestamp) {
    if (this.running && timestamp - this.lastAdvance >= GENERATION_INTERVAL_MS) {
      this.advance();
      this.lastAdvance = timestamp;
      this.renderPanels();
    }
    if (this.manualTestMode === "render-stress") this.renderStress();
    else if (this.manualTestMode === "legibility") this.renderLegibility();
    else this.probe.render(this.state, { observer: this.observer, selectedId: this.selectedId });
    this.meter.tick();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Render-stress mode: exactly 360 procedural glyphs across the three regions. */
  renderStress() {
    const ctx = this.probe.ctx;
    const W = this.probe.cssWidth;
    const H = this.probe.cssHeight;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#141a16";
    ctx.fillRect(0, 0, W, H);
    const perZone = 120; // 3 x 120 = exactly 360 glyphs
    const rng = this.probe.uiRng;
    for (let z = 0; z < 3; z++) {
      const x0 = (z / 3) * W + 8;
      const w = W / 3 - 16;
      const cols = 12;
      for (let i = 0; i < perZone; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const genome = [
          (i % 10) / 10, ((i + 3) % 10) / 10, ((i + 5) % 10) / 10, ((i + 7) % 10) / 10,
          ((i + 2) % 10) / 10, ((i + 4) % 10) / 10, ((i + 6) % 10) / 10,
          ((i + 1) % 10) / 10, ((i + 8) % 10) / 10, ((i + 9) % 10) / 10,
        ];
        drawAnimal(ctx, x0 + col * (w / cols) + w / cols / 2, 30 + row * ((H - 60) / (perZone / cols)), 12, genome, {});
      }
    }
    ctx.fillStyle = "#f0f2f4";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillText("render-stress mode — exactly 360 procedural glyphs (rendering benchmark only)", 14, 10);
  }

  /** Legibility mode: ten randomized high-vs-low webbing pairs, uiRng seed 32001. */
  renderLegibility() {
    const ctx = this.probe.ctx;
    const W = this.probe.cssWidth;
    const H = this.probe.cssHeight;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#181d22";
    ctx.fillRect(0, 0, W, H);
    const env = this.fixtureEnvelope;
    const base = env ? env.baselineBodyGenome : currentModelConfig.ancestorBodyGenome;
    const high = base.slice(); high[TRAIT_INDEX.toe_webbing] = env ? env.highWebbing : 0.75;
    const low = base.slice(); low[TRAIT_INDEX.toe_webbing] = env ? env.lowWebbing : 0.15;
    const pairs = buildLegibilityPairs([1], [2]); // deterministic order, seed 32001
    ctx.fillStyle = "#f0f2f4";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillText(`legibility mode — which animal has wider feet? (uiRng seed ${MANUAL_TEST_UI_SEED})`, 14, 10);
    const rowH = (H - 50) / 10;
    for (let i = 0; i < pairs.length; i++) {
      const y = 45 + i * rowH + rowH / 2;
      const leftGenome = pairs[i].highIsLeft ? high : low;
      const rightGenome = pairs[i].highIsLeft ? low : high;
      // Drawn as large as the row allows: the human tester must score >= 8/10
      // on this comparison without any raw trait values (§22 pass law).
      const glyphScale = Math.min(46, rowH * 0.86);
      drawAnimal(ctx, W * 0.30, y, glyphScale, leftGenome, {});
      drawAnimal(ctx, W * 0.70, y, glyphScale, rightGenome, {});
      ctx.fillStyle = "#9aa4ad";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`${i + 1}`, 16, y - 6);
    }
  }

  renderPanels() {
    const doc = this.doc;
    const counts = zoneBinCounts(this.state.currentIndividuals);
    const statusEl = doc.getElementById("status");
    if (statusEl) {
      statusEl.textContent =
        `generation ${this.state.generation} · ${this.state.currentIndividuals.length} living · ` +
        `canopy ${counts[0]} · forest floor ${counts[1]} · shoreline ${counts[2]}`;
    }
    const inspectorEl = doc.getElementById("inspector");
    if (inspectorEl) {
      const individual = this.selectedId === null
        ? null
        : this.state.currentIndividuals.find((i) => i.id === this.selectedId) ?? null;
      renderInspector(inspectorEl, individual, {
        state: this.state,
        observer: this.observer,
        showRawValues: this.showRawValues,
      });
    }
    this.updateStatus();
  }

  updateStatus() {
    const el = this.doc.getElementById("run-state");
    if (el) el.textContent = this.running ? "running" : "paused";
  }

  refreshChannelSelect() {
    const sel = /** @type {HTMLSelectElement|null} */ (this.doc.getElementById("channel-select"));
    if (!sel) return;
    sel.innerHTML = `<option value="">(no channel)</option>` +
      [...this.observer.channels.keys()].map((k) => `<option value="${k}">${k}</option>`).join("");
    sel.value = this.observer.activeChannel ?? "";
  }
}

// ---- bootstrap ----
if (typeof document !== "undefined") {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("world"));
  const app = new ProbeApp(canvas, document);
  globalThis.lineageProbe = app; // exposed for manual measurement only
  globalThis.lineageEnvironment = environmentSnapshot();
  app.probe.resize();
  wireControls(app, document);
  app.renderPanels();
  requestAnimationFrame((t) => app.frame(t));
}

export { ProbeApp };
