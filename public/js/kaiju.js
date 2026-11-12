// Godzilla: a procedural kaiju that rises out of the corridor ahead, charges its dorsal plates and breathes blue fire
// down the lanes. The fire arrives as waves covering two of the three lanes (jump them or take the free lane).
// Everything is built from primitives with a canvas-generated scaly skin; nothing is downloaded.
import * as THREE from 'three';
import { LANES } from './config.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---------------------------------------------------------------- textures
let skinMats = null, flameTex = null, markTex = null;
function skinTextures() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const b = document.createElement('canvas'); b.width = b.height = S; const bx = b.getContext('2d');
  let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#2a2e2b'; x.fillRect(0, 0, S, S); bx.fillStyle = '#707070'; bx.fillRect(0, 0, S, S);
  const cell = 26;                                             // rows of overlapping scale plates
  for (let row = -1; row < S / cell + 1; row++) for (let col = -1; col < S / cell + 1; col++) {
    const px = col * cell + (row % 2 ? cell / 2 : 0) + (r() - 0.5) * 4, py = row * cell * 0.8, rr = cell * (0.55 + r() * 0.12), v = 34 + r() * 30;
    const g = x.createRadialGradient(px - 4, py - 5, 2, px, py, rr);
    g.addColorStop(0, `rgb(${v + 26},${v + 30},${v + 24})`); g.addColorStop(0.7, `rgb(${v},${v + 3},${v - 1})`); g.addColorStop(1, `rgb(${v - 22},${v - 20},${v - 22})`);
    x.fillStyle = g; x.beginPath(); x.ellipse(px, py, rr, rr * 0.85, 0, 0, 6.3); x.fill();
    const h = bx.createRadialGradient(px, py - 3, 1, px, py, rr); h.addColorStop(0, '#fff'); h.addColorStop(0.75, '#9a9a9a'); h.addColorStop(1, '#202020');
    bx.fillStyle = h; bx.beginPath(); bx.ellipse(px, py, rr, rr * 0.85, 0, 0, 6.3); bx.fill();
  }
  for (let i = 0; i < 40; i++) {                                // old scars and weathering
    const px = r() * S, py = r() * S; x.strokeStyle = `rgba(${150 + r() * 60},${150 + r() * 50},${140 + r() * 50},0.07)`; x.lineWidth = 2 + r() * 4;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 90, py + (r() - 0.5) * 90); x.stroke();
  }
  const map = new THREE.CanvasTexture(c), bump = new THREE.CanvasTexture(b);
  map.colorSpace = THREE.SRGBColorSpace; for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return { map, bump };
}

function flameTexture() {                                      // teardrop flame: white core, cyan body, deep blue tips
  if (flameTex) return flameTex;
  const W = 128, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const lobe = (cx, w, h, a) => {
    const g = x.createLinearGradient(0, H, 0, H - h);
    g.addColorStop(0, `rgba(190,235,255,${a})`); g.addColorStop(0.3, `rgba(70,165,255,${a * 0.9})`); g.addColorStop(0.7, `rgba(20,70,255,${a * 0.55})`); g.addColorStop(1, 'rgba(10,20,200,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(cx - w, H); x.bezierCurveTo(cx - w * 1.1, H - h * 0.45, cx - w * 0.35, H - h * 0.65, cx, H - h);
    x.bezierCurveTo(cx + w * 0.35, H - h * 0.65, cx + w * 1.1, H - h * 0.45, cx + w, H); x.closePath(); x.fill();
  };
  lobe(64, 50, 230, 0.7); lobe(46, 26, 170, 0.6); lobe(84, 26, 190, 0.6); lobe(64, 28, 150, 0.95);
  const core = x.createLinearGradient(0, H, 0, H - 120); core.addColorStop(0, 'rgba(255,255,255,0.95)'); core.addColorStop(1, 'rgba(180,230,255,0)');
  x.fillStyle = core; x.beginPath(); x.ellipse(64, H - 42, 17, 62, 0, 0, 6.3); x.fill();
  flameTex = new THREE.CanvasTexture(c); flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
}

function markTexture(quake) {
  if (quake) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,150,30,0.45)'; x.fillRect(0, 0, 64, 128); x.strokeStyle = '#ffe27a'; x.lineWidth = 16;
    x.beginPath(); x.moveTo(6, 90); x.lineTo(32, 40); x.lineTo(58, 90); x.stroke();                      // chevrons pointing up = JUMP
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1, 18); return t;
  }                                       // blue chevrons painted on the floor in lanes about to burn
  if (markTex) return markTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = 'rgba(30,110,255,0.5)'; x.fillRect(0, 0, 64, 128); x.strokeStyle = '#a8e4ff'; x.lineWidth = 16; x.lineJoin = 'miter';
  x.beginPath(); x.moveTo(6, 34); x.lineTo(32, 84); x.lineTo(58, 34); x.stroke();
  markTex = new THREE.CanvasTexture(c); markTex.wrapS = markTex.wrapT = THREE.RepeatWrapping; markTex.colorSpace = THREE.SRGBColorSpace; markTex.repeat.set(1, 18);
  return markTex;
}

