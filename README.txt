VERSI BACKEND (Vercel Functions + Upstash Redis)
1. Upload isi folder ini ke GitHub, import ke Vercel (Framework: Other).
2. Vercel > Storage / Marketplace > tambah Upstash Redis dan hubungkan ke project (KV_REST_API_URL/TOKEN otomatis terisi).
3. Settings > Environment Variables: SESSION_SECRET (teks acak >=32 karakter), ADMIN_PASSWORD. Lalu Redeploy.
4. Generator: https://DOMAIN/   Admin: https://DOMAIN/admin/   (akun dibuat di Admin, langsung aktif)
5. MikroTik: upload mikrotik/hotspot/login.html ke Files > hotspot/, lalu /ip hotspot profile set NAMA login-by=http-pap,mac-cookie
Catatan: halaman TIDAK bisa dibuka dengan double-click; harus lewat Vercel (atau `vercel dev`) karena memakai /api.

FITUR BARU: Masa aktif "sejak login pertama" (default) memasang on-login pada profile voucher; voucher berkomentar vc-BATCH-MASA, diubah jadi act-... saat dipakai pertama kali, lalu scheduler menghapusnya saat masa aktif habis. Uji dulu dengan masa aktif 3m.
CETAK: tab Voucher > Pengaturan cetak (nama toko, judul, catatan kaki, kolom, logo). Riwayat > tombol Cetak untuk mencetak ulang batch.
