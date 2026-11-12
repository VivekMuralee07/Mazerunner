// All 3D assets are generated from primitives – no downloads, no licences to worry about.
import * as THREE from 'three';
import { TILE } from './textures.js';

// ---------------------------------------------------------------- geometry helpers
const geoCache = new Map();
const cached = (key, make) => { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; };

/** Box whose UVs are scaled so a texture tile always covers `tile` world units. */
export function boxGeo(w, h, d, tile = TILE) {
  return cached(`b${w}|${h}|${d}|${tile}`, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * faces[f][0] / tile, uv.getY(i) * faces[f][1] / tile);
    }
    return g;
  });
}

export function planeGeo(w, d, tile = 6) {
  return cached(`p${w}|${d}|${tile}`, () => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
    return g;
  });
}

/** Ramp wedge: front edge at z=0 (height 0) rising to height h at z=-len. */
export function wedgeGeo(w, h, len) {
  return cached(`w${w}|${h}|${len}`, () => {
    const hw = w / 2;
    const A = [-hw, 0, 0], B = [hw, 0, 0], C = [-hw, 0, -len], D = [hw, 0, -len], E = [-hw, h, -len], F = [hw, h, -len];
    const pos = [], uvs = [];
    const tri = (p, q, r, uvq) => { pos.push(...p, ...q, ...r); uvs.push(...uvq); };
    const quad = (a, b, c, d) => { tri(a, b, c, [0, 0, 1, 0, 1, 1]); tri(a, c, d, [0, 0, 1, 1, 0, 1]); };
    quad(A, B, F, E);       // slope
    quad(A, C, D, B);       // underside
    quad(D, C, E, F);       // back
    tri(A, E, C, [0, 0, 1, 1, 0, 1]);
    tri(B, D, F, [0, 0, 1, 0, 1, 1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  });
}

const sphereGeo = (r, ws = 16, hs = 12) => cached(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cylGeo = (rt, rb, h, seg = 12) => cached(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const coneGeo = (r, h, seg = 8) => cached(`k${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const capsuleGeo = (r, l) => cached(`cap${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 12));

const mesh = (geo, mat, x = 0, y = 0, z = 0, cast = true, receive = false) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; return m;
};

// ---------------------------------------------------------------- shared materials
const mkCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function stripeTexture(a, b) {                 // diagonal hazard stripes
  const S = 128, c = mkCanvas(S), x = c.getContext('2d');
  x.fillStyle = a; x.fillRect(0, 0, S, S); x.fillStyle = b;
  for (let i = -S; i < S * 2; i += 64) { x.beginPath(); x.moveTo(i, S); x.lineTo(i + 32, S); x.lineTo(i + 32 + S, 0); x.lineTo(i + S, 0); x.closePath(); x.fill(); }
  return tex(c);
}
function chevronTexture(bg, fg) {              // forward-pointing arrows for climbable slabs
  const S = 128, c = mkCanvas(S), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, S, S);
  x.strokeStyle = fg; x.lineWidth = 16; x.lineJoin = 'miter'; x.lineCap = 'butt';
  x.beginPath(); x.moveTo(14, 92); x.lineTo(64, 40); x.lineTo(114, 92); x.stroke();
  return tex(c);
}
let gateTexCache = null;                        // sealed gate: crimson slab, white X, golden frame
function gateTexture() {
  if (gateTexCache) return gateTexCache;
  const S = 256, c = mkCanvas(S), x = c.getContext('2d');
  x.fillStyle = '#e0223c'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#ffd23f'; x.lineWidth = 16; x.strokeRect(8, 8, S - 16, S - 16);
  x.strokeStyle = '#ffffff'; x.lineWidth = 26; x.lineCap = 'round';
  x.beginPath(); x.moveTo(62, 62); x.lineTo(194, 194); x.moveTo(194, 62); x.lineTo(62, 194); x.stroke();
  x.lineWidth = 8; x.strokeStyle = '#7a0a1c'; x.beginPath(); x.arc(128, 128, 104, 0, 6.28); x.stroke();
  gateTexCache = tex(c, false); return gateTexCache;
}

export function makeSharedMaterials(glowTex, runeTex) {
  const emissive = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
  const solid = (color, em = 0.18, rough = 0.5, metal = 0.1) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: color, emissiveIntensity: em });
  const yb = stripeTexture('#ffd000', '#1b1b22'), rw = stripeTexture('#ff2a4a', '#ffffff');
  const chev = chevronTexture('#22d3bd', '#ffffff'), chevRamp = chevronTexture('#7af0a8', '#0fa88a');
  return {
    iron: new THREE.MeshStandardMaterial({ color: 0x8a90a0, roughness: 0.45, metalness: 0.6 }),
    darkStone: new THREE.MeshStandardMaterial({ color: 0x6a6578, roughness: 0.9 }),
    hazard: emissive(0xff6a00, 1.6), danger: emissive(0xff2a55, 1.8), safe: emissive(0xffd23f, 1.4),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc933, roughness: 0.3, metalness: 0.8, emissive: 0xb37a00, emissiveIntensity: 0.5 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb04a }),
    rope: new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 }),
    // obstacle palette: saturated + slightly self-lit so they pop against the muted maze
    stripeYB: new THREE.MeshStandardMaterial({ map: yb, roughness: 0.5, emissive: 0xffffff, emissiveMap: yb, emissiveIntensity: 0.22 }),
    stripeRW: new THREE.MeshStandardMaterial({ map: rw, roughness: 0.5, emissive: 0xffffff, emissiveMap: rw, emissiveIntensity: 0.22 }),
    chevron: new THREE.MeshStandardMaterial({ map: chev, roughness: 0.45, emissive: 0xffffff, emissiveMap: chev, emissiveIntensity: 0.25 }),
    chevronRamp: new THREE.MeshStandardMaterial({ map: chevRamp, roughness: 0.45, emissive: 0xffffff, emissiveMap: chevRamp, emissiveIntensity: 0.25 }),
    orange: solid(0xff5a00, 0.3), purple: solid(0x7a2cff, 0.3), crimson: solid(0xd9203a, 0.28, 0.55), teal: solid(0x0fb8a5, 0.28),
    spikeRed: solid(0xff1f3d, 0.5, 0.35, 0.2), white: solid(0xffffff, 0.3, 0.4),
    gateFace: new THREE.MeshBasicMaterial({ map: gateTexture() }),
    glowTex, runeTex,
    glowSprite: (color, opacity = 0.85) => new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: opacity * 0.55, depthWrite: false }),
  };
}

