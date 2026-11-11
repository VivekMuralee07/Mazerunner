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
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { Allow: 'GET, HEAD' }, 'Method not allowed');
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(res, 400, { 'Content-Type': 'text/plain' }, 'Bad request');
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
  process.on(sig, () => server.close(() => process.exit(0)));
}