const flameMats = new Map();
function flameMat(tint) {
  if (!flameMats.has(tint)) flameMats.set(tint, new THREE.MeshBasicMaterial({ map: flameTexture(), color: tint, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  return flameMats.get(tint);
}

// ---------------------------------------------------------------- the creature
function blob(rx, ry, rz, mat, seg = 28, noise = 0.05, seed = 1) {
  const geo = new THREE.SphereGeometry(1, seg, Math.max(12, seg >> 1)), p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const n = Math.sin(v.x * 4.1 + seed) * Math.sin(v.y * 3.3 + seed * 2) * Math.sin(v.z * 3.7 + seed * 3);
    v.multiplyScalar(1 + n * noise); p.setXYZ(i, v.x * rx, v.y * ry, v.z * rz);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m;
}

// Mouth and the ground spot the breath lands on (model space; the creature faces +z, toward the player)
const SCALE = 1.7, IMPACT = 14;                                                // the giant is ~25 m tall; its breath lands 14 m in front of its feet
const MOUTH = new THREE.Vector3(0, 13.8, 3.5), IMPACT_Z = IMPACT / SCALE;

export function buildGodzilla(S) {
  if (!skinMats) {
    const { map, bump } = skinTextures();
    skinMats = {
      skin: new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 5, color: 0xb8bcb4, roughness: 0.78, metalness: 0.06 }),
      belly: new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 3, color: 0xd9cdb0, roughness: 0.85 }),
      tooth: new THREE.MeshStandardMaterial({ color: 0xe9e1cb, roughness: 0.45 }),
      claw: new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.4, metalness: 0.2 }),
      mouth: new THREE.MeshStandardMaterial({ color: 0x501019, roughness: 0.5, emissive: 0x2a60ff, emissiveIntensity: 0 }),
      eye: new THREE.MeshBasicMaterial({ color: 0xffb02e }),
      plate: new THREE.MeshStandardMaterial({ color: 0x3d4440, roughness: 0.5, metalness: 0.15, emissive: 0x2f7dff, emissiveIntensity: 0, map, bumpMap: bump, bumpScale: 3 }),
    };
  }
  for (const m of Object.values(skinMats)) { m.fog = false; if (!m.userData.base) m.userData.base = m.color.clone(); }   // distance haze is applied by hand (the maze fog would erase a 15 m giant)
  const M = skinMats, root = new THREE.Group(), U = { plateMat: M.plate, mouthMat: M.mouth };
  const body = new THREE.Group(); root.add(body); U.body = body;

  // torso, pelvis, belly
  const torso = blob(1.85, 3.1, 2.0, M.skin, 32, 0.05, 1); torso.position.set(0, 9.3, 0); torso.rotation.x = 0.16; body.add(torso);
  const belly = blob(1.5, 2.5, 1.2, M.belly, 24, 0.03, 4); belly.position.set(0, 8.9, 1.05); belly.rotation.x = 0.16; body.add(belly);
  const pelvis = blob(2.0, 1.7, 2.0, M.skin, 28, 0.05, 2); pelvis.position.set(0, 6.5, -0.4); body.add(pelvis);

  // legs: pivot at the hip so they can stride
  U.legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(sx * 1.55, 6.3, 0); body.add(leg);
    const thigh = blob(1.25, 2.5, 1.55, M.skin, 24, 0.06, 5 + sx); thigh.position.set(sx * 0.1, -1.5, 0); leg.add(thigh);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 3.2, 16), M.skin); shin.position.set(0, -4.0, 0.3); shin.rotation.x = -0.12; shin.castShadow = true; leg.add(shin);
    const foot = blob(1.05, 0.6, 1.75, M.skin, 20, 0.04, 8); foot.position.set(0, -5.65, 0.95); leg.add(foot);
    for (let k = -1; k <= 1; k++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.8, 8), M.claw); claw.rotation.x = Math.PI / 2; claw.position.set(k * 0.55, -5.7, 2.75); leg.add(claw); }
    U.legs.push(leg);
  }

  // small arms
  U.arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 1.95, 11.0, 0.9); body.add(arm);
    const up = blob(0.5, 1.0, 0.5, M.skin, 14, 0.05, 3); up.position.set(sx * 0.15, -0.8, 0.2); up.rotation.x = -0.5; arm.add(up);
    const fore = blob(0.4, 0.85, 0.4, M.skin, 14, 0.05, 6); fore.position.set(sx * 0.15, -1.45, 1.0); fore.rotation.x = -1.2; arm.add(fore);
    for (let k = -1; k <= 1; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), M.claw); c.position.set(sx * 0.15 + k * 0.2, -1.8, 1.75); c.rotation.x = Math.PI / 2 - 0.2; arm.add(c); }
    U.arms.push(arm);
  }

  // neck and head
  const neck = blob(1.0, 1.7, 1.0, M.skin, 20, 0.05, 7); neck.position.set(0, 12.6, 0.55); neck.rotation.x = 0.35; body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 14.1, 1.35); body.add(head); U.head = head;
  const skull = blob(1.12, 0.98, 1.55, M.skin, 28, 0.04, 9); skull.position.set(0, 0, 0.2); head.add(skull);
  const brow = blob(1.05, 0.25, 0.9, M.skin, 16, 0.05, 2); brow.position.set(0, 0.55, 0.85); head.add(brow);
  const snout = blob(0.78, 0.5, 1.15, M.skin, 20, 0.03, 4); snout.position.set(0, -0.12, 1.75); head.add(snout);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), M.eye); eye.position.set(sx * 0.62, 0.38, 1.0); head.add(eye);
    const eg = new THREE.Sprite(S.glowSprite(0xffa020, 0.7)); eg.scale.set(0.9, 0.9, 1); eg.position.copy(eye.position); head.add(eg);
  }
  const jaw = new THREE.Group(); jaw.position.set(0, -0.4, 0.55); head.add(jaw); U.jaw = jaw;
  const jb = blob(0.72, 0.26, 1.3, M.skin, 18, 0.03, 5); jb.position.set(0, -0.05, 0.95); jaw.add(jb);
  const mouthIn = blob(0.62, 0.16, 1.2, M.mouth, 14, 0, 1); mouthIn.position.set(0, 0.12, 0.95); jaw.add(mouthIn);
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) {                  // rows of teeth, upper and lower
    const up = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3 - i * 0.012, 6), M.tooth); up.rotation.x = Math.PI; up.position.set(sx * (0.5 - i * 0.02), -0.38, 0.8 + i * 0.2); head.add(up);
    const lo = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3 - i * 0.012, 6), M.tooth); lo.position.set(sx * (0.45 - i * 0.02), 0.3, 0.25 + i * 0.2); jaw.add(lo);
  }
  U.mouthGlow = new THREE.Sprite(S.glowSprite(0x4aa6ff, 1)); U.mouthGlow.scale.set(0.1, 0.1, 1); U.mouthGlow.position.set(0, -0.3, 2.1); head.add(U.mouthGlow);

  // dorsal plates: down the back, then along the tail. Flat and serrated; they glow blue while charging.
  const plateGeo = new THREE.ConeGeometry(0.95, 2.2, 4); plateGeo.scale(0.28, 1, 1);
  const addPlate = (parent, x, y, z, s, lean, roll = 0) => {
    const m = new THREE.Mesh(plateGeo, M.plate); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.set(-lean, 0, roll); m.castShadow = true; parent.add(m);
  };
  for (const [y, z, s] of [[12.1, -0.7, 0.9], [11.0, -1.75, 1.15], [9.8, -2.1, 1.25], [8.6, -2.25, 1.15], [7.5, -2.15, 1.0], [6.7, -2.1, 0.85]]) {
    addPlate(body, 0, y + s, z, s, 0.5);
    addPlate(body, -0.95, y + s * 0.55, z + 0.15, s * 0.66, 0.4, 0.45); addPlate(body, 0.95, y + s * 0.55, z + 0.15, s * 0.66, 0.4, -0.45);
  }

  // tail: nested segments so it sways as one
  U.tail = [];
  let parent = body, pz = -1.8, py = 5.9;
  for (let i = 0; i < 10; i++) {
    const r = 1.55 - i * 0.14, seg = new THREE.Group(); seg.position.set(0, py, pz); parent.add(seg);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.12, r - 0.14), r, 1.7, 14), M.skin); m.rotation.x = Math.PI / 2; m.position.z = -0.85; m.castShadow = true; seg.add(m);
    if (i < 8) addPlate(seg, 0, r * 0.8, -0.85, 0.45 + (8 - i) * 0.06, 0.55);
    U.tail.push(seg); parent = seg; pz = -1.7; py = 0; seg.rotation.x = 0.045 + i * 0.004;
  }

  // the breath: streams of fire from the mouth down to the floor
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
  U.jet = new THREE.Group(); U.jet.visible = false; root.add(U.jet); U.streams = [];
  for (let i = 0; i < 2; i++) {
    const st = new THREE.Group(), core = flameMat(0xdff4ff), body2 = flameMat(0x4a9bff);
    for (const [mat, w] of [[body2, 3.4], [core, 1.5]]) { const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat); b.rotation.y = Math.PI / 2; a.scale.x = b.scale.x = w; st.add(a, b); }
    U.jet.add(st); U.streams.push(st);
  }
  U.impact = new THREE.Sprite(S.glowSprite(0x6ab4ff, 1)); U.impact.scale.set(9, 6, 1); U.jet.add(U.impact);
  root.userData = U;
  return root;
}

