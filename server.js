// Zero-dependency static file server for Labyrinth Run.
// Works locally (`npm start`) and on Render (reads PORT, binds 0.0.0.0).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
// Player data lives on disk. On Render, attach a Disk and set DATA_DIR to its mount path (e.g. /var/data).
const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const DB_FILE = path.join(DATA_DIR, 'players.json');
const MAX_PLAYERS = 100000, MAX_BODY = 24 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let db = {};
try { fs.mkdirSync(DATA_DIR, { recursive: true }); db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { /* first run */ }
let dirty = false;
function flush() {
  if (!dirty) return;
  dirty = false;
  const tmp = `${DB_FILE}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); } catch (e) { dirty = true; console.error('could not save player data:', e.message); }
}
function scheduleFlush() { if (!dirty) { dirty = true; setTimeout(flush, 1500).unref(); } }

const hits = new Map();                         // naive per-IP rate limit: 120 API calls / minute
function limited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.t > 60000) { hits.set(ip, { t: now, n: 1 }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.n > 120;
}
const num = (v, max = 1e9) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));
const cleanName = (n) => String(n ?? '').replace(/[\u0000-\u001f\u007f<>&"']/g, '').trim().slice(0, 16);

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, tooBig = false; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) tooBig = true; else chunks.push(c); });
    req.on('end', () => {
      if (tooBig) return reject(Object.assign(new Error('too large'), { status: 413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

async function api(req, res, url) {
  if (limited(req)) return json(res, 429, { error: 'slow down' });
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/leaderboard') {
    const id = url.searchParams.get('id');
    const all = Object.entries(db).filter(([, v]) => v.best > 0).sort((a, b) => b[1].best - a[1].best || b[1].distance - a[1].distance);
    const top = all.slice(0, 20).map(([k, v]) => ({ name: v.name || 'Runner', best: v.best, distance: v.distance, me: k === id }));
    const rank = id && UUID.test(id) ? all.findIndex(([k]) => k === id) + 1 : 0;
    return json(res, 200, { top, rank: rank || null, players: all.length });
  }
  const m = p.match(/^\/api\/save\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1].toLowerCase();
    if (req.method === 'GET') return db[id] ? json(res, 200, { name: db[id].name, save: db[id].save }) : json(res, 404, { error: 'not found' });
    if (req.method === 'PUT') {
      let body;
      try { body = await readBody(req); } catch (e) { return json(res, e.status || 400, { error: e.message }); }
      const save = body.save;
      if (!save || typeof save !== 'object' || Array.isArray(save)) return json(res, 400, { error: 'save must be an object' });
      if (!db[id] && Object.keys(db).length >= MAX_PLAYERS) return json(res, 507, { error: 'full' });
      db[id] = { name: cleanName(body.name), save, best: num(save.best), distance: num(save.bestDistance), runs: num(save.totalRuns), updated: Date.now() };
      scheduleFlush();
      return json(res, 200, { ok: true });
    }
  }
  return json(res, m ? 400 : 404, { error: 'bad request' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.txt']);

// Small in-memory cache of compressed payloads (the whole game is ~1 MB).
const cache = new Map();

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveFile(req, res, file) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const vendored = file.includes(`${path.sep}vendor${path.sep}`);
    const headers = {
      'Content-Type': type,
      ETag: etag,
      // Vendored libs never change for a given deploy; app code revalidates.
      'Cache-Control': vendored ? 'public, max-age=86400' : 'no-cache',
      ...(file.endsWith(`${path.sep}sw.js`) ? { 'Service-Worker-Allowed': '/' } : {}),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    };
    if (req.headers['if-none-match'] === etag) return send(res, 304, headers);

    const wantsGzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (req.method === 'HEAD') return send(res, 200, headers);

    if (wantsGzip) {
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
      const hit = cache.get(file);
      if (hit && hit.etag === etag) return send(res, 200, headers, hit.buf);
      fs.readFile(file, (e, data) => {
        if (e) return notFound(res);
        const buf = zlib.gzipSync(data, { level: 6 });
        cache.set(file, { etag, buf });
        send(res, 200, headers, buf);
      });
    } else {
      headers['Content-Length'] = st.size;
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    }
  });
}

function notFound(res) {
  send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
}

const server = http.createServer((req, res) => {
  let url, pathname;
  try {
    url = new URL(req.url, 'http://x');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, { 'Content-Type': 'text/plain' }, 'Bad request');
  }
  if (pathname.startsWith('/api/')) {
    return api(req, res, url).catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { Allow: 'GET, HEAD' }, 'Method not allowed');
  }
  if (pathname === '/healthz') {
    return send(res, 200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }, 'ok');
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return notFound(res); // path traversal guard
  serveFile(req, res, file);
});

server.listen(PORT, HOST, () => {
  console.log(`Labyrinth Run listening on http://${HOST}:${PORT}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { flush(); server.close(() => process.exit(0)); });
}
