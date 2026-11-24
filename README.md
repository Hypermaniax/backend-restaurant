# Backend — Rembuk

API NestJS untuk customer QR, kasir, admin, KDS, dan layar antrian.

## Setup

Dari folder `apps/backend`:

```bash
pnpm install
cp .env.example .env
createdb -U postgres resto
```

Sesuaikan `DATABASE_URL` di `.env` bila perlu.

## Database

```bash
pnpm prisma:generate
pnpm prisma:migrate --name init
pnpm prisma:seed
```

Seed development membuat outlet `Rembuk`, settings, tax rules, counter harian, dan akun staff:

- Admin: `admin@rembuk.local` / `Admin123!`
- Kasir: `kasir@rembuk.local` / `Kasir123!`
- Dapur: `dapur@rembuk.local` / `Kitchen123!`

Ganti kredensial seed sebelum staging atau production.

## Menjalankan

```bash
pnpm start:dev
```

- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/docs`

## Verifikasi

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```

## Upload lokal

Gambar menu disimpan di `uploads/menu/` dan disajikan dari `/uploads/menu/...`. Ukuran maksimal 2 MB, format JPEG/PNG/WebP. Folder dapat diubah lewat `UPLOAD_DIR`.

## Task

Ikuti [`docs/tasks/backend/`](../../docs/tasks/backend/README.md) secara berurutan.
