# Microservice AlamatTepat

Bungkus HTTP tipis di atas engine. Tanpa dependensi — hanya `node:http`.
Jalankan di VPS mana pun dengan Node ≥ 18.

## Jalankan lokal

```bash
node service/server.mjs --port 3000
curl -s localhost:3000/health
curl -s -X POST localhost:3000/v1/standardize \
  -H 'Content-Type: application/json' \
  -d '{"address":"TAMBAK BAYAN 4 NO.4"}'
curl -s -X POST localhost:3000/v1/standardize/batch \
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

## Deploy ke VPS (systemd + Caddy untuk TLS)

```bash
# di VPS: salin repo, lalu
sudo tee /etc/systemd/system/alamat-tepat.service > /dev/null <<'EOF'
[Unit]
Description=Microservice AlamatTepat
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/alamat-tepat
ExecStart=/usr/bin/node service/server.mjs --port 3000
Restart=always
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now alamat-tepat
```

```caddyfile
# /etc/caddy/Caddyfile — ganti dengan domain Anda
api.alamatcontoh.id {
    reverse_proxy 127.0.0.1:3000
}
```

Kebutuhan VPS: Linux apa pun + Node ≥ 18, RAM ±50 MB. Service bind ke
`127.0.0.1` — hanya reverse proxy yang boleh meneruskannya ke publik.
Buka firewall hanya 80/443.
