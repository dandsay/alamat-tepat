# AlamatTepat — Mesin Pembaku Alamat Indonesia

Mesin normalisasi alamat KTP Indonesia menjadi format baku
`Jl. <Nama> [Blok <B>] [Gg. <G>] [No. <N>]`.
Murni, deterministik, tanpa DOM/network/random — 100% dapat diuji ulang dan
dikunci SHA-256.

**Ini engine saja — tanpa UI, tanpa HTML.** Rangkai antarmuka Anda sendiri;
engine menyediakan API murni (lihat "Pakai").

## Untuk siapa

Mesin ini lahir dari satu masalah sehari-hari: alamat yang ditulis banyak
tangan — di KTP, formulir, dan daftar warga — ejaannya berbeda-beda untuk
rumah yang sama. Pihak yang biasanya menghadapi masalah ini:

- **Kelurahan / kecamatan / Disdukcapil** — membersihkan data alamat warga
  sebelum sensus, verifikasi, atau sinkronisasi antar-sistem.
- **Pengurus RT / RW dan lingkungan** — merekap alamat rumah per pintu dari
  daftar yang ditulis banyak orang.
- **Logistik, kurir, dan e-commerce** — menyeragamkan alamat tujuan sebelum
  diteruskan ke geocoder atau armada antar.
- **Bank, fintech, dan asuransi** — pra-pembersih alamat saat onboarding,
  sebelum dicocokkan ke catatan Dukcapil.
- **Rumah sakit, sekolah, dan kampus** — merapikan alamat pendaftar, pasien,
  atau mahasiswa.
- **Developer** — pustaka murni yang bisa ditanam di aplikasi apa pun:
  tanpa server, tanpa kirim data ke mana pun.

## Arsitektur lapis

| Lapis | Berkas | Tugas |
|---|---|---|
| L1 pola | `assets/js/normalizer.js` | Pembersihan + penguraian pola (slash, hifen, Romawi, penanda). **Dikunci SHA-256.** |
| L2 fuzzy | `assets/js/fuzzy.js` | Saran typo nama jalan (embedding bigram/trigram + Damerau). |
| L3 relasional | `assets/js/relational.js` | Menimbang penanda menggantung dengan statistik tetangga (MERGE_OK/SOLO/ABSTAIN). |
| L4 jujur | `assets/js/confidence.js` | Skor keyakinan YAKIN/PERIKSA/RAGU + alasan. |
| Dictionary | `assets/js/profiles/*.json` | Data wilayah (nama kota/provinsi/kelurahan) — DATA, bukan kode. |

Filosofi: **mesin buta nama, melek pola** — nama daerah hanya hidup di
dictionary; yang tak tahu diteruskan dengan jujur (RAGU/ABSTAIN + alasan),
bukan ditebak.

## Alur kerja: mentah → baku

Satu panggilan L1 sudah cukup untuk satu alamat:

```
alamat mentah
   │
   ▼
[L1] pembersihan     buang RT/RW, kota di ekor, penanda wilayah,
   │                 rapikan tanda baca & typo umum (N0→NO, //→/)
   ▼
[L1] penguraian      pola berurutan: BLK-berkode → gang berslash (II/11)
   │                 → gang+NO → NO polos → nomor telanjang
   ▼
[L1] pembakuan       "Jl. <Jalan> [Blok <B>] [Gg. <G>] [No. <N>]"
```

Contoh:

```
"TAMBAK BAYAN 4 NO.4"          →  "Jl. Tambak Bayan IV No. 4"
"JL.JOHAR III BLK NO.41"       →  "Jl. Johar III No. 41"
"sulung 2/11 surabaya"         →  "Jl. Sulung II No. 11"   (profil Surabaya)
"TEMBOK SAYURAN GG. MEI/15"    →  "Jl. Tembok Sayuran Gg. Mei No. 15"
"GG. Mawar 3 RT 4 RW 5"        →  "Jl. Tanpa Nama Jalan Gg. Mawar No. 3"  (jujur)
```

Kejujuran mesin: yang tidak diketahui tidak ditebak. Tanpa nama jalan →
`Jl. Tanpa Nama Jalan`; ambigu → dibiarkan apa adanya (L4 yang menilai);
bukan alamat → string kosong.

## Universal Indonesia, data per daerah

Logika mesin **tidak memuat satu nama daerah pun** — kode hanya berisi *cara
alamat bekerja* (slash, Romawi, Blok, Gang). Semua nama hidup di dictionary:

