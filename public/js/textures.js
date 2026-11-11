// Procedural, tileable PBR-ish textures for every biome. No image assets needed.
import * as THREE from 'three';

export const TILE = 4; // world units covered by one wall/floor texture tile

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const hex = (n) => ({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });

/** Draw `fn(x,y)` at every wrapped offset so edges tile seamlessly. */
function wrap(S, x, y, pad, fn) {
  for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
    const px = x + ox, py = y + oy;
    if (px > -pad && px < S + pad && py > -pad && py < S + pad) fn(px, py);
  }
}

function speckle(ctx, S, rand, amount, light = 255, dark = 0) {
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] = Math.max(dark, Math.min(light, d[i] + n));
    d[i + 1] = Math.max(dark, Math.min(light, d[i + 1] + n));
    d[i + 2] = Math.max(dark, Math.min(light, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function grayBump(src) {
  const S = src.width, c = canvas(S), x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  x.putImageData(img, 0, 0);
  return c;
}

function crack(ctx, S, rand, color, width, len, branchChance = 0.12) {
  const walk = (x, y, a, n, w) => {
    ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const nx = x + Math.cos(a) * 9, ny = y + Math.sin(a) * 9;
      wrap(S, 0, 0, 0, () => {});
      for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
        ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(nx + ox, ny + oy); ctx.stroke();
      }
      x = (nx + S) % S; y = (ny + S) % S;
      a += (rand() - 0.5) * 0.9;
      if (rand() < branchChance && w > 1) walk(x, y, a + (rand() > 0.5 ? 1 : -1) * 0.8, Math.floor(n * 0.5), w * 0.6);
    }
  };
  walk(rand() * S, rand() * S, rand() * 6.28, len, width);
}

// ---------------------------------------------------------------- WALLS
function hedgeWall(S = 512) {
  const rand = rng(11), c = canvas(S), x = c.getContext('2d');
  x.fillStyle = '#0d2412'; x.fillRect(0, 0, S, S);
  const greens = ['#143d1c', '#1b5227', '#236b30', '#2e8a3b', '#3aa549', '#0f2f17'];
  for (let layer = 0; layer < 3; layer++) {
    const n = 1100 - layer * 200;
    for (let i = 0; i < n; i++) {
      const px = rand() * S, py = rand() * S, r = 6 + rand() * 11 - layer * 2, rot = rand() * 6.28;
      const col = greens[Math.floor(rand() * greens.length)];
      wrap(S, px, py, r * 2, (wx, wy) => {
        x.save(); x.translate(wx, wy); x.rotate(rot);
        x.fillStyle = col; x.globalAlpha = 0.85;
        x.beginPath(); x.ellipse(0, 0, r, r * 0.45, 0, 0, 6.28); x.fill();
        x.globalAlpha = 0.35; x.strokeStyle = '#8be08f'; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(-r, 0); x.lineTo(r, 0); x.stroke();
        x.restore();
      });
    }
  }
  // a few wild roses / glowing berries
  for (let i = 0; i < 26; i++) {
    const px = rand() * S, py = rand() * S;
    wrap(S, px, py, 8, (wx, wy) => {
      x.fillStyle = rand() > 0.5 ? '#c2185b' : '#ffcf4a';
      x.beginPath(); x.arc(wx, wy, 2.6 + rand() * 2, 0, 6.28); x.fill();
    });
  }
  speckle(x, S, rand, 26);
  const em = canvas(S), ex = em.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  return { map: c, bump: grayBump(c), emissive: null, bumpScale: 2.2, rough: 0.95 };
}

