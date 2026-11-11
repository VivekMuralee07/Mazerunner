import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { BIOMES, BIOME_LEN, LANES, SPEED, POWERUPS, SKINS, PLAYER } from './config.js';
import * as Store from './storage.js';
import * as Audio from './audio.js';
import * as Missions from './missions.js';
import * as Tex from './textures.js';
import * as Models from './models.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Chaser } from './chaser.js';
import { Particles, Ambient, buildSky } from './fx.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export const STATE = { LOADING: 'loading', MENU: 'menu', COUNTDOWN: 'countdown', RUNNING: 'running', PAUSED: 'paused', DYING: 'dying', OVER: 'over' };

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas; this.ui = ui;
    this.state = STATE.LOADING;
    this.time = 0; this.dist = 0; this.speed = 0;
    this.quality = 'high'; this.fpsAcc = 0; this.fpsN = 0; this.lowFpsT = 0;
  }

  // ------------------------------------------------------------------ setup
  async init(progress) {
    const save = Store.get();
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);
    this.isMobile = isMobile;

    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BIOMES[0].fog, BIOMES[0].fogDensity);
    scene.background = new THREE.Color(BIOMES[0].fog);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 520);
    this.camera.position.set(0, 4.3, 7.4);

    // lights
    this.hemi = new THREE.HemisphereLight(0xe6f4ff, 0xb8c79a, 1.3); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xbfe6ff, 1.5); this.sun.position.set(-9, 20, 8); this.sun.target.position.set(0, 0, -14);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 40; sc.bottom = -26; sc.near = 1; sc.far = 70;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04; this.sun.shadow.radius = 3; this.sun.shadow.blurSamples = 10;
    scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0xffe6c8, 0.5); this.fill.position.set(6, 5, 12); scene.add(this.fill);

    this.sky = buildSky(BIOMES[0].skyTop, BIOMES[0].skyBottom); scene.add(this.sky);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.glowTexture('rgba(255,255,255,1)', 'rgba(255,240,200,0)'), color: 0xfff2c4, fog: false, depthWrite: false, transparent: true }));
    moon.scale.set(150, 150, 1); moon.position.set(-110, 190, -300); this.sky.add(moon); this.moon = moon;

    // composer (MSAA render target + bloom + tone mapping)
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.5, 0.98);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, sat: { value: 1.14 }, contrast: { value: 1.07 }, vig: { value: 0.22 }, warm: { value: 0.025 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, contrast, vig, warm; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          c.rgb = mix(vec3(l), c.rgb, sat); c.rgb = (c.rgb - 0.5) * contrast + 0.5; c.rgb += vec3(warm, warm * 0.4, -warm * 0.6);
          vec2 q = vUv - 0.5; c.rgb *= 1.0 - vig * smoothstep(0.35, 0.95, length(q * vec2(1.1, 1.0)));
          gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a); }`,
    });
    this.composer.addPass(this.grade);

    // textures & materials
    await new Promise((r) => setTimeout(r, 30));
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const biomeMats = Tex.buildBiomeMaterials(BIOMES, Math.min(8, maxAniso), (p) => progress && progress(0.1 + p * 0.6));
    await new Promise((r) => setTimeout(r, 10));
    const glowTex = Tex.glowTexture();
    this.S = Models.makeSharedMaterials(glowTex, null);
    this.tex = { glow: glowTex, laneRune: Tex.laneRuneTexture(), coin: Tex.coinTexture(), ...Tex.shadingTextures() };
    // image-based lighting: a PMREM of the daytime sky gives every PBR surface believable ambient light and sheen
    const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(), envSky = buildSky(0x5aa9ff, 0xf1f8ff);
    envSky.material.uniforms.time.value = 3; envScene.add(envSky);
    scene.environment = pm.fromScene(envScene, 0, 0.1, 1000).texture; scene.environmentIntensity = 0.55; pm.dispose();
    // distant hills give the horizon some depth
    this.hills = [];
    for (const [rad, h, col] of [[330, 55, 0.5], [300, 38, 0.3]]) {
      const geo = new THREE.CylinderGeometry(rad, rad, h, 72, 1, true), pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); pos.setY(i, h / 2 * (0.25 + 0.75 * Math.abs(Math.sin(a * 3.1 + rad) * 0.6 + Math.sin(a * 7.3) * 0.4))); }
      const hill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x9db8c8, fog: false, side: THREE.BackSide, depthWrite: true }));
      hill.position.y = h / 2 - 6; hill.renderOrder = -5; hill.userData.mix = col; scene.add(hill); this.hills.push(hill);
    }
    progress && progress(0.8);

    this.world = new World(scene, biomeMats, this.S, this.tex);
    this.player = new Player(scene, SKINS.find((s) => s.id === save.skin), this.S);
    this.chaser = new Chaser(scene);
    this.particles = new Particles(scene, 800);
    this.ambient = new Ambient(scene, 150);
    this.player.idle = true;

    this.applyQuality(save.settings.quality === 'auto' ? (isMobile ? 'medium' : 'high') : save.settings.quality);
    this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === STATE.RUNNING) this.pause(); });
    addEventListener('blur', () => { if (this.state === STATE.RUNNING) this.pause(); });

    this.resetRun(false);
    this.state = STATE.MENU;
    this.last = performance.now();
    progress && progress(1);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  applyQuality(q) {
    this.quality = q;
    const r = this.renderer;
    const dpr = window.devicePixelRatio || 1;
    const cfg = {
      high:   { pr: Math.min(dpr, 2), shadow: 2048, bloom: true, shadows: true, samples: 4 },
      medium: { pr: Math.min(dpr, 1.5), shadow: 1024, bloom: true, shadows: true, samples: 2 },
      low:    { pr: 1, shadow: 512, bloom: false, shadows: true, samples: 0 },
    }[q];
    this.cfg = cfg;
    r.setPixelRatio(cfg.pr);
    r.shadowMap.enabled = cfg.shadows;
    if (this.sun.shadow.mapSize.x !== cfg.shadow) {
      this.sun.shadow.mapSize.set(cfg.shadow, cfg.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.bloom.enabled = cfg.bloom;
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) { t.samples = cfg.samples; t.dispose(); }
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.cfg.pr); this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // narrow portrait screens need a wider vertical FOV to keep all three lanes in view
    this.baseFov = w / h < 0.8 ? 80 : w / h < 1.2 ? 70 : 62;
    this.camera.updateProjectionMatrix();
    const bufH = h * this.cfg.pr;
    this.particles && this.particles.setScale(bufH); this.ambient && this.ambient.setScale(bufH);
  }

  // ------------------------------------------------------------------ run lifecycle
  resetRun(clearWorld = true) {
    const save = Store.get();
    this.dist = 0; this.speed = 0; this.baseSpeed = SPEED.start; this.slowT = 0;
    this.score = 0; this.runCoins = 0; this.banked = 0;
    this.runTime = 0; this.boulderT = 24 + Math.random() * 14; this.boulder = null; this.rumbleT = 0; this.boulderDust = 0;
    this.stats = { distance: 0, coins: 0, jumps: 0, rolls: 0, powerups: 0, lanes: 0, climbs: 0, score: 0 };
    this.timers = { magnet: 0, double: 0, boots: 0, wings: 0, jetpack: 0 }; this.shield = false;
    this.flyWarn = false; this.revives = 0; this.shake = 0; this.notified = new Set();
    this.dustT = 0; this.stepT = 0; this.growlT = 6;
    this.world.reset((Math.random() * 1e9) | 0, 0);
    this.player.reset(); this.player.idle = true; this.player.setEffects({});
    this.chaser.reset(); this.particles.clear();
    this.mult = 1 + save.rank;
    this.ui.updateHud(this);
  }

  play() {
    Audio.unlock(); Audio.startMusic();
    this.resetRun();
    this.player.idle = false;
    this.state = STATE.COUNTDOWN; this.countT = 0; this.countShown = 4;
    this.ui.onPlay();
  }

  beginRun() {
    this.state = STATE.RUNNING; this.speed = this.baseSpeed;
    Audio.sfx.go();
    this.ui.countdown('RUN!', true);
    const first = !Store.get().settings.tutorialDone;
    if (first) { this.ui.showTutorial(); Store.get().settings.tutorialDone = true; Store.save(); }
  }

  pause() {
    if (this.state !== STATE.RUNNING) return;
    this.state = STATE.PAUSED; Audio.duck(true); this.ui.showPause(true);
  }
  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.ui.showPause(false);
    this.state = STATE.COUNTDOWN; this.countT = 0; this.countShown = 4; this.resuming = true;
  }
  quitToMenu() {
    this.state = STATE.MENU; this.resetRun(); Audio.duck(false); Audio.setIntensity(0, 0);
    this.ui.showMenu();
  }

  // ------------------------------------------------------------------ input
  action(a) {
    if (a === 'confirm') return this.ui.onConfirm && this.ui.onConfirm();
    if (a === 'pause') {
      if (this.state === STATE.RUNNING) this.pause(); else if (this.state === STATE.PAUSED) this.resume();
      return;
    }
    if (this.state === STATE.MENU && a === 'touch') return;
    if (this.state !== STATE.RUNNING && this.state !== STATE.COUNTDOWN) return;
    const p = this.player;
    if (a === 'left' || a === 'right') {
      if (p.moveLane(a === 'left' ? -1 : 1)) { this.stats.lanes++; Audio.sfx.lane(); }
    } else if (a === 'jump') p.jump();
    else if (a === 'roll') p.roll();
  }

  // ------------------------------------------------------------------ main loop
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (dt <= 0) return;
    this.trackFps(dt);
    const n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n;
    for (let i = 0; i < n; i++) this.step(h);
    this.time += dt;
    this.render(dt);
  }

  trackFps(dt) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc < 1) return;
    const fps = this.fpsN / this.fpsAcc; this.fps = fps; this.fpsAcc = 0; this.fpsN = 0;
    if (Store.get().settings.quality !== 'auto' || this.state === STATE.PAUSED || document.hidden) { this.lowFpsT = 0; return; }
    this.lowFpsT = fps < 40 ? this.lowFpsT + 1 : 0;
    if (this.lowFpsT >= 3) {
      this.lowFpsT = 0;
      const next = this.quality === 'high' ? 'medium' : this.quality === 'medium' ? 'low' : null;
      if (next) this.applyQuality(next);
    }
  }

  step(dt) {
    const st = this.state;
    if (st === STATE.PAUSED || st === STATE.LOADING) return;
    if (st === STATE.MENU || st === STATE.OVER) {
      this.player.update(dt, this.dist, 0, this.world);
      this.world.update(dt, this.dist, 0, this.time);
      this.chaser.update(dt, 0, 0); this.ambient.update(dt, 1.2, this.time); this.particles.update(dt, 0);
      this.updateAtmosphere(dt);
      return;
    }
    if (st === STATE.COUNTDOWN) {
      this.countT += dt;
      const k = Math.floor(this.countT / 0.65), num = 3 - k;
      if (num !== this.countShown) {
        this.countShown = num;
        if (num > 0) { this.ui.countdown(String(num)); Audio.sfx.count(); }
      }
      this.player.idle = num > 0 && !this.resuming;
      this.player.update(dt, this.dist, 0, this.world);
      this.world.update(dt, this.dist, 0, this.time);
      this.ambient.update(dt, 2, this.time); this.particles.update(dt, 0);
      this.updateAtmosphere(dt);
      if (this.countT >= 3 * 0.65) {
        this.player.idle = false;
        if (this.resuming) { this.resuming = false; this.state = STATE.RUNNING; Audio.duck(false); this.ui.countdown('GO!', true); }
        else this.beginRun();
      }
      return;
    }
    if (st === STATE.DYING) { this.stepDying(dt); return; }
    this.stepRunning(dt);
  }

  // ------------------------------------------------------------------ running
  stepRunning(dt) {
    const p = this.player, w = this.world;
    this.baseSpeed = Math.min(SPEED.max, this.baseSpeed + SPEED.accel * dt);
    this.slowT = Math.max(0, this.slowT - dt);
    let target = this.baseSpeed * (1 - (1 - SPEED.stumblePenalty) * smooth(0, 1, this.slowT));
    if (p.flying) target *= 1.15;
    this.speed += (target - this.speed) * damp(5, dt);
    const sp = this.speed, prev = this.dist;
    this.dist += sp * dt; this.runTime += dt;

    // power-up timers
    const T = this.timers;
    for (const k of Object.keys(T)) if (T[k] > 0) { T[k] = Math.max(0, T[k] - dt); }
    p.boots = T.boots > 0;
    if (p.flying && T.wings <= 0 && T.jetpack <= 0) this.endFlight();
    const flyT = Math.max(T.wings, T.jetpack);
    this.flyWarn = flyT > 0 && flyT < 1.5;
    p.setEffects({ shield: this.shield, wings: T.wings > 0, jetpack: T.jetpack > 0, boots: T.boots > 0, magnet: T.magnet > 0 });
    this.mult = (1 + Store.get().rank) * (T.double > 0 ? 2 : 1);

    const res = p.update(dt, this.dist, sp, w);
    for (const e of res.events) this.onPlayerEvent(e);
    this.handleHits(res.hits);
    if (this.state !== STATE.RUNNING) return;

    this.collect(prev, dt);
    this.chaser.update(dt, sp, p.x);
    this.growlT -= dt;
    if (this.chaser.isNear && this.growlT <= 0) { Audio.sfx.growl(); this.growlT = 2.2; }

    // score
    this.score += sp * dt * this.mult;
    this.stats.distance = this.dist; this.stats.score = this.score;

    w.targetX = p.x;
    this.updateBoulder(dt, sp);
    w.update(dt, this.dist, sp, this.time);
    this.updateFx(dt, sp);
    this.updateAtmosphere(dt);

    // mission toasts
    const done = Missions.peek(this.stats, this.notified);
    for (const m of done) { this.ui.toast(`Mission complete: ${m.text}`, 'mission'); Audio.sfx.mission(); }

    // audio intensity follows speed
    const sn = clamp((sp - SPEED.start) / (SPEED.max - SPEED.start), 0, 1);
    Audio.setIntensity(0.25 + sn * 0.75, sn);
    this.ui.updateHud(this);
  }

  onPlayerEvent(e) {
    const p = this.player;
    if (e.type === 'jump') { this.stats.jumps++; Audio.sfx.jump(); if (p.boots) Audio.sfx.boost(); this.puff(p.x, 0.1, 0, 6); }
    else if (e.type === 'roll') { this.stats.rolls++; Audio.sfx.roll(); this.puff(p.x, 0.1, 0, 8); }
    else if (e.type === 'dive') { Audio.sfx.roll(); }
    else if (e.type === 'land') { Audio.sfx.land(); this.puff(p.x, 0.1, 0, e.hard ? 14 : 7); if (e.hard) this.shake = Math.max(this.shake, 0.25); }
    else if (e.type === 'climb') { this.stats.climbs++; }
  }

  handleHits(hits) {
    if (!hits.length) return;
    const p = this.player;
    for (const h of hits) {
      const sd = h.sd;
      if (sd.ghost || sd.ignore) continue;
      if (p.invuln > 0 && h.kind === 'front') continue;
      if (this.shield) { this.breakShield(sd); return; }
      if (sd.type === 'boulder') { this.die('boulder'); return; }
      const fatal = h.kind === 'front' && (sd.type === 'wall' || sd.type === 'block');
      if (fatal) { this.die('crash'); return; }
      if (h.kind === 'side') {
        p.bounce();
        if ((this.time - (p.lastScrape || -9)) < 0.45) continue;     // already stumbled on this scrape
        p.lastScrape = this.time;
      } else sd.ignore = true;
      this.stumble(sd);
      return;
    }
  }

  stumble(sd) {
    const p = this.player;
    p.stumble(); this.slowT = 1.4; this.shake = Math.max(this.shake, 0.5);
    Audio.sfx.stumble();
    this.particles.burst(p.x, 1, 0, 12, 0xffb36b, 4, 0.5);
    this.ui.flash('rgba(255,60,40,0.35)');
    const caught = this.chaser.alert();
    if (caught) { this.die('caught'); }
    else { Audio.sfx.roar(); this.ui.toast('The Minotaur is right behind you!', 'warn'); this.growlT = 1.5; }
  }

  /** Random, homing boulder: warns, rolls toward the player's lane, locks on late, flattens anything in its way. */
  updateBoulder(dt, sp) {
    const p = this.player, w = this.world;
    this.boulderT -= dt;
    if (this.boulderT <= 0 && !p.flying && !this.boulder && this.dist > 300 && this.state === STATE.RUNNING) {
      const diff = clamp(this.dist / 6000, 0, 1);
      this.boulder = w.addBoulder(p.target, this.dist + 80 + sp * 1.5, 13 + diff * 7);
      this.boulderT = 24 + Math.random() * 20 - diff * 8;
      this.ui.toast('⚠ BOULDER! Get out of its lane!', 'warn'); this.ui.flash('rgba(255,140,40,0.25)');
      Audio.sfx.rumble(); this.shake = Math.max(this.shake, 0.35);
    }
    const b = this.boulder;
    if (!b) return;
    if (b.ghost && b.smashT) { this.boulder = null; return; }
    const ahead = b.s0 - this.dist;
    if (ahead < 80 && ahead > -3 && !b.ghost) {
      this.rumbleT -= dt;
      if (this.rumbleT <= 0) { Audio.sfx.rumble(); this.rumbleT = 0.45; }
      this.shake = Math.max(this.shake, 0.1 + 0.2 * (1 - clamp(ahead / 80, 0, 1)));
      this.boulderDust -= dt;
      if (this.boulderDust <= 0) {
        this.boulderDust = 0.04;
        for (let i = 0; i < 2; i++) this.particles.emit({ x: b.x + (Math.random() - 0.5) * 1.6, y: 0.15, z: -(b.s0 - this.dist) - 0.6, vx: (Math.random() - 0.5) * 2, vy: 0.8 + Math.random(), vz: 0, life: 0.7, size: 0.5, color: this.dustColor || 0x998877, world: true, grow: 1.6 });
      }
    }
    if (!b.ghost && b.s1 < this.dist - 1.5 && !b.counted) {
      b.counted = true; this.score += 250 * this.mult;
      this.ui.toast('Boulder dodged! +250', 'mission');
    }
    if (b.s1 < this.dist - 20 || b.ghost) this.boulder = null;
  }

  breakShield(sd) {
    this.shield = false; this.player.invuln = 1.6; this.player.flash = 0.25;
    this.world.smash(sd);
    Audio.sfx.shieldBreak();
    this.particles.burst(this.player.x, 1, 0, 30, 0xb388ff, 6, 0.8, 0.22, 2);
    this.shake = Math.max(this.shake, 0.4);
    this.ui.flash('rgba(179,136,255,0.35)');
  }

  endFlight() {
    const p = this.player;
    p.flying = false; this.world.flying = false; p.invuln = 2.2;
    this.flyWarn = false;
  }

  die(cause) {
    if (this.state === STATE.DYING) return;
    this.state = STATE.DYING; this.deathT = 0; this.cause = cause;
    this.player.die(); this.shake = 1;
    if (cause === 'caught') { this.chaser.state = 'catch'; this.chaser.catchT = 0; Audio.sfx.roar(); }
    Audio.sfx.crash();
    this.ui.flash('rgba(255,20,40,0.5)');
    Audio.duck(true);
    this.particles.burst(this.player.x, 1, 0, 40, 0xff7a3d, 7, 0.9, 0.25);
  }

  stepDying(dt) {
    this.deathT += dt;
    this.speed *= Math.exp(-dt * 5);
    this.dist += this.speed * dt;
    this.player.update(dt, this.dist, this.speed, this.world);
    this.world.targetX = this.player.x;
    this.world.update(dt, this.dist, this.speed, this.time);
    this.chaser.update(dt, 8, this.player.x);
    this.updateFx(dt, this.speed); this.updateAtmosphere(dt);
    if (this.deathT > 1.5) this.finishRun();
  }

  finishRun() {
    this.state = STATE.OVER;
    const save = Store.get();
    save.coins += this.runCoins - this.banked; this.banked = this.runCoins;
    const newBest = Math.floor(this.score) > save.best;
    save.best = Math.max(save.best, Math.floor(this.score));
    save.bestDistance = Math.max(save.bestDistance, Math.floor(this.dist));
    save.totalRuns++;
    this.stats.coins = this.runCoins;
    const lt = save.lifetime;
    lt.distance += this.dist; lt.coins += this.runCoins; lt.time += this.runTime;
    for (const k of ['jumps', 'rolls', 'powerups', 'lanes', 'climbs']) lt[k] += this.stats[k];
    const m = Missions.commit(this.stats);
    Store.save();
    this.ui.showGameOver({
      score: Math.floor(this.score), best: save.best, newBest, distance: Math.floor(this.dist), coins: this.runCoins,
      cause: this.cause, missions: m, canRevive: this.revives < 3, reviveCost: this.reviveCost(), wallet: save.coins,
    });
  }

  reviveCost() { return 50 * Math.pow(2, this.revives); }

  revive() {
    const save = Store.get(), cost = this.reviveCost();
    if (this.revives >= 3 || save.coins < cost) { Audio.sfx.deny(); return false; }
    save.coins -= cost; Store.save(); Audio.sfx.buy();
    this.revives++;
    const p = this.player;
    p.dead = false; p.caught = false; p.model.rotation.set(0, 0, 0); p.model.position.set(0, 0, 0); p.rollT = 0; p.vy = 0;
    p.stumbleT = 0; p.invuln = 3; p.y = 0; p.lane = p.target = 1; p.prevLane = 1; p.x = LANES[1]; p.grounded = true; p.flash = 0;
    this.chaser.state = 'far'; this.chaser.nearT = 0; this.chaser.z = 14;
    this.world.clearRange(this.dist - 6, this.dist + 70);
    this.world.path = 1; this.world.busy = [-1e9, -1e9, -1e9]; this.world.prevOcc = [true, true, true];
    this.baseSpeed = Math.max(SPEED.start, this.baseSpeed * 0.85); this.speed = 0; this.slowT = 0;
    this.state = STATE.COUNTDOWN; this.countT = 0; this.countShown = 4; this.resuming = true;
    Audio.duck(false);
    this.ui.onRevive();
    return true;
  }

  // ------------------------------------------------------------------ collectibles
  collect(prevDist, dt) {
    const p = this.player, w = this.world, T = this.timers;
    const cy = p.y + (p.rollT > 0 ? 0.4 : 0.95);
    const magnet = T.magnet > 0 || p.flying;
    if (magnet) {
      for (const c of w.coins) {
        const ds = c.s - this.dist;
        if (ds > -2 && ds < 22 && Math.abs(c.x - p.x) < (p.flying ? 3.4 : 9) && (!p.flying || Math.abs(c.y - cy) < 4)) {
          const k = damp(p.flying ? 5 : 7, dt);
          c.x += (p.x - c.x) * k; c.y += (cy - c.y) * k; c.s += (this.dist + 0.2 - c.s) * k * 0.9;
        }
      }
    }
    const coins = w.coins;
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (c.s < prevDist - 0.6 || c.s > this.dist + 0.7) continue;
      if (Math.abs(c.x - p.x) < (p.flying ? 1.7 : 0.85) && Math.abs(c.y - cy) < (p.flying ? 2.6 : 1.15)) {
        coins.splice(i, 1);
        this.runCoins++; this.stats.coins = this.runCoins;
        this.score += 10 * this.mult;
        Audio.sfx.coin();
        this.particles.burst(c.x, c.y, 0, 5, 0xffd54a, 2.5, 0.4, 0.14, 3);
      }
    }
    const pk = w.pickups;
    for (let i = pk.length - 1; i >= 0; i--) {
      const q = pk[i];
      if (q.s < prevDist - 0.8 || q.s > this.dist + 0.9) continue;
      if (Math.abs(q.x - p.x) < 1.2 && Math.abs(q.y - cy) < 1.6) {
        w.pickupRoot.remove(q.group); pk.splice(i, 1);
        this.grant(q.type, q.x, q.y);
      }
    }
  }

  grant(type, x, y) {
    const save = Store.get(), def = POWERUPS[type];
    this.stats.powerups++;
    Audio.sfx.power();
    this.particles.burst(x, y, 0, 26, new THREE.Color(def.color).getHex(), 5, 0.7, 0.2, 1);
    this.ui.toast(`${def.name}!`, 'power', def.color);
    if (type === 'shield') { this.shield = true; return; }
    const lvl = save.upgrades[type] || 0;
    this.timers[type] = def.base + def.step * lvl;
    if (type === 'wings' || type === 'jetpack') {
      this.player.flying = true; this.world.flying = true; this.world.skyS = this.dist + 25; this.world.skyLane = this.player.target; this.world.skyRun = 8;
      this.player.rollT = 0;
    }
  }

  // ------------------------------------------------------------------ visuals
  puff(x, y, z, n) {
    for (let i = 0; i < n; i++) this.particles.emit({ x: x + (Math.random() - 0.5) * 0.5, y, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 1.6, vy: Math.random() * 1.2, vz: 0, life: 0.5 + Math.random() * 0.3, size: 0.28, color: this.dustColor || 0x998877, world: true, grow: 1.4 });
  }

  updateFx(dt, sp) {
    const p = this.player;
    this.dustT -= dt;
    if (p.grounded && !p.flying && this.state === STATE.RUNNING && this.dustT <= 0) { this.puff(p.x, p.groundH + 0.06, 0.1, 1); this.dustT = 0.07; }
    if (p.flying) this.particles.emit({ x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + 0.9, z: 0.4, vx: (Math.random() - 0.5) * 0.6, vy: -0.4, vz: 0, life: 0.4, size: 0.14, color: 0x7fe0ff, world: true, grow: 0.4 });
    if (this.timers.jetpack > 0) {
      for (const sx of [-0.17, 0.17]) {
        this.particles.emit({ x: p.x + sx + (Math.random() - 0.5) * 0.08, y: p.y + 0.65, z: 0.4, vx: (Math.random() - 0.5) * 0.8, vy: -2.5 - Math.random() * 2, vz: 0, life: 0.35, size: 0.2, color: Math.random() < 0.5 ? 0xff9a1a : 0xffe066, world: true, grow: 0.2 });
      }
      if (Math.random() < 0.5) this.particles.emit({ x: p.x + (Math.random() - 0.5) * 0.4, y: p.y + 0.4, z: 0.5, vx: 0, vy: -0.6, vz: 0, life: 0.7, size: 0.3, color: 0xbfc6cf, world: true, grow: 1.3 });
    }
    if (this.timers.boots > 0 && p.grounded) this.particles.emit({ x: p.x, y: p.y + 0.1, z: 0.1, vx: 0, vy: 1.5, vz: 0, life: 0.4, size: 0.16, color: 0x37e08a, world: true });
    if (this.state === STATE.RUNNING) {
      this.stepT -= dt;
      if (p.grounded && !p.flying && this.stepT <= 0) { Audio.sfx.step(); this.stepT = clamp(0.5 - sp * 0.01, 0.2, 0.5) * 0.6; }
    }
    this.particles.update(dt, sp); this.ambient.update(dt, sp, this.time);
  }

  /** Blend fog / sky / light colours between neighbouring biomes as you run. */
  updateAtmosphere(dt) {
    const d = this.dist;
    const bi = Math.floor((d + 40) / BIOME_LEN), nb = (bi + 1) * BIOME_LEN;
    const t = smooth(nb - 230, nb - 40, d);
    const A = BIOMES[bi % BIOMES.length], B = BIOMES[(bi + 1) % BIOMES.length];
    const c = (k) => new THREE.Color(A[k]).lerp(new THREE.Color(B[k]), t);
    const fog = c('fog'); this.scene.fog.color.copy(fog); this.scene.background.copy(fog);
    this.scene.fog.density = A.fogDensity + (B.fogDensity - A.fogDensity) * t;
    this.sky.material.uniforms.top.value.copy(c('skyTop')); this.sky.material.uniforms.bottom.value.copy(c('skyBottom'));
    this.sky.material.uniforms.stars.value = A.star + (B.star - A.star) * t;
    this.sky.material.uniforms.time.value = this.time;
    this.hemi.color.copy(c('ambient')); this.hemi.groundColor.copy(c('ground'));
    this.hemi.intensity = A.ambientI + (B.ambientI - A.ambientI) * t;
    this.sun.color.copy(c('sun')); this.sun.intensity = A.sunI + (B.sunI - A.sunI) * t;
    this.ambient.setColor(c('accent'));
    for (const h of this.hills) h.material.color.copy(fog).lerp(c('skyTop'), h.userData.mix).multiplyScalar(0.93);
    this.dustColor = c('trim').offsetHSL(0, -0.1, -0.1).getHex();
    const idx = t > 0.5 ? (bi + 1) % BIOMES.length : bi % BIOMES.length;
    if (idx !== this.biomeIdx) { const mode = { hedge: [-0.5, 2.4, 0xb6d84a], stone: [0.12, 1.4, 0xffe3a6], crystal: [-0.35, 1.8, 0xffffff], lava: [0.55, 1.6, 0xff7a2a] }[BIOMES[idx].id]; this.ambient.setMode(mode[0], mode[1], mode[2]); this.biomeIdx = idx; this.ui.onBiome(BIOMES[idx], this.state === STATE.RUNNING && this.dist > 50); }
  }

  render(dt) {
    const p = this.player, cam = this.camera, st = this.state;
    const sn = clamp((this.speed - SPEED.start) / (SPEED.max - SPEED.start), 0, 1);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    let pos, look, fov = this.baseFov + sn * 9 + (p.flying ? 8 : 0);
    const tn = this.time;
    if (st === STATE.MENU || st === STATE.OVER) {
      const a = -0.6 + Math.sin(tn * 0.28) * 0.45;
      pos = new THREE.Vector3(Math.sin(a) * 3.3, 1.55 + Math.sin(tn * 0.2) * 0.12, 1.2 + Math.cos(a) * 3.1);
      look = new THREE.Vector3(0, 1.0, -0.2);
      fov = this.baseFov - 8;
      if (this.ui.portrait) { pos.set(Math.sin(a) * 5.6, 1.9, 1.4 + Math.cos(a) * 5.6); look.y = 1.05; fov = this.baseFov - 14; }
      else if (st === STATE.MENU && this.ui.wide) { pos.x -= 1.9; look.x -= 1.9; }
      else look.y = 1.25;
    } else {
      // in flight the camera rises and pitches down at the runner: the horizon moves up the screen and the coin ribbons above you stream through the sky
      const cy = 3.55 + p.y * 0.55;
      pos = new THREE.Vector3(p.x * 0.55, cy, 6.0 + p.y * 0.1);
      look = new THREE.Vector3(p.x * 0.3, 1.45 + p.y * 0.22, -10);
      if (this.baseFov > 66) { pos.y += 0.9; pos.z += 1.5; }
    }
    const k = damp(st === STATE.MENU || st === STATE.OVER ? 4 : st === STATE.COUNTDOWN ? 2.2 : 9, dt);
    cam.position.lerp(pos, k);
    this.lookAt = this.lookAt || look.clone(); this.lookAt.lerp(look, k);
    if (this.shake > 0) {
      const s = this.shake * 0.28;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.lookAt);
    cam.rotation.z += -p.laneLean * 0.035;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov += (fov - cam.fov) * damp(3, dt); cam.updateProjectionMatrix(); }

    // keep the shadow frustum glued to the player
    this.moon.position.set(-110, 190, -300);
    this.sky.position.copy(cam.position);
    for (const h of this.hills) { h.position.x = cam.position.x; h.position.z = cam.position.z; }
    this.composer.render(dt);
  }
}
