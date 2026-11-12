// Two-player co-op: lobby (room codes), match sync, buddy ghost, revives and shared missions.
// Both phones run the same seeded maze; this module only exchanges "where am I / how am I doing" messages.
import { COOP_MISSIONS, COOP_REWARD, COOP_ALL_BONUS } from './config.js';
import * as Store from './storage.js';
import * as Audio from './audio.js';
import { Net } from './net.js';
import { Ghost } from './ghost.js';
import { mulberry } from './world.js';

export class Coop {
  constructor(game, ui) {
    this.game = game; this.ui = ui; this.net = null; this.active = false;
    this.stage = 'idle'; this.code = ''; this.slot = 0; this.peer = null; this.error = '';
    this.reset();
  }

  reset() {
    this.partner = { alive: true, score: 0, dist: 0, stats: {}, gone: false };
    this.ghost = null; this.missions = []; this.reward = 0; this.allBonus = false; this.sendT = 0; this.stT = 0; this.heartT = 0; this.helpedHeart = null; this.checkT = 0;
  }

  // ---------------------------------------------------------------- lobby
  async openLobby() {
    this.error = ''; this.stage = 'connecting'; this.ui.lobby(this);
    try { await this.connect(); this.stage = 'idle'; } catch (e) { this.stage = 'idle'; this.error = e.message || 'Could not connect.'; }
    this.ui.lobby(this);
  }

  connect() {
    if (this.net && this.net.open) return Promise.resolve();
    this.net = new Net(); const n = this.net;
    n.on.created = (m) => { this.code = m.code; this.slot = 0; this.stage = 'waiting'; this.ui.lobby(this); };
    n.on.joined = (m) => { this.code = m.code; this.slot = 1; this.peer = m.peer; this.stage = 'ready'; this.ui.lobby(this); };
    n.on.peer = (m) => { this.peer = m.peer; this.stage = 'ready'; this.ui.lobby(this); };
    n.on.peerLeft = () => this.onPeerLeft();
    n.on.error = (m) => { this.error = m.msg || 'Something went wrong.'; if (this.stage === 'joining') this.stage = 'idle'; this.ui.lobby(this); };
    n.on.go = (m) => { this.game.playCoop(m.seed); };
    n.on.state = (m) => this.onState(m);
    n.on.event = (m) => this.onEvent(m);
    n.on.close = () => this.onClose();
    return n.connect();
  }

  me() { const s = Store.get(); return { name: s.settings.name || 'Runner', skin: s.skin }; }
  create() { this.error = ''; this.net.send({ t: 'create', ...this.me() }); }
  join(code) { this.error = ''; this.stage = 'joining'; this.ui.lobby(this); this.net.send({ t: 'join', code, ...this.me() }); }
  start() { if (this.slot === 0 && this.stage === 'ready') this.net.send({ t: 'start' }); }
  leave() { if (this.net) { this.net.send({ t: 'leave' }); this.net.close(); } this.net = null; this.stage = 'idle'; this.code = ''; this.peer = null; this.active = false; this.cleanupGhost(); }

  onPeerLeft() {
    if (this.active) {
      this.partner.gone = true; this.partner.alive = false; this.ui.toast('Your buddy left the match', 'warn');
      if (this.game.state === 'down') this.game.finishRun();
    } else { this.peer = null; this.stage = 'waiting'; this.slot = 0; this.ui.lobby(this); }
  }
  onClose() {
    if (this.active) { this.partner.gone = true; this.partner.alive = false; this.ui.toast('Connection lost: carrying on solo', 'warn'); if (this.game.state === 'down') this.game.finishRun(); }
    else if (this.stage !== 'idle') { this.stage = 'idle'; this.error = 'Disconnected from the game server.'; this.ui.lobby(this); }
  }

  // ---------------------------------------------------------------- match
  begin(seed) {
    this.reset(); this.active = true; this.stage = 'playing';
    // same missions on both phones: they come from the shared seed
    const r = mulberry((seed ^ 0xc0ffee) >>> 0), pool = [...COOP_MISSIONS];
    this.missions = [];
    for (let i = 0; i < 3; i++) {
      const t = pool.splice(Math.floor(r() * pool.length), 1)[0], goal = t.goals[Math.floor(r() * 2.99)];
      this.missions.push({ id: t.id, key: t.key, goal, text: t.text(goal), done: false, progress: 0 });
    }
    this.cleanupGhost();
    this.ghost = new Ghost(this.peer ? this.peer.name : 'Buddy', this.peer ? this.peer.skin : 'shadow', this.game.S);
    this.ui.coopBegin(this);
  }

  cleanupGhost() { if (this.ghost) { this.ghost.dispose(); this.ghost = null; } }

  ownStats() {
    const g = this.game, s = g.stats;
    return { c: g.runCoins | 0, j: s.jumps | 0, r: s.rolls | 0, d: Math.floor(g.dist), b: s.boulders | 0, h: s.helped | 0, p: s.powerups | 0, k: s.cars | 0 };
  }
  teamStat(key) {
    const own = key === 'sc' ? this.game.score : (this.ownStats()[key] || 0), other = key === 'sc' ? this.partner.score : (this.partner.stats[key] || 0);
    return own + other;
  }
  teamScore() { return this.game.score + (this.partner.gone ? 0 : this.partner.score); }