/** Point the breath streams at the lanes that are about to burn (model space). */
function aimJet(U, lanes, flick) {
  const n = U.streams.length;
  U.streams.forEach((st, i) => {
    st.visible = i < lanes.length; if (!st.visible) return;
    const target = new THREE.Vector3(LANES[lanes[i]], 0.4, IMPACT_Z), dir = target.clone().sub(MOUTH), len = dir.length();
    st.position.copy(MOUTH); st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    st.scale.set(1, len, 1); for (const m of st.children) m.scale.x = (m.scale.x > 2 ? 3.4 : 1.5) * flick * (0.9 + 0.1 * (i + 1) / n);
  });
  const x = lanes.reduce((a, l) => a + LANES[l], 0) / lanes.length; U.impact.position.set(x, 1.2, IMPACT_Z);
}

// ---------------------------------------------------------------- flame wave
/** One lane's wave of blue fire (built in leg space). Origin is the rear edge (s1); local +z runs toward the player. */
export function buildFlameWave(S, len = 5) {
  const g = new THREE.Group(), fire = new THREE.Group(), tongues = [];
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
  for (let i = 0; i < 12; i++) {
    const t = new THREE.Group(), core = i % 3 === 0, mat = flameMat(core ? 0xdff4ff : i % 3 === 1 ? 0x69b8ff : 0x3a78ff);
    const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat); b.rotation.y = Math.PI / 2; t.add(a, b);
    const w = core ? rnd(0.9, 1.3) : rnd(1.3, 1.9), h = core ? rnd(1.9, 2.6) : rnd(2.4, 3.6);
    t.userData = { w, h, ph: Math.random() * 6.3, sp: rnd(9, 16) };
    t.position.set(rnd(-0.75, 0.75), 0, rnd(0, len)); t.scale.set(w, h, w); t.rotation.y = Math.random() * 3; fire.add(t); tongues.push(t);
  }
  for (const [z, s] of [[len * 0.25, 5.2], [len * 0.75, 4.2]]) { const gl = new THREE.Sprite(S.glowSprite(0x3d8bff, 1)); gl.scale.set(s, s * 0.8, 1); gl.position.set(0, 0.9, z); fire.add(gl); }
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.3, 24), new THREE.MeshBasicMaterial({ color: 0x4aa0ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.06, len * 0.5); pool.scale.set(1, 1.7, 1); fire.add(pool);
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 90), new THREE.MeshBasicMaterial({ map: markTexture(), transparent: true, depthWrite: false, opacity: 0.8 }));
  mark.rotation.x = -Math.PI / 2; mark.position.set(0, 0.05, 45 + len);
  fire.visible = false; g.add(fire, mark);
  g.userData = { tongues, fire, mark, len };
  return g;
}

