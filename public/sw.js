// Service worker: makes the game installable and playable offline.
//  * App code (HTML / JS / CSS / manifest): NETWORK FIRST, so the page and its scripts are always the same version.
//    If the network is slow (>4 s) or offline, the last cached copy is used.
//  * Vendor libraries and icons: stale-while-revalidate (they only change with a new deploy).
const CACHE = 'labyrinth-run-v9';
const SHELL = [
  '/', '/index.html', '/css/style.css', '/manifest.webmanifest',
  '/js/main.js', '/js/game.js', '/js/world.js', '/js/track.js', '/js/player.js', '/js/chaser.js', '/js/models.js', '/js/textures.js',
  '/js/fx.js', '/js/post.js', '/js/split.js', '/js/kaiju.js', '/js/audio.js', '/js/input.js', '/js/ui.js', '/js/missions.js', '/js/storage.js', '/js/config.js', '/js/cloud.js', '/js/net.js', '/js/ghost.js', '/js/coop.js',
  '/vendor/three/three.module.js', '/vendor/three/three.core.js',
  '/vendor/three/addons/postprocessing/EffectComposer.js', '/vendor/three/addons/postprocessing/RenderPass.js',
  '/vendor/three/addons/postprocessing/UnrealBloomPass.js', '/vendor/three/addons/postprocessing/OutputPass.js',
  '/vendor/three/addons/postprocessing/ShaderPass.js', '/vendor/three/addons/postprocessing/Pass.js',
  '/vendor/three/addons/postprocessing/MaskPass.js', '/vendor/three/addons/shaders/CopyShader.js',
  '/vendor/three/addons/shaders/LuminosityHighPassShader.js', '/vendor/three/addons/shaders/OutputShader.js',
  '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isCode = (url) => url.pathname === '/' || /\.(html|js|css|webmanifest)$/.test(url.pathname) && !url.pathname.startsWith('/vendor/');

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || (req.mode === 'navigate' ? cache.match('/index.html') : Response.error());
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/healthz' || url.pathname.startsWith('/api/')) return;
  e.respondWith(isCode(url) ? networkFirst(req) : staleWhileRevalidate(req));
});
