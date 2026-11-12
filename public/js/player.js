import * as THREE from 'three';
import { LANES, PLAYER, SPEED } from './config.js';
import * as M from './models.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class Player {
  constructor(scene, skin, S) {
    this.scene = scene; this.S = S;
    this.holder = new THREE.Group(); scene.add(this.holder);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; scene.add(this.shadow);
    this.wings = M.buildWings(0x7fe0ff); this.wings.visible = false; this.wings.position.set(0, 1.35, 0.22); this.holder.add(this.wings);
    this.jet = M.buildJetpack(); this.jet.visible = false; this.jet.position.set(0, 1.25, 0.3); this.holder.add(this.jet);
    this.bubble = M.buildShieldBubble(0xb388ff); this.bubble.visible = false; this.bubble.position.y = 0.95; this.holder.add(this.bubble);
    this.magRing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 32), new THREE.MeshBasicMaterial({ color: 0xff5470, transparent: true, opacity: 0.9, depthWrite: false }));
    this.magRing.rotation.x = Math.PI / 2; this.magRing.visible = false; this.holder.add(this.magRing);
    this.bootGlow = new THREE.Sprite(S.glowSprite(0x37e08a, 0.9)); this.bootGlow.scale.set(1.8, 1.8, 1); this.bootGlow.visible = false; this.holder.add(this.bootGlow);
    this.setSkin(skin);
    this.reset();
  }

  setSkin(skin) {
    if (this.model) { this.holder.remove(this.model); }
    this.skin = skin;
    this.model = M.buildRunner(skin);
    this.rig = this.model.userData.rig;
    this.model.rotation.y = 0;
    this.holder.add(this.model);
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  }

  reset() {
    this.lane = 1; this.target = 1; this.prevLane = 1;
    this.x = LANES[1]; this.y = 0; this.vy = 0; this.grounded = true;
    this.rollT = 0; this.rollOnLand = false; this.stumbleT = 0; this.invuln = 0;
    this.flying = false; this.flyY = 7.5; this.dead = false; this.deadT = 0; this.caught = false;
    this.boots = false; this.buf = { jump: 0, roll: 0 };
    this.phase = 0; this.landSquash = 0; this.laneLean = 0; this.idle = false; this.time = 0;
    this.stepAcc = 0; this.onSlab = false; this.laneAge = 9;
    this.holder.position.set(this.x, 0, 0); this.model.rotation.set(0, 0, 0);
    this.rig.body.rotation.set(0, 0, 0); this.holder.rotation.set(0, 0, 0);
    this.flash = 0;
  }

  get height() { return this.rollT > 0 ? PLAYER.rollHeight : PLAYER.height; }

  moveLane(dir) {
    if (this.dead || this.caught) return false;
    const t = clamp(this.target + dir, 0, 2);
    if (t === this.target) return false;
    this.prevLane = this.target; this.target = t; this.lane = t; this.laneAge = 0;
    return true;
  }
  jump() { this.buf.jump = 0.16; }
  roll() { this.buf.roll = 0.16; }

  jumpVelocity() { const h = PLAYER.jumpHeight * (this.boots ? 1.85 : 1); return Math.sqrt(2 * PLAYER.gravity * h); }

  /** Advances physics; returns {events:[], hits:[]} */
  update(dt, dist, speed, world) {
    const ev = [];
    this.time += dt; this.laneAge += dt;
    const entered = this.laneAge < 0.22 && this.prevLane !== this.target ? this.target : -1;
    if (this.dead) { this.animateDead(dt); return { events: ev, hits: [] }; }
    this.invuln = Math.max(0, this.invuln - dt);
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    this.flash = Math.max(0, this.flash - dt);

    // lane movement (constant-speed slide with soft landing)
    const tx = LANES[this.target], dx = tx - this.x;
    const step = PLAYER.laneSpeed * dt * (0.45 + Math.min(1, Math.abs(dx) / 1.4) * 0.8);
    this.x += clamp(dx, -step, step);
    this.laneLean = lerp(this.laneLean, clamp(dx / 2.4, -1, 1), clamp(dt * 12, 0, 1));

    // buffered actions
    if (this.buf.jump > 0) {
      this.buf.jump -= dt;
      if (this.flying) this.buf.jump = 0;
      else if (this.grounded) {
        this.vy = this.jumpVelocity(); this.grounded = false; this.rollT = 0; this.rollOnLand = false; this.buf.jump = 0;
        ev.push({ type: 'jump' });
      }
    }
    if (this.buf.roll > 0) {
      this.buf.roll -= dt;
      if (this.flying) this.buf.roll = 0;
      else if (this.grounded) { if (this.rollT <= 0) ev.push({ type: 'roll' }); this.rollT = PLAYER.rollTime; this.buf.roll = 0; }
      else { if (!this.rollOnLand) ev.push({ type: 'dive' }); this.vy = -PLAYER.fastFall; this.rollOnLand = true; this.buf.roll = 0; }
    }
    if (this.rollT > 0) this.rollT = Math.max(0, this.rollT - dt);

    // vertical
    let probe;
    if (this.flying) {
      this.y += (this.flyY - this.y) * Math.min(1, dt * 3.2); this.vy = 0; this.grounded = false;
      probe = world.probe(dist, this.x, this.y, this.height, entered, this.target);
    } else {
      this.vy -= PLAYER.gravity * dt; this.y += this.vy * dt;
      probe = world.probe(dist, this.x, this.y, this.height, entered, this.target);
      if (this.y <= probe.ground + 0.001) {
        if (!this.grounded && this.vy < -5) { ev.push({ type: 'land', hard: this.vy < -20 }); this.landSquash = 0.18; }
        this.y = probe.ground; this.vy = 0; this.grounded = true;
        if (this.rollOnLand) { this.rollT = PLAYER.rollTime; this.rollOnLand = false; ev.push({ type: 'roll' }); }
      } else if (this.y > probe.ground + 0.06) this.grounded = false;
    }
    this.landSquash = Math.max(0, this.landSquash - dt);
    this.groundH = probe.ground;
    const onTop = !this.flying && probe.ground > 1.0 && this.y <= probe.ground + 0.05;
    if (onTop && !this.onSlab) ev.push({ type: 'climb' });
    this.onSlab = onTop;
    this.animate(dt, speed);
    return { events: ev, hits: this.flying ? [] : probe.hits };
  }

  animate(dt, speed) {
    const r = this.rig, t = this.time;
    this.phase += dt * (7.5 + speed * 0.3);
    const p = this.phase, sw = Math.sin(p), cs = Math.cos(p);
    const grounded = this.grounded && !this.flying;
    const stum = this.stumbleT > 0 ? this.stumbleT / 0.7 : 0;
    // reset the transient bits each frame
    r.body.rotation.set(0, 0, 0); r.hips.rotation.set(0.14, 0, 0); r.hips.position.y = 0.95;
    r.neck.rotation.set(0, 0, 0);

    if (this.flying) {
      r.hips.rotation.x = 1.25; r.hips.position.y = 0.95 + Math.sin(t * 6) * 0.04;
      r.legL.rotation.x = -0.15 + Math.sin(t * 9) * 0.25; r.legR.rotation.x = -0.15 - Math.sin(t * 9) * 0.25;
      r.armL.rotation.set(-2.9, 0, -0.35); r.armR.rotation.set(-2.9, 0, 0.35);
      r.neck.rotation.x = -1.0;
    } else if (this.rollT > 0) {
      const k = 1 - this.rollT / PLAYER.rollTime;
      r.body.rotation.x = -k * Math.PI * 2;
      r.hips.rotation.x = 0.9;
      r.legL.rotation.x = r.legR.rotation.x = -1.7; r.armL.rotation.x = r.armR.rotation.x = -1.6;
      r.hips.position.y = 0.55;
    } else if (!grounded) {
      const up = this.vy > 0;
      r.hips.rotation.x = up ? 0.05 : 0.2;
      r.legL.rotation.x = up ? -1.15 : -0.5; r.legR.rotation.x = up ? 0.6 : 0.4;
      r.armL.rotation.set(up ? -2.6 : -1.5, 0, -0.5); r.armR.rotation.set(up ? -2.6 : -1.5, 0, 0.5);
    } else if (this.idle) {
      const b = Math.sin(t * 2) * 0.02;
      r.hips.rotation.x = 0.04; r.hips.position.y = 0.95 + b;
      r.legL.rotation.x = r.legR.rotation.x = 0; r.armL.rotation.set(0.1 + b * 4, 0, -0.1); r.armR.rotation.set(0.1 - b * 4, 0, 0.1);
      r.neck.rotation.y = Math.sin(t * 0.7) * 0.3;
    } else {
      r.hips.position.y = 0.95 - this.landSquash * 0.7 + Math.abs(cs) * 0.07;
      r.legL.rotation.x = sw * 1.05; r.legR.rotation.x = -sw * 1.05;
      r.armL.rotation.set(-sw * 0.95, 0, -0.12); r.armR.rotation.set(sw * 0.95, 0, 0.12);
      r.hips.rotation.x = 0.16 + this.landSquash * 1.5;
    }
    if (stum > 0 && !this.flying) {
      r.hips.rotation.x += 0.5 * stum; r.hips.rotation.z = Math.sin(t * 40) * 0.08 * stum;
      r.armL.rotation.x = -2 * stum; r.armR.rotation.x = -2 * stum;
    } else r.hips.rotation.z = 0;

    // lean into lane changes
    this.model.rotation.z = -this.laneLean * 0.32 + clamp(this.bank || 0, -1.2, 1.2) * 0.35;
    this.model.rotation.y = -this.laneLean * 0.5;
    r.scarf.update(t, speed, this.laneLean, this.grounded);
    r.cape.update(t, speed, this.laneLean, this.grounded);

    // effect props
    this.holder.position.set(this.x, this.y, 0);
    this.shadow.position.set(this.x, (this.groundH || 0) + 0.03, 0);
    const sh = clamp(1 - (this.y - (this.groundH || 0)) / 7, 0.3, 1); this.shadow.scale.setScalar(sh * (this.rollT > 0 ? 0.8 : 1)); this.shadow.material.opacity = 0.38 * sh;
    if (this.wings.visible) {
      const f = Math.sin(t * 14) * 0.5;
      this.wings.userData.L.rotation.z = -0.2 - f * 0.5; this.wings.userData.R.rotation.z = 0.2 + f * 0.5;
      this.wings.rotation.x = this.flying ? 0.0 : 0;
    }
    if (this.jet.visible) { const k = 0.8 + Math.sin(t * 40) * 0.25; for (const f of this.jet.userData.flames) f.scale.set(1, k + Math.random() * 0.3, 1); }
    if (this.bubble.visible) { this.bubble.rotation.y += dt * 0.8; this.bubble.userData.a.material.opacity = 0.12 + Math.sin(t * 6) * 0.04; }
    if (this.magRing.visible) { this.magRing.rotation.z += dt * 3; this.magRing.position.y = 0.95 + Math.sin(t * 3) * 0.1; this.magRing.scale.setScalar(1 + (Math.sin(t * 6) * 0.5 + 0.5) * 0.25); }
    if (this.bootGlow.visible) this.bootGlow.position.set(0, 0.1, 0);
    // invulnerability blink / hit flash
    const blink = this.invuln > 0 && !this.flying && Math.floor(t * 18) % 2 === 0;
    this.model.visible = !blink;
    for (const m of r.mats) { const acc = m === r.mats[4] || m === r.mats[6]; m.emissive.setHex(this.flash > 0 ? 0xff2200 : (acc ? this.skin.accent : 0x000000)); m.emissiveIntensity = this.flash > 0 ? 0.8 : (acc ? 0.35 : 0); }
  }

  animateDead(dt) {
    this.deadT += dt;
    const k = Math.min(1, this.deadT / 0.5), r = this.rig;
    this.holder.position.y = this.y * (1 - k);
    this.model.rotation.x = k * 1.45; this.model.position.set(0, -0.35 * k, 0.3 * k);
    r.legL.rotation.x = -0.4 * k; r.legR.rotation.x = 0.3 * k; r.armL.rotation.set(-2.4 * k, 0, -0.9 * k); r.armR.rotation.set(-2.2 * k, 0, 0.9 * k);
    this.shadow.position.y = 0.03;
  }

  setEffects({ shield, wings, boots, magnet, jetpack }) {
    this.bubble.visible = !!shield; this.wings.visible = !!wings; this.jet.visible = !!jetpack; this.magRing.visible = !!magnet; this.bootGlow.visible = !!boots;
  }

  stumble() { this.stumbleT = 0.7; this.flash = 0.25; }
  bounce() { this.target = this.prevLane; this.lane = this.target; }
  die() { this.dead = true; this.deadT = 0; this.rollT = 0; }
}
