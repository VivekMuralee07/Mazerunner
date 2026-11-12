// Two-player versus: lobby (room codes), match sync, the opponent's live split-screen half and first-to missions.
// Both phones run the same seeded maze and each runner plays on their own; this module only exchanges "where am I / how am I doing" messages.
// Whoever lasts longer wins. A player who goes down is out but the other keeps running.
import { COOP_MISSIONS, COOP_REWARD, COOP_ALL_BONUS } from './config.js';
import * as Store from './storage.js';
import * as Audio from './audio.js';
import { Net } from './net.js';
import { OpponentView } from './split.js';
import { mulberry } from './world.js';

export class Coop {
  constructor(game, ui) {
    this.game = game; this.ui = ui; this.net = null; this.active = false;
    this.stage = 'idle'; this.code = ''; this.slot = 0; this.peer = null; this.error = '';
    this.reset();
  }

  reset() {
    this.partner = { alive: true, score: 0, dist: 0, stats: {}, gone: false, away: false, fin: null };
    this.opp = null; this.iWantRematch = false; this.rivalWantsRematch = false; this.forfeit = false; this.reconnecting = false; this.missions = []; this.reward = 0; this.sendT = 0; this.stT = 0; this.checkT = 0; this.myFin = null; this.matchBonus = 0;
  }

  // ---------------------------------------------------------------- lobby
  async openLobby() {
    this.error = ''; this.stage = 'connecting'; this.ui.lobby(this);
    try { await this.connect(); this.stage = 'idle'; } catch (e) { this.stage = 'idle'; this.error = e.message || 'Could not connect.'; }
    this.ui.lobby(this);
  }

  connect() {
    if (this.net && this.net.open) return Promise.resolve();
    this.net = new Net(); this.wire(this.net);
    return this.net.connect();
  }

  wire(n) {
    n.on.created = (m) => { this.code = m.code; this.sid = m.sid; this.slot = 0; this.stage = 'waiting'; this.ui.lobby(this); };
    n.on.joined = (m) => { this.code = m.code; this.sid = m.sid; this.slot = 1; this.peer = m.peer; this.stage = 'ready'; this.ui.lobby(this); };
    n.on.peer = (m) => { this.peer = m.peer; this.stage = 'ready'; this.ui.lobby(this); };
    n.on.peerLeft = () => this.onPeerLeft();
    n.on.peerAway = (m) => { this.partner.away = true; this.ui.toast(`${this.oppName()} lost connection: waiting up to ${Math.round((m.ms || 15000) / 1000)} s…`, 'warn', undefined, 3000); };
    n.on.peerBack = () => { this.partner.away = false; this.ui.toast(`${this.oppName()} is back!`, 'mission', undefined, 3000); this.resendFinal(); };
    n.on.rejoined = (m) => this.onRejoined(m);
    n.on.rematch = () => { this.rivalWantsRematch = true; this.ui.rematchState(this); };
    n.on.error = (m) => { this.error = m.msg || 'Something went wrong.'; if (m.fatal) this.reconnecting = false; if (this.stage === 'joining') this.stage = 'idle'; this.ui.lobby(this); };
    n.on.go = (m) => { this.game.playCoop(m.seed); };
    n.on.state = (m) => this.onState(m);
    n.on.event = (m) => this.onEvent(m);
    n.on.close = () => this.onClose(n);
  }

  me() { const s = Store.get(); return { name: s.settings.name || 'Runner', skin: s.skin }; }
  create() { this.error = ''; this.net.send({ t: 'create', ...this.me() }); }
  join(code) { this.error = ''; this.stage = 'joining'; this.ui.lobby(this); this.net.send({ t: 'join', code, ...this.me() }); }
  start() { if (this.slot === 0 && this.stage === 'ready') this.net.send({ t: 'start' }); }
  /** Ask for another match with the same rival (it starts when both have asked). */
  rematch() { if (!this.net || !this.net.open) return; this.iWantRematch = true; this.net.send({ t: 'rematch' }); this.ui.rematchState(this); }
  leave() { if (this.net) { this.net.send({ t: 'leave' }); this.net.close(); } this.net = null; this.stage = 'idle'; this.code = ''; this.peer = null; this.active = false; this.reconnecting = false; this.cleanupOpp(); }

  onPeerLeft() {
    if (this.active) {
      this.partner.gone = true; this.partner.alive = false; this.ui.toast('Your opponent left: you win if you last', 'warn');
      if (this.game.state === 'down') this.game.finishRun();
    } else { this.peer = null; this.stage = 'waiting'; this.slot = 0; this.ui.lobby(this); }
  }
  onClose(n) {
    if (n !== this.net) return;                                                          // an old socket
    if (this.active) { this.net.open = false; this.startReconnect(); }
    else if (this.stage !== 'idle') { this.stage = 'idle'; this.error = 'Disconnected from the game server.'; this.ui.lobby(this); }
  }