function stoneWall(S = 512) {
  const rand = rng(23), c = canvas(S), x = c.getContext('2d');
  const em = canvas(S), ex = em.getContext('2d');
  x.fillStyle = '#17141f'; x.fillRect(0, 0, S, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const rows = 8, bh = S / rows;
  for (let r = 0; r < rows; r++) {
    const bw = S / 4, off = (r % 2) * (bw / 2);
    for (let b = -1; b < 5; b++) {
      const bx = b * bw + off, by = r * bh;
      const v = 62 + rand() * 40;
      const tint = rand();
      x.fillStyle = rgb(v + 14 * tint, v + 6, v + 22 * (1 - tint));
      x.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
      // chipped highlight / shadow edges
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(bx + 3, by + 3, bw - 6, 3);
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(bx + 3, by + bh - 7, bw - 6, 4);
    }
  }
  // moss
  for (let i = 0; i < 140; i++) {
    const px = rand() * S, py = rand() * S, r = 6 + rand() * 18;
    wrap(S, px, py, r, (wx, wy) => {
      const g = x.createRadialGradient(wx, wy, 0, wx, wy, r);
      g.addColorStop(0, 'rgba(60,110,50,0.32)'); g.addColorStop(1, 'rgba(60,110,50,0)');
      x.fillStyle = g; x.fillRect(wx - r, wy - r, r * 2, r * 2);
    });
  }
  speckle(x, S, rand, 34);
  // glowing runes carved in a handful of bricks
  ex.strokeStyle = '#ffffff'; ex.lineWidth = 2.5; ex.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const cx = rand() * (S - 60) + 30, cy = (Math.floor(rand() * rows) + 0.5) * bh;
    ex.beginPath();
    const k = Math.floor(rand() * 4);
    if (k === 0) { ex.arc(cx, cy, 11, 0, 6.28); ex.moveTo(cx - 6, cy); ex.lineTo(cx + 6, cy); }
    else if (k === 1) { ex.moveTo(cx - 9, cy + 10); ex.lineTo(cx, cy - 11); ex.lineTo(cx + 9, cy + 10); ex.moveTo(cx - 5, cy + 2); ex.lineTo(cx + 5, cy + 2); }
    else if (k === 2) { ex.moveTo(cx - 10, cy - 10); ex.lineTo(cx + 10, cy + 10); ex.moveTo(cx + 10, cy - 10); ex.lineTo(cx - 10, cy + 10); ex.arc(cx, cy, 13, 0, 6.28); }
    else { ex.moveTo(cx, cy - 12); ex.lineTo(cx, cy + 12); ex.moveTo(cx - 9, cy - 4); ex.lineTo(cx + 9, cy - 4); ex.moveTo(cx - 6, cy + 5); ex.lineTo(cx + 6, cy + 5); }
    ex.stroke();
  }
  return { map: c, bump: grayBump(c), emissive: em, bumpScale: 2.6, rough: 0.92 };
}

