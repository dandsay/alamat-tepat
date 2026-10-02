/*
 * Microservice pembaku alamat — bungkus tipis di atas engine AlamatTepat.
 * Tanpa dependensi (hanya node:http). Logika mesin TIDAK diduplikasi di sini.
 *
 *   node service/server.mjs [--port 3000]
 *
 *   GET  /health                    -> { ok, engine, sha }
 *   POST /v1/standardize            -> { input, baku, parts, confidence }
 *   POST /v1/standardize/batch      -> { results: [{ input, baku, label }], count, ms }
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const Normalizer = require(join(ROOT, "assets/js/normalizer.js"));
const Confidence = require(join(ROOT, "assets/js/confidence.js"));
const generic = JSON.parse(readFileSync(join(ROOT, "assets/js/profiles/generic.json"), "utf8"));
const surabaya = JSON.parse(readFileSync(join(ROOT, "assets/js/profiles/surabaya.json"), "utf8"));
const SHA = readFileSync(join(ROOT, "ALGORITHM.sha256"), "utf8").trim().split(/\s+/)[0];

const ENGINES = {
  base: Normalizer.createNormalizer(null),
  generic: Normalizer.createNormalizer([generic]),
  surabaya: Normalizer.createNormalizer([generic, surabaya]),
};

const MAX_BODY_SINGLE = 256 * 1024;
const MAX_BODY_BATCH = 8 * 1024 * 1024;
const MAX_BATCH = 10000;

const args = process.argv.slice(2);
let port = 3000;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--port" || args[i] === "-p") && args[i + 1]) port = Number(args[++i]) || port;
  else if (/^\d+$/.test(args[i])) port = Number(args[i]);
}
if (process.env.PORT) port = Number(process.env.PORT) || port;

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > max) { reject(new Error("body terlalu besar")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function pickEngine(profile) {
  return ENGINES[profile] || ENGINES.surabaya;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, engine: Normalizer.ALGORITHM_VERSION, sha: SHA });
    }
    if (req.method === "POST" && url.pathname === "/v1/standardize") {
      const body = await readBody(req, MAX_BODY_SINGLE);
      let q;
      try { q = JSON.parse(body || "{}"); } catch { return send(res, 400, { error: "JSON tidak valid" }); }
      if (typeof q.address !== "string" || !q.address.trim()) {
        return send(res, 400, { error: "field 'address' (string tak-kosong) wajib ada" });
      }
      const eng = pickEngine(q.profile);
      const baku = eng.standardizeAddress(q.address, q.synonyms || undefined);
      const parts = eng.parseAddress(q.address);
      const confidence = Confidence.scoreDoor({ std: baku, raws: [q.address.trim().toUpperCase()] });
      return send(res, 200, { input: q.address, baku, parts, confidence });
    }
    if (req.method === "POST" && url.pathname === "/v1/standardize/batch") {
      const body = await readBody(req, MAX_BODY_BATCH);
      let q;
      try { q = JSON.parse(body || "{}"); } catch { return send(res, 400, { error: "JSON tidak valid" }); }
      if (!Array.isArray(q.addresses)) {
        return send(res, 400, { error: "field 'addresses' (array string) wajib ada" });
      }
      if (q.addresses.length > MAX_BATCH) {
        return send(res, 400, { error: `maksimal ${MAX_BATCH} alamat per batch` });
      }
      const eng = pickEngine(q.profile);
      const t0 = Date.now();
      const results = q.addresses.map((a) => {
        const s = String(a == null ? "" : a);
        const baku = eng.standardizeAddress(s, q.synonyms || undefined);
        return { input: s, baku };
      });
      return send(res, 200, { results, count: results.length, ms: Date.now() - t0 });
    }
    return send(res, 404, { error: "tidak dikenal" });
  } catch (err) {
    return send(res, err.message === "body terlalu besar" ? 413 : 500, { error: "gagal memproses" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`microservice alamat-tepat di http://127.0.0.1:${port} (engine v${Normalizer.ALGORITHM_VERSION})`);
});