  /** The phone lost its connection mid-match: keep playing locally and try to take the slot back for 15 s. */
  startReconnect() {
    if (this.reconnecting || !this.sid) { if (!this.sid) this.giveUp(); return; }
    this.reconnecting = true; const t0 = performance.now();
    this.ui.toast('Connection lost: reconnecting…', 'warn', undefined, 3000);
    const attempt = async () => {
      if (!this.reconnecting || !this.active) return;
      if (performance.now() - t0 > 14000) return this.giveUp();
      const n = new Net(); this.wire(n); const old = this.net; this.net = n;
      try { await n.connect(); n.send({ t: 'rejoin', code: this.code, sid: this.sid }); } catch { n.close(); this.net = old; setTimeout(attempt, 1200); return; }
      old && old.close();
      setTimeout(() => { if (this.reconnecting && this.net === n && this.active) { n.close(); this.net = old; attempt(); } }, 4000);      // no "rejoined" answer: try again
    };
    attempt();
  }

  giveUp() {
    this.reconnecting = false; this.forfeit = true;
    this.ui.toast('Could not reconnect: the match is lost', 'warn', undefined, 3000);
    if (this.game.state === 'down') this.game.finishRun();
  }

  onRejoined(m) {
    this.reconnecting = false; if (m.peer) this.peer = m.peer;
    this.ui.toast('Reconnected!', 'mission', undefined, 3000); this.sendT = 1; this.resendFinal();
  }

  /** After a reconnect, say again that we are out (the message may have been lost with the connection). */
  resendFinal() {
    const f = this.myFin; if (!f || !this.net) return;
    this.net.send({ t: 'event', kind: 'dead', rt: +f.t.toFixed(2), sc: f.score, d: f.dist, c: f.coins });
  }

  // ---------------------------------------------------------------- match
  begin(seed) {
    this.reset(); this.active = true; this.stage = 'playing';
    // same missions on both phones: they come from the shared seed
    const r = mulberry((seed ^ 0xc0ffee) >>> 0), pool = [...COOP_MISSIONS];
    this.missions = [];
    for (let i = 0; i < 3; i++) {
      const t = pool.splice(Math.floor(r() * pool.length), 1)[0], goal = t.goals[Math.floor(r() * 2.99)];
      this.missions.push({ id: t.id, key: t.key, goal, text: t.text(goal), done: false, progress: 0, owner: null, pendingAt: 0 });
    }
    this.cleanupOpp();
    this.opp = new OpponentView(this.game, seed, this.peer ? this.peer.name : 'Rival', this.peer ? this.peer.skin : 'shadow');
    this.game.setSplit(true, this.opp);
    this.ui.coopBegin(this);
  }

  cleanupOpp() { this.opp = null; if (this.game.split) this.game.setSplit(false); }
  oppName() { return this.opp ? this.opp.runner.name : (this.peer ? this.peer.name : 'Rival'); }

  ownStats() {
    const g = this.game, s = g.stats;
    return { c: g.runCoins | 0, j: s.jumps | 0, r: s.rolls | 0, d: Math.floor(g.dist), b: s.boulders | 0, h: s.helped | 0, p: s.powerups | 0, k: s.cars | 0 };
  }
  stat(key) { return key === 'sc' ? Math.floor(this.game.score) : (this.ownStats()[key] || 0); }