// ---------------------------------------------------------------- obstacles
// Each builder returns a Group whose origin is the FRONT-CENTRE on the floor; it extends toward -z.

export function buildLow(biomeMats, S) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(2.0, 0.62, 0.8, 1), S.stripeYB, 0, 0.31, -0.4, true, true));
  g.add(mesh(boxGeo(2.12, 0.14, 0.92), S.hazard, 0, 0.66, -0.4, false));
  for (let i = 0; i < 5; i++) g.add(mesh(coneGeo(0.11, 0.38, 6), S.spikeRed, -0.8 + i * 0.4, 0.86, -0.4));
  for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.3, 0.95, 0.95), S.orange, sx * 1.0, 0.475, -0.4));
  return g;
}

export function buildHigh(biomeMats, S) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    g.add(mesh(boxGeo(0.42, 2.7, 0.62), S.purple, sx * 1.05, 1.35, -0.4, true, true));
    g.add(mesh(boxGeo(0.58, 0.22, 0.78), S.gold, sx * 1.05, 2.78, -0.4));
  }
  g.add(mesh(boxGeo(2.3, 0.46, 0.64, 1), S.stripeRW, 0, 2.0, -0.4));
  for (let i = 0; i < 7; i++) {
    const sp = mesh(coneGeo(0.11, 0.82, 6), S.spikeRed, -0.9 + i * 0.3, 1.34, -0.4);
    sp.rotation.x = Math.PI; g.add(sp);
  }
  return g;
}

export function buildWall(biomeMats, S) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(2.1, 4.4, 1.1), S.crimson, 0, 2.2, -0.55, true, true));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 4.2), S.gateFace);
  face.position.set(0, 2.2, 0.01); g.add(face);
  for (const y of [0.45, 2.2, 3.95]) g.add(mesh(boxGeo(2.24, 0.2, 1.24), S.gold, 0, y, -0.55));
  g.add(mesh(boxGeo(2.4, 0.3, 1.3), S.purple, 0, 4.55, -0.55));
  return g;
}

