# Arie Finance Tracker

Dashboard tagihan, cicilan, pemasukan, alokasi, dan aset keluarga, dilindungi PIN.

```
apps/
  api/   NestJS + Prisma → TiDB Serverless (MySQL)
  web/   Next.js 15 (App Router)
```

Browser hanya memanggil `/api/*` di domain web. Next.js meneruskannya ke API NestJS (rewrite), jadi cookie sesi tetap satu domain dan tidak perlu CORS.

```
Browser ──► web (Vercel) ──/api/*──► api (Vercel function) ──► TiDB
```

## Cara kerja PIN

- Petunjuk PIN di layar masuk diisi saat membuat PIN dan disimpan di database (tidak ada di kode). Bisa diganti saat mengganti PIN.
- PIN 4–8 angka. Pemisah seperti `12-05-2020` atau `12/05/2020` otomatis dibaca sebagai `12052020`.
- PIN disimpan sebagai hash bcrypt, bukan teks asli.
- Salah 5 kali → akses dikunci 15 menit (disimpan di database, jadi berlaku di semua perangkat).
- Sesi berlaku 30 hari (cookie httpOnly).
- **Buat PIN**: hanya bisa sekali, saat database belum punya PIN, dan butuh `SETUP_KEY`.
- **Ganti PIN** (`/pin`): butuh PIN lama. Semua perangkat lain otomatis keluar.
- **Lupa PIN** (`/pin?tab=reset`): buat PIN baru memakai `SETUP_KEY`.

## 1. Siapkan TiDB

1. Buat cluster **TiDB Serverless** di tidbcloud.com (region Singapore paling dekat).
2. Buat database, misalnya `finance`.
3. **Connect** → pilih **Prisma** → salin connection string. Pastikan berakhiran `?sslaccept=strict`.

## 2. Buat tabel dan isi data awal (sekali, dari laptop)

```bash
cd apps/api
cp .env.example .env      # isi DATABASE_URL, JWT_SECRET, SETUP_KEY
npm install
npm run db:push           # membuat tabel
npm run db:seed           # isi data awal
```

Buat secret acak dengan `openssl rand -base64 48`.

`db:seed` memakai `prisma/seed-data.json` kalau file itu ada (data pribadimu, sudah di-`.gitignore`). Kalau tidak ada, yang dipakai `seed-data.example.json` berisi data contoh.

## 3. Deploy API ke Vercel

1. Push repo ke GitHub.
2. Vercel → **Add New Project** → pilih repo → **Root Directory: `apps/api`**. Framework: **Other**.
3. Environment variables:

| Nama | Isi |
|---|---|
| `DATABASE_URL` | connection string TiDB |
| `JWT_SECRET` | string acak ≥ 32 karakter |
| `SETUP_KEY` | kunci untuk buat PIN pertama dan reset kalau lupa |
| `CRON_SECRET` | opsional, untuk update harga emas otomatis |

4. Deploy, lalu cek `https://<api>.vercel.app/health` → `{"ok":true}`.

## 4. Deploy web ke Vercel

1. **Add New Project** lagi dari repo yang sama → **Root Directory: `apps/web`**. Framework: Next.js.
2. Environment variable: `API_URL` = URL API dari langkah 3 (tanpa `/` di akhir).
3. Deploy, buka URL web → layar **Buat PIN** muncul → isi PIN + `SETUP_KEY`.

## Upload tagihan kartu kredit (PDF)

Menu **⋯ → Upload tagihan PDF** atau tombol **Upload PDF** di panel tagihan.

- PDF dibaca di browser dengan pdf.js. File dan password-nya tidak dikirim ke server; yang dikirim hanya baris yang disimpan.
- Parser sudah diuji untuk **Mandiri** dan **BCA**. **Jenius** memakai pembaca umum (belum ada contoh), jadi cek setiap baris sebelum menyimpan.
- Bulan tujuan default = bulan jatuh tempo statement.
- Setiap baris dicocokkan dengan tagihan bank yang sama di bulan itu: **sudah ada** (dilewati), **ubah nominal** (nominal khusus bulan itu), atau **baru** (cicilan `KE x DARI y` / `x/y` otomatis jadi cicilan dengan sisa bulan yang benar).
- Pembayaran, pembatalan (mis. "Convert to IPP"), dan baris Rp0 dilewati.

## Alokasi yang menambah aset

Di form alokasi / tabungan ada pilihan **Masuk ke aset** (hanya aset bersatuan Rupiah). Saat alokasi itu dicentang di suatu bulan, server menambahkan nominal bulan itu ke nilai aset; lepas centang mengurangkannya lagi. Untuk aset dengan "setoran rutin otomatis" (mis. haji), estimasi otomatis berhenti di bulan sebelum alokasi yang tertaut mulai, supaya tidak terhitung dua kali.

Setelah update yang menambah kolom database (mis. kolom `place` di aset), jalankan lagi dari laptop:

```bash
cd apps/api && npx prisma db push
```

## Development lokal

```bash
# terminal 1
cd apps/api && npm run dev          # http://localhost:4000

# terminal 2
cd apps/web && npm install
API_URL=http://localhost:4000 npm run dev   # http://localhost:3000
```

## Update harga emas otomatis (opsional)

API punya endpoint tanpa PIN yang dijaga `CRON_SECRET`:

```bash
curl -X POST https://<api>.vercel.app/gold-price \
  -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" \
  -d '{"price": 2286000, "priceDate": "2026-11-02", "priceSource": "buyback Antam"}'
```

Endpoint ini mengubah harga semua aset bersatuan gram. Bisa dipanggil dari scheduled job mana pun yang mengambil harga buyback Antam harian.

## Endpoint API

| Method | Path | Keterangan |
|---|---|---|
| GET | `/auth/status` | punya PIN?, petunjuk, sudah masuk? |
| POST | `/auth/setup` | `{pin, hint?, setupKey}` |
| POST | `/auth/login` | `{pin}` |
| POST | `/auth/change` | `{oldPin, newPin, hint?}` |
| POST | `/auth/reset` | `{setupKey, newPin, hint?}` |
| POST | `/auth/logout` | |
| GET | `/finance` | semua data (butuh sesi) |
| POST/PUT/DELETE | `/entries[/:id]` | tagihan, pemasukan, alokasi |
| PUT | `/months/:YYYY-MM` | `{paid, amt}` status bayar dan nominal khusus bulan |
| POST/PUT/DELETE | `/holdings[/:id]` | aset |
| PUT | `/settings` | `{threshold}` batas cicilan baru |
| POST | `/gold-price` | header `x-cron-secret` |
