# Sesi kerja lintas hari

Aturan implementasi yang disepakati 13 November 2026. Dokumen ini menggantikan bagian PRD/README lama mengenai checkout lintas hari dan auto-checkout.

## Tanggal kerja dan jadwal

- Satu sesi mengikuti tanggal mulai kerja (`Attendance.date`), bukan tanggal checkout. Timestamp masuk/pulang disimpan lengkap dan ditampilkan dalam WIB.
- Jadwal malam diatur lewat **Jam pulang pada hari berikutnya**, contoh Jumat 22.00–Sabtu 06.00. Kedatangan terlambat pada bagian shift setelah tengah malam (sebelum jam pulang) masuk ke tanggal kerja sebelumnya.
- Satu catatan per tanggal kerja per karyawan tetap berlaku. Beberapa shift dalam satu tanggal kerja belum didukung.
- Jadwal masuk/pulang absolut, toleransi, batas pemicu lembur, dan batas peninjauan disimpan saat check-in. Perubahan master jadwal tidak mengubah sesi yang sudah dicatat, termasuk sesi yang dimulai tanpa jadwal.
- Rumus lama dipertahankan: setelah melewati toleransi/pemicu, menit dihitung dari jam jadwal, bukan dari akhir toleransi. Lembur tetap membutuhkan persetujuan. `overtimeMinutes` menyimpan total yang disetujui; durasi pengajuan ada pada OvertimeApproval.

## Absen pulang setelah tengah malam

Checkout memilih satu sesi OPEN milik karyawan, bukan mencari tanggal hari ini. Foto/GPS diambil saat checkout. UI mengirim ID sesi untuk mencegah penutupan sesi berbeda oleh tab yang sudah usang. Jam pulang sebelum jadwal membutuhkan izin pulang awal yang disetujui, termasuk pada server.

Contoh: Jumat masuk 08.00, pulang Sabtu 01.00 → tanggal kerja Jumat, pulang 01.00 (+1 hari). Shift Jumat 22.00–Sabtu 06.00 → pulang Sabtu 06.00 tidak menghasilkan lembur otomatis.

## Lupa absen pulang

1. Pilih **Sudah Pulang, Lupa Absen**, atau koreksi dari Riwayat.
2. Isi tanggal/jam pulang sebenarnya (WIB) dan alasan.
3. Catatan menjadi CORRECTION_PENDING dan tidak lagi menjadi sesi checkout langsung. Jam pulang sebenarnya belum disahkan dan tetap NULL.
4. Karyawan boleh check-in tanggal kerja berikutnya. Tidak boleh membuat sesi kedua untuk tanggal kerja yang sama.
5. Atasan langsung atau Admin memproses koreksi. Timestamp diperiksa ulang: valid, bukan masa depan, pulang setelah masuk, tidak bertabrakan dengan sesi lain. Interval yang bersinggungan tepat di batas diperbolehkan.
6. Jika ditolak, catatan menjadi CORRECTION_REJECTED, tetap tidak dibuka kembali untuk checkout langsung. Sesi baru yang sudah berjalan tetap bisa selesai. Check-in berikutnya ditahan sampai koreksi lama diajukan ulang.
7. Persetujuan koreksi menghitung ulang telat dan kandidat lembur menggunakan snapshot sesi; lembur yang sudah disetujui tidak diubah otomatis. Riwayat koreksi dan alasan penolakan disimpan. Koreksi jam masuk harus tetap berada dalam tanggal kerja sesi; pemindahan tanggal kerja memerlukan penanganan Admin di luar formulir ini.

Karyawan dengan beberapa sesi OPEN lama perlu menyelesaikan koreksi, bukan memilih sesi sembarang untuk checkout. Database menggunakan `openSessionKey` unik untuk mencegah lebih dari satu sesi aktif baru.

## Pengingat dan peninjauan

- Kedua URL cron lama tetap tersedia, tetapi **tidak pernah mengisi jam pulang otomatis**.
- Pengingat pertama: setelah jadwal pulang +30 menit; diberitahukan kepada karyawan dan atasan (cadangan Admin jika tidak ada atasan).
- Peninjauan: setelah jadwal pulang +`reviewAfter`, default 180 menit, dapat diatur per jadwal (30–1440 menit). Catatan ditandai Perlu Ditinjau dan atasan menerima notifikasi. Ini bukan penetapan Alpa atau persetujuan lembur.
- Tanpa jadwal: pengingat/peninjauan setelah 24 jam dari check-in.
- Pemindaian mencakup semua sesi terbuka, termasuk sesi lebih dari satu hari lalu. Timestamp pengiriman mencegah pengulangan notifikasi per sesi.
- Penanda peninjauan juga dihitung saat data dibaca agar sesi terlambat tetap terlihat jika cron belum berjalan.
- Cron membutuhkan `CRON_SECRET` yang terisi dan header `x-cron-secret` yang cocok, tanpa cookie login. Jalankan satu endpoint secara berkala (misalnya tiap 10 menit); keduanya melakukan pekerjaan yang sama dan aman dipanggil ulang.
- Notifikasi tersedia di aplikasi; tidak ada pengiriman WhatsApp/email/push baru.

## Upgrade data dan operasional

Perubahan skema bersifat tambahan. Jangan menjalankan aplikasi versi lama dan baru secara bersamaan selama upgrade. Backup SQLite dengan aplikasi berhenti terlebih dahulu.

```bash
# Dengan service aplikasi berhenti dan DATABASE_URL mengarah ke DB yang benar:
npm ci
npm run db:generate
npm run db:push
npm run db:backfill-sessions
npm run build
# Setelah seluruh langkah berhasil, hidupkan service.
```

Script deploy yang ada menghentikan service sebelum backup database, perubahan kode, dan instalasi dependencies. Backup memakai fasilitas SQLite yang konsisten, lalu backfill dijalankan setelah schema push. Jika upgrade/build gagal, service dibiarkan berhenti agar operator meninjau kegagalan. Tidak ada deploy yang dilakukan dari pengerjaan fitur ini.

Backfill idempotent mempertahankan timestamp historis. Sesi lama yang selesai ditandai CLOSED. Jika beberapa sesi lama masih terbuka, sesi terbaru dipertahankan sebagai OPEN; lainnya memerlukan pengajuan koreksi. Jadwal historis yang belum memiliki snapshot diisi dari penugasan saat upgrade; konfigurasi jadwal masa lalu tidak dapat direkonstruksi. Auto-checkout historis yang sudah ada tidak dibatalkan otomatis.

Jangan memakai rollback script lama langsung setelah upgrade ini: backup lama mengecualikan `.next` dan `node_modules`, sedangkan restore menggunakan `rsync --delete`. Pemulihan membutuhkan instalasi dependencies, generate Prisma client, dan build ulang versi yang dipilih, dengan skema database yang kompatibel. Tidak ada downgrade database otomatis.

## Verifikasi

`npm test` membuat database SQLite sementara dan menjalankan pengujian sesi lintas hari, shift malam, perubahan jadwal, koreksi/penolakan, tab usang, konflik waktu, notifikasi, backfill, serta akses API. Database aplikasi tidak digunakan. TypeScript dapat diperiksa dengan `npx tsc --noEmit --incremental false`.
