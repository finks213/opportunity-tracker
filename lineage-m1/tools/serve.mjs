// @ts-check
/**
 * Minimal local static server for the Canvas probe (contract §3).
 * No dependencies. Serves the project directory over http://localhost:8080.
 *
 * Usage: node tools/serve.mjs [port]
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8080;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";
    // Contain every request inside the project root.
    const resolved = normalize(join(ROOT, path));
    if (!resolved.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const info = await stat(resolved);
    if (info.isDirectory()) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const body = await readFile(resolved);
    res.writeHead(200, {
      "content-type": TYPES[extname(resolved)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`LINEAGE M1 probe: http://localhost:${PORT}/`);
});