/** Climbable slab with an optional ramp at its front. Teal body + chevron top = "you can ride this". */
export function buildBlock(biomeMats, S, H, len, ramp) {
  const g = new THREE.Group();
  const bodyLen = len - ramp;
  if (ramp > 0) {
    g.add(mesh(wedgeGeo(2.0, H, ramp), S.chevronRamp, 0, 0, 0, true, true));
    for (const sx of [-1, 1]) g.add(mesh(wedgeGeo(0.09, H + 0.06, ramp), S.gold, sx * 1.0, 0, 0, false));
  }
  g.add(mesh(boxGeo(2.0, H, bodyLen), S.teal, 0, H / 2, -ramp - bodyLen / 2, true, true));
  const top = mesh(boxGeo(1.86, 0.06, bodyLen - 0.1, 1.6), S.chevron, 0, H + 0.03, -ramp - bodyLen / 2, false, true); g.add(top);
  for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.12, 0.14, bodyLen), S.gold, sx * 0.96, H + 0.05, -ramp - bodyLen / 2, false));
  g.add(mesh(boxGeo(2.06, 0.14, 0.12), S.gold, 0, H + 0.05, -len, false));
  g.add(mesh(boxGeo(2.06, 0.18, bodyLen + 0.04), S.gold, 0, 0.1, -ramp - bodyLen / 2, false));
  return g;
}

// ---------------------------------------------------------------- scenery
export function buildTorch(S, color) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(0.22, 0.62, 0.22), S.iron, 0, 0, 0));
  g.add(mesh(cylGeo(0.2, 0.12, 0.2, 8), S.iron, 0, 0.38, 0));
  const flame = mesh(coneGeo(0.15, 0.55, 8), new THREE.MeshBasicMaterial({ color }), 0, 0.72, 0, false);
  g.add(flame);
  const core = mesh(coneGeo(0.08, 0.34, 8), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }), 0, 0.66, 0, false);
  g.add(core);
  const glow = new THREE.Sprite(S.glowSprite(color, 0.95)); glow.scale.set(3.2, 3.2, 1); glow.position.y = 0.75;
  g.add(glow);
  g.userData = { flame, core, glow, phase: Math.random() * 10 };
  return g;
}

export function buildLantern(S, color) {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(0.025, 0.025, 1.6, 4), S.iron, 0, 0.9, 0, false));
  g.add(mesh(cylGeo(0.28, 0.22, 0.12, 8), S.iron, 0, 0.05, 0));
  const bulb = mesh(sphereGeo(0.2, 12, 8), new THREE.MeshBasicMaterial({ color }), 0, -0.2, 0, false);
  g.add(bulb);
  g.add(mesh(coneGeo(0.26, 0.2, 8), S.iron, 0, -0.5, 0));
  const glow = new THREE.Sprite(S.glowSprite(color, 0.8)); glow.scale.set(3.4, 3.4, 1); glow.position.y = -0.2; g.add(glow);
  g.userData = { glow, phase: Math.random() * 10 };
  return g;
}

export function buildBush(mat, r) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = mesh(new THREE.IcosahedronGeometry(r * (0.55 + Math.random() * 0.5), 1), mat, (Math.random() - 0.5) * r, r * 0.4 + Math.random() * r * 0.4, (Math.random() - 0.5) * r * 1.4, true, false);
    g.add(s);
  }
  return g;
}

export function buildCrystalCluster(color, scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x113a55, emissive: color, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.3, flatShading: true });
  for (let i = 0; i < 5; i++) {
    const h = (0.8 + Math.random() * 1.6) * scale;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.16 * scale + Math.random() * 0.12, h, 5), mat);
    c.position.set((Math.random() - 0.5) * 0.9 * scale, h / 2, (Math.random() - 0.5) * 0.9 * scale);
    c.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 6, (Math.random() - 0.5) * 0.5);
    g.add(c);
  }
  return g;
}

