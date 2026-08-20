# PRD (Product Requirements Document)
# HadirBos — Aplikasi Absensi Karyawan Berbasis Mobile

**Versi:** 1.0 (Draft untuk diskusi)
**Tanggal:** 20 Agustus 2026
**Status:** Draft

---

## 1. Ringkasan Produk

**HadirBos** adalah aplikasi absensi berbasis web/mobile yang memungkinkan karyawan melakukan absen masuk dan pulang menggunakan handphone masing-masing (self check-in), dilengkapi verifikasi foto diri dan geotagging lokasi, perhitungan keterlambatan dan lembur otomatis, serta modul pelaporan yang bisa difilter dan diexport ke Excel.

## 2. Tujuan (Objectives)

- Menggantikan sistem absensi manual/mesin fingerprint dengan sistem self-service berbasis HP.
- Memastikan validitas kehadiran melalui foto diri + lokasi (geotag), bukan sekadar klik tombol.
- Menghitung keterlambatan dan lembur secara otomatis dan konsisten.
- Menyediakan laporan kehadiran yang mudah diakses oleh manajemen/HR dan bisa diexport.

## 3. Target Pengguna & Role

| Role | Deskripsi | Akses Utama |
|---|---|---|
| **Admin** | HR/IT, pengelola sistem penuh | Kelola user, kelola master data (lokasi kantor, jam kerja, hari libur), kelola role, lihat semua laporan, export, koreksi absen |
| **Manager** | Kepala departemen / atasan level lebih tinggi | Lihat & pantau laporan tim/departemennya, terima notifikasi lembur & luar radius, koreksi absen anak buah |
| **SPV** | Supervisor, atasan langsung di lapangan/tim kecil | Lihat & pantau laporan tim yang disupervisi, terima notifikasi lembur & luar radius, koreksi absen anak buah |
| **User** | Karyawan biasa | Login, absen masuk/pulang, lihat riwayat absensi pribadi |

> **Catatan:** Manager dan SPV punya hak akses yang mirip (memantau tim, menerima notifikasi, melakukan koreksi), bedanya hanya di cakupan tim yang mereka awasi (Manager biasanya level departemen, SPV level tim/shift yang lebih kecil). Struktur tim (siapa atasan siapa) perlu didefinisikan di data master user (field "atasan/reports to").

## 4. Data Model — Master User

| Field | Tipe | Keterangan |
|---|---|---|
| NIK | String (unique) | Nomor Induk Karyawan |
| Nama | String | Nama lengkap |
| Alamat | Text | Alamat domisili |
| No. Telp | String | Nomor HP (juga dipakai untuk login/OTP jika diperlukan) |
| Jabatan | String | Jabatan/posisi |
| Departemen | String | Untuk filter laporan per departemen |
| Atasan (Reports To) | Reference ke User | Menentukan manager/SPV mana yang menerima notifikasi & bisa koreksi absen user ini |
| Role | Enum | admin / manager / spv / user |
| Lokasi Kantor Terdaftar | Reference | Untuk cek radius geofence (lihat poin 6.4) |
| Status | Enum | Aktif / Nonaktif |
| Foto Profil | Image | Opsional, untuk referensi pembanding |
| Email/Username & Password | String | Untuk login |

## 5. Fitur Detail

### 5.1 Autentikasi & Login
- Login menggunakan No. HP / NIK / email + password.
- Opsional (disarankan): OTP via SMS/WhatsApp untuk keamanan tambahan, atau minimal "device binding" (1 akun = 1 device terdaftar) agar tidak ada titip absen dari HP orang lain.
- Session token disimpan aman (JWT), auto-logout setelah idle tertentu.

### 5.2 Absen Masuk (Check-in)
- Jam kerja normal mulai **08:00**.
- Absen pada **08:01 atau lebih** dihitung **telat**, dengan perhitungan menit keterlambatan = (waktu absen − 08:00), dibulatkan ke menit.
- Contoh: absen 08:15 → telat 15 menit. Absen 07:55 → tidak telat (status "Tepat Waktu").
- Field yang diisi/direkam otomatis saat absen masuk:
  - Timestamp server (bukan waktu HP user, untuk mencegah manipulasi jam HP)
  - Foto diri (take photo langsung dari kamera **atau** upload dari galeri — lihat catatan di 5.4)
  - Geotag (lat/long) otomatis
  - Status telat + jumlah menit telat (auto-calculated)
