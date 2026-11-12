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
function hedgeWall(S = 512, o = {}) {
  const rand = rng(o.seed || 11), c = canvas(S), x = c.getContext('2d');
  x.fillStyle = o.base || '#2a7a2c'; x.fillRect(0, 0, S, S);
  const greens = o.greens || ['#2f9a3c', '#3cb04d', '#4cc85e', '#63da70', '#84e68c', '#27843a'];
  for (let layer = 0; layer < 3; layer++) {
    const n = 1100 - layer * 200;
    for (let i = 0; i < n; i++) {
      const px = rand() * S, py = rand() * S, r = 6 + rand() * 11 - layer * 2, rot = rand() * 6.28;
      const col = greens[Math.floor(rand() * greens.length)];
      wrap(S, px, py, r * 2, (wx, wy) => {
        x.save(); x.translate(wx, wy); x.rotate(rot);
        x.fillStyle = col; x.globalAlpha = 0.85;
        x.beginPath(); x.ellipse(0, 0, r, r * 0.45, 0, 0, 6.28); x.fill();
        x.globalAlpha = 0.4; x.strokeStyle = '#e2ffd8'; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(-r, 0); x.lineTo(r, 0); x.stroke();
        x.restore();
      });
    }
  }
  // flowers / berries
  const fl = o.flowers || ['#c2185b', '#ffcf4a'], nf = o.flowerN ?? 26, fr = o.flowerR || [2.6, 4.6];
  for (let i = 0; i < nf; i++) {
    const px = rand() * S, py = rand() * S, col = fl[Math.floor(rand() * fl.length)], rr = fr[0] + rand() * (fr[1] - fr[0]);
    wrap(S, px, py, 10, (wx, wy) => {
      x.fillStyle = col;
      if (nf > 100) { for (let k = 0; k < 5; k++) { const a = k * 1.2566; x.beginPath(); x.arc(wx + Math.cos(a) * rr * 0.7, wy + Math.sin(a) * rr * 0.7, rr * 0.6, 0, 6.28); x.fill(); } x.fillStyle = '#ffe9a8'; x.beginPath(); x.arc(wx, wy, rr * 0.3, 0, 6.28); x.fill(); }
      else { x.beginPath(); x.arc(wx, wy, rr, 0, 6.28); x.fill(); }
    });
  }
  speckle(x, S, rand, 26);
  const em = canvas(S), ex = em.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  return { map: c, bump: grayBump(c), emissive: null, bumpScale: 2.2, rough: 0.95 };
}

