// @ts-check
/**
 * Reproducible desktop Canvas measurement (contract §22 "Desktop measurement").
 *
 * Revision-4 repair. Revision 3 reported a Playwright browser run but shipped no
 * driver, no dependency, and no clean-run command that could produce
 * `audit/desktop-measurements.json`, so the evidence could be read but not
 * reproduced. Its raw JSON also recorded `status generation: 181` beside a field
 * named `populationAfter180Generations`, leaving a 180/181 ambiguity.
 *
 * Everything is frozen here:
 *
 *   browser            Chromium via the `playwright` devDependency (see package.json)
 *   viewport           1280 x 800, deviceScaleFactor 1
 *   world              the defining fixture at MEASUREMENT.measurementSeed
 *   biological seed    MEASUREMENT.measurementSeed (1)
 *   uiRng seed         the probe default (1)
 *   generations        MEASUREMENT.advanceGenerations (180) transitions from generation 0
 *   modes              normal, then render-stress (exactly 360 glyphs)
 *   warm-up            MEASUREMENT.warmupMs before any frame is sampled
 *   sample window      MEASUREMENT.normalSampleMs and MEASUREMENT.stressSampleMs
 *   control actions    MEASUREMENT.controlActions input-to-next-paint samples
 *   output             audit/desktop-measurements.json, schema below
 *
 * GENERATION SEMANTICS (frozen, resolving the previous ambiguity):
 *   - the freshly hydrated fixture is `state.generation === 0`;
 *   - the run performs exactly MEASUREMENT.advanceGenerations transitions;
 *   - therefore the final state is `state.generation === advanceGenerations`;
 *   - `populationAfterAdvance` is the living count at that final generation;
 *   - `finalStateGeneration` records it explicitly so no reader must infer it.
 *
 * MEMORY (revision-5 repair, BUG 5 / R5-5):
 *   §22 asks for desktop CANVAS memory growth across the 180-generation run. Two
 *   separately named results are emitted, and neither is allowed to stand in for
 *   the other:
 *
 *     desktopCanvasMemory   the contract's subject. The only browser-side channel,
 *                           `performance.memory.usedJSHeapSize`, is PROBED each run
 *                           by allocating a large buffer in the page. If the reading
 *                           does not move, the channel is quantized and carries no
 *                           information, so the result is
 *                           `status: "UNVERIFIED"` with `deltaBytes: null`.
 *     nodeSimulationHeap    a separate DIAGNOSTIC. `process.memoryUsage()` over the
 *                           same fixture, seed and transition count, in Node. It
 *                           creates no browser, Canvas, DOM, renderer or UI state,
 *                           so it measures a different process and object graph.
 *
 *   Revision 4 published the Node figure as the "authoritative" Canvas measure.
 *   That was a numeric answer to a question it had not asked. An honest UNVERIFIED
 *   is better than a confident measurement of the wrong subject.
 *
 * WINDOW SCOPE:
 *   These are DESKTOP windows. They are deliberately shorter than the physical
 *   iPad gate's 30 s warm-up / 180 s stress window, and this run does not and
 *   cannot satisfy that gate. See `windowComparison` in the output and
 *   IPAD_TEST_CHECKLIST.md.
 *
 * One command:  npm run audit:desktop
 */

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createStaticServer } from "./serve.mjs";
import { parseEnvelope, hydrateDefiningFixtureV1 } from "../src/fixtures/definingFixtureV1.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { advanceGeneration } from "../src/core/simulation.js";
import { zoneBinCounts } from "../src/observer/currentZoneBins.js";
import { ZONES } from "../src/config/zones.js";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

// ---- frozen measurement parameters ----
export const MEASUREMENT = Object.freeze({
  schema: "lineage-m1-desktop-measurement-3",
  viewport: Object.freeze({ width: 1280, height: 800 }),
  deviceScaleFactor: 1,
  measurementSeed: 1,
  advanceGenerations: 180,
  warmupMs: 2000,
  normalSampleMs: 3000,
  stressSampleMs: 20000,
  controlActions: 20,
  stressGlyphCount: 360,
  /** Bytes allocated in-page to test whether performance.memory responds at all. */
  memoryProbeBytes: 320_000_000,
});

/** The iPad gate's windows, recorded so no reader mistakes one run for the other. */
const IPAD_GATE_WINDOWS = Object.freeze({
  warmupMs: 30_000,
  stressSampleMs: 180_000,
  controlActions: 20,
});

