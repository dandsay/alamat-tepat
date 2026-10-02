/*
 * AlamatTepat — confidence.js (LAPIS 4: kejujuran)
 * Nilai keyakinan per pintu + alasan, supaya yang sulit tampil apa adanya
 * dan diprioritaskan ke manusia — bukan dipaksa ikut pola.
 *
 * Murni + deterministik (aritmetika frekuensi/sinyal saja) => bisa diuji.
 * TIDAK menyentuh normalizer.js (SHA tetap).
 *
 * Skor mulai 100, dikurangi per sinyal; label:
 *   YAKIN >= 85 | PERIKSA 60-84 | RAGU < 60
 *
 * Lisensi: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();             // Node / CommonJS
  } else {
    root.AlamatTepatConfidence = factory(); // Browser (classic script)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CONFIDENCE_VERSION = "0.1.0";

  var APART_KEYWORDS = ["APARTEMEN", "APARTEMENT", "APT", "TOWER", "UNIT", "BLOK", "KONDOMINIUM"];
  var INSTITUTION_KEYWORDS = ["ASRAMA", "MESS", "RUSUN", "KOS", "KONTRAKAN", "PANTI", "SEKOLAH", "KAMPUS", "KANTOR", "PABRIK", "GUDANG", "MASJID", "GEREJA", "PASAR", "MALL", "RUKO"];

  function hasAny(hay, list) {
    for (var i = 0; i < list.length; i++) {
      if (hay.indexOf(list[i]) !== -1) return list[i];
    }
    return null;
  }

  // feats: { std (alamat baku), raws (array varian mentah UPPER), kkCount,
  //          fuzzyApplied (bool), manualMerged (bool) }
  function scoreDoor(feats) {
    var f = feats || {};
    var std = String(f.std || "").toUpperCase();
    var raws = (f.raws || []).map(function (r) { return String(r || "").toUpperCase(); });
    var joined = raws.join(" | ");
    var reasons = [];
    var score = 100;

    // Nomor tak terparse = sinyal paling merah (mesin buta: rumah ke berapa?)
    if (std.indexOf("NO.") === -1) {
      score -= 40;
      reasons.push("nomor tak terparse");
    }

    // Sisa angka di nama jalan (mis. kode unit yang lolos)
    var streetPart = std.split("NO.")[0];
    if (/\d/.test(streetPart)) {
      score -= 25;
      reasons.push("nama jalan kecampur angka");
    }

    // Apartemen: penulisan paling seenaknya, jangan dipaksa
    var apartHit = hasAny(joined, APART_KEYWORDS);
    if (apartHit) {
      score -= 20;
      reasons.push("apartemen/unit (" + apartHit + ") — butuh manusia");
    }

    // Institusi/asrama tanpa nomor: sering memang tak bernomor
    var instHit = hasAny(joined, INSTITUTION_KEYWORDS);
    if (instHit && std.indexOf("NO.") === -1) {
      score -= 10;
      reasons.push("institusi (" + instHit + ")");
    }

    // Banyak varian mentah = alamat ditulis orang dengan banyak cara
    var variantCount = raws.length;
    if (variantCount > 3) {
      score -= 15;
      reasons.push(variantCount + " varian mentah");
    } else if (variantCount > 1) {
      score -= 5;
      reasons.push(variantCount + " varian mentah");
    }

    // Nama jalan sangat panjang = kemungkinan gabungan dua nama/ekor
    var words = streetPart.replace(/^JL\.\s*/, "").split(" ").filter(Boolean);
    if (words.length > 5) {
      score -= 10;
      reasons.push("nama jalan panjang (" + words.length + " kata)");
    }

    // Kamus manusia sudah turun tangan = tambah percaya
    if (f.fuzzyApplied || f.manualMerged) {
      score += 10;
      reasons.push("sudah dikoreksi manusia");
    }

    if (score > 100) score = 100;
    if (score < 0) score = 0;

    var label = score >= 85 ? "YAKIN" : (score >= 60 ? "PERIKSA" : "RAGU");
    return { score: score, label: label, reasons: reasons };
  }

  return {
    CONFIDENCE_VERSION: CONFIDENCE_VERSION,
    scoreDoor: scoreDoor
  };
});
