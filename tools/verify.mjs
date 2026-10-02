/*
 * AlamatTepat — verifikasi integritas algoritma.
 *
 * 1. Menghitung ulang SHA-256 assets/js/normalizer.js dan membandingkannya
 *    dengan ALGORITHM.sha256.
 * 2. Menjalankan golden tests (perilaku tidak berubah).
 *
 * Jalankan: `npm run verify`
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runGoldenTests } from "../tests/normalizer.test.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ALGO_REL = "assets/js/normalizer.js";

const expected = readFileSync(join(ROOT, "ALGORITHM.sha256"), "utf8").trim().split(/\s+/)[0];
const actual = createHash("sha256").update(readFileSync(join(ROOT, ALGO_REL))).digest("hex");

let ok = true;

console.log("== Verifikasi SHA-256 algoritma ==");
console.log(`  terkunci : ${expected}`);
console.log(`  saat ini : ${actual}`);
if (expected !== actual) {
  ok = false;
  console.error("  \u2717 TIDAK COCOK — file algoritma berubah.");
  console.error("    Jika perubahan disengaja: jalankan `npm run hash` lalu commit ulang.");
} else {
  console.log("  \u2713 cocok");
}

// Cek build-info.js selaras
try {
  const bi = readFileSync(join(ROOT, "assets/js/build-info.js"), "utf8");
  const m = bi.match(/algorithmSha256:\s*"([a-f0-9]+)"/);
  if (!m || m[1] !== actual) {
    ok = false;
    console.error("  \u2717 assets/js/build-info.js tidak selaras. Jalankan `npm run hash`.");
  } else {
    console.log("  \u2713 build-info.js selaras");
  }
} catch {
  ok = false;
  console.error("  \u2717 assets/js/build-info.js tidak ditemukan. Jalankan `npm run hash`.");
}

console.log("\n== Golden tests ==");
const r = runGoldenTests(true);
if (r.failed) ok = false;

console.log("\n" + (ok ? "\u2713 SEMUA OK" : "\u2717 ADA MASALAH"));
process.exit(ok ? 0 : 1);