- Satu kali absen masuk per hari per user (tidak bisa absen masuk dua kali, kecuali dikoreksi admin).

### 5.3 Absen Pulang & Lembur
- Jam kerja normal selesai **18:00**.
- User submit "Absen Pulang" kapan saja setelah bekerja (mencatat timestamp keluar + foto + geotag, sama seperti absen masuk).
- **Lembur** mulai dihitung sejak **18:46** sampai waktu user submit absen pulang.
  - Lama lembur (menit) = (waktu absen pulang − 18:46), jika waktu absen pulang > 18:46. Jika absen pulang ≤ 18:46, lembur = 0.
  - Contoh: pulang jam 19:30 → lembur 44 menit. Pulang jam 18:40 → lembur 0.
- **Lembur tidak butuh approval sebelumnya** — user absen pulang seperti biasa, sistem otomatis menghitung menit lembur dan langsung mencatatnya (statusnya langsung "tercatat", bukan "menunggu approval").
- **Notifikasi otomatis ke Manager/SPV** dikirim setiap kali ada anak buahnya yang tercatat lembur (berisi nama, tanggal, jam pulang, jumlah menit lembur), agar manager bisa memantau/mengonfirmasi kewajaran lembur tersebut secara real-time — bukan blocking, hanya informatif.
- Manager/SPV tetap bisa membuka detail lembur anak buahnya kapan saja dari laporan untuk review lebih lanjut.
- **Tidak ada auto-close paksa** — mengingat lembur bisa berlangsung lintas hari (melewati tengah malam), record absen pulang **tetap terbuka** sampai user benar-benar submit absen pulang, kapan pun waktunya.
- Sebagai gantinya, dipakai **notifikasi bertingkat (escalating alert)** ke Manager/SPV agar merekalah yang menilai apakah ini lembur sah atau karyawan lupa absen pulang:
  1. **Alert pertama**: setelah lembur berjalan > 3 jam (sekitar jam 21:46, mengacu batas wajar lembur harian PP 35/2021) — "Karyawan X masih lembur, sudah berjalan ~3 jam sejak 18:46."
  2. **Alert kedua**: pada tengah malam (00:00) jika masih belum absen pulang — "Karyawan X belum absen pulang hingga tengah malam."
  3. **Alert ketiga**: jika sampai jam masuk kerja berikutnya (08:00) masih belum absen pulang, status ditandai **"Perlu Ditinjau"** di dashboard Manager/SPV (bukan auto-close, hanya penanda visual untuk prioritas review).
- Dari notifikasi/dashboard tersebut, Manager/SPV punya dua aksi:
  - **"Konfirmasi Lembur Sah"** — biarkan record tetap terbuka/berlanjut apa adanya.
  - **"Tandai Lupa Absen"** — lalu input manual jam pulang yang sebenarnya (dengan alasan, tercatat di audit log).
- **Koreksi manual** (baik untuk kasus lupa absen maupun kesalahan lain) hanya bisa dilakukan oleh **Manager/SPV atau Admin**, tercatat di audit log siapa yang mengoreksi, kapan, dan alasannya.
- **Catatan teknis:** alert bertingkat ini butuh proses terjadwal (scheduled job/cron) yang secara berkala mengecek record absen yang masih "terbuka" (belum ada jam pulang) dan membandingkan dengan waktu saat ini — bukan hanya dipicu saat user submit absen pulang.

### 5.4 Foto Diri saat Absen
- **Wajib foto live via kamera** (real-time capture dari browser, bukan upload dari galeri) — mencegah kecurangan seperti pakai foto lama atau foto orang lain.
- Tombol/akses ke galeri **tidak disediakan** di halaman absen.
- Foto disimpan di cloud storage (bukan di database langsung), dengan link/URL disimpan di record absensi.
- Ukuran foto dikompres otomatis (misal max 500KB) agar loading tetap cepat dan hemat storage/bandwidth.