function stoneWall(S = 512, o = {}) {
  const rand = rng(o.seed || 23), c = canvas(S), x = c.getContext('2d');
  const em = canvas(S), ex = em.getContext('2d');
  x.fillStyle = o.base || '#8a785f'; x.fillRect(0, 0, S, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const rows = 8, bh = S / rows;
  for (let r = 0; r < rows; r++) {
    const bw = S / 4, off = (r % 2) * (bw / 2);
    for (let b = -1; b < 5; b++) {
      const bx = b * bw + off, by = r * bh;
      const v = (o.v0 || 152) + rand() * 40;
      const tint = rand(), tt = o.tint || [14, 6, 22];
      x.fillStyle = rgb(v + tt[0] * tint, v + tt[1], v + tt[2] * (1 - tint));
      x.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
      // chipped highlight / shadow edges
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(bx + 3, by + 3, bw - 6, 3);
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(bx + 3, by + bh - 7, bw - 6, 4);
    }
  }
  // moss
  for (let i = 0; i < (o.moss ?? 140); i++) {
    const px = rand() * S, py = rand() * S, r = 6 + rand() * 18;
    wrap(S, px, py, r, (wx, wy) => {
      const g = x.createRadialGradient(wx, wy, 0, wx, wy, r);
      g.addColorStop(0, `rgba(70,140,60,${o.mossA ?? 0.35})`); g.addColorStop(1, 'rgba(70,140,60,0)');
      x.fillStyle = g; x.fillRect(wx - r, wy - r, r * 2, r * 2);
    });
  }
  speckle(x, S, rand, 34);
  for (let i = 0; i < (o.vines ?? 0); i++) {                           // creeping vines
    let px = rand() * S, py = rand() * S, a = rand() * 6.28;
    x.strokeStyle = 'rgba(30,90,35,0.85)'; x.lineWidth = 3; x.lineCap = 'round';
    for (let k = 0; k < 24; k++) {
      const nx = px + Math.cos(a) * 10, ny = py + Math.sin(a) * 10;
      for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) { x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(nx + ox, ny + oy); x.stroke(); }
      if (k % 3 === 0) wrap(S, nx, ny, 8, (wx, wy) => { x.fillStyle = 'rgba(70,170,70,0.9)'; x.beginPath(); x.ellipse(wx, wy, 6, 3, a, 0, 6.28); x.fill(); });
      px = (nx + S) % S; py = (ny + S) % S; a += (rand() - 0.5) * 0.8;
    }
  }
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
  x.fillStyle = '#bfe3f5'; x.fillRect(0, 0, S, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const cols = ['#a4d2ea', '#8cc4e4', '#bfe5f6', '#74b6dc', '#addcf3', '#82c1e2'];
  for (let i = 0; i < 220; i++) {
    const px = rand() * S, py = rand() * S, r = 22 + rand() * 46, col = cols[Math.floor(rand() * cols.length)];
    const a = rand() * 6.28, pts = 3 + Math.floor(rand() * 3);
    wrap(S, px, py, r, (wx, wy) => {
      x.beginPath();
      for (let k = 0; k < pts; k++) { const ang = a + (k / pts) * 6.28; x.lineTo(wx + Math.cos(ang) * r * (0.6 + rand() * 0.4), wy + Math.sin(ang) * r * (0.6 + rand() * 0.4)); }
      x.closePath(); x.fillStyle = col; x.globalAlpha = 0.9; x.fill();
      x.globalAlpha = 0.5; x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.5; x.stroke(); x.globalAlpha = 1;
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
  x.fillStyle = '#b87a58'; x.fillRect(0, 0, S, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  // hexagonal-ish columns
  const hs = 64;
  for (let r = -1; r < S / (hs * 0.87) + 1; r++) for (let q = -1; q < S / hs + 1; q++) {
    const cx = q * hs + (r % 2 ? hs / 2 : 0), cy = r * hs * 0.87;
    const v = 150 + rand() * 40;
    x.fillStyle = rgb(v + 8, v * 0.7, v * 0.65);
    x.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; x.lineTo(cx + Math.cos(a) * hs * 0.56, cy + Math.sin(a) * hs * 0.56); }
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(100,45,25,0.55)'; x.lineWidth = 3; x.stroke();
  }
  speckle(x, S, rand, 26);
  for (let i = 0; i < 9; i++) crack(ex, S, rand, '#ff6a1a', 4, 38);
  ex.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) crack(ex, S, rand, 'rgba(255,200,80,0.7)', 1.6, 30);
  return { map: c, bump: grayBump(c), emissive: em, bumpScale: 3.4, rough: 0.8 };
}

// ---------------------------------------------------------------- FLOORS
function cobbleFloor(S = 512, o = {}) {
  const rand = rng(o.seed || 71), c = canvas(S), x = c.getContext('2d');
  x.fillStyle = o.base || '#56684a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 150; i++) {
    const px = rand() * S, py = rand() * S, r = 16 + rand() * 14, v = (o.v0 || 120) + rand() * 45;
    wrap(S, px, py, r, (wx, wy) => {
      const g = x.createRadialGradient(wx - r * 0.3, wy - r * 0.3, 1, wx, wy, r);
      const t = o.tint || [20, 26, 10];
      g.addColorStop(0, rgb(v + t[0], v + t[1], v + t[2])); g.addColorStop(1, rgb(v - 20, v - 12, v - 25));
      x.fillStyle = g; x.beginPath(); x.ellipse(wx, wy, r, r * 0.85, rand() * 3, 0, 6.28); x.fill();
    });
  }
  for (let i = 0; i < (o.moss ?? 90); i++) {
    const px = rand() * S, py = rand() * S, r = 10 + rand() * 20;
    wrap(S, px, py, r, (wx, wy) => { const g = x.createRadialGradient(wx, wy, 0, wx, wy, r); g.addColorStop(0, 'rgba(50,120,45,0.4)'); g.addColorStop(1, 'rgba(50,120,45,0)'); x.fillStyle = g; x.fillRect(wx - r, wy - r, r * 2, r * 2); });
  }
  const lit = o.litter;                                                 // petals / fallen leaves scattered on the path
  if (lit) for (let i = 0; i < lit.n; i++) {
    const px = rand() * S, py = rand() * S, col = lit.colors[Math.floor(rand() * lit.colors.length)], rr = lit.r * (0.6 + rand() * 0.8), rot = rand() * 6.28;
    wrap(S, px, py, rr * 2, (wx, wy) => { x.save(); x.translate(wx, wy); x.rotate(rot); x.fillStyle = col; x.globalAlpha = 0.9; x.beginPath(); x.ellipse(0, 0, rr, rr * 0.55, 0, 0, 6.28); x.fill(); x.restore(); });
  }
  speckle(x, S, rand, 30);
  return { map: c, bump: grayBump(c), emissive: null, bumpScale: 2.6, rough: 0.9 };
}

function tileFloor(S, seed, base, groutColor, glow, overlay) {
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
  if (overlay) overlay(x, S, rand);
  if (glow) {
    for (let i = 0; i < 6; i++) crack(x, S, rand, 'rgba(0,0,0,0.55)', 2, 22, 0.2);
    ex.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) crack(ex, S, rand, glow, 3.2, 34, 0.15);
  }
  return { map: c, bump: grayBump(c), emissive: glow ? em : null, bumpScale: 2.4, rough: 0.82 };
}

function coralWall(S = 512) {
  const rand = rng(61), c = canvas(S), x = c.getContext('2d');
  x.fillStyle = '#d9b8a0'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) {                                      // sandy mottling
    const px = rand() * S, py = rand() * S, r = 3 + rand() * 12, v = 190 + rand() * 40;
    wrap(S, px, py, r, (wx, wy) => { x.fillStyle = `rgba(${v},${v - 28},${v - 55},0.35)`; x.beginPath(); x.arc(wx, wy, r, 0, 6.28); x.fill(); });
  }
  const cols = ['#ff7f9a', '#ff9a5a', '#f2547d', '#3cc9bd', '#ffb3c7', '#ffd166'];
  for (let i = 0; i < 70; i++) {                                       // branching coral
    const px = rand() * S, py = rand() * S, col = cols[Math.floor(rand() * cols.length)];
    wrap(S, px, py, 60, (wx, wy) => {
      x.strokeStyle = col; x.lineCap = 'round';
      const branch = (bx, by, a, len, w, d) => {
        x.lineWidth = w; x.beginPath(); x.moveTo(bx, by); const nx = bx + Math.cos(a) * len, ny = by + Math.sin(a) * len; x.lineTo(nx, ny); x.stroke();
        if (d > 0) { branch(nx, ny, a - 0.5 - rand() * 0.3, len * 0.72, w * 0.75, d - 1); branch(nx, ny, a + 0.5 + rand() * 0.3, len * 0.72, w * 0.75, d - 1); }
        else { x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.arc(nx, ny, w * 0.7, 0, 6.28); x.fill(); }
      };
      branch(wx, wy, -Math.PI / 2 + (rand() - 0.5) * 1.2, 16 + rand() * 12, 6, 3);
    });
  }
  for (let i = 0; i < 40; i++) {                                       // little shells
    const px = rand() * S, py = rand() * S;
    wrap(S, px, py, 12, (wx, wy) => { x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 2; x.beginPath(); for (let a = 0; a < 12; a += 0.3) x.lineTo(wx + Math.cos(a) * a * 0.9, wy + Math.sin(a) * a * 0.9); x.stroke(); });
  }
  speckle(x, S, rand, 20);
  const em = canvas(S), ex = em.getContext('2d'); ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  return { map: c, bump: grayBump(c), emissive: null, bumpScale: 3, rough: 0.8 };
}

