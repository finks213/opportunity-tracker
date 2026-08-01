// @ts-check
/**
 * Bind the delivered bundle to the source revision that produced it
 * (revision-6 repair, L-1 / R6-L).
 *
 * The revision-5 structural audit's finding: the bundle supplied a complete archive
 * hash and file inventory but no resolved source commit, so an auditor could not
 * bind the ZIP to the claimed branch history without a separate repository lookup —
 * while the repair record repeatedly called its tests and results "committed".
 *
 * `.git` is not shipped (contract §27 excludes it), so the binding travels as
 * evidence instead: the resolved commit, the tree hash, the authoritative model
 * identity, and a hash and byte count for every generated report and raw evidence
 * file. Anything an auditor can recompute from the extracted bundle is recorded
 * here. The one value that cannot live inside the archive is the archive's own
 * SHA-256 — recording it anywhere inside would change it — so it is published with
 * the delivery message instead.
 *
 * Usage: node tools/writeProvenance.mjs
 * Writes audit/provenance.json
 */

import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { MILESTONE_STATUS } from "../src/config/milestoneStatus.js";

const MILESTONE_REVISION = MILESTONE_STATUS.revision;

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

/** SHA-256 and byte count of one repo-relative file. */
function fileRecord(rel) {
  const bytes = readFileSync(join(ROOT, rel));
  return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

/** Every file under a directory, repo-relative, sorted. */
function filesUnder(rel) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(join(ROOT, d)).sort()) {
      const child = `${d}/${name}`;
      if (statSync(join(ROOT, child)).isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk(rel);
  return out;
}

/** Resolve git facts, or record plainly that they were unavailable. */
function gitFacts() {
  const run = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  try {
    const commit = run(["rev-parse", "HEAD"]);
    const dirty = run(["status", "--porcelain"]);
    return {
      resolved: true,
      commit,
      shortCommit: commit.slice(0, 12),
      branch: run(["rev-parse", "--abbrev-ref", "HEAD"]),
      treeHash: run(["rev-parse", "HEAD^{tree}"]),
      committedAt: run(["log", "-1", "--format=%cI"]),
      workingTreeClean: dirty === "",
      uncommittedPaths: dirty === "" ? [] : dirty.split("\n").map((l) => l.trim()),
    };
  } catch (err) {
    return { resolved: false, reason: String(err && err.message ? err.message : err) };
  }
}

/** Paths excluded from the shipped bundle, and therefore from the binding. */
const EXCLUDED = [/^node_modules\//, /^\.git\//, /\.partial$/, /^audit\/provenance\.json$/,
  /\.DS_Store$/, /^\.vscode\//, /^\.idea\//, /~$/, /\.swp$/];

/** Every file that ships, repo-relative and sorted. */
function shippedFiles() {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(join(ROOT, d === "" ? "." : d)).sort()) {
      const rel = d === "" ? name : `${d}/${name}`;
      if (EXCLUDED.some((re) => re.test(rel))) continue;
      if (statSync(join(ROOT, rel)).isDirectory()) { walk(rel); continue; }
      out.push(rel);
    }
  };
  walk("");
  return out;
}