export function buildBanner(color) {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.6), new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
  cloth.position.y = -1.3;
  g.add(cloth);
  g.add(mesh(boxGeo(1.5, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x3b2a1a }), 0, 0, 0, false));
  const em = mesh(boxGeo(0.5, 0.5, 0.02), new THREE.MeshBasicMaterial({ color: 0xffd166 }), 0, -1.0, 0.02, false);
  em.rotation.z = Math.PI / 4; g.add(em);
  return g;
}

export function buildStatue(mat) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(1.2, 0.7, 1.2), mat, 0, 0.35, 0, true, true));
  g.add(mesh(capsuleGeo(0.28, 1.0), mat, 0, 1.5, 0));
  g.add(mesh(sphereGeo(0.24), mat, 0, 2.35, 0));
  g.add(mesh(boxGeo(1.3, 0.14, 0.2), mat, 0, 1.85, 0));
  return g;
}

// ---------------------------------------------------------------- collectibles
/** Coins are two instanced meshes sharing one matrix list: a textured face and a darker gold rim for a bevelled look. */
export function buildCoinMesh(coinTex, capacity) {
  const faceGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.1, 28); faceGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(0.38, 0.07, 10, 28);
  const faceMat = new THREE.MeshStandardMaterial({ map: coinTex, roughness: 0.28, metalness: 0.45, emissive: 0xffb300, emissiveIntensity: 0.65, emissiveMap: coinTex });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe0a000, roughness: 0.22, metalness: 0.8, emissive: 0x8a5a00, emissiveIntensity: 0.6 });
  const mk = (g, m) => { const im = new THREE.InstancedMesh(g, m, capacity); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; return im; };
  return { face: mk(faceGeo, faceMat), rim: mk(rimGeo, rimMat) };
}

const iconCache = {};
function iconTexture(type, color) {
  if (iconCache[type]) return iconCache[type];
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.7, color); g.addColorStop(1, 'rgba(0,0,0,0.85)');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 60, 0, 6.28); x.fill();
  x.lineWidth = 5; x.strokeStyle = 'rgba(255,255,255,0.9)'; x.stroke();
  x.fillStyle = '#10131c'; x.strokeStyle = '#10131c'; x.lineWidth = 11; x.lineCap = 'round'; x.lineJoin = 'round';
  if (type === 'magnet') {
    x.beginPath(); x.arc(64, 62, 24, Math.PI, 0); x.lineTo(88, 92); x.moveTo(40, 62); x.lineTo(40, 92); x.stroke();
    x.fillStyle = '#fff'; x.fillRect(32, 86, 16, 10); x.fillRect(80, 86, 16, 10);
  } else if (type === 'double') {
    x.font = 'bold 62px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('2×', 64, 68);
  } else if (type === 'boots') {
    x.beginPath(); x.moveTo(46, 30); x.lineTo(46, 78); x.lineTo(92, 78); x.lineTo(92, 96); x.lineTo(40, 96); x.lineTo(36, 78); x.stroke();
    x.beginPath(); x.moveTo(30, 40); x.lineTo(20, 52); x.lineTo(36, 54); x.stroke();
  } else if (type === 'wings') {
    x.beginPath(); x.moveTo(62, 80); x.quadraticCurveTo(30, 70, 22, 36); x.quadraticCurveTo(46, 44, 62, 52);
    x.moveTo(66, 80); x.quadraticCurveTo(98, 70, 106, 36); x.quadraticCurveTo(82, 44, 66, 52); x.stroke();
    x.beginPath(); x.moveTo(64, 50); x.lineTo(64, 92); x.stroke();
  } else if (type === 'jetpack') {
    x.beginPath(); x.moveTo(64, 24); x.quadraticCurveTo(84, 44, 84, 76); x.lineTo(44, 76); x.quadraticCurveTo(44, 44, 64, 24); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 54, 8, 0, 6.28); x.fill();
    x.fillStyle = '#10131c'; x.beginPath(); x.moveTo(44, 76); x.lineTo(30, 98); x.lineTo(50, 86); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(84, 76); x.lineTo(98, 98); x.lineTo(78, 86); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(54, 84); x.lineTo(64, 106); x.lineTo(74, 84); x.closePath(); x.fill();
  } else if (type === 'shield') {
    x.beginPath(); x.moveTo(64, 26); x.lineTo(94, 38); x.quadraticCurveTo(94, 78, 64, 100); x.quadraticCurveTo(34, 78, 34, 38); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(64, 44); x.lineTo(64, 84); x.moveTo(48, 58); x.lineTo(80, 58); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  iconCache[type] = t; return t;
}

