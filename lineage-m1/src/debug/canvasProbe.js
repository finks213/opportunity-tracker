// @ts-check
/**
 * Crude static Canvas 2D probe (contract §22).
 *
 * Answers exactly one question: can a human see the biological difference the
 * model claims to produce? It is not the game. There is no watch/flag/decide
 * loop, no surfaced variation cards, no prediction or journal screen here.
 *
 * Canvas position is laid out from time allocation using uiRng ONLY, and never
 * feeds back into biology. This module reads biological state and never writes
 * to it.
 */

import { ZONES, ZONE_CANVAS_REGIONS } from "../config/zones.js";
import { drawAnimal, glyphHitRadius } from "./animalGlyph.js";
import { currentZoneBinIndex } from "../observer/currentZoneBins.js";
import { createUiRng } from "../core/rng.js";

const ZONE_STYLES = [
  { sky: "#1d2b1f", ground: "#2a3d2b", label: "canopy" },
  { sky: "#2a2418", ground: "#3a3122", label: "forest floor" },
  { sky: "#16262e", ground: "#1e3a44", label: "shoreline" },
];

export class CanvasProbe {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} [uiSeed]
   */
  constructor(canvas, uiSeed = 1) {
    this.canvas = canvas;
    this.ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    this.uiRng = createUiRng(uiSeed);
    /** @type {Map<number, {x:number, y:number, scale:number}>} */
    this.layout = new Map();
    /** Cached per-individual jitter so animals do not swim between frames. */
    this.jitter = new Map();
    this.showRawValues = false;
  }

  /** Resize the backing store for the current device pixel ratio. */
  resize() {
    const dpr = globalThis.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
  }

  /**
   * Stable per-individual jitter from uiRng only (§22).
   * @param {number} id
   */
  jitterFor(id) {
    let j = this.jitter.get(id);
    if (!j) {
      j = { jx: this.uiRng.nextFloat(), jy: this.uiRng.nextFloat(), js: this.uiRng.nextFloat() };
      this.jitter.set(id, j);
    }
    return j;
  }

  /**
   * Drop cached jitter for individuals that are no longer rendered.
   * @param {Array<{id:number}>} rendered
   * @returns {number} entries removed
   */
  pruneJitterTo(rendered) {
    // Revision-4 repair: prune by SET MEMBERSHIP, never by count. Revision 3
    // returned early when `jitter.size <= rendered.length`, but equal counts do
    // not imply equal membership: cached {1,2} with rendered {3,4} removed
    // nothing and left four entries for two rendered animals.
    const keep = new Set(rendered.map((i) => i.id));
    let removed = 0;
    for (const id of [...this.jitter.keys()]) {
      if (!keep.has(id)) {
        this.jitter.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Render one frame.
   * @param {Object} state biological state (read-only)
   * @param {Object} opts
   * @param {import("../observer/tracerChannels.js").ObserverState} opts.observer
   * @param {number|null} opts.selectedId
   * @param {number} [opts.focalThreshold]
   */
  render(state, opts) {
    const { observer, selectedId } = opts;
    const focalThreshold = opts.focalThreshold ?? 0.5;
    const ctx = this.ctx;
    const W = this.cssWidth || this.canvas.width;
    const fullH = this.cssHeight || this.canvas.height;
    // Legibility mode renders the three-zone world into the upper part of the
    // canvas and the webbing pairs below, so the world drawing must be able to
    // occupy a sub-region rather than always the whole canvas.
    const H = opts.regionHeight ?? fullH;
    ctx.clearRect(0, 0, W, opts.regionHeight ? H : fullH);

    // --- three clearly separated world regions ---
    for (let z = 0; z < ZONE_CANVAS_REGIONS.length; z++) {
      const region = ZONE_CANVAS_REGIONS[z];
      const x0 = region.x0 * W;
      const w = (region.x1 - region.x0) * W;
      const style = ZONE_STYLES[z];
      ctx.fillStyle = style.sky;
      ctx.fillRect(x0, 0, w, H);
      ctx.fillStyle = style.ground;
      ctx.fillRect(x0, H * 0.72, w, H * 0.28);
      // hard divider so the three zones are unmistakably separate
      if (z > 0) {
        ctx.fillStyle = "#0b0d10";
        ctx.fillRect(x0 - 2, 0, 4, H);
      }
    }

    // --- place animals by current zone bin, jittered with uiRng only ---
    this.layout.clear();
    // Bound the jitter cache to the animals actually rendered (revision-3
    // repair): it previously created one entry per rendered individual and never
    // removed entries for deaths, so continuous probe use grew linearly with
    // cumulative births. Ids are never reused, so dropping dead ids is safe and
    // keeps rendering deterministic.
    this.pruneJitterTo(state.currentIndividuals);
    const counts = [0, 0, 0];
    const perZone = [[], [], []];
    for (const ind of state.currentIndividuals) {
      const bin = currentZoneBinIndex(ind);
      counts[bin]++;
      perZone[bin].push(ind);
    }

    const activeChannel = observer.activeChannel ? observer.channels.get(observer.activeChannel) : null;

    for (let z = 0; z < 3; z++) {
      const region = ZONE_CANVAS_REGIONS[z];
      const x0 = region.x0 * W + 10;
      const w = (region.x1 - region.x0) * W - 20;
      const list = perZone[z];
      const columns = Math.max(1, Math.ceil(Math.sqrt(list.length * (w / Math.max(1, H * 0.55)))));
      const rows = Math.max(1, Math.ceil(list.length / columns));
      const cellW = w / columns;
      const cellH = (H * 0.62) / rows;
      const scale = Math.max(6, Math.min(26, Math.min(cellW, cellH) * 0.7));

      for (let i = 0; i < list.length; i++) {
        const ind = list[i];
        const col = i % columns;
        const row = Math.floor(i / columns);
        const j = this.jitterFor(ind.id);
        const x = x0 + col * cellW + cellW * (0.3 + 0.4 * j.jx);
        const y = H * 0.14 + row * cellH + cellH * (0.3 + 0.4 * j.jy);
        const s = scale * (0.88 + 0.24 * j.js);
        this.layout.set(ind.id, { x, y, scale: s });

        const tracerValue = activeChannel ? activeChannel.values.get(ind.id) ?? 0 : 0;
        drawAnimal(ctx, x, y, s, ind.bodyGenome, {
          focal: tracerValue >= focalThreshold,
          selected: ind.id === selectedId,
        });
      }
    }

    // --- zone labels, living counts by zone bin, generation counter ---
    ctx.font = "600 13px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "top";
    for (let z = 0; z < 3; z++) {
      const region = ZONE_CANVAS_REGIONS[z];
      const x0 = region.x0 * W + 12;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x0 - 6, 6, 168, 40);
      ctx.fillStyle = "#f0f2f4";
      ctx.fillText(ZONE_STYLES[z].label, x0, 12);
      ctx.font = "12px system-ui, -apple-system, sans-serif";
      ctx.fillText(`${counts[z]} of ${state.currentIndividuals.length} animals here`, x0, 29);
      ctx.font = "600 13px system-ui, -apple-system, sans-serif";
    }

    // Generation counter sits at the bottom-right so it never overlaps a zone
    // label; zone regions must stay legible at default zoom (§22 iPad gate).
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(W - 178, H - 50, 172, 42);
    ctx.fillStyle = "#f0f2f4";
    ctx.fillText(`generation ${state.generation}`, W - 168, H - 44);
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${state.currentIndividuals.length} living`, W - 168, H - 26);

    if (state.currentIndividuals.length === 0) {
      ctx.font = "600 20px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "#ffd9d9";
      ctx.fillText("extinct — the world does not restart", 24, H * 0.5);
    }
    return counts;
  }

  /**
   * Hit-test a canvas click, returning an individual id or null.
   * @param {number} cssX
   * @param {number} cssY
   * @returns {number|null}
   */
  hitTest(cssX, cssY) {
    let best = null;
    let bestDist = Infinity;
    for (const [id, pos] of this.layout) {
      const dx = cssX - pos.x;
      const dy = cssY - pos.y;
      const d = Math.hypot(dx, dy);
      const r = glyphHitRadius(pos.scale);
      if (d <= r && d < bestDist) {
        best = id;
        bestDist = d;
      }
    }
    return best;
  }
}

export { ZONES };
