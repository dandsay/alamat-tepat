/*
 * AlamatTepat — relational.js (LAPIS 3: relasional berstatistik)
 *
 * Tugas: MENIMBANG, bukan menebak. Untuk pintu yang varian mentahnya memuat
 * penanda menggantung (dicatat L1 di parseAddress.dangling), Lapis 3 memeriksa
 * statistik tetangga se-RW lalu memvonis — HANYA bila bukti cukup:
 *
 *   MERGE_OK : kembaran polos (tanpa penanda) ada di pintu yang sama,
 *              dan TIDAK ADA blok berkode di jalan yang sama se-RW.
 *              Artinya: penanda itu noise, penggabungan sah. (+5 keyakinan)
 *   SOLO     : tak ada kembaran polos maupun blok berkode. Parse L1
 *              menyelamatkan nomor; pintu berdiri sendiri beralasan. (+0)
 *   TWIN_RT  : info tambahan — std sama beda RT (lintas RT). (+0)
 *   ABSTAIN  : ada blok berkode sejalan (penanda mungkin bermakna) atau
 *              data kurang. Menyerah ke manusia. (+0)
 *
 * Murni + deterministik (aritmetika hitungan) => bisa diuji.
 * Parameter bukti via opts (aturan main terbuka, bukan hardcode mati).
 * TIDAK menyentuh normalizer.js.
 *
 * Lisensi: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();             // Node / CommonJS
  } else {
    root.AlamatTepatRelational = factory(); // Browser (classic script)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RELATIONAL_VERSION = "0.1.0";

  // Parameter Matematika bukti (bisa dioverride via opts).
  var DEFAULTS = {
    minPlain: 1,     // kembaran polos minimal untuk MERGE_OK
    maxCoded: 0,     // blok berkode maksimal yang ditoleransi
    bonusMerge: 5,   // +++ keyakinan bila bukti mendukung
  };

  // ctx: { parseRaw(raw)->{street,dangling}, stdOf(door)->string,
  //        streetOf(std)->string, plainInDoor(door)->n, danglingInDoor(door)->n,
  //        codedOnStreet(rw, street)->n, twinRt(std, rw, rt)->[rt...] }
  // Dibuat oleh pemanggil (store) supaya modul ini tetap murni.
  function analyzeDoor(door, ctx, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var none = { verdict: "ABSTAIN", support: 0, against: 0, reason: "", adjust: 0 };

    var danglingN = ctx.danglingInDoor(door);
    if (!danglingN) return none;

    var plain = ctx.plainInDoor(door);
    var street = ctx.streetOf(door.std);
    var coded = ctx.codedOnStreet(door.rw, street);
    var twins = ctx.twinRt(door.std, door.rw, door.rt);

    var info = twins.length ? `; kembaran lintas RT: ${twins.join("/")}` : "";

    if (coded > o.maxCoded) {
      return {
        verdict: "ABSTAIN", support: plain, against: coded,
        reason: `penanda menggantung tapi ada ${coded} blok berkode di ${street} — butuh manusia${info}`,
        adjust: 0
      };
    }
    if (plain >= o.minPlain) {
      return {
        verdict: "MERGE_OK", support: plain, against: coded,
        reason: `penanda menggantung didukung ${plain} kembaran polos, tanpa blok berkode${info}`,
        adjust: o.bonusMerge
      };
    }
    return {
      verdict: "SOLO", support: plain, against: coded,
      reason: `penanda menggantung tanpa kembaran — pintu sendiri beralasan${info}`,
      adjust: 0
    };
  }

  return {
    RELATIONAL_VERSION: RELATIONAL_VERSION,
    DEFAULTS: DEFAULTS,
    analyzeDoor: analyzeDoor
  };
});
