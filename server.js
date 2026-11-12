// Zero-dependency static file server for Labyrinth Run.
// Works locally (`npm start`) and on Render (reads PORT, binds 0.0.0.0).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';

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

// Daily challenge: one shared seed per UTC day, with its own leaderboard (best score per player per day, last 4 days kept).
const DAILY_FILE = path.join(DATA_DIR, 'daily.json');
let daily = {};
try { daily = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf8')); } catch { /* first run */ }
let dailyDirty = false;
function scheduleDailyFlush() {
  if (dailyDirty) return; dailyDirty = true;
  setTimeout(() => { dailyDirty = false; try { fs.writeFileSync(`${DAILY_FILE}.tmp`, JSON.stringify(daily)); fs.renameSync(`${DAILY_FILE}.tmp`, DAILY_FILE); } catch (e) { console.error('could not save daily data:', e.message); } }, 1500).unref();
}
const utcDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
const validDay = (d) => /^\d{8}$/.test(d) && (d === utcDay() || d === utcDay(-1) || d === utcDay(1));    // tolerate clocks a day off

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
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 20));
    const top = all.slice(0, limit).map(([k, v]) => ({ name: v.name || 'Runner', best: v.best, distance: v.distance, me: k === id }));
    const rank = id && UUID.test(id) ? all.findIndex(([k]) => k === id) + 1 : 0;
    return json(res, 200, { top, rank: rank || null, players: all.length });
  }
  if (p === '/api/daily') {
    if (req.method === 'GET') {
      const date = url.searchParams.get('date') || utcDay(), id = url.searchParams.get('id');
      if (!/^\d{8}$/.test(date)) return json(res, 400, { error: 'bad date' });
      const day = daily[date] || {}, all = Object.entries(day).sort((a, b) => b[1].score - a[1].score || b[1].dist - a[1].dist);
      const rank = id && UUID.test(id) ? all.findIndex(([k]) => k === id.toLowerCase()) + 1 : 0;
      return json(res, 200, { date, top: all.slice(0, 10).map(([k, v]) => ({ name: v.name, score: v.score, dist: v.dist, me: k === (id || '').toLowerCase() })), rank: rank || null, players: all.length });
    }
    if (req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch (e) { return json(res, e.status || 400, { error: e.message }); }
      const id = String(body.id || '').toLowerCase(), date = String(body.date || '');
      if (!UUID.test(id) || !validDay(date)) return json(res, 400, { error: 'bad request' });
      const score = num(body.score, 5e7), dist = num(body.dist, 5e5);
      const day = daily[date] || (daily[date] = {});
      if (!day[id] && Object.keys(day).length >= 20000) return json(res, 507, { error: 'full' });
      if (!day[id] || score > day[id].score) day[id] = { name: cleanName(body.name) || 'Runner', score, dist, at: Date.now() };
      for (const k of Object.keys(daily).sort().slice(0, -4)) delete daily[k];                  // keep the last 4 days
      scheduleDailyFlush();
      const all = Object.entries(day).sort((a, b) => b[1].score - a[1].score || b[1].dist - a[1].dist);
      return json(res, 200, { ok: true, rank: all.findIndex(([k]) => k === id) + 1, players: all.length, best: day[id].score });
    }
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
  '.mp3': 'audio/mpeg',
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

// ---------------------------------------------------------------- multiplayer rooms (WebSocket, 2 players per room)
// The server only matchmakes and relays: every phone simulates its own runner on the same seeded maze.
const ROOMS = new Map();                                   // code -> room
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O/1/I/L lookalikes
const MAX_ROOMS = 2000, ROOM_IDLE_MS = 30 * 60 * 1000, REJOIN_MS = 15000;     // a dropped phone has 15 s to come back mid-match
const wsSend = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const newCode = () => { for (let n = 0; n < 50; n++) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]; if (!ROOMS.has(c)) return c; } return null; };

function leaveRoom(ws) {
  const room = ws.room; if (!room) return;
  ws.room = null;
  clearTimeout(ws.awayTimer); ws.away = false;
  room.players = room.players.filter((p) => p !== ws); room.rematch = null;
  for (const p of room.players) { wsSend(p, { t: 'peerLeft' }); p.slot = 0; }               // the remaining player becomes the host
  if (!room.players.length || room.players.every((p) => p.away)) { for (const p of room.players) clearTimeout(p.awayTimer); ROOMS.delete(room.code); } else room.state = 'lobby';
}

/** A socket closed. Mid-match the slot is held for REJOIN_MS so a flaky connection does not forfeit the game. */
function dropped(ws) {
  const room = ws.room; if (!room || ws.away) return;
  if (room.state === 'playing' && room.players.length === 2 && ws.sid && room.players.every((p) => p === ws || !p.away)) {
    ws.away = true; ws.awayTimer = setTimeout(() => leaveRoom(ws), REJOIN_MS);
    for (const p of room.players) if (p !== ws) wsSend(p, { t: 'peerAway', ms: REJOIN_MS });
    return;
  }
  leaveRoom(ws);
}

function startMatch(room) {
  room.state = 'playing'; room.seed = (Math.random() * 1e9) | 0; room.last = Date.now(); room.rematch = null;
  for (const p of room.players) wsSend(p, { t: 'go', seed: room.seed });
}