export function buildPowerup(type, color, S) {
  const g = new THREE.Group();
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(type, color), transparent: true }));
  spr.scale.set(1.35, 1.35, 1); spr.position.y = 0.2; g.add(spr);
  const halo = new THREE.Sprite(S.glowSprite(color, 1.0)); halo.scale.set(3.2, 3.2, 1); g.add(halo);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 8, 36), ringMat); ring.rotation.x = Math.PI / 2.4; g.add(ring);
  g.userData = { spr, halo, ring };
  return g;
}

// ---------------------------------------------------------------- the runner
export function buildRunner(skin) {
  const root = new THREE.Group();
  const M = (color, rough = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  const mSkin = M(skin.skin, 0.6), mTunic = M(skin.tunic, 0.75), mPants = M(skin.pants, 0.8), mHair = M(skin.hair, 0.8);
  const mAccent = M(skin.accent, 0.5, { emissive: skin.accent, emissiveIntensity: 0.35 });
  const mBoot = M(0x2a1d14, 0.7);

  const body = new THREE.Group(); root.add(body);   // pivot used for roll/flip
  body.position.y = 0.9;
  const inner = new THREE.Group(); inner.position.y = -0.9; body.add(inner);

  const hips = new THREE.Group(); hips.position.y = 0.95; inner.add(hips);
  const torso = mesh(capsuleGeo(0.2, 0.34), mTunic, 0, 0.3, 0); hips.add(torso);
  torso.scale.set(1.08, 1, 0.8);
  const belt = mesh(cylGeo(0.215, 0.215, 0.09, 14), mAccent, 0, 0.02, 0); hips.add(belt);
  belt.scale.set(1.08, 1, 0.8);
  const pack = mesh(boxGeo(0.34, 0.4, 0.18), mBoot, 0, 0.36, 0.2); hips.add(pack);
  const pack2 = mesh(boxGeo(0.3, 0.1, 0.2), mAccent, 0, 0.58, 0.2); hips.add(pack2);

  const neck = new THREE.Group(); neck.position.set(0, 0.62, 0); hips.add(neck);
  const head = new THREE.Group(); head.position.y = 0.14; neck.add(head);
  head.add(mesh(sphereGeo(0.19), mSkin, 0, 0.08, 0));
  const hair = mesh(new THREE.SphereGeometry(0.205, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), mHair, 0, 0.1, 0.02); head.add(hair);
  const hairBack = mesh(sphereGeo(0.17, 12, 8), mHair, 0, 0.0, 0.07); head.add(hairBack);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x14141a });
  for (const sx of [-1, 1]) head.add(mesh(sphereGeo(0.03, 8, 6), eyeMat, sx * 0.07, 0.09, -0.175, false));
  const band = mesh(cylGeo(0.2, 0.2, 0.05, 16), mAccent, 0, 0.17, 0); head.add(band);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x7fe9ff, roughness: 0.1, metalness: 0.4, emissive: 0x2fc8ff, emissiveIntensity: 0.6 });
  for (const sx of [-1, 1]) { head.add(mesh(sphereGeo(0.062, 12, 8), lensMat, sx * 0.075, 0.2, -0.155, false)); head.add(mesh(new THREE.TorusGeometry(0.066, 0.014, 6, 14), mBoot, sx * 0.075, 0.2, -0.158, false)); }

  // scarf: one continuous ribbon whose vertices are animated every frame
  const ROWS = 9, scarfGeo = new THREE.BufferGeometry();
  scarfGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROWS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let j = 0; j < ROWS - 1; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  scarfGeo.setIndex(idx);
  const scarfMat = M(skin.accent, 0.55, { emissive: skin.accent, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  const scarfMesh = new THREE.Mesh(scarfGeo, scarfMat); scarfMesh.frustumCulled = false; scarfMesh.castShadow = true;
  hips.add(scarfMesh);
  const scarf = {
    mesh: scarfMesh,
    update(t, speed, lean, grounded) {
      const pos = scarfGeo.attributes.position, len = 0.55 + Math.min(1.2, speed / 30) * 0.7;
      for (let j = 0; j < ROWS; j++) {
        const k = j / (ROWS - 1), w = 0.085 * (1 - k * 0.35);
        const cx = Math.sin(t * 5 - k * 5) * 0.09 * k + lean * 0.2 * k;
        const cy = 0.58 + Math.sin(t * 9 - k * 6) * 0.07 * k - (grounded ? k * 0.04 : -k * 0.1);
        const cz = 0.14 + k * len;
        pos.setXYZ(j * 2, cx - w, cy, cz); pos.setXYZ(j * 2 + 1, cx + w, cy, cz);
      }
      pos.needsUpdate = true; scarfGeo.computeVertexNormals();
    },
  };
  scarf.update(0, 15, 0, true);
  const scarfRing = mesh(cylGeo(0.14, 0.17, 0.08, 12), mAccent, 0, 0.58, 0); hips.add(scarfRing);

  const mkLimb = (r, len, mat, x, y, handMat) => {
    const piv = new THREE.Group(); piv.position.set(x, y, 0);
    piv.add(mesh(capsuleGeo(r, len), mat, 0, -len / 2 - r * 0.6, 0));
    if (handMat) piv.add(mesh(sphereGeo(r * 1.15, 8, 6), handMat, 0, -len - r * 1.4, 0));
    return piv;
  };
  for (const sx of [-1, 1]) hips.add(mesh(sphereGeo(0.115, 12, 8), mAccent, sx * 0.29, 0.58, 0));
  const strap = mesh(boxGeo(0.07, 0.62, 0.04), mBoot, 0, 0.32, -0.17); strap.rotation.z = 0.55; hips.add(strap);
  const armL = mkLimb(0.075, 0.36, mTunic, -0.3, 0.52, mSkin), armR = mkLimb(0.075, 0.36, mTunic, 0.3, 0.52, mSkin);
  hips.add(armL, armR);
  const legL = mkLimb(0.105, 0.42, mPants, -0.12, -0.02, mBoot), legR = mkLimb(0.105, 0.42, mPants, 0.12, -0.02, mBoot);
  hips.add(legL, legR);
  for (const l of [legL, legR]) { const foot = mesh(boxGeo(0.17, 0.1, 0.3), mBoot, 0, -0.64, -0.05); l.add(foot); l.userData.foot = foot; }

  const rig = { root, body, inner, hips, torso, neck, head, armL, armR, legL, legR, scarf, mats: [mSkin, mTunic, mPants, mHair, mAccent, mBoot, scarfMat], pack };
  root.userData.rig = rig;
  return root;
}

// ---------------------------------------------------------------- the Minotaur
export function buildMinotaur() {
  const root = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x5a3626, roughness: 0.95, emissive: 0x1a0805, emissiveIntensity: 1 });
  const furLight = new THREE.MeshStandardMaterial({ color: 0x7a4b34, roughness: 0.95, emissive: 0x1a0805, emissiveIntensity: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x9a6b52, roughness: 0.8 });
  const horn = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x555a66, roughness: 0.4, metalness: 0.9 });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff2a1a });

  const hips = new THREE.Group(); hips.position.y = 1.8; root.add(hips);
  const torso = mesh(capsuleGeo(0.62, 0.8), fur, 0, 0.95, 0); torso.scale.set(1.25, 1, 0.9); hips.add(torso);
  const chest = mesh(sphereGeo(0.72, 14, 10), furLight, 0, 1.35, -0.08); chest.scale.set(1.25, 0.8, 0.85); hips.add(chest);
  const loin = mesh(cylGeo(0.62, 0.7, 0.3, 12), skin, 0, 0.18, 0); hips.add(loin);

  const neck = new THREE.Group(); neck.position.set(0, 1.78, -0.25); hips.add(neck);
  const head = new THREE.Group(); neck.add(head);
  head.add(mesh(boxGeo(0.62, 0.62, 0.66), fur, 0, 0.1, 0));
  const snout = mesh(boxGeo(0.42, 0.34, 0.46), skin, 0, -0.1, -0.5); head.add(snout);
  head.add(mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 14), new THREE.MeshStandardMaterial({ color: 0xffc933, metalness: 0.9, roughness: 0.3 }), 0, -0.26, -0.72));
  for (const sx of [-1, 1]) {
    head.add(mesh(sphereGeo(0.07, 8, 6), eye, sx * 0.19, 0.2, -0.34, false));
    const eg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, map: null }));
    eg.scale.set(0.5, 0.5, 1); eg.position.set(sx * 0.19, 0.2, -0.36); head.add(eg);
    // horns: thick arcs rising outward then curling inward (mirrored for the left side)
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.075, 8, 18, Math.PI * 0.85), horn);
    h.position.set(sx * 0.3, 0.26, -0.08); h.scale.x = sx; h.rotation.z = -0.25; h.castShadow = true; head.add(h);
    const tusk = mesh(coneGeo(0.09, 0.3, 6), horn, sx * 0.17, -0.2, -0.62); tusk.rotation.x = -1.5; head.add(tusk);
    const ear = mesh(coneGeo(0.12, 0.34, 6), fur, sx * 0.4, 0.34, 0.2); ear.rotation.z = -sx * 1.2; head.add(ear);
  }
  const mkArm = (sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.95, 1.6, 0);
    p.add(mesh(capsuleGeo(0.28, 0.7), fur, 0, -0.6, 0));
    p.add(mesh(sphereGeo(0.3, 10, 8), skin, 0, -1.35, 0));
    hips.add(p); return p;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  // great axe
  const axe = new THREE.Group(); axe.position.set(0, -1.35, -0.1);
  axe.add(mesh(cylGeo(0.05, 0.05, 2.2, 6), metal, 0, 0, 0));
  const blade = mesh(boxGeo(0.08, 0.7, 0.9), metal, 0, 0.9, -0.45); axe.add(blade);
  axe.rotation.x = -0.6; armR.add(axe);
  const mkLeg = (sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.42, 0.1, 0);
    p.add(mesh(capsuleGeo(0.3, 0.85), fur, 0, -0.75, 0));
    p.add(mesh(boxGeo(0.5, 0.25, 0.7), skin, 0, -1.65, -0.1));
    hips.add(p); return p;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const light = new THREE.PointLight(0xff3322, 0, 14, 2); light.position.set(0, 2.6, -1.6); root.add(light);
  root.userData.rig = { hips, head, armL, armR, legL, legR, torso, light, axe };
  root.scale.setScalar(0.66);
  return root;
}