/** Resolve the Playwright chromium launcher, reporting clearly if absent. */
async function loadChromium() {
  try {
    const pw = await import("playwright");
    return pw.chromium;
  } catch (err) {
    throw new Error(
      "playwright is required for the desktop measurement. Install it with:\n" +
      "  npm install\n" +
      "  npx playwright install chromium\n" +
      "(the browser BINARY is downloaded by playwright; everything else ships in this bundle)\n" +
      `underlying error: ${err && err.message ? err.message : err}`
    );
  }
}

/**
 * Independent Node-side run of the SAME frozen world: fixture, seed and
 * generation count. Serves two purposes:
 *   1. cross-checks the browser's reported generation, population and zone bins,
 *      so the desktop evidence is verifiable without a browser at all;
 *   2. supplies the authoritative memory-growth figures, because the browser's
 *      `performance.memory` channel is quantized (see the probe).
 * @returns {{crossCheck:Object, memory:Object}}
 */
export function measureHeadlessReference() {
  const env = parseEnvelope(readFileSync(join(ROOT, "fixtures", "defining_fixture_v1.json"), "utf8"));
  const state = hydrateDefiningFixtureV1(env, MEASUREMENT.measurementSeed, currentModelConfig);
  const initialGeneration = state.generation;

  if (globalThis.gc) globalThis.gc();
  const before = process.memoryUsage();
  for (let i = 0; i < MEASUREMENT.advanceGenerations; i++) advanceGeneration(state, currentModelConfig);
  const afterNoGc = process.memoryUsage();
  if (globalThis.gc) globalThis.gc();
  const after = process.memoryUsage();

  const bins = zoneBinCounts(state.currentIndividuals);
  /** @type {Record<string,number>} */
  const zoneBins = {};
  ZONES.forEach((z, i) => { zoneBins[z] = bins[i]; });

  return {
    crossCheck: {
      initialGeneration,
      transitionsPerformed: MEASUREMENT.advanceGenerations,
      finalStateGeneration: state.generation,
      population: state.currentIndividuals.length,
      zoneBins,
      note:
        "Computed in Node from the same fixture, seed and transition count as the browser run. " +
        "The browser figures below must agree with these; browserAgreesWithHeadless records the check.",
    },
    memory: {
      // Revision-5 repair (BUG 5 / R5-5). Revision 4 called this the
      // "authoritative" desktop Canvas memory measure. It is not: this function
      // advances biological state in Node and creates no browser, Canvas, DOM,
      // renderer, frame meter, tracer UI or browser heap. It measures a DIFFERENT
      // process, heap and object graph. It is now named for what it is and is
      // never presented as the contract's subject.
      classification: "NODE_SIMULATION_HEAP",
      channel: "node:process.memoryUsage()",
      measuresCanvasOrBrowserMemory: false,
      authoritativeForCanvasMemory: false,
      gcExposed: Boolean(globalThis.gc),
      heapUsedBeforeBytes: before.heapUsed,
      heapUsedAfterBytes: after.heapUsed,
      heapUsedAfterBeforeGcBytes: afterNoGc.heapUsed,
      heapUsedDeltaBytes: after.heapUsed - before.heapUsed,
      rssBeforeBytes: before.rss,
      rssAfterBytes: after.rss,
      rssDeltaBytes: after.rss - before.rss,
      retainedRecordCounts: {
        livingIndividuals: state.currentIndividuals.length,
        retainedGenealogy: state.retainedGenealogy.length,
        birthEvents: state.birthEvents.length,
        deathEvents: state.deathEvents.length,
        biologicalMatingEvents: state.biologicalMatingEvents.length,
        bodyMutationEvents: state.bodyMutationEvents.length,
        allocationMutationEvents: state.allocationMutationEvents.length,
      },
      note:
        "A SEPARATE DIAGNOSTIC, not the §22 Canvas measure. Exact retained-record counts are the " +
        "quantization-free growth measure; heap bytes are reported as observed and are sensitive to GC " +
        "timing (run with --expose-gc for the deterministic figure). This 180-generation window is BELOW " +
        "the 360-generation genealogy retention boundary, so pruning is not exercised here; the " +
        "retention bound itself is tested through generation 1000 by test/observer-memory-bounds.test.js.",
    },
  };
}

/**
 * Run the frozen measurement and return the result object.
 * @param {{headless?:boolean}} [opts]
 */
