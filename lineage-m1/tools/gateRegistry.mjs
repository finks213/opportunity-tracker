// @ts-check
/**
 * The gate registry: every reported gate mapped to the named tests that evidence
 * it (contract §§20, 26, 28).
 *
 * Revision-5 repair (BUG 7 / R5-7). Revision 4 derived only the full-suite row from
 * `tap.fail`; every feature row was a literal `**PASS**` string and the completion
 * table always emitted `every automated result reproducible … met`. Reproduced by
 * changing one TAP summary from 249/249 to 248/249 and regenerating:
 *
 *   Full test suite: FAIL — 1 of 249 failing
 *   Birth immutability: PASS
 *   Canonical model identity: PASS
 *   every automated result reproducible from a clean run: met — 248/249 from clean
 *
 * The report could contradict itself and preserve a feature-level PASS while that
 * feature's own test was the one that failed.
 *
 * HOW IT WORKS NOW. Each gate declares the test names that evidence it. The TAP
 * parser records per-test pass/fail, so a gate's status is derived:
 *
 *   PASS        every mapped test ran and passed
 *   FAIL        at least one mapped test failed
 *   UNVERIFIED  no mapped test was observed in the run, OR the suite failed and
 *               the failure could not be attributed
 *
 * `UNVERIFIED` is never rendered as a pass. When the suite has any failure that
 * cannot be attributed to a gate, every unmapped gate degrades to `UNVERIFIED`
 * rather than keeping a stale PASS — an unattributable failure means the run does
 * not evidence those gates, even if it once did.
 *
 * Gates that are not test-evidenced at all (the physical iPad gate, the Stage A
 * process order) declare `evidence: "external"` and carry a fixed non-passing
 * status. They are never derived, and never PASS.
 */

/**
 * @typedef {Object} GateSpec
 * @property {string} id            stable machine id
 * @property {string} label         report row label
 * @property {string} section       contract section
 * @property {string[]} [tests]     exact `not ok`/`ok` test names evidencing this gate
 * @property {string} [evidence]    "tests" (default) or "external"
 * @property {string} [fixedStatus] for external gates: the status to report verbatim
 * @property {string} [detail]      extra text appended to the report row
 */

