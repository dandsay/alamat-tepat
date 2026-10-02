/*
 * AlamatTepat — fuzzy.js (LAPIS 2)
 * Saran typo nama jalan via embedding karakter lokal (murni teks, tanpa server).
 *
 * - Tiap nama jalan = titik di ruang vektor bigram+trigram (binary, L2-normalized).
 * - Kedekatan = hybrid: 0.5 * cosine + 0.5 * edit-similarity (Damerau).
 * - Dictionary = frekuensi nama jalan hasil bersih pola tahap awal (dihitung pemanggil).
 * - Murni + deterministik => bisa diuji. TIDAK menyentuh normalizer.js (SHA tetap).
 *
 * Lisensi: GPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();             // Node / CommonJS
  } else {
    root.AlamatTepatFuzzy = factory();      // Browser (classic script)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FUZZY_VERSION = "0.1.0";
  var DEFAULT_THRESHOLD = 0.80;
  var MIN_STREET_LEN = 4;

  // Normalisasi ringan sebelum di-embed: uppercase, spasi tunggal.
  function norm(s) {
    return String(s == null ? "" : s).toUpperCase().replace(/[\s-]+/g, " ").trim();
  }

  // N-gram karakter dengan padding # di ujung (menangkap prefix/suffix).
  function ngrams(s, n) {
    var t = "#" + norm(s).replace(/ /g, "#") + "#";
    var out = [];
    for (var i = 0; i + n <= t.length; i++) out.push(t.slice(i, i + n));
    return out;
  }

  // Embed -> { terms: {gram: 1}, norm } (binary + L2 norm).
  function embed(s) {
    var terms = {};
    var grams = ngrams(s, 2).concat(ngrams(s, 3));
    for (var i = 0; i < grams.length; i++) terms[grams[i]] = 1;
    var sum = 0;
    for (var k in terms) sum += 1;
    return { terms: terms, norm: Math.sqrt(sum) || 1 };
  }

  function cosine(ea, eb) {
    var dot = 0;
    var a = ea.terms, b = eb.terms;
    // Iterasi sisi yang lebih kecil.
    var keysA = Object.keys(a), keysB = Object.keys(b);
    var small = keysA.length <= keysB.length ? a : b;
    var big = small === a ? b : a;
    for (var k in small) if (big[k]) dot += 1;
    return dot / (ea.norm * eb.norm || 1);
  }

  // Damerau-Levenshtein (dengan transposisi bersebelahan).
  function damerau(a, b) {
    a = norm(a); b = norm(b);
    var la = a.length, lb = b.length;
    if (a === b) return 0;
    if (!la) return lb;
    if (!lb) return la;
    var INF = la + lb;
    var d = [];
    for (var i = 0; i <= la + 1; i++) { d[i] = []; for (var j = 0; j <= lb + 1; j++) d[i][j] = 0; }
    d[0][0] = INF;
    for (i = 0; i <= la; i++) { d[i + 1][0] = INF; d[i + 1][1] = i; }
    for (j = 0; j <= lb; j++) { d[0][j + 1] = INF; d[1][j + 1] = j; }
    var last = {};
    for (i = 1; i <= la; i++) {
      var db = 0;
      for (j = 1; j <= lb; j++) {
        var i1 = last[b[j - 1]] || 0;
        var j1 = db;
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        if (cost === 0) db = j;
        d[i + 1][j + 1] = Math.min(
          d[i][j] + cost,          // substitusi
          d[i + 1][j] + 1,        // insersi
          d[i][j + 1] + 1,        // delesi
          d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1) // transposisi
        );
      }
      last[a[i - 1]] = i;
    }
    return d[la + 1][lb + 1];
  }

  function editSimilarity(a, b) {
    var na = norm(a), nb = norm(b);
    var m = Math.max(na.length, nb.length);
    if (!m) return 1;
    return 1 - damerau(na, nb) / m;
  }

  // Skor gabungan + rincian (buat ditampilkan di Audit).
  function scorePair(a, b) {
    var cos = cosine(embed(a), embed(b));
    var ed = editSimilarity(a, b);
    return { score: 0.5 * cos + 0.5 * ed, cos: cos, edit: ed, dist: damerau(a, b) };
  }

  // streetCounts: { "KEPATIHAN": 40, "KEPATIAN": 2, ... } (UPPER).
  // known: kamus sinonim yang sudah ada (dilompati). Opsi: threshold, limit.
  function suggest(streetCounts, known, opts) {
    var o = opts || {};
    var threshold = typeof o.threshold === "number" ? o.threshold : DEFAULT_THRESHOLD;
    var limit = typeof o.limit === "number" ? o.limit : 50;
    known = known || {};

    var names = Object.keys(streetCounts || {}).filter(function (n) {
      return n && norm(n).replace(/#/g, "").length >= MIN_STREET_LEN;
    });
    // Jangkar populer dulu.
    names.sort(function (x, y) { return (streetCounts[y] || 0) - (streetCounts[x] || 0); });

    var embeds = {};
    names.forEach(function (n) { embeds[n] = embed(n); });

    var out = [];
    var seen = {};
    for (var i = 0; i < names.length; i++) {
      for (var j = 0; j < i; j++) {
        var rare = names[i], anchor = names[j];
        if ((streetCounts[rare] || 0) >= (streetCounts[anchor] || 0)) continue;
        if (known[rare]) continue;
        var key = rare + "=>" + anchor;
        if (seen[key]) continue;
        seen[key] = 1;
        // Blocking cepat: 2 huruf depan sama + selisih panjang <= 3.
        var nr = norm(rare), na = norm(anchor);
        if (nr.slice(0, 2) !== na.slice(0, 2)) continue;
        if (Math.abs(nr.length - na.length) > 3) continue;
        var cos = cosine(embeds[rare], embeds[anchor]);
        if (cos < 0.45) continue;   // pra-saring murah sebelum Damerau (O(n*m))
        var ed = editSimilarity(rare, anchor);
        var s = 0.5 * cos + 0.5 * ed;
        if (s >= threshold) {
          out.push({
            variant: rare, target: anchor,
            score: Math.round(s * 100) / 100,
            cos: Math.round(cos * 100) / 100,
            edit: Math.round(ed * 100) / 100,
            dist: damerau(rare, anchor),
            countVariant: streetCounts[rare] || 0,
            countTarget: streetCounts[anchor] || 0
          });
        }
      }
    }
    out.sort(function (x, y) { return y.score - x.score; });
    return out.slice(0, limit);
  }

  return {
    FUZZY_VERSION: FUZZY_VERSION,
    DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
    norm: norm,
    ngrams: ngrams,
    embed: embed,
    cosine: cosine,
    damerau: damerau,
    editSimilarity: editSimilarity,
    scorePair: scorePair,
    suggest: suggest
  };
});