  /** Called every frame while a match is on (running, counting down, dying or down). */
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.sendT += dt; this.stT += dt;
    if (this.sendT >= 0.1) {
      this.sendT = 0; const p = g.player;
      const m = { t: 'state', s: +g.dist.toFixed(2), x: +p.x.toFixed(2), y: +p.y.toFixed(2), sp: +g.speed.toFixed(1), r: p.rollT > 0 ? 1 : 0, f: p.flying ? 1 : 0, c: p.car ? 1 : 0, a: p.dead ? 0 : 1, sc: Math.floor(g.score) };
      if (this.stT >= 0.5) { this.stT = 0; m.st = this.ownStats(); }
      this.net && this.net.send(m);
    }
    if (this.ghost) this.ghost.update(dt, g.world.track, g.dist);
    // hearts for a fallen buddy: one every ~90 m ahead until they are back on their feet
    if (!this.partner.alive && !this.partner.gone && g.state === 'running') {
      this.heartT -= dt;
      const live = g.world.pickups.some((q) => q.type === 'heart');
      if (this.heartT <= 0 && !live) { this.heartT = 1; g.spawnHeart(); }
    }
    this.checkT += dt;
    if (this.checkT >= 0.4) { this.checkT = 0; this.checkMissions(); }
    this.ui.coopHud(this);
  }

  onState(m) {
    const P = this.partner;
    if (this.ghost) this.ghost.receive(m);
    P.score = m.sc || 0; P.dist = m.s || 0; if (m.st) P.stats = m.st;
    const alive = !!m.a;
    if (alive !== P.alive) { P.alive = alive; if (!alive) this.onPartnerDown(); else this.ui.toast(`${this.ghost ? this.ghost.name : 'Buddy'} is back on their feet!`, 'mission'); }
  }

  onEvent(m) {
    if (m.kind === 'revive') this.game.coopRevive();                  // our buddy grabbed a heart for us
    else if (m.kind === 'dead') { this.partner.alive = false; this.onPartnerDown(); }
  }

  onPartnerDown() {
    const g = this.game;
    if (g.state === 'down') { g.finishRun(); return; }                // we were down too: that's the match
    if (g.state === 'dying') return;                                  // our own death resolves in stepDying
    this.ui.toast('Buddy is down! Grab the ❤ to revive them', 'warn'); Audio.sfx.growl(); this.heartT = 1.5;
  }

  /** The local player collected a heart. */
  onHeart() {
    if (!this.active || this.partner.alive || this.partner.gone) return;
    this.net && this.net.send({ t: 'event', kind: 'revive' });
    this.partner.alive = true; this.game.stats.helped = (this.game.stats.helped | 0) + 1;
    this.ui.toast('You revived your buddy!', 'mission'); Audio.sfx.power(); this.game.score += 500 * this.game.mult;
  }

  onLocalDeath() { this.net && this.net.send({ t: 'event', kind: 'dead' }); }

  checkMissions() {
    for (const ms of this.missions) {
      ms.progress = Math.min(ms.goal, Math.floor(this.teamStat(ms.key)));
      if (!ms.done && ms.progress >= ms.goal) {
        ms.done = true; this.reward += COOP_REWARD;
        const s = Store.get(); s.coins += COOP_REWARD; Store.save();
        this.ui.toast(`Team mission complete: ${ms.text}`, 'mission'); Audio.sfx.mission();
      }
    }
    if (!this.allBonus && this.missions.length && this.missions.every((x) => x.done)) {
      this.allBonus = true; this.reward += COOP_ALL_BONUS; const s = Store.get(); s.coins += COOP_ALL_BONUS; Store.save();
      this.ui.toast(`All team missions done! +${COOP_ALL_BONUS} coins`, 'mission');
    }
  }

  /** Final results for the team summary. */
  results() {
    this.checkMissions();
    const g = this.game;
    return {
      me: { name: this.me().name, score: Math.floor(g.score), dist: Math.floor(g.dist), coins: g.runCoins | 0 },
      buddy: { name: this.ghost ? this.ghost.name : 'Buddy', score: this.partner.score | 0, dist: Math.floor(this.partner.dist), coins: this.partner.stats.c | 0, gone: this.partner.gone },
      team: Math.floor(this.teamScore()), missions: this.missions.map((m) => ({ text: m.text, done: m.done, progress: m.progress, goal: m.goal })), reward: this.reward,
    };
  }

  /** Match is over for both: go back to the lobby, keeping the room. */
  end() {
    this.active = false; this.cleanupGhost(); this.net && this.net.send({ t: 'over' });
    this.stage = this.net && this.net.open && this.peer && !this.partner.gone ? 'ready' : (this.net && this.net.open ? 'waiting' : 'idle');
  }
}
