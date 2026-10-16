// Simpan sebagai: api/sync.js (di repo GitHub Kendali)
// Menyimpan riwayat per bulan dan pengaturan durasi: Vercel Function + Upstash Redis.
const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const OK_KEY = /^(\d{4}-\d{2}|cfg)$/;

async function redis(cmd) {
  const r = await fetch(DB_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

function toObj(a) {
  const o = {};
  if (Array.isArray(a)) for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1];
  else Object.assign(o, a || {});
  return o;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const pass = process.env.JOURNAL_KEY;
  if (!pass || req.headers['x-key'] !== pass) return res.status(401).json({ error: 'kata sandi salah' });
  if (!DB_URL || !DB_TOKEN) return res.status(500).json({ error: 'database belum terhubung' });

  try {
    if (req.method === 'GET') {
      const months = {};
      if (req.query.m) {
        const keys = String(req.query.m).split(',').filter((k) => OK_KEY.test(k)).slice(0, 6);
        if (keys.length) {
          const vals = await redis(['HMGET', 'urge', ...keys]);
          keys.forEach((k, i) => { if (vals[i]) months[k] = JSON.parse(vals[i]); });
        }
      } else {
        const all = toObj(await redis(['HGETALL', 'urge']));
        for (const k in all) months[k] = JSON.parse(all[k]);
      }
      return res.status(200).json({ months });
    }

    if (req.method === 'PUT') {
      const m = String(req.query.m || '');
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const valid =
        OK_KEY.test(m) && body &&
        (m === 'cfg'
          ? Array.isArray(body.opts) && body.opts.length <= 8 && body.opts.every((n) => typeof n === 'number')
          : typeof body.days === 'object' && body.days !== null);
      if (!valid) return res.status(400).json({ error: 'data tidak valid' });
      const text = JSON.stringify(body);
      if (text.length > 900000) return res.status(413).json({ error: 'terlalu besar' });
      await redis(['HSET', 'urge', m, text]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'metode tidak didukung' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
