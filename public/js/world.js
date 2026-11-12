// Endless procedural labyrinth corridor, obstacle patterns, coins and pick-ups.
// Track coordinate `s` grows along the path. Objects live in their leg's frame (see track.js); only `root` moves each frame.
import * as THREE from 'three';
import { LANES, SEG_LEN, VIEW_AHEAD, KEEP_BEHIND, BIOME_LEN, BIOMES, CORRIDOR_HALF, PLAYER, POWERUPS, SPEED } from './config.js';
import * as M from './models.js';
import { Track, CORNER_HALF } from './track.js';
import { buildFlameWave } from './kaiju.js';

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const biomeIndexAt = (s) => Math.floor(Math.max(0, s) / BIOME_LEN);
export const biomeAt = (s) => BIOMES[biomeIndexAt(s) % BIOMES.length];

/** Expected running speed at track position s. The maze layout may only depend on distance, never on live play, so two phones generate identical mazes. */
export const estSpeed = (s) => Math.min(SPEED.max, Math.sqrt(SPEED.start * SPEED.start + 2 * SPEED.accel * Math.max(0, s)));

const BLOCK_H = 1.45, RAMP_LEN = 5.5, WALL_H = 4.4;
const COIN_CAP = 420;

export class World {
  constructor(scene, biomeMats, S, textures) {
    this.scene = scene; this.BM = biomeMats; this.S = S; this.tex = textures;
    this.root = new THREE.Group(); scene.add(this.root);
    this.tmpV = new THREE.Vector3();

    this.leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8a3d, roughness: 0.95, flatShading: true });
    this.rubbleMat = new THREE.MeshStandardMaterial({ color: 0x4a4458, roughness: 1, flatShading: true });
    this.laneMats = {};
    for (const b of BIOMES) {
      this.laneMats[b.id] = new THREE.MeshBasicMaterial({ map: textures.laneRune, color: b.accent, transparent: true, opacity: 0.5, depthWrite: false });
    }
    textures.laneRune.repeat.set(1, SEG_LEN / 4);
    this.lavaMat = new THREE.MeshBasicMaterial({ color: 0xff7a2f, transparent: true, opacity: 0.8, depthWrite: false });

    const cm = M.buildCoinMesh(textures.coin, COIN_CAP);
    this.coinMesh = cm.face; this.coinRim = cm.rim;
    this.root.add(cm.face, cm.rim);
    // soft ambient-occlusion gradients (wall bases, floor edges) and sun shafts
    this.aoFloorMat = new THREE.MeshBasicMaterial({ map: textures.aoH, transparent: true, opacity: 0.55, depthWrite: false });
    this.aoWallMat = new THREE.MeshBasicMaterial({ map: textures.aoV, transparent: true, opacity: 0.6, depthWrite: false });
    this.shaftMat = new THREE.MeshBasicMaterial({ map: textures.shaft, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: 0xfff0c8 });
    this.aoFloorGeo = new THREE.PlaneGeometry(1.5, 1); this.aoFloorGeo.rotateX(-Math.PI / 2);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    this.deco = {};
    this.signMat = new THREE.MeshBasicMaterial({ map: textures.signArrow, transparent: true });
    this.floorArrowMat = new THREE.MeshBasicMaterial({ map: textures.floorArrow, transparent: true, depthWrite: false, opacity: 0.9 });

    // a few real lights hop between the nearest torches
    this.torchLights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffa24a, 0, 26, 2); this.scene.add(l); this.torchLights.push(l); }

    this.dummy = new THREE.Object3D();
    this.reset(1);
  }

  reset(seed = (Math.random() * 1e9) | 0, dist = 0) {
    this.clearAll();
    this.rand = mulberry(seed);
    this.dist = dist;
    this.segments = []; this.torches = [];
    if (this.track) this.track.dispose();
    this.track = new Track(this.root, mulberry((seed ^ 0x51ed270b) >>> 0), dist);
    this.cursor = { k: this.track.legs[0].k, s: this.track.legs[0].segStart };
    this.solids = []; this.coins = []; this.pickups = [];
    this.spawnS = dist + 70;           // first obstacle row: generous run-up
    this.path = 1; this.busy = [-1e9, -1e9, -1e9]; this.prevOcc = [true, true, true];
    this.prev = { s: dist + 10, lane: 1, type: null };
    this.sincePickup = 0; this.skyS = 0; this.skyLane = null; this.skyRun = 0; this.skyPrevX = null;
    this.speedHint = 15; this.flying = false; this.sinceJet = 1500; this.targetX = 0; this.skyPhase = 0;
    this.biomeIdx = -1;
  }

  clearAll() {
    if (this.track) { this.track.dispose(); this.track = null; }
    if (this.coinMesh) this.coinMesh.count = this.coinRim.count = 0;
  }

  // ---------------------------------------------------------------- segments
  buildSegment(leg, s0) {
    const biome = biomeAt(s0 + SEG_LEN / 2), m = this.BM[biome.id];
    const rand = mulberry(Math.floor(s0 * 13) + 7919);
    const g = new THREE.Group(); g.userData = { s0, s1: s0 + SEG_LEN, biome: biome.id, leg };
    const S = this.S;
    const add = (o) => { g.add(o); return o; };
    const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

    // floor + lane runes
    const floor = add(at(new THREE.Mesh(M.planeGeo(CORRIDOR_HALF * 2 + 3.2, SEG_LEN, 6), m.floor), 0, 0, -SEG_LEN / 2));
    floor.receiveShadow = true;
    for (const x of [-1.2, 1.2]) {
      const r = new THREE.Mesh(this.runePlane || (this.runePlane = new THREE.PlaneGeometry(0.5, SEG_LEN)), this.laneMats[biome.id]);
      r.rotation.x = -Math.PI / 2; r.position.set(x, 0.012, -SEG_LEN / 2);
      add(r);
    }
    // biome flavour strips
    if (biome.id === 'lava') {
      for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.55, SEG_LEN), this.lavaMat); l.rotation.x = -Math.PI / 2; l.position.set(sx * 3.7, 0.02, -SEG_LEN / 2); add(l); }
    }

    // walls (with optional side openings = maze branches)
    const wallH = 7.2, wallT = 1.6;
    const openings = { '-1': null, '1': null };
    for (const side of [-1, 1]) {
      if (s0 > 40 && rand() < 0.42) openings[side] = [3, 7, 11, 15][Math.floor(rand() * 4)];
    }
    for (const side of [-1, 1]) {
      const oz = openings[side], gapW = 4.4;
      const segs = oz == null ? [[0, SEG_LEN]] : [[0, oz], [oz + gapW, SEG_LEN]];
      for (const [a, b] of segs) {
        if (b - a < 0.01) continue;
        const w = at(new THREE.Mesh(M.boxGeo(wallT, wallH, b - a), m.wall), side * (CORRIDOR_HALF + wallT / 2), wallH / 2, -(a + b) / 2);
        w.castShadow = true; w.receiveShadow = true; add(w);
        const cap = at(new THREE.Mesh(M.boxGeo(wallT + 0.5, 0.45, b - a + 0.05), m.trim), side * (CORRIDOR_HALF + wallT / 2), wallH + 0.2, -(a + b) / 2); add(cap);
        const base = at(new THREE.Mesh(M.boxGeo(0.4, 0.55, b - a), m.trim), side * (CORRIDOR_HALF - 0.15), 0.27, -(a + b) / 2); base.receiveShadow = true; add(base);
        const aoF = new THREE.Mesh(this.aoFloorGeo, this.aoFloorMat); aoF.scale.set(side < 0 ? 1 : -1, 1, b - a); aoF.position.set(side * (CORRIDOR_HALF - 0.74), 0.025, -(a + b) / 2); add(aoF);
        const aoW = new THREE.Mesh(this.aoWallGeo || (this.aoWallGeo = new THREE.PlaneGeometry(1, 2.6)), this.aoWallMat); aoW.scale.x = b - a; aoW.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; aoW.position.set(side * (CORRIDOR_HALF - 0.03), 1.3, -(a + b) / 2); add(aoW);
      }
      if (oz != null) this.buildAlcove(g, side, oz, gapW, wallH, wallT, biome, m, rand);
    }
    // pillars every 12 m
    for (const side of [-1, 1]) for (const z of [0, 12]) {
      if (openings[side] != null && z > openings[side] - 0.6 && z < openings[side] + 5) continue;
      const p = at(new THREE.Mesh(M.boxGeo(0.7, wallH, 0.9), m.trim), side * (CORRIDOR_HALF - 0.3), wallH / 2, -z - 0.05); p.castShadow = true; add(p);
    }

    // torches (two per segment, staggered) – lights are attached dynamically
    for (const [side, z] of [[-1, 5.5 + rand() * 3], [1, 15 + rand() * 3]]) {
      if (openings[side] != null && Math.abs(z - openings[side] - 2.2) < 3) continue;
      const t = M.buildTorch(S, biome.torch); t.position.set(side * (CORRIDOR_HALF - 0.12), 3, -z); add(t);
      this.torches.push({ s: s0 + z, leg, lx: side * (CORRIDOR_HALF - 0.8), ly: 3.4, lz: -(s0 + z - leg.a), obj: t, color: biome.torch });
    }

    // overhead arch + hanging things
    const landmark = Math.round(s0 / SEG_LEN) % 7 === 3 && s0 > 100;
    if (landmark) { this.buildLandmark(g, biome, m, rand, wallH); g.userData.landmark = true; }
    else if (rand() < 0.4) this.buildArch(g, biome, m, rand, wallH);

    // banners / hanging flora on walls
    if (biome.id === 'stone' && rand() < 0.6) { const b = M.buildBanner([0x7a1020, 0x1c3a7a, 0x5a2a7a][Math.floor(rand() * 3)]); b.position.set(-(CORRIDOR_HALF - 0.08), 6.2, -(2 + rand() * 20)); b.rotation.y = Math.PI / 2; add(b); }

    // ground-level decor along the edges
    for (const side of [-1, 1]) {
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const z = rand() * SEG_LEN, x = side * (CORRIDOR_HALF - 0.45 - rand() * 0.2);
        if (openings[side] != null && z > openings[side] - 1 && z < openings[side] + 5.4) continue;
        let d = null;
        const bm = this.bushMat(biome.id);
        if (bm) { d = M.buildBush(bm, 0.5 + rand() * 0.45 + (biome.id === 'jungle' ? 0.3 : 0)); }
        else if (biome.id === 'coral') { d = M.buildCrystalCluster([0xff7f9a, 0xff9a5a, 0x3cc9bd, 0xffb3c7][Math.floor(rand() * 4)], 0.6 + rand() * 0.5); }
        else if (biome.id === 'stone') { d = new THREE.Group(); for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(M.boxGeo(0.3 + rand() * 0.4, 0.25 + rand() * 0.35, 0.3 + rand() * 0.4), this.rubbleMat); r.position.set((rand() - 0.5) * 0.7, 0.15, (rand() - 0.5) * 0.9); r.rotation.set(rand(), rand() * 3, rand()); r.castShadow = true; d.add(r); } }
        else if (biome.id === 'crystal') { d = M.buildCrystalCluster(rand() > 0.5 ? 0x4cd9ff : 0xb36bff, 0.7 + rand() * 0.5); }
        else { d = new THREE.Group(); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1 + rand(), 5), this.rubbleMat); sp.position.y = 0.55; sp.castShadow = true; d.add(sp); const e = new THREE.Sprite(S.glowSprite(0xff5a1f, 0.7)); e.scale.set(2.2, 2.2, 1); e.position.y = 0.3; d.add(e); }
        d.position.set(x, 0, -z); d.rotation.y = rand() * 6; add(d);
      }
    }
    this.addWallDecor(g, biome, rand, openings);
    this.addScatter(g, biome, rand, openings);
    if (biome.id === 'hollow') this.addStringLights(g, rand, openings);
    if (rand() < 0.45) {                                   // sun shafts slanting into the corridor
      for (let k = 0; k < 2; k++) {
        const sh = new THREE.Mesh(this.shaftGeo || (this.shaftGeo = new THREE.PlaneGeometry(3.2, 11)), this.shaftMat);
        sh.position.set(-1.6 + k * 1.2, 4.4, -(3 + rand() * 18)); sh.rotation.set(0, (rand() - 0.5) * 0.4, 0.55); add(sh);
      }
    }
    g.position.z = -(s0 - leg.a);
    leg.group.add(g);
    return g;
  }

  /** Instanced silhouette decor so the walls aren't flat boxes: bumpy hedges, battlements, crystal spires, rock fins. */
  addWallDecor(g, biome, rand, openings) {
    const D = this.deco, items = [], wallH = 7.2;
    const ok = (side, z) => openings[side] == null || z < openings[side] - 0.8 || z > openings[side] + 5.2;
    let geo, mat, colors = null;
    const FAM = {
      hedge: { cols: [0x2f9a3c, 0x3cb04d, 0x4cc85e, 0x63da70, 0x27843a], top: 1, big: 1 },
      blossom: { cols: [0xffc2d8, 0xffa6c6, 0xff8fb8, 0xffe0ec, 0xffd0e0, 0x7bd882], top: 1.25, big: 1.25 },
      autumn: { cols: [0xe0701a, 0xf08a24, 0xd44a1a, 0xf2b134, 0xb8381a, 0xc25a1a], top: 1.1, big: 1.1 },
      jungle: { cols: [0x2f8a3c, 0x27733a, 0x3aa04a, 0x1f5f30, 0x56b85a], top: 1.5, big: 1.4 },
    }[biome.id];
    if (biome.id === 'coral') {
      geo = D.coralGeo || (D.coralGeo = new THREE.ConeGeometry(0.34, 1, 6)); mat = D.coralMat || (D.coralMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, flatShading: true }));
      colors = [0xff7f9a, 0xff9a5a, 0xf2547d, 0x3cc9bd, 0xffb3c7, 0xffd166];
      for (const side of [-1, 1]) for (let i = 0; i < 16; i++) { const z = rand() * 24, h = 1 + rand() * 2.6; if (ok(side, z)) items.push({ x: side * (CORRIDOR_HALF + 0.4 + rand() * 0.9), y: wallH + 0.3 + h / 2, z: -z, sx: 0.8 + rand() * 0.8, sy: h, sz: 0.8 + rand() * 0.8, ry: rand() * 6, tilt: (rand() - 0.5) * 0.5 }); }
    } else if (FAM) {
      geo = D.hedgeGeo || (D.hedgeGeo = new THREE.IcosahedronGeometry(0.55, 1)); mat = D.hedgeMat || (D.hedgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }));
      colors = FAM.cols;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 26; i++) { const z = rand() * 24; if (ok(side, z)) items.push({ x: side * (CORRIDOR_HALF - 0.06), y: 0.5 + rand() * 6.3, z: -z, sx: 0.5, sy: (0.7 + rand() * 0.7) * FAM.big, sz: (0.8 + rand() * 0.8) * FAM.big, side }); }
        for (let i = 0; i < 10; i++) { const z = (i + rand() * 0.6) * 2.4; if (ok(side, z)) items.push({ x: side * (CORRIDOR_HALF + 0.8), y: wallH + 0.35, z: -z, sx: 1.5 * FAM.top, sy: (1.1 + rand() * 0.5) * FAM.top, sz: 1.7 * FAM.top, side }); }
      }
    } else if (biome.id === 'hollow') {
      geo = D.tendrilGeo || (D.tendrilGeo = new THREE.ConeGeometry(0.3, 1, 5)); mat = D.tendrilMat || (D.tendrilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true }));
      colors = [0x2a1030, 0x3a1838, 0x1c0f24, 0x4a1a3a, 0x2a0a1a];
      for (const side of [-1, 1]) for (let i = 0; i < 16; i++) { const z = rand() * 24, h = 1.4 + rand() * 3.2; if (ok(side, z)) items.push({ x: side * (CORRIDOR_HALF + 0.4 + rand() * 0.9), y: wallH + 0.3 + h / 2, z: -z, sx: 0.8 + rand() * 0.9, sy: h, sz: 0.8 + rand() * 0.9, ry: rand() * 6, tilt: (rand() - 0.5) * 0.7 }); }
    } else if (biome.id === 'stone') {
      geo = D.merlonGeo || (D.merlonGeo = new THREE.BoxGeometry(1.1, 0.85, 1.5)); mat = D.merlonMat || (D.merlonMat = new THREE.MeshStandardMaterial({ color: 0xcdb99c, roughness: 0.9 }));
      for (const side of [-1, 1]) for (let i = 0; i < 8; i++) { const z = 0.8 + i * 3; if (ok(side, z)) items.push({ x: side * (CORRIDOR_HALF + 0.8), y: wallH + 0.62, z: -z, sx: 1, sy: 1, sz: 1 }); }
    } else if (biome.id === 'crystal') {
      geo = D.spireGeo || (D.spireGeo = new THREE.ConeGeometry(0.4, 1, 5)); mat = D.spireMat || (D.spireMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.3, emissive: 0x5ad0ff, emissiveIntensity: 0.55, flatShading: true }));
      colors = [0xbfefff, 0x8fd8ff, 0xd8c8ff, 0xffffff, 0x9fe8ff];
      for (const side of [-1, 1]) for (let i = 0; i < 12; i++) { const z = rand() * 24, h = 1.2 + rand() * 2.4; if (ok(side, z)) items.push({ x: side * (CORRIDOR_HALF + 0.5 + rand() * 0.7), y: wallH + 0.3 + h / 2, z: -z, sx: 0.8 + rand() * 0.6, sy: h, sz: 0.8 + rand() * 0.6, ry: rand() * 6, tilt: (rand() - 0.5) * 0.3 }); }
    } else {
      geo = D.finGeo || (D.finGeo = new THREE.ConeGeometry(0.55, 1, 4)); mat = D.finMat || (D.finMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }));
      colors = [0xc98a63, 0xb87752, 0xd9a07a, 0xa86a48];
      for (const side of [-1, 1]) for (let i = 0; i < 12; i++) { const z = rand() * 24, h = 1 + rand() * 2.2; if (ok(side, z)) items.push({ x: side * (CORRIDOR_HALF + 0.5 + rand() * 0.8), y: wallH + 0.3 + h / 2, z: -z, sx: 0.9 + rand() * 0.9, sy: h, sz: 0.9 + rand() * 0.9, ry: rand() * 6, tilt: (rand() - 0.5) * 0.4 }); }
    }
    if (!items.length) return;
    const im = new THREE.InstancedMesh(geo, mat, items.length), d = this.dummy, c = new THREE.Color();
    items.forEach((it, i) => {
      d.position.set(it.x, it.y, it.z); d.rotation.set(it.tilt || 0, it.ry || 0, 0); d.scale.set(it.sx, it.sy, it.sz); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      if (colors) { c.setHex(colors[Math.floor(rand() * colors.length)]); if (FAM) c.multiplyScalar(0.7 + 0.3 * clamp(it.y / 6, 0, 1)); im.setColorAt(i, c); }
    });
    im.castShadow = true; im.receiveShadow = true; g.add(im);
  }

  bushMat(id) {
    const cols = { hedge: 0x2f8a3d, blossom: 0xff9fc0, autumn: 0xe0701a, jungle: 0x1f6f35 };
    if (!cols[id]) return null;
    this.bushMats = this.bushMats || {};
    return this.bushMats[id] || (this.bushMats[id] = new THREE.MeshStandardMaterial({ color: cols[id], roughness: 0.95, flatShading: true }));
  }

  /** Small scattered props along the edges of the path: flowers, pebbles, mushrooms, shells. One instanced draw call per segment. */
  addScatter(g, biome, rand, openings) {
    const D = this.deco, N = 16;
    const SET = {
      hedge: { cols: [0xffe14a, 0xffffff, 0xff7fb0, 0xb48cff], s: [0.09, 0.16], sy: 1 },
      blossom: { cols: [0xffc2d8, 0xffffff, 0xff8fb8], s: [0.1, 0.18], sy: 0.35 },
      stone: { cols: [0x8d826f, 0xa89c86, 0x6f6658], s: [0.12, 0.26], sy: 0.6 },
      autumn: { cols: [0xe0701a, 0xf2a23a, 0xc4411a, 0x9a3a14], s: [0.12, 0.24], sy: 0.35 },
      crystal: { cols: [0xcdeeff, 0xffffff, 0x9fd8ff], s: [0.1, 0.2], sy: 1.8 },
      jungle: { cols: [0xe8452d, 0xf6f0d8, 0xffc23a], s: [0.12, 0.22], sy: 0.7 },
      lava: { cols: [0x6a4a3a, 0x8a5a44, 0xff6a2a], s: [0.12, 0.26], sy: 0.6 },
      hollow: { cols: [0xff2a3a, 0xaa1a2a, 0xff6a5a, 0x5a1a3a], s: [0.12, 0.3], sy: 1.1, glow: true },
      coral: { cols: [0xffffff, 0xffc2d4, 0xffe3a6, 0xa7eee6], s: [0.1, 0.2], sy: 0.8 },
    }[biome.id];
    if (!SET) return;
    const geo = D.scatterGeo || (D.scatterGeo = new THREE.IcosahedronGeometry(1, 1));
    const mat = SET.glow ? (D.podMat || (D.podMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, flatShading: true, emissive: 0xff1a2a, emissiveIntensity: 0.9 }))) : (D.scatterMat || (D.scatterMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true })));
    const im = new THREE.InstancedMesh(geo, mat, N * 2), d = this.dummy, c = new THREE.Color();
    let n = 0;
    for (const side of [-1, 1]) for (let i = 0; i < N; i++) {
      const z = rand() * SEG_LEN; if (openings[side] != null && z > openings[side] - 1 && z < openings[side] + 5.4) continue;
      const sz = SET.s[0] + rand() * (SET.s[1] - SET.s[0]);
      d.position.set(side * (CORRIDOR_HALF - 0.25 - rand() * 0.55), sz * SET.sy * 0.6, -z); d.rotation.set(0, rand() * 6, 0); d.scale.set(sz, sz * SET.sy, sz); d.updateMatrix();
      im.setMatrixAt(n, d.matrix); c.setHex(SET.cols[Math.floor(rand() * SET.cols.length)]); im.setColorAt(n, c); n++;
    }
    im.count = n; im.receiveShadow = true; g.add(im);
  }

  /** Sagging strings of coloured bulbs along both walls: they flicker like a failing circuit (see World.update). */
  addStringLights(g, rand, openings) {
    const D = this.deco, cols = [0xff3040, 0xffb020, 0x3a8cff, 0x40e070, 0xfff0d0, 0xff40c0];
    const geo = D.bulbGeo || (D.bulbGeo = new THREE.SphereGeometry(0.13, 8, 6)), mat = D.bulbMat || (D.bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const wire = D.wireMat || (D.wireMat = new THREE.LineBasicMaterial({ color: 0x07030a }));
    const pts = [], im = new THREE.InstancedMesh(geo, mat, 40), d = this.dummy, c = new THREE.Color(); let n = 0;
    for (const side of [-1, 1]) {
      const line = [];
      for (let z = 0; z <= SEG_LEN + 1e-6; z += 0.8) {
        const f = (z % 12) / 12, y = 6.1 - 0.95 * Math.sin(Math.PI * f), x = side * (CORRIDOR_HALF - 0.12);
        line.push(new THREE.Vector3(x, y, -z));
        if (Math.abs(z % 1.6) < 1e-6 && n < 40 && (openings[side] == null || z < openings[side] - 0.5 || z > openings[side] + 4.9)) {
          d.position.set(x - side * 0.05, y - 0.14, -z); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix(); im.setMatrixAt(n, d.matrix); c.setHex(cols[Math.floor(rand() * cols.length)]); im.setColorAt(n, c); n++;
        }
      }
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), wire); g.add(ln);
    }
    im.count = n; g.add(im);
  }

  buildAlcove(g, side, oz, gapW, wallH, wallT, biome, m, rand) {
    const S = this.S, depth = 9, xIn = CORRIDOR_HALF + wallT, zc = -(oz + gapW / 2);
    const lintel = new THREE.Mesh(M.boxGeo(wallT, 2.3, gapW), m.wall); lintel.position.set(side * (CORRIDOR_HALF + wallT / 2), wallH - 1.15, zc); lintel.castShadow = true; g.add(lintel);
    for (const dz of [-1, 1]) {
      const post = new THREE.Mesh(M.boxGeo(0.7, wallH - 2.3, 0.7), m.trim); post.position.set(side * (CORRIDOR_HALF - 0.3), (wallH - 2.3) / 2, zc + dz * (gapW / 2 + 0.2)); g.add(post);
    }
    const fl = new THREE.Mesh(M.planeGeo(depth, gapW + 1.6, 6), m.floor); fl.position.set(side * (xIn + depth / 2), 0, zc); fl.receiveShadow = true; g.add(fl);
    for (const dz of [-1, 1]) {
      const sw = new THREE.Mesh(M.boxGeo(depth, wallH, 0.8), m.wall); sw.position.set(side * (xIn + depth / 2), wallH / 2, zc + dz * (gapW / 2 + 0.4 + 0.4)); g.add(sw);
    }
    const bw = new THREE.Mesh(M.boxGeo(0.8, wallH, gapW + 2.4), m.wall); bw.position.set(side * (xIn + depth + 0.4), wallH / 2, zc); g.add(bw);
    // glowing "way onward" portal on the back wall + a torch inside
    const portal = new THREE.Sprite(S.glowSprite(biome.accent, 0.8)); portal.scale.set(4.5, 5.5, 1); portal.position.set(side * (xIn + depth - 0.4), 2.6, zc); g.add(portal);
    const t = M.buildTorch(S, biome.torch); t.position.set(side * (xIn + 0.6), 2.6, zc - gapW / 2 - 0.1); g.add(t);
    this.torches.push({ s: g.userData.s0 + oz + gapW / 2, leg: g.userData.leg, lx: side * (xIn + 1), ly: 2.6, lz: -(g.userData.s0 + oz + gapW / 2 - g.userData.leg.a), obj: t, color: biome.torch, noLight: true });
    if (rand() < 0.7) {
      const st = biome.id === 'crystal' ? M.buildCrystalCluster(0xb36bff, 1.3) : M.buildStatue(m.trim);
      st.position.set(side * (xIn + depth - 2), 0, zc); st.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(st);
    }
  }

  lmMat(color, o = {}) {
    this.lm = this.lm || {};
    const key = color + '|' + (o.em || 0) + '|' + (o.rough ?? 0.7) + '|' + (o.metal || 0);
    return this.lm[key] || (this.lm[key] = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal || 0, emissive: o.em ? color : 0x000000, emissiveIntensity: o.em || 0, flatShading: !!o.flat }));
  }

  /** A big biome-specific gateway spanning the corridor (well above anything the player can reach). */
  buildLandmark(g, biome, m, rand, wallH) {
    const z = -12, S = this.S, add = (o) => { o.castShadow = true; g.add(o); return o; };
    const mesh = (geo, mat, x, y, zz = z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, zz); return add(o); };
    const arc = (R, tube, mat) => { const o = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 10, 36, Math.PI), mat); o.position.set(0, wallH, z); return add(o); };
    const spheresOnArc = (R, n, mat, size, lift = 0.4) => { for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI, sp = new THREE.Mesh(new THREE.IcosahedronGeometry(size * (0.7 + rand() * 0.6), 1), mat); sp.position.set(Math.cos(a) * R, wallH + Math.sin(a) * R + lift, z + (rand() - 0.5) * 0.5); add(sp); } };
    const id = biome.id;
    if (id === 'blossom') {                                                       // red torii gate with blossom on top
      const red = this.lmMat(0xd0302a, { rough: 0.45 }), dark = this.lmMat(0x2a1a1a);
      for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.5, 0.62, 11, 14), red, sx * 6.3, 5.5);
      mesh(new THREE.BoxGeometry(16.4, 0.7, 1.2), red, 0, 11.0); mesh(new THREE.BoxGeometry(17.6, 0.35, 1.5), dark, 0, 11.5);
      for (const sx of [-1, 1]) { const tip = mesh(new THREE.BoxGeometry(1.8, 0.4, 1.2), dark, sx * 8.6, 11.7); tip.rotation.z = sx * 0.35; }
      mesh(new THREE.BoxGeometry(13.4, 0.5, 0.8), red, 0, 9.4); mesh(new THREE.BoxGeometry(1.6, 1.8, 0.5), this.lmMat(0x1a1a1a), 0, 10.2);
      spheresOnArc(5.2, 9, this.bushMat('blossom'), 0.9, 4.2);
    } else if (id === 'hedge') {                                                  // trellis arch hung with garlands and flowers
      const wood = this.lmMat(0x8a6a44, { rough: 0.85 }); arc(5.6, 0.42, wood); arc(5.1, 0.22, wood);
      spheresOnArc(5.6, 18, this.bushMat('hedge'), 0.55, 0.05);
      const fl = [this.lmMat(0xff7fb0, { em: 0.2 }), this.lmMat(0xffe14a, { em: 0.2 }), this.lmMat(0xffffff, { em: 0.2 })];
      for (let i = 1; i < 26; i++) { const a = (i / 26) * Math.PI, sp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), fl[i % 3]); sp.position.set(Math.cos(a) * 5.6, wallH + Math.sin(a) * 5.6 + 0.2, z + 0.4); g.add(sp); }
      const lan = M.buildLantern(S, biome.torch); lan.position.set(0, wallH + 5.6 - 0.9, z); g.add(lan);
    } else if (id === 'stone') {                                                  // great stone arch with a keystone and a banner
      const st = this.lmMat(0xb9a584, { rough: 0.9 }); arc(5.6, 0.7, st);
      mesh(new THREE.BoxGeometry(1.8, 1.8, 1.6), st, 0, wallH + 5.6 + 0.2); mesh(new THREE.BoxGeometry(14, 0.6, 1.4), st, 0, wallH + 5.6 + 1.5);
      for (const sx of [-1, 1]) { mesh(new THREE.BoxGeometry(1.3, 3.2, 1.3), st, sx * 5.6, wallH + 1.6); mesh(new THREE.BoxGeometry(1.7, 0.4, 1.7), st, sx * 5.6, wallH + 3.4); }
      const bn = M.buildBanner(0x7a1020); bn.position.set(0, wallH + 5.4, z + 0.2); g.add(bn);
    } else if (id === 'autumn') {                                                 // timber gate with lanterns
      const wood = this.lmMat(0x6a3f1e, { rough: 0.9 });
      for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(1.1, 11, 1.1), wood, sx * 6.4, 5.5);
      mesh(new THREE.BoxGeometry(15, 0.9, 1.3), wood, 0, 10.6); mesh(new THREE.BoxGeometry(13, 0.5, 0.9), wood, 0, 9.0);
      spheresOnArc(5.0, 10, this.bushMat('autumn'), 0.8, 3.6);
      for (const x of [-3.6, 0, 3.6]) { const lan = M.buildLantern(S, biome.torch); lan.position.set(x, 9.0, z + 0.2); g.add(lan); }
    } else if (id === 'crystal') {                                                // ice arch with spires
      const ice = this.lmMat(0xbfe8ff, { rough: 0.12, metal: 0.2, em: 0.35, flat: true }); arc(5.6, 0.6, ice);
      for (let i = 1; i < 14; i++) { const a = (i / 14) * Math.PI, h = 1.4 + rand() * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(0.35, h, 5), ice); sp.position.set(Math.cos(a) * 5.6, wallH + Math.sin(a) * 5.6 + h * 0.4, z); sp.rotation.z = a - Math.PI / 2; add(sp); }
    } else if (id === 'jungle') {                                                 // overgrown stone arch dripping vines
      const st = this.lmMat(0x6e8466, { rough: 0.95 }); arc(5.6, 0.75, st);
      for (let i = 0; i < 22; i++) { const a = rand() * Math.PI, l = 1 + rand() * 4, v = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, l, 5), this.leafMat); v.position.set(Math.cos(a) * 5.4, wallH + Math.sin(a) * 5.4 - l / 2, z + (rand() - 0.5) * 0.8); g.add(v); }
      spheresOnArc(5.6, 14, this.bushMat('jungle'), 0.8, 0.4);
      const gl = new THREE.Sprite(S.glowSprite(biome.accent, 1)); gl.scale.set(7, 7, 1); gl.position.set(0, wallH + 4.2, z); g.add(gl);
    } else if (id === 'lava') {                                                   // obsidian arch with a glowing seam
      const ob = this.lmMat(0x3a2a26, { rough: 0.5, metal: 0.4 }); arc(5.6, 0.7, ob);
      const hot = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.2, 8, 36, Math.PI), this.lmMat(0xff6a1a, { em: 1.6 })); hot.position.set(0, wallH, z + 0.55); g.add(hot);
      for (let i = 1; i < 10; i++) { const a = (i / 10) * Math.PI, h = 1.2 + rand() * 1.6, sp = new THREE.Mesh(new THREE.ConeGeometry(0.4, h, 4), ob); sp.position.set(Math.cos(a) * 5.6, wallH + Math.sin(a) * 5.6 + h * 0.4, z); sp.rotation.z = a - Math.PI / 2; add(sp); }
    } else if (id === 'hollow') {                                                 // a dark gate with a pulsing red portal
      const ob = this.lmMat(0x24102c, { rough: 0.6, metal: 0.2 }); arc(5.6, 0.8, ob);
      const portal = new THREE.Mesh(new THREE.CircleGeometry(5.0, 40, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
      portal.position.set(0, wallH, z); g.add(portal); g.userData.portal = portal;
      for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI, h = 1.6 + rand() * 2.4, sp = new THREE.Mesh(new THREE.ConeGeometry(0.34, h, 5), ob); sp.position.set(Math.cos(a) * 5.6, wallH + Math.sin(a) * 5.6 + h * 0.4, z); sp.rotation.z = a - Math.PI / 2 + (rand() - 0.5) * 0.6; add(sp); }
      const gl = new THREE.Sprite(S.glowSprite(0xff2a3a, 1)); gl.scale.set(9, 9, 1); gl.position.set(0, wallH + 3.2, z); g.add(gl);
    } else {                                                                      // coral palace: coral arch with pearls
      const cor = this.lmMat(0xff8aa0, { rough: 0.55 }); arc(5.6, 0.6, cor);
      const pearl = this.lmMat(0xfff5ee, { rough: 0.15, metal: 0.1, em: 0.3 });
      for (let i = 1; i < 16; i++) { const a = (i / 16) * Math.PI, h = 1 + rand() * 2.2, col = [0xff7f9a, 0xff9a5a, 0x3cc9bd, 0xffd166][i % 4], sp = new THREE.Mesh(new THREE.ConeGeometry(0.3, h, 6), this.lmMat(col, { rough: 0.55 })); sp.position.set(Math.cos(a) * 5.6, wallH + Math.sin(a) * 5.6 + h * 0.4, z); sp.rotation.z = a - Math.PI / 2 + (rand() - 0.5) * 0.5; add(sp); }
      for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI, sp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), pearl); sp.position.set(Math.cos(a) * 5.0, wallH + Math.sin(a) * 5.0, z + 0.5); g.add(sp); }
    }
  }

  buildArch(g, biome, m, rand, wallH) {
    const S = this.S, z = -(4 + rand() * 16), y = wallH - 0.9;
    const beam = new THREE.Mesh(M.boxGeo(CORRIDOR_HALF * 2 + 1.2, 0.9, 1.0), m.trim); beam.position.set(0, y, z); beam.castShadow = true; g.add(beam);
    for (const sx of [-1, 1]) {
      const br = new THREE.Mesh(M.boxGeo(1.7, 0.55, 0.9), m.trim); br.position.set(sx * 3.2, y - 0.9, z); br.rotation.z = sx * Math.PI / 4; g.add(br);
    }
    const lan = M.buildLantern(S, biome.torch); lan.position.set(0, y - 0.5, z); g.add(lan);
    this.torches.push({ s: g.userData.s0 - z, leg: g.userData.leg, lx: 0, ly: y - 0.7, lz: -(g.userData.s0 - z - g.userData.leg.a), obj: lan, color: biome.torch, lantern: true });
    const vm = this.bushMat(biome.id);
    if (vm) {
      for (let i = 0; i < (biome.id === 'jungle' ? 14 : 7); i++) { const l = 0.8 + rand() * 2.2; const v = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.025, l, 5), biome.id === 'jungle' ? this.leafMat : vm); v.position.set((rand() - 0.5) * 8, y - 0.45 - l / 2, z + (rand() - 0.5) * 0.6); g.add(v); }
    } else if (biome.id === 'crystal') {
      for (let i = 0; i < 6; i++) { const l = 0.8 + rand() * 1.4; const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, l, 5), new THREE.MeshStandardMaterial({ color: 0x113a55, emissive: 0x4cd9ff, emissiveIntensity: 0.9, flatShading: true })); c.rotation.x = Math.PI; c.position.set((rand() - 0.5) * 8, y - 0.45 - l / 2, z); g.add(c); }
    }
  }

  // ---------------------------------------------------------------- obstacles
  addSolid(type, lane, s0, opts = {}) {
    const BMm = this.BM[biomeAt(s0).id], S = this.S;
    let group, len, H = 0, ramp = 0;
    if (type === 'low') { group = M.buildLow(BMm, S); len = 0.9; H = 0.9; }
    else if (type === 'high') { group = M.buildHigh(BMm, S); len = 0.8; }
    else if (type === 'wall') { group = M.buildWall(BMm, S); len = 1.1; H = WALL_H; }
    else { ramp = opts.ramp ? RAMP_LEN : 0; len = ramp + opts.body; H = BLOCK_H; group = M.buildBlock(BMm, S, H, len, ramp); }
    const solid = { type, lane, x: LANES[lane], s0, s1: s0 + len, H, ramp, hw: 1.0, group, ghost: false, yBot: 0.95, yTop: 2.25 };
    const leg = this.track.legAt(s0); solid.leg = leg;
    group.position.set(solid.x, 0, -(s0 - leg.a));
    leg.group.add(group);
    this.solids.push(solid);
    return solid;
  }

  profile(sd, u) {                      // height of a standable solid at distance u along it
    if (sd.type !== 'block') return sd.H;
    return sd.ramp > 0 && u < sd.ramp ? sd.H * (u / sd.ramp) : sd.H;
  }

  /** Ground height and collisions for a body at (x, y) of height ph, standing at track position `dist`. */
  probe(dist, px, py, ph, enteredLane = -1, ownLane = -1, halfWidth = PLAYER.halfWidth) {
    let ground = 0; const hits = [];
    const PD = PLAYER.halfDepth, PW = halfWidth;
    for (const sd of this.solids) {
      if (sd.ghost || sd.ignore || sd.s1 + PD < dist || sd.s0 - PD > dist) continue;
      const dx = Math.abs(px - sd.x);
      if (dx >= sd.hw + PW) continue;
      if (sd.type === 'boulder' || sd.type === 'flame' || sd.isCornerWall) { if (py < sd.H - (sd.isCornerWall ? 0.05 : 0.2)) hits.push({ sd, kind: 'front' }); continue; }
      if (sd.type === 'high') {
        if (py < sd.yTop && py + ph > sd.yBot) hits.push({ sd, kind: dx > sd.hw - 0.2 || sd.lane === enteredLane || (ownLane >= 0 && sd.lane !== ownLane) ? 'side' : 'front' });
        continue;
      }
      const u = clamp(dist, sd.s0, sd.s1) - sd.s0, h = this.profile(sd, u);
      if (sd.type === 'block' && py >= h - PLAYER.stepUp) { ground = Math.max(ground, h); continue; }
      if (py < h - (sd.type === 'block' ? PLAYER.stepUp : 0.05)) hits.push({ sd, kind: dx > sd.hw - 0.2 || sd.lane === enteredLane || (ownLane >= 0 && sd.lane !== ownLane) ? 'side' : 'front' });
    }
    return { ground, hits };
  }

  /** A homing boulder that rolls toward the player. It steers toward the player until it locks onto a lane. */
  addBoulder(lane, s0, speed) {
    const group = M.buildBoulder(this.S);
    const sd = { type: 'boulder', lane, x: LANES[lane], s0, s1: s0 + 2.5, H: 2.8, ramp: 0, hw: 1.0, group, ghost: false, boulderSpeed: speed, locked: false, yBot: 0, yTop: 0, dust: 0 };
    const leg = this.track.legAt(s0); sd.leg = leg;
    group.position.set(sd.x, 0, -(s0 - leg.a));
    leg.group.add(group); this.solids.push(sd);
    return sd;
  }
  /** One lane of a blue fire wave from the Godzilla event. Starts disarmed (floor marks only); the creature arms it. Origin is the rear edge. */
  addFlame(lane, s0, len) {
    const group = buildFlameWave(this.S, len);
    const sd = { type: 'flame', lane, x: LANES[lane], s0, s1: s0 + len, len, H: 1.5, ramp: 0, hw: 1.15, group, ghost: true, armed: false, flameSpeed: 38, yBot: 0, yTop: 0 };
    const leg = this.track.legAt(s0); sd.leg = leg;
    group.position.set(sd.x, 0, -(sd.s1 - leg.a)); leg.group.add(group); this.solids.push(sd);
    return sd;
  }
  stepFlame(sd, dt) { sd.s0 -= sd.flameSpeed * dt; sd.s1 = sd.s0 + sd.len; sd.group.position.z = -(sd.s1 - sd.leg.a); }
  hasBoulder() { return this.solids.some((sd) => sd.type === 'boulder' && !sd.ghost && sd.s1 > this.dist - 6); }

  /** Invisible fatal wall at the end of a corner square: you have to turn before you reach it. */
  addCornerWall(c) {
    const sd = { type: 'wall', lane: 1, x: 0, hw: 4.4, s0: c.s + 3.3, s1: c.s + 3.9, H: 4.4, ramp: 0, group: new THREE.Group(), ghost: c.executed, isCornerWall: true, corner: c, yBot: 0, yTop: 0 };
    c.wall = sd; this.solids.push(sd);
  }

  /** The 8 m x 8 m junction where the path turns 90°: outer walls, a big arrow sign and a painted floor arrow. */
  buildCorner(leg, c) {
    const biome = biomeAt(c.s), m = this.BM[biome.id], S = this.S, rand = mulberry(Math.floor(c.s * 13) + 4242);
    const o = c.dir, wallH = 7.2, wallT = 1.6, H = CORNER_HALF;           // o: side of the outer wall (+1 = right, for a left turn)
    const g = new THREE.Group(); g.userData = { s0: c.s - H, s1: c.s + H, biome: biome.id, leg, corner: true };
    const add = (mesh) => { g.add(mesh); return mesh; };
    const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };
    const floor = add(at(new THREE.Mesh(M.planeGeo(9.6, 9.6, 6), m.floor), o * 0.8, 0, -0.8)); floor.receiveShadow = true;
    const ow = add(at(new THREE.Mesh(M.boxGeo(wallT, wallH, 2 * H), m.wall), o * (CORRIDOR_HALF + wallT / 2), wallH / 2, 0)); ow.castShadow = ow.receiveShadow = true;
    add(at(new THREE.Mesh(M.boxGeo(wallT + 0.5, 0.45, 2 * H + 0.05), m.trim), o * (CORRIDOR_HALF + wallT / 2), wallH + 0.2, 0));
    const fw = add(at(new THREE.Mesh(M.boxGeo(9.6, wallH, wallT), m.wall), o * 0.8, wallH / 2, -H - wallT / 2)); fw.castShadow = fw.receiveShadow = true;
    add(at(new THREE.Mesh(M.boxGeo(10.1, 0.45, wallT + 0.5), m.trim), o * 0.8, wallH + 0.2, -H - wallT / 2));
    add(at(new THREE.Mesh(M.boxGeo(2 * H, 0.55, 0.4), m.trim), 0, 0.27, -H + 0.15));
    add(at(new THREE.Mesh(M.boxGeo(0.4, 0.55, 2 * H), m.trim), o * (CORRIDOR_HALF - 0.15), 0.27, 0));
    // soft AO where walls meet the floor
    const aoF = add(new THREE.Mesh(this.aoFloorGeo, this.aoFloorMat)); aoF.scale.set(o < 0 ? 1 : -1, 1, 2 * H); aoF.position.set(o * (CORRIDOR_HALF - 0.74), 0.025, 0);
    const aoW = add(new THREE.Mesh(this.aoWallGeo || (this.aoWallGeo = new THREE.PlaneGeometry(1, 2.6)), this.aoWallMat)); aoW.scale.x = 2 * H; aoW.rotation.y = o > 0 ? -Math.PI / 2 : Math.PI / 2; aoW.position.set(o * (CORRIDOR_HALF - 0.03), 1.3, 0);
    const aoF2 = add(new THREE.Mesh(this.aoWallGeo, this.aoWallMat)); aoF2.scale.x = 2 * H; aoF2.position.set(0, 1.3, -H + 0.03);
    for (const [px, pz] of [[o * 3.7, H - 0.1], [o * 3.7, -H + 0.3], [-o * 3.7, -H + 0.3], [-o * 3.7, H - 0.1]]) add(at(new THREE.Mesh(M.boxGeo(0.7, wallH, 0.9), m.trim), px, wallH / 2, pz)).castShadow = true;
    // sign + floor arrow, both pointing to the open side
    const sign = add(at(new THREE.Mesh(new THREE.PlaneGeometry(5.4, 5.4), this.signMat), 0, 4.1, -H + 0.04)); if (o < 0) sign.scale.x = -1;
    const mark = add(at(new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), this.floorArrowMat), 0, 0.035, -0.2)); mark.rotation.x = -Math.PI / 2; if (o < 0) mark.scale.x = -1;
    for (const px of [-2.9, 2.9]) {
      const t = M.buildTorch(S, biome.torch); t.position.set(px, 3, -H + 0.12); add(t);
      this.torches.push({ s: c.s, leg, lx: px, ly: 3.4, lz: -(c.s - leg.a) - H + 0.4, obj: t, color: biome.torch });
    }
    g.position.z = -(c.s - leg.a);
    leg.group.add(g); this.segments.push(g);
    this.addCornerWall(c); c.built = true;
    return g;
  }

  /** Removes (ghosts) every obstacle in a range – used when reviving. */
  clearRange(a, b) {
    for (const sd of this.solids) if (sd.s1 > a && sd.s0 < b) sd.ghost = true;
  }

  smash(sd) { sd.ghost = true; sd.smashT = 0.0001; }

  // ---------------------------------------------------------------- coins & pick-ups
  addCoin(s, x, y, extra) {
    if (this.coins.length >= COIN_CAP - 2) return;
    this.coins.push({ s, x, y, spin: Math.random() * 6, leg: this.track.legAt(s), ...extra });
  }

  addPickup(type, lane, s, y = 1.1) {
    const def = POWERUPS[type];
    const g = M.buildPowerup(type, def.color, this.S);
    const leg = this.track.legAt(s);
    g.position.set(LANES[lane], y, -(s - leg.a));
    leg.group.add(g);
    this.pickups.push({ type, s, x: LANES[lane], y, group: g, t: Math.random() * 6 });
  }

  spawnTrail(sA, lA, sB, lB) {
    if (sB - sA < 4) return;
    const n = Math.floor((sB - sA) / 2.1);
    for (let i = 0; i <= n; i++) {
      const t = i / n, sm = clamp((t - 0.3) / 0.4, 0, 1), k = sm * sm * (3 - 2 * sm);
      this.addCoin(sA + t * (sB - sA), LANES[lA] + (LANES[lB] - LANES[lA]) * k, 0.8);
    }
  }

  /** Flight: two mirrored coin ribbons that weave across the lanes high above the maze, in big, visible, flowing waves. */
  spawnSkyCoins(dist) {
    const aheadTo = dist + 100;
    if (this.skyS < dist + 22) { this.skyS = dist + 22; }
    while (this.skyS < aheadTo) {
      this.skyPhase += 0.085;
      const x = Math.sin(this.skyPhase) * 2.5, y = 10.4 + Math.sin(this.skyPhase * 1.9) * 0.7;
      this.addCoin(this.skyS, x, y, { scale: 1.45 });
      this.addCoin(this.skyS, -x, y, { scale: 1.45 });
      this.skyS += 2.7;
    }
  }

  // ---------------------------------------------------------------- row spawner
  /**
   * Builds one row of the maze. Fairness invariant: for every lane that was passable in the previous row,
   * this row leaves that lane (or a lane next to it) open – so no unavoidable crash can ever be generated,
   * wherever the player happens to be standing.
   */
  makeRow() {
    let s = this.spawnS;
    for (const c of this.track.corners) {                  // keep corners clear: nothing within 36 m before or 16 m after
      if (c.s - 36 < s + 26 && c.s + 16 > s) { this.spawnS = c.s + 16; this.prev = { s: this.spawnS, lane: this.path, type: null }; this.prevOcc = [true, true, true]; this.busy = [-1e9, -1e9, -1e9]; return; }
    }
    const R = this.rand, diff = clamp(s / 7000, 0, 1);
    const gap = clamp(estSpeed(s) * 0.95 + 9 - diff * 2, 18, 48) + R() * 8;

    // guide lane: where the coin trail leads (always left free)
    const cands = [];
    for (const dl of [-1, 0, 1]) {
      const l = this.path + dl;
      if (l < 0 || l > 2) continue;
      if (dl !== 0 && this.busy[l] > s - 4) continue;
      cands.push(l);
    }
    const stay = cands.includes(this.path) && R() < 0.38;
    const newPath = stay ? this.path : cands[Math.floor(R() * cands.length)];
    this.path = newPath;

    const covered = [0, 1, 2].map((l) => this.busy[l] > s - 1);
    const plan = [null, null, null];
    if (R() < 0.3 + 0.4 * diff && !covered[newPath]) plan[newPath] = { type: R() < 0.55 ? 'low' : 'high' };

    let busyCount = covered.filter(Boolean).length;
    for (let l = 0; l < 3; l++) {
      if (l === newPath || covered[l]) continue;
      const w = R();
      const pWall = 0.16 + 0.22 * diff, pLow = 0.14, pHigh = 0.12, pBlock = busyCount < 2 ? 0.14 : 0, pNone = 0.3 - 0.2 * diff;
      let acc = pNone;
      if (w < acc) continue;
      acc += pWall; if (w < acc) { plan[l] = { type: 'wall' }; continue; }
      acc += pLow; if (w < acc) { plan[l] = { type: 'low' }; continue; }
      acc += pHigh; if (w < acc) { plan[l] = { type: 'high' }; continue; }
      acc += pBlock;
      if (w < acc) { plan[l] = { type: 'block', ramp: R() < 0.6, body: 8 + Math.floor(R() * 9) }; busyCount++; }
    }

    // ---- fairness repair
    const fatal = (l) => !!plan[l] && (plan[l].type === 'wall' || (plan[l].type === 'block' && !plan[l].ramp));
    for (let guard = 0; guard < 6; guard++) {
      let bad = -1;
      for (let l = 0; l < 3; l++) if (this.prevOcc[l] && fatal(l)) {
        let escape = false;
        for (const m of [l - 1, l + 1]) if (m >= 0 && m <= 2 && !fatal(m) && !covered[m]) escape = true;
        if (!escape) { bad = l; break; }
      }
      if (bad < 0) break;
      // soften: turn a gate into a low barrier (or a ramp-less slab into a ramped one) in the nearest fixable lane
      const order = [bad, bad - 1, bad + 1].filter((m) => m >= 0 && m <= 2 && plan[m] && fatal(m) && m !== newPath);
      const m = order[0];
      if (m === undefined) break;
      if (plan[m].type === 'block') plan[m].ramp = true; else plan[m] = R() < 0.5 ? { type: 'low' } : null;
    }
    this.prevOcc = [0, 1, 2].map((l) => !fatal(l));

    // ---- coins
    const pathType = plan[newPath] ? plan[newPath].type : null;
    const prev = this.prev;
    if (R() < 0.82) {
      const from = prev.s + (prev.type === 'low' ? 5.2 : prev.type === 'high' ? 3 : 2.5);
      const to = s - (pathType === 'low' ? 5.4 : pathType === 'high' ? 3.5 : 2.5);
      this.spawnTrail(from, prev.lane, to, newPath);
    }
    if (pathType === 'low') {
      for (let i = 0; i <= 4; i++) { const u = i / 4; this.addCoin(s - 3.4 + u * 7, LANES[newPath], 0.75 + Math.sin(u * Math.PI) * 2.0); }
    } else if (pathType === 'high') {
      for (let i = -1; i <= 1; i++) this.addCoin(s + i * 1.3, LANES[newPath], 0.5);
    }

    // ---- instantiate
    for (let l = 0; l < 3; l++) {
      const pl = plan[l];
      if (!pl) continue;
      if (pl.type !== 'block') { this.addSolid(pl.type, l, s); continue; }
      const sd = this.addSolid('block', l, s, { ramp: pl.ramp, body: pl.body });
      this.busy[l] = sd.s1 + 7;
      if (R() < 0.85) {
        const top = BLOCK_H + 0.6;
        for (let u = sd.ramp + 1.2; u < sd.s1 - s - 0.8; u += 2.1) this.addCoin(s + u, sd.x, top);
        if (sd.ramp) for (let u = 0.8; u < sd.ramp; u += 1.6) this.addCoin(s + u, sd.x, 0.6 + (u / sd.ramp) * BLOCK_H);
      }
    }

    // ---- power-up between rows
    this.sincePickup += gap; this.sinceJet += gap;
    const pickS = s + gap * 0.5, nearCorner = this.track.corners.some((c) => Math.abs(c.s - pickS) < 14);
    if (nearCorner) { /* keep the junction clear */ }
    else if (s > 250 && this.sinceJet > 3200 && R() < 0.4) {          // jetpacks are rare: roughly once per 3+ km
      this.addPickup('jetpack', newPath, s + gap * 0.5);
      this.sinceJet = 0; this.sincePickup = 0;
    } else if (s > 250 && this.sincePickup > 650 && R() < 0.4) {
      const bag = ['magnet', 'magnet', 'double', 'double', 'boots', 'boots', 'wings', 'shield', 'shield'];
      this.addPickup(bag[Math.floor(R() * bag.length)], newPath, s + gap * 0.5);
      this.sincePickup = 0;
    }

    this.prev = { s, lane: newPath, type: pathType };
    this.spawnS = s + gap;
  }

  stepBoulder(sd, dt, dist, speed) {
    sd.s0 -= sd.boulderSpeed * dt; sd.s1 = sd.s0 + 2.5; sd.group.position.z = -(sd.s0 - sd.leg.a);
    const ahead = sd.s0 - dist;
    if (!sd.locked && ahead > 30) sd.x += clamp(this.targetX - sd.x, -3.6 * dt, 3.6 * dt);          // homing...
    else {                                                                                            // ...until the last moment
      sd.locked = true;
      let best = 0; for (let l = 1; l < 3; l++) if (Math.abs(LANES[l] - sd.x) < Math.abs(LANES[best] - sd.x)) best = l;
      sd.lane = best; sd.x += clamp(LANES[best] - sd.x, -9 * dt, 9 * dt);
    }
    const u = sd.group.userData;
    u.rock.rotation.x += ((speed + sd.boulderSpeed) * dt) / 1.25;
    u.mark.material.opacity = ahead > 2 ? 0.5 + Math.sin(performance.now() * 0.012) * 0.35 : 0;
    u.mark.scale.y = clamp(ahead / 30, 0.05, 1); u.mark.position.z = 15 * u.mark.scale.y;
    for (const o of this.solids) {                                                                    // it flattens whatever is in its way
      if (o === sd || o.ghost || o.type === 'boulder' || o.type === 'flame' || o.isCornerWall) continue;
      if (o.s1 > sd.s0 && o.s0 < sd.s1 && Math.abs(o.x - sd.x) < 1.5) this.smash(o);
    }
  }

  // ---------------------------------------------------------------- per-frame
  buildAhead(dist) {
    const lim = dist + VIEW_AHEAD, T = this.track;
    T.ensure(lim + 320);
    for (let guard = 0; guard < 60 && this.cursor.s < lim; guard++) {
      const leg = T.legs.find((l) => l.k === this.cursor.k);
      if (!leg) break;
      if (this.cursor.s + SEG_LEN <= leg.b - CORNER_HALF + 1e-6) { this.segments.push(this.buildSegment(leg, this.cursor.s)); this.cursor.s += SEG_LEN; }
      else {
        this.buildCorner(leg, leg.corner);
        T.ensure(leg.b + 320);
        const next = T.legs.find((l) => l.k === leg.k + 1);
        this.cursor = { k: next.k, s: next.segStart };
      }
    }
  }

  update(dt, dist, speed, time) {
    this.dist = dist;
    if (this.deco.bulbMat) this.deco.bulbMat.color.setScalar(Math.sin(time * 23) * Math.sin(time * 7.3) > 0.25 ? 1 : 0.32 + 0.2 * Math.sin(time * 40));
    this.speedHint = speed;
    const T = this.track;
    T.step(dt);
    this.buildAhead(dist);
    while (this.spawnS < dist + VIEW_AHEAD - 20) this.makeRow();
    if (this.flying) this.spawnSkyCoins(dist);
    T.applyPose(this.root, dist);                         // the player stays at the origin facing -z; the world moves round them

    for (let i = this.segments.length - 1; i >= 0; i--) {
      const g = this.segments[i];
      if (g.userData.s1 < dist - KEEP_BEHIND) { g.removeFromParent(); this.segments.splice(i, 1); }
    }
    T.prune(dist, KEEP_BEHIND + 40);
    this.torches = this.torches.filter((t) => t.s > dist - KEEP_BEHIND - 5);

    // solids
    for (let i = this.solids.length - 1; i >= 0; i--) {
      const sd = this.solids[i];
      if (sd.type === 'boulder' && !sd.ghost) this.stepBoulder(sd, dt, dist, speed);
      else if (sd.type === 'flame' && sd.armed && !sd.smashT) this.stepFlame(sd, dt);
      if (sd.s1 < dist - 14) { sd.group.removeFromParent(); this.solids.splice(i, 1); continue; }
      if (sd.type === 'boulder') sd.group.position.x = sd.x;
      if (sd.smashT) {          // ghosted-by-shield obstacles shrink away
        sd.smashT += dt * 3;
        const k = Math.max(0, 1 - sd.smashT);
        sd.group.scale.set(1 + sd.smashT * 0.4, k, 1 + sd.smashT * 0.4);
        if (k <= 0) { sd.group.visible = false; }
      } else if (sd.ghost && sd.type !== 'flame') sd.group.visible = false;
    }

    // coins -> instanced matrices (composed with their leg's transform)
    const d = this.dummy, im = this.coinMesh;
    let n = 0;
    for (let i = this.coins.length - 1; i >= 0; i--) { if (this.coins[i].s < dist - 12) this.coins.splice(i, 1); }
    for (const c of this.coins) {
      if (n >= COIN_CAP) break;
      if (c.s - dist > VIEW_AHEAD) continue;
      d.position.set(c.x, c.y + Math.sin(time * 3 + c.spin) * 0.06, -(c.s - c.leg.a));
      d.rotation.set(0, time * 3.2 + c.spin, 0);
      d.scale.setScalar(c.scale || 1);
      d.updateMatrix(); d.matrix.premultiply(c.leg.group.matrix);
      im.setMatrixAt(n, d.matrix); this.coinRim.setMatrixAt(n, d.matrix); n++;
    }
    im.count = this.coinRim.count = n; im.instanceMatrix.needsUpdate = this.coinRim.instanceMatrix.needsUpdate = true;

    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.s < dist - 12) { p.group.removeFromParent(); this.pickups.splice(i, 1); continue; }
      p.t += dt;
      p.group.position.y = p.y + Math.sin(p.t * 3) * 0.14;
      p.group.userData.ring.rotation.z += dt * 2.4;
      p.group.userData.halo.material.opacity = 0.7 + Math.sin(p.t * 5) * 0.2;
    }

    // torch flicker + the few real lights that hop between the nearest torches
    const near = [], v = this.tmpV;
    for (const t of this.torches) {
      if (t.lantern) { t.obj.userData.glow.material.opacity = 0.75 + Math.sin(time * 4 + t.obj.userData.phase) * 0.12; }
      else {
        const u = t.obj.userData, f = 1 + Math.sin(time * 14 + u.phase) * 0.12 + Math.sin(time * 23 + u.phase * 2) * 0.08;
        u.flame.scale.set(f, 0.9 + (f - 1) * 3, f); u.glow.material.opacity = 0.8 + (f - 1) * 1.6;
      }
      if (t.noLight || Math.abs(t.s - dist) > 60) continue;
      v.set(t.lx, t.ly, t.lz).applyMatrix4(t.leg.group.matrix).applyMatrix4(this.root.matrix);
      t.wd = v.lengthSq(); t.wx = v.x; t.wy = v.y; t.wz = v.z;
      if (t.wd < 55 * 55) near.push(t);
    }
    near.sort((a, b) => a.wd - b.wd);
    this.torchLights.forEach((l, i) => {
      const t = near[i];
      if (!t) { l.intensity = 0; return; }
      l.color.set(t.color);
      l.position.set(t.wx, t.wy, t.wz);
      l.intensity = (t.lantern ? 4 : 6) * (0.92 + Math.sin(time * 13 + i * 2.1) * 0.08);
    });
  }
}
