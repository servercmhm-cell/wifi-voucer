const crypto = require("crypto");
const U = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const T = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const SECRET = process.env.SESSION_SECRET || "", ADMINPW = process.env.ADMIN_PASSWORD || "";
class E extends Error { constructor(s, m) { super(m); this.s = s; } }
const R = async (...c) => {
  const r = await fetch(U, { method: "POST", headers: { Authorization: "Bearer " + T }, body: JSON.stringify(c) });
  const d = await r.json(); if (d.error) throw new Error(d.error); return d.result;
};
const sha = s => crypto.createHash("sha256").update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const sign = p => { const b = Buffer.from(JSON.stringify(p)).toString("base64url"); return b + "." + crypto.createHmac("sha256", SECRET).update(b).digest("base64url"); };
const unsign = t => {
  if (!t || !t.includes(".")) return null; const [b, s] = t.split(".");
  if (!same(s, crypto.createHmac("sha256", SECRET).update(b).digest("base64url"))) return null;
  try { const p = JSON.parse(Buffer.from(b, "base64url")); return p.exp > Date.now() ? p : null; } catch { return null; }
};
const pw = (p, salt) => crypto.scryptSync(p, salt, 32).toString("hex");
const slug = s => String(s || "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
const macN = v => { v = String(v || "").trim().toUpperCase().replace(/-/g, ":"); return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(v) ? v : ""; };
const ifc = v => /^[A-Za-z0-9._-]{1,20}$/.test(v || "") ? v : "ether1";
const getAcc = async u => { const r = await R("GET", "acc:" + u); return r ? JSON.parse(r) : null; };
const me = async a => ({ user: a.user, name: a.name, mac: a.mac, iface: a.iface, profiles: (await R("SMEMBERS", "prof:" + a.user)) || [] });
const tok = req => (req.headers.authorization || "").replace(/^Bearer /, "");
async function authUser(req) {
  const p = unsign(tok(req)); if (!p || p.r !== "u") throw new E(401, "Sesi tidak valid");
  const a = await getAcc(p.u); if (!a || !a.active || !a.mac) throw new E(401, "Akun dihapus, nonaktif, atau MAC kosong");
  return a;
}
function authAdmin(req) { const p = unsign(tok(req)); if (!p || p.r !== "a") throw new E(401, "Sesi admin tidak valid"); }
async function limit(req) {
  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim(), k = "rl:" + ip;
  const n = await R("INCR", k); if (n === 1) await R("EXPIRE", k, 600);
  if (n > 15) throw new E(429, "Terlalu banyak percobaan. Coba lagi 10 menit lagi.");
}
const guard = a => `# Hanya untuk router ${a.mac} (akun ${a.user})\n:if ([/interface ethernet get [find default-name=${a.iface || "ether1"}] mac-address]!="${a.mac}") do={:error "Router tidak terdaftar untuk akun ini"}\n`;
const lq = v => v ? v.replace("M", " MB").replace("G", " GB") : "Tanpa batas";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const act = req.query.action, b = (typeof req.body === "object" && req.body) || {};
  try {
    if (!U || !T || !SECRET || !ADMINPW) throw new E(500, "Server belum dikonfigurasi: cek Redis dan Environment Variables (SESSION_SECRET, ADMIN_PASSWORD)");
    let out = {};
    if (act === "login") {
      await limit(req); const a = await getAcc(slug(b.user));
      if (!a || !same(pw(String(b.password || ""), a.salt), a.hash)) throw new E(401, "Username/password salah");
      if (!a.active) throw new E(403, "Akun nonaktif. Hubungi admin.");
      if (!a.mac) throw new E(403, "Akun belum didaftarkan ke MikroTik (MAC kosong). Hubungi admin.");
      out = { token: sign({ r: "u", u: a.user, exp: Date.now() + 12 * 36e5 }), me: await me(a) };
    } else if (act === "me") { out = { me: await me(await authUser(req)) };
    } else if (act === "generate") {
      const a = await authUser(req);
      const n = Math.min(500, Math.max(1, parseInt(b.n) || 1)), len = Math.min(12, Math.max(4, parseInt(b.len) || 6));
      const px = String(b.px || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8), md = ["num", "alpha"].includes(b.md) ? b.md : "mix";
      const pf = slug(b.pf) || "default", q = /^\d{1,5}[MG]$/i.test(b.q || "") ? b.q.toUpperCase() : "", m = /^\d{1,4}[hdm]$/.test(b.m || "") ? b.m : "";
      const set = md === "num" ? "23456789" : md === "alpha" ? "abcdefghjkmnpqrstuvwxyz" : "abcdefghjkmnpqrstuvwxyz23456789";
      const mk = () => px + Array.from(crypto.randomBytes(len), x => set[x % set.length]).join("");
      let codes = new Set(); for (let t = 0; t < 6 && codes.size < n; t++) {
        while (codes.size < n) codes.add(mk());
        const ex = await R("SMISMEMBER", "codes", ...codes); [...codes].forEach((c, i) => { if (ex[i]) codes.delete(c); });
      }
      if (codes.size < n) throw new E(500, "Gagal membuat kode unik, tambah panjang kode");
      codes = [...codes]; await R("SADD", "codes", ...codes);
      const id = Date.now().toString(36), t = Date.now();
      const script = guard(a) + `# Voucher batch ${id} | kuota ${lq(q)} | aktif ${m || "tanpa batas"}\n` + codes.map(k => `/ip hotspot user add name=${k} password=${k} profile=${pf}${q ? ` limit-bytes-total=${q}` : ""}${m ? ` limit-uptime=${m}` : ""} comment="vc-${id}"`).join("\n") + "\n";
      const cleaner = guard(a) + `:foreach u in=[/ip hotspot user find where comment~"^vc-" && limit-bytes-total>0] do={\n :local t ([/ip hotspot user get $u bytes-in]+[/ip hotspot user get $u bytes-out])\n :if ($t>=[/ip hotspot user get $u limit-bytes-total]) do={/ip hotspot user remove $u}\n}\n`;
      await R("SET", "batch:" + id, JSON.stringify({ id, t, n, q, m, script }), "EX", 5184000);
      await R("LPUSH", "hist:" + a.user, id); await R("LTRIM", "hist:" + a.user, 0, 49);
      out = { id, n, q, m, codes, script, cleaner };
    } else if (act === "history") {
      const a = await authUser(req), ids = (await R("LRANGE", "hist:" + a.user, 0, 9)) || [];
      const rows = ids.length ? await R("MGET", ...ids.map(i => "batch:" + i)) : [];
      out = { items: rows.filter(Boolean).map(JSON.parse) };
    } else if (act === "profile") {
      const a = await authUser(req), n = slug(b.name); if (!n) throw new E(400, "Nama profile kosong");
      await R("SADD", "prof:" + a.user, n); out = { profiles: await R("SMEMBERS", "prof:" + a.user) };
    } else if (act === "adminlogin") {
      await limit(req); if (!same(String(b.password || ""), ADMINPW)) throw new E(401, "Password admin salah");
      out = { token: sign({ r: "a", exp: Date.now() + 6 * 36e5 }) };
    } else if (act === "adminlist") {
      authAdmin(req); const us = ((await R("SMEMBERS", "accs")) || []).sort();
      const rows = us.length ? await R("MGET", ...us.map(u => "acc:" + u)) : [];
      out = { items: rows.filter(Boolean).map(r => { const { salt, hash, ...x } = JSON.parse(r); return x; }) };
    } else if (act === "adminadd") {
      authAdmin(req); const u = slug(b.user), mac = macN(b.mac), p = String(b.password || "");
      if (!/^[a-z0-9_.-]{2,24}$/.test(u)) throw new E(400, "Username 2-24 karakter (huruf kecil, angka, . _ -)");
      if (p.length < 6) throw new E(400, "Password minimal 6 karakter");
      if (!mac) throw new E(400, "MAC tidak valid (contoh AA:BB:CC:DD:EE:FF)");
      if (await R("EXISTS", "acc:" + u)) throw new E(409, "Username sudah ada");
      if (await R("HGET", "macs", mac)) throw new E(409, "MAC sudah terdaftar di akun lain (satu akun = satu MikroTik)");
      const salt = crypto.randomBytes(12).toString("hex");
      await R("SET", "acc:" + u, JSON.stringify({ user: u, name: String(b.name || u).slice(0, 40), salt, hash: pw(p, salt), active: true, mac, iface: ifc(b.iface), created: Date.now() }));
      await R("SADD", "accs", u); await R("HSET", "macs", mac, u); out = { ok: true };
    } else if (act === "adminupdate") {
      authAdmin(req); const a = await getAcc(slug(b.user)); if (!a) throw new E(404, "Akun tidak ditemukan");
      if (typeof b.active === "boolean") a.active = b.active;
      if (b.name) a.name = String(b.name).slice(0, 40);
      if (b.iface) a.iface = ifc(b.iface);
      if (b.password) { if (String(b.password).length < 6) throw new E(400, "Password minimal 6 karakter"); a.salt = crypto.randomBytes(12).toString("hex"); a.hash = pw(String(b.password), a.salt); }
      if (b.mac) {
        const m = macN(b.mac); if (!m) throw new E(400, "MAC tidak valid");
        const o = await R("HGET", "macs", m); if (o && o !== a.user) throw new E(409, "MAC sudah dipakai akun lain");
        if (a.mac) await R("HDEL", "macs", a.mac); await R("HSET", "macs", m, a.user); a.mac = m;
      }
      await R("SET", "acc:" + a.user, JSON.stringify(a)); out = { ok: true };
    } else if (act === "admindelete") {
      authAdmin(req); const u = slug(b.user), a = await getAcc(u); if (!a) throw new E(404, "Akun tidak ditemukan");
      await R("DEL", "acc:" + u, "hist:" + u, "prof:" + u); await R("SREM", "accs", u); if (a.mac) await R("HDEL", "macs", a.mac); out = { ok: true };
    } else throw new E(404, "Endpoint tidak ada");
    res.status(200).json(out);
  } catch (e) { res.status(e.s || 500).json({ error: e.s ? e.message : "Kesalahan server: " + e.message }); }
};
