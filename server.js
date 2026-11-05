// Birikim Takip - sunucu (Node 18+). Çalıştır: npm i && npm start
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const Database = require('better-sqlite3');
const PORT = process.env.PORT || 3000;
const USER = 'admin', PASS = 'admin';
const db = new Database(path.join(__dirname, 'birikim.db'));
db.exec(`CREATE TABLE IF NOT EXISTS entries(
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN('XAU','USD','EUR')),
  amount REAL NOT NULL CHECK(amount>0), tl REAL NOT NULL CHECK(tl>0), note TEXT DEFAULT '')`);
const sessions = new Set();
let cache = { t: 0, d: null };
const FILES = { '/': 'index.html', '/index.html': 'index.html', '/manifest.json': 'manifest.json', '/sw.js': 'sw.js', '/icon.svg': 'icon.svg' };
const MIME = { html: 'text/html', json: 'application/json', js: 'text/javascript', svg: 'image/svg+xml' };

async function rates() {
  if (cache.d && Date.now() - cache.t < 10 * 60e3) return cache.d;
  try {
    const x = await (await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', { signal: AbortSignal.timeout(8000) })).text();
    const get = k => {
      const m = x.match(new RegExp(`Kod="${k}"[\\s\\S]*?</Currency>`)); if (!m) return null;
      const s = m[0].match(/<ForexSelling>([\d.]+)</), b = m[0].match(/<ForexBuying>([\d.]+)</);
      return parseFloat((s && s[1]) || (b && b[1])) || null;
    };
    const d = { USD: get('USD'), EUR: get('EUR'), XAU: get('XAU'), date: (x.match(/Tarih="([^"]+)"/) || [])[1] || '', fetched: new Date().toISOString(), stale: false };
    if (!d.USD || !d.EUR) throw new Error('parse');
    cache = { t: Date.now(), d }; return d;
  } catch (e) {
    if (cache.d) return { ...cache.d, stale: true };
    throw new Error('TCMB kurlarına ulaşılamadı');
  }
}
const body = req => new Promise(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
const send = (res, c, o, h = {}) => { res.writeHead(c, { 'Content-Type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
const sid = req => ((req.headers.cookie || '').match(/sid=([a-f0-9]+)/) || [])[1];
function valid(b) {
  const a = +b.amount, t = +b.tl;
  if (!['XAU', 'USD', 'EUR'].includes(b.type) || !(a > 0) || !(t > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return null;
  return [b.date, b.type, a, t, String(b.note || '').slice(0, 200)];
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  if (FILES[p]) {
    const f = FILES[p];
    res.writeHead(200, { 'Content-Type': (MIME[f.split('.').pop()] || 'text/plain') + '; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, f)));
  }
  if (!p.startsWith('/api/')) return send(res, 404, { error: 'Yok' });
  if (p === '/api/login' && req.method === 'POST') {
    const b = await body(req);
    if (b.user === USER && b.pass === PASS) {
      const s = crypto.randomBytes(24).toString('hex'); sessions.add(s);
      return send(res, 200, { ok: 1 }, { 'Set-Cookie': `sid=${s}; HttpOnly; Path=/; SameSite=Strict; Max-Age=2592000` });
    }
    return send(res, 401, { error: 'Kullanıcı adı veya şifre hatalı' });
  }
  if (!sessions.has(sid(req))) return send(res, 401, { error: 'Oturum yok' });
  try {
    if (p === '/api/logout') { sessions.delete(sid(req)); return send(res, 200, { ok: 1 }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' }); }
    if (p === '/api/rates') return send(res, 200, await rates());
    if (p === '/api/entries' && req.method === 'GET') return send(res, 200, db.prepare('SELECT * FROM entries ORDER BY date DESC,id DESC').all());
    if (p === '/api/entries' && req.method === 'POST') {
      const v = valid(await body(req)); if (!v) return send(res, 400, { error: 'Geçersiz veri' });
      return send(res, 200, { id: db.prepare('INSERT INTO entries(date,type,amount,tl,note) VALUES(?,?,?,?,?)').run(...v).lastInsertRowid });
    }
    const m = p.match(/^\/api\/entries\/(\d+)$/);
    if (m && req.method === 'PUT') {
      const v = valid(await body(req)); if (!v) return send(res, 400, { error: 'Geçersiz veri' });
      db.prepare('UPDATE entries SET date=?,type=?,amount=?,tl=?,note=? WHERE id=?').run(...v, m[1]); return send(res, 200, { ok: 1 });
    }
    if (m && req.method === 'DELETE') { db.prepare('DELETE FROM entries WHERE id=?').run(m[1]); return send(res, 200, { ok: 1 }); }
    send(res, 404, { error: 'Yok' });
  } catch (e) { send(res, 500, { error: e.message }); }
}).listen(PORT, '0.0.0.0', () => console.log('Birikim Takip: http://localhost:' + PORT));
