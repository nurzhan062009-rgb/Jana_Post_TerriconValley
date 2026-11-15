import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogSummary } from "./app/catalog.mjs";
import { enrichBatchWithOllama, getOllamaConfig, getOllamaStatus } from "./app/ollama.mjs";
import { parseBatch, parseAddress } from "./app/parser.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const WEB_ROOT = resolve(ROOT, "web");
const DATA_ROOT = resolve(process.env.DATA_DIR ?? resolve(ROOT, "data"));
const PORT = Number(process.env.PORT ?? 8080);
const OLLAMA_CONFIG = getOllamaConfig();
const MAX_BODY_BYTES = 15 * 1024 * 1024;
const MAX_RECORDS = 10_000;
const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".pbf": "application/x-protobuf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error(`Request exceeds ${MAX_BODY_BYTES} bytes`);
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.status = 400;
    throw error;
  }
}

function normalizeRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.records)) return payload.records;
  if (payload && typeof payload === "object" && typeof payload.raw_address === "string") return [payload];
  throw Object.assign(new Error("Send an array of records or an object with a records array"), { status: 400 });
}

async function serveStatic(request, response, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path" });
    return;
  }
  let file;
  if (decoded === "/" || decoded === "/index.html") {
    file = resolve(WEB_ROOT, "index.html");
  } else if (["/map", "/map.html", "/offline-map.html", "/unified-map.html"].includes(decoded)) {
    file = resolve(WEB_ROOT, "unified-map.html");
  } else if (decoded === "/workspace.html") {
    file = resolve(WEB_ROOT, "workspace.html");
  } else if (["/map.html", "/manifest.json", "/sw.js", "/README.md"].includes(decoded)) {
    file = resolve(ROOT, decoded.slice(1));
  } else if (/^\/vendor\/(?:[a-z0-9.-]+\.(?:js|css)|images\/[a-z0-9.-]+\.png)$/iu.test(decoded)) {
    file = resolve(ROOT, decoded.slice(1));
  } else if (/^\/fonts\/Noto Sans Regular\/(?:0-255|1024-1279)\.pbf$/u.test(decoded)) {
    file = resolve(ROOT, "fonts", decoded.slice(decoded.lastIndexOf("/") + 1));
  } else if (["/app.css", "/app.js"].includes(decoded)) {
    file = resolve(WEB_ROOT, decoded.slice(1));
  } else if (decoded === "/data/kazakhstan.pmtiles") {
    file = resolve(DATA_ROOT, "kazakhstan.pmtiles");
  } else {
    file = resolve(WEB_ROOT, decoded.slice(1));
    if (file !== WEB_ROOT && !file.startsWith(`${WEB_ROOT}${sep}`)) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
  }
  try {
    const fileStats = await stat(file);
    if (!fileStats.isFile() || fileStats.size === 0) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    if (decoded === "/data/kazakhstan.pmtiles") {
      const handle = await open(file, "r");
      try {
        const header = Buffer.alloc(8);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        if (bytesRead !== header.length || header.toString("ascii", 0, 7) !== "PMTiles" || header[7] !== 3) {
          sendJson(response, 404, { error: "The offline map archive is not a valid PMTiles v3 file" });
          return;
        }
      } finally {
        await handle.close();
      }
    }

    let start = 0;
    let end = fileStats.size - 1;
    let status = 200;
    const range = request.headers.range;
    if (decoded === "/data/kazakhstan.pmtiles" && range) {
      const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
      if (!match || (!match[1] && !match[2])) {
        response.writeHead(416, { "content-range": `bytes */${fileStats.size}` });
        response.end();
        return;
      }
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : end;
      } else {
        const suffixLength = Number(match[2]);
        start = Math.max(0, fileStats.size - suffixLength);
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= fileStats.size) {
        response.writeHead(416, { "content-range": `bytes */${fileStats.size}` });
        response.end();
        return;
      }
      end = Math.min(end, fileStats.size - 1);
      status = 206;
    }
    response.writeHead(status, {
      "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-length": end - start + 1,
      "x-content-type-options": "nosniff",
      "accept-ranges": decoded === "/data/kazakhstan.pmtiles" ? "bytes" : "none",
      ...(status === 206 ? { "content-range": `bytes ${start}-${end}/${fileStats.size}` } : {}),
      "cache-control": extname(file) === ".html" ? "no-cache" : "public, max-age=3600"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(file, { start, end }).pipe(response);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    throw error;
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/api/health") {
      const { reason, ...ollama } = await getOllamaStatus(OLLAMA_CONFIG);
      sendJson(response, 200, { status: "ok", parser: "jana-address", catalog: catalogSummary(), ollama });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/reference") {
      sendJson(response, 200, catalogSummary());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/parse") {
      const records = normalizeRecords(await readJson(request));
      if (records.length > MAX_RECORDS) {
        sendJson(response, 413, { error: `A batch may contain at most ${MAX_RECORDS} records` });
        return;
      }
      if (records.some(record => !record || typeof record !== "object" || typeof record.raw_address !== "string")) {
        sendJson(response, 400, { error: "Every record must be an object containing a string raw_address" });
        return;
      }
      const parsed = parseBatch(records);
      const result = await enrichBatchWithOllama(records, parsed, OLLAMA_CONFIG);
      sendJson(response, 200, { records: result.records, count: result.records.length, ai: result.ai });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/parse-one") {
      const record = await readJson(request);
      if (!record || typeof record.raw_address !== "string") {
        sendJson(response, 400, { error: "Send an object containing a string raw_address" });
        return;
      }
      const result = await enrichBatchWithOllama([record], [parseAddress(record)], OLLAMA_CONFIG);
      sendJson(response, 200, result.records[0], { "x-ollama-status": result.ai.status });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    console.error("Request failed:", error);
    if (!response.headersSent) {
      sendJson(response, error.status ?? 500, { error: error.status ? error.message : "Internal server error" });
    } else {
      response.destroy(error);
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Jana Address listening on http://0.0.0.0:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(error => {
    if (error) {
      console.error("Server shutdown failed:", error);
      process.exitCode = 1;
    }
  }));
}