  /** Called every frame while a match is on (running, counting down, dying or down). */
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.sendT += dt; this.stT += dt;
    if (this.sendT >= 0.1) {
      this.sendT = 0; const p = g.player;
      const m = { t: 'state', s: +g.dist.toFixed(2), x: +p.x.toFixed(2), y: +p.y.toFixed(2), sp: +g.speed.toFixed(1), r: p.rollT > 0 ? 1 : 0, f: p.flying ? 1 : 0, c: p.car ? 1 : 0, a: p.dead ? 0 : 1, sc: Math.floor(g.score), mu: g.mult };
      if (this.stT >= 0.5) { this.stT = 0; m.st = this.ownStats(); }
      this.net && this.net.send(m);
    }
    this.checkT += dt;
    if (this.checkT >= 0.25) { this.checkT = 0; this.checkMissions(); }
    this.ui.coopHud(this);
  }

  onState(m) {
    const P = this.partner;
    if (this.opp) { this.opp.receive(m); this.opp.mult = m.mu || 1; }
    P.score = m.sc || 0; P.dist = m.s || 0; if (m.st) P.stats = m.st;
  }

  onEvent(m) {
    if (m.kind === 'dead') this.onOpponentDown(m);
    else if (m.kind === 'claim') this.onClaim(m);
    else if (m.kind === 'kaiju' && this.opp) this.opp.spawnKaiju(+m.s, m.plan);
  }

  onOpponentDown(m) {
    const P = this.partner, g = this.game;
    if (!P.alive) return;
    P.alive = false; P.fin = { t: +m.rt || 0, score: m.sc | 0, dist: m.d | 0, coins: m.c | 0 };
    P.score = Math.max(P.score, P.fin.score); P.dist = Math.max(P.dist, P.fin.dist);
    if (g.state === 'down') { g.finishRun(); return; }                 // we were out too: the match is over
    if (g.state === 'dying') return;                                    // both fell together: our own death resolves in stepDying
    this.ui.toast(`${this.oppName()} is OUT! Keep going to win`, 'mission', undefined, 3000); Audio.sfx.mission();
  }

  /** Our Godzilla event started: tell the rival's phone so it shows up in their top half too. */
  sendKaiju(s, plan) { this.net && this.net.send({ t: 'event', kind: 'kaiju', s: Math.round(s * 10) / 10, plan }); }

  /** The local player crashed: tell the opponent how long and how far we lasted. */
  onLocalDeath() {
    const g = this.game; this.myFin = { t: g.runTime, score: Math.floor(g.score), dist: Math.floor(g.dist), coins: g.runCoins | 0 };
    this.net && this.net.send({ t: 'event', kind: 'dead', rt: +this.myFin.t.toFixed(2), sc: this.myFin.score, d: this.myFin.dist, c: this.myFin.coins });
  }

  /** First to reach a mission goal claims it. Ties (both within ~0.7 s) go to the earlier run clock, then to the host. */
  onClaim(m) {
    const ms = this.missions.find((x) => x.id === m.id); if (!ms || ms.owner === 'opp' || (ms.owner === 'me' && !ms.pendingAt)) return;
    const rt = +m.rt || 0;
    if (ms.pendingAt && (rt > ms.claimT || (Math.abs(rt - ms.claimT) < 0.01 && this.slot === 0))) return;   // our claim was earlier (or we are host on a tie)   // our claim was earlier: ignore theirs
    ms.owner = 'opp'; ms.pendingAt = 0; ms.progress = ms.goal; ms.done = true;
    this.ui.toast(`${this.oppName()} got it first: ${ms.text}`, 'warn', undefined, 3000);
  }

  checkMissions() {
    const g = this.game, now = performance.now();
    for (const ms of this.missions) {
      if (ms.owner === 'opp') continue;
      ms.progress = Math.max(ms.progress, Math.min(ms.goal, Math.floor(this.stat(ms.key))));
      if (!ms.owner && ms.progress >= ms.goal && !g.player.dead) {
        ms.owner = 'me'; ms.pendingAt = now; ms.claimT = g.runTime;
        this.net && this.net.send({ t: 'event', kind: 'claim', id: ms.id, rt: +g.runTime.toFixed(2) });
      }
      if (ms.owner === 'me' && ms.pendingAt && now - ms.pendingAt > 700) {          // nobody beat us to it
        ms.pendingAt = 0; ms.done = true; this.reward += COOP_REWARD;
        const s = Store.get(); s.coins += COOP_REWARD; Store.save();
        this.ui.toast(`Mission claimed: ${ms.text} (+${COOP_REWARD})`, 'mission', undefined, 3000); Audio.sfx.mission();
      }
    }
  }

  /** How long each player lasted (a runner still going counts up to now). */
  lasted() {
    const g = this.game, P = this.partner;
    return { me: this.myFin ? this.myFin.t : g.runTime, opp: P.fin ? P.fin.t : (P.gone ? -1 : Infinity) };
  }

  results() {
    const g = this.game, P = this.partner, L = this.lasted();
    const me = this.myFin || { t: g.runTime, score: Math.floor(g.score), dist: Math.floor(g.dist), coins: g.runCoins | 0 };
    const opp = P.fin || { t: P.gone ? 0 : g.runTime, score: P.score | 0, dist: Math.floor(P.dist), coins: P.stats.c | 0 };
    let winner;
    if (this.forfeit) winner = 'opp';
    else if (P.gone) winner = 'me';
    else if (Math.abs(L.me - L.opp) > 0.05) winner = L.me > L.opp ? 'me' : 'opp';
    else winner = me.score >= opp.score ? (me.score === opp.score ? 'tie' : 'me') : 'opp';
    return {
      winner, me: { name: this.me().name, ...me }, opp: { name: this.oppName(), ...opp, gone: P.gone },
      missions: this.missions.map((m) => ({ text: m.text, owner: m.owner, done: m.done, progress: m.progress, goal: m.goal })), reward: this.reward,
      forfeit: this.forfeit, canRematch: !!(this.net && this.net.open && !P.gone && !this.forfeit),
    };
  }

  /** Match is over for both: go back to the lobby, keeping the room. */
  end() {
    this.active = false; this.cleanupOpp(); this.net && this.net.send({ t: 'over' });
    this.stage = this.net && this.net.open && this.peer && !this.partner.gone ? 'ready' : (this.net && this.net.open ? 'waiting' : 'idle');
  }
}
