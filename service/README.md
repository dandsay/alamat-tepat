# Microservice AlamatTepat

Bungkus HTTP tipis di atas engine. Tanpa dependensi — hanya `node:http`.
Jalankan di VPS mana pun dengan Node ≥ 18.

## Jalankan lokal

```bash
node service/server.mjs --port 8087
curl -s localhost:8087/health
curl -s -X POST localhost:8087/v1/standardize \
  -H 'Content-Type: application/json' \
  -d '{"address":"TAMBAK BAYAN 4 NO.4"}'
curl -s -X POST localhost:8087/v1/standardize/batch \
  -H 'Content-Type: application/json' \
  -d '{"addresses":["TAMBAK BAYAN 4 NO.4","JL.JOHAR III BLK NO.41"]}'
```

## API

- `GET /health` → `{ ok, engine, sha }`
- `POST /v1/standardize` `{ address, profile?, synonyms? }`
  → `{ input, baku, parts, confidence }`.
  `profile`: `base` | `generic` | `surabaya` (default `surabaya`).
- `POST /v1/standardize/batch` `{ addresses[], profile?, synonyms? }`
  → `{ results: [{ input, baku }], count, ms }`. Maksimal 10.000 alamat/batch.

Isi request tidak pernah ditulis ke log.

## Deploy ke VPS (systemd + Cloudflare Tunnel)

```bash
# di VPS: salin repo, lalu
sudo tee /etc/systemd/system/alamat-tepat.service > /dev/null <<'EOF'
[Unit]
Description=Microservice AlamatTepat
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/alamat-tepat
ExecStart=/usr/bin/node service/server.mjs --port 8087
Restart=always
Environment=PORT=8087

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now alamat-tepat
```

Tambahkan ingress di tunnel VPS (pola Snowman VPS saat ini — lihat skill `snowman-vps`):

```yaml
# /etc/cloudflared/config.yml — sisipkan sebelum baris catch-all terakhir
  - hostname: api.alamatcontoh.id
    service: http://localhost:8087
```

Terapkan (⚠️ SSH juga lewat tunnel yang sama — jangan sampai memutus diri sendiri):

```bash
systemd-run --no-block systemctl restart cloudflared
```

Kebutuhan VPS: Linux apa pun + Node ≥ 18, RAM ±50 MB. Service bind ke
`127.0.0.1`; tidak perlu membuka port publik apa pun — akses masuk lewat Cloudflare Tunnel (TLS diterminasi di edge Cloudflare, tanpa reverse proxy/TLS lokal).