### 5.5 Geolocation & Validasi Lokasi
- Lokasi (GPS) **wajib aktif** saat melakukan absen.
- Jika lokasi (GPS) tidak aktif / permission ditolak → muncul **warning/blocking modal**: "Aktifkan lokasi untuk melakukan absen" — tombol absen di-disable sampai izin lokasi diberikan.
- Sistem menyimpan koordinat lat/long setiap absen (masuk & pulang).
- **Validasi radius kantor:**
  - Setiap kantor/cabang punya titik koordinat pusat (didaftarkan admin) + radius toleransi (default: **100 meter**, bisa dikonfigurasi per kantor).
  - Jika jarak user > 100m dari titik kantor, absen **tetap bisa disubmit** (tidak diblok), tapi diberi tanda/flag **"Di Luar Radius Kantor"** beserta jarak sebenarnya (misal "150m dari kantor") dan memicu **notifikasi ke Manager/SPV/Admin** untuk dicek/diverifikasi secara manual (misal karyawan sedang dinas luar, atau kasus mencurigakan).
  - *(Catatan teknis: akurasi GPS HP bisa bervariasi 5–50m tergantung device/kondisi, sehingga perlu ditoleransi & tidak selalu 100% akurat — sebaiknya dikomunikasikan ke user.)*
- Karena kantor saat ini single location (lihat poin 3), belum ada pengecualian radius untuk lapangan/WFH — semua absen di luar radius akan lewat jalur notifikasi & cek manual di atas.

### 5.6 Manajemen User (Admin)
- CRUD data user (NIK, nama, alamat, no telp, jabatan, departemen, role).
- Kelola master lokasi kantor/cabang (nama, koordinat, radius toleransi).
- Kelola jam kerja (default 08:00–18:00, tapi disarankan dibuat **configurable** kalau nanti ada shift berbeda).
- Kelola hari libur nasional/cuti bersama (agar tidak dihitung telat/alpa di hari libur).
- Reset password / lock akun.

### 5.7 Reporting & Export
- List laporan absensi menampilkan: **Nama, NIK, Tanggal, Jam Masuk, Jam Pulang, Status Telat (+menit), Lembur (+menit), Lokasi (dalam/luar radius), Foto**.
- Filter: rentang tanggal, nama/NIK, departemen, cabang, status (telat/tidak, lembur/tidak).
- Akses laporan sesuai role:
  - Admin: semua data.
  - Manager & SPV: hanya tim/departemen yang mereka awasi (berdasarkan field "Atasan/Reports To" di data user).
  - User: hanya data pribadi.
- Export ke **Excel (.xlsx)** sesuai filter yang aktif.
- Rekap bulanan otomatis (opsional, fase 2): total hari kerja, total telat, total menit lembur per karyawan per bulan — berguna untuk payroll.

### 5.8 Notifikasi (disarankan, opsional untuk MVP)
- Reminder push notification/WA menjelang jam masuk & jam pulang.
- Notifikasi ke manager jika ada anak buah yang telat/lembur signifikan.

## 6. Business Rules — Ringkasan

| Aturan | Nilai Default | Configurable? |
|---|---|---|
| Jam masuk normal | 08:00 | Ya (per kantor/shift) |
| Batas telat | 08:01 ke atas = telat | Ya |
| Jam pulang normal | 18:00 | Ya |
| Mulai hitung lembur | 18:46 | Ya |
| Radius toleransi lokasi | 100 meter | Ya (per kantor) |
| Absen masuk/pulang per hari | 1x masing-masing | - |
| Sumber waktu | Timestamp server, bukan HP user | - |

## 7. Kebutuhan Non-Fungsional

- **Mobile-first & responsive**: optimal di layar HP (Android & iOS via browser/PWA), tetap bisa diakses via desktop untuk admin/manager.
- **Fast loading**: target load awal < 2 detik di koneksi 4G biasa; foto dikompres client-side sebelum upload.
- **Robust/reliable**: 
  - Absen tetap bisa disubmit walau koneksi lambat (retry mechanism / offline queue lalu sync saat online kembali — disarankan untuk area kantor dengan sinyal kurang stabil).
  - Validasi ganda di backend (jangan hanya validasi di frontend) untuk jam, lokasi, dan foto — mencegah manipulasi.
