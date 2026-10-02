/*
 * AlamatTepat — mesin UJI UPGRADE (model baru: uji dulu, baru naik versi).
 *
 * Membandingkan dua versi mesin pada eval-set berlabel manusia
 * (tests/eval-set.json) dan melaporkan MATRIKS TRANSISI:
 *   benar->benar | benar->salah = REGRESI | salah->benar = PERBAIKAN | salah->salah
 * Plus sensus perubahan pada CSV nyata (opsional, tanpa label: hitung output berubah).
 *
 * Pakai:
 *   node tools/eval-upgrade.mjs --base engine-v3.4.0
 *   node tools/eval-upgrade.mjs --base engine-v3.4.0 --csv "Data.csv"
 *   node tools/eval-upgrade.mjs --base HEAD --eval tests/eval-set.json
 *
 * Mesin BARU = worktree saat ini. Mesin LAMA = git ref (--base).
 * Profil diambil dari worktree untuk keduanya (tercatat di laporan).
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const require = createRequire(import.meta.url);

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const BASE_REF = arg("--base", "HEAD");
const EVAL_FILE = arg("--eval", join(ROOT, "tests", "eval-set.json"));
const CSV_FILE = arg("--csv", "");

function loadEngineFromRef(ref) {
  const tmp = join(os.tmpdir(), "at-eval-" + process.pid + "-" + Math.random().toString(36).slice(2));
  mkdirSync(tmp, { recursive: true });
  const src = execSync(`git show ${ref}:assets/js/normalizer.js`, { cwd: ROOT, encoding: "utf8" });
  const f = join(tmp, "normalizer.js");
  writeFileSync(f, src);
  const req = createRequire(f);
  return req(f);
}

const generic = require(join(ROOT, "assets/js/profiles/generic.json"));
const surabaya = require(join(ROOT, "assets/js/profiles/surabaya.json"));

const NewNormalizer = require(join(ROOT, "assets/js/normalizer.js"));
const OldNormalizer = loadEngineFromRef(BASE_REF);
const engNew = NewNormalizer.createNormalizer([generic, surabaya]);
const engOld = OldNormalizer.createNormalizer([generic, surabaya]);

const evalSet = JSON.parse(readFileSync(EVAL_FILE, "utf8"));
const matrix = { "benar-benar": [], "benar-salah": [], "salah-benar": [], "salah-salah": [] };

for (const c of evalSet.cases || []) {
  const profile = (c.profile === "generic") ? [generic] : [generic, surabaya];
  const eN = c.profile ? NewNormalizer.createNormalizer(profile) : engNew;
  const eO = c.profile ? OldNormalizer.createNormalizer(profile) : engOld;
  let outNew = "", outOld = "";
  try { outNew = eN.standardizeAddress(c.input, c.synonyms || undefined); } catch (e) { outNew = "ERROR:" + e.message; }
  try { outOld = eO.standardizeAddress(c.input, c.synonyms || undefined); } catch (e) { outOld = "ERROR:" + e.message; }
  const wasRight = outOld === c.expected;
  const isRight = outNew === c.expected;
  const key = (wasRight ? "benar" : "salah") + "-" + (isRight ? "benar" : "salah");
  matrix[key].push({ input: c.input, expected: c.expected, lama: outOld, baru: outNew, kind: c.kind || "baku" });
}

const total = (evalSet.cases || []).length;
const rightNew = matrix["benar-benar"].length + matrix["salah-benar"].length;
const rightOld = matrix["benar-benar"].length + matrix["benar-salah"].length;

console.log(`== Eval upgrade: ${BASE_REF} (lama) vs worktree (baru) ==`);
console.log(`   kasus: ${total} | benar lama: ${rightOld} | benar baru: ${rightNew}`);
console.log(`   benar->benar : ${matrix["benar-benar"].length} (aman)`);
console.log(`   salah->benar : ${matrix["salah-benar"].length} (PERBAIKAN)`);
console.log(`   salah->salah : ${matrix["salah-salah"].length} (tetap)`);
console.log(`   benar->salah : ${matrix["benar-salah"].length} (REGRESI${matrix["benar-salah"].length ? " — WAJIB DIATASI!" : ""})`);
for (const r of matrix["benar-salah"]) {
  console.log(`     REGRESI ${JSON.stringify(r.input)}: ${JSON.stringify(r.lama)} -> ${JSON.stringify(r.baru)} (harap ${JSON.stringify(r.expected)})`);
}
for (const r of matrix["salah-benar"]) {
  console.log(`     PERBAIKAN ${JSON.stringify(r.input)}: ${JSON.stringify(r.lama)} -> ${JSON.stringify(r.baru)}`);
}

// Sensus CSV nyata (tanpa label): seberapa banyak output berubah.
if (CSV_FILE) {
  const p = existsSync(CSV_FILE) ? CSV_FILE : join(ROOT, CSV_FILE);
  const text = readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split("\n");
  const head = lines[0].split(";").map(h => h.replace(/^['"]+|['"]+$/g, "").trim().toUpperCase());
  const ia = head.findIndex(h => h.includes("ALAMAT KTP") || h === "ALAMAT");
  if (ia === -1) { console.error("  sensus: kolom alamat tak ditemukan."); process.exit(1); }
  let changed = 0, n = 0;
  const examples = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(";");
    if (cells.length <= ia) continue;
    const a = (cells[ia] || "").replace(/^['"]+|['"]+$/g, "");
    if (!a) continue;
    n++;
    const o = engOld.standardizeAddress(a), w = engNew.standardizeAddress(a);
    if (o !== w) {
      changed++;
      if (examples.length < 15) examples.push({ mentah: a.slice(0, 60), lama: o, baru: w });
    }
  }
  console.log(`   sensus CSV: ${changed}/${n} output berubah (${(changed / Math.max(1, n) * 100).toFixed(1)}%)`);
  for (const e of examples) console.log(`     ~ ${JSON.stringify(e.mentah)}: ${JSON.stringify(e.lama)} -> ${JSON.stringify(e.baru)}`);
}

process.exit(matrix["benar-salah"].length ? 1 : 0);
