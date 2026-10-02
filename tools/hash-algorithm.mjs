/*
 * AlamatTepat — hitung & kunci SHA-256 algoritma.
 *
 * Menghasilkan:
 *   - ALGORITHM.sha256            (hash resmi, format `sha256sum`)
 *   - assets/js/build-info.js     (info build untuk ditampilkan di UI)
 *
 * Jalankan: `npm run hash`
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ALGO_REL = "assets/js/normalizer.js";
const ALGO_ABS = join(ROOT, ALGO_REL);

const require = createRequire(import.meta.url);

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

const algoSource = readFileSync(ALGO_ABS);
const hash = sha256(algoSource);
let version = "unknown";
try {
  version = require(ALGO_ABS).ALGORITHM_VERSION || version;
} catch { /* noop */ }

// 1. ALGORITHM.sha256 (kompatibel dengan `sha256sum -c`)
writeFileSync(join(ROOT, "ALGORITHM.sha256"), `${hash}  ${ALGO_REL}\n`);

// 2. build-info.js untuk UI
const buildInfo =
  "/* Dibuat otomatis oleh tools/hash-algorithm.mjs — jangan disunting manual. */\n" +
  "window.ALAMAT_TEPAT_BUILD = {\n" +
  `  algorithmVersion: ${JSON.stringify(version)},\n` +
  `  algorithmSha256: ${JSON.stringify(hash)},\n` +
  `  algorithmFile: ${JSON.stringify(ALGO_REL)},\n` +
  `  generatedAt: ${JSON.stringify(new Date().toISOString())}\n` +
  "};\n";
writeFileSync(join(ROOT, "assets/js/build-info.js"), buildInfo);

console.log("Algoritma dikunci:");
console.log(`  file    : ${ALGO_REL}`);
console.log(`  versi   : ${version}`);
console.log(`  sha256  : ${hash}`);
console.log("Ditulis : ALGORITHM.sha256, assets/js/build-info.js");
