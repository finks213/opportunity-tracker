// @ts-check
/**
 * Milestone 1 must not implement "group ended" logic (contract §16; revision-6
 * repair, M-1 / R6-G).
 *
 * The frozen contract expressly excludes that determination from this milestone.
 * Revision 5 introduced it while repairing a different defect:
 *
 *   src/observer/tracerChannels.js  FOCAL_LINEAGE_EXTINCT defined and derived
 *   src/main.js                     "no living descendant of the … focal lineage remains"
 *
 * Reproduced: `FOCAL_LINEAGE_EXTINCT` was a returned outcome, and the resolver
 * produced it both from a maintained witness that matched nobody and from a
 * genealogy zero it considered trustworthy — including at generation 1075, where
 * the "zero" was a floating-point underflow (see exact-membership-underflow).
 *
 * The permitted result when descent cannot be established is the unresolved state.
 * Reporting the OBSERVATION ("no living animal matched this witness right now") is
 * allowed and expected; converting it into a determination is not.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { FOCAL_OUTCOME, createObserverState, createTracerChannel, resolveFocalLineage }
  from "../src/observer/tracerChannels.js";
import { stripCommentsAndStrings } from "../tools/writeFinalReport.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const readSrc = (p) => readFileSync(join(ROOT, p), "utf8");

/** Production modules whose CODE must not carry the forbidden determination. */
const PRODUCTION = [
  "src/observer/tracerChannels.js",
  "src/main.js",
  "src/debug/controls.js",
  "src/debug/inspector.js",
];

test("§16 — no extinction outcome is defined", () => {
  assert.deepEqual(
    Object.keys(FOCAL_OUTCOME).sort(),
    ["RESOLVED", "UNRESOLVABLE"],
    "the outcome set must offer exactly two answers: established, or not established"
  );
  for (const value of Object.values(FOCAL_OUTCOME)) {
    assert.ok(!/EXTINCT|ENDED/i.test(value), `outcome "${value}" names a lineage-ended determination`);
  }
});

test("§16 — no production code path can produce a group-ended conclusion", () => {
  // Scanned as CODE, not prose: this repair record documents the removed name in
  // comments deliberately, so that a reader can see what was taken out and why.
  // A comment naming the token is a mention; an identifier is a use.
  for (const rel of PRODUCTION) {
    const code = stripCommentsAndStrings(readSrc(rel));
    for (const token of ["FOCAL_LINEAGE_EXTINCT", "LINEAGE_ENDED", "GROUP_ENDED"]) {
      assert.ok(
        !code.includes(token),
        `${rel} uses ${token} in code — §16 excludes group-ended logic from Milestone 1`
      );
    }
    assert.ok(
      !/\bEXTINCT\s*:/.test(code),
      `${rel} defines an EXTINCT outcome key — §16 excludes group-ended logic`
    );
  }
});

test("§16 — a witness that matches nobody reports the observation, not a verdict", () => {
  const observer = createObserverState();
  createTracerChannel(observer, "maintained:canopy", [1], [1, 2], { protectedChannel: true });
  // Everyone the witness knew is gone; two unrelated animals are alive.
  const state = {
    generation: 500,
    currentIndividuals: [{ id: 90 }, { id: 91 }],
    birthRecords: [], retainedGenealogy: [],
  };
  const out = resolveFocalLineage(observer, state, [1], { focalSetName: "canopy" });
  assert.equal(out.outcome, FOCAL_OUTCOME.UNRESOLVABLE, "revision 5 answered FOCAL_LINEAGE_EXTINCT here");
  assert.deepEqual(out.descendantIds, []);
  // The observation is reported...
  assert.equal(out.detail.livingDescendantsObservedNow, 0);
  // ...and explicitly not turned into a determination.
  assert.match(out.detail.note, /does not implement group-ended logic|draws no lineage-ended conclusion/);
  assert.ok(
    !/\b(is|are|has|have|was|were)\s+(extinct|ended)\b/i.test(JSON.stringify(out)),
    "no field may assert that the lineage ended"
  );
});

test("§16 — a trustworthy genealogy zero also stops short of a verdict", () => {
  // The founders are still inside the retained window and have no descendants.
  const observer = createObserverState();
  const state = {
    generation: 5,
    currentIndividuals: [{ id: 500 }],
    birthRecords: [],
    retainedGenealogy: [
      // The requested founders are inside the window, so a zero here is the case
      // revision 5 called trustworthy — and answered EXTINCT.
      { generation: 1, childId: 1, parentIds: null },
      { generation: 1, childId: 2, parentIds: null },
      { generation: 1, childId: 3, parentIds: null },
      { generation: 2, childId: 500, parentIds: [400, 401] },
    ],
  };
  const out = resolveFocalLineage(observer, state, [1, 2, 3]);
  assert.equal(out.detail.historicalPathIntact, true, "the zero must be the trustworthy kind");
  assert.equal(out.outcome, FOCAL_OUTCOME.UNRESOLVABLE);
  assert.ok(
    !/EXTINCT/.test(out.outcome),
    "a trustworthy zero is still not a Milestone-1 lineage-ended determination"
  );
});
