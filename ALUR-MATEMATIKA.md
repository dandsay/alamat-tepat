# Alur Mesin AlamatTepat dalam Notasi Matematika

> Catatan baca: buka file ini di GitHub (tampilan web) agar rumus ter-render.
> Simbol dijaga konsisten dari atas sampai bawah.

## Konvensi

- $\Sigma$ = alfabet huruf besar + digit + spasi + tanda baca. Masukan $x \in \Sigma^*$.
- Profil $P = (C, Prov, M, K, A, D, B, T)$ = himpunan kota, provinsi, penanda
  wilayah, nama kelurahan, alias, kata-ulang-sah, jalan-berblok, dan tabel
  override kapitalisasi. **Semua nama daerah hanya muncul di $P$, tidak pernah
  di rumus.**

## L1 — Pola (fungsi total deterministik)

**Pembersihan** $C: \Sigma^* \to \Sigma^*$ adalah komposisi fungsi hapus:

$$C = \text{trim} \circ \text{dedup} \circ \text{noise} \circ \text{upper}$$

dengan $\text{dedup}$ menjaga token terakhir $t_n$ bila ia angka/Romawi:

$$\text{dedup}(t_1\ldots t_n) =
\begin{cases}
t_1\ldots t_{n-1}, & t_n \notin \mathcal{N} \land t_n \notin D \land t_n \in \{t_1..t_{n-1}\} \\
t_1\ldots t_n, & \text{sebaliknya}
\end{cases}$$

$\mathcal{N} = \{\text{angka, Romawi, ``/''}\}$, $D$ = kata ulang sah.
Inilah yang menyelamatkan `4 NO 4` dan `1 / 1` dari pemotongan gema.

**Kanonical gang.** $\rho: \text{Romawi} \to \mathbb{N}$ (nilai),
$\alpha: \mathbb{N} \to \text{Romawi}$ (bentuk baku). Setiap gang dinormalkan
lewat $g^* = \alpha(\rho(g))$ — jadi `4`, `IV`, `iv` semuanya runtuh ke titik
tetap yang sama: $\alpha(\rho(\cdot)) =$ **`IV`**. Normalisasi nomor $\nu$
melakukan hal analog (Romawi→digit, kupas nol depan, `65-A`→`65A`).

**Penguraian** = kaskade pola berprioritas (cocok-pertama-menang, seperti PEG):

$$\text{parse}(s) = P_1(s) \;\triangleright\; P_0(s) \;\triangleright\; P_2(s) \;\triangleright\; P_{2b}(s) \;\triangleright\; P_3(s) \;\triangleright\; P_4(s) \;\triangleright\; P_5(s)$$

tiap $P_i$ pencocokan regex yang menghasilkan tupel terstruktur:

$$(street,\ block,\ prefix,\ gang,\ number,\ dangling) \in (\Sigma^*)^6$$

dengan makna: $block$ = blok berkode (kode **sesudah** kata BLK),
$prefix$ = gang angka, $gang$ = gang bernama, $number$ = nomor rumah.
Ekor Romawi jalan diflip jadi gang lewat $g^*$, **kecuali** ada penanda blok
berkode eksplisit.

**Pembakuan** $\Phi$ = title-case per kata + perakitan:

$$\Phi = \text{``Jl. ''} + \tau(street)\; [+\text{`` Blok ''}+block]\; [+prefix]\; [+\text{`` Gg. ''}+gang]\; [+\text{`` No. ''}+number]$$

Contoh lengkap: $x =$ `TAMBAK BAYAN 4 NO.4` → $C(x) =$ `TAMBAK BAYAN 4 NO 4`
→ $P_3$ cocok $(street{=}\text{TAMBAK BAYAN},\ prefix{=}\alpha(\rho(4)){=}\text{IV},\ number{=}\nu(4){=}4)$
→ $\Phi =$ **`Jl. Tambak Bayan IV No. 4`**.