- **Keamanan & Privasi**: foto & lokasi karyawan adalah data sensitif → perlu kebijakan retensi data, akses terbatas by role, dan idealnya compliance ke UU PDP (Perlindungan Data Pribadi) Indonesia.
- **Skalabilitas**: desain untuk multi-cabang/multi-lokasi kantor sejak awal.
- **Audit trail**: setiap absen tercatat dengan device info + IP + timestamp server untuk keperluan audit.

## 8. Usulan Arsitektur Teknis

| Layer | Rekomendasi |
|---|---|
| Frontend | Web App biasa (dibuka via browser HP, tidak perlu install/Play Store/App Store) — React/Next.js, responsive & mobile-friendly, memanfaatkan Camera API & Geolocation API browser. (PWA capability seperti "add to homescreen" bisa ditambahkan belakangan sebagai enhancement ringan, opsional) |
| Backend | REST API — Node.js (Express/NestJS) atau alternatif lain sesuai tim yang tersedia |
| Database | **SQLite** untuk tahap awal/development (ringan, tanpa perlu setup server database terpisah, cocok untuk MVP dengan skala user belum besar) — didesain siap migrasi ke **PostgreSQL** atau **MySQL** saat kebutuhan skala/concurrent user meningkat. Untuk menjaga portabilitas, gunakan **ORM** (misal Prisma, Sequelize, atau TypeORM jika backend Node.js; atau SQLAlchemy jika Python) yang mendukung ketiga database tersebut, dan **hindari fitur SQL spesifik-vendor** (mis. fungsi native khusus Postgres/MySQL) di level query. |
| Storage foto | Cloud object storage (S3-compatible / Google Cloud Storage) |
| Hosting | Cloud (AWS/GCP/Azure) atau VPS, dengan CDN untuk asset agar loading cepat |
| Autentikasi | JWT + refresh token |

> Ini hanya usulan awal — bisa disesuaikan dengan preferensi tim/infrastruktur yang sudah ada.

## 9. Skema Database (Garis Besar)

> **Catatan migrasi:** Skema di bawah didesain agar kompatibel di SQLite, PostgreSQL, maupun MySQL — menghindari tipe data atau fitur yang spesifik ke satu vendor (misal pakai `TIMESTAMP`/`DATETIME` standar, `TEXT`/`VARCHAR` untuk string, ID sebagai integer/UUID biasa, tanpa stored procedure vendor-specific). Perlu diperhatikan: SQLite punya keterbatasan pada **concurrent write** (satu writer di satu waktu) — untuk MVP dengan jumlah karyawan yang belum terlalu banyak umumnya masih aman, tapi begini disarankan pantau performa saat jam absen ramai (jam 08:00 & 18:00), dan siapkan rencana migrasi ke PostgreSQL bila mulai terasa lambat/terjadi lock.

**users**
`id, nik, nama, alamat, no_telp, jabatan, departemen, role, atasan_id (reports_to → users.id), id_kantor, status, password_hash, created_at`

**offices** (kantor/cabang)
`id, nama_kantor, latitude, longitude, radius_toleransi_meter, jam_masuk, jam_pulang, batas_lembur`

**attendances**
`id, user_id, tanggal, jam_masuk, foto_masuk_url, lat_masuk, long_masuk, jarak_dari_kantor_masuk, status_telat, menit_telat, dalam_radius_masuk, jam_pulang, foto_pulang_url, lat_pulang, long_pulang, jarak_dari_kantor_pulang, dalam_radius_pulang, menit_lembur, status, created_at, updated_at`

**holidays**
`id, tanggal, keterangan`

## 10. Alur Pengguna (User Flow) — Ringkas