/** @type {ReadonlyArray<GateSpec>} */
export const GATES = Object.freeze([
  {
    id: "fullSuite",
    label: "Full test suite",
    section: "§20",
    evidence: "suite",
  },
  {
    id: "fixtureIntegrity",
    label: "Fixture raw SHA-256 integrity",
    section: "§19 A",
    tests: [
      "§19 A — raw fixture bytes hash to the frozen SHA-256",
    ],
  },
  {
    id: "fixtureRoundTrip",
    label: "Fixture-envelope canonical round trip",
    section: "§19 B",
    tests: [
      "§19 B — canonical fixture-envelope round trip is byte-identical",
    ],
  },
  {
    id: "deterministicHydration",
    label: "Deterministic hydration",
    section: "§19 C",
    tests: [
      "§19 C — hydration copies biological counters and excludes fixture metadata",
    ],
  },
  {
    id: "pairedWorlds",
    label: "Paired-world construction",
    section: "§19 D",
    tests: [
      "§19 D — construction is ONE hydration cloned into four worlds",
      "§19 D — the four worlds differ only in the twelve specified toe_webbing values",
    ],
  },
  {
    id: "exactProbability",
    label: "Exact probability gate",
    section: "§19.3",
    tests: [
      "§9 — toe_webbing is adverse in canopy and beneficial at the shoreline",
    ],
  },
  {
    id: "matchedTrajectory",
    label: "Matched trajectory gate, seeds 1..200",
    section: "§19.4",
    tests: [
      "§19.4 — EXACT matched trajectory gate: seeds 1..200, floor 130/200",
    ],
  },
  {
    id: "meaningfulTraits",
    label: "Meaningful-trait contextual gate",
    section: "§9 / §20.5",
    tests: [
      "§9/§20.5 — every meaningful trait has a positive context and a different adverse-or-inactive context",
    ],
  },
  {
    id: "birthImmutability",
    label: "Birth immutability",
    section: "§20.1",
    tests: [
      "§20.1 — fixture-world individuals never change genome or allocation after birth",
      "§20.1 — random-world individuals never change genome or allocation after birth",
    ],
  },
  {
    id: "observerInvariance",
    label: "Observer-state invariance",
    section: "§20.2",
    tests: [
      "§20.2/§19 — canonical biological bytes match after every generation across all observer strategies",
    ],
  },
  {
    id: "noObserverDeps",
    label: "No observer dependencies in biology",
    section: "§20.3",
    tests: [
      "§20.3 — biological modules never import observer or debug modules",
    ],
  },
  {
    id: "neutralTraits",
    label: "Neutral-trait integrity",
    section: "§20.4",
    tests: [
      "§20.4 — neutral traits do not affect mating weights",
    ],
  },
  {
    id: "mutationIndependence",
    label: "Full-path body-mutation independence",
    section: "§20.6",
    tests: [
      "§20.6 — identical parental genomes and RNG state give byte-identical body results under different allocations",
    ],
  },
  {
    id: "mutationProvenance",
    label: "Mutation provenance and counter ownership",
    section: "§20.7",
    tests: [
      "§20.7 — a failed opportunity increments neither counter",
    ],
  },
  {
    id: "allocationOpportunity",
    label: "Allocation-mutation opportunity contract",
    section: "§20.8",
    tests: [
      "§20.8.1 — failed occurrence: uOccurrence == probability fails, exactly one draw, nothing changes",
    ],
  },
  {
    id: "spatialIntegrity",
    label: "Spatial integrity and adjacency",
    section: "§20.9",
    tests: [
      "§6 — adjacency graph has no canopy-to-shoreline edge",
    ],
  },
  {
    id: "lifecycle",
    label: "Lifecycle and mating contract",
    section: "§20.10",
    tests: [
      "§20.10/§11 — one transition from generation 0 produces the exact required lifecycle",
    ],
  },
  {
    id: "genealogyIntegrity",
    label: "Genealogy integrity + forced 360-boundary",
    section: "§20.11",
    tests: [
      "§20.11 — a second prune produces byte-identical state",
    ],
  },
  {
    id: "genealogyBounded",
    label: "Genealogy boundary records bounded",
    section: "§15",
    tests: [
      "§15 — canonical state size stabilizes once the window is full",
    ],
  },
  {
    id: "survivalComposition",
    label: "Exact survival composition",
    section: "§20.12",
    tests: [
      "§20.12 — age multiplication occurs after allocation weighting",
    ],
  },
  {
    id: "rngIntegrity",
    label: "RNG integrity",
    section: "§20.13",
    tests: [
      "§20.13 — UI actions do not change simRngState",
    ],
  },
  {
    id: "populationGuardrails",
    label: "Population guardrails, 500 seeds",
    section: "§21.4",
    tests: [
      "the generated limitation table agrees with the guardrail medians",
    ],
  },
  {
    id: "traversal",
    label: "§21.6 adjacency traversal, isolated edge-only worlds",
    section: "§21.6",
    tests: [
      "§21.6 — the authoritative edge-only evidence exists and is genuinely isolated",
    ],
    detail: "no contract threshold applies; the measurement is reported, not scored",
  },
  {
    id: "desktopMeasurement",
    label: "Desktop Canvas measurement, reproducible",
    section: "§22",
    tests: [
      "§22 — one clean command regenerates the desktop evidence",
      "§22 — the browser dependency is declared AND pinned by a lockfile",
      "§22 — the committed evidence agrees with an independent Node run of the same world",
    ],
    detail: "§22 states no desktop pass law; the numeric pass law belongs to the iPad gate",
  },
  {
    id: "desktopCanvasMemory",
    label: "Desktop **Canvas** memory growth across the 180-generation run",
    section: "§22",
    evidence: "external",
    // REVISION-6 REPAIR (M-2 / R6-J): the status is READ from this named input,
    // not written here. Revision 5 declared `fixedStatus` and the derivation
    // returned it without opening any file, while the report said every gate row
    // was derived.
    evidenceSource: "audit/desktop-measurements.json",
    evidencePointer: "desktopCanvasMemory.status",
    determinedBy: "measurement tooling; no supported browser API exposes it on the measured build",
    detail:
      "the Node simulation heap is NOT a substitute and is reported separately as " +
      "`NODE_SIMULATION_HEAP`",
  },
  {
    id: "modelIdentity",
    label: "Canonical model identity binds state progression",
    section: "§18 / §21.7",
    tests: [
      "§18 — a state missing modelIdentityHash is rejected, not advanced",
      "§18 — a malformed or unknown model identity is rejected",
      "§18 — same version, different model is rejected with state untouched",
    ],
  },
  {
    id: "modelHashProvenance",
    label: "One authoritative model hash across all evidence",
    section: "§9 / §18",
    tests: [
      "§9/§18 — every evidence file publishes the same authoritative modelDefinitionHash",
      "§9/§18 — no tool serializes or hashes the model independently",
    ],
  },
  {
    id: "legibilitySelfContained",
    label: "Legibility mode is self-contained",
    section: "§22",
    tests: [
      "§22 — load fixture, reset random, enter legibility: the fixture is active",
    ],
  },
  {
    id: "worldLoadRaceSafety",
    label: "World loads are transactional against concurrent requests",
    section: "§22",
    tests: [
      "§22 — an older fixture load cannot overwrite a newer legibility world",
      "§22 — a stale fixture response cannot replace a newer random world",
      "§22 — the newest requested fixture variant wins regardless of resolution order",
      "§22 — a failed or rejected stale request commits nothing",
    ],
  },
  {
    id: "observerTransaction",
    label: "Generation advancement atomic against observer failure",
    section: "§4 / §16",
    tests: [
      "§4/§16 — an observer exception at ANY birth leaves canonical biology exactly as the clean generation",
      "§4/§16 — an exception from afterGeneration is also isolated",
    ],
  },
  {
    id: "generationResultImmutable",
    label: "Generation result is deeply immutable",
    section: "§4",
    tests: ["§4 — observerErrors and every error record are deeply frozen"],
  },
  {
    id: "focalLineage",
    label: "Focal lineage resolved, never reseeded, never falsely terminated",
    section: "§16",
    tests: [
      "§16 — a maintained focal channel matches an independent reference at every generation",
      "§16 — an unresolvable ancestry reports FOCAL_ANCESTRY_UNRESOLVABLE, not extinction",
    ],
  },
  {
    id: "referencesUnchanged",
    label: "Quarantined Python references unchanged",
    section: "§27",
    tests: [
      "§27 — observer-invariance and reference-file claims match their evidence",
    ],
  },
  {
    id: "reportIntegrity",
    label: "Report agrees with the raw evidence",
    section: "§26 / §27",
    tests: [
      "§26 — the committed report is exactly what the generator produces",
      "§20 — the report's suite counts equal the raw TAP summary",
      "§27 — the manifest's path inventory is current",
      "§27 — every published command is documented in the manifest's clean-run section",
    ],
  },
  {
    id: "testTreeIntegrity",
    label: "Tests never mutate the production source tree",
    section: "§20",
    tests: [
      "§20 — the self-audit scanner runs against an isolated tree, never src/",
      "§20 — the production source tree is byte-identical before and after the scanner tests",
    ],
  },
  {
    id: "reportDeterminism",
    // Revision-6 (M-3 / R6-I): the label named the DECLARED range while the
    // evidence covered three majors of it. It now names what was executed, and
    // `audit/runtime-matrix.json` lists those majors.
    label: "Report bytes are identical across every EXECUTED Node major",
    section: "§26",
    tests: [
      "§26 — the report renders identically on every EXECUTED runtime",
      "§26 — the GENERATOR exits nonzero when coverage is insufficient",
    ],
  },
  {
    id: "ipadGate",
    label: "**Physical iPad acceptance**",
    section: "§22",
    evidence: "external",
    evidenceSource: "audit/external-gate-status.json",
    evidencePointer: "gates.ipadGate.status",
    determinedBy: "a human operating a physical device; no automated run can supply it",
    detail: "no measurement supplied; not performed",
  },
  {
    id: "stageAOrder",
    label: "**§24 Stage A pre-code planning order**",
    section: "§24",
    evidence: "external",
    evidenceSource: "audit/external-gate-status.json",
    evidencePointer: "gates.stageAOrder.status",
    determinedBy: "the principal; a process decision no implementation can make for itself",
    detail: "unrepairable retrospectively; DECISIONS.md D-000 and D-024",
  },
]);

