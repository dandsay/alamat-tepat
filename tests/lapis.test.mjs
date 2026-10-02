/*
 * AlamatTepat — test Lapis 2 (fuzzy) + Lapis 3 (relasional) + Lapis 4 (confidence).
 * Murni + deterministik. Jalankan: `node tests/lapis.test.mjs`
 * (atau: npm run test:lapis)
 */
import { createRequire } from "node:module";
import assert from "node:assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Fuzzy = require(join(__dirname, "..", "assets", "js", "fuzzy.js"));
const Rel = require(join(__dirname, "..", "assets", "js", "relational.js"));
const Conf = require(join(__dirname, "..", "assets", "js", "confidence.js"));

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); console.log("  ✓ " + msg); };

// Lapis 2: typo 1 huruf lolos, jalan beda tidak lolos
const s = Fuzzy.scorePair("KEPATIAN", "KEPATIHAN");
ok(s.score >= 0.80, `KEPATIAN~KEPATIHAN lolos (skor ${s.score})`);
const sug = Fuzzy.suggest({ KEPATIHAN: 40, KEPATIAN: 2 }, {}, { threshold: 0.80 });
ok(sug.length === 1 && sug[0].target === "KEPATIHAN", "saran menunjuk jangkar populer");
const jauh = Fuzzy.scorePair("SULUNG", "MAWAR");
ok(jauh.score < 0.80, `SULUNG~MAWAR tidak lolos (skor ${jauh.score})`);

// Lapis 3: vonis berstatistik — gabung bila kembaran polos, solo bila sendiri,
// abstain bila ada blok berkode atau tak ada penanda.
const ctxBase = {
  streetOf: () => "KALIBUTUH",
  codedOnStreet: () => 0,
  twinRt: () => [],
};
const mkDoor = (danglingN, plainN) => ({
  std: "Jl. Kalibutuh No. 144C", rw: "3", rt: "1", rawVariants: new Map(),
  __d: danglingN, __p: plainN,
});
const ctxCount = {
  ...ctxBase,
  danglingInDoor: d => d.__d,
  plainInDoor: d => d.__p,
};
const vMerge = Rel.analyzeDoor(mkDoor(1, 15), ctxCount);
ok(vMerge.verdict === "MERGE_OK" && vMerge.adjust > 0, `kembaran polos 15 = MERGE_OK (+${vMerge.adjust})`);
const vSolo = Rel.analyzeDoor(mkDoor(2, 0), ctxCount);
ok(vSolo.verdict === "SOLO" && vSolo.adjust === 0, "tanpa kembaran = SOLO (+0)");
const vAbs = Rel.analyzeDoor(mkDoor(1, 15), { ...ctxCount, codedOnStreet: () => 2 });
ok(vAbs.verdict === "ABSTAIN", "ada blok berkode = ABSTAIN");
const vNone = Rel.analyzeDoor(mkDoor(0, 20), ctxCount);
ok(vNone.verdict === "ABSTAIN" && !vNone.reason, "tanpa penanda = ABSTAIN diam");

// Lapis 4: jujur pada yang sulit, yakin pada yang mudah
const mudah = Conf.scoreDoor({ std: "Jl. Sulung II No. 11", raws: ["SULUNG 2/11"] });
ok(mudah.label === "YAKIN", `alamat bersih = YAKIN (${mudah.score})`);
const apart = Conf.scoreDoor({ std: "Jl. Apartemen Gunawangsa Tidar Unit B No. 1911", raws: ["APARTEMEN GUNAWANGSA TIDAR UNIT B 1911", "APT GUNAWANGSA B 1911"] });
ok(apart.label !== "YAKIN", `apartemen bukan YAKIN (${apart.label} ${apart.score})`);
const bubur = Conf.scoreDoor({ std: "Jl. Sulung 11 15 Xx", raws: ["SULUNG 11-15/20", "SULUNG 11-15/20 SBY", "SULUNG 11 15/20", "SULUNG 11-15 20"] });
ok(bubur.label === "RAGU", `tanpa nomor + berangka = RAGU (${bubur.score})`);

console.log(`Lapis 2+3+4: ${n}/${n} lulus`);