export function animateFlameWave(g, time, armed, ahead) {
  const U = g.userData; U.fire.visible = armed;
  if (U.quake) {
    if (armed) { for (const m of U.pieces) m.position.y = m.userData.y0 + Math.abs(Math.sin(time * 9 + m.userData.ph)) * 0.55; for (const s of U.tongues) s.material.opacity = 0.55 + 0.25 * Math.sin(time * 6 + s.position.x); }
    U.mark.material.opacity = ahead > 1 ? (armed ? 1 : 0.7 + 0.3 * Math.sin(time * 9)) : 0;
    const k = Math.min(1, Math.max(0.05, ahead / 90)); U.mark.scale.y = k; U.mark.position.z = 45 * k + U.len; return;
  }
  if (armed) for (const t of U.tongues) {
    const d = t.userData, f = 0.78 + 0.22 * Math.sin(time * d.sp + d.ph) + 0.1 * Math.sin(time * d.sp * 2.3 + d.ph * 2);
    t.scale.set(d.w * (0.9 + 0.2 * Math.sin(time * d.sp * 1.3 + d.ph)), d.h * f, d.w); t.rotation.y += 0.02;
  }
  U.mark.material.opacity = ahead > 1 ? (armed ? 1 : 0.7 + 0.3 * Math.sin(time * 9)) : 0;
  const k = Math.min(1, Math.max(0.05, ahead / 90)); U.mark.scale.y = k; U.mark.position.z = 45 * k + U.len;
}

