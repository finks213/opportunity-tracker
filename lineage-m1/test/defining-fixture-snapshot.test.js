// @ts-check
/**
 * Contract §19 A, B, C — proved separately, as the contract requires.
 *   A. raw artifact integrity (SHA-256 over the exact checked-in bytes)
 *   B. fixture-envelope canonical round trip
 *   C. deterministic hydration
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  readFixtureBytes,
  readFixtureText,
  sha256Hex,
  loadValidatedFixture,
} from "../src/fixtures/nodeFixtureIO.js";
import {
  EXPECTED_FIXTURE_SHA256,
  parseEnvelope,
  hydrateDefiningFixtureV1,
  STANDARD_TRAIT_TEST_GENOME,
  STANDARD_ZONE_LOADS,
} from "../src/fixtures/definingFixtureV1.js";
import {
  serializeCanonicalFixtureEnvelope,
  serializeCanonicalBiology,
} from "../src/core/canonicalSerialize.js";
import { currentModelConfig, SCHEMA_VERSION } from "../src/config/modelConfig.js";
import { ZONES } from "../src/config/zones.js";

test("§19 A — raw fixture bytes hash to the frozen SHA-256", () => {
  const bytes = readFixtureBytes();
  const hash = sha256Hex(bytes);
  assert.equal(hash, EXPECTED_FIXTURE_SHA256, "any byte change fails fixture integrity");
});

test("§19 A — fixture declares its frozen load-bearing values", () => {
  const { envelope } = loadValidatedFixture();
  assert.equal(envelope.fixtureSchemaVersion, "lineage-defining-fixture-1");
  assert.equal(envelope.currentIndividuals.length, 120);
  assert.equal(envelope.lowWebbing, 0.15);
  assert.equal(envelope.highWebbing, 0.75);
  assert.equal(envelope.measurementGeneration, 90);
  assert.equal(envelope.trajectorySeeds.start, 1);
  assert.equal(envelope.trajectorySeeds.endInclusive, 200);
  assert.deepEqual(envelope.canopyFocalIds, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(envelope.shorelineFocalIds, [81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92]);
  // id bands
  const ids = envelope.currentIndividuals.map((i) => i.id);
  assert.deepEqual(ids, Array.from({ length: 120 }, (_, i) => i + 1));
});

test("§9/§19.1 — fixture baseline genome and standard loads equal the frozen §9 values", () => {
  const { envelope, recomputedLoads } = loadValidatedFixture();
  assert.deepEqual(envelope.baselineBodyGenome, Array.from(STANDARD_TRAIT_TEST_GENOME));
  assert.equal(envelope.standardZoneLoads.canopy, STANDARD_ZONE_LOADS.canopy);
  assert.equal(envelope.standardZoneLoads.forest_floor, STANDARD_ZONE_LOADS.forest_floor);
  assert.equal(envelope.standardZoneLoads.shoreline, STANDARD_ZONE_LOADS.shoreline);
  // The loader recomputes loads and fails beyond 1e-12 (asserted inside
  // loadValidatedFixture); re-assert here so the tolerance is visible.
  const declared = [39.84, 40.32, 39.84];
  for (let z = 0; z < ZONES.length; z++) {
    assert.ok(
      Math.abs(recomputedLoads[z] - declared[z]) <= 1e-12,
      `zone ${ZONES[z]} recomputed load ${recomputedLoads[z]} differs from ${declared[z]}`
    );
  }
});

test("§19 B — canonical fixture-envelope round trip is byte-identical", () => {
  const text = readFixtureText();
  const envelope1 = parseEnvelope(text);
  const canonical1 = serializeCanonicalFixtureEnvelope(envelope1);
  const envelope2 = JSON.parse(canonical1);
  const canonical2 = serializeCanonicalFixtureEnvelope(envelope2);
  assert.equal(canonical2, canonical1, "envelope canonical bytes must survive a parse/serialize cycle");
  // A semantic round trip, not a claim about the source file's whitespace.
  const envelope3 = JSON.parse(canonical2);
  assert.equal(serializeCanonicalFixtureEnvelope(envelope3), canonical1);
});

test("§19 B — canonical envelope includes metadata and sorts keys recursively", () => {
  const { envelope } = loadValidatedFixture();
  const canonical = serializeCanonicalFixtureEnvelope(envelope);
  for (const field of [
    "fixtureSchemaVersion", "description", "traitOrder", "zoneOrder",
    "baselineBodyGenome", "bandAllocations", "canopyFocalIds", "shorelineFocalIds",
    "measurementGeneration", "tieTreatment", "standardZoneLoads", "trajectorySeeds",
  ]) {
    assert.ok(canonical.includes(JSON.stringify(field)), `envelope must retain metadata field ${field}`);
  }
  // Key order inside the canonical output is sorted.
  const objKeys = Object.keys(JSON.parse(canonical));
  assert.deepEqual(objKeys, objKeys.slice().sort(), "top-level keys must be sorted");
  // Array order is preserved.
  assert.deepEqual(JSON.parse(canonical).canopyFocalIds, envelope.canopyFocalIds);
});

test("§19 C — hydration is deterministic and byte-identical for the same envelope and seed", () => {
  const { envelope } = loadValidatedFixture();
  const a = hydrateDefiningFixtureV1(envelope, 42);
  const b = hydrateDefiningFixtureV1(envelope, 42);
  assert.equal(serializeCanonicalBiology(a), serializeCanonicalBiology(b));
  // A different seed must change only the RNG state, hence the bytes.
  const c = hydrateDefiningFixtureV1(envelope, 43);
  assert.notEqual(serializeCanonicalBiology(c), serializeCanonicalBiology(a));
});

test("§19 C — hydration copies biological counters and excludes fixture metadata", () => {
  const { envelope } = loadValidatedFixture();
  const state = hydrateDefiningFixtureV1(envelope, 1);
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.schemaVersion, "lineage-biological-state-1");
  assert.equal(state.configVersion, currentModelConfig.version);
  assert.equal(state.generation, envelope.generation);
  assert.equal(state.nextIndividualId, envelope.nextIndividualId);
  assert.equal(state.nextBirthEventId, envelope.nextBirthEventId);
  assert.equal(state.nextMatingEventId, envelope.nextMatingEventId);
  // Both mutation counters are active biological state, neither is envelope-only.
  assert.equal(state.nextMutationEventId, envelope.nextMutationEventId);
  assert.equal(state.nextAllocationMutationEventId, envelope.nextAllocationMutationEventId);

  const canonical = serializeCanonicalBiology(state);
  for (const metadataField of [
    "description", "traitOrder", "zoneOrder", "baselineBodyGenome", "bandAllocations",
    "canopyFocalIds", "shorelineFocalIds", "trajectorySeeds", "measurementGeneration",
    "tieTreatment", "standardZoneLoads", "lowWebbing", "highWebbing", "fixtureSchemaVersion",
  ]) {
    assert.ok(
      !canonical.includes(JSON.stringify(metadataField)),
      `canonical biological state must exclude fixture metadata field ${metadataField}`
    );
  }
});

test("§19 C — hydration initializes simRng only through createSimRng(trajectorySeed)", async () => {
  const { envelope } = loadValidatedFixture();
  const { createSimRng } = await import("../src/core/rng.js");
  const state = hydrateDefiningFixtureV1(envelope, 12345);
  const expected = createSimRng(12345);
  assert.deepEqual(state.simRng.toState(), expected.toState());
});

test("§18/§21.7 — canonical state records the configuration that actually produced it", async () => {
  // Regression test for an audit finding: state creation hardcoded
  // currentModelConfig.version, so a world built under the superseded
  // configuration falsely serialized as lineage-m1-config-2. That breaks state
  // provenance, canonical replay interpretation, and the §21.7 side-by-side.
  const { createInitialState } = await import("../src/core/individual.js");
  const { legacyModelConfigV1 } = await import("../src/config/modelConfig.js");

  const current = createInitialState(1, currentModelConfig);
  const legacy = createInitialState(1, legacyModelConfigV1);

  assert.equal(current.configVersion, currentModelConfig.version);
  assert.equal(legacy.configVersion, legacyModelConfigV1.version);
  assert.notEqual(legacy.configVersion, currentModelConfig.version);

  // The recorded version must reach the canonical bytes.
  assert.ok(serializeCanonicalBiology(current).includes(currentModelConfig.version));
  assert.ok(serializeCanonicalBiology(legacy).includes(legacyModelConfigV1.version));

  // Otherwise-identical states differing only in config version must not
  // serialize to the same bytes.
  const a = createInitialState(1, currentModelConfig);
  const b = createInitialState(1, currentModelConfig);
  assert.equal(serializeCanonicalBiology(a), serializeCanonicalBiology(b));
  b.configVersion = "lineage-m1-config-1";
  assert.notEqual(serializeCanonicalBiology(a), serializeCanonicalBiology(b));

  // Fixture hydration carries the supplied configuration too.
  const { envelope } = loadValidatedFixture();
  const hydratedLegacy = hydrateDefiningFixtureV1(envelope, 1, legacyModelConfigV1);
  assert.equal(hydratedLegacy.configVersion, legacyModelConfigV1.version);
});

test("§20.7 — canonical serialization changes when either mutation counter changes", () => {
  const { envelope } = loadValidatedFixture();
  const base = hydrateDefiningFixtureV1(envelope, 5);
  const bytes0 = serializeCanonicalBiology(base);

  const bumpBody = hydrateDefiningFixtureV1(envelope, 5);
  bumpBody.nextMutationEventId += 1;
  assert.notEqual(serializeCanonicalBiology(bumpBody), bytes0);

  const bumpAlloc = hydrateDefiningFixtureV1(envelope, 5);
  bumpAlloc.nextAllocationMutationEventId += 1;
  assert.notEqual(serializeCanonicalBiology(bumpAlloc), bytes0);

  // And the two counters are genuinely distinct fields.
  assert.notEqual(
    serializeCanonicalBiology(bumpBody),
    serializeCanonicalBiology(bumpAlloc)
  );
});