// ---------------------------------------------------------------- power-up effects attached to the runner
export function buildWings(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const mk = (sx) => {
    const w = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.1 - i * 0.12), mat);
      f.position.set(sx * (0.4 + i * 0.2), 0.05 - i * 0.12, 0); f.rotation.z = sx * (-0.9 - i * 0.12);
      w.add(f);
    }
    return w;
  };
  const L = mk(-1), R = mk(1);
  g.add(L, R); g.userData = { L, R };
  return g;
}

export function buildShieldBubble(color) {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.28, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, wireframe: true, depthWrite: false }));
  g.add(a, b); g.userData = { a, b };
  return g;
}

/** Twin-tank jetpack worn on the runner's back; flames animate via userData.flames. */
export function buildJetpack() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xe9eef5, roughness: 0.3, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff5a00, roughness: 0.4, metalness: 0.3, emissive: 0xff5a00, emissiveIntensity: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.5, metalness: 0.7 });
  const flames = [];
  for (const sx of [-1, 1]) {
    const tank = new THREE.Group(); tank.position.set(sx * 0.17, 0, 0);
    tank.add(mesh(cylGeo(0.12, 0.12, 0.62, 14), shell, 0, 0, 0));
    tank.add(mesh(sphereGeo(0.12, 12, 8), accent, 0, 0.31, 0));
    tank.add(mesh(cylGeo(0.13, 0.13, 0.08, 14), accent, 0, 0.1, 0));
    tank.add(mesh(cylGeo(0.09, 0.14, 0.14, 12), dark, 0, -0.36, 0));
    const fl = new THREE.Group(); fl.position.y = -0.46;
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.7, 10), new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.9 }));
    outer.rotation.x = Math.PI; outer.position.y = -0.3; fl.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 8), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
    inner.rotation.x = Math.PI; inner.position.y = -0.2; fl.add(inner);
    tank.add(fl); flames.push(fl); g.add(tank);
  }
  g.add(mesh(boxGeo(0.5, 0.1, 0.12), dark, 0, 0.12, -0.04));
  g.userData = { flames };
  return g;
}