function crystalWall(S = 512) {
  const rand = rng(37), c = canvas(S), x = c.getContext('2d');
  const em = canvas(S), ex = em.getContext('2d');
  x.fillStyle = '#0a1c2e'; x.fillRect(0, 0, S, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const cols = ['#0d2c47', '#12405f', '#0a233a', '#175a7c', '#0e3550', '#1b6f8e'];
  for (let i = 0; i < 220; i++) {
    const px = rand() * S, py = rand() * S, r = 22 + rand() * 46, col = cols[Math.floor(rand() * cols.length)];
    const a = rand() * 6.28, pts = 3 + Math.floor(rand() * 3);
    wrap(S, px, py, r, (wx, wy) => {
      x.beginPath();
      for (let k = 0; k < pts; k++) { const ang = a + (k / pts) * 6.28; x.lineTo(wx + Math.cos(ang) * r * (0.6 + rand() * 0.4), wy + Math.sin(ang) * r * (0.6 + rand() * 0.4)); }
      x.closePath(); x.fillStyle = col; x.globalAlpha = 0.9; x.fill();
      x.globalAlpha = 0.5; x.strokeStyle = 'rgba(160,240,255,0.5)'; x.lineWidth = 1.3; x.stroke(); x.globalAlpha = 1;
    });
  }
  speckle(x, S, rand, 22);
  for (let i = 0; i < 4; i++) crack(ex, S, rand, 'rgba(125,243,255,0.8)', 2.4, 34);
  for (let i = 0; i < 60; i++) {
    const px = rand() * S, py = rand() * S;
    ex.fillStyle = 'rgba(190,250,255,0.9)'; ex.beginPath(); ex.arc(px, py, 1 + rand() * 2.4, 0, 6.28); ex.fill();
  }
  return { map: c, bump: grayBump(c), emissive: em, bumpScale: 3, rough: 0.55 };
}

function basaltWall(S = 512) {
  const rand = rng(53), c = canvas(S), x = c.getContext('2d');
  const em = canvas(S), ex = em.getContext('2d');
  x.fillStyle = '#1a0f0c'; x.fillRect(0, 0, S, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  // hexagonal-ish columns
  const hs = 64;
  for (let r = -1; r < S / (hs * 0.87) + 1; r++) for (let q = -1; q < S / hs + 1; q++) {
    const cx = q * hs + (r % 2 ? hs / 2 : 0), cy = r * hs * 0.87;
    const v = 34 + rand() * 26;
    x.fillStyle = rgb(v + 8, v * 0.7, v * 0.65);
    x.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; x.lineTo(cx + Math.cos(a) * hs * 0.56, cy + Math.sin(a) * hs * 0.56); }
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 3; x.stroke();
  }
  speckle(x, S, rand, 26);
  for (let i = 0; i < 9; i++) crack(ex, S, rand, '#ff6a1a', 4, 38);
  ex.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) crack(ex, S, rand, 'rgba(255,200,80,0.7)', 1.6, 30);
  return { map: c, bump: grayBump(c), emissive: em, bumpScale: 3.4, rough: 0.8 };
}

// ---------------------------------------------------------------- FLOORS
function cobbleFloor(S = 512) {
  const rand = rng(71), c = canvas(S), x = c.getContext('2d');
  x.fillStyle = '#0c1a10'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 150; i++) {
    const px = rand() * S, py = rand() * S, r = 16 + rand() * 14, v = 70 + rand() * 40;
    wrap(S, px, py, r, (wx, wy) => {
      const g = x.createRadialGradient(wx - r * 0.3, wy - r * 0.3, 1, wx, wy, r);
      g.addColorStop(0, rgb(v + 20, v + 26, v + 10)); g.addColorStop(1, rgb(v - 20, v - 12, v - 25));
      x.fillStyle = g; x.beginPath(); x.ellipse(wx, wy, r, r * 0.85, rand() * 3, 0, 6.28); x.fill();
    });
  }
  for (let i = 0; i < 90; i++) {
    const px = rand() * S, py = rand() * S, r = 10 + rand() * 20;
    wrap(S, px, py, r, (wx, wy) => { const g = x.createRadialGradient(wx, wy, 0, wx, wy, r); g.addColorStop(0, 'rgba(50,120,45,0.4)'); g.addColorStop(1, 'rgba(50,120,45,0)'); x.fillStyle = g; x.fillRect(wx - r, wy - r, r * 2, r * 2); });
  }
  speckle(x, S, rand, 30);
  return { map: c, bump: grayBump(c), emissive: null, bumpScale: 2.6, rough: 0.9 };
}

function tileFloor(S, seed, base, groutColor, glow) {
  const rand = rng(seed), c = canvas(S), x = c.getContext('2d');
  const em = canvas(S), ex = em.getContext('2d');
  x.fillStyle = groutColor; x.fillRect(0, 0, S, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const n = 4, t = S / n, b = hex(base);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 0.75 + rand() * 0.5;
    x.fillStyle = rgb(b.r * v, b.g * v, b.b * v);
    x.fillRect(i * t + 4, j * t + 4, t - 8, t - 8);
    x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(i * t + 4, j * t + 4, t - 8, 4);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(i * t + 4, j * t + t - 8, t - 8, 4);
  }
  speckle(x, S, rand, 28);
  if (glow) {
    for (let i = 0; i < 6; i++) crack(x, S, rand, 'rgba(0,0,0,0.55)', 2, 22, 0.2);
    ex.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) crack(ex, S, rand, glow, 3.2, 34, 0.15);
  }
  return { map: c, bump: grayBump(c), emissive: glow ? em : null, bumpScale: 2.4, rough: 0.82 };
}

