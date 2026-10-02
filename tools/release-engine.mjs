/*
 * AlamatTepat — MESIN RILIS ALGORITMA (satu-satunya cara merilis mesin).
 *
 * Aturan main:
 * - Setiap perubahan algoritma WAJIB lewat mesin ini. Dilarang build manual
 *   (dilarang menyunting ALGORITHM.sha256 / build-info.js dengan tangan).
 * - Mesin: memverifikasi (hash + golden + lapis) -> mengunci (hash) ->
 *   menandatangani history (ENGINE_HISTORY.md + commit rilis).
 * - Perubahan di luar algoritma (UI, gaya, docs) TIDAK perlu mesin ini.
 *
 * Pakai: npm run release:engine -- <versi> ["catatan"]
 * Contoh: npm run release:engine -- 3.4.0 "sufiks gang dipertahankan"
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Berkas mesin (algoritma + dictionary + kunci). Di luar ini = bukan rilis mesin.
const ENGINE_FILES = [
  "assets/js/normalizer.js",
  "assets/js/fuzzy.js",
  "assets/js/relational.js",
  "assets/js/confidence.js",
  "assets/js/profiles/generic.json",
  "assets/js/profiles/surabaya.json",
  "tests/golden.json",
  "tests/audit-cases.json",
  "tests/eval-set.json",
  "tests/normalizer.test.mjs",
  "tests/lapis.test.mjs",
  "tests/audit.test.mjs",
  "tools/hash-algorithm.mjs",
  "tools/verify.mjs",
  "tools/release-engine.mjs",
  "tools/eval-upgrade.mjs",
  "ALGORITHM.sha256",
  "assets/js/build-info.js",
  "ENGINE_HISTORY.md",
];

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

function fail(msg) {
  console.error("\n✗ RILIS DITOLAK: " + msg);
  process.exit(1);
}

const version = process.argv[2];
const note = process.argv[3] || "-";
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  fail("versi wajib format X.Y.Z. Contoh: npm run release:engine -- 3.4.0 \"catatan\"");
}

// 1. Tree harus bersih di luar berkas mesin (commit rilis harus murni mesin).
const dirty = sh("git status --porcelain")
  .split("\n")
  .map(l => l.trim())
  .filter(Boolean)
  .map(l => l.replace(/^[A-Z?!]+\s+/, "").replace(/^"(.*)"$/, "$1"));
const outside = dirty.filter(f => !ENGINE_FILES.includes(f));
if (outside.length) fail("ada perubahan di luar mesin:\n  " + outside.join("\n  ") + "\nRapikan/commit dulu yang non-mesin.");

// 2. Harus ada perubahan mesin vs HEAD (jangan rilis angin).
const changed = sh("git status --porcelain " + ENGINE_FILES.map(f => `"${f}"`).join(" ")).trim();
if (!changed) fail("tidak ada perubahan berkas mesin vs HEAD.");

// 3. Mesin menulis versi (satu-satunya suntingan versi yang sah).
const algoPath = join(ROOT, "assets/js/normalizer.js");
let src = readFileSync(algoPath, "utf8");
if (!/var ALGORITHM_VERSION = "\d+\.\d+\.\d+";/.test(src)) fail("penanda ALGORITHM_VERSION tak ditemukan.");
src = src.replace(/var ALGORITHM_VERSION = "\d+\.\d+\.\d+";/, `var ALGORITHM_VERSION = "${version}";`);
writeFileSync(algoPath, src);
console.log(`✓ versi ditulis mesin: ${version}`);

// 4. Kunci hash (lewat perkakas hash, bukan tangan).
sh("node tools/hash-algorithm.mjs");

// 5. Verifikasi penuh: SHA + golden.
let goldenTotal = 0, goldenPassed = 0;
try {
  const out = sh("node tools/verify.mjs");
  console.log(out);
  const m = out.match(/Golden tests:\s*(\d+)\/(\d+)/);
  if (m) { goldenPassed = parseInt(m[1], 10); goldenTotal = parseInt(m[2], 10); }
} catch (e) {
  fail("verifikasi gagal:\n" + (e.stdout || e.message));
}
if (!goldenTotal || goldenPassed !== goldenTotal) fail("golden tidak 100%.");

// 6. Test lapis 2+3+4.
let lapisLine = "?";
try {
  const out = sh("node tests/lapis.test.mjs");
  console.log(out);
  const m = out.match(/(\d+)\/(\d+) lulus/);
  if (m) lapisLine = `${m[1]}/${m[2]}`;
  if (!m || m[1] !== m[2]) fail("test lapis tidak 100%.");
} catch (e) {
  fail("test lapis gagal:\n" + (e.stdout || e.message));
}

// 6b. AUDIT penamaan: wajib 100%, jaring pengaman tiap commit mesin.
let auditLine = "?";
try {
  const out = sh("node tests/audit.test.mjs");
  console.log(out);
  const m = out.match(/Audit:\s*(\d+)\/(\d+)/);
  if (m) auditLine = `${m[1]}/${m[2]}`;
  if (!m || m[1] !== m[2]) fail("audit penamaan tidak 100% — tambah/perbaiki kasus di tests/audit-cases.json.");
} catch (e) {
  fail("audit penamaan gagal:\n" + (e.stdout || e.message));
}

const sha = readFileSync(join(ROOT, "ALGORITHM.sha256"), "utf8").trim().split(/\s+/)[0];
const date = new Date().toISOString().slice(0, 10);

// 7. Tandatangani history.
const histPath = join(ROOT, "ENGINE_HISTORY.md");
if (!existsSync(histPath)) {
  writeFileSync(histPath,
    "# ENGINE_HISTORY — Log Rilis Algoritma Bertanda\n\n" +
    "Setiap entri ditulis OLEH MESIN (`tools/release-engine.mjs`), bukan tangan.\n" +
    "Log dimulai v3.4.0; rilis lama lihat git tag `engine-v*`.\n\n");
}
appendFileSync(histPath,
  `## v${version} — ${date}\n` +
  `- sha256: \`${sha}\`\n` +
  `- golden: ${goldenPassed}/${goldenTotal} lulus\n` +
  `- lapis: ${lapisLine} lulus\n` +
  `- audit: ${auditLine} lulus\n` +
  `- catatan: ${note}\n` +
  `- ditandatangani oleh: tools/release-engine.mjs\n\n`);
console.log("✓ history ditandatangani: ENGINE_HISTORY.md");

// 8. Commit rilis (murni berkas mesin). Pesan multi-baris via -m ganda.
sh("git add " + ENGINE_FILES.map(f => `"${f}"`).join(" "));
const subject = `release(engine): v${version}`;
const bodyLines = [
  `sha256: ${sha}`,
  `golden: ${goldenPassed}/${goldenTotal}`,
  `lapis: ${lapisLine}`,
  `audit: ${auditLine}`,
  `catatan: ${note}`,
  `Mesin: tools/release-engine.mjs (verifikasi + kunci + tanda)`,
];
let cmd = `git commit -m ${JSON.stringify(subject)}`;
for (const line of bodyLines) cmd += ` -m ${JSON.stringify(line)}`;
sh(cmd);
sh(`git tag -f engine-v${version}`);
const commit = sh("git rev-parse --short HEAD");

console.log(`\n✓ RILIS MESIN v${version} SELESAI (${commit}, tag engine-v${version})`);
