// @ts-check
/**
 * Device-test server containment (revision-3 repair).
 *
 * The iPad workflow (§22) binds this server on the local network, so path
 * containment is a security boundary. Revision 2 used `startsWith(ROOT)`, a
 * string-prefix test that admitted any sibling path beginning with the root
 * string: `/..%2flineage-m1-secret.txt` returned HTTP 200 with out-of-root
 * content. Every case below fails on revision 2.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { isInsideRoot, resolveSafePath, createStaticServer } from "../tools/serve.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(join(HERE, ".."));

// A sandbox whose root name is a strict prefix of a sibling's name — exactly
// the shape that defeated the old prefix check.
const SANDBOX = join(HERE, "__server_fixture__");
const SERVED_ROOT = join(SANDBOX, "served");
const SIBLING_SECRET = join(SANDBOX, "served-secret.txt");
const PARENT_SECRET = join(SANDBOX, "outside.txt");
const SECRET_BODY = "OUT-OF-ROOT-CANARY";

function setup() {
  mkdirSync(join(SERVED_ROOT, "sub"), { recursive: true });
  writeFileSync(join(SERVED_ROOT, "index.html"), "<h1>in root</h1>");
  writeFileSync(join(SERVED_ROOT, "sub", "ok.txt"), "nested ok");
  writeFileSync(SIBLING_SECRET, SECRET_BODY);
  writeFileSync(PARENT_SECRET, SECRET_BODY);
}
function teardown() {
  if (existsSync(SANDBOX)) rmSync(SANDBOX, { recursive: true, force: true });
}

/** Start the server on an ephemeral port and return {port, close}. */
function startServer(root) {
  const server = createStaticServer(root);
  return new Promise((res) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = /** @type {any} */ (server.address());
      res({
        port,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

/** Raw request that does NOT normalize the path client-side. */
function rawGet(port, rawPath) {
  return new Promise((res, rej) => {
    import("node:net").then(({ connect }) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write(`GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
      });
      let data = "";
      socket.on("data", (c) => { data += c.toString("utf8"); });
      socket.on("end", () => {
        const status = Number((data.match(/^HTTP\/1\.1 (\d{3})/) ?? [])[1]);
        const body = data.slice(data.indexOf("\r\n\r\n") + 4);
        res({ status, body });
      });
      socket.on("error", rej);
    });
  });
}

test("isInsideRoot rejects a sibling whose name shares the root prefix", () => {
  const root = "/tmp/lineage-m1";
  assert.equal(isInsideRoot(root, "/tmp/lineage-m1"), true);
  assert.equal(isInsideRoot(root, "/tmp/lineage-m1/index.html"), true);
  assert.equal(isInsideRoot(root, "/tmp/lineage-m1/a/b/c.txt"), true);
  // The exact revision-2 defect: prefix test says yes, boundary test says no.
  assert.equal("/tmp/lineage-m1-secret.txt".startsWith(root), true, "prefix test would admit this");
  assert.equal(isInsideRoot(root, "/tmp/lineage-m1-secret.txt"), false, "boundary test must reject it");
  assert.equal(isInsideRoot(root, "/tmp"), false);
  assert.equal(isInsideRoot(root, "/tmp/other/file"), false);
  assert.equal(isInsideRoot(root, "/etc/passwd"), false);
});

test("resolveSafePath rejects traversal, encoded traversal, and malformed input", () => {
  const root = PROJECT_ROOT;
  // Valid.
  assert.notEqual(resolveSafePath("/index.html", root), null);
  assert.notEqual(resolveSafePath("/", root), null);
  assert.notEqual(resolveSafePath("/src/main.js", root), null);
  assert.notEqual(resolveSafePath("/index.html?cachebust=1", root), null);

  // The security invariant for ANY hostile input is: either refused (null), or
  // resolved strictly inside the root. Never a path outside the root.
  //
  // Some shapes are normalized by the URL parser before resolveSafePath sees
  // them (`/../x` becomes `/x`), which is contained and simply nonexistent.
  // Asserting the invariant rather than a fixed null keeps the test honest about
  // where each defence actually applies, without weakening it.
  const hostile = [
    "/../lineage-m1-secret.txt",
    "/..%2flineage-m1-secret.txt",
    "/..%2Flineage-m1-secret.txt",
    "/%2e%2e%2flineage-m1-secret.txt",
    "/%2E%2E/lineage-m1-secret.txt",
    "/a/../../outside.txt",
    "/../../etc/passwd",
    "/..",
    "/../",
    "/sub/../../..",
    "/%252e%252e/x",
    "/....//lineage-m1-secret.txt",
  ];
  for (const bad of hostile) {
    const out = resolveSafePath(bad, root);
    if (out !== null) {
      assert.ok(isInsideRoot(root, out), `${bad} resolved OUTSIDE the root to ${out}`);
    }
  }

  // Shapes with an ENCODED SLASH carry a parent segment past URL normalization
  // and reach the containment check, so they must be refused outright. These are
  // exactly the shapes that defeated revision 2's prefix test.
  for (const bad of [
    "/..%2flineage-m1-secret.txt",
    "/..%2Flineage-m1-secret.txt",
    "/%2e%2e%2flineage-m1-secret.txt",
    "/%2E%2E%2Flineage-m1-secret.txt",
    "/sub/..%2f..%2foutside.txt",
  ]) {
    assert.equal(resolveSafePath(bad, root), null, `must refuse ${bad}`);
  }

  // Shapes whose slash is literal are normalized to a contained path by the URL
  // parser before this function sees them. Documented explicitly so a future
  // reader does not mistake "contained" for "unchecked": they resolve inside the
  // root and therefore cannot disclose anything outside it.
  for (const normalized of [
    "/../lineage-m1-secret.txt",
    "/%2E%2E/lineage-m1-secret.txt",
    "/../../etc/passwd",
  ]) {
    const out = resolveSafePath(normalized, root);
    assert.notEqual(out, null);
    assert.ok(isInsideRoot(root, out), `${normalized} must stay inside the root`);
  }

  // Malformed percent encoding and NUL / control bytes are always refused.
  for (const bad of ["/%", "/%zz", "/%2", "/a%00b", "/a\u0000b", "/a%01b"]) {
    assert.equal(resolveSafePath(bad, root), null, `must refuse ${bad}`);
  }

  // A literal backslash is rewritten to "/" by the WHATWG URL parser, so it is
  // normalized rather than refused. The explicit backslash guard in
  // resolveSafePath is defence-in-depth for non-URL callers. Either way it must
  // never escape the root.
  for (const b of ["/back\\slash", "/a\\..\\..\\outside.txt"]) {
    const out = resolveSafePath(b, root);
    if (out !== null) assert.ok(isInsideRoot(root, out), `${b} must stay inside the root`);
  }
});

test("server serves in-root files and refuses every out-of-root request", async (t) => {
  setup();
  t.after(teardown);
  const { port, close } = await startServer(SERVED_ROOT);
  t.after(close);

  // 1. valid in-root files succeed
  const root = await rawGet(port, "/index.html");
  assert.equal(root.status, 200);
  assert.match(root.body, /in root/);
  const nested = await rawGet(port, "/sub/ok.txt");
  assert.equal(nested.status, 200);
  assert.match(nested.body, /nested ok/);
  const implicitIndex = await rawGet(port, "/");
  assert.equal(implicitIndex.status, 200);

  // 2. the exact revision-2 sibling-prefix falsifier
  const siblingPrefix = await rawGet(port, "/..%2fserved-secret.txt");
  assert.notEqual(siblingPrefix.status, 200, "sibling-prefix traversal must not succeed");
  assert.ok(!siblingPrefix.body.includes(SECRET_BODY), "out-of-root content must never be returned");

  // 3. every other traversal shape
  for (const bad of [
    "/../served-secret.txt",
    "/../outside.txt",
    "/..%2foutside.txt",
    "/..%2Foutside.txt",
    "/%2e%2e%2foutside.txt",
    "/sub/../../outside.txt",
    "/sub/..%2f..%2foutside.txt",
    "/../../etc/passwd",
  ]) {
    const r = await rawGet(port, bad);
    assert.notEqual(r.status, 200, `${bad} must not return 200`);
    assert.ok(!r.body.includes(SECRET_BODY), `${bad} must not leak out-of-root content`);
  }

  // 4. malformed paths fail safely (no crash, no 200, no leak)
  for (const bad of ["/%", "/%zz", "/a%00b", "/back\\slash"]) {
    const r = await rawGet(port, bad);
    assert.ok(r.status === 403 || r.status === 404, `${bad} should be refused, got ${r.status}`);
    assert.ok(!r.body.includes(SECRET_BODY));
  }

  // 5. directories are not listed
  const dir = await rawGet(port, "/sub");
  assert.notEqual(dir.status, 200);

  // 6. non-read methods are refused
  const post = await new Promise((res, rej) => {
    import("node:net").then(({ connect }) => {
      const s = connect(port, "127.0.0.1", () => {
        s.write("POST /index.html HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
      });
      let d = "";
      s.on("data", (c) => { d += c.toString("utf8"); });
      s.on("end", () => res(Number((d.match(/^HTTP\/1\.1 (\d{3})/) ?? [])[1])));
      s.on("error", rej);
    });
  });
  assert.equal(post, 405);
});

test("the served root is the project directory, and the project itself is reachable", async (t) => {
  const { port, close } = await startServer(PROJECT_ROOT);
  t.after(close);
  for (const p of ["/index.html", "/styles.css", "/src/main.js", "/fixtures/defining_fixture_v1.json"]) {
    const r = await rawGet(port, p);
    assert.equal(r.status, 200, `${p} must be served for the iPad workflow`);
  }
});
