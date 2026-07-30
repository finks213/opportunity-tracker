// @ts-check
/**
 * The desktop measurement must be REPRODUCIBLE and must not overclaim
 * (contract §22 "Desktop measurement").
 *
 * Revision-4 repair. Revision 3 shipped `audit/desktop-measurements.json`
 * describing a Playwright Chromium run, but the repository contained no driver
 * script, no browser dependency, no lockfile entry and no command that could
 * regenerate it. Reproduced against the revision-3 bundle:
 *
 *   $ grep -rl playwright package.json tools/     -> (no matches)
 *   $ ls package-lock.json                        -> No such file or directory
 *   $ npm run | grep desktop                      -> (no script)
 *
 * The raw JSON also reported `status generation: 181` beside a field named
 * `populationAfter180Generations` (a 180/181 ambiguity), and reported a
 * browser-side heap delta as memory-growth evidence even though Chromium
 * quantizes `performance.memory` to a constant.
 *
 * These tests do NOT launch a browser — that is `npm run audit:desktop`. They
 * check that the reproducible path exists, that the frozen parameters are
 * actually frozen, that the Node-side reference agrees with the committed
 * evidence, and that no unverified memory channel is presented as evidence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { MEASUREMENT, measureHeadlessReference } from "../tools/measureDesktop.mjs";
import { readMemory } from "../src/debug/desktopMeasure.js";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

test("§22 — one clean command regenerates the desktop evidence", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(
    pkg.scripts["audit:desktop"],
    "node tools/measureDesktop.mjs",
    "the single documented command must exist and point at the committed driver"
  );
  assert.ok(existsSync(join(ROOT, "tools", "measureDesktop.mjs")), "the driver script must ship");
});

test("§22 — the browser dependency is declared AND pinned by a lockfile", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.devDependencies?.playwright, "playwright must be a declared devDependency");

  assert.ok(existsSync(join(ROOT, "package-lock.json")), "a lockfile must ship for reproducibility");
  const lock = JSON.parse(read("package-lock.json"));
  const entry = lock.packages?.["node_modules/playwright"];
  assert.ok(entry, "the lockfile must contain a playwright entry");
  assert.match(entry.version, /^\d+\.\d+\.\d+$/, "the locked version must be exact");
  assert.ok(entry.integrity, "the locked entry must carry an integrity hash");
  assert.ok(entry.resolved, "the locked entry must record its resolved tarball");
});

test("§22 — every measurement parameter is frozen, not incidental", () => {
  assert.ok(Object.isFrozen(MEASUREMENT), "MEASUREMENT must be frozen");
  assert.ok(Object.isFrozen(MEASUREMENT.viewport), "the viewport must be frozen");
  for (const key of [
    "schema", "viewport", "deviceScaleFactor", "measurementSeed", "advanceGenerations",
    "warmupMs", "normalSampleMs", "stressSampleMs", "controlActions", "stressGlyphCount",
    "memoryProbeBytes",
  ]) {
    assert.ok(key in MEASUREMENT, `${key} must be a declared frozen parameter`);
  }
  assert.equal(MEASUREMENT.stressGlyphCount, 360, "§22 mandates exactly 360 stress glyphs");
  assert.equal(MEASUREMENT.advanceGenerations, 180, "§22 mandates a 180-generation memory window");
  assert.ok(MEASUREMENT.controlActions >= 20, "at least 20 control actions are required");
});

test("§22 — generation semantics are stated explicitly, not left to inference", () => {
  const m = JSON.parse(read("audit/desktop-measurements.json"));
  const g = m.generationSemantics;
  assert.equal(g.initialStateGeneration, 0);
  assert.equal(g.transitionsPerformed, MEASUREMENT.advanceGenerations);
  assert.equal(g.finalStateGeneration, MEASUREMENT.advanceGenerations);
  assert.equal(
    g.finalStateGeneration,
    g.initialStateGeneration + g.transitionsPerformed,
    "the three numbers must be mutually consistent"
  );
  assert.ok(g.rule && g.rule.length > 0, "the rule must be written down");
  // The revision-3 ambiguity must not reappear anywhere in the file.
  const text = read("audit/desktop-measurements.json");
  assert.ok(
    !/populationAfter180Generations/.test(text),
    "the ambiguous field name must be gone; population is reported against an explicit generation"
  );
  assert.equal(m.normalMode.finalStateGeneration, g.finalStateGeneration);
  assert.match(
    m.normalMode.statusLine,
    new RegExp(`generation ${g.finalStateGeneration}\\b`),
    "the UI status line must agree with the recorded final generation"
  );
});

test("§22 — the committed evidence agrees with an independent Node run of the same world", () => {
  const m = JSON.parse(read("audit/desktop-measurements.json"));
  const ref = measureHeadlessReference().crossCheck;

  assert.equal(ref.finalStateGeneration, MEASUREMENT.advanceGenerations);
  assert.equal(
    m.normalMode.populationAfterAdvance,
    ref.population,
    "the recorded browser population must match a fresh Node run of the same fixture and seed"
  );
  assert.deepEqual(
    m.normalMode.zoneBins,
    ref.zoneBins,
    "the recorded browser zone bins must match a fresh Node run"
  );
  assert.equal(m.headlessCrossCheck.browserAgreesWithHeadless, true);
  assert.deepEqual(m.headlessCrossCheck.disagreements, []);
  assert.equal(m.headlessCrossCheck.population, ref.population);
  assert.deepEqual(m.headlessCrossCheck.zoneBins, ref.zoneBins);
});

test("§22 — the stress glyph count is measured, not merely declared", () => {
  const m = JSON.parse(read("audit/desktop-measurements.json"));
  assert.equal(m.renderStressMode.declaredGlyphCount, 360);
  assert.equal(
    m.renderStressMode.renderedGlyphCount,
    360,
    "the renderer must report the glyphs it actually drew"
  );
  assert.equal(m.renderStressMode.glyphCountMatchesDeclaration, true);
});

test("§22 — the Canvas memory measure is never satisfied by a different process", () => {
  // Revision-5 repair (BUG 5 / R5-5). The revision-4 version of THIS test asserted
  //
  //   assert.equal(mem.authoritativeChannel, "node:process.memoryUsage()");
  //
  // which validated the substitution instead of constraining §22's subject. The
  // auditor named that as a test-oracle defect, and it was: the oracle agreed with
  // the implementation about the wrong thing.
  const m = JSON.parse(read("audit/desktop-measurements.json"));

  // 1. The §22 subject is reported under its own name, with a status, never merged
  //    with a Node measurement.
  const cm = m.desktopCanvasMemory;
  assert.ok(cm, "desktopCanvasMemory must be reported as its own result");
  assert.equal(cm.classification, "DESKTOP_CANVAS_MEMORY");
  assert.ok(
    cm.status === "MEASURED" || cm.status === "UNVERIFIED",
    `status must be MEASURED or UNVERIFIED, got ${cm.status}`
  );

  // 2. The Node figure is reported separately and self-identifies as NOT the subject.
  const nh = m.nodeSimulationHeap;
  assert.ok(nh, "nodeSimulationHeap must be reported separately");
  assert.equal(nh.classification, "NODE_SIMULATION_HEAP");
  assert.equal(
    nh.measuresCanvasOrBrowserMemory,
    false,
    "the Node heap must declare that it does not measure Canvas or browser memory"
  );
  assert.equal(nh.authoritativeForCanvasMemory, false);
  assert.equal(typeof nh.heapUsedDeltaBytes, "number");
  assert.ok(nh.retainedRecordCounts.retainedGenealogy > 0, "retained-record counts must be recorded");

  // 3. The revision-4 shape must be gone entirely.
  assert.equal(m.memoryAcrossAdvance, undefined, "the merged revision-4 field must not exist");
  const raw = read("audit/desktop-measurements.json");
  assert.ok(
    !/"authoritativeChannel"\s*:\s*"node:process\.memoryUsage\(\)"/.test(raw),
    "a Node channel must never be declared authoritative for the Canvas measure"
  );

  // 4. When UNVERIFIED, no number may be offered and no substitute named.
  if (cm.status === "UNVERIFIED") {
    assert.equal(cm.reason, "no reliable supported measurement channel");
    assert.equal(cm.deltaBytes, null, "an unmeasured subject must not carry a number");
    assert.equal(cm.substituteOffered, null, "no substitute may be offered");
    assert.ok(cm.resolutionProbe, "the probe that established this must be recorded");
    assert.equal(cm.resolutionProbe.responsive, false);
    assert.match(cm.note, /NOT a substitute/);
  } else {
    // When MEASURED, the order's documentation requirements must all be present.
    for (const field of [
      "channel", "browser", "measurementApi", "includedMemoryDomains",
      "generationInterval", "samplingProcedure", "limitations",
    ]) {
      assert.ok(cm[field], `a MEASURED result must document ${field}`);
    }
    assert.equal(typeof cm.deltaBytes, "number");
    assert.equal(cm.resolutionProbe.responsive, true, "a MEASURED result requires a responsive probe");
  }
});

test("§22 — the report classifies the two memory results, and grants no PASS to the unmeasured one", () => {
  const m = JSON.parse(read("audit/desktop-measurements.json"));
  const report = read("FINAL_REPORT.md");
  const gates = JSON.parse(read("audit/gate-summary.json"));

  // The report must name both classifications explicitly.
  assert.ok(report.includes("`DESKTOP_CANVAS_MEMORY`"), "the report must name the §22 subject");
  assert.ok(
    report.includes("`NODE_SIMULATION_HEAP` — a separate diagnostic, NOT the §22 subject"),
    "the report must mark the Node heap as a separate diagnostic"
  );

  // The gate for Canvas memory must carry the raw status and must never be PASS.
  const gate = gates.gates.find((g) => g.id === "desktopCanvasMemory");
  assert.ok(gate, "a Canvas-memory gate must exist");
  assert.notEqual(gate.status, "PASS", "an unmeasured subject may never read PASS");
  assert.equal(gate.status, m.desktopCanvasMemory.status);
  assert.equal(gate.evidence, "external", "it is not test-evidenced and must not pretend to be");
});

test("§22 — readMemory does not claim a verified resolution", () => {
  const r = readMemory();
  assert.equal(
    r.resolutionVerified,
    false,
    "a bare performance.memory read can never assert verified resolution"
  );
  assert.equal(typeof r.exposed, "boolean");
  assert.ok(!("available" in r), "the ambiguous `available` label must be gone");
  assert.match(r.note, /quantized|not exposed/);
});

test("§22 — the desktop run does not claim the iPad gate's windows or verdict", () => {
  const m = JSON.parse(read("audit/desktop-measurements.json"));
  assert.equal(m.windowComparison.satisfiesIpadGateWindows, false);
  assert.equal(m.windowComparison.ipadGateWarmupMs, 30000);
  assert.equal(m.windowComparison.ipadGateStressSampleMs, 180000);
  assert.ok(
    m.windowComparison.desktopStressSampleMs < m.windowComparison.ipadGateStressSampleMs,
    "the desktop window is shorter and must be recorded as such"
  );
  assert.match(m.note, /PENDING_HUMAN_DEVICE_TEST/);
  const text = read("audit/desktop-measurements.json");
  for (const forbidden of ["IPAD_GATE_PASS", "iPad gate passes", "IPAD TEST: PASS"]) {
    assert.ok(!text.includes(forbidden), `the desktop evidence must not contain "${forbidden}"`);
  }
});

test("§22 — the run recorded no page errors", () => {
  const m = JSON.parse(read("audit/desktop-measurements.json"));
  assert.deepEqual(m.pageErrors, [], "a clean measurement must have no console or page errors");
});
