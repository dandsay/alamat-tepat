/*
 * AlamatTepat — AddressNormalizer (mesin)
 * Normalisasi alamat KTP Indonesia menjadi format baku:
 *   "Jl. <Nama Jalan> [Blok <B>] [No. <N>]"
 *
 * PRINSIP DESAIN
 *  - Mesin ini MURNI dan UNIVERSAL: tidak memuat nama jalan/kota/kelurahan.
 *  - Data khas daerah (kota, kelurahan, rusun, alias, pengecualian) diberikan
 *    lewat "profil wilayah" -> lihat assets/js/profiles/*.js
 *  - Kamus sinonim (typo nama jalan) diberikan lewat parameter `synonyms`.
 *  - Tanpa DOM, tanpa state global => mudah diuji & dikunci dengan SHA-256.
 *
 * Lisensi: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();             // Node / CommonJS
  } else {
    root.AlamatTepatNormalizer = factory();  // Browser (classic script)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ALGORITHM_VERSION = "3.6.3";

  // Profil dasar (universal). Data wilayah ditambahkan lewat profile/ merge.
  var BASE_PROFILE = {
    cities: [],            // nama kota/kabupaten (dibuang di akhir alamat)
    provinces: [],         // nama/singkatan provinsi
    regionMarkers: ["DUSUN", "KELURAHAN", "KECAMATAN", "KEL", "KEC"],
    kelurahanNames: [],    // frasa nama kelurahan (dibuang bila didahului penanda wilayah)
    aliases: {},           // normalisasi kata utuh, mis. { ALUN: "ALON" }
    dedupeExempt: [],      // kata ulang yang sah (mis. ALON-ALON)
    titleOverrides: { BLK: "Blok", GG: "Gang" },
    blockStreets: [],      // nama jalan yang MEMANG memakai sistem Blok (mis. area ruko)
    rusun: null            // { detect:[...], canonical:"...", blockHints:[...] }
  };

  // ---------- util ----------
  function isArray(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Ubah "ALON-ALON CONTONG" -> ALON[\s-]+ALON[\s-]+CONTONG
  function nameToRe(name) {
    return String(name).split(/[\s-]+/).filter(Boolean).map(escapeRe).join("[\\s-]+");
  }

  function buildAlternation(list, transform) {
    var arr = (list || []).filter(Boolean).slice();
    arr.sort(function (a, b) { return b.length - a.length; });   // terpanjang dulu
    return arr.map(transform || escapeRe).join("|");
  }

  function mergeProfiles() {
    var out = {
      cities: [], provinces: [], regionMarkers: [], kelurahanNames: [],
      aliases: {}, dedupeExempt: [], blockStreets: [], titleOverrides: {}, rusun: null
    };
    for (var i = 0; i < arguments.length; i++) {
      var p = arguments[i];
      if (!p) continue;
      ["cities", "provinces", "regionMarkers", "kelurahanNames", "dedupeExempt", "blockStreets"].forEach(function (k) {
        if (isArray(p[k])) out[k] = out[k].concat(p[k]);
      });
      if (p.aliases) Object.keys(p.aliases).forEach(function (k) { out.aliases[k] = p.aliases[k]; });
      if (p.titleOverrides) Object.keys(p.titleOverrides).forEach(function (k) { out.titleOverrides[k] = p.titleOverrides[k]; });
      if (p.rusun) out.rusun = p.rusun;
    }
    ["cities", "provinces", "regionMarkers", "kelurahanNames", "dedupeExempt", "blockStreets"].forEach(function (k) {
      out[k] = out[k].filter(function (v, idx, a) { return v && a.indexOf(v) === idx; });
    });
    return out;
  }

  // ---------- fungsi murni ----------
  var ROMAN_VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  var ROMAN_TABLE = {
    I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
    XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18, XIX: 19, XX: 20
  };

  function romanToArabic(tok) {
    var up = String(tok).toUpperCase();
    if (ROMAN_TABLE[up]) return String(ROMAN_TABLE[up]);
    if (/^[IVXLCDM]+$/.test(up)) {
      var total = 0;
      for (var i = 0; i < up.length; i++) {
        var cur = ROMAN_VALUES[up[i]];
        var next = ROMAN_VALUES[up[i + 1]] || 0;
        total += cur < next ? -cur : cur;
      }
      return String(total);
    }
    return up;
  }

  // Angka -> Romawi (untuk penulisan gang, mis. 4 -> "IV")
  function arabicToRoman(v) {
    var n = parseInt(v, 10);
    if (!isFinite(n) || n <= 0) return String(v);
    var out = "";
    var table = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
      [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    for (var j = 0; j < table.length; j++) {
      while (n >= table[j][0]) { out += table[j][1]; n -= table[j][0]; }
    }
    return out;
  }

  // Seragamkan nomor: "65-A"/"65 A"/"65a" -> "65A"; "06" -> "6"; "I" -> "1";
  // daftar jamak ruko dipertahankan ("5,7,8,9"), nol depan dikupas per segmen.
  function normNumber(raw) {
    var s = String(raw).toUpperCase().replace(/\s+/g, "");
    if (/^[IVXLCDM]+$/.test(s)) return romanToArabic(s);
    s = s.replace(/([0-9])-([A-Z])/g, "$1$2");
    s = s.split(/(-|,)/).map(function (seg, idx) {
      if (idx % 2 === 1) return seg;   // pemisah (-/,) dipertahankan
      return seg.replace(/^0+(?=\d)/, "");
    }).join("");
    return s;
  }

  // Damerau-Levenshtein ringkas (untuk typo kota di ujung; mandiri agar L1 tetap steril).
  function damerauSmall(a, b) {
    var la = a.length, lb = b.length;
    if (!la) return lb;
    if (!lb) return la;
    var d = [];
    for (var i = 0; i <= la; i++) { d[i] = [i]; }
    for (var j = 0; j <= lb; j++) { d[0][j] = j; }
    for (i = 1; i <= la; i++) {
      for (j = 1; j <= lb; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
        }
      }
    }
    return d[la][lb];
  }

  // ================= Instance per profil =================
  function createNormalizer(profileInput) {
    var inputs = isArray(profileInput) ? profileInput : [profileInput];
    var P = mergeProfiles.apply(null, [BASE_PROFILE].concat(inputs));

    // --- regex yang dipra-kompilasi dari profil ---
    var placesRe = null;
    var allPlaces = P.cities.concat(P.provinces);
    if (allPlaces.length) {
      var alt = buildAlternation(allPlaces);
      // dibuang bila berada di AKHIR alamat (mis. "... BANDUNG", "... SBY JAWA TIMUR")
      placesRe = new RegExp("(?:\\s*,?\\s*\\b(?:KOTA\\s+)?(?:" + alt + ")\\.?)+\\s*$", "i");
    }
    var regionRe = null;
    if (P.regionMarkers.length) {
      var markAlt = buildAlternation(P.regionMarkers);
      var kelAlt = P.kelurahanNames.length ? "\\b(?:(?:" + buildAlternation(P.kelurahanNames, nameToRe) + ")\\b)?" : "";
      regionRe = new RegExp("\\b(?:" + markAlt + ")\\.?\\s*" + kelAlt + "\\s*", "gi");
    }
    var aliasKeys = Object.keys(P.aliases || {});
    var aliasesRe = aliasKeys.length
      ? new RegExp("\\b(?:" + buildAlternation(aliasKeys) + ")\\b", "g") : null;
    var rtRwRe = /\b(?:RT|RW)\.?\s*0*\d+[A-Z]?\b/g;
    var rusunDetectRe = (P.rusun && P.rusun.detect && P.rusun.detect.length)
      ? new RegExp("\\b(?:" + buildAlternation(P.rusun.detect) + ")\\b") : null;
    var rusunBlockRe = (P.rusun && P.rusun.blockHints && P.rusun.blockHints.length)
      ? new RegExp("\\b(?:" + buildAlternation(P.rusun.blockHints) + ")\\s+([IVXLCDM]+|\\d+)\\b") : null;
    var dedupeExempt = new Set(P.dedupeExempt || []);
    var blocklistSet = new Set((P.blockStreets || []).map(function (x) { return String(x).toUpperCase(); }));

    // Buang "kebisingan": RT/RW, kota/provinsi, penanda wilayah + nama kelurahan
    function cleanAddressRaw(raw) {
      var s = String(raw == null ? "" : raw).replace(/^['"]+|['"]+$/g, "").trim().toUpperCase();
      s = s.replace(rtRwRe, " ");
      if (aliasesRe) s = s.replace(aliasesRe, function (m) { return P.aliases[m] || m; });
      if (regionRe) s = s.replace(regionRe, " ");
      if (placesRe) s = s.replace(placesRe, " ");
      s = fuzzyCityTail(s);   // typo kota di ujung ("SIRABAYA" -> dibuang seperti kota)
      // Penanda blok menggantung di ujung ("144-C BLK", "4/75 BLK"): tak berkode =
      // tak bermakna di pola. Dikupas DI SINI (cara penulisan, bukan nama daerah),
      // dicatat di parseAddress.dangling agar Lapis 3 bisa menimbangnya dengan statistik.
      s = s.replace(/\s+(BLK|BLOK|KAV)\.?$/, " ");
      s = s.replace(/\bN0\b/g, "NO");                     // typo "N0" -> "NO"
      s = s.replace(/\/{2,}/g, "/");                     // "X//66" -> "X/66" (jari ganda)
      s = s.replace(/[.,]/g, function (ch, off, str) {
        // Koma/titik DI ANTARA digit dilindungi ("5,7" nomor jamak ruko)
        var prev = str[off - 1], next = str[off + 1];
        var digit = c => c >= "0" && c <= "9";
        if (ch === "," && digit(prev) && digit(next)) return ch;
        return " ";
      });
      s = s.replace(/\s*-\s*$/, "");                     // strip gantung di ujung ("DUSUN. -")
      // "26 - B" -> "26B", TAPI "5-A/27" dibiarkan berhifen (sufiks gang, lihat P2).
      // Ini cara penulisan (pola), bukan nama daerah: tanda hubung sebelum "/" milik struktur slash.
      s = s.replace(/([0-9])\s*-\s*([A-Z])\b(?!\/)/g, "$1$2");  // "26 - B" -> "26B"
      s = s.replace(/([0-9])\s+([A-Z])\b/g, "$1$2");      // "65 A"  -> "65A"
      s = s.replace(/([0-9])\s*-\s*([0-9])/g, "$1-$2");   // "11 - 15" -> "11-15"
      s = s.replace(/\b([IVXLCDM]+)-([0-9])/g, "$1/$2");  // "II-4" -> "II/4"
      s = s.replace(/\s+/g, " ").trim();
      // buang kata terakhir bila menduplikasi kata sebelumnya (mis. "SULUNG II/11 SULUNG").
      // JANGAN makan angka/romawi/slash: "4 NO 4", "1 / 1", "I NO I" sah (gang==nomor).
      // Hormati kata ulang sah (mis. ALON-ALON). Cara penulisan, bukan nama daerah.
      var toks = s.split(" ");
      if (toks.length > 1) {
        var lastTok = toks[toks.length - 1];
        var isNumLike = /^(\d+[A-Z]?|[IVXLCDM]+|\/)$/.test(lastTok);
        if (!isNumLike && !dedupeExempt.has(lastTok) && toks.slice(0, -1).indexOf(lastTok) !== -1) {
          s = toks.slice(0, -1).join(" ");
        }
      }
      return s;
    }

    // Typo kota/provinsi di UJUNG ("SIRABAYA" -> "SURABAYA" -> dibuang).
    // Bekerja dari DICTIONARY profil (P.cities/P.provinces) + jarak edit, ambang keras,
    // posisi akhir SAJA. Bukan hardcode nama: daftar datang dari data profil.
    function fuzzyCityTail(s) {
      var toks = s.split(" ").filter(Boolean);
      if (toks.length < 2) return s;
      var cands = P.cities.concat(P.provinces);
      if (!cands.length) return s;
      var cleanTok = function (w) { return String(w).replace(/\.+$/g, "").toUpperCase(); };
      function bestFor(forms) {
        // forms: [{text, len}] kandidat ekor; kembalikan {city, dist} terbaik atau null
        var bb = null, bd = 99;
        for (var i = 0; i < cands.length; i++) {
          var c = String(cands[i]).toUpperCase();
          for (var j = 0; j < forms.length; j++) {
            var t = forms[j];
            if (t.len < 4 || Math.abs(c.length - t.len) > 2) continue;
            if (c[0] !== t.text[0]) continue;   // typo jarang ganti huruf depan
            var d = damerauSmall(t.text, c);
            if (d <= 2 && d < bd) { bd = d; bb = c; }
          }
        }
        return bb ? { city: bb, dist: bd } : null;
      }
      // Coba ekor 2 kata dulu ("JAWA TIMUR"), lalu 1 kata ("SURABAYA").
      var t2 = cleanTok(toks[toks.length - 2] + " " + toks[toks.length - 1]);
      var hit2 = bestFor([{ text: t2, len: t2.replace(/ /g, "").length + 1 }]);
      if (hit2 && /\s/.test(hit2.city)) {
        return toks.slice(0, -2).join(" ");
      }
      var t1 = cleanTok(toks[toks.length - 1]);
      var hit1 = bestFor([{ text: t1, len: t1.length }]);
      if (hit1 && !/\s/.test(hit1.city)) {
        // Pastikan bukan kata jalan yang kebetulan mirip: hanya buang bila
        // token-ujung BUKAN angka/romawi dan sisa alamat masih bermakna.
        if (/^(\d+|[IVXLCDM]+)$/.test(t1) || toks.length < 3) return s;
        return toks.slice(0, -1).join(" ");
      }
      return s;
    }

    // Nama gang dinormalkan case-nya TANPA merusak Romawi ("II Buntu" tetap, "MEI" -> "Mei").
    function gangTitle(gang) {
      return String(gang).split(" ").filter(Boolean).map(function (w) {
        var up = w.toUpperCase();
        if (/^(?:[IVXLCDM]+|\d+[A-Z]?)$/.test(up)) return up;
        return up.charAt(0) + up.slice(1).toLowerCase();
      }).join(" ");
    }

    function titleCaseStreet(street) {
      return street.split(" ").filter(Boolean).map(function (w) {
        var up = w.toUpperCase();
        if (P.titleOverrides[up]) return P.titleOverrides[up];
        if (/^[IVXLCDM]{2,}$/.test(up)) return up;   // Romawi di nama jalan dipertahankan ("II Buntu")
        return up.charAt(0) + up.slice(1).toLowerCase();
      }).join(" ");
    }

    // Uraikan alamat menjadi { street, block, prefix, number }
    //   block  = "Blok X" — HANYA bila mentah menyebut BLK/BLOK/KAV (mis. ruko)
    //            atau nama jalannya terdaftar di profil `blockStreets`.
    //   prefix = angka depan tanpa label, mis. "4" pada "SULUNG 4/22"
    //            -> "Jl. Sulung 4 No. 22"
    function parseAddress(raw) {
      var dm = String(raw == null ? "" : raw).toUpperCase().match(/\s+(BLK|BLOK|KAV)\.?\s*$/);
      var dangling = dm ? dm[1] : "";
      var s = cleanAddressRaw(raw);
      if (!s) return { street: "", block: "", prefix: "", number: "", gang: "", dangling: dangling };

      var isRusun = rusunDetectRe ? rusunDetectRe.test(s) : false;
      var explicitBlock = false;

      var belakang = false;
      if (/\bBELAKANG\b/.test(s)) {
        belakang = true;
        s = s.replace(/\bBELAKANG\b/g, " ").replace(/\s+/g, " ").trim();
      }

      // BUNTU TIDAK dikupas di sini: ia mengikuti gang (lihat P2/P3/post-pass).
      // "GG MEI BUNTU" -> gang "Mei Buntu"; "GG BUNTU" -> gang "Buntu";
      // "II BUNTU/8" -> gang "II Buntu". Beda dengan BELAKANG (sifat jalan).

      var street = "", block = "", prefix = "", number = "", gang = "", m;

      // P1: BLK/BLOK diikuti nomor TANPA kode blok sesudahnya (mis. "JOHAR III BLK NO. 41").
      // BUKAN blok berkode: kode blok sejati selalu SESUDAH kata (mis. BLOK A8, KAV 9).
      // BLK di sini noise/penanda gantung; ekor Romawi tetap gang (lihat tail di bawah).
      m = s.match(/^(.*?)[\s]*(?:BLK|BLOK)\b[\s-]*(?:NO(?![A-Z])[\s]*)?([0-9][0-9A-Z-]*)\s*$/);
      if (m) { street = m[1].trim(); number = normNumber(m[2]); explicitBlock = false; }
      // P0: BLK/BLOK/KAV dengan kode blok alfanumerik -> blok
      if (!m) {
        m = s.match(/^(.*?)\s*(?:BLK|BLOK|KAV|KAVLING)\.?\s*(?:NO(?![A-Z])\s*)?([0-9A-Z][0-9A-Z.\-\s]*?)\s*$/);
        if (m) {
          explicitBlock = true;
          var code = m[2].replace(/[\s.]/g, "").replace(/([A-Z])-(\d)/g, "$1$2");
          var split = code.match(/^(.*?)NO([0-9][0-9A-Z-]*)$/);
          if (split) { block = split[1]; number = normNumber(split[2]); }
          else { block = code; }
          if (!number) {
            var inner = m[1].match(/^(.*?)\s+([0-9][0-9A-Z-]*)$/);
            if (inner) { street = inner[1].trim(); number = normNumber(inner[2]); }
            else { street = m[1].trim(); }
          } else { street = m[1].trim(); }
        }
      }
      // P2n: gang BERNAMA bertanda GG/GANG (mis. "GG. MEI/15") -> Gg. Mei
      // Syarat GG eksplisit (tanpa itu tetap gagal = jujur). Nama murni Romawi/angka
      // dikembalikan ke P2 ("GG III/27" -> gang III, bukan "Gg. III").
      if (!m) {
        m = s.match(/^(.*?)\b(?:GG|GANG)\.?\s+((?![IVXLCDM]+\b)(?!\d+\b)[A-Z][A-Z ]*?)\s*\/\s*([0-9][0-9A-Z-,]*)\s*$/);
        if (m) { street = m[1].trim(); gang = m[2].trim(); number = normNumber(m[3]); }
      }
      // P2: angka berslash (mis. "II/11", "4 / 1", "VII-A/46", "5A/27", "II A/10") -> gang (Romawi)
      // (?:\s+|^) sebelum token gang: m1 yang malas dilarang menelan "-" ("11-15/20"
      // harus tetap gagal terparse = jujur, bukan jadi "11 XV No. 20").
      // Sufiks gang DIPERTAHANKAN (baku: "II-A", bukan "II"): 1 huruf + digit opsional,
      // hifen/spasi/nempel ("VII-A", "5A", "II A"); "-15" numerik TIDAK dimakan.
      // WAJIB pendek: "CENDANA" tidak boleh dimakan sebagai "C"+"ENDANA".
      // BUNTU mengikuti gangnya ("II BUNTU/8" -> Gg. II Buntu, bukan "Buntu II").
      if (!m) {
        m = s.match(/^(.*?)(?:\s+|^)([IVXLCDM]+|\d+)((?:-?\s?[A-Z][0-9]?)?)((?:\s+BUNTU)?)\s*\/\s*([0-9][0-9A-Z-,]*)\s*$/);
        if (m) {
          street = m[1].trim();
          var gsuf2 = (m[3] || "").replace(/[\s-]/g, "").toUpperCase();
          var gbun2 = (m[4] || "").trim();
          if (gbun2) { gang = arabicToRoman(romanToArabic(m[2])) + (gsuf2 ? "-" + gsuf2 : "") + " BUNTU"; }
          else { prefix = arabicToRoman(romanToArabic(m[2])) + (gsuf2 ? "-" + gsuf2 : ""); }
          number = normNumber(m[5]);
        }
      }
      // P2b: nomor lalu roman (mis. "PASAR BESAR WETAN 30/I") -> gang (Romawi)
      if (!m) {
        m = s.match(/^(.*?)\s+([0-9][0-9A-Z-,]*)\s*\/\s*([IVXLCDM]+)((?:-?\s?[A-Z][0-9]?)?)\s*$/);
        if (m) {
          street = m[1].trim(); number = normNumber(m[2]);
          var gsuf2b = (m[4] || "").replace(/[\s-]/g, "").toUpperCase();
          prefix = arabicToRoman(romanToArabic(m[3])) + (gsuf2b ? "-" + gsuf2b : "");
        }
      }
      // P3: angka + NO (mis. "II NO. 11", "SULUNG 2 NO. 06-B") -> gang (Romawi)
      if (!m) {
        m = s.match(/^(.*?)\s+([IVXLCDM]+|\d+)((?:-?\s?[A-Z][0-9]?)?)((?:\s+BUNTU)?)\s+NO(?![A-Z])\s*([0-9][0-9A-Z-,]*)\s*$/);
        if (m) {
          street = m[1].trim();
          var gsuf3 = (m[3] || "").replace(/[\s-]/g, "").toUpperCase();
          var gbun3 = (m[4] || "").trim();
          if (gbun3) { gang = arabicToRoman(romanToArabic(m[2])) + (gsuf3 ? "-" + gsuf3 : "") + " BUNTU"; }
          else { prefix = arabicToRoman(romanToArabic(m[2])) + (gsuf3 ? "-" + gsuf3 : ""); }
          number = normNumber(m[5]);
        }
      }
      // P4: NO + nomor (mis. "NO. 65-A", "NO.I")
      if (!m) {
        m = s.match(/^(.*?)\s*NO(?![A-Z])\s*([0-9][0-9A-Z-,]*|[IVXLCDM]+)\s*$/);
        if (m) { street = m[1].trim(); number = normNumber(m[2]); }
      }
      // P5: nomor di akhir tanpa NO (mis. "SULUNG 65-A")
      if (!m) {
        m = s.match(/^(.*?)\s+([0-9][0-9A-Z-,]*)\s*$/);
        if (m) { street = m[1].trim(); number = normNumber(m[2]); }
      }
      if (!m) street = s;

      // P6: kode unit bergaya "H16-02" (mis. apartemen)
      if (!number) {
        var um = s.match(/\b([A-Z]{1,4}[0-9]+(?:-[0-9A-Z]+)*)\b/);
        if (um) { number = normNumber(um[1]); street = street.replace(um[1], " "); }
      }

      // Gang bernama bertanda GG/GANG sisa pola NO/tanpa-NO (mis. "GG MEI 4B"):
      // diekstrak di sini SEBELUM kata GG dibuang pembersih di bawah.
      // Tanpa tanda GG eksplisit: biarkan (jujur).
      if (!gang) {
        var gm = street.match(/^(.*?)\b(?:GG|GANG)\s+([A-Z]+(?:\s+[A-Z]+)*)\s*$/);
        if (gm) {
          var gname = gm[2].replace(/ /g, "");
          if (!/^(?:[IVXLCDM]+|\d+)$/.test(gname)) { street = gm[1].trim(); gang = gm[2]; }
        }
      }

      // Bersihkan kata sisa dari nama jalan
      street = street
        .replace(/\b(JALAN|JL|JLN|GG|GANG|BLK|BLOK|KAV|KAVLING|NO)\b/g, " ")
        .replace(/[\/-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      // Angka yang menempel di ujung nama jalan (mis. "JOHAR III")
      // BUKAN nama daerah, melainkan cara penomoran bekerja: gang ditulis Romawi.
      // Pengaman: angka desimal > 50 (kode unit apartemen, tahun, dsb) JANGAN
      // diromawikan jadi gang ("1911" -> "MCMXI"); biarkan di nama jalan, Lapis 4 yang menilai.
      if (!block && !prefix) {
        var bm = street.match(/^(.*?)\s+([IVXLCDM]+|\d+)$/);
        if (bm) {
          var tailNum = /^\d+$/.test(bm[2]) ? parseInt(bm[2], 10) : null;
          if (tailNum !== null && tailNum > 50) {
            street = street.replace(/\s+/g, " ").trim();   // biarkan apa adanya
          } else {
            street = bm[1].trim();
            if (explicitBlock) block = romanToArabic(bm[2]);
            else prefix = arabicToRoman(romanToArabic(bm[2]));   // gang -> Romawi
          }
        }
      }

      // Hapus kata berulang (kecuali kata ulang sah)
      var seen = new Set();
      street = street.split(" ").filter(function (w) {
        if (!w) return false;
        if (dedupeExempt.has(w)) return true;
        if (seen.has(w)) return false;
        seen.add(w);
        return true;
      }).join(" ");

      if (belakang && street) street = street + " BELAKANG";

      // Rusun: hanya jika profil mendefinisikannya
      if (isRusun && P.rusun) {
        var rb = (rusunBlockRe ? s.match(rusunBlockRe) : null) || s.match(/\b([IVXLCDM]{1,4})\b/);
        var nm = s.match(/\bNO(?![A-Z])\s*([0-9][0-9A-Z-]*)/);
        street = P.rusun.canonical || street;
        block = rb ? romanToArabic(rb[1]) : "";
        prefix = "";
        number = nm ? normNumber(nm[1]) : "";
      }

      // Jalan yang memang memakai sistem Blok (mis. area ruko)
      if (prefix && blocklistSet.has(street.toUpperCase())) { block = prefix; prefix = ""; }

      return { street: street, block: block, prefix: prefix, number: number, gang: gang, dangling: dangling };
    }

    // Bentuk alamat baku final: Jl. <Jalan> [Blok <B>] [Gg. <N>] [gang] [No. <N>]
    function standardizeAddress(raw, synonyms) {
      var dict = synonyms || {};
      var p = parseAddress(raw);
      var street = p.street;
      var upper = street.toUpperCase();
      if (dict[upper]) street = dict[upper];

      if (!street && !p.number && !p.block && !p.prefix && !p.gang) return "";
      if (!street) street = "TANPA NAMA JALAN";

      var out = "Jl. " + titleCaseStreet(street);
      if (p.block) out += " Blok " + p.block;
      if (p.gang) out += " Gg. " + gangTitle(p.gang);
      if (p.prefix) out += " " + p.prefix;
      if (p.number) out += " No. " + p.number;
      return out;
    }

    return {
      ALGORITHM_VERSION: ALGORITHM_VERSION,
      profile: P,
      standardizeAddress: standardizeAddress,
      parseAddress: parseAddress,
      cleanAddressRaw: cleanAddressRaw,
      titleCaseStreet: titleCaseStreet
    };
  }

  // Instance default (profil dasar/universal saja)
  var defaultInstance = createNormalizer(null);

  return {
    ALGORITHM_VERSION: ALGORITHM_VERSION,
    BASE_PROFILE: BASE_PROFILE,
    mergeProfiles: mergeProfiles,
    createNormalizer: createNormalizer,
    // Pintasan memakai profil dasar
    standardizeAddress: function (raw, synonyms) { return defaultInstance.standardizeAddress(raw, synonyms); },
    parseAddress: function (raw) { return defaultInstance.parseAddress(raw); },
    cleanAddressRaw: function (raw) { return defaultInstance.cleanAddressRaw(raw); },
    normNumber: normNumber,
    romanToArabic: romanToArabic,
    arabicToRoman: arabicToRoman
  };
});