## L2 — Fuzzy (ruang vektor + jarak edit)

Setiap nama jalan $s$ ditanam ke ruang biner $E(s) \in \{0,1\}^d$ atas kosakata
bigram+trigram karakter. Kedekatan dua nama:

$$s(a,b) = \tfrac{1}{2}\underbrace{\cos(E(a),E(b))}_{\text{kemiripan bentuk}} + \tfrac{1}{2}\underbrace{\left(1 - \frac{d_D(a,b)}{\max(|a|,|b|)}\right)}_{\text{kemiripan edit (Damerau)}}$$

$d_D$ = jarak Damerau–Levenshtein (substitusi/insersi/delesi/transposisi).
Saran diterima bila $s \ge \tau = 0{,}80$ (pra-saring murah $\cos \ge 0{,}45$
dulu), lalu gerbang bukti otomatis yang lebih ketat:

$$s \ge 0{,}85 \land \text{freq(target)} \ge 5 \land \frac{\text{freq(target)}}{\text{freq(varian)}} \ge 3 \land \text{digit sama}$$

Contoh: $s(\text{KEPATIAN}, \text{KEPATIHAN}) \approx 0{,}83$ → lolos sebagai
saran, $s(\text{SULUNG}, \text{MAWAR}) = 0$ → ditolak.

## L3 — Relasional (statistik per pintu)

Untuk tiap pintu (semua varian mentah yang bakunya sama), hitung tiga bilangan
cacah dari tetangganya:

$$n_d = \text{varian berpenanda gantung},\quad n_p = \text{kembaran polos},\quad n_c = \text{blok berkode se-jalan}$$

Fungsi putusan dengan ambang $(minPlain{=}1,\ maxCoded{=}0)$:

$$\text{vonis} =
\begin{cases}
\text{MERGE\_OK}\ (+5), & n_c = 0 \land n_p \ge 1 \quad\text{(penanda = noise terbukti)}\\
\text{SOLO}\ (+0), & n_c = 0 \land n_p = 0 \quad\text{(berdiri sendiri beralasan)}\\
\text{ABSTAIN}\ (+0), & n_c > 0 \lor \text{data kurang} \quad\text{(serahkan ke manusia)}
\end{cases}$$

Prinsipnya: **salah gabung lebih mahal dari tidak gabung** — ambang longgar
ke arah abstain.

## L4 — Kejujuran (skor aditif terbatas)

$$S = \text{klip}_{[0,100]}\left(100 - \sum \text{penalti} + \text{bonus}\right)$$

penalti: tanpa `No.` $-40$, angka nyasar di nama jalan $-25$, apartemen $-20$,
institusi-tanpa-nomor $-10$, varian $>3$ buah $-15$ ($>1$ buah $-5$), nama jalan
$>5$ kata $-10$; bonus koreksi manusia $+10$, relasional $+5$. Label:

$$\text{label}(S) =
\begin{cases}
\text{YAKIN}, & S \ge 85 \\
\text{PERIKSA}, & 60 \le S < 85 \\
\text{RAGU}, & S < 60
\end{cases}$$

`TAMBAK BAYAN 4 NO.4` → $S = 100$ → **YAKIN**; `SULUNG 11-15/20` →
`Jl. Sulung 11 15 XX` dengan $S$ rendah → **RAGU + alasan**, tampil apa adanya.

## Ujung-ke-ujung dalam satu baris

$$f(x) = \Phi(\text{parse}(C(x))), \qquad \text{lalu agregasi per pintu} \to (s_{\text{L2}},\ \text{vonis}_{\text{L3}},\ S_{\text{L4}})$$

Determinisme total: $f$ murni (tanpa acak/network/waktu), jadi
$x_1 = x_2 \Rightarrow f(x_1) = f(x_2)$ — selalu. Itulah yang membuat 81 golden
\+ 47 audit bisa mengunci perilaku mesin lewat SHA-256.