// ---------------------------------------------------------------- shockwave (tail sweep): a rolling ridge of rock and dust across all lanes
let rockGeo = null;
export function buildQuakeWave(S, len = 3) {
  const g = new THREE.Group(), fire = new THREE.Group(), tongues = [];
  if (!rockGeo) rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const rock = new THREE.MeshStandardMaterial({ color: 0x6d6258, roughness: 0.9, flatShading: true });
  const pieces = [];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(rockGeo, rock), sz = rnd(0.5, 1.5);
    m.scale.set(sz * rnd(0.8, 1.6), sz * rnd(0.7, 1.3), sz); m.position.set(rnd(-3.6, 3.6), sz * 0.3, rnd(0, len)); m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); m.castShadow = true;
    m.userData = { ph: Math.random() * 6.3, y0: sz * 0.3 }; fire.add(m); pieces.push(m);
  }
  const dust = flameMat(0xb9a58a);                       // soft billowing dust, reusing the flame sprite shape
  for (let i = 0; i < 9; i++) { const sp = new THREE.Sprite(S.glowSprite(0xcbb89a, 1)); sp.scale.set(rnd(3, 5), rnd(2.5, 4), 1); sp.position.set(rnd(-3.2, 3.2), rnd(0.6, 1.6), rnd(0, len)); fire.add(sp); tongues.push(sp); }
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 90), new THREE.MeshBasicMaterial({ map: markTexture(true), transparent: true, depthWrite: false, opacity: 0.8 }));
  mark.rotation.x = -Math.PI / 2; mark.position.set(0, 0.05, 45 + len); mark.userData.quake = true;
  fire.visible = false; g.add(fire, mark);
  g.userData = { tongues, pieces, fire, mark, len, quake: true, dust };
  return g;
}

