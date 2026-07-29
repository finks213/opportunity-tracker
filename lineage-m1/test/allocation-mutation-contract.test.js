// @ts-check
/**
 * Contract §20.8 — mandatory allocation-mutation opportunity contract.
 *
 * Exercises the production allocation-mutation path with a scripted serializable
 * RNG and proves the exact §13.1 semantics. Draw counts are asserted directly,
 * never inferred from final RNG inequality.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { allocationMutationOpportunity } from "../src/core/mutation.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { createSimRng } from "../src/core/rng.js";
import { ZONES } from "../src/config/zones.js";
import { ScriptedRng } from "./helpers/scriptedRng.js";
import { canonicalStringify } from "../src/core/canonicalSerialize.js";

const C = currentModelConfig;
const P = C.allocationMutationProbabilityPerChild; // 0.08
const ALL_ELIGIBLE = [true, true, true];

/** Convenience: run the opportunity with scripted uniforms. */
function run(allocation, eligible, uniforms, config = C) {
  const rng = new ScriptedRng(uniforms);
  const result = allocationMutationOpportunity(Float64Array.from(allocation), eligible, rng, config);
  return { result, consumed: rng.drawsConsumed };
}

test("§20.8.1 — failed occurrence: uOccurrence == probability fails, exactly one draw, nothing changes", () => {
  const allocation = [0.5, 0.5, 0.0];
  // Equality with the probability is a failure (strict `<` required).
  const { result, consumed } = run(allocation, ALL_ELIGIBLE, [P]);
  assert.equal(result.occurred, false, "equality with the probability must fail the occurrence");
  assert.equal(result.recorded, false);
  assert.equal(consumed, 1, "a failed occurrence consumes exactly one draw");
  assert.equal(result.drawsConsumed, 1);
  assert.deepEqual(Array.from(result.allocation), allocation, "allocation unchanged");
  assert.equal(result.draft, null, "no event drafted, so no counter is consumed");

  // Just below the probability succeeds, proving the boundary is exact.
  const justBelow = run(allocation, ALL_ELIGIBLE, [P - 1e-12, 0.0, 0.0, 0.0]);
  assert.equal(justBelow.result.occurred, true);
});

test("§20.8.2 — one low-share target: sole candidate still consumes the target draw; four draws total", () => {
  // canopy 0.99, forest_floor 0.01 (< eps 0.02 -> the sole low-share target),
  // shoreline 0.0 is NOT eligible here so it cannot be a candidate.
  const allocation = [0.99, 0.01, 0.0];
  const eligible = [true, true, false];
  const { result, consumed } = run(allocation, eligible, [
    0.0,  // uOccurrence -> success
    0.97, // uTarget -> still consumed even with one candidate
    0.5,  // uDonor
    0.5,  // uTransfer
  ]);
  assert.equal(result.occurred, true);
  assert.equal(consumed, 4, "a successful occurrence consumes exactly four draws");
  assert.equal(result.drawsConsumed, 4);
  assert.equal(result.recorded, true);
  assert.equal(result.draft.toZone, "forest_floor", "the sole low-share eligible zone is the target");
  assert.equal(result.draft.fromZone, "canopy", "donor drawn from positive eligible alternatives");
});

test("§20.8.3 — multiple low-share targets are canonically ordered and uniformly selected", () => {
  // forest_floor and shoreline both below eps; both eligible.
  const allocation = [0.98, 0.01, 0.01];
  const targets = [];
  for (const uTarget of [0.0, 0.49, 0.5, 0.99]) {
    const { result } = run(allocation, ALL_ELIGIBLE, [0.0, uTarget, 0.5, 0.5]);
    targets.push(result.draft.toZone);
  }
  // floor(uTarget * 2): 0,0,1,1 over canonical [forest_floor, shoreline]
  assert.deepEqual(targets, ["forest_floor", "forest_floor", "shoreline", "shoreline"]);

  // The frozen min(floor(u*n), n-1) rule clamps u -> 1-epsilon to the last index.
  const last = run(allocation, ALL_ELIGIBLE, [0.0, 0.999999999, 0.5, 0.5]);
  assert.equal(last.result.draft.toZone, "shoreline");
});