const WALLS = { hedge: hedgeWall, stone: stoneWall, crystal: crystalWall, basalt: basaltWall };
const FLOORS = {
  cobble: () => cobbleFloor(),
  flag: () => tileFloor(512, 81, 0x6d6280, '#120f1a', null),
  slate: () => tileFloor(512, 91, 0x2c5470, '#06131f', '#46d8ff'),
  ember: () => tileFloor(512, 99, 0x4a2a22, '#120807', '#ff5a1a'),
};

// ---------------------------------------------------------------- utility textures
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = canvas(128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function laneRuneTexture() {
  const c = canvas(64, 256), x = c.getContext('2d');
  x.clearRect(0, 0, 64, 256);
  x.strokeStyle = '#fff'; x.lineWidth = 3; x.lineCap = 'round';
  x.globalAlpha = 0.9;
  x.beginPath(); x.moveTo(32, 14); x.lineTo(32, 70); x.stroke();
  x.globalAlpha = 0.45;
  x.beginPath(); x.moveTo(32, 120); x.lineTo(32, 150); x.stroke();
  x.globalAlpha = 0.9;
  x.beginPath(); x.moveTo(32, 190); x.lineTo(32, 238); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function coinTexture() {
  const S = 128, c = canvas(S), x = c.getContext('2d');
  const g = x.createRadialGradient(54, 50, 6, 64, 64, 64);
  g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffcf33'); g.addColorStop(1, '#b8860b');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#7a5200'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 52, 0, 6.28); x.stroke();
  x.strokeStyle = '#fff3a0'; x.lineWidth = 2; x.beginPath(); x.arc(64, 64, 44, 0, 6.28); x.stroke();
  // little labyrinth emblem
  x.strokeStyle = '#8a5a00'; x.lineWidth = 6; x.lineCap = 'square';
  x.beginPath(); x.moveTo(40, 88); x.lineTo(40, 40); x.lineTo(88, 40); x.lineTo(88, 80); x.lineTo(56, 80); x.lineTo(56, 58); x.lineTo(72, 58); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Builds and returns {biomeId: {wall, floor, trim}} materials and the shared utility textures. */
export function buildBiomeMaterials(biomes, maxAniso = 4, onProgress) {
  const out = {};
  const mk = (spec, color, emissiveColor, emissiveIntensity = 1.4) => {
    const tex = (cv, srgb) => {
      if (!cv) return null;
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return new THREE.MeshStandardMaterial({
      map: tex(spec.map, true), bumpMap: tex(spec.bump, false), bumpScale: spec.bumpScale,
      roughness: spec.rough, metalness: 0.05, color,
      emissive: spec.emissive ? emissiveColor : 0x000000, emissiveMap: tex(spec.emissive, true), emissiveIntensity,
    });
  };
  const cacheW = {}, cacheF = {};
  let i = 0;
  for (const b of biomes) {
    cacheW[b.wall] = cacheW[b.wall] || WALLS[b.wall]();
    cacheF[b.floor] = cacheF[b.floor] || FLOORS[b.floor]();
    const accent = new THREE.Color(b.accent);
    out[b.id] = {
      wall: mk(cacheW[b.wall], 0xffffff, accent, b.wall === 'crystal' ? 0.85 : 1.5),
      floor: mk(cacheF[b.floor], 0xffffff, accent, 1.2),
      trim: new THREE.MeshStandardMaterial({ map: null, color: b.trim, roughness: 0.85, metalness: 0.1 }),
    };
    onProgress && onProgress(++i / biomes.length);
  }
  return out;
}