- `assets/js/profiles/generic.json` — kota + provinsi **se-Indonesia**
  (dengan singkatan umum: SBY, JKT, JATIM, ...). Tanpa asumsi daerah.
- `assets/js/profiles/surabaya.json` — **profil contoh** wilayah Surabaya:
  singkatan kota, nama kelurahan setempat, alias `ALUN→ALON`, rusun
  BHASKARA JAYA.

Integrator di kota/kabupaten lain cukup menyalin pola `surabaya.json` menjadi
`<daerah>.json` dan mengisinya — **tanpa menyentuh kode mesin**, tanpa rilis.

### Asal-usul & harapan

Mesin ini dikalibrasi pada data survei satu kelurahan di **Surabaya** — itu
sebabnya profil contoh adalah Surabaya dan sebagian kasus uji memakai nama
jalan setempat. **Harapannya** mesin dipakai di seluruh Indonesia: karena
logikanya buta nama, pemakaian di daerah lain hanya butuh profil wilayah
masing-masing. `generic.json` sudah mencakup seluruh kota/provinsi Indonesia
untuk kebutuhan dasar (membuang ekor kota/provinsi).

### Batasan (jujur)

- **Tanpa profil**, ekor kota/provinsi tidak dibuang: `MERDEKA NO. 5 BANDUNG`
  tetap memuat "BANDUNG". Selalu muat minimal `generic.json`.
- Kasus benar-benar ambigu sengaja tidak dipaksa: `SULUNG 11-15/20` →
  `Jl. Sulung 11 15 XX` — ditandai, bukan ditebak.
- L2/L3/L4 bekerja pada **kumpulan** alamat (frekuensi jalan, tetangga
  se-RT), bukan satu alamat terisolasi.
- Sebagian besar kasus uji (`tests/golden.json` default `surabaya`) masih
  memakai nama jalan Surabaya — itu **contoh sah pemakaian profil**, bukan
  batasan logika: mesin lulus uji `generic` dan `base` untuk pola yang sama.

## Pakai

```js
const Normalizer = require("./assets/js/normalizer.js");

// 1) profil dasar (universal, tanpa profil wilayah)
Normalizer.standardizeAddress("JL. SULUNG II/11");
// → "Jl. Sulung II No. 11"

// 2) dengan profil wilayah + kamus sinonim typo buatan Anda
const generic = require("./assets/js/profiles/generic.json");
const surabaya = require("./assets/js/profiles/surabaya.json");
const eng = Normalizer.createNormalizer([generic, surabaya]);
eng.standardizeAddress("SULUNG 2/11 SURABAYA");
// → "Jl. Sulung II No. 11"   (ekor kota dibuang karena ada di profil)

eng.standardizeAddress("KEPATIAN 2 NO. 7", { KEPATIAN: "KEPATIHAN" });
// → "Jl. Kepatihan II No. 7"   (kamus sinonim memperbaiki typo jalan)
```

Untuk **kumpulan** alamat: standardize per baris, kumpulkan frekuensi nama
jalan hasil parse, lalu `AlamatTepatFuzzy.suggest(counts)` memberi saran typo;
`AlamatTepatConfidence.scoreDoor(...)` memberi skor YAKIN/PERIKSA/RAGU per
pintu; `AlamatTepatRelational.analyzeDoor(...)` menimbang penanda menggantung
dengan statistik tetangga.

Browser (classic script): memuat `assets/js/normalizer.js` → global
`AlamatTepatNormalizer`.

## Perintah

```bash
npm run verify          # SHA-256 + golden tests
npm run test:lapis      # L2+L3+L4
npm run test:audit      # audit penamaan (jaring pengaman)
npm run release:engine -- X.Y.Z "catatan"   # satu-satunya cara rilis mesin
node tools/eval-upgrade.mjs --base engine-vX.Y.Z   # uji upgrade tanpa regresi
```

Aturan rilis: setiap perubahan perilaku L1 wajib menambah/mengoreksi
`tests/golden.json` + `tests/audit-cases.json` DULU (ekspektasi = kebenaran
manusia), semua gerbang 100% sebelum commit, `benar->salah` pada eval-set
harus NOL.

## Integritas

`ALGORITHM.sha256` mengunci isi `assets/js/normalizer.js`. `build-info.js`
dibuat otomatis oleh `npm run hash`. Keduanya tidak boleh disunting tangan —
rilis hanya lewat `npm run release:engine`. Log riwayat: `ENGINE_HISTORY.md`.

## Lisensi

GPL-3.0-or-later — lihat [LICENSE](LICENSE).
