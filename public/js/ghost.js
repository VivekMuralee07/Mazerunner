// The other player, drawn as a runner (or car) that follows their reported position along the shared track.
// `opaque` = a full-colour runner for the opponent's split-screen view; otherwise a see-through ghost.
import * as THREE from 'three';
import { SKINS } from './config.js';
import * as M from './models.js';

function nameSprite(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '800 30px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7; x.strokeStyle = 'rgba(10,40,60,0.9)'; x.strokeText(name, 128, 34); x.fillStyle = '#fff'; x.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(2.6, 0.65, 1); s.renderOrder = 20; return s;
}

export class Ghost {
  constructor(name, skinId, S, opts = {}) {
    this.name = name; this.opaque = !!opts.opaque;
    this.skin = SKINS.find((k) => k.id === skinId) || SKINS[1];
    this.holder = new THREE.Group();
    this.model = M.buildRunner(this.skin); this.rig = this.model.userData.rig;
    if (!this.opaque) {
      this.model.traverse((o) => { if (o.isMesh && o.material) { const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) { m.transparent = true; m.opacity = 0.62; m.depthWrite = false; } } });
      for (const m of this.rig.mats) { m.transparent = true; m.opacity = 0.62; m.depthWrite = false; }
    }
    this.holder.add(this.model);
    this.car = M.buildCar(this.skin.accent); this.car.visible = false; this.holder.add(this.car);
    this.label = nameSprite(name); this.label.position.y = 2.7; this.label.visible = !this.opaque; this.holder.add(this.label);
    if (!this.opaque) {
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 28), new THREE.MeshBasicMaterial({ color: this.skin.accent, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.04; this.holder.add(this.ring);
    }
    this.s = null; this.x = 0; this.y = 0; this.phase = 0; this.t = 0; this.leg = null; this.visible = false; this.rel = 0;
    this.target = { s: 0, x: 0, y: 0, sp: 15, rolling: 0, flying: 0, car: 0, alive: 1, at: 0 };
  }

  receive(m) {
    const t = this.target;
    t.s = m.s; t.x = m.x; t.y = m.y || 0; t.sp = m.sp || 15; t.rolling = m.r | 0; t.flying = m.f | 0; t.car = m.c | 0; t.alive = m.a ? 1 : 0; t.at = performance.now();
    if (this.s === null) { this.s = m.s; this.x = m.x; this.y = t.y; }
  }

  /** Glide toward the latest report (extrapolating a little while it is alive). */
  smooth(dt) {
    if (this.s === null) return false;
    this.visible = true;
    const t = this.target, age = Math.min(0.5, (performance.now() - t.at) / 1000);
    const sEst = t.alive ? t.s + t.sp * age : t.s, k = Math.min(1, dt * 9);
    this.s += (sEst - this.s) * k; this.x += (t.x - this.x) * k; this.y += (t.y - this.y) * k;
    return true;
  }

  /** Run cycle / flight / roll / car / crashed poses. */
  animate(dt) {
    const t = this.target; this.t += dt; this.phase += dt * (7.5 + t.sp * 0.3);
    const r = this.rig, sw = Math.sin(this.phase);
    this.model.visible = !t.car; this.car.visible = !!t.car; this.model.rotation.set(0, 0, 0); r.body.rotation.set(0, 0, 0);
    if (t.car) { this.car.userData.wheels.forEach((w) => { w.rotation.x -= dt * t.sp * 1.2; }); }
    else if (!t.alive) { this.model.rotation.x = 1.4; this.model.position.y = -0.3; r.hips.rotation.set(0.2, 0, 0); r.armL.rotation.x = r.armR.rotation.x = -2; this.label.material.opacity = 0.6; }
    else if (t.flying) { this.model.position.y = 0; r.hips.rotation.x = 1.25; r.legL.rotation.x = -0.15; r.legR.rotation.x = -0.15; r.armL.rotation.set(-2.9, 0, -0.35); r.armR.rotation.set(-2.9, 0, 0.35); }
    else if (t.rolling) { this.model.position.y = 0; r.body.rotation.x = -this.t * 14; r.hips.rotation.x = 0.9; r.legL.rotation.x = r.legR.rotation.x = -1.7; r.armL.rotation.x = r.armR.rotation.x = -1.6; }
    else if (t.y > 0.25) { this.model.position.y = 0; r.hips.rotation.x = 0.1; r.legL.rotation.x = -1.1; r.legR.rotation.x = 0.6; r.armL.rotation.set(-2.5, 0, -0.5); r.armR.rotation.set(-2.5, 0, 0.5); }
    else { this.model.position.y = 0; r.hips.rotation.set(0.16, 0, 0); r.legL.rotation.x = sw; r.legR.rotation.x = -sw; r.armL.rotation.set(-sw * 0.9, 0, -0.12); r.armR.rotation.set(sw * 0.9, 0, 0.12); }
    if (this.rig.scarf) this.rig.scarf.update(this.t, t.sp, 0, true);
    if (this.rig.cape) this.rig.cape.update(this.t, t.sp, 0, true);
  }

  /** Place the ghost in its leg's frame. `track` is the world's Track; `dist` is the local player's position. */
  update(dt, track, dist) {
    if (!this.smooth(dt)) return;
    this.rel = this.s - dist;
    const show = this.rel > -40 && this.rel < 260;
    if (!show) { if (this.holder.parent) this.holder.removeFromParent(); this.visible = false; return; }
    const leg = track.legAt(this.s);
    if (this.leg !== leg || !this.holder.parent) { this.holder.removeFromParent(); leg.group.add(this.holder); this.leg = leg; }
    this.holder.position.set(this.x, this.y, -(this.s - leg.a));
    this.visible = true; this.animate(dt);
  }

  dispose() { this.holder.removeFromParent(); }
}