1. User buka app di HP → login.
2. Sistem cek: sudah lewat jam berapa & apakah GPS aktif.
3. Jika GPS mati → tampil warning, tombol absen disabled.
4. User tekan "Absen Masuk" → buka kamera → ambil foto → sistem ambil koordinat GPS → hitung jarak ke kantor → submit.
5. Sistem simpan timestamp server, hitung status telat otomatis → tampilkan konfirmasi ke user ("Absen berhasil, Anda telat 12 menit" / "Absen berhasil, tepat waktu").
6. Sore hari, user tekan "Absen Pulang" dengan alur serupa → sistem hitung lembur otomatis jika > 18:46.
7. Admin/Manager buka dashboard laporan → filter tanggal/nama → export Excel.

## 11. Fase Pengembangan (Disarankan)

**MVP (Fase 1):**
- Login, absen masuk/pulang dengan foto (kamera) + geotag + warning GPS mati.
- Perhitungan telat & lembur otomatis.
- Radius validasi + flag luar radius.
- Manajemen user dasar (admin).
- Laporan + filter tanggal + export Excel.
- Role: admin, manager, spv, user (keempatnya sudah lengkap di MVP).

**Fase 2:**
- Multi-cabang (jika suatu saat berkembang, termasuk kemungkinan role tambahan level korporat).
- Notifikasi reminder.
- Rekap bulanan otomatis untuk payroll.
- Fitur cuti/izin terintegrasi dengan absensi.
- Offline mode (submit absen tersimpan lokal lalu sync saat online).

## 12. Keputusan Final (Hasil Diskusi)

| Poin | Keputusan |
|---|---|
| Foto absen | Wajib live camera, tidak ada opsi upload galeri |
| Lembur | Langsung tercatat otomatis dari selisih waktu, tanpa approval terlebih dulu; notifikasi otomatis dikirim ke Manager/SPV setiap ada lembur tercatat |
| Validasi radius 100m | Tidak blocking; jika di luar radius, absen tetap masuk + notifikasi ke Manager/SPV/Admin untuk cek manual |
| Lupa absen pulang | **Tidak ada auto-close** (karena lembur bisa lintas hari); sistem kirim notifikasi bertingkat ke Manager/SPV (setelah >3 jam lembur, tengah malam, dan jam masuk berikutnya) agar mereka yang menilai lembur sah vs lupa absen, lalu bisa koreksi manual jika perlu — tercatat di audit log |
| Struktur kantor | Single office (bukan multi-cabang) |
| Platform | Web app biasa, diakses via browser HP (tidak perlu install/publish ke store) |

## 13. Sisa Pertanyaan Terbuka (Minor, Bisa Menyusul)

1. Apakah dibutuhkan modul cuti/izin/sakit yang terintegrasi dengan absensi, atau itu sistem terpisah?
2. Berapa lama data foto & lokasi perlu disimpan (kebijakan retensi data)?
3. Kanal notifikasi ke Manager/SPV: cukup di dalam aplikasi (in-app/dashboard), atau perlu juga via WhatsApp/email/push notification agar lebih cepat terlihat?

## 14. Error Handling & Fallback (Skenario Kegagalan)

Prinsip umum: **aplikasi tidak boleh gagal diam-diam (silent fail) atau crash tanpa pesan**. Setiap kondisi data/fungsi yang tidak tersedia harus punya pesan yang jelas ke user dan, bila relevan, jalur fallback yang aman.

