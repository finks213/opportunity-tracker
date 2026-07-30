// @ts-check
/**
 * Contract §20.3 — no observer dependencies in biology.
 *
 * Static import scan: biological modules must not import observer or debug
 * modules. Also enforces the §18 exclusion list at the module level and the
 * §3 zero-runtime-dependency rule.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { stripCommentsAndStrings } from "../tools/writeFinalReport.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(ROOT, "src");

/** Recursively list source files under a directory. */
function listSources(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSources(full));
    else if (/\.(js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Extract every import/export-from specifier from a source file. */
function importSpecifiers(text) {
  const specs = [];
  const patterns = [
    /import\s[^;]*?from\s*["']([^"']+)["']/g,
    /export\s[^;]*?from\s*["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /import\s*["']([^"']+)["']/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) specs.push(m[1]);
  }
  return specs;
}

const BIOLOGICAL_DIRS = ["core", "config", "fixtures"];

test("§20.3 — biological modules never import observer or debug modules", () => {
  const violations = [];
  for (const sub of BIOLOGICAL_DIRS) {
    for (const file of listSources(join(SRC, sub))) {
      const text = readFileSync(file, "utf8");
      for (const spec of importSpecifiers(text)) {
        if (/(^|\/)observer\//.test(spec) || /(^|\/)debug\//.test(spec)) {
          violations.push(`${relative(ROOT, file)} imports ${spec}`);
        }
      }
    }
  }
  assert.deepEqual(violations, [], `biological modules must not depend on observer/debug code:\n${violations.join("\n")}`);
});

test("§20.3 — observer modules never import debug modules and never receive simRng", () => {
  const violations = [];
  for (const file of listSources(join(SRC, "observer"))) {
    const text = readFileSync(file, "utf8");
    for (const spec of importSpecifiers(text)) {
      if (/(^|\/)debug\//.test(spec)) violations.push(`${relative(ROOT, file)} imports ${spec}`);
    }
    // No observer function may take or use the simulation RNG.
    //
    // Revision-5 change (R5-8 principle): scan CODE, not prose. A raw-text scan made
    // it impossible for an observer module to DOCUMENT that it never touches the
    // simulation RNG, which is exactly what `tracerChannels.js` now explains about
    // its maintained focal channels. The bar is unchanged — zero uses.
    const code = stripCommentsAndStrings(text);
    assert.ok(
      !/\bsimRng\b/.test(code),
      `${relative(ROOT, file)} must not reference the simulation RNG in code`
    );
    assert.ok(!/createSimRng/.test(text), `${relative(ROOT, file)} must not construct a simulation RNG`);
  }
  assert.deepEqual(violations, []);
});

test("§17 — no Canvas/debug function receives simRng", () => {
  for (const file of listSources(join(SRC, "debug"))) {
    const text = readFileSync(file, "utf8");
    assert.ok(
      !/createSimRng/.test(text),
      `${relative(ROOT, file)} must not construct a simulation RNG; debug code uses uiRng only`
    );
  }
});

test("§3 — no runtime dependencies and no forbidden frameworks", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.deepEqual(pkg.dependencies ?? {}, {}, "runtime dependencies must be empty");
  assert.equal(pkg.type, "module", "ES modules only");

  const forbidden = ["react", "vite", "tailwind", "typescript", "three", "matter-js", "phaser"];
  for (const file of listSources(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const spec of importSpecifiers(text)) {
      // Only relative imports and node: builtins are allowed.
      const isRelative = spec.startsWith(".") || spec.startsWith("/");
      const isNodeBuiltin = spec.startsWith("node:");
      assert.ok(
        isRelative || isNodeBuiltin,
        `${relative(ROOT, file)} imports a bare specifier "${spec}"; Milestone 1 has no runtime dependencies`
      );
      for (const bad of forbidden) {
        assert.ok(!spec.toLowerCase().includes(bad), `${relative(ROOT, file)} must not import ${bad}`);
      }
    }
  }
});

test("§19/§3 — the isomorphic fixture loader does not import node builtins", () => {
  const text = readFileSync(join(SRC, "fixtures", "definingFixtureV1.js"), "utf8");
  for (const spec of importSpecifiers(text)) {
    assert.ok(
      !spec.startsWith("node:"),
      `definingFixtureV1.js must stay browser-importable; found ${spec}`
    );
  }
});

test("§20.3 — core biological modules do not reference observer concepts", () => {
  const forbiddenTokens = ["tracerChannel", "activeChannel", "inspectedIds", "currentZoneBin", "canvas", "camera"];
  for (const file of listSources(join(SRC, "core"))) {
    const text = readFileSync(file, "utf8");
    for (const token of forbiddenTokens) {
      assert.ok(
        !text.includes(token),
        `${relative(ROOT, file)} must not reference the observer concept "${token}"`
      );
    }
  }
});

test("§23 — every required file exists at its required path", () => {
  const required = [
    "README.md", "PLAN.md", "DECISIONS.md", "CHARACTERIZATION_PLAN.md",
    "package.json", "index.html", "styles.css",
    "fixtures/defining_fixture_v1.json",
    "reference/biology.py", "reference/engine.py", "reference/analyze.py",
    "src/config/modelConfig.js", "src/config/traits.js", "src/config/zones.js",
    "src/core/rng.js", "src/core/math.js", "src/core/individual.js",
    "src/core/performance.js", "src/core/survival.js", "src/core/mating.js",
    "src/core/inheritance.js", "src/core/mutation.js", "src/core/genealogy.js",
    "src/core/events.js", "src/core/simulation.js", "src/core/canonicalSerialize.js",
    "src/fixtures/definingFixtureV1.js",
    "src/observer/tracerChannels.js", "src/observer/currentZoneBins.js",
    "src/observer/matingAnnotations.js",
    "src/debug/canvasProbe.js", "src/debug/animalGlyph.js",
    "src/debug/inspector.js", "src/debug/controls.js",
    "src/main.js",
    "tools/serve.mjs", "tools/runFixture.mjs",
    "tools/runCharacterization.mjs", "tools/writeCharacterization.mjs",
  ];
  const missing = required.filter((p) => !existsSync(join(ROOT, p)));
  assert.deepEqual(missing, [], `missing required paths: ${missing.join(", ")}`);
});