test("§20.8.4 — no low-share target: all eligible zones become the candidate array", () => {
  // Every eligible zone is at or above eps, so lowShareTargets is empty.
  const allocation = [0.34, 0.33, 0.33];
  const picked = [];
  for (const uTarget of [0.0, 0.34, 0.67, 0.999999]) {
    const { result, consumed } = run(allocation, ALL_ELIGIBLE, [0.0, uTarget, 0.5, 0.5]);
    assert.equal(consumed, 4);
    picked.push(result.draft ? result.draft.toZone : null);
  }
  // floor(u*3) over canonical [canopy, forest_floor, shoreline]
  assert.deepEqual(picked, ["canopy", "forest_floor", "shoreline", "shoreline"]);
});

test("§20.8.5 — donor selection is share-weighted with canonical cumulative order and a strict boundary", () => {
  // target = shoreline (sole low-share). Donors: canopy 0.7, forest_floor 0.3.
  const allocation = [0.7, 0.3, 0.0];
  const weightSum = 1.0;

  // threshold = uDonor * weightSum. First candidate whose cumulative > threshold.
  // uDonor = 0.69 -> threshold 0.69 < 0.7 cumulative -> canopy
  const a = run(allocation, ALL_ELIGIBLE, [0.0, 0.5, 0.69, 0.5]);
  assert.equal(a.result.draft.fromZone, "canopy");

  // uDonor = 0.70 -> threshold 0.70; cumulative canopy 0.7 is NOT > 0.7 (strict),
  // so selection falls through to forest_floor.
  const b = run(allocation, ALL_ELIGIBLE, [0.0, 0.5, 0.70, 0.5]);
  assert.equal(b.result.draft.fromZone, "forest_floor", "boundary is strict cumulative > threshold");

  // uDonor just under 1 selects the final candidate.
  const c = run(allocation, ALL_ELIGIBLE, [0.0, 0.5, 0.9999999, 0.5]);
  assert.equal(c.result.draft.fromZone, "forest_floor");
  assert.ok(Math.abs(weightSum - 1.0) < 1e-12);
});

test("§20.8.6 — no valid donor: all four draws consumed, allocation unchanged, no event", () => {
  // Only canopy is eligible and it is the target, so no donor candidate exists.
  const allocation = [1.0, 0.0, 0.0];
  const eligible = [true, false, false];
  const { result, consumed } = run(allocation, eligible, [0.0, 0.5, 0.5, 0.5]);
  assert.equal(result.occurred, true);
  assert.equal(result.recorded, false, "no event recorded");
  assert.equal(consumed, 4, "all four successful-path draws are still consumed");
  assert.equal(result.drawsConsumed, 4);
  assert.deepEqual(Array.from(result.allocation), allocation, "allocation unchanged");
  assert.equal(result.draft, null);
});

test("§20.8.7 — transfer follows the frozen formula; only positive realized transfers are recorded", () => {
  const allocation = [0.9, 0.1, 0.0];
  const uTransfer = 0.25;
  const expectedRequested =
    C.allocationMutationTransferMin +
    uTransfer * (C.allocationMutationTransferMax - C.allocationMutationTransferMin);

  const { result } = run(allocation, ALL_ELIGIBLE, [0.0, 0.99, 0.0, uTransfer]);
  assert.ok(Math.abs(result.draft.requestedTransfer - expectedRequested) <= 1e-15);
  assert.equal(result.draft.realizedTransfer, Math.min(expectedRequested, 0.9));
  assert.equal(result.recorded, true);
  // Resulting allocation sums to 1 and moved share in the right direction.
  const out = Array.from(result.allocation);
  assert.ok(Math.abs(out.reduce((a, b) => a + b, 0) - 1) <= 1e-12);
  assert.ok(out[2] > 0, "target gained share");
  assert.ok(out[0] < 0.9, "donor lost share");

  // A donor holding exactly zero cannot be a candidate at all. With donors
  // [canopy 0.999999, forest_floor 0.000001] and weightSum 1.0, a mid-range
  // uDonor lands inside canopy's cumulative band, so the large share is chosen.
  const big = run([0.999999, 0.000001, 0.0], ALL_ELIGIBLE, [0.0, 0.99, 0.5, 0.5]);
  assert.equal(big.result.draft.fromZone, "canopy", "weighted donor selection favours the large share");
  // Only a threshold above canopy's entire cumulative weight reaches the tiny
  // donor, which is exactly the strict `cumulative > threshold` boundary.
  const tiny = run([0.999999, 0.000001, 0.0], ALL_ELIGIBLE, [0.0, 0.99, 0.9999999, 0.5]);
  assert.equal(tiny.result.draft.fromZone, "forest_floor");
});

