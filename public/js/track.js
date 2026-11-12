// The path through the labyrinth: straight "legs" joined by 90° corners (Temple Run style).
//
// Track coordinate `s` is distance along the centre line. Leg k owns s in [a, b): `a` is the centre of the previous
// corner square (or a fake start), `b` is the centre of the corner that ends the leg. Straight corridor segments of
// SEG_LEN start at a + 4 and finish at b - 4; the 8 m x 8 m corner square sits on [b - 4, b + 4].
//
// Everything in a leg lives in that leg's local frame (forward = -z, lateral x), and legs are placed once, so only the
// world root is moved each frame (see World.update): it keeps the player at the origin facing -z.
import * as THREE from 'three';
import { SEG_LEN } from './config.js';

export const CORNER_HALF = 4;
const HALF_PI = Math.PI / 2;

export class Track {
  constructor(root, rand, startDist) {
    this.root = root; this.rand = rand;
    this.legs = []; this.corners = [];
    this.nextK = 0; this.zig = 0;
    this.theta = 0; this.thetaTarget = 0;                       // visual heading (smoothed) and the heading we are turning toward
    const segStart = Math.floor((startDist - 96) / SEG_LEN) * SEG_LEN;
    // first corner: not before ~300 m so new players get a run-up
    const m0 = Math.max(10, Math.ceil((300 - segStart) / SEG_LEN));
    this.addLeg(segStart - CORNER_HALF, 0, { x: 0, z: 0 }, m0 + Math.floor(rand() * 4));
  }

  addLeg(a, theta, P, m) {
    const leg = { k: this.nextK++, a, segStart: a + CORNER_HALF, b: a + 2 * CORNER_HALF + SEG_LEN * m, m, theta, P, group: new THREE.Group() };
    leg.group.position.set(P.x, 0, P.z); leg.group.rotation.y = theta; leg.group.updateMatrix(); leg.group.matrixAutoUpdate = false;
    this.root.add(leg.group);
    this.legs.push(leg);
    // the corner that ends this leg (direction is planned now so everything ahead knows about it)
    const dir = this.pickDir(theta);
    const corner = { s: leg.b, dir, leg: leg.k, newTheta: theta + dir * HALF_PI, accepted: false, executed: false, wall: null, built: false };
    this.corners.push(corner);
    leg.corner = corner;
    return leg;
  }

  /**
   * Left (+1) or right (-1). The path may only head forward or sideways, never back: a sideways leg must turn back to
   * forward. That makes the track zig-zag like a staircase and makes it impossible for it to ever cross itself
   * (forward legs sit at strictly increasing depths, sideways legs are 80 m+ apart).
   */
  pickDir(theta) {
    if (theta > 0.1) return -1;                         // heading left  -> turn right, back to forward
    if (theta < -0.1) return 1;                         // heading right -> turn left, back to forward
    return this.rand() < 0.5 ? 1 : -1;
  }

  planLength(b, theta) {
    const r = this.rand, sideways = Math.abs(theta) > 0.1, tight = Math.min(1, b / 6000);
    if (this.zig > 0) { this.zig--; return 3 + Math.floor(r() * 2); }                // zig-zag run: short legs, 72-96 m apart
    if (!sideways && b > 500 && r() < 0.3) { this.zig = 2 + Math.floor(r() * 4); return 3 + Math.floor(r() * 2); }
    if (sideways) return 4 + Math.floor(r() * 6);                                     // 100-220 m sideways
    return Math.round(8 + r() * (14 - 6 * tight));                                    // 190-530 m early, shorter later
  }

  /** Make sure legs (and so corners) exist up to track position s. */
  ensure(s) {
    while (this.legs[this.legs.length - 1].b < s) {
      const last = this.legs[this.legs.length - 1], c = last.corner;
      const u = last.b - last.a, f = forward(last.theta);
      const P = { x: last.P.x + f.x * u, z: last.P.z + f.z * u };
      this.addLeg(last.b, c.newTheta, P, this.planLength(last.b, c.newTheta));
    }
  }

  legAt(s) {
    for (let i = this.legs.length - 1; i >= 0; i--) if (this.legs[i].a <= s) return this.legs[i];
    return this.legs[0];
  }

  /** Centre-line position of track coordinate s in the root's frame. */
  point(s) {
    const leg = this.legAt(s), f = forward(leg.theta), u = s - leg.a;
    return { x: leg.P.x + f.x * u, z: leg.P.z + f.z * u, leg };
  }

  /** First corner the player has not yet turned (or been auto-turned) at. */
  nextCorner(dist) {
    for (const c of this.corners) if (!c.executed && c.s + 6 > dist) return c;
    return null;
  }

  cornerBetween(a, b, pad = 0) {
    for (const c of this.corners) if (c.s + CORNER_HALF + pad > a && c.s - CORNER_HALF - pad < b) return c;
    return null;
  }

  execute(c) {
    if (c.executed) return;
    c.executed = true; c.accepted = true;
    this.thetaTarget = c.newTheta;
    if (c.wall) c.wall.ghost = true;
  }

  forceTurns(untilS) {
    for (const c of this.corners) if (!c.executed && c.s < untilS) c.accepted = true;
  }

  /** Smooth the visual heading toward the target (the camera swings round the corner). */
  step(dt) {
    const d = this.thetaTarget - this.theta;
    this.theta = Math.abs(d) < 0.002 ? this.thetaTarget : this.theta + d * (1 - Math.exp(-8 * dt));
  }

  /** Place `root` so the player at track position `dist` is at the origin facing -z. */
  applyPose(root, dist) {
    const p = this.point(dist), a = -this.theta, c = Math.cos(a), s = Math.sin(a);
    root.rotation.y = a;
    root.position.set(-(p.x * c + p.z * s), 0, -(-p.x * s + p.z * c));
    root.updateMatrix();
  }

  /** Drop legs we've left far behind. */
  prune(dist, behind) {
    while (this.legs.length > 2 && this.legs[0].b + CORNER_HALF + behind < dist) {
      const l = this.legs.shift(); this.root.remove(l.group);
      const i = this.corners.indexOf(l.corner); if (i >= 0) this.corners.splice(i, 1);
    }
  }

  dispose() { for (const l of this.legs) this.root.remove(l.group); this.legs = []; this.corners = []; }
}

export function forward(theta) { return { x: -Math.sin(theta), z: -Math.cos(theta) }; }