function veinedWall(S = 512) {
  const rand = rng(88), c = canvas(S), x = c.getContext('2d');
  const em = canvas(S), ex = em.getContext('2d');
  x.fillStyle = '#22122c'; x.fillRect(0, 0, S, S); ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const tones = ['#2e1a3a', '#1b0f26', '#35203f', '#241631', '#3a1c34'];
  for (let i = 0; i < 520; i++) {                                         // lumpy, fleshy mottling
    const px = rand() * S, py = rand() * S, r = 6 + rand() * 26, col = tones[Math.floor(rand() * tones.length)];
    wrap(S, px, py, r, (wx, wy) => { x.fillStyle = col; x.globalAlpha = 0.55; x.beginPath(); x.ellipse(wx, wy, r, r * (0.5 + rand() * 0.5), rand() * 3, 0, 6.28); x.fill(); });
  }
  x.globalAlpha = 1;
  for (let i = 0; i < 38; i++) {                                          // tendrils creeping over the surface
    let px = rand() * S, py = rand() * S, a = rand() * 6.28; x.strokeStyle = 'rgba(8,4,14,0.8)'; x.lineWidth = 3 + rand() * 4; x.lineCap = 'round';
    for (let k = 0; k < 22; k++) { const nx = px + Math.cos(a) * 12, ny = py + Math.sin(a) * 12; for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) { x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(nx + ox, ny + oy); x.stroke(); } px = (nx + S) % S; py = (ny + S) % S; a += (rand() - 0.5) * 0.9; }
  }
  speckle(x, S, rand, 22, 255, 0);
  for (let i = 0; i < 12; i++) crack(ex, S, rand, '#ff2a3a', 4.5, 46, 0.18);          // glowing red veins
  ex.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) crack(ex, S, rand, 'rgba(255,150,120,0.55)', 1.6, 40, 0.15);
  for (let i = 0; i < 40; i++) { const px = rand() * S, py = rand() * S, r = 2 + rand() * 5; const g = ex.createRadialGradient(px, py, 0, px, py, r * 2.5); g.addColorStop(0, 'rgba(255,70,60,0.9)'); g.addColorStop(1, 'rgba(255,70,60,0)'); ex.fillStyle = g; ex.fillRect(px - r * 3, py - r * 3, r * 6, r * 6); }
  return { map: c, bump: grayBump(c), emissive: em, bumpScale: 3.6, rough: 0.75 };
}

