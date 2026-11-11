// Endless procedural labyrinth corridor, obstacle patterns, coins and pick-ups.
// Track coordinate `s` grows forward; world z of anything = -(s - dist). The player stays at z = 0.
import * as THREE from 'three';
import { LANES, SEG_LEN, VIEW_AHEAD, KEEP_BEHIND, BIOME_LEN, BIOMES, CORRIDOR_HALF, PLAYER, POWERUPS } from './config.js';
import * as M from './models.js';

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const biomeIndexAt = (s) => Math.floor(Math.max(0, s) / BIOME_LEN);
export const biomeAt = (s) => BIOMES[biomeIndexAt(s) % BIOMES.length];

const BLOCK_H = 1.45, RAMP_LEN = 5.5, WALL_H = 4.4;
const COIN_CAP = 420;

export class World {
  constructor(scene, biomeMats, S, textures) {
    this.scene = scene; this.BM = biomeMats; this.S = S; this.tex = textures;
    this.root = new THREE.Group(); scene.add(this.root);
    this.segRoot = new THREE.Group(); this.root.add(this.segRoot);
    this.obstacleRoot = new THREE.Group(); this.root.add(this.obstacleRoot);
    this.pickupRoot = new THREE.Group(); this.root.add(this.pickupRoot);

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
    this.shaftMat = new THREE.MeshBasicMaterial({ map: textures.shaft, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: 0xfff0c8 });
    this.aoFloorGeo = new THREE.PlaneGeometry(1.5, 1); this.aoFloorGeo.rotateX(-Math.PI / 2);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    this.deco = {};

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
    this.nextSeg = Math.floor((dist - KEEP_BEHIND) / SEG_LEN);
    this.solids = []; this.coins = []; this.pickups = [];
    this.spawnS = dist + 70;           // first obstacle row: generous run-up
    this.path = 1; this.busy = [-1e9, -1e9, -1e9]; this.prevOcc = [true, true, true];
    this.prev = { s: dist + 10, lane: 1, type: null };
    this.sincePickup = 0; this.skyS = 0; this.skyLane = null; this.skyRun = 0; this.skyPrevX = null;
    this.speedHint = 15; this.flying = false; this.sinceJet = 1500; this.targetX = 0; this.skyPhase = 0;
    this.biomeIdx = -1;
  }

  clearAll() {
    for (const c of [this.segRoot, this.obstacleRoot, this.pickupRoot]) while (c.children.length) c.remove(c.children[0]);
    if (this.coinMesh) this.coinMesh.count = this.coinRim.count = 0;
  }

  // ---------------------------------------------------------------- segments
  buildSegment(idx) {
    const s0 = idx * SEG_LEN, biome = biomeAt(s0 + SEG_LEN / 2), m = this.BM[biome.id];
    const rand = mulberry(idx * 7919 + 13);
    const g = new THREE.Group(); g.userData = { s0, biome: biome.id };
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
      this.torches.push({ s: s0 + z, x: side * (CORRIDOR_HALF - 0.8), obj: t, color: biome.torch });
    }

    // overhead arch + hanging things
    if (rand() < 0.4) this.buildArch(g, biome, m, rand, wallH);

    // banners / hanging flora on walls
    if (biome.id === 'stone' && rand() < 0.6) { const b = M.buildBanner([0x7a1020, 0x1c3a7a, 0x5a2a7a][Math.floor(rand() * 3)]); b.position.set(-(CORRIDOR_HALF - 0.08), 6.2, -(2 + rand() * 20)); b.rotation.y = Math.PI / 2; add(b); }