/** Choose what Godzilla does this time (deterministic from `R`): a list of waves, each `{ kind: 'fire', lanes }` or `{ kind: 'quake' }`. */
export function makePlan(R, cur, diff) {
  const pick = (a) => a[Math.floor(R() * a.length)], fire = (f) => ({ kind: 'fire', lanes: [0, 1, 2].filter((l) => l !== f) }), quake = () => ({ kind: 'quake', lanes: [0, 1, 2] });
  const nextFree = (p) => (p === 1 ? pick([0, 2]) : 1);
  const f1 = pick([cur - 1, cur + 1].filter((l) => l >= 0 && l <= 2));            // the first fire wave burns the lane you are in; the free lane is one step away
  const v = pick(diff < 0.12 ? ['double', 'double', 'fireQuake'] : ['double', 'fireQuake', 'quakeFire', 'triple', 'triple']);
  if (v === 'fireQuake') return [fire(f1), quake()];
  if (v === 'quakeFire') return [quake(), fire(pick([cur - 1, cur + 1].filter((l) => l >= 0 && l <= 2)))];   // after the jump you stay put, so the free lane is next to you
  if (v === 'triple') { const f2 = nextFree(f1); return [fire(f1), fire(f2), fire(nextFree(f2))]; }
  return [fire(f1), fire(nextFree(f1))];
}
export const encodePlan = (plan) => plan.map((w) => (w.kind === 'quake' ? 'q' : `f${w.lanes.join('')}`));
export function decodePlan(a) {
  if (!Array.isArray(a) || a.length < 1 || a.length > 4) return null;
  const out = []; for (const x of a) {
    if (x === 'q') out.push({ kind: 'quake', lanes: [0, 1, 2] });
    else if (typeof x === 'string' && /^f[012]{1,3}$/.test(x)) out.push({ kind: 'fire', lanes: [...new Set(x.slice(1).split('').map(Number))] });
    else return null;
  }
  return out;
}

// ---------------------------------------------------------------- the event
const LAUNCH0 = 3.0, GAP = 1.1;          // first wave leaves at 3.0 s, then one every 1.1 s

/**
 * Timeline (s): rise 0-1.5, charge 1.5-3.0 (the first wave's lanes are marked on the floor), waves at 3.0, 4.1, ...
 * then it turns and strides away. It backs off while attacking so it never walks into the player.
 * `ctx` is the game (or the opponent view's stand-in): it provides time, dist, shake, ui, state, score, stats and scene.
 */
export class Kaiju {
  constructor(world, S) { this.world = world; this.S = S; this.model = null; this.live = false; this.waves = []; }

