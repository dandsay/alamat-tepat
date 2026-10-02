/*
 * AlamatTepat — AUDIT LENGKAP penamaan (jaring pengaman mesin).
 * Setiap masalah yang pernah ditemukan & diperbaiki dikunci di sini per KELAS.
 * Commit mesin WAJIB 100% (dijalankan tools/release-engine.mjs).
 * Jalankan: `node tests/audit.test.mjs` (atau: npm run test:audit)
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Normalizer = require(join(__dirname, "..", "assets", "js", "normalizer.js"));
const generic = require(join(__dirname, "..", "assets", "js", "profiles", "generic.json"));
const surabaya = require(join(__dirname, "..", "assets", "js", "profiles", "surabaya.json"));
const audit = JSON.parse(readFileSync(join(__dirname, "audit-cases.json"), "utf8"));

const engines = {
  base: Normalizer.createNormalizer(null),
  generic: Normalizer.createNormalizer([generic]),
  surabaya: Normalizer.createNormalizer([generic, surabaya]),
};

export function runAuditTests(verbose = true) {
  const byClass = {};
  let total = 0, passed = 0;
  const failures = [];

  for (const c of audit.cases) {
    const profile = c.profile || "surabaya";
    const eng = engines[profile] || engines.surabaya;
    let actual = "";
    try { actual = eng.standardizeAddress(c.input); } catch (e) { actual = "ERROR:" + e.message; }
    total++;
    const cls = byClass[c.kelas] || (byClass[c.kelas] = { total: 0, passed: 0 });
    cls.total++;
    if (actual === c.expected) { passed++; cls.passed++; }
    else failures.push({ id: c.id, kelas: c.kelas, input: c.input, expected: c.expected, actual, note: c.note });
  }

  if (verbose) {
    console.log(`AlamatTepat — AUDIT penamaan v${Normalizer.ALGORITHM_VERSION}`);
    for (const k of Object.keys(byClass).sort()) {
      const c = byClass[k];
      console.log(`  ${c.passed === c.total ? "✓" : "✗"} ${k}: ${c.passed}/${c.total}`);
    }
    console.log(`Audit: ${passed}/${total} lulus`);
    for (const f of failures) {
      console.error(`  ✗ [${f.id}/${f.kelas}] ${JSON.stringify(f.input)} (${f.note})`);
      console.error(`      harap: ${JSON.stringify(f.expected)}`);
      console.error(`      dapat: ${JSON.stringify(f.actual)}`);
    }
  }
  return { total, passed, failed: failures.length, failures, byClass };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = runAuditTests(true);
  console.log(r.failed ? "\n✗ ADA MASALAH" : "\n✓ SEMUA OK");
  process.exit(r.failed ? 1 : 0);
}