function handleMessage(ws, msg) {
  const room = ws.room;
  switch (msg.t) {
    case 'create': {
      if (room) leaveRoom(ws);
      if (ROOMS.size >= MAX_ROOMS) return wsSend(ws, { t: 'error', msg: 'The server is busy right now. Try again in a minute.' });
      const code = newCode(); if (!code) return wsSend(ws, { t: 'error', msg: 'Could not create a room.' });
      ws.name = cleanName(msg.name) || 'Runner'; ws.skin = String(msg.skin || '').slice(0, 24);
      const r = { code, players: [ws], state: 'lobby', seed: 0, last: Date.now() };
      ROOMS.set(code, r); ws.room = r; ws.slot = 0;
      ws.sid = randomBytes(8).toString('hex');
      return wsSend(ws, { t: 'created', code, you: 0, name: ws.name, sid: ws.sid });
    }
    case 'join': {
      if (room) leaveRoom(ws);
      const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      const r = ROOMS.get(code);
      if (!r) return wsSend(ws, { t: 'error', msg: 'No room with that code.' });
      if (r.players.length >= 2) return wsSend(ws, { t: 'error', msg: 'That room is already full.' });
      if (r.state === 'playing') return wsSend(ws, { t: 'error', msg: 'That match has already started.' });
      ws.name = cleanName(msg.name) || 'Runner'; ws.skin = String(msg.skin || '').slice(0, 24);
      r.players.push(ws); ws.room = r; ws.slot = 1; r.last = Date.now();
      const host = r.players[0];
      ws.sid = randomBytes(8).toString('hex');
      wsSend(ws, { t: 'joined', code, you: 1, name: ws.name, sid: ws.sid, peer: { name: host.name, skin: host.skin } });
      return wsSend(host, { t: 'peer', peer: { name: ws.name, skin: ws.skin } });
    }
    case 'start': {
      if (!room || ws.slot !== 0 || room.players.length < 2) return;
      return startMatch(room);
    }
    case 'rematch': {                                      // both players asked: start a fresh match with a new seed
      if (!room || room.players.length < 2 || room.players.some((p) => p.away)) return;
      room.rematch = room.rematch || new Set(); room.rematch.add(ws.slot); room.last = Date.now();
      if (room.rematch.size >= 2) return startMatch(room);
      for (const p of room.players) if (p !== ws) wsSend(p, { t: 'rematch' });
      return;
    }
    case 'rejoin': {                                       // a phone that dropped mid-match takes its slot back
      const r2 = ROOMS.get(String(msg.code || '').toUpperCase().slice(0, 4)), sid = String(msg.sid || '');
      const old = r2 && r2.players.find((p) => p.sid === sid && p.away);
      if (!old || !sid) return wsSend(ws, { t: 'error', msg: 'Could not rejoin the match.', fatal: true });
      clearTimeout(old.awayTimer); old.away = false; old.room = null;
      Object.assign(ws, { name: old.name, skin: old.skin, sid: old.sid, slot: old.slot, room: r2, away: false });
      r2.players = r2.players.map((p) => (p === old ? ws : p)); r2.last = Date.now();
      const peer = r2.players.find((p) => p !== ws);
      wsSend(ws, { t: 'rejoined', code: r2.code, you: ws.slot, peer: peer ? { name: peer.name, skin: peer.skin } : null });
      if (peer) wsSend(peer, { t: 'peerBack' });
      return;
    }
    case 'state': case 'event': {                          // relay to the other player untouched (size-capped by maxPayload)
      if (!room) return;
      room.last = Date.now();
      for (const p of room.players) if (p !== ws) wsSend(p, { ...msg, from: ws.slot });
      return;
    }
    case 'over': { if (room) { room.state = 'lobby'; room.last = Date.now(); } return; }
    case 'leave': return leaveRoom(ws);
    case 'ping': return wsSend(ws, { t: 'pong' });
    default: return;
  }
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  let pathname = '';
  try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* ignore */ }
  if (pathname !== '/ws' || limited(req)) { socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
wss.on('connection', (ws) => {
  ws.alive = true; ws.room = null; ws.slot = 0; ws.budget = 60; ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (data) => {
    if (--ws.budget < 0) return;                                           // ~60 msgs/s burst budget, refilled below
    let msg; try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
    if (msg && typeof msg === 'object' && typeof msg.t === 'string') handleMessage(ws, msg);
  });
  ws.on('close', () => dropped(ws));
  ws.on('error', () => dropped(ws));
});
setInterval(() => {                                                        // heartbeat, rate-limit refill and idle-room cleanup
  const now = Date.now();
  for (const ws of wss.clients) { ws.budget = 60; if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { /* ignore */ } }
  for (const [code, r] of ROOMS) if (now - r.last > ROOM_IDLE_MS) { for (const p of r.players) { wsSend(p, { t: 'error', msg: 'The room timed out.' }); p.room = null; } ROOMS.delete(code); }
}, 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Labyrinth Run listening on http://${HOST}:${PORT}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { flush(); server.close(() => process.exit(0)); });
}
