import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { BIOMES, BIOME_LEN, LANES, SPEED, POWERUPS, SKINS, PLAYER, CAR } from './config.js';
import * as Store from './storage.js';
import * as Audio from './audio.js';
import * as Missions from './missions.js';
import * as Tex from './textures.js';
import * as Models from './models.js';
import { World, mulberry } from './world.js';
import { Kaiju } from './kaiju.js';
import { CORNER_HALF } from './track.js';
import { Player } from './player.js';
import { Chaser } from './chaser.js';
import { Particles, Ambient, buildSky, makeLights, makeHills } from './fx.js';
import { buildFx, applyFxQuality } from './post.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export const STATE = { LOADING: 'loading', MENU: 'menu', COUNTDOWN: 'countdown', RUNNING: 'running', PAUSED: 'paused', DYING: 'dying', DOWN: 'down', OVER: 'over' };

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas; this.ui = ui;
    this.state = STATE.LOADING;
    this.time = 0; this.dist = 0; this.speed = 0;
    this.coop = null; this.split = false; this.opp = null; this.quality = 'high'; this.fpsAcc = 0; this.fpsN = 0; this.lowFpsT = 0;
  }

  // ------------------------------------------------------------------ setup
  async init(progress) {
    const save = Store.get();
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);
    this.isMobile = isMobile;

    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.84;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BIOMES[0].fog, BIOMES[0].fogDensity);
    scene.background = new THREE.Color(BIOMES[0].fog);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 520);
    this.camera.position.set(0, 4.3, 7.4);

    // lights
    const L = makeLights(scene); this.hemi = L.hemi; this.sun = L.sun; this.fill = L.fill;

    this.sky = buildSky(BIOMES[0].skyTop, BIOMES[0].skyBottom); scene.add(this.sky);
    this.sunDir = this.sky.material.uniforms.sunDir.value;

    // post-processing for the main view (a split screen builds a second chain for the opponent's view)
    this.fx = buildFx(renderer, scene, this.camera);
    this.composer = this.fx.composer; this.bloom = this.fx.bloom; this.rays = this.fx.rays; this.grade = this.fx.grade;

    // textures & materials
    await new Promise((r) => setTimeout(r, 30));
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const biomeMats = Tex.buildBiomeMaterials(BIOMES, Math.min(8, maxAniso), (p) => progress && progress(0.1 + p * 0.6));
    await new Promise((r) => setTimeout(r, 10));
    const glowTex = Tex.glowTexture();
    this.S = Models.makeSharedMaterials(glowTex, null);
    this.tex = { glow: glowTex, laneRune: Tex.laneRuneTexture(), coin: Tex.coinTexture(), signArrow: Tex.arrowTexture(true), floorArrow: Tex.arrowTexture(false), ...Tex.shadingTextures() };
    // image-based lighting: a PMREM of the daytime sky gives every PBR surface believable ambient light and sheen
    const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(), envSky = buildSky(0x5aa9ff, 0xf1f8ff);
    envSky.material.uniforms.time.value = 3; envScene.add(envSky);
    scene.environment = pm.fromScene(envScene, 0, 0.1, 1000).texture; scene.environmentIntensity = 0.38; pm.dispose();
    this.hills = makeHills(scene);
    this.stage = { scene, sky: this.sky, hemi: this.hemi, sun: this.sun, hills: this.hills };
    progress && progress(0.8);

    this.biomeMats = biomeMats;
    this.world = new World(scene, biomeMats, this.S, this.tex);
    this.kaiju = new Kaiju(this.world, this.S); this.kaijuRand = Math.random;
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
      high:   { pr: Math.min(dpr, 2), shadow: 2048, bloom: true, rays: true, shadows: true, samples: 4 },
      medium: { pr: Math.min(dpr, 1.5), shadow: 1024, bloom: true, rays: false, shadows: true, samples: 2 },
      low:    { pr: 1, shadow: 512, bloom: false, rays: false, shadows: true, samples: 0 },
    }[q];
    this.cfg = cfg;
    r.setPixelRatio(cfg.pr);
    r.shadowMap.enabled = cfg.shadows;
    if (this.sun.shadow.mapSize.x !== cfg.shadow) {
      this.sun.shadow.mapSize.set(cfg.shadow, cfg.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    applyFxQuality(this.fx, this.split ? { ...cfg, rays: false } : cfg);
    if (this.opp) this.opp.applyQuality(cfg);
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight, split = this.split, hh = split ? Math.floor(h / 2) : h;
    const pr = split ? Math.min(this.cfg.pr, 1.5) : this.cfg.pr;                  // two views on one screen: keep the pixel count in check
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr); this.composer.setSize(w, hh);
    const aspect = w / hh;
    this.camera.aspect = aspect;
    // narrow portrait screens need a wider vertical FOV to keep all three lanes in view; split strips are fitted to a ~80 degree horizontal FOV
    this.baseFov = split ? clamp((2 * Math.atan(Math.tan(0.7) / aspect) * 180) / Math.PI, 42, 78) : aspect < 0.8 ? 80 : aspect < 1.2 ? 70 : 62;
    this.camera.updateProjectionMatrix();
    const bufH = hh * pr;
    this.grade.uniforms.res.value.set(w * pr, bufH);
    this.particles && this.particles.setScale(bufH); this.ambient && this.ambient.setScale(bufH);
    if (this.opp) this.opp.resize(w, hh, pr, this.baseFov);
  }

  /** Turn the horizontal split screen (me below, the opponent above) on or off. */
  setSplit(on, opp = null) {
    if (!on && this.opp) { this.opp.dispose(); this.opp = null; }
    this.split = on; if (on) this.opp = opp;
    document.body.classList.toggle('split', on);
    if (this.fx) applyFxQuality(this.fx, on ? { ...this.cfg, rays: false } : this.cfg);
    this.resize();
  }

  // ------------------------------------------------------------------ run lifecycle
  resetRun(clearWorld = true, seed) {
    const save = Store.get();
    this.dist = 0; this.speed = 0; this.baseSpeed = SPEED.start; this.slowT = 0;
    this.score = 0; this.runCoins = 0; this.banked = 0;
    this.runTime = 0; this.boulderT = 24 + Math.random() * 14; this.boulder = null; this.rumbleT = 0; this.boulderDust = 0;
    this.kaiju.dispose(); this.kaijuRand = seed != null ? mulberry((seed ^ 0x6d2b79f5) >>> 0) : Math.random; this.kaijuT = 50 + this.kaijuRand() * 20;
    this.stats = { distance: 0, coins: 0, jumps: 0, rolls: 0, powerups: 0, lanes: 0, climbs: 0, score: 0, boulders: 0, helped: 0, cars: 0 };
    this.timers = { magnet: 0, double: 0, boots: 0, wings: 0, jetpack: 0, car: 0 }; this.shield = false;
    this.carOffer = null; this.nextCarAt = CAR.score; this.realmTarget = 0; this.realm = this.realm || 0; Audio.engine(false); Audio.setMood('normal');
    this.flyWarn = false; this.revives = 0; this.shake = 0; this.notified = new Set();
    this.dustT = 0; this.stepT = 0; this.growlT = 6;
    this.world.reset(seed ?? ((Math.random() * 1e9) | 0), 0);
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

  /** Start a two-player match on the shared maze seed handed out by the server. */
  playCoop(seed) {
    Audio.unlock(); Audio.startMusic();
    this.resetRun(true, seed); this.autoTurn = false;
    this.player.idle = false;
    this.state = STATE.COUNTDOWN; this.countT = 0; this.countShown = 4;
    this.ui.onPlay();
    this.coop.begin(seed);
  }

  beginRun() {
    this.state = STATE.RUNNING; this.speed = this.baseSpeed;
    Audio.sfx.go();
    this.ui.countdown('RUN!', true);
    const first = !Store.get().settings.tutorialDone;
    if (first) { this.ui.showTutorial(); Store.get().settings.tutorialDone = true; Store.save(); }
  }

  pause() {
    if (this.state !== STATE.RUNNING || (this.coop && this.coop.active)) return;          // a shared match can't be paused
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
  action(a, src) {
    if (a === 'confirm') return this.ui.onConfirm && this.ui.onConfirm();
    if (a === 'pause') {
      if (this.state === STATE.RUNNING) this.pause(); else if (this.state === STATE.PAUSED) this.resume();
      return;
    }
    if (this.state === STATE.MENU && a === 'touch') return;
    if (this.state !== STATE.RUNNING && this.state !== STATE.COUNTDOWN) return;
    const p = this.player;
    if (p.car) {                                                                    // driving: swipes steer by dragging; taps/keys nudge; up = nitro, down = horn
      if (a === 'left' || a === 'right') { if (src !== 'swipe') p.carX += a === 'left' ? -1.6 : 1.6; }
      else if (a === 'jump' && p.nitroCd <= 0) { p.nitro = CAR.nitroTime; p.nitroCd = CAR.nitroCooldown; Audio.sfx.nitro(); this.shake = Math.max(this.shake, 0.3); this.ui.toast('NITRO!', 'power', '#ffb400'); }
      else if (a === 'roll') Audio.sfx.horn();
      return;
    }
    if ((a === 'left' || a === 'right') && this.state === STATE.RUNNING) {          // at a corner, swiping the way the arrow points turns
      const c = this.world.track.nextCorner(this.dist);
      if (c && !c.executed && c.s - this.dist < 22 && this.dist < c.s + 3.2 && a === (c.dir > 0 ? 'left' : 'right')) { c.accepted = true; return; }
    }
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
    this.stepInner(dt);
    if (this.coop && this.coop.active && this.state !== STATE.PAUSED) { this.coop.update(dt); if (this.opp) this.opp.update(dt, this.time); }
  }

  stepInner(dt) {
    const st = this.state;
    if (st === STATE.PAUSED || st === STATE.LOADING) return;
    if (st === STATE.MENU || st === STATE.OVER || st === STATE.DOWN) {
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
    if (p.car) target *= CAR.speedMul * (p.nitro > 0 ? CAR.nitroMul : 1);
    this.speed += (target - this.speed) * damp(5, dt);
    const sp = this.speed, prev = this.dist;
    this.dist += sp * dt; this.runTime += dt;

    // power-up timers
    const T = this.timers;
    for (const k of Object.keys(T)) if (T[k] > 0) { T[k] = Math.max(0, T[k] - dt); }
    p.boots = T.boots > 0;
    if (p.car) {
      const inp = this.input;
      if (inp) p.carX += inp.axis() * dt * 9 + inp.takeDrag() * 0.028;
      p.carX = clamp(p.carX, -3.15, 3.15);
      Audio.engineSpeed(sp, p.nitro > 0);
      if (T.car <= 0) this.endCar();
    }
    if (p.flying && T.wings <= 0 && T.jetpack <= 0) this.endFlight();
    const flyT = Math.max(T.wings, T.jetpack);
    this.flyWarn = flyT > 0 && flyT < 1.5;
    p.setEffects({ shield: this.shield, wings: T.wings > 0, jetpack: T.jetpack > 0, boots: T.boots > 0, magnet: T.magnet > 0 });
    this.mult = (1 + Store.get().rank) * (T.double > 0 ? 2 : 1);

    const res = p.update(dt, this.dist, sp, w);
    for (const e of res.events) this.onPlayerEvent(e);
    this.handleHits(res.hits);
    if (this.state !== STATE.RUNNING) return;

    this.updateCorners();
    this.collect(prev, dt);
    this.updateCarOffer();
    this.chaser.update(dt, sp, p.x);
    this.growlT -= dt;
    if (this.chaser.isNear && this.growlT <= 0) { Audio.sfx.growl(); this.growlT = 2.2; }

    // score
    this.score += sp * dt * this.mult;
    this.stats.distance = this.dist; this.stats.score = this.score;

    w.targetX = p.x;
    this.updateBoulder(dt, sp); this.updateKaiju(dt, sp);
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
    if (p.car) { for (const h of hits) if (h.sd.type !== 'flame') this.carSmash(h.sd); return; }               // the car is fireproof
    for (const h of hits) {
      const sd = h.sd;
      if (sd.ghost || sd.ignore) continue;
      if (p.invuln > 0 && h.kind === 'front') continue;
      if (this.shield) { this.breakShield(sd); return; }
      if (sd.type === 'boulder') { this.die('boulder'); return; }
      if (sd.type === 'flame') { this.die('burned'); return; }
      if (sd.isCornerWall) { this.die('turn'); return; }
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

  /** Corners: execute accepted turns, auto-turn while flying, and never leave the camera facing a wall. */
  updateCorners() {
    const T = this.world.track, p = this.player, c = T.nextCorner(this.dist);
    if (!c || c.executed) return;
    const auto = p.flying || p.car || this.autoTurn;
    if ((c.accepted || auto) && this.dist >= c.s - 1.5) this.doTurn(c);
    else if (this.dist > c.s + 3.2) this.doTurn(c);                                // safety net (shield, invulnerability)
  }

  doTurn(c) {
    this.world.track.execute(c);
    Audio.sfx.turn(); this.shake = Math.max(this.shake, 0.18);
    this.stats.turns = (this.stats.turns || 0) + 1;
    this.particles.burst(this.player.x, 0.4, 0, 14, this.dustColor || 0xaa9988, 4, 0.5, 0.3, 2);
  }

  /**
   * Godzilla: now and then it rises in the corridor far ahead, charges, and breathes two waves of blue fire down two of the three
   * lanes each. Jump the low flames or take the free lane. Waits for a long straight so it never meets a corner.
   */
  updateKaiju(dt, sp) {
    const K = this.kaiju, p = this.player, R = this.kaijuRand;
    if (K.live) { K.update(dt, this); return; }
    this.kaijuT -= dt;
    if (this.kaijuT > 0 || this.state !== STATE.RUNNING || p.flying || p.car || this.boulder || this.dist < 400) return;
    const T = this.world.track, s = this.dist + 170, leg = T.legAt(s);
    if (leg !== T.legAt(this.dist) || leg.b - CORNER_HALF - 14 < s + 60) { this.kaijuT = 1.5; return; }        // need a long straight run
    const cur = p.target, pick = (a) => a[Math.floor(R() * a.length)];
    const f1 = pick([0, 1, 2].filter((l) => l !== cur)), f2 = f1 === 1 ? pick([0, 2]) : 1;                   // wave 1 burns your lane; wave 2 forces one more step
    const burn = (f) => [0, 1, 2].filter((l) => l !== f);
    K.spawn(s, [burn(f1), burn(f2)], Audio.sfx);
    this.kaijuT = 60 + R() * 35 - clamp(this.dist / 6000, 0, 1) * 20;
  }

  /** Random, homing boulder: warns, rolls toward the player's lane, locks on late, flattens anything in its way. */
  updateBoulder(dt, sp) {
    const p = this.player, w = this.world;
    this.boulderT -= dt;
    const spawnS = this.dist + 80 + sp * 1.5, cornerNear = this.world.track.corners.some((c) => !c.executed && c.s < spawnS + 16 && c.s + 8 > this.dist - 4);
    if (this.boulderT <= 0 && !p.flying && !this.boulder && !this.kaiju.live && !cornerNear && this.dist > 300 && this.state === STATE.RUNNING) {
      const diff = clamp(this.dist / 6000, 0, 1);
      this.boulder = w.addBoulder(p.target, spawnS, 13 + diff * 7);
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
      b.counted = true; this.score += 250 * this.mult; this.stats.boulders++;
      this.ui.toast('Boulder dodged! +250', 'mission');
    }
    if (b.s1 < this.dist - 20 || b.ghost) this.boulder = null;
  }

  breakShield(sd) {
    this.shield = false; this.player.invuln = 1.6; this.player.flash = 0.25;
    this.world.smash(sd);
    if (sd.isCornerWall) this.doTurn(sd.corner);
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
    if (this.coop && this.coop.active) this.coop.onLocalDeath();
    if (cause === 'caught') { this.chaser.state = 'catch'; this.chaser.catchT = 0; Audio.sfx.roar(); }
    Audio.sfx.crash();
    this.ui.flash('rgba(255,20,40,0.5)');
    Audio.duck(true);
    this.particles.burst(this.player.x, 1, 0, 40, cause === 'burned' ? 0x4aa6ff : 0xff7a3d, 7, 0.9, 0.25);
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
    if (this.deathT > 1.5) {
      const co = this.coop;
      if (co && co.active && co.partner.alive && !co.partner.gone) { this.state = STATE.DOWN; this.ui.showDown(true, co.oppName()); }     // out, but the match goes on: watch the rival
      else this.finishRun();
    }
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
    if (this.coop && this.coop.active) { this.ui.showDown(false); this.ui.showCoopOver({ ...this.coop.results(), newBest, missionsSolo: m }); this.coop.end(); return; }
    this.ui.showGameOver({
      score: Math.floor(this.score), best: save.best, newBest, distance: Math.floor(this.dist), coins: this.runCoins,
      cause: this.cause, missions: m, canRevive: this.revives < 3, reviveCost: this.reviveCost(), wallet: save.coins,
    });
  }

  reviveCost() { return 50 * Math.pow(2, this.revives); }

  revive(opts = {}) {
    const save = Store.get(), cost = this.reviveCost();
    if (!opts.free) {
      if (this.revives >= 3 || save.coins < cost) { Audio.sfx.deny(); return false; }
      save.coins -= cost; Store.save(); Audio.sfx.buy();
    }
    this.revives++;
    const p = this.player;
    p.dead = false; p.caught = false; p.model.rotation.set(0, 0, 0); p.model.position.set(0, 0, 0); p.rollT = 0; p.vy = 0;
    p.stumbleT = 0; p.invuln = 3; p.y = 0; p.lane = p.target = 1; p.prevLane = 1; p.x = LANES[1]; p.grounded = true; p.flash = 0;
    this.chaser.state = 'far'; this.chaser.nearT = 0; this.chaser.z = 14;
    this.world.clearRange(this.dist - 6, this.dist + 70); this.world.track.forceTurns(this.dist + 70);
    if (!(this.coop && this.coop.active)) { this.world.path = 1; this.world.busy = [-1e9, -1e9, -1e9]; this.world.prevOcc = [true, true, true]; }
    this.baseSpeed = Math.max(SPEED.start, this.baseSpeed * 0.85); this.speed = 0; this.slowT = 0;
    this.state = STATE.COUNTDOWN; this.countT = 0; this.countShown = 4; this.resuming = true;
    Audio.duck(false);
    this.ui.onRevive();
    return true;
  }

  // ------------------------------------------------------------------ collectibles
  collect(prevDist, dt) {
    const p = this.player, w = this.world, T = this.timers;
    const cy = p.y + (p.car ? 0.7 : p.rollT > 0 ? 0.4 : 0.95);
    const magnet = T.magnet > 0 || p.flying || p.car;
    if (magnet) {
      for (const c of w.coins) {
        const ds = c.s - this.dist;
        if (ds > -2 && ds < 22 && Math.abs(c.x - p.x) < (p.flying ? 3.4 : p.car ? 4.5 : 9) && (!p.flying || Math.abs(c.y - cy) < 5)) {
          const k = damp(p.flying ? 5 : 7, dt);
          c.x += (p.x - c.x) * k; c.y += (cy - c.y) * k; c.s += (this.dist + 0.2 - c.s) * k * 0.9;
        }
      }
    }
    const coins = w.coins;
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (c.s < prevDist - 0.6 || c.s > this.dist + 0.7) continue;
      if (Math.abs(c.x - p.x) < (p.flying ? 1.7 : p.car ? 1.35 : 0.85) && Math.abs(c.y - cy) < (p.flying ? 3.6 : 1.15)) {
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
      if (Math.abs(q.x - p.x) < (q.type === 'car' ? 1.9 : 1.2) && Math.abs(q.y - cy) < 1.6) {
        q.group.removeFromParent(); pk.splice(i, 1);
        this.grant(q.type, q.x, q.y);
      }
    }
  }

  /** Offer the bonus car once the (team) score passes the threshold: a car pick-up appears ahead in your lane. */
  updateCarOffer() {
    const p = this.player, w = this.world, score = this.score;
    if (this.carOffer && (!w.pickups.includes(this.carOffer) || this.carOffer.s < this.dist - 6)) {            // taken, or driven past
      if (!p.car) { this.nextCarAt = score + 5000; this.ui.toast('You missed the car… another one is coming', 'warn'); }
      this.carOffer = null;
    }
    if (p.car || p.flying || this.carOffer || score < this.nextCarAt) return;
    let s = this.dist + 75;
    if (w.track.corners.some((c) => Math.abs(c.s - s) < 22)) s += 50;
    w.addPickup('car', p.target, s, 1.1); this.carOffer = w.pickups[w.pickups.length - 1];
    this.ui.toast('🚗 A BONUS CAR! Drive it for 1 minute', 'power', '#ff4a5e'); Audio.sfx.horn();
  }

  startCar() {
    const p = this.player;
    p.setCar(true); p.flying = false; this.world.flying = false; p.rollT = 0;
    this.timers.car = CAR.time; this.timers.wings = this.timers.jetpack = 0;
    this.stats.cars = (this.stats.cars | 0) + 1; this.chaser.reset();
    this.realmTarget = 1; Audio.setMood('retro'); Audio.engine(true); Audio.sfx.horn();
    this.particles.burst(p.x, 0.8, 0, 36, 0xffd23f, 6, 0.8, 0.25, 2); this.shake = Math.max(this.shake, 0.5);
    this.ui.flash('rgba(255,210,80,0.35)'); this.ui.toast('Steer: hold ← → or drag · ↑ nitro · everything in your way gets smashed', 'power', '#ff4a5e');
  }

  endCar() {
    const p = this.player;
    if (!p.car) return;
    this.timers.car = 0; p.setCar(false); p.invuln = 2.5;
    this.realmTarget = 0; Audio.setMood('normal'); Audio.engine(false); Audio.sfx.skid();
    this.runCoins += CAR.bonusCoins; this.stats.coins = this.runCoins; this.nextCarAt = Math.max(this.nextCarAt, this.score + CAR.repeat);
    this.particles.burst(p.x, 0.6, 0, 30, 0xbbbbbb, 4, 1.0, 0.4, 0);
    this.ui.toast(`Out of fuel! +${CAR.bonusCoins} coins`, 'mission'); this.shake = Math.max(this.shake, 0.4);
  }

  /** The car ploughs through whatever it hits. */
  carSmash(sd) {
    if (sd.ghost || sd.isCornerWall) return;
    this.world.smash(sd);
    const boulder = sd.type === 'boulder';
    this.score += (boulder ? 400 : sd.type === 'block' ? 90 : 60) * this.mult;
    Audio.sfx.smash(); this.shake = Math.max(this.shake, boulder ? 0.6 : 0.3);
    this.particles.burst(sd.x, 0.9, 0, boulder ? 40 : 22, boulder ? 0x8a7a6a : 0xffb347, 6, 0.8, 0.28, 8);
    this.stats.smashed = (this.stats.smashed | 0) + 1;
  }

  grant(type, x, y) {
    if (type === 'car') { this.carOffer = null; this.startCar(); return; }
    if ((type === 'wings' || type === 'jetpack') && this.player.car) { this.score += 400 * this.mult; this.ui.toast('Already flying… on four wheels!', 'power', '#ffb400'); return; }
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
  /** The look of the world at track position `dist` (biomes blend into one another; R pulls it toward the Hollow Realm). */
  atmosphereAt(dist, R) {
    const bi = Math.floor((dist + 40) / BIOME_LEN), nb = (bi + 1) * BIOME_LEN, t = smooth(nb - 230, nb - 40, dist);
    const A = BIOMES[bi % BIOMES.length], B = BIOMES[(bi + 1) % BIOMES.length];
    const hi = this.hollowIdx ?? (this.hollowIdx = BIOMES.findIndex((x) => x.id === 'hollow')), H = BIOMES[hi];
    const col = (k) => { const c = new THREE.Color(A[k]).lerp(new THREE.Color(B[k]), t); return R > 0.001 ? c.lerp(new THREE.Color(H[k]), R) : c; };
    const num = (k) => { const v = A[k] + (B[k] - A[k]) * t; return v + (H[k] - v) * R; };
    return {
      bi, t, hi, idx: t > 0.5 ? (bi + 1) % BIOMES.length : bi % BIOMES.length,
      fog: col('fog'), density: num('fogDensity'), skyTop: col('skyTop'), skyBottom: col('skyBottom'), stars: A.star + (B.star - A.star) * t,
      ambient: col('ambient'), ground: col('ground'), ambientI: num('ambientI'), sun: col('sun'), sunI: num('sunI'), accent: col('accent'), trim: col('trim'),
    };
  }

  /** Paint an atmosphere onto one view (`st` = { scene, sky, hemi, sun, hills }). */
  applyAtmosphere(st, a, time) {
    st.scene.fog.color.copy(a.fog); st.scene.background.copy(a.fog); st.scene.fog.density = a.density;
    const u = st.sky.material.uniforms; u.top.value.copy(a.skyTop); u.bottom.value.copy(a.skyBottom); u.stars.value = a.stars; u.time.value = time;
    st.hemi.color.copy(a.ambient); st.hemi.groundColor.copy(a.ground); st.hemi.intensity = a.ambientI;
    st.sun.color.copy(a.sun); st.sun.intensity = a.sunI;
    for (const h of st.hills) h.material.color.copy(a.fog).lerp(a.skyTop, h.userData.mix).multiplyScalar(0.93);
  }

  updateAtmosphere(dt) {
    // the bonus car pulls the whole world into the Hollow Realm: eerie sky, tinted stone, lightning, synth-wave
    this.realm = this.realm || 0; this.realmTarget = this.realmTarget || 0;
    this.realm += (this.realmTarget - this.realm) * damp(1.1, dt); if (Math.abs(this.realmTarget - this.realm) < 0.002) this.realm = this.realmTarget;
    const R = this.realm, a = this.atmosphereAt(this.dist, R);
    this.applyAtmosphere(this.stage, a, this.time);
    this.ambient.setColor(a.accent);
    this.dustColor = a.trim.clone().offsetHSL(0, -0.1, -0.1).getHex();
    // stone, hedges and floors take a purple cast while the realm is up
    if (Math.abs(R - (this.tintApplied ?? -1)) > 0.01) {
      this.tintApplied = R; const tint = new THREE.Color(0x8a6aa6);
      this.tintMats = this.tintMats || Object.values(this.world.BM).flatMap((m) => [m.wall, m.floor, m.trim]);
      const mul = new THREE.Color(1, 1, 1).lerp(tint, R * 0.5);
      for (const m of this.tintMats) { if (!m.userData.baseColor) m.userData.baseColor = m.color.clone(); m.color.copy(m.userData.baseColor).multiply(mul); }
    }
    const idx = a.idx;
    if (idx !== this.biomeIdx) { this.biomeIdx = idx; this.ui.onBiome(BIOMES[idx], this.state === STATE.RUNNING && this.dist > 50); }
    const modeIdx = R > 0.5 ? a.hi : idx;
    if (modeIdx !== this.modeIdx) { this.modeIdx = modeIdx; const mode = BIOMES[modeIdx].mode; this.ambient.setMode(mode[0], mode[1], mode[2]); }
    // storm: flickering light and the odd lightning strike (in the Hollow Realm and during the car ride)
    const storm = R > 0.3 || BIOMES[idx].storm;
    this.lightT = this.lightT ?? 4; this.lightning = this.lightning || 0;
    if (storm && this.state === STATE.RUNNING) {
      this.lightT -= dt;
      if (this.lightT <= 0) { this.lightT = 2.5 + Math.random() * 5.5; this.lightning = 1; this.ui.flash('rgba(235,225,255,0.38)'); setTimeout(() => Audio.sfx.thunder(), 250 + Math.random() * 500); }
    }
    this.lightning = Math.max(0, this.lightning - dt * 3.2);
    if (this.lightning > 0) { this.hemi.intensity += this.lightning * 2.4; this.sun.intensity += this.lightning * 3; this.scene.fog.color.lerp(new THREE.Color(0xffffff), this.lightning * 0.35); this.scene.background.copy(this.scene.fog.color); }
    if (storm) this.hemi.intensity *= 0.9 + 0.1 * Math.sin(this.time * 31) * Math.sin(this.time * 5.7);
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
    const bank = this.world.track.thetaTarget - this.world.track.theta; p.bank = bank;
    cam.rotation.z += -p.laneLean * 0.035 + clamp(bank, -1.2, 1.2) * 0.05;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov += (fov - cam.fov) * damp(3, dt); cam.updateProjectionMatrix(); }

    // keep the shadow frustum glued to the player
    this.sky.position.copy(cam.position);
    this.grade.uniforms.time.value = this.time % 100;
    if (this.cfg.rays) {                                                               // project the sun to drive the god rays
      const v = this.tmpSun || (this.tmpSun = new THREE.Vector3());
      v.copy(this.sunDir).multiplyScalar(400).add(cam.position).project(cam);
      const vis = v.z < 1 ? clamp(1.7 - Math.max(Math.abs(v.x), Math.abs(v.y)), 0, 1) : 0;
      this.rays.uniforms.sun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5); this.rays.uniforms.intensity.value = 0.14 * vis;
    }
    for (const h of this.hills) { h.position.x = cam.position.x; h.position.z = cam.position.z; }
    if (this.split && this.opp) {
      const rd = this.renderer, w = innerWidth, h = innerHeight, hh = Math.floor(h / 2);
      rd.setScissorTest(true);
      rd.setViewport(0, h - hh, w, hh); rd.setScissor(0, h - hh, w, hh); this.opp.render(dt);       // top half: the opponent's run
      rd.setViewport(0, 0, w, hh); rd.setScissor(0, 0, w, hh); this.composer.render(dt);             // bottom half: my run
      rd.setScissorTest(false); rd.setViewport(0, 0, w, h);
    } else this.composer.render(dt);
  }
}
