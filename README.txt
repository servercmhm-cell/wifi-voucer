VERSI BACKEND (Vercel Functions + Upstash Redis)
1. Upload isi folder ini ke GitHub, import ke Vercel (Framework: Other).
2. Vercel > Storage / Marketplace > tambah Upstash Redis dan hubungkan ke project (KV_REST_API_URL/TOKEN otomatis terisi).
3. Settings > Environment Variables: SESSION_SECRET (teks acak >=32 karakter), ADMIN_PASSWORD. Lalu Redeploy.
4. Generator: https://DOMAIN/   Admin: https://DOMAIN/admin/   (akun dibuat di Admin, langsung aktif)
5. MikroTik: upload mikrotik/hotspot/login.html ke Files > hotspot/, lalu /ip hotspot profile set NAMA login-by=http-pap,mac-cookie
Catatan: halaman TIDAK bisa dibuka dengan double-click; harus lewat Vercel (atau `vercel dev`) karena memakai /api.