export function buildProvenance() {
  const git = gitFacts();

  // REVISION-7 REPAIR (Finding 3). Revision 6 hashed only named audit evidence, a
  // few generated documents and the fixture — 20 files. `src/`, `test/`, `tools/`,
  // the browser files and the package files were never bound, so an auditor could
  // change `src/core/math.js` in an extraction and still get `PROVENANCE OK`,
  // exit 0. EVERY shipped file is recorded now.
  /** @type {Record<string, {sha256:string, bytes:number}>} */
  const files = {};
  for (const rel of shippedFiles()) files[rel] = fileRecord(rel);

  const gateSummary = JSON.parse(readFileSync(join(ROOT, "audit", "gate-summary.json"), "utf8"));
  const charEvidence = JSON.parse(readFileSync(join(ROOT, "audit", "characterization-results.json"), "utf8"));
  const tap = readFileSync(join(ROOT, "audit", "test-results.txt"), "utf8");

  // A single digest over the whole shipped tree, so one comparison answers
  // "is this the tree that was recorded".
  const treeDigest = createHash("sha256");
  for (const rel of Object.keys(files).sort()) {
    treeDigest.update(rel);
    treeDigest.update("\0");
    treeDigest.update(files[rel].sha256);
    treeDigest.update("\n");
  }

  return {
    schema: "lineage-m1-provenance-2",
    contractSection: "23 / 27 (delivery and audit evidence)",
    purpose:
      "Bind this bundle to the source revision that produced it, without shipping .git. EVERY " +
      "shipped file is hashed — production source, tests, tools, evidence, reports and package " +
      "files — and `tools/verifyProvenance.mjs` recomputes all of them from an extraction.",
    source: git,
    model: {
      configVersion: charEvidence.configVersion,
      modelDefinitionHash: charEvidence.modelDefinitionHash,
      note: "the authoritative complete-model identity; every evidence file must carry this value",
    },
    fixture: { path: "fixtures/defining_fixture_v1.json", ...fileRecord("fixtures/defining_fixture_v1.json") },
    testResults: {
      path: "audit/test-results.txt",
      ...fileRecord("audit/test-results.txt"),
      tests: gateSummary.suite.tests,
      pass: gateSummary.suite.pass,
      fail: gateSummary.suite.fail,
      boundBy: "bytes",
      note:
        "Bound by its exact SHA-256, like every other shipped file (revision-7, Finding 3). " +
        "Revision 6 exempted this file and checked only its three summary counts, so a " +
        "non-summary line could be rewritten without detection. The suite that republishes it " +
        "necessarily makes the working tree differ from this record until `npm run " +
        "audit:provenance` is re-run; that is a regeneration step, not a verification exemption, " +
        "and the DELIVERED archive is built after it.",
    },
    milestone: gateSummary.milestone,
    fileCount: Object.keys(files).length,
    shippedTreeDigest: treeDigest.digest("hex"),
    files,
    archive: {
      name: `LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV${MILESTONE_REVISION}.zip`,
      sha256: null,
      note:
        "An archive cannot contain its own hash, so no file inside it can record one: writing the " +
        "value here would require rebuilding the archive, which changes the value. The SHA-256 is " +
        "published with the delivery message. Verify with `sha256sum` against that value, then " +
        "verify every file below against this record from the extraction.",
    },
    archiveRelationToCommit: {
      // REVISION-7 DELIVERY CORRECTION. The revision-7 bundle recorded commit
      // a942a5b… here while the delivery message named 13d1e75…, because this file
      // is written after the commit it describes and was then committed again. The
      // relationship is now stated exactly, and `test/provenance-binding.test.js`
      // fails if this record is written against a tree that is dirty for any reason
      // other than this file itself.
      describesCommit: git.resolved ? git.commit : null,
      treeHash: git.resolved ? git.treeHash : null,
      identicalExcept: ["audit/provenance.json"],
      why:
        "This record hashes the tree of the commit named above. It cannot contain its own hash, " +
        "so it is written after that commit and is the only file in the archive whose bytes are not " +
        "part of it. Every other shipped file is byte-identical to that commit. The delivery message " +
        "names this same commit.",
      howToCheck:
        "git -C <clone> checkout <describesCommit> && diff -r --exclude=.git --exclude=node_modules " +
        "<clone>/lineage-m1 <extraction>/lineage-m1   # expect exactly one difference: audit/provenance.json",
    },
    commitBinding: {
      claim:
        "The commit and tree hash below identify the revision this bundle was built from. The " +
        "BYTE binding above is self-contained and complete; verifying that the recorded commit's " +
        "git tree equals this extraction additionally requires a clone, because .git is not " +
        "shipped (§27).",
      notClaimed:
        "That the existence of the commit object proves the extracted files equal its tree. " +
        "Revision 6 suggested `git cat-file -t <commit>`, which proves only that the object " +
        "exists. Use the command below instead, from a clone.",
      verifyFromAClone:
        "git -C <clone> ls-tree -r <source.commit> --format='%(objectname) %(path)' | " +
        "sed 's|^\\([0-9a-f]*\\) lineage-m1/|\\1 |' | sort > /tmp/recorded.txt && " +
        "(cd <extraction>/lineage-m1 && git hash-object $(node -e \"…list files…\") ) # compare",
    },
    verification: [
      "sha256sum LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV*.zip   # compare with the published value",
      "unzip -q LINEAGE_M1_IMPLEMENTATION_AUDIT_BUNDLE_REV*.zip && cd lineage-m1",
      "node tools/verifyProvenance.mjs      # recomputes every shipped file's hash, strictly",
      "npm test                             # the suite, from the extraction, with no install",
    ],
  };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // REVISION-8 REPAIR (revision-7 structural audit, Finding 4). Revision 7 said the
  // writer "refuses to be written against a half-committed tree". It did not: it
  // recorded the dirty state and exited 0. Reproduced by modifying tracked
  // production source in a clone and running the shipped writer:
  //
  //   provenance.json: commit f49972a19093, 134 files hashed, working tree clean: false
  //   uncommittedPaths: ["M lineage-m1/src/core/math.js"]   exit=0
  //
  // A later suite would have caught it, but the generator itself was fail-open, so
  // an interrupted delivery could leave a confident-looking record of a tree no
  // commit describes. It refuses now, before writing anything.
  const preflight = gitFacts();
  const dirtyBeyondSelf = (preflight.uncommittedPaths ?? [])
    .map((line) => line.replace(/^\s*[A-Z?!]+\s+/, ""))
    .filter((path) => !/audit\/provenance\.json$/.test(path));
  const allowDirty = process.argv.includes("--allow-dirty");
  if (preflight.resolved && dirtyBeyondSelf.length > 0 && !allowDirty) {
    console.error(
      "REFUSING to write audit/provenance.json: the working tree is dirty beyond the record itself.\n" +
      dirtyBeyondSelf.map((p) => `  ${p}`).join("\n") +
      "\n\nThis record binds the archive to a commit. Written now it would describe a tree no commit\n" +
      "describes. Commit the changes first, then re-run. `--allow-dirty` writes anyway and marks the\n" +
      "record provisional; it is for local inspection, never for a delivery."
    );
    process.exitCode = 1;
  } else {
  const record = buildProvenance();
  if (allowDirty && dirtyBeyondSelf.length > 0) {
    record.provisional = {
      reason: "written with --allow-dirty against a tree that is dirty beyond the record itself",
      dirtyPaths: dirtyBeyondSelf,
      note: "NOT a delivery record: it describes no single commit.",
    };
  }
  writeFileSync(join(ROOT, "audit", "provenance.json"), JSON.stringify(record, null, 2));
  const n = record.fileCount;
  console.error(
    `provenance.json: commit ${record.source.resolved ? record.source.shortCommit : "UNRESOLVED"}, ` +
    `${n} files hashed, working tree clean: ${record.source.workingTreeClean}` +
    (record.provisional ? "  [PROVISIONAL — not a delivery record]" : "")
  );
  }
}