| Skenario | Perilaku Fallback |
|---|---|
| **GPS/lokasi tidak aktif atau izin ditolak** | Tombol absen di-disable, tampilkan modal jelas cara mengaktifkan lokasi (sudah dibahas di 5.5) |
| **Izin kamera ditolak** | Tombol absen di-disable, tampilkan instruksi cara mengaktifkan izin kamera di browser/HP |
| **GPS lambat mendapat sinyal (loading lama)** | Beri timeout (misal 15–20 detik) dengan indikator loading, lalu tampilkan tombol "Coba Lagi" — jangan biarkan user menunggu tanpa batas |
| **Tidak ada koneksi internet saat submit absen** | Data absen (foto + koordinat + timestamp lokal) **disimpan sementara di device** (local queue), tampilkan status "Menunggu koneksi, akan dikirim otomatis", lalu auto-retry saat koneksi kembali. Timestamp final tetap divalidasi/dicatat ulang oleh server saat data diterima. |
| **Server/API down atau timeout** | Tampilkan pesan error yang jelas ("Sistem sedang tidak bisa dihubungi, coba beberapa saat lagi") + tombol retry, bukan halaman blank/crash |
| **Upload foto gagal (koneksi putus di tengah, file terlalu besar, format tidak didukung)** | Validasi ukuran/format di sisi client sebelum upload, kompres otomatis; jika tetap gagal, beri pesan jelas + opsi ambil ulang foto |
| **Submit absen ganda / double-click / duplicate request** | Tombol disable otomatis setelah ditekan sekali; backend juga validasi agar tidak tercipta 2 record absen masuk/pulang di hari & jenis yang sama |
| **Lokasi kantor belum di-set oleh admin** | Sistem tidak bisa menghitung radius → absen tetap bisa dilakukan, tapi status radius ditandai "Tidak Dapat Divalidasi" + notifikasi ke admin untuk segera melengkapi data lokasi kantor |
| **Jam kerja/aturan lembur belum dikonfigurasi** | Gunakan nilai default (08:00 masuk, 18:00 pulang, lembur mulai 18:46) sebagai fallback, sambil tetap muncul reminder ke admin untuk mengonfirmasi/menyesuaikan pengaturan |
| **Akun user tidak ditemukan / nonaktif / salah password** | Pesan error jelas dan spesifik ("NIK/No. HP tidak ditemukan" vs "Password salah" vs "Akun nonaktif, hubungi admin") — tanpa membocorkan info sensitif berlebihan, tapi cukup jelas untuk troubleshooting |
| **Data laporan kosong sesuai filter yang dipilih** | Tampilkan *empty state* yang informatif ("Tidak ada data absensi untuk filter ini") — bukan error, dan bukan tabel kosong tanpa keterangan |
| **Export ke Excel gagal (data terlalu besar, proses timeout)** | Tampilkan pesan error + saran (misal persempit rentang tanggal), sediakan tombol retry; untuk data besar, proses export bisa dibuat asynchronous (generate di background lalu notifikasi/link download saat selesai) |
| **SQLite terkunci akibat concurrent write (banyak user absen bersamaan jam 08:00/18:00)** | Implementasi retry-with-backoff otomatis di level aplikasi saat menulis ke database, agar user tidak melihat error teknis — jika masalah ini sering terjadi, jadi sinyal untuk migrasi ke PostgreSQL (lihat catatan di Bagian 9) |
| **Notifikasi ke Manager/SPV gagal terkirim (misal service notifikasi down)** | Tidak boleh menghambat proses absen user (absen tetap tersimpan sukses); notifikasi yang gagal dicatat di log/antrian untuk retry, tidak hilang begitu saja |
| **Foto/lokasi tidak berhasil terekam sama sekali (kegagalan total)** | Absen **tidak boleh dianggap sukses** jika foto atau lokasi wajib tidak berhasil disertakan — tampilkan error yang jelas dan minta user mengulang, agar tidak ada data absen "kosong"/tidak valid yang lolos ke sistem |

**Prinsip tambahan untuk developer:**
- Semua pesan error ditulis dalam bahasa yang dimengerti user awam (bukan pesan teknis/kode error mentah).
- Setiap kegagalan yang berpotensi mempengaruhi data absensi (jam masuk/pulang, telat, lembur) dicatat di log sistem untuk keperluan audit/debug.
- Validasi selalu dilakukan di backend, tidak hanya di frontend — supaya error tidak bisa "dilewati" hanya dengan mematikan JavaScript atau memanipulasi request.

---

*Dokumen ini sudah mencakup keputusan hasil diskusi (Bagian 12) dan skenario error handling & fallback (Bagian 14), sehingga siap dijadikan acuan pengembangan aplikasi HadirBos (MVP sesuai Bagian 11). Sisa pertanyaan minor di Bagian 13 tidak menghalangi mulainya pengembangan dan bisa diputuskan sambil jalan.*