    // ground-level decor along the edges
    for (const side of [-1, 1]) {
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const z = rand() * SEG_LEN, x = side * (CORRIDOR_HALF - 0.45 - rand() * 0.2);
        if (openings[side] != null && z > openings[side] - 1 && z < openings[side] + 5.4) continue;
        let d = null;
        if (biome.id === 'hedge') { d = M.buildBush(this.leafMat, 0.5 + rand() * 0.45); }
        else if (biome.id === 'stone') { d = new THREE.Group(); for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(M.boxGeo(0.3 + rand() * 0.4, 0.25 + rand() * 0.35, 0.3 + rand() * 0.4), this.rubbleMat); r.position.set((rand() - 0.5) * 0.7, 0.15, (rand() - 0.5) * 0.9); r.rotation.set(rand(), rand() * 3, rand()); r.castShadow = true; d.add(r); } }
        else if (biome.id === 'crystal') { d = M.buildCrystalCluster(rand() > 0.5 ? 0x4cd9ff : 0xb36bff, 0.7 + rand() * 0.5); }
        else { d = new THREE.Group(); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1 + rand(), 5), this.rubbleMat); sp.position.y = 0.55; sp.castShadow = true; d.add(sp); const e = new THREE.Sprite(S.glowSprite(0xff5a1f, 0.7)); e.scale.set(2.2, 2.2, 1); e.position.y = 0.3; d.add(e); }
        d.position.set(x, 0, -z); d.rotation.y = rand() * 6; add(d);
      }
    }
    this.addWallDecor(g, biome, rand, openings);
    if (rand() < 0.45) {                                   // sun shafts slanting into the corridor
      for (let k = 0; k < 2; k++) {
        const sh = new THREE.Mesh(this.shaftGeo || (this.shaftGeo = new THREE.PlaneGeometry(3.2, 11)), this.shaftMat);
        sh.position.set(-1.6 + k * 1.2, 4.4, -(3 + rand() * 18)); sh.rotation.set(0, (rand() - 0.5) * 0.4, 0.55); add(sh);
      }
    }
    g.position.z = -(s0 - this.dist);
    this.segRoot.add(g);
    return g;
  }

  /** Instanced silhouette decor so the walls aren't flat boxes: bumpy hedges, battlements, crystal spires, rock fins. */
  addWallDecor(g, biome, rand, openings) {
    const D = this.deco, items = [], wallH = 7.2;
    const ok = (side, z) => openings[side] == null || z < openings[side] - 0.8 || z > openings[side] + 5.2;
    let geo, mat, colors = null;
    if (biome.id === 'hedge') {
      geo = D.hedgeGeo || (D.hedgeGeo = new THREE.IcosahedronGeometry(0.55, 1)); mat = D.hedgeMat || (D.hedgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }));
      colors = [0x2f9a3c, 0x3cb04d, 0x4cc85e, 0x63da70, 0x27843a];
      for (const side of [-1, 1]) {
        for (let i = 0; i < 26; i++) { const z = rand() * 24; if (ok(side, z)) items.push({ x: side * (CORRIDOR_HALF - 0.06), y: 0.5 + rand() * 6.3, z: -z, sx: 0.5, sy: 0.7 + rand() * 0.7, sz: 0.8 + rand() * 0.8, side }); }
        for (let i = 0; i < 10; i++) { const z = (i + rand() * 0.6) * 2.4; if (ok(side, z)) items.push({ x: side * (CORRIDOR_HALF + 0.8), y: wallH + 0.35, z: -z, sx: 1.5, sy: 1.1 + rand() * 0.5, sz: 1.7, side }); }
      }
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
      if (colors) { c.setHex(colors[Math.floor(rand() * colors.length)]); im.setColorAt(i, c); }
    });
    im.castShadow = true; im.receiveShadow = true; g.add(im);
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
    this.torches.push({ s: g.userData.s0 + oz + gapW / 2, x: side * (xIn + 1), obj: t, color: biome.torch, noLight: true });
    if (rand() < 0.7) {
      const st = biome.id === 'crystal' ? M.buildCrystalCluster(0xb36bff, 1.3) : M.buildStatue(m.trim);
      st.position.set(side * (xIn + depth - 2), 0, zc); st.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(st);
    }
  }

  buildArch(g, biome, m, rand, wallH) {
    const S = this.S, z = -(4 + rand() * 16), y = wallH - 0.9;
    const beam = new THREE.Mesh(M.boxGeo(CORRIDOR_HALF * 2 + 1.2, 0.9, 1.0), m.trim); beam.position.set(0, y, z); beam.castShadow = true; g.add(beam);
    for (const sx of [-1, 1]) {
      const br = new THREE.Mesh(M.boxGeo(1.7, 0.55, 0.9), m.trim); br.position.set(sx * 3.2, y - 0.9, z); br.rotation.z = sx * Math.PI / 4; g.add(br);
    }
    const lan = M.buildLantern(S, biome.torch); lan.position.set(0, y - 0.5, z); g.add(lan);
    this.torches.push({ s: g.userData.s0 - z, x: 0, y: y - 0.7, obj: lan, color: biome.torch, lantern: true });
    if (biome.id === 'hedge') {
      for (let i = 0; i < 7; i++) { const l = 0.8 + rand() * 2.2; const v = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.025, l, 5), this.leafMat); v.position.set((rand() - 0.5) * 8, y - 0.45 - l / 2, z + (rand() - 0.5) * 0.6); g.add(v); }
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
    group.position.set(solid.x, 0, -(s0 - this.dist));
    this.obstacleRoot.add(group);
    this.solids.push(solid);
    return solid;
  }

  profile(sd, u) {                      // height of a standable solid at distance u along it
    if (sd.type !== 'block') return sd.H;
    return sd.ramp > 0 && u < sd.ramp ? sd.H * (u / sd.ramp) : sd.H;
  }

  /** Ground height and collisions for a body at (x, y) of height ph, standing at track position `dist`. */
  probe(dist, px, py, ph, enteredLane = -1, ownLane = -1) {
    let ground = 0; const hits = [];
    const PD = PLAYER.halfDepth, PW = PLAYER.halfWidth;
    for (const sd of this.solids) {
      if (sd.ghost || sd.ignore || sd.s1 + PD < dist || sd.s0 - PD > dist) continue;
      const dx = Math.abs(px - sd.x);
      if (dx >= sd.hw + PW) continue;
      if (sd.type === 'boulder') { if (py < sd.H - 0.2) hits.push({ sd, kind: 'front' }); continue; }
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
    group.position.set(sd.x, 0, -(s0 - this.dist));
    this.obstacleRoot.add(group); this.solids.push(sd);
    return sd;
  }
  hasBoulder() { return this.solids.some((sd) => sd.type === 'boulder' && !sd.ghost && sd.s1 > this.dist - 6); }

  /** Removes (ghosts) every obstacle in a range – used when reviving. */
  clearRange(a, b) {
    for (const sd of this.solids) if (sd.s1 > a && sd.s0 < b) sd.ghost = true;
  }

  smash(sd) { sd.ghost = true; sd.smashT = 0.0001; }

  // ---------------------------------------------------------------- coins & pick-ups
  addCoin(s, x, y, extra) {
    if (this.coins.length >= COIN_CAP - 2) return;
    this.coins.push({ s, x, y, spin: Math.random() * 6, ...extra });
  }

  addPickup(type, lane, s, y = 1.1) {
    const def = POWERUPS[type];
    const g = M.buildPowerup(type, def.color, this.S);
    g.position.set(LANES[lane], y, -(s - this.dist));
    this.pickupRoot.add(g);
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
      const x = Math.sin(this.skyPhase) * 2.5, y = 8.7 + Math.sin(this.skyPhase * 1.9) * 0.6;
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
    const s = this.spawnS, R = this.rand, diff = clamp(s / 7000, 0, 1);
    const gap = clamp(this.speedHint * 0.95 + 9 - diff * 2, 18, 48) + R() * 8;

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
    if (!this.flying && s > 250 && this.sinceJet > 3200 && R() < 0.4) {          // jetpacks are rare: roughly once per 3+ km
      this.addPickup('jetpack', newPath, s + gap * 0.5);
      this.sinceJet = 0; this.sincePickup = 0;
    } else if (!this.flying && s > 250 && this.sincePickup > 650 && R() < 0.4) {
      const bag = ['magnet', 'magnet', 'double', 'double', 'boots', 'boots', 'wings', 'shield', 'shield'];
      this.addPickup(bag[Math.floor(R() * bag.length)], newPath, s + gap * 0.5);
      this.sincePickup = 0;
    }

    this.prev = { s, lane: newPath, type: pathType };
    this.spawnS = s + gap;
  }

  stepBoulder(sd, dt, dist, speed) {
    sd.s0 -= sd.boulderSpeed * dt; sd.s1 = sd.s0 + 2.5;
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
      if (o === sd || o.ghost || o.type === 'boulder') continue;
      if (o.s1 > sd.s0 && o.s0 < sd.s1 && Math.abs(o.x - sd.x) < 1.5) this.smash(o);
    }
  }

  // ---------------------------------------------------------------- per-frame
  update(dt, dist, speed, time) {
    this.dist = dist;
    this.speedHint = speed;
    // segments
    while (this.nextSeg * SEG_LEN < dist + VIEW_AHEAD) this.segments.push(this.buildSegment(this.nextSeg++));
    while (this.spawnS < dist + VIEW_AHEAD - 20) this.makeRow();
    if (this.flying) this.spawnSkyCoins(dist);

    for (let i = 0; i < this.segments.length; i++) {
      const g = this.segments[i];
      g.position.z = -(g.userData.s0 - dist);
    }
    while (this.segments.length && this.segments[0].userData.s0 + SEG_LEN < dist - KEEP_BEHIND) {
      const g = this.segments.shift(); this.segRoot.remove(g);
    }
    this.torches = this.torches.filter((t) => t.s > dist - KEEP_BEHIND - 5);

    // solids
    for (let i = this.solids.length - 1; i >= 0; i--) {
      const sd = this.solids[i];
      if (sd.type === 'boulder' && !sd.ghost) this.stepBoulder(sd, dt, dist, speed);
      const z = -(sd.s0 - dist);
      if (sd.s1 < dist - 14) { this.obstacleRoot.remove(sd.group); this.solids.splice(i, 1); continue; }
      sd.group.position.z = z;
      if (sd.type === 'boulder') sd.group.position.x = sd.x;
      if (sd.smashT) {          // ghosted-by-shield obstacles shrink away
        sd.smashT += dt * 3;
        const k = Math.max(0, 1 - sd.smashT);
        sd.group.scale.set(1 + sd.smashT * 0.4, k, 1 + sd.smashT * 0.4);
        if (k <= 0) { sd.group.visible = false; }
      } else if (sd.ghost) sd.group.visible = false;
    }

    // coins -> instanced matrices
    const d = this.dummy, im = this.coinMesh;
    let n = 0;
    for (let i = this.coins.length - 1; i >= 0; i--) { if (this.coins[i].s < dist - 12) this.coins.splice(i, 1); }
    for (const c of this.coins) {
      if (n >= COIN_CAP) break;
      const z = -(c.s - dist);
      if (z < -VIEW_AHEAD) continue;
      d.position.set(c.x, c.y + Math.sin(time * 3 + c.spin) * 0.06, z);
      d.rotation.set(0, time * 3.2 + c.spin, 0);
      d.scale.setScalar(c.scale || 1);
      d.updateMatrix(); im.setMatrixAt(n, d.matrix); this.coinRim.setMatrixAt(n, d.matrix); n++;
    }
    im.count = this.coinRim.count = n; im.instanceMatrix.needsUpdate = this.coinRim.instanceMatrix.needsUpdate = true;

    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.s < dist - 12) { this.pickupRoot.remove(p.group); this.pickups.splice(i, 1); continue; }
      p.t += dt;
      p.group.position.set(p.x, p.y + Math.sin(p.t * 3) * 0.14, -(p.s - dist));
      p.group.userData.ring.rotation.z += dt * 2.4;
      p.group.userData.halo.material.opacity = 0.7 + Math.sin(p.t * 5) * 0.2;
    }

    // torch flicker + lights
    const near = [];
    for (const t of this.torches) {
      const z = -(t.s - dist);
      if (t.lantern) { t.obj.userData.glow.material.opacity = 0.75 + Math.sin(time * 4 + t.obj.userData.phase) * 0.12; }
      else {
        const u = t.obj.userData, f = 1 + Math.sin(time * 14 + u.phase) * 0.12 + Math.sin(time * 23 + u.phase * 2) * 0.08;
        u.flame.scale.set(f, 0.9 + (f - 1) * 3, f); u.glow.material.opacity = 0.8 + (f - 1) * 1.6;
      }
      if (!t.noLight && z < 6 && z > -48) near.push(t);
    }
    near.sort((a, b) => Math.abs(a.s - dist - 8) - Math.abs(b.s - dist - 8));
    this.torchLights.forEach((l, i) => {
      const t = near[i];
      if (!t) { l.intensity = 0; return; }
      l.color.set(t.color);
      l.position.set(t.x, t.y !== undefined ? t.y : 3.4, -(t.s - dist));
      l.intensity = (t.lantern ? 4 : 6) * (0.92 + Math.sin(time * 13 + i * 2.1) * 0.08);
    });
  }
}