/**
 * Read the externally determined gate statuses from their named inputs
 * (revision-6 repair, M-2 / R6-J).
 *
 * An external gate is one no test can decide: a human device measurement, a
 * principal's process decision, a measurement channel the platform does not expose.
 * Revision 5 hardcoded those three statuses in this file, so "externally
 * determined" meant "written here" — the report could not have changed them even
 * if the external evidence had.
 *
 * They are now read. A missing or unreadable input is reported as `UNVERIFIED`
 * with the reason; it never defaults to anything favourable.
 *
 * @param {(rel:string)=>string} readText reads a repo-relative file
 * @returns {Record<string, {status:string, source:string, note:string|null}>}
 */
export function readExternalStatuses(readText) {
  /** @type {Record<string, {status:string, source:string, note:string|null}>} */
  const out = {};
  const cache = new Map();
  const load = (rel) => {
    if (!cache.has(rel)) {
      try {
        cache.set(rel, JSON.parse(readText(rel)));
      } catch (err) {
        cache.set(rel, { __error: String(err && err.message ? err.message : err) });
      }
    }
    return cache.get(rel);
  };
  const dig = (obj, pointer) =>
    pointer.split(".").reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);

  for (const g of GATES) {
    if (g.evidence !== "external") continue;
    const doc = load(g.evidenceSource);
    if (doc && doc.__error) {
      out[g.id] = { status: "UNVERIFIED", source: g.evidenceSource, note: `unreadable: ${doc.__error}` };
      continue;
    }
    const value = dig(doc, g.evidencePointer);
    const base = g.evidencePointer.replace(/\.status$/, "");
    out[g.id] = typeof value === "string" && value.length > 0
      ? {
        status: value,
        source: `${g.evidenceSource} → ${g.evidencePointer}`,
        note: dig(doc, `${base}.note`) ?? null,
        determinedBy: dig(doc, `${base}.determinedBy`) ?? g.determinedBy ?? null,
        priority: dig(doc, `${base}.priority`) ?? 99,
        milestoneStatusWhenUnsatisfied: dig(doc, `${base}.milestoneStatusWhenUnsatisfied`) ?? null,
      }
      : { status: "UNVERIFIED", source: g.evidenceSource, note: `no value at ${g.evidencePointer}`, priority: 99, milestoneStatusWhenUnsatisfied: null };
  }

  // Gates declared ONLY in the external-status file (no registry row of their own)
  // still bind the milestone. `independentClosureAudit` is one: it is the standing
  // rule that no in-house green suite self-certifies a pass.
  for (const rel of new Set(GATES.filter((g) => g.evidence === "external").map((g) => g.evidenceSource))) {
    const doc = load(rel);
    if (!doc || doc.__error || typeof doc.gates !== "object") continue;
    for (const [id, rec] of Object.entries(doc.gates)) {
      if (out[id] !== undefined) continue;
      out[id] = {
        status: typeof rec.status === "string" ? rec.status : "UNVERIFIED",
        source: `${rel} → gates.${id}.status`,
        note: rec.note ?? null,
        determinedBy: rec.determinedBy ?? null,
        priority: rec.priority ?? 99,
        milestoneStatusWhenUnsatisfied: rec.milestoneStatusWhenUnsatisfied ?? null,
      };
    }
  }
  return out;
}