// ---------------------------------------------------------------- the boulder
function rockCanvases() {
  const S = 512, mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const c = mk(), x = c.getContext('2d'), e = mk(), ex = e.getContext('2d');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#4a423d'; x.fillRect(0, 0, S, S); ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const px = rnd() * S, py = rnd() * S, r = 4 + rnd() * 22, v = 45 + rnd() * 55;
    x.fillStyle = `rgba(${v + 12},${v + 4},${v - 6},0.5)`; x.beginPath(); x.ellipse(px, py, r, r * 0.7, rnd() * 3, 0, 6.28); x.fill();
  }
  for (let k = 0; k < 22; k++) {                       // glowing cracks: the thing is angry
    let px = rnd() * S, py = rnd() * S, a = rnd() * 6.28;
    for (let i = 0; i < 26; i++) {
      const nx = px + Math.cos(a) * 14, ny = py + Math.sin(a) * 14;
      x.strokeStyle = 'rgba(25,15,10,0.8)'; x.lineWidth = 5; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
      ex.strokeStyle = '#ff6a1a'; ex.lineWidth = 6; ex.beginPath(); ex.moveTo(px, py); ex.lineTo(nx, ny); ex.stroke();
      px = (nx + S) % S; py = (ny + S) % S; a += (rnd() - 0.5) * 0.9;
    }
  }
  return { c, e };
}
let warnTex = null;
function warningTexture() {                           // red arrows pointing at the player
  if (warnTex) return warnTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 128); x.fillStyle = 'rgba(255,40,40,0.28)'; x.fillRect(0, 0, 64, 128);
  x.strokeStyle = '#ff1f1f'; x.lineWidth = 18; x.lineJoin = 'miter';
  x.beginPath(); x.moveTo(6, 34); x.lineTo(32, 84); x.lineTo(58, 34); x.stroke();
  warnTex = new THREE.CanvasTexture(c); warnTex.wrapS = warnTex.wrapT = THREE.RepeatWrapping; warnTex.colorSpace = THREE.SRGBColorSpace; warnTex.repeat.set(1, 14);
  return warnTex;
}
let rockMat = null;
export function buildBoulder(S) {
  const g = new THREE.Group(), R = 1.25;
  if (!rockMat) {
    const { c, e } = rockCanvases();
    const map = new THREE.CanvasTexture(c), em = new THREE.CanvasTexture(e); map.colorSpace = em.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = em.wrapS = em.wrapT = THREE.RepeatWrapping;
    rockMat = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 4, emissiveMap: em, emissive: 0xff4a10, emissiveIntensity: 1.5, roughness: 0.85, flatShading: false });
  }
  const geo = new THREE.IcosahedronGeometry(R, 4), p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {                  // lumpy, irregular rock
    v.fromBufferAttribute(p, i); const n = Math.sin(v.x * 3.1) * Math.sin(v.y * 2.7 + 1) * Math.sin(v.z * 3.5 + 2);
    v.multiplyScalar(1 + n * 0.13); p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, rockMat); rock.position.set(0, R, -R); rock.castShadow = true; g.add(rock);
  const glow = new THREE.Sprite(S.glowSprite(0xff3a10, 1)); glow.scale.set(7, 7, 1); glow.position.set(0, R, -R); g.add(glow);
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 30), new THREE.MeshBasicMaterial({ map: warningTexture(), transparent: true, depthWrite: false, opacity: 1 }));
  mark.rotation.x = -Math.PI / 2; mark.position.set(0, 0.05, 15); g.add(mark);
  g.userData = { rock, glow, mark };
  return g;
}
