/*
 * AlamatTepat — golden tests untuk mesin normalisasi (multi-profil).
 * Jalankan: `npm test` atau `node tests/normalizer.test.mjs`
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
const golden = JSON.parse(readFileSync(join(__dirname, "golden.json"), "utf8"));

// Mesin per profil
const engines = {
  base: Normalizer.createNormalizer(null),
  generic: Normalizer.createNormalizer([generic]),
  surabaya: Normalizer.createNormalizer([generic, surabaya])
};

export function runGoldenTests(verbose = true) {
  const failures = [];
  let total = 0;

  const engineFor = (name) => engines[name] || engines[golden.defaultProfile] || engines.surabaya;

  const check = (label, input, expected, actual, profile) => {
    total++;
    if (expected !== actual) failures.push({ label, input, expected, actual, profile });
  };

  for (const c of golden.cases) {
    const profile = c.profile || golden.defaultProfile;
    check("case", c.input, c.expected, engineFor(profile).standardizeAddress(c.input), profile);
  }
  for (const c of golden.synonymCases) {
    const profile = c.profile || golden.defaultProfile;
    check("synonym", c.input, c.expected, engineFor(profile).standardizeAddress(c.input, c.synonyms), profile);
  }

  if (verbose) {
    console.log(`AlamatTepat — mesin v${Normalizer.ALGORITHM_VERSION}`);
    console.log(`Profil tersedia: ${Object.keys(engines).join(", ")}`);
    console.log(`Golden tests: ${total - failures.length}/${total} lulus`);
    for (const f of failures) {
      console.error(`  \u2717 [${f.label}/${f.profile}] ${JSON.stringify(f.input)}`);
      console.error(`      harap: ${JSON.stringify(f.expected)}`);
      console.error(`      dapat: ${JSON.stringify(f.actual)}`);
    }
  }

  return { total, passed: total - failures.length, failed: failures.length, failures };
}

// Jalankan langsung bila dieksekusi sebagai skrip utama
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = runGoldenTests(true);
  process.exit(r.failed ? 1 : 0);
}
