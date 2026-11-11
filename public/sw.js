// Service worker: makes the game installable and playable offline.
// Strategy: stale-while-revalidate for same-origin GETs, so a new deploy shows up on the next launch.
const CACHE = 'labyrinth-run-v2';
const SHELL = [
  '/', '/index.html', '/css/style.css', '/manifest.webmanifest',
  '/js/main.js', '/js/game.js', '/js/world.js', '/js/player.js', '/js/chaser.js', '/js/models.js', '/js/textures.js',
  '/js/fx.js', '/js/audio.js', '/js/input.js', '/js/ui.js', '/js/missions.js', '/js/storage.js', '/js/config.js', '/js/cloud.js',
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

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/healthz' || url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || (req.mode === 'navigate' ? cache.match('/index.html') : Response.error());
  }));
});