  /** `s` is where it stands; `plan` lists the waves, e.g. [{ kind: 'fire', lanes: [0, 2] }, { kind: 'quake' }]. */
  spawn(s, plan, audio) {
    const w = this.world, leg = w.track.legAt(s);
    if (!this.model) this.model = buildGodzilla(this.S);
    this.leg = leg; this.s = s; this.t = 0; this.phase = 'rise'; this.plan = plan; this.live = true; this.stride = 0; this.turnT = 0;
    this.audio = audio; this.fired = 0; this.roared = false; this.survived = false; this.thud = false; this.waves = []; this.swipe = 0; this.swipeDir = 1; this.lastLaunch = -9;
    this.leaveAt = LAUNCH0 + GAP * (plan.length - 1) + 1.6;
    this.model.scale.setScalar(SCALE); this.model.position.set(0, -17 * SCALE, -(s - leg.a)); this.model.rotation.y = 0; this.model.userData.jet.visible = false;
    leg.group.add(this.model);
    this.armWaves(0);
  }

  armWaves(i) {                                                   // unarmed waves: the floor marks show, no hazard yet
    const p = this.plan[i]; if (!p) return;
    if (p.kind === 'quake') { const sd = this.world.addFlame(1, this.s - IMPACT, 3, 'quake'); sd.planIdx = i; this.waves.push(sd); }
    else for (const l of p.lanes) { const sd = this.world.addFlame(l, this.s - IMPACT, 5, 'fire'); sd.planIdx = i; this.waves.push(sd); }
  }

  launch(i, ctx) {
    for (const sd of this.waves) if (sd.planIdx === i) { sd.armed = true; sd.ghost = false; }
    this.fired = i + 1; this.lastLaunch = this.t;
    if (this.plan[i].kind === 'quake') { this.swipe = 1; this.swipeDir = i % 2 ? 1 : -1; this.audio.rumble(); ctx.shake = Math.max(ctx.shake, 0.6); }
    else this.audio.flame();
    this.armWaves(i + 1);
  }

