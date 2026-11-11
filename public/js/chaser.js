import * as THREE from 'three';
import { CHASER } from './config.js';
import * as M from './models.js';

/** The Minotaur that hunts you through the maze. */
export class Chaser {
  constructor(scene) {
    this.model = M.buildMinotaur(); this.rig = this.model.userData.rig;
    this.model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(this.model);
    this.reset();
  }
  reset() {
    this.z = CHASER.farZ + 8; this.targetZ = CHASER.farZ; this.x = 0; this.nearT = 0; this.state = 'far'; this.phase = 0; this.time = 0;
    this.catchT = 0; this.model.visible = false; this.rig.light.intensity = 0;
  }
  get isNear() { return this.nearT > 0; }
  /** Called on a stumble. Returns true when the beast catches you. */
  alert() {
    if (this.nearT > 0) { this.state = 'catch'; this.catchT = 0; return true; }
    this.nearT = CHASER.nearTime; return false;
  }
  update(dt, speed, playerX) {
    this.time += dt;
    if (this.state === 'catch') { this.catchT += dt; this.targetZ = 1.0; }
    else {
      this.nearT = Math.max(0, this.nearT - dt);
      this.targetZ = this.nearT > 0 ? CHASER.nearZ : CHASER.farZ;
    }
    const rate = this.state === 'catch' ? 9 : this.nearT > 0 ? 5 : 1.2;
    this.z += (this.targetZ - this.z) * Math.min(1, dt * rate);
    // lope in the neighbouring lane so the beast frames the screen corner instead of hiding the runner
    if (this.state === 'catch') this.side = 0;
    else if (this.side === undefined || Math.abs(playerX) > 1.0) this.side = playerX > 0 ? -1 : 1;
    const wantX = playerX + this.side * (this.state === 'catch' ? 0 : 2.1);
    this.x += (wantX - this.x) * Math.min(1, dt * (this.state === 'catch' ? 9 : 3));
    this.model.position.set(this.x, 0, this.z);
    this.model.visible = this.z < 8;
    this.phase += dt * (6 + speed * 0.22);
    const r = this.rig, s = Math.sin(this.phase), c = Math.cos(this.phase);
    r.hips.position.y = 1.8 + Math.abs(c) * 0.16;
    r.hips.rotation.x = 0.28;
    r.legL.rotation.x = s * 0.9; r.legR.rotation.x = -s * 0.9;
    r.armL.rotation.x = -s * 0.7; r.armR.rotation.x = -0.9 + s * 0.4;
    r.head.rotation.x = 0.1 + Math.sin(this.time * 12) * 0.05;
    if (this.state === 'catch') { r.armR.rotation.x = -2.2 + Math.sin(this.catchT * 9) * 0.5; r.armL.rotation.x = -1.8; r.hips.rotation.x = 0.1; }
    const near = Math.max(0, 1 - Math.abs(this.z - CHASER.nearZ) / 8);
    r.light.intensity = 26 * near * (0.8 + Math.sin(this.time * 9) * 0.2);
  }
}
