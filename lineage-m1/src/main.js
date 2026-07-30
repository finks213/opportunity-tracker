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
import { serializeCanonicalBiology } from "./core/canonicalSerialize.js";
import { currentModelConfig } from "./config/modelConfig.js";
import { TRAIT_INDEX } from "./config/traits.js";
import {
  parseEnvelope,
  hydrateDefiningFixtureV1,
  applyWebbingOverride,
  assertFixtureConsistency,
} from "./fixtures/definingFixtureV1.js";
import {
  FOCAL_OUTCOME,
  MAINTAINED_CHANNEL_PREFIX,
  createMaintainedFocalChannels,
  resolveFocalLineage,
  createObserverState,
  createTracerChannel,
  tracerBirthHook,
  observerAfterGenerationHook,
  resolveLivingDescendants,
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
    // Parsed fixture metadata cache. Its presence says the FILE was once
    // loaded; it says nothing about which world is currently active.
    this.fixtureEnvelope = null;
    // Explicit identity of the CURRENT biological world (revision-3 repair).
    // Revision 2 used `fixtureEnvelope` as a proxy, so "load fixture -> reset
    // random -> enter legibility" left the random world on screen while the mode
    // claimed to be the fixture. Kept outside biological state.
    /** @type {"random"|"defining_fixture"} */
    this.worldSource = "random";
    this.fixtureLoadError = null;
    this.lastAdvance = 0;
    // ---- world-change transaction identity (revision-5 repair, BUG 2 / R5-2) ----
    //
    // Every asynchronous world-changing request takes a monotonic token. A request
    // may commit ONLY if its token is still the newest one issued. Revision 4 had
    // no request identity: an older in-flight fixture load resolved after a newer
    // one and overwrote it, leaving legibility mode reporting the defining fixture
    // while the bytes held the high-webbing override. Reproduced exactly:
    //   start high-webbing load -> enter legibility (2nd load) -> resolve
    //   legibility first (exact baseline true) -> resolve high-webbing last
    //   => manualTestMode legibility, worldSource defining_fixture,
    //      isBaselineFixtureActive() false
    // A synchronous reset must also invalidate in-flight loads, or a stale fixture
    // response replaces a newer random world.
    this.worldChangeToken = 0;
    /** Glyphs actually drawn by the most recent render-stress frame; null before any. */
    this.lastRenderedGlyphCount = null;
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

  // ---- world-change transactions (revision-5 repair, BUG 2 / R5-2) ----

  /**
   * Claim the next world-change token, superseding every in-flight request.
   * Call this at the START of any operation that will replace the world.
   * @returns {number}
   */
  beginWorldChange() {
    return ++this.worldChangeToken;
  }

  /**
   * True when `token` is still the newest world-change request. A request whose
   * token has been superseded must not commit anything: not biology, not
   * `worldSource`, not the test mode, not the seed label, not tracer state, not
   * the fixture variant.
   * @param {number} token
   * @returns {boolean}
   */
  isCurrentWorldChange(token) {
    return token === this.worldChangeToken;
  }

  // ---- controls ----
  setRunning(v) { this.running = v; this.meter.markInput(); this.updateStatus(); }
  stepOnce() { this.meter.markInput(); this.advance(); this.renderPanels(); }
  setShowRawValues(v) { this.showRawValues = v; this.renderPanels(); }
  setActiveChannel(id) { this.observer.activeChannel = id; this.renderPanels(); }
  clearTracers() { this.observer.channels.clear(); this.observer.activeChannel = null; this.refreshChannelSelect(); }

  resetRandomWorld(seed) {
    this.meter.markInput();
    // Synchronous, but it must still supersede any in-flight fixture load —
    // otherwise a stale fixture response replaces this newer random world while
    // the seed label keeps showing the reset seed.
    this.beginWorldChange();
    this.seed = seed;
    this.state = createInitialState(seed, currentModelConfig);
    this.observer = createObserverState();
    this.probe.jitter.clear();
    this.selectedId = null;
    this.manualTestMode = null;
    this.worldSource = "random";
    this.fixtureLoadError = null;
    this.refreshChannelSelect();
    this.renderPanels();
  }

  /**
   * Hydrate the defining fixture as the active world.
   * Returns true on success. On failure the world is left untouched, an explicit
   * error state is recorded, and NO fixture-valid mode is entered.
   * @returns {Promise<boolean>}
   */
  async loadDefiningFixture(opts = {}) {
    this.meter.markInput();
    // A caller that already opened a transaction (setManualTestMode) passes its
    // token in so the two do not fight over which is newest.
    const token = opts.worldChangeToken ?? this.beginWorldChange();
    try {
      if (!this.fixtureEnvelope) {
        const response = await fetch("./fixtures/defining_fixture_v1.json");
        if (!response.ok) throw new Error(`fixture fetch failed: HTTP ${response.status}`);
        const text = await response.text();
        const parsed = parseEnvelope(text);
        assertFixtureConsistency(parsed);
        this.fixtureEnvelope = parsed;
      }
    } catch (err) {
      // A failed request must not clobber a newer world's state either — not even
      // with an error message.
      if (!this.isCurrentWorldChange(token)) return false;
      // Explicit failure: do not switch worldSource, do not enter a mode that
      // claims to show the fixture.
      this.fixtureLoadError = String(err && err.message ? err.message : err);
      this.manualTestMode = null;
      this.renderPanels();
      return false;
    }
    // ---- COMMIT GATE ----
    // Everything above is I/O. Everything below mutates the world, so a
    // superseded request stops here and commits nothing.
    if (!this.isCurrentWorldChange(token)) return false;
    this.fixtureLoadError = null;
    const env = this.fixtureEnvelope;
    this.state = hydrateDefiningFixtureV1(env, this.seed, currentModelConfig);
    if (opts.highWebbing) {
      // Fixture construction operation, before generation 1 (§19.2).
      applyWebbingOverride(this.state, env.canopyFocalIds, env.highWebbing);
      applyWebbingOverride(this.state, env.shorelineFocalIds, env.highWebbing);
    }
    this.observer = createObserverState();
    // Revision-5 repair (BUG 1 / R5-1). The contract-required focal sets get
    // maintained channels at world creation, while every founder is still alive —
    // the only moment a generation-zero focal set can be captured exactly. They
    // stay dormant (the UI does not show them until asked) but are propagated
    // through every birth, so late activation never depends on the rolling
    // genealogy window. Storage stays bounded to the living population.
    this.maintainedFocalChannels = createMaintainedFocalChannels(this.observer, this.state, {
      canopy: env.canopyFocalIds,
      shoreline: env.shorelineFocalIds,
    });
    this.probe.jitter.clear();
    this.selectedId = null;
    this.worldSource = "defining_fixture";
    this.refreshChannelSelect();
    this.renderPanels();
    return true;
  }

  /**
   * Follow a FOCAL LINEAGE (§16). Resolves the requested focal founders to their
   * actual living descendants through genealogy.
   *
   * Revision-4 repair. Revision 3 fell back to "the first twelve current animals
   * with sufficient habitat use" when the focal members were gone. Those animals
   * are not necessarily descendants of the requested lineage, so the interface
   * presented a newly selected habitat group as continuation of the focal group —
   * silent focal-lineage reseeding. That fallback is removed.
   *
   * Revision-5 repair (BUG 1 / R5-1). Resolution now prefers the MAINTAINED
   * channel created with the world, so it stays correct past the 360-generation
   * genealogy retention window. Three outcomes are distinguished, and the
   * revision-4 conflation of the last two is gone:
   *
   *   FOCAL_LINEAGE_RESOLVED      living descendants established
   *   FOCAL_LINEAGE_EXTINCT       genuinely none, and the evidence supports that
   *   FOCAL_ANCESTRY_UNRESOLVABLE cannot be established either way — asserts nothing
   *
   * Revision 4 returned `FOCAL_LINEAGE_UNAVAILABLE` for the third case, which
   * asserted biological absence. Reproduced at generation 400: 293 living animals,
   * all 293 with positive focal contribution, resolver 0, UI "no living descendant
   * remains".
   *
   * Starting a fresh group is a separate, explicitly named action
   * (`followNewHabitatGroup`).
   *
   * @param {string} channelId
   * @param {"canopy"|"shoreline"} which
   * @returns {{created:boolean, reason?:string, founderCount?:number, source?:string, detail?:Object}}
   */
  followFocalLineage(channelId, which) {
    this.meter.markInput();
    if (this.worldSource !== "defining_fixture" || !this.fixtureEnvelope) {
      this.tracerUnavailableReason =
        "focal lineages are defined by the defining fixture; load the fixture first";
      this.renderPanels();
      return { created: false, reason: "FOCAL_LINEAGE_REQUIRES_FIXTURE" };
    }
    const requested =
      which === "canopy" ? this.fixtureEnvelope.canopyFocalIds : this.fixtureEnvelope.shorelineFocalIds;

    // Revision-5 repair (BUG 1 / R5-1). Prefer the MAINTAINED channel, which has
    // been propagated continuously since this world was created and is therefore
    // correct at any generation. Revision 4 reconstructed from the rolling
    // genealogy only, so after the 360-generation retention window slid past the
    // founders it reported FOCAL_LINEAGE_UNAVAILABLE — asserting extinction — while
    // every living animal still carried positive focal contribution.
    const outcome = resolveFocalLineage(this.observer, this.state, requested, { focalSetName: which });
    const { descendantIds } = outcome;

    if (outcome.outcome === FOCAL_OUTCOME.UNRESOLVABLE) {
      // Say "cannot be established", never "no descendant remains".
      this.tracerUnavailableReason =
        `FOCAL_ANCESTRY_UNRESOLVABLE — the ${which} focal lineage cannot be established at ` +
        `generation ${this.state.generation}: the genealogy retention window no longer contains its ` +
        "founders and no maintained channel exists for this world. This is NOT a claim that the " +
        "lineage is extinct.";
      this.renderPanels();
      return { created: false, reason: FOCAL_OUTCOME.UNRESOLVABLE, detail: outcome.detail };
    }
    if (outcome.outcome === FOCAL_OUTCOME.EXTINCT) {
      this.tracerUnavailableReason =
        `FOCAL_LINEAGE_EXTINCT — no living descendant of the ${which} focal lineage remains ` +
        `(established from the ${outcome.source}). Following a different group is a separate choice.`;
      this.renderPanels();
      return { created: false, reason: FOCAL_OUTCOME.EXTINCT, detail: outcome.detail };
    }

    this.tracerUnavailableReason = null;
    try {
      createTracerChannel(this.observer, channelId, descendantIds, this.state.currentIndividuals.map((i) => i.id));
    } catch (err) {
      this.tracerUnavailableReason = `tracer not created — ${err.message}`;
      this.renderPanels();
      return { created: false, reason: err.reason ?? "TRACER_REJECTED" };
    }
    this.refreshChannelSelect();
    this.renderPanels();
    return {
      created: true,
      founderCount: descendantIds.length,
      source: outcome.source,
      reason: FOCAL_OUTCOME.RESOLVED,
    };
  }

  /**
   * Follow a NEW habitat group — a separately named action that establishes a new
   * channel from current animals by habitat use. This is explicitly NOT
   * continuation of any focal lineage, and it is never used as a silent fallback.
   *
   * @param {string} channelId
   * @param {"canopy"|"shoreline"} which
   * @returns {{created:boolean, reason?:string, founderCount?:number}}
   */
  followNewHabitatGroup(channelId, which) {
    this.meter.markInput();
    const bin = which === "canopy" ? 0 : 2;
    const selected = this.state.currentIndividuals
      .filter((i) => i.timeAllocation[bin] >= 0.5)
      .slice(0, 12)
      .map((i) => i.id);
    if (selected.length === 0) {
      this.tracerUnavailableReason =
        `no living animals currently use ${which === "canopy" ? "the canopy" : "the shoreline"} enough to follow`;
      this.renderPanels();
      return { created: false, reason: "NO_LIVING_CANDIDATES" };
    }
    this.tracerUnavailableReason = null;
    try {
      createTracerChannel(this.observer, channelId, selected, this.state.currentIndividuals.map((i) => i.id));
    } catch (err) {
      this.tracerUnavailableReason = `tracer not created — ${err.message}`;
      this.renderPanels();
      return { created: false, reason: err.reason ?? "TRACER_REJECTED" };
    }
    this.refreshChannelSelect();
    this.renderPanels();
    return { created: true, founderCount: selected.length };
  }

  /**
   * Back-compat dispatcher used by the control wiring. In a fixture world this is
   * a FOCAL-LINEAGE action; in a random world there is no focal lineage to
   * follow, so it is explicitly a new-habitat-group action. It never silently
   * converts one into the other.
   * @returns {{created:boolean, reason?:string, founderCount?:number}}
   */
  createTracer(channelId, which) {
    if (this.worldSource === "defining_fixture" && this.fixtureEnvelope) {
      return this.followFocalLineage(channelId, which);
    }
    return this.followNewHabitatGroup(channelId, which);
  }

  /**
   * Canonical bytes of the pristine baseline fixture at the current seed.
   * Computed from a throwaway hydration so it can be compared without touching
   * the live world.
   * @returns {string|null} null when the envelope is unavailable
   */
  baselineFixtureCanonicalBytes() {
    if (!this.fixtureEnvelope) return null;
    return serializeCanonicalBiology(
      hydrateDefiningFixtureV1(this.fixtureEnvelope, this.seed, currentModelConfig)
    );
  }

  /**
   * True when the ACTIVE world is byte-identical to the pristine baseline
   * fixture: right origin, generation 0, no webbing override, nothing advanced.
   * @returns {boolean}
   */
  isBaselineFixtureActive() {
    if (this.worldSource !== "defining_fixture") return false;
    const baseline = this.baselineFixtureCanonicalBytes();
    if (baseline === null) return false;
    return serializeCanonicalBiology(this.state) === baseline;
  }

  /**
   * Guarantee the active world is the pristine baseline fixture, rehydrating if
   * it is not. The parsed envelope may stay cached; the biological state is
   * replaced.
   * @returns {Promise<boolean>} false when the fixture cannot be loaded
   */
  async ensureBaselineFixtureActive(worldChangeToken) {
    if (this.isBaselineFixtureActive()) return true;
    return await this.loadDefiningFixture({ worldChangeToken });
  }

  async setManualTestMode(mode) {
    this.meter.markInput();
    // Entering a mode that requires a specific world is itself a world change.
    const token = this.beginWorldChange();
    this.manualTestMode = mode;
    if (mode === "legibility") {
      // §22 requires this mode to contain the DEFINING FIXTURE — the unmodified
      // baseline at generation 0, with no experimental webbing override.
      //
      // Revision-4 repair. Revision 3 reloaded only when
      // `worldSource !== "defining_fixture"`. That marker records the state's
      // ORIGIN, not its current identity, so all of these left a non-baseline
      // world in place while the mode claimed the fixture:
      //   load fixture -> advance N generations -> legibility
      //   load fixture WITH the webbing override -> legibility
      // Entry now verifies exact baseline identity by canonical bytes and
      // rehydrates whenever it does not match.
      this.running = false;
      if (!(await this.ensureBaselineFixtureActive(token))) {
        // Only clear the mode if this request is still the current one; a newer
        // request has already set the mode it wants.
        if (this.isCurrentWorldChange(token)) {
          this.manualTestMode = null;
          this.renderPanels();
        }
        return false;
      }
      if (!this.isCurrentWorldChange(token)) return false;
    }
    if (mode === "render-stress") {
      // Exactly 360 simultaneously visible glyphs (§22). Rendering benchmark
      // only: it does not alter the biological acceptance model, so it runs on
      // a throwaway state built purely for drawing.
      this.running = false;
      this.meter.start(30000);
    }
    this.renderPanels();
    return true;
  }

  // ---- simulation ----
  advance() {
    if (this.state.currentIndividuals.length === 0) return;
    advanceGeneration(this.state, currentModelConfig, {
      onBirth: tracerBirthHook(this.observer),
      // Keeps tracer maps bounded to the living population across long runs.
      afterGeneration: observerAfterGenerationHook(this.observer),
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
    // Counted rather than asserted, so the measurement tool can verify the
    // "exactly 360" claim instead of restating the constant (revision-4).
    let drawn = 0;
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
        drawn++;
      }
    }
    this.lastRenderedGlyphCount = drawn;
    ctx.fillStyle = "#f0f2f4";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillText("render-stress mode — exactly 360 procedural glyphs (rendering benchmark only)", 14, 10);
  }

  /**
   * Current debug zone-bin counts in canonical zone order, exposed so the
   * desktop measurement tool can cross-check the browser against an independent
   * Node run of the same fixture and seed (revision-4). Observer-side only.
   * @returns {number[]}
   */
  zoneBinCountsForMeasurement() {
    return zoneBinCounts(this.state.currentIndividuals);
  }

  /**
   * Legibility mode (§22): the defining fixture with all three zones visible
   * AND the randomized ten-pair high-versus-low webbing identification check,
   * present simultaneously in one deterministic mode.
   *
   * The world occupies the upper region so zone regions and their animal
   * occupancy stay assessable; the identification strip sits below it. Pair
   * order comes from uiRng seed 32001 and never touches biological state.
   */
  renderLegibility() {
    const ctx = this.probe.ctx;
    const W = this.probe.cssWidth;
    const H = this.probe.cssHeight;
    const worldH = Math.round(H * 0.56);

    // 1. the defining fixture in all three zones, with per-zone occupancy counts
    this.probe.render(this.state, {
      observer: this.observer,
      selectedId: this.selectedId,
      regionHeight: worldH,
    });

    // 2. the ten-pair identification strip
    ctx.fillStyle = "#181d22";
    ctx.fillRect(0, worldH, W, H - worldH);
    ctx.fillStyle = "#2b3540";
    ctx.fillRect(0, worldH, W, 2);

    const env = this.fixtureEnvelope;
    const base = env ? env.baselineBodyGenome : currentModelConfig.ancestorBodyGenome;
    const high = base.slice(); high[TRAIT_INDEX.toe_webbing] = env ? env.highWebbing : 0.75;
    const low = base.slice(); low[TRAIT_INDEX.toe_webbing] = env ? env.lowWebbing : 0.15;
    const pairs = buildLegibilityPairs([1], [2]); // deterministic order, seed 32001

    ctx.fillStyle = "#f0f2f4";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(
      `legibility check — in each numbered pair, which animal has wider feet? (uiRng seed ${MANUAL_TEST_UI_SEED})`,
      14,
      worldH + 8
    );

    // Two rows of five pairs so glyphs stay large in the reduced strip.
    const stripTop = worldH + 30;
    const stripH = H - stripTop - 6;
    const rows = 2;
    const cols = 5;
    const cellW = W / cols;
    const cellH = stripH / rows;
    const glyphScale = Math.min(34, cellH * 0.42);
    for (let i = 0; i < pairs.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = col * cellW;
      const cy = stripTop + row * cellH;
      const leftGenome = pairs[i].highIsLeft ? high : low;
      const rightGenome = pairs[i].highIsLeft ? low : high;
      drawAnimal(ctx, cx + cellW * 0.32, cy + cellH * 0.55, glyphScale, leftGenome, {});
      drawAnimal(ctx, cx + cellW * 0.74, cy + cellH * 0.55, glyphScale, rightGenome, {});
      ctx.fillStyle = "#9aa4ad";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`${i + 1}`, cx + 8, cy + 4);
      if (col > 0) {
        ctx.fillStyle = "#2b3540";
        ctx.fillRect(cx, cy + 4, 1, cellH - 8);
      }
    }
  }

  renderPanels() {
    const doc = this.doc;
    const counts = zoneBinCounts(this.state.currentIndividuals);
    const statusEl = doc.getElementById("status");
    if (statusEl) {
      const source = this.worldSource === "defining_fixture" ? "defining fixture" : "random world";
      statusEl.textContent =
        `${source} · generation ${this.state.generation} · ${this.state.currentIndividuals.length} living · ` +
        `canopy ${counts[0]} · forest floor ${counts[1]} · shoreline ${counts[2]}`;
    }
    // Explicit, distinguishable failure states (revision-3 repair).
    const noticeEl = doc.getElementById("notice");
    if (noticeEl) {
      if (this.fixtureLoadError) {
        noticeEl.textContent = `Defining fixture could not be loaded: ${this.fixtureLoadError}. Legibility mode is unavailable.`;
        noticeEl.hidden = false;
      } else if (this.tracerUnavailableReason) {
        noticeEl.textContent = `Tracer not created — ${this.tracerUnavailableReason}.`;
        noticeEl.hidden = false;
      } else {
        noticeEl.textContent = "";
        noticeEl.hidden = true;
      }
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
