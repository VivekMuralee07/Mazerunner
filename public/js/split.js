// The opponent's half of the split screen: a second scene running the same seeded maze, following wherever the
// other phone says its runner is. Purely visual: all gameplay (collisions, scoring) stays on each player's own phone.
import * as THREE from 'three';
import { BIOMES } from './config.js';
import { World } from './world.js';
import { Ghost } from './ghost.js';
import { buildSky, makeLights, makeHills } from './fx.js';
import { buildFx, applyFxQuality, disposeFx } from './post.js';

export class OpponentView {
  constructor(game, seed, name, skinId) {
    this.game = game;
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BIOMES[0].fog, BIOMES[0].fogDensity); scene.background = new THREE.Color(BIOMES[0].fog);
    scene.environment = game.scene.environment; scene.environmentIntensity = game.scene.environmentIntensity;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 520);
    const L = makeLights(scene); this.hemi = L.hemi; this.sun = L.sun; this.fill = L.fill;
    this.sky = buildSky(BIOMES[0].skyTop, BIOMES[0].skyBottom); scene.add(this.sky);
    this.hills = makeHills(scene);
    this.stage = { scene, sky: this.sky, hemi: this.hemi, sun: this.sun, hills: this.hills };
    this.world = new World(scene, game.biomeMats, game.S, game.tex); this.world.reset(seed, 0);
    this.runner = new Ghost(name, skinId, game.S, { opaque: true }); scene.add(this.runner.holder);
    this.fx = buildFx(game.renderer, scene, this.camera);
    this.dist = 0; this.speed = 15; this.realm = 0; this.time = 0;
    this.camera.position.set(0, 3.6, 6.2); this.lookAt = new THREE.Vector3(0, 1.5, -10);
    this.world.update(0.016, 0, 15, 0);                       // build the start area so the view isn't empty before the first message
    this.applyQuality(game.cfg);
  }

  applyQuality(cfg) {
    const sz = Math.min(cfg.shadow, 1024);
    if (this.sun.shadow.mapSize.x !== sz) { this.sun.shadow.mapSize.set(sz, sz); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    applyFxQuality(this.fx, { ...cfg, rays: false });
  }

  resize(w, h, pr, fov) {
    this.camera.aspect = w / h; this.camera.fov = fov; this.camera.updateProjectionMatrix();
    this.fx.composer.setPixelRatio(pr); this.fx.composer.setSize(w, h); this.fx.grade.uniforms.res.value.set(w * pr, h * pr);
  }

  receive(m) { this.runner.receive(m); }

  update(dt, time) {
    const R = this.runner, w = this.world, g = this.game;
    this.time = time;
    if (R.smooth(dt)) {
      this.dist = Math.max(0, R.s); this.speed = R.target.sp;
      w.targetX = R.x;
      const c = w.track.nextCorner(this.dist);                              // they either turned here or crashed here: show the turn either way
      if (c && !c.executed && this.dist >= c.s - 1.5) w.track.execute(c);
      w.update(dt, this.dist, this.speed, time);
      const cy = R.y + 0.95;                                                // coins and pick-ups they have taken disappear (visual only)
      for (let i = w.coins.length - 1; i >= 0; i--) { const k = w.coins[i]; if (Math.abs(k.s - this.dist) < 0.9 && Math.abs(k.x - R.x) < 1.3 && Math.abs(k.y - cy) < 1.5) w.coins.splice(i, 1); }
      for (let i = w.pickups.length - 1; i >= 0; i--) { const q = w.pickups[i]; if (Math.abs(q.s - this.dist) < 1.2 && Math.abs(q.x - R.x) < 1.4) { q.group.removeFromParent(); w.pickups.splice(i, 1); } }
    } else w.update(dt, 0, 15, time);
    R.holder.position.set(R.x, R.y, 0); R.animate(dt);
    // follow camera (same framing as the player's own)
    const fly = R.target.flying && R.target.alive, y = R.y, cam = this.camera;
    const pos = new THREE.Vector3(R.x * 0.55, 3.55 + y * (fly ? 0.55 : 0.4), 6.0 + (fly ? y * 0.1 : 0));
    const look = new THREE.Vector3(R.x * 0.3, 1.45 + y * (fly ? 0.22 : 0.35), -10);
    const k = Math.min(1, dt * 9);
    cam.position.lerp(pos, k); this.lookAt.lerp(look, k); cam.lookAt(this.lookAt);
    // atmosphere for wherever they are
    this.realm += ((R.target.car && R.target.alive ? 1 : 0) - this.realm) * Math.min(1, dt * 1.1);
    g.applyAtmosphere(this.stage, g.atmosphereAt(this.dist, this.realm), time);
    this.sky.position.copy(cam.position); for (const h of this.hills) { h.position.x = cam.position.x; h.position.z = cam.position.z; }
    this.fx.grade.uniforms.time.value = time % 100;
  }

  render(dt) { this.fx.composer.render(dt); }

  dispose() {
    this.world.clearAll(); this.world.root.removeFromParent(); this.runner.dispose();
    disposeFx(this.fx); this.scene.clear();
  }
}