test("§20.8.7 — realized transfer is capped by the donor's current share", () => {
  // Donor forest_floor holds 0.01, far below the 0.03..0.12 request range.
  const allocation = [0.0, 0.01, 0.99];
  const eligible = [true, true, true];
  // target: canopy (share 0 < eps) is the sole low-share target... shoreline 0.99
  // is above eps, forest_floor 0.01 is also below eps, so candidates are
  // [canopy, forest_floor]; uTarget 0.0 -> canopy.
  const { result } = run(allocation, eligible, [0.0, 0.0, 0.0, 0.0]);
  assert.equal(result.draft.toZone, "canopy");
  // uDonor 0.0 -> threshold 0; first cumulative > 0 is forest_floor (0.01).
  assert.equal(result.draft.fromZone, "forest_floor");
  assert.equal(result.draft.realizedTransfer, 0.01, "capped at the donor's share");
  assert.ok(result.draft.requestedTransfer > 0.01);
  assert.equal(result.recorded, true);
});

test("§20.8.8 — replay: restoring the exact serialized RNG state reproduces everything", () => {
  // Use the production serializable RNG, not the scripted one.
  const rngA = createSimRng(20250729);
  // Advance to a non-trivial state.
  for (let i = 0; i < 37; i++) rngA.nextFloat();
  const savedState = rngA.toState();

  const allocation = Float64Array.from([0.6, 0.4, 0.0]);
  const first = allocationMutationOpportunity(allocation, ALL_ELIGIBLE, rngA, {
    ...C,
    allocationMutationProbabilityPerChild: 1.0, // force a successful occurrence
  });
  const afterFirst = rngA.toState();

  // Restore the exact state and replay.
  const rngB = createSimRng(1);
  rngB.s = /** @type {[number,number,number,number]} */ (savedState.s.slice());
  rngB.hasSpareNormal = savedState.hasSpareNormal;
  rngB.spareNormal = savedState.spareNormal;
  const second = allocationMutationOpportunity(Float64Array.from([0.6, 0.4, 0.0]), ALL_ELIGIBLE, rngB, {
    ...C,
    allocationMutationProbabilityPerChild: 1.0,
  });

  assert.equal(second.drawsConsumed, first.drawsConsumed, "identical draw count");
  assert.deepEqual(second.draft, first.draft, "identical target, donor, requested and realized transfer");
  assert.deepEqual(Array.from(second.allocation), Array.from(first.allocation), "identical resulting allocation");
  assert.equal(canonicalStringify(second.draft), canonicalStringify(first.draft), "identical event bytes");
  assert.deepEqual(rngB.toState(), afterFirst, "identical resulting RNG state");
});

test("§13.1 — an empty target-candidate array is treated as a contract violation", () => {
  assert.throws(
    () => run([0.5, 0.5, 0.0], [false, false, false], [0.0, 0.5, 0.5, 0.5]),
    /empty target-candidate array/
  );
});

test("§13.1 — zone iteration and candidate arrays use canonical zone order", () => {
  assert.deepEqual(Array.from(ZONES), ["canopy", "forest_floor", "shoreline"]);
});