const WALLS = {
  veined: veinedWall,
  hedge: hedgeWall, stone: stoneWall, crystal: crystalWall, basalt: basaltWall, coral: coralWall,
  blossom: (S) => hedgeWall(S, { seed: 31, base: '#3a8a3a', greens: ['#3a9a44', '#4fb457', '#62c86a', '#7bd882', '#2f8a3c'], flowers: ['#ffb3cf', '#ff8fb8', '#ffe0ec', '#ffffff', '#ffa6c6'], flowerN: 520, flowerR: [3, 6] }),
  autumn: (S) => hedgeWall(S, { seed: 41, base: '#8a3f18', greens: ['#e0701a', '#f08a24', '#d44a1a', '#f2b134', '#b8381a', '#c25a1a', '#8aa52a'], flowers: ['#7a1a10'], flowerN: 18 }),
  mossy: (S) => stoneWall(S, { seed: 51, base: '#4f5a46', v0: 105, tint: [4, 22, 2], moss: 520, mossA: 0.6, vines: 22 }),
};
const FLOORS = {
  cobble: () => cobbleFloor(),
  ash: () => tileFloor(512, 151, 0x4a3f48, '#171116', '#ff3040', (x, S, rand) => { for (let i = 0; i < 700; i++) { const px = rand() * S, py = rand() * S; x.fillStyle = `rgba(${30 + rand() * 50},${20 + rand() * 30},${30 + rand() * 40},0.4)`; x.beginPath(); x.arc(px, py, 1 + rand() * 4, 0, 6.28); x.fill(); } }),
  pinkpath: () => cobbleFloor(512, { seed: 77, base: '#9c8088', v0: 150, tint: [26, 8, 14], moss: 0, litter: { n: 260, colors: ['#ffc2d8', '#ff9fc2', '#ffe3ee'], r: 7 } }),
  leaflitter: () => cobbleFloor(512, { seed: 79, base: '#5a3f26', v0: 100, tint: [24, 10, -4], moss: 0, litter: { n: 280, colors: ['#e0701a', '#f2a23a', '#c4411a', '#e8c04a'], r: 8 } }),
  mossflag: () => tileFloor(512, 133, 0x7f8f78, '#3f4d3a', null, (x, S, rand) => { for (let i = 0; i < 160; i++) { const px = rand() * S, py = rand() * S, r = 8 + rand() * 24; const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(60,140,60,0.55)'); g.addColorStop(1, 'rgba(60,140,60,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } }),
  pearl: () => tileFloor(512, 141, 0xd8c6b4, '#a38f7a', null, (x, S, rand) => { for (let i = 0; i < 90; i++) { const px = rand() * S, py = rand() * S, r = 4 + rand() * 10; x.fillStyle = `hsla(${180 + rand() * 160},70%,85%,0.28)`; x.beginPath(); x.arc(px, py, r, 0, 6.28); x.fill(); } }),
  flag: () => tileFloor(512, 81, 0xb9afc6, '#7a6f88', null),
  slate: () => tileFloor(512, 91, 0xa3c3d6, '#5f8299', '#46d8ff'),
  ember: () => tileFloor(512, 99, 0xc4a089, '#7e503c', '#ff6a2a'),
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
  const GLOSS = { hollow: 0.35, hedge: 0.12, blossom: 0.25, stone: 0.2, autumn: 0.12, crystal: 0.7, jungle: 0.4, lava: 0.45, coral: 0.7 };
  const mk = (spec, color, emissiveColor, emissiveIntensity = 1.4, gloss = 0) => {
    const tex = (cv, srgb) => {
      if (!cv) return null;
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const props = {
      map: tex(spec.map, true), bumpMap: tex(spec.bump, false), bumpScale: spec.bumpScale,
      roughness: spec.rough, metalness: 0.05, color,
      emissive: spec.emissive ? emissiveColor : 0x000000, emissiveMap: tex(spec.emissive, true), emissiveIntensity,
    };
    // floors get a clear-coat so they pick up soft reflections of the sky, like polished / wet stone
    return gloss ? new THREE.MeshPhysicalMaterial({ ...props, clearcoat: gloss, clearcoatRoughness: 0.32 }) : new THREE.MeshStandardMaterial(props);
  };
  const cacheW = {}, cacheF = {};
  let i = 0;
  for (const b of biomes) {
    cacheW[b.wall] = cacheW[b.wall] || WALLS[b.wall]();
    cacheF[b.floor] = cacheF[b.floor] || FLOORS[b.floor]();
    const accent = new THREE.Color(b.accent);
    out[b.id] = {
      wall: mk(cacheW[b.wall], 0xffffff, accent, b.wall === 'crystal' ? 0.7 : b.wall === 'veined' ? 1.9 : 0.9),
      floor: mk(cacheF[b.floor], 0xffffff, accent, 0.7, GLOSS[b.id] || 0.2),
      trim: new THREE.MeshStandardMaterial({ map: null, color: b.trim, roughness: 0.85, metalness: 0.1 }),
    };
    onProgress && onProgress(++i / biomes.length);
  }
  return out;
}

/** Soft gradients used for fake ambient occlusion and sun shafts. */
export function shadingTextures() {
  const mk = (w, h, paint) => { const c = canvas(w, h), x = c.getContext('2d'); paint(x, w, h); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; };
  const aoH = mk(64, 4, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(10,20,10,1)'); g.addColorStop(0.35, 'rgba(10,20,10,0.45)'); g.addColorStop(1, 'rgba(10,20,10,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const aoV = mk(4, 64, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(10,20,10,0)'); g.addColorStop(0.6, 'rgba(10,20,10,0.35)'); g.addColorStop(1, 'rgba(10,20,10,0.95)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const shaft = mk(64, 256, (x, w, h) => {
    const img = x.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = (i / (w - 1)) * 2 - 1, v = j / (h - 1), a = Math.pow(Math.max(0, 1 - Math.abs(u)), 1.6) * Math.pow(1 - v, 0.9) * Math.min(1, v * 8);
      const k = (j * w + i) * 4; img.data[k] = 255; img.data[k + 1] = 245; img.data[k + 2] = 215; img.data[k + 3] = Math.floor(a * 255);
    }
    x.putImageData(img, 0, 0);
  });
  return { aoH, aoV, shaft };
}

/** Turn arrow pointing LEFT. `plate` = orange sign board (for walls); otherwise a bare painted arrow (for the floor). */
export function arrowTexture(plate) {
  const S = 256, c = canvas(S), x = c.getContext('2d');
  if (plate) {
    x.fillStyle = '#ff7a1a'; x.beginPath(); x.roundRect(8, 8, S - 16, S - 16, 34); x.fill();
    x.strokeStyle = '#fff3d0'; x.lineWidth = 10; x.stroke();
  }
  x.fillStyle = plate ? '#ffffff' : '#ff7a1a'; x.strokeStyle = plate ? '#ffffff' : '#fff3d0'; x.lineWidth = plate ? 0 : 10; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(48, 128); x.lineTo(124, 52); x.lineTo(124, 100); x.lineTo(208, 100); x.lineTo(208, 156); x.lineTo(124, 156); x.lineTo(124, 204); x.closePath();
  if (!plate) x.stroke(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
