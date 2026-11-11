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
export function makeSharedMaterials(glowTex, runeTex) {
  const emissive = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
  return {
    iron: new THREE.MeshStandardMaterial({ color: 0x6a707e, roughness: 0.5, metalness: 0.6 }),
    darkStone: new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 0.9 }),
    hazard: emissive(0xff4a1c, 2.6),
    danger: emissive(0xff2a55, 3),
    safe: emissive(0x2ff0c0, 2.4),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc933, roughness: 0.3, metalness: 0.9, emissive: 0x7a5200, emissiveIntensity: 0.6 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb04a }),
    rope: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }),
    glowTex, runeTex,
    glowSprite: (color, opacity = 0.85) => new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}

// A glowing red sigil painted on gates.
let gateTexCache = null;
function gateRuneTexture() {
  if (gateTexCache) return gateTexCache;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#ff2a55'; x.lineWidth = 9; x.lineCap = 'round';
  x.shadowColor = '#ff2a55'; x.shadowBlur = 14;
  x.beginPath(); x.arc(128, 128, 84, 0, 6.28); x.stroke();
  x.beginPath(); x.arc(128, 128, 54, 0, 6.28); x.lineWidth = 5; x.stroke();
  x.lineWidth = 9;
  x.beginPath(); x.moveTo(128, 30); x.lineTo(128, 226); x.moveTo(30, 128); x.lineTo(226, 128); x.stroke();
  x.beginPath(); x.moveTo(70, 70); x.lineTo(186, 186); x.moveTo(186, 70); x.lineTo(70, 186); x.lineWidth = 5; x.stroke();
  gateTexCache = new THREE.CanvasTexture(c); gateTexCache.colorSpace = THREE.SRGBColorSpace;
  return gateTexCache;
}

// ---------------------------------------------------------------- obstacles
// Each builder returns a Group whose origin is the FRONT-CENTRE on the floor; it extends toward -z.

export function buildLow(biomeMats, S) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(2.0, 0.62, 0.8), biomeMats.wall, 0, 0.31, -0.4, true, true));
  g.add(mesh(boxGeo(2.12, 0.14, 0.92), S.hazard, 0, 0.66, -0.4, false));
  for (let i = 0; i < 5; i++) g.add(mesh(coneGeo(0.1, 0.34, 6), S.iron, -0.8 + i * 0.4, 0.83, -0.4));
  g.add(mesh(boxGeo(0.28, 0.9, 0.9), biomeMats.trim, -1.0, 0.45, -0.4));
  g.add(mesh(boxGeo(0.28, 0.9, 0.9), biomeMats.trim, 1.0, 0.45, -0.4));
  return g;
}

export function buildHigh(biomeMats, S) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    g.add(mesh(boxGeo(0.4, 2.7, 0.6), biomeMats.trim, sx * 1.05, 1.35, -0.4, true, true));
    g.add(mesh(boxGeo(0.55, 0.22, 0.75), S.iron, sx * 1.05, 2.78, -0.4));
  }
  g.add(mesh(boxGeo(2.3, 0.42, 0.6), S.iron, 0, 2.0, -0.4));
  g.add(mesh(boxGeo(2.1, 0.07, 0.64), S.danger, 0, 1.76, -0.4, false));
  for (let i = 0; i < 7; i++) {
    const sp = mesh(coneGeo(0.1, 0.82, 6), S.iron, -0.9 + i * 0.3, 1.34, -0.4);
    sp.rotation.x = Math.PI; g.add(sp);
  }
  return g;
}

export function buildWall(biomeMats, S) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(2.1, 4.4, 1.1), biomeMats.wall, 0, 2.2, -0.55, true, true));
  for (const y of [0.5, 2.2, 3.9]) g.add(mesh(boxGeo(2.24, 0.22, 1.24), S.iron, 0, y, -0.55));
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: gateRuneTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  rune.position.set(0, 2.2, 0.03); g.add(rune);
  g.add(mesh(boxGeo(2.4, 0.3, 1.3), biomeMats.trim, 0, 4.55, -0.55));
  return g;
}

/** Climbable stone slab ("sarcophagus cart") with an optional ramp at its front. */
export function buildBlock(biomeMats, S, H, len, ramp) {
  const g = new THREE.Group();
  const bodyLen = len - ramp;
  if (ramp > 0) {
    const w = mesh(wedgeGeo(2.0, H, ramp), biomeMats.trim, 0, 0, 0, true, true); g.add(w);
    for (const sx of [-1, 1]) {
      const e = mesh(wedgeGeo(0.07, H + 0.06, ramp), S.safe, sx * 1.0, 0, 0, false); g.add(e);
    }
  }
  g.add(mesh(boxGeo(2.0, H, bodyLen), biomeMats.wall, 0, H / 2, -ramp - bodyLen / 2, true, true));
  // glowing rail along the top edges + corner studs
  for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.09, 0.09, bodyLen), S.safe, sx * 1.0, H + 0.02, -ramp - bodyLen / 2, false));
  g.add(mesh(boxGeo(2.1, 0.09, 0.09), S.safe, 0, H + 0.02, -len, false));
  g.add(mesh(boxGeo(2.08, 0.16, bodyLen + 0.08), S.gold, 0, H - 0.06, -ramp - bodyLen / 2, false));
  g.children[g.children.length - 1].scale.set(1, 0.4, 1);
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
export function buildCoinMesh(coinTex, capacity) {
  const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.09, 24);
  geo.rotateX(Math.PI / 2); // face toward ±z so spinning about Y shows the face
  const mat = new THREE.MeshStandardMaterial({ map: coinTex, color: 0xffffff, roughness: 0.35, metalness: 0.25, emissive: 0xffb300, emissiveIntensity: 0.75, emissiveMap: coinTex });
  const im = new THREE.InstancedMesh(geo, mat, capacity);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false; im.castShadow = false; im.count = 0;
  return im;
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
  const halo = new THREE.Sprite(S.glowSprite(color, 0.9)); halo.scale.set(3.4, 3.4, 1); g.add(halo);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
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
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
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
  const a = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.28, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(a, b); g.userData = { a, b };
  return g;
}