/** Statuses that count as an external gate being satisfied. Nothing else does. */
const EXTERNAL_SATISFIED = Object.freeze(["PASS", "SATISFIED", "MEASURED"]);

/**
 * Derive the milestone status from machine-readable evidence (revision-6 repair,
 * M-2 / R6-J).
 *
 * Revision 5 kept the overall status and the completion flag as literals in
 * `src/config/milestoneStatus.js`, so no execution result could move them: a
 * controlled failing run changed gate rows but the milestone verdict still read
 * whatever a human had typed. It is computed here from the derived gate statuses
 * plus the external inputs, and the reasons are returned so the report can print
 * WHY rather than assert.
 *
 * @param {{summary:Object, gates:Array<Object>, unattributedFailures:string[]}} derived
 * @param {Record<string, {status:string}>} external
 * @returns {{status:string, mayDeclareCompletion:boolean, blockers:string[], automatedGatesPass:boolean}}
 */
export function deriveMilestoneStatus(derived, external) {
  const blockers = [];
  if (derived.summary.suiteHasFailures) blockers.push("the build-blocking suite reported failures");
  const failed = derived.gates.filter((g) => g.evidence !== "external" && g.status === "FAIL");
  if (failed.length > 0) blockers.push(`${failed.length} automated gate(s) FAIL: ${failed.map((g) => g.id).join(", ")}`);
  const unverified = derived.gates.filter((g) => g.evidence !== "external" && g.status === "UNVERIFIED");
  if (unverified.length > 0) {
    blockers.push(`${unverified.length} automated gate(s) UNVERIFIED: ${unverified.map((g) => g.id).join(", ")}`);
  }
  if (derived.unattributedFailures.length > 0) {
    blockers.push(`${derived.unattributedFailures.length} failing test(s) map to no declared gate`);
  }
  const automatedGatesPass = blockers.length === 0;

  const externalBlockers = [];
  for (const [id, rec] of Object.entries(external)) {
    if (!EXTERNAL_SATISFIED.includes(rec.status)) externalBlockers.push(`${id}: ${rec.status}`);
  }

  const all = [...blockers, ...externalBlockers];

  // The status STRING is chosen by the evidence, never written here. When the
  // automated gates are not all passing, the repair-required status applies; when
  // they are, the unsatisfied external gate with the lowest priority number names
  // the status, from `audit/external-gate-status.json`.
  let status;
  if (!automatedGatesPass) {
    status = REPAIRS_REQUIRED_STATUS;
  } else if (externalBlockers.length > 0) {
    const unsatisfied = Object.entries(external)
      .filter(([, rec]) => !EXTERNAL_SATISFIED.includes(rec.status))
      .map(([id, rec]) => ({ id, ...rec }))
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    status = unsatisfied[0]?.milestoneStatusWhenUnsatisfied ?? REPAIRS_REQUIRED_STATUS;
  } else {
    status = "M1_ALL_GATES_SATISFIED";
  }
  return {
    status,
    mayDeclareCompletion: all.length === 0,
    blockers: all,
    automatedGatesPass,
    externalBlockers,
  };
}