export async function runDesktopMeasurement(opts = {}) {
  const chromium = await loadChromium();
  const headlessReference = measureHeadlessReference();

  // Serve on an ephemeral loopback port; started and stopped by this tool.
  const server = createStaticServer(ROOT);
  const port = await new Promise((res) => {
    server.listen(0, "127.0.0.1", () => res(/** @type {any} */ (server.address()).port));
  });

  const launchOptions = { headless: opts.headless !== false };
  if (process.env.LINEAGE_CHROMIUM_PATH) {
    launchOptions.executablePath = process.env.LINEAGE_CHROMIUM_PATH;
  }
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({
      viewport: { ...MEASUREMENT.viewport },
      deviceScaleFactor: MEASUREMENT.deviceScaleFactor,
    });
    /** @type {string[]} */
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message)));
    page.on("console", (m) => {
      // The browser's automatic favicon request 404s; it is not a page defect.
      if (m.type() === "error" && !m.text().includes("favicon")) pageErrors.push(m.text());
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    const environment = await page.evaluate(() => globalThis.lineageEnvironment);
    const browserVersion = browser.version();

    // ---- does performance.memory respond to real allocation at all? ----
    const memoryProbe = await page.evaluate((bytes) => {
      const perf = /** @type {any} */ (performance);
      if (!perf.memory || typeof perf.memory.usedJSHeapSize !== "number") {
        return { exposed: false, responsive: false, beforeBytes: null, afterBytes: null, allocatedBytes: bytes,
                 reason: "performance.memory is not exposed in this browser" };
      }
      const beforeBytes = perf.memory.usedJSHeapSize;
      const hold = [];
      const chunk = 8_000_000; // 1e6 float64s
      for (let held = 0; held < bytes; held += chunk) hold.push(new Float64Array(chunk / 8));
      /** @type {any} */ (globalThis).__lineageMemoryProbeHold = hold;
      const afterBytes = perf.memory.usedJSHeapSize;
      /** @type {any} */ (globalThis).__lineageMemoryProbeHold = undefined;
      return {
        exposed: true,
        responsive: afterBytes !== beforeBytes,
        beforeBytes,
        afterBytes,
        allocatedBytes: bytes,
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
        reason:
          afterBytes !== beforeBytes
            ? "usedJSHeapSize moved when a large buffer was allocated; the channel is usable"
            : "usedJSHeapSize did NOT move after allocating the probe buffer; the value is quantized " +
              "(Chromium anonymizes performance.memory without cross-origin isolation), so browser-side " +
              "heap deltas carry no information",
      };
    }, MEASUREMENT.memoryProbeBytes);

    // Fixed seed, then the defining fixture.
    await page.evaluate((seed) => { globalThis.lineageProbe.seed = seed; }, MEASUREMENT.measurementSeed);
    await page.click("#btn-fixture");
    await page.waitForTimeout(500);

    const initialGeneration = await page.evaluate(() => globalThis.lineageProbe.state.generation);
    const memoryBefore = await page.evaluate(() =>
      globalThis.performance && /** @type {any} */ (globalThis.performance).memory
        ? /** @type {any} */ (globalThis.performance).memory.usedJSHeapSize
        : null
    );

    // ---- normal mode: advance exactly advanceGenerations transitions ----
    await page.evaluate(() => { globalThis.lineageProbe.meter.start(0); });
    await page.evaluate((n) => {
      const app = globalThis.lineageProbe;
      app.running = false;
      for (let i = 0; i < n; i++) app.advance();
      app.renderPanels();
    }, MEASUREMENT.advanceGenerations);

    await page.evaluate((ms) => { globalThis.lineageProbe.meter.start(ms); }, MEASUREMENT.warmupMs);
    await page.waitForTimeout(MEASUREMENT.warmupMs + MEASUREMENT.normalSampleMs);
    const normalSummary = await page.evaluate(() => globalThis.lineageProbe.meter.summary());
    const finalStateGeneration = await page.evaluate(() => globalThis.lineageProbe.state.generation);
    const populationAfterAdvance = await page.evaluate(() => globalThis.lineageProbe.state.currentIndividuals.length);
    const browserZoneBinsArray = await page.evaluate(() => {
      const app = globalThis.lineageProbe;
      return app.zoneBinCountsForMeasurement
        ? app.zoneBinCountsForMeasurement()
        : null;
    });
    const statusLine = (await page.textContent("#status")).trim();
    const memoryAfter = await page.evaluate(() =>
      globalThis.performance && /** @type {any} */ (globalThis.performance).memory
        ? /** @type {any} */ (globalThis.performance).memory.usedJSHeapSize
        : null
    );

    // ---- render-stress mode: exactly 360 glyphs ----
    await page.click("#btn-mode-stress");
    await page.evaluate((ms) => { globalThis.lineageProbe.meter.start(ms); }, MEASUREMENT.warmupMs);
    await page.waitForTimeout(MEASUREMENT.warmupMs + MEASUREMENT.stressSampleMs);
    // Instrumented control actions for input-to-next-paint.
    for (let i = 0; i < MEASUREMENT.controlActions; i++) {
      await page.click(i % 2 === 0 ? "#btn-pause" : "#btn-run");
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1000);
    const stressSummary = await page.evaluate(() => globalThis.lineageProbe.meter.summary());
    const renderedGlyphCount = await page.evaluate(() => {
      const app = globalThis.lineageProbe;
      return app.lastRenderedGlyphCount ?? null;
    });

    // ---- cross-check: the browser must agree with the Node reference ----
    /** @type {Record<string,number>|null} */
    let browserZoneBins = null;
    if (Array.isArray(browserZoneBinsArray)) {
      browserZoneBins = {};
      ZONES.forEach((z, i) => { /** @type {any} */ (browserZoneBins)[z] = browserZoneBinsArray[i]; });
    }
    const ref = headlessReference.crossCheck;
    /** @type {string[]} */
    const disagreements = [];
    if (initialGeneration !== ref.initialGeneration) {
      disagreements.push(`initialGeneration browser=${initialGeneration} headless=${ref.initialGeneration}`);
    }
    if (finalStateGeneration !== ref.finalStateGeneration) {
      disagreements.push(`finalStateGeneration browser=${finalStateGeneration} headless=${ref.finalStateGeneration}`);
    }
    if (populationAfterAdvance !== ref.population) {
      disagreements.push(`population browser=${populationAfterAdvance} headless=${ref.population}`);
    }
    if (browserZoneBins) {
      for (const z of ZONES) {
        if (browserZoneBins[z] !== ref.zoneBins[z]) {
          disagreements.push(`zoneBins.${z} browser=${browserZoneBins[z]} headless=${ref.zoneBins[z]}`);
        }
      }
    }

    const browserMemoryUsable = memoryProbe.exposed && memoryProbe.responsive;

    return {
      schema: MEASUREMENT.schema,
      note:
        "Desktop measurement only (contract §22 'Desktop measurement'). Headless Chromium on Linux; " +
        "NOT a substitute for the physical iPad Safari gate, which remains PENDING_HUMAN_DEVICE_TEST.",
      generatedBy: "node tools/measureDesktop.mjs  (npm run audit:desktop)",
      frozenParameters: { ...MEASUREMENT },
      windowComparison: {
        desktopWarmupMs: MEASUREMENT.warmupMs,
        desktopStressSampleMs: MEASUREMENT.stressSampleMs,
        ipadGateWarmupMs: IPAD_GATE_WINDOWS.warmupMs,
        ipadGateStressSampleMs: IPAD_GATE_WINDOWS.stressSampleMs,
        satisfiesIpadGateWindows: false,
        note:
          "The desktop windows are shorter than the iPad gate's 30 s warm-up and 180 s stress window. " +
          "These numbers are NOT measured against the iPad pass law and do not advance that gate.",
      },
      generationSemantics: {
        initialStateGeneration: initialGeneration,
        transitionsPerformed: MEASUREMENT.advanceGenerations,
        finalStateGeneration,
        rule: "a freshly hydrated fixture is generation 0; N transitions produce state.generation === N",
      },
      environment,
      browser: { engine: "chromium", version: browserVersion, headless: launchOptions.headless },
      normalMode: {
        statusLine,
        finalStateGeneration,
        populationAfterAdvance,
        zoneBins: browserZoneBins,
        ...normalSummary,
      },
      renderStressMode: {
        declaredGlyphCount: MEASUREMENT.stressGlyphCount,
        renderedGlyphCount,
        glyphCountMatchesDeclaration:
          renderedGlyphCount === null ? null : renderedGlyphCount === MEASUREMENT.stressGlyphCount,
        ...stressSummary,
        controlActionsDriven: MEASUREMENT.controlActions,
        inputActionCountNote:
          "inputActionCount can exceed controlActionsDriven by one: the mode-switch click into " +
          "render-stress is itself instrumented and its latency is sampled in this window. The contract " +
          "requires AT LEAST 20 control actions, so a higher count is the measured value, not a target.",
      },
      headlessCrossCheck: {
        ...headlessReference.crossCheck,
        browserAgreesWithHeadless: disagreements.length === 0,
        disagreements,
      },
      desktopCanvasMemory: (() => {
        const usable = memoryProbe.exposed && memoryProbe.responsive;
        if (usable) {
          return {
            classification: "DESKTOP_CANVAS_MEMORY",
            status: "MEASURED",
            channel: "browser:performance.memory.usedJSHeapSize",
            browser: `chromium ${browserVersion}`,
            measurementApi: "performance.memory.usedJSHeapSize",
            includedMemoryDomains:
              "the page's JavaScript heap, which includes the Canvas probe's own objects; it excludes " +
              "GPU/renderer-side surface memory, which no web API exposes",
            generationInterval: `0 to ${MEASUREMENT.advanceGenerations}`,
            samplingProcedure:
              "read immediately before the first transition and immediately after the last, in-page",
            beforeBytes: memoryBefore,
            afterBytes: memoryAfter,
            deltaBytes: memoryAfter - memoryBefore,
            resolutionProbe: memoryProbe,
            limitations:
              "Chromium-only; absent on Safari. Quantization is verified per run by the probe rather " +
              "than assumed.",
          };
        }
        return {
          classification: "DESKTOP_CANVAS_MEMORY",
          status: "UNVERIFIED",
          reason: "no reliable supported measurement channel",
          detail:
            `The only browser-side channel available, performance.memory.usedJSHeapSize, was probed by ` +
            `allocating ${MEASUREMENT.memoryProbeBytes} bytes in the page; the reading did not move ` +
            `(${memoryProbe.beforeBytes} before and after). This Chromium build quantizes the value, so ` +
            "no browser-side delta from it carries information. No other supported API exposes " +
            "Canvas/renderer memory to page script.",
          channelProbed: "browser:performance.memory.usedJSHeapSize",
          resolutionProbe: memoryProbe,
          // Deliberately NOT a number. Revision 4 published a Node heap delta here
          // and called it authoritative; a numeric PASS for an unmeasured subject is
          // worse than an honest UNVERIFIED.
          deltaBytes: null,
          substituteOffered: null,
          note:
            "§22 requires desktop Canvas memory growth across the 180-generation run. This run did not " +
            "establish it. The Node figures reported separately under NODE_SIMULATION_HEAP measure a " +
            "different process and object graph and are NOT a substitute.",
        };
      })(),
      nodeSimulationHeap: {
        ...headlessReference.memory,
        note:
          "SEPARATELY NAMED DIAGNOSTIC (revision-5 R5-5). Node process heap over the same fixture, seed " +
          "and transition count. It contains no browser, Canvas, DOM, renderer or UI state, so it does " +
          "not and cannot answer the §22 Canvas memory requirement. Retained-record counts are the " +
          "useful, quantization-free part.",
      },
      pageErrors,
    };
  } finally {
    await browser.close();
    await new Promise((res) => server.close(() => res(undefined)));
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : join(ROOT, "audit", "desktop-measurements.json");
  const result = await runDesktopMeasurement();
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`desktop measurement -> ${out}`);
  console.log(
    `  normal: median ${result.normalMode.medianFrameTimeMs?.toFixed(2)} ms, ` +
    `p95 ${result.normalMode.p95FrameTimeMs?.toFixed(2)} ms, frames ${result.normalMode.frameCount}`
  );
  console.log(
    `  stress (${result.renderStressMode.declaredGlyphCount} glyphs, rendered ` +
    `${result.renderStressMode.renderedGlyphCount}): median ` +
    `${result.renderStressMode.medianFrameTimeMs?.toFixed(2)} ms, p95 ` +
    `${result.renderStressMode.p95FrameTimeMs?.toFixed(2)} ms, frames ${result.renderStressMode.frameCount}`
  );
  console.log(
    `  generation semantics: 0 -> ${result.generationSemantics.finalStateGeneration} ` +
    `(${result.generationSemantics.transitionsPerformed} transitions), population ${result.normalMode.populationAfterAdvance}`
  );
  console.log(
    `  headless cross-check: ${result.headlessCrossCheck.browserAgreesWithHeadless ? "AGREES" : "DISAGREES"}` +
    (result.headlessCrossCheck.disagreements.length
      ? ` (${result.headlessCrossCheck.disagreements.join("; ")})`
      : "")
  );
  console.log(
    `  DESKTOP_CANVAS_MEMORY: ${result.desktopCanvasMemory.status}` +
    (result.desktopCanvasMemory.status === "UNVERIFIED"
      ? ` (${result.desktopCanvasMemory.reason})`
      : ` delta ${result.desktopCanvasMemory.deltaBytes} bytes`) +
    `\n  NODE_SIMULATION_HEAP (separate diagnostic): heapUsed delta ` +
    `${result.nodeSimulationHeap.heapUsedDeltaBytes} bytes, retainedGenealogy ` +
    `${result.nodeSimulationHeap.retainedRecordCounts.retainedGenealogy}`
  );
  console.log(`  page errors: ${result.pageErrors.length}`);
  if (result.pageErrors.length > 0) process.exitCode = 1;
  if (!result.headlessCrossCheck.browserAgreesWithHeadless) process.exitCode = 1;
}
