// ===================================================================
// GERBANG MODEL BEKU (server freezeBE)  (tests/beku.test.mjs)
// ===================================================================
// Memanggil mesin klien `beku.mjs` yang memverifikasi model ke server
// freezeBE. Model berbeda dari baseline server -> uji GAGAL -> gate merah
// -> git hook memblokir commit.
//
// Di-skip otomatis bila belum ada model terdaftar (model.freeze.json kosong),
// supaya proyek baru bisa dikembangkan dulu.
//
// Perubahan model disengaja: npm run freeze:accept -- --reason="..."
// ===================================================================
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MESIN = resolve(ROOT, "beku.mjs");
const CONFIG = resolve(ROOT, "beku.config.json");
const MODEL = resolve(ROOT, "model.freeze.json");

function adaItemModel() {
  try {
    const m = JSON.parse(readFileSync(MODEL, "utf8"));
    return Array.isArray(m.files) && m.files.length > 0;
  } catch {
    return false;
  }
}

test(
  "BEKU: model cocok baseline server (gerbang wajib)",
  { skip: !(existsSync(MESIN) && existsSync(CONFIG) && adaItemModel()) },
  () => {
    try {
      const out = execFileSync("node", [MESIN, "check"], { cwd: ROOT, encoding: "utf8", env: process.env });
      assert.match(out, /BEKU OK/);
    } catch (err) {
      assert.fail(
        String(err.stdout || "") + String(err.stderr || "") +
        '\nGerbang beku server menolak. Bila disengaja: npm run freeze:accept -- --reason="..."',
      );
    }
  },
);
