import * as THREE from 'three';

const VS = `
attribute float size; attribute vec4 color; varying vec4 vColor;
uniform float scale;
void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = min(size * scale / max(0.1, -mv.z), scale * 0.045); gl_Position = projectionMatrix * mv; }`;
const FS = `
varying vec4 vColor;
void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if(d>0.5) discard;
  float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor.rgb, vColor.a * a * a * 1.6); }`;

function pointsMaterial(scale) {
  return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { scale: { value: scale } }, transparent: true, depthWrite: false, fog: false });
}

/** CPU particle pool rendered as one Points draw call. */
export class Particles {
  constructor(scene, max = 700) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.world = new Uint8Array(max); this.rgb = new Float32Array(max * 3); this.s0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = pointsMaterial(600);
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 10;
    scene.add(this.points);
  }
  setScale(h) { this.mat.uniforms.scale.value = h * 0.9; }
  emit(o) {
    if (this.n >= this.max) return;
    const i = this.n++, c = new THREE.Color(o.color ?? 0xffffff);
    this.pos.set([o.x, o.y, o.z], i * 3);
    this.vel.set([o.vx || 0, o.vy || 0, o.vz || 0], i * 3);
    this.rgb.set([c.r, c.g, c.b], i * 3);
    this.life[i] = this.maxLife[i] = o.life ?? 1; this.s0[i] = o.size ?? 0.2; this.grav[i] = o.gravity || 0;
    this.world[i] = o.world ? 1 : 0; this.grow[i] = o.grow ?? 0;
  }
  burst(x, y, z, n, color, speed = 3, life = 0.6, size = 0.18, gravity = 6) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, b = (Math.random() - 0.3) * 2.2, v = speed * (0.4 + Math.random() * 0.8);
      this.emit({ x, y, z, vx: Math.cos(a) * v, vy: Math.abs(b) * v, vz: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), size, color, gravity });
    }
  }
  update(dt, speed) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.remove(i); i--; continue; }
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += (this.vel[k + 2] + (this.world[i] ? speed : 0)) * dt;
      if (this.pos[k + 1] < 0.02 && this.grav[i] > 0) { this.pos[k + 1] = 0.02; this.vel[k + 1] *= -0.3; }
      const t = this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] * (this.grow[i] ? 1 + (1 - t) * this.grow[i] : (0.4 + 0.6 * t));
      this.col.set([this.rgb[k], this.rgb[k + 1], this.rgb[k + 2], Math.min(1, t * 1.4)], i * 4);
    }
    const g = this.geo;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = true;
    g.setDrawRange(0, this.n);
  }
  remove(i) {
    const last = --this.n;
    if (i !== last) {
      this.pos.copyWithin(i * 3, last * 3, last * 3 + 3); this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.rgb.copyWithin(i * 3, last * 3, last * 3 + 3); this.col.copyWithin(i * 4, last * 4, last * 4 + 4);
      this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last]; this.size[i] = this.size[last];
      this.s0[i] = this.s0[last]; this.grav[i] = this.grav[last]; this.world[i] = this.world[last]; this.grow[i] = this.grow[last];
    }
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

/** Drifting embers / fireflies that live in the corridor and stream past the camera. */
export class Ambient {
  constructor(scene, count = 140) {
    this.count = count;
    this.pos = new Float32Array(count * 3); this.col = new Float32Array(count * 4); this.size = new Float32Array(count);
    this.seed = new Float32Array(count); this.base = new Float32Array(count); this.rise = 0.12; this.sizeMul = 1;
    for (let i = 0; i < count; i++) this.respawn(i, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = pointsMaterial(600);
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 9;
    scene.add(this.points);
    this.color = new THREE.Color(0xffd166);
  }
  setScale(h) { this.mat.uniforms.scale.value = h * 0.9; }
  respawn(i, initial) {
    this.pos[i * 3] = (Math.random() - 0.5) * 8.4; this.pos[i * 3 + 1] = 0.3 + Math.random() * 6;
    this.pos[i * 3 + 2] = initial ? -Math.random() * 140 + 8 : -140 - Math.random() * 10;
    this.seed[i] = Math.random() * 100; this.base[i] = 0.06 + Math.random() * 0.12; this.size[i] = this.base[i] * this.sizeMul;
    if (!initial && this.rise < 0) this.pos[i * 3 + 1] = 6.5 + Math.random() * 0.8;
  }
  setColor(c) { this.color.set(c); }
  /** rise > 0: drifting up (embers, dust); rise < 0: falling (leaves, snow). */
  setMode(rise, sizeMul, color) { this.rise = rise; this.sizeMul = sizeMul; this.fixedColor = color; this.fc = null; }
  update(dt, speed, time) {
    for (let i = 0; i < this.count; i++) {
      const k = i * 3, sd = this.seed[i];
      this.pos[k + 2] += speed * dt;
      this.pos[k] += Math.sin(time * 0.7 + sd) * 0.25 * dt;
      this.pos[k + 1] += (Math.sin(time * 0.9 + sd * 1.7) * 0.3 + this.rise) * dt;
      this.size[i] = this.base[i] * this.sizeMul;
      if (this.pos[k + 2] > 9 || this.pos[k + 1] > 7.2 || this.pos[k + 1] < 0.1) this.respawn(i, false);
      const tw = 0.5 + 0.5 * Math.sin(time * 2 + sd * 3), fade = Math.min(1, (140 + this.pos[k + 2]) / 25);
      const fc = this.fixedColor !== undefined ? this.fc || (this.fc = new THREE.Color(this.fixedColor)) : this.color;
      this.col.set([fc.r, fc.g, fc.b, 0.85 * tw * fade], i * 4);
    }
    const g = this.points.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}

export function buildSky(topColor, bottomColor) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(topColor) }, bottom: { value: new THREE.Color(bottomColor) }, time: { value: 0 }, stars: { value: 0.8 }, sunDir: { value: new THREE.Vector3(-0.31, 0.53, -0.79).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 vDir; uniform vec3 top; uniform vec3 bottom; uniform float time; uniform float stars; uniform vec3 sunDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        float h = clamp(vDir.y*1.5+0.12, 0.0, 1.0);
        vec3 c = mix(bottom, top, pow(h, 0.65));
        vec2 uv = vDir.xz / (vDir.y + 0.35) * 1.6 + vec2(time*0.012, 0.0);
        float cl = smoothstep(0.52, 0.85, fbm(uv)) * smoothstep(0.02, 0.3, vDir.y);
        c = mix(c, vec3(1.0), cl * 0.85);
        float sd = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.93, 0.76) * (pow(sd, 900.0) * 3.0 + pow(sd, 40.0) * 0.35 + pow(sd, 6.0) * 0.12);        // sun disc, corona and a warm wash
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}