  update(dt, ctx) {
    if (!this.live) return;
    const U = this.model.userData, time = ctx.time, dist = ctx.dist, N = this.plan.length;
    this.t += dt; const t = this.t, leg = this.leg;
    if (this.phase === 'rise') {
      const k = smooth(t / 1.5); this.model.position.y = -17 * SCALE * (1 - k);
      ctx.shake = Math.max(ctx.shake, 0.08 + 0.2 * (1 - k));
      if (t >= 1.0 && !this.roared) { this.roared = true; this.audio.kaiju(); ctx.shake = Math.max(ctx.shake, 0.55); ctx.ui.flash('rgba(70,140,255,0.28)'); }
      if (t >= 1.5) this.phase = 'charge';
    } else if (this.phase === 'charge') { if (t >= LAUNCH0) { this.phase = 'breathe'; this.launch(0, ctx); } }
    else if (this.phase === 'breathe') {
      if (this.fired < N && t >= LAUNCH0 + GAP * this.fired) this.launch(this.fired, ctx);
      if (t >= this.leaveAt) { this.phase = 'leave'; this.turnT = 0; }
    }
    const attacking = this.phase === 'breathe' ? 1 : 0;
    if (attacking) this.s += 12 * dt;                                                   // backs away while attacking
    if (this.phase === 'leave') { this.turnT += dt; const k = smooth(this.turnT / 1.2); this.model.rotation.y = Math.PI * k; this.s += 30 * dt * k; }
    this.model.position.z = -(this.s - leg.a);
    this.swipe = Math.max(0, this.swipe - dt * 1.7);
    // walk cycle
    const moving = attacking || this.phase === 'leave';
    this.stride += dt * (moving ? 5.5 : 1.0);
    const sw = Math.sin(this.swipe * Math.PI) * this.swipeDir;
    U.legs.forEach((lg, i) => { lg.rotation.x = Math.sin(this.stride + (i ? Math.PI : 0)) * (moving ? 0.5 : 0.04); });
    U.body.position.y = Math.abs(Math.sin(this.stride)) * (moving ? 0.35 : 0.06) + Math.sin(time * 1.6) * 0.04;
    U.body.rotation.y = -0.55 * sw;                                                      // the tail-sweep twist
    U.arms.forEach((a, i) => { a.rotation.x = -0.3 + Math.sin(this.stride * 0.8 + i) * 0.1; });
    U.tail.forEach((sg, i) => { sg.rotation.y = Math.sin(time * 1.6 - i * 0.55) * (0.1 + i * 0.012) * (moving ? 1.6 : 1) + sw * (0.35 + i * 0.05); });
    // head, jaw and glow
    const fireNow = this.fired > 0 && this.plan[this.fired - 1].kind === 'fire' && t - this.lastLaunch < (this.fired < N ? 0.95 : 1.4);
    const charge = smooth((t - 1.5) / 1.5), roar = this.phase === 'rise' && t > 0.9 ? Math.sin(smooth((t - 0.9) / 0.6) * Math.PI) : 0;
    const glow = this.phase === 'leave' ? Math.max(0, 1 - this.turnT * 1.2) : this.phase === 'breathe' ? (this.plan.some((w) => w.kind === 'fire') ? 1 : 0.2) : charge;
    U.body.rotation.x = this.phase === 'charge' ? -0.12 * charge : attacking ? 0.05 : 0;
    U.head.rotation.x = -0.35 * roar - 0.25 * charge * (1 - attacking) + 0.28 * (fireNow ? 1 : 0.4 * attacking);
    U.jaw.rotation.x = 0.55 * roar + 0.22 * charge + 0.32 * (fireNow ? 1 : 0.3 * attacking) + 0.03 * Math.sin(time * 2);
    const flick = 0.85 + 0.15 * Math.sin(time * 38);
    U.plateMat.emissiveIntensity = glow * 3.6 * flick; U.mouthMat.emissiveIntensity = glow * 2.5 * flick;
    U.mouthGlow.scale.setScalar(0.1 + glow * 3.2 * flick); U.mouthGlow.material.opacity = glow * 0.8;
    const fogCol = ctx.scene.fog.color, haze = Math.min(0.5, Math.max(0, (this.s - dist - 40) / 260));       // a little atmospheric perspective
    for (const m of Object.values(skinMats)) if (m.userData.base && m !== skinMats.eye) m.color.copy(m.userData.base).lerp(fogCol, haze);
    // the jet only while a fire wave is being launched
    U.jet.visible = fireNow;
    if (fireNow) aimJet(U, this.plan[this.fired - 1].lanes, flick);
    // waves
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const sd = this.waves[i];
      if (!sd.group.parent || sd.s1 < dist - 14) { this.waves.splice(i, 1); continue; }
      if (!sd.armed) { sd.s0 = this.s - IMPACT; sd.s1 = sd.s0 + sd.len; sd.group.position.z = -(sd.s1 - sd.leg.a); }
      animateFlameWave(sd.group, time, sd.armed && !sd.smashT, sd.s0 - dist);
    }
    if (this.fired >= N && !this.survived && ctx.state === 'running' && !this.waves.some((x) => x.armed && x.s1 > dist - 1)) {
      this.survived = true; ctx.score += 400 * ctx.mult; ctx.stats.kaiju = (ctx.stats.kaiju | 0) + 1;
    }
    if (moving && this.s - dist < 150) { const s2 = Math.sin(this.stride); if (s2 > 0.97 && !this.thud) { this.thud = true; this.audio.rumble(); ctx.shake = Math.max(ctx.shake, 0.18); } if (s2 < 0.5) this.thud = false; }
    if (this.phase === 'leave' && (this.s - dist > 190 || this.turnT > 6 || this.s > leg.b - 10)) this.dispose();
  }

  dispose() {
    this.live = false;
    if (this.model && this.model.parent) this.model.removeFromParent();
    for (const sd of this.waves) { sd.ghost = true; sd.group.removeFromParent(); }
    this.waves = [];
  }
}