/**
 * The status that applies whenever the automated gates are not all passing. Kept
 * as a named constant so a reader can see there is exactly one, and so
 * `test/status-consistency.test.js` can assert the documents match what the
 * evidence derives rather than what a source file asserts.
 */
export const REPAIRS_REQUIRED_STATUS = "M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED";

/**
 * Derive every gate's status from a parsed run, plus the externally determined
 * statuses read from their named inputs (`readExternalStatuses`).
 *
 * @param {{tests:number|null, pass:number|null, fail:number|null, perTest:Map<string, boolean>}} run
 * @param {Record<string, {status:string, source:string, note:string|null}>} [externalStatuses]
 * @returns {{gates:Array<Object>, unattributedFailures:string[], summary:Object}}
 */
export function deriveGateStatuses(run, externalStatuses = {}) {
  const perTest = run.perTest ?? new Map();
  const failedNames = [...perTest.entries()].filter(([, ok]) => !ok).map(([name]) => name);

  // Which failures can be attributed to a declared gate?
  const mapped = new Set();
  for (const g of GATES) {
    for (const name of g.tests ?? []) mapped.add(name);
  }
  const unattributedFailures = failedNames.filter((n) => !mapped.has(n));
  const suiteHasFailures = (run.fail ?? 0) > 0;

  const gates = GATES.map((g) => {
    if (g.evidence === "external") {
      // Read from the named input (revision-6, R6-J). With no external statuses
      // supplied the gate is UNVERIFIED — never a favourable default.
      const rec = externalStatuses[g.id];
      return {
        id: g.id,
        label: g.label,
        section: g.section,
        status: rec ? rec.status : "UNVERIFIED",
        evidence: "external",
        machineVerified: false,
        evidenceSource: rec ? rec.source : (g.evidenceSource ?? null),
        determinedBy: g.determinedBy ?? null,
        detail: g.detail ?? null,
        externalNote: rec ? rec.note : "no external status input was supplied",
        mappedTests: [],
      };
    }
    if (g.evidence === "suite") {
      const status = run.fail === null || run.tests === null ? "UNVERIFIED" : run.fail === 0 ? "PASS" : "FAIL";
      return {
        id: g.id, label: g.label, section: g.section, status, evidence: "suite",
        detail: run.tests === null ? "the raw TAP summary could not be parsed"
          : `${run.pass}/${run.tests}, ${run.fail} failing`,
        mappedTests: [],
      };
    }
    const names = g.tests ?? [];
    const observed = names.filter((n) => perTest.has(n));
    const failed = observed.filter((n) => perTest.get(n) === false);
    let status;
    if (failed.length > 0) {
      status = "FAIL";
    } else if (observed.length !== names.length) {
      // A gate whose evidencing test did not run is not evidenced by this run.
      status = "UNVERIFIED";
    } else if (unattributedFailures.length > 0) {
      // The suite failed somewhere that cannot be attributed. Do not keep a PASS
      // that this run cannot support.
      status = "UNVERIFIED";
    } else {
      status = "PASS";
    }
    return {
      id: g.id, label: g.label, section: g.section, status, evidence: "tests",
      detail: g.detail ?? null,
      mappedTests: names,
      observedTests: observed,
      failedTests: failed,
      missingTests: names.filter((n) => !perTest.has(n)),
    };
  });

  const derived = gates.filter((g) => g.evidence !== "external");
  const external = gates.filter((g) => g.evidence === "external");
  return {
    gates,
    unattributedFailures,
    summary: {
      total: gates.length,
      // REVISION-6 REPAIR (MM-2 / R6-K). The categories now PARTITION the gates:
      // an externally determined gate is counted once, as external, and never
      // again under its status. Revision 5 counted it twice, so the report printed
      //
      //   35 PASS · 0 FAIL · 1 UNVERIFIED · 3 externally determined (of 38)
      //
      // whose categories sum to 39 against a denominator of 38 — the Canvas-memory
      // gate appeared as both UNVERIFIED and external.
      pass: derived.filter((g) => g.status === "PASS").length,
      fail: derived.filter((g) => g.status === "FAIL").length,
      unverified: derived.filter((g) => g.status === "UNVERIFIED").length,
      external: external.length,
      externalByStatus: Object.freeze(external.map((g) => ({ id: g.id, status: g.status }))),
      suiteHasFailures,
      /**
       * The §28 completion claim. `met` requires a fully green suite AND every
       * derived gate passing. Revision 4 emitted `met` unconditionally.
       */
      everyAutomatedResultReproducible:
        run.fail === 0 && derived.every((g) => g.status === "PASS") ? "met" : "NOT met",
    },
  };
}
