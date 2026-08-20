# HadirBos — Aplikasi Absensi Karyawan Digital

![HadirBos](https://img.shields.io/badge/HadirBos-v1.0-0ea5e9?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?style=for-the-badge&logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-5-2d3748?style=for-the-badge&logo=prisma)

**HadirBos** adalah aplikasi absensi karyawan berbasis web/mobile yang memungkinkan karyawan melakukan check-in dan check-out mandiri menggunakan smartphone, dilengkapi verifikasi foto selfie, geotagging lokasi GPS, perhitungan keterlambatan & lembur otomatis, serta modul pelaporan dengan export Excel.

---

## Fitur Utama

- **Self Check-in/Check-out** — Absen via kamera selfie + GPS langsung dari browser
- **Verifikasi Lokasi** — Validasi radius kantor menggunakan Haversine formula
- **Perhitungan Otomatis** — Keterlambatan dan lembur dihitung otomatis berdasarkan jadwal kerja
- **Notifikasi Real-time** — Manajer/SPV mendapat notifikasi saat karyawan terlambat, luar radius, atau lembur
- **Koreksi Absen** — Alur permintaan dan persetujuan koreksi absen
- **Laporan & Export** — Filter laporan kehadiran dan export ke Excel (.xlsx)
- **Multi-role** — Admin, Manager, SPV, dan Karyawan dengan akses berbeda
- **Mobile-first** — Desain responsif dengan bottom navigation untuk penggunaan HP

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | SQLite via Prisma ORM |
| Auth | JWT (jose) + httpOnly cookies |
| Camera | react-webcam |
| Export | xlsx |
| Notifications | react-hot-toast |

---

## Struktur Role

| Role | Akses |
|---|---|
| **Admin** | Kelola karyawan, kantor, jadwal kerja, hari libur, semua laporan, koreksi absen |
| **Manager** | Pantau tim/departemen, terima notifikasi, koreksi absen anak buah |
| **SPV** | Pantau tim kecil, terima notifikasi, koreksi absen anak buah |
| **User** | Check-in/out, lihat riwayat pribadi |

---

## Instalasi & Menjalankan

### Prasyarat
- Node.js 18+
- npm

### Langkah

```bash
# Clone repository
git clone https://github.com/kopipes/hadirbos.git
cd hadirbos

# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma db push

# Seed data demo
npm run db:seed

# Jalankan development server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

---

## Akun Demo

| Role | NIK | Password |
|---|---|---|
| Admin | `ADM001` | `admin123` |
| Manager | `MGR001` | `manager123` |
| SPV | `SPV001` | `spv123` |
| Karyawan | `EMP001` | `user123` |

> Login juga bisa menggunakan email atau nomor HP.

---

## Struktur Project

```
src/
├── app/
│   ├── (auth)/login/          # Halaman login
│   ├── (dashboard)/
│   │   ├── dashboard/         # Dashboard utama
│   │   ├── attendance/        # Check-in/out + riwayat
│   │   ├── team/              # Monitoring tim (Manager/SPV/Admin)
│   │   ├── reports/           # Laporan + export Excel
│   │   ├── notifications/     # Notifikasi in-app
│   │   ├── profile/           # Profil karyawan
│   │   └── admin/
│   │       ├── users/         # Kelola karyawan
│   │       ├── offices/       # Lokasi kantor & radius
│   │       ├── holidays/      # Hari libur nasional
│   │       └── work-hours/    # Jadwal kerja
│   └── api/                   # REST API routes
├── components/
│   └── layout/                # Sidebar, TopBar, MobileNav
├── lib/
│   ├── auth.ts                # JWT sign/verify
│   ├── prisma.ts              # Prisma client singleton
│   ├── api.ts                 # API helpers & response utils
│   └── utils.ts               # Helpers (distance, late calc, formatting)
├── types/                     # TypeScript interfaces
└── middleware.ts              # Auth middleware
prisma/
├── schema.prisma              # Database schema
└── seed.ts                    # Data seeder
```

---

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema ke database
npm run db:seed      # Seed data demo
npm run db:studio    # Prisma Studio (GUI database)
```

---

## Logika Bisnis

- **Keterlambatan**: dihitung jika check-in > jam masuk + toleransi (default 15 menit)
- **Lembur**: dihitung jika check-out > jam pulang + threshold (default 30 menit)  
- **Radius**: validasi jarak Haversine antara koordinat karyawan dan kantor
- **Notifikasi**: otomatis dikirim ke atasan saat terlambat, luar radius, atau lembur

---

## Lisensi

MIT License — bebas digunakan dan dimodifikasi.
