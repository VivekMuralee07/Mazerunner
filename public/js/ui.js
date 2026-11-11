import { SKINS, POWERUPS, MAX_UPGRADE, MAX_MULTIPLIER } from './config.js';
import * as Store from './storage.js';
import * as Audio from './audio.js';
import * as Missions from './missions.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

export class UI {
  constructor() {
    this.game = null; this.portrait = innerHeight > innerWidth; this.shopTab = 'skins'; this.puEls = new Map(); this.last = {};
    const measure = () => {
      this.portrait = innerHeight > innerWidth; this.wide = innerWidth / innerHeight > 1.45 && innerWidth >= 820;
      document.body.classList.toggle('wide', this.wide);
    };
    addEventListener('resize', measure); measure();
  }

  bind(game) {
    this.game = game;
    const click = (sel, fn) => $(sel).addEventListener('click', (e) => { Audio.sfx.click(); fn(e); });
    click('#btnPlay', () => this.game.play());
    click('#btnShop', () => this.openPanel('shop'));
    click('#btnMissions', () => this.openPanel('missionsScreen'));
    click('#btnSettings', () => this.openPanel('settings'));
    $$('.back').forEach((b) => b.addEventListener('click', () => { Audio.sfx.click(); this.closePanels(); }));
    $$('.tab').forEach((t) => t.addEventListener('click', () => { Audio.sfx.click(); this.shopTab = t.dataset.tab; this.renderShop(); }));
    click('#btnPause', () => this.game.pause());
    click('#btnResume', () => this.game.resume());
    click('#btnRestart', () => { this.showPause(false); this.game.play(); });
    click('#btnQuit', () => { this.showPause(false); this.game.quitToMenu(); });
    click('#btnAgain', () => { this.hide('gameover'); this.game.play(); });
    click('#btnMenu', () => { this.hide('gameover'); this.game.quitToMenu(); });
    $('#btnRevive').addEventListener('click', () => { if (this.game.revive()) this.updateHud(this.game, true); else this.updateRevive(); });
    // settings
    click('#setMusic', () => { const s = Store.get().settings; s.music = !s.music; Store.save(); Audio.applySettings(); this.renderSettings(); });
    click('#setSfx', () => { const s = Store.get().settings; s.sfx = !s.sfx; Store.save(); Audio.applySettings(); this.renderSettings(); });
    $$('#setQuality button').forEach((b) => b.addEventListener('click', () => {
      Audio.sfx.click(); const s = Store.get().settings; s.quality = b.dataset.q; Store.save();
      this.game.applyQuality(s.quality === 'auto' ? (this.game.isMobile ? 'medium' : 'high') : s.quality); this.renderSettings();
    }));
    click('#setReset', () => {
      if (!confirm('Erase all coins, outfits, upgrades and best scores?')) return;
      Store.reset(); Missions.ensure(); this.game.player.setSkin(SKINS[0]); this.refreshMenu(); this.renderSettings();
    });
    this.refreshMenu();
  }

  onConfirm() {
    if ($('#menu').classList.contains('show') ) this.game.play();
    else if ($('#gameover').classList.contains('show')) { this.hide('gameover'); this.game.play(); }
    else if ($('#pause').classList.contains('show')) this.game.resume();
  }

  // ------------------------------------------------------------------ screens
  show(id) { $('#' + id).classList.add('show'); }
  hide(id) { $('#' + id).classList.remove('show'); }
  hud(on) { $('#hud').classList.toggle('hidden', !on); }

  loading(p, text) { $('#loadfill').style.width = `${Math.round(p * 100)}%`; if (text) $('#loadtext').textContent = text; }
  loaded() { const l = $('#loading'); l.style.transition = 'opacity .5s'; l.style.opacity = 0; setTimeout(() => l.classList.remove('show'), 500); this.showMenu(); }
  loadError(msg) { $('#loaderror').textContent = msg; $('#loaderror').classList.remove('hidden'); $('#loadtext').textContent = 'Could not start the game'; }

  refreshMenu() {
    const s = Store.get();
    $('#menuCoins').textContent = fmt(s.coins); $('#menuBest').textContent = fmt(s.best);
    $('#menuRank').textContent = `Multiplier ×${s.rank + 1}`;
  }

  showMenu() { this.hud(false); this.hide('gameover'); this.hide('pause'); this.closePanels(); this.refreshMenu(); this.show('menu'); }
  onPlay() { this.hide('menu'); this.closePanels(); this.hide('gameover'); this.hud(true); $('#tutorial').classList.add('hidden'); this.clearToasts(); this.updateHud(this.game, true); }
  onRevive() { this.hide('gameover'); this.hud(true); }
  showPause(on) { on ? this.show('pause') : this.hide('pause'); }

  openPanel(id) {
    this.hide('menu'); this.show(id);
    if (id === 'shop') this.renderShop(); if (id === 'missionsScreen') this.renderMissions(); if (id === 'settings') this.renderSettings();
  }
  closePanels() {
    const was = ['shop', 'missionsScreen', 'settings'].some((id) => $('#' + id).classList.contains('show'));
    ['shop', 'missionsScreen', 'settings'].forEach((id) => this.hide(id));
    if (was) { this.show('menu'); this.refreshMenu(); }
  }

  // ------------------------------------------------------------------ shop
  renderShop() {
    const s = Store.get();
    $$('.walletCoins').forEach((e) => (e.textContent = fmt(s.coins)));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === this.shopTab));
    const body = $('#shopBody'); body.innerHTML = '';
    if (this.shopTab === 'skins') {
      const grid = document.createElement('div'); grid.className = 'grid';
      for (const sk of SKINS) {
        const owned = s.ownedSkins.includes(sk.id), sel = s.skin === sk.id;
        const card = document.createElement('div'); card.className = 'card' + (sel ? ' sel' : '');
        card.innerHTML = `<div class="swatch"><i class="body" style="background:${hex(sk.tunic)}"></i><i class="legs" style="background:${hex(sk.pants)}"></i><i class="head" style="background:${hex(sk.skin)}"></i><i class="hair" style="background:${hex(sk.hair)}"></i><i class="scarf" style="background:${hex(sk.accent)};box-shadow:0 0 12px ${hex(sk.glow)}"></i></div><h3>${sk.name}</h3>`;
        const b = document.createElement('button'); b.className = 'btn small' + (owned && !sel ? '' : sel ? '' : ' gold');
        if (sel) { b.textContent = 'Selected'; b.disabled = true; }
        else if (owned) { b.textContent = 'Equip'; b.onclick = () => { Audio.sfx.click(); s.skin = sk.id; Store.save(); this.game.player.setSkin(sk); this.renderShop(); }; }
        else { b.innerHTML = `<span class="cost"><i class="coin"></i>${fmt(sk.cost)}</span>`; b.disabled = s.coins < sk.cost; b.onclick = () => { if (s.coins < sk.cost) return Audio.sfx.deny(); s.coins -= sk.cost; s.ownedSkins.push(sk.id); s.skin = sk.id; Store.save(); Audio.sfx.buy(); this.game.player.setSkin(sk); this.renderShop(); }; }
        card.appendChild(b); grid.appendChild(card);
      }
      body.appendChild(grid);
    } else {
      for (const [id, def] of Object.entries(POWERUPS)) {
        if (id === 'shield') continue;
        const lvl = s.upgrades[id] || 0, max = lvl >= MAX_UPGRADE, cost = def.cost[lvl];
        const row = document.createElement('div'); row.className = 'upg'; row.style.setProperty('--c', def.color);
        const secs = (def.base + def.step * lvl).toFixed(1);
        row.innerHTML = `<div class="ico">${def.icon}</div><div><h3>${def.name} <small style="color:var(--dim)">· ${secs}s</small></h3><p>${def.desc}</p><div class="pips">${Array.from({ length: MAX_UPGRADE }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>`;
        const b = document.createElement('button'); b.className = 'btn small gold';
        if (max) { b.textContent = 'MAX'; b.disabled = true; }
        else { b.innerHTML = `<span class="cost"><i class="coin"></i>${fmt(cost)}</span>`; b.disabled = s.coins < cost; b.onclick = () => { if (s.coins < cost) return Audio.sfx.deny(); s.coins -= cost; s.upgrades[id] = lvl + 1; Store.save(); Audio.sfx.buy(); this.renderShop(); }; }
        row.appendChild(b); body.appendChild(row);
      }
    }
  }

  renderMissions() {
    const s = Store.get();
    $('#missionRank').textContent = `Multiplier ×${s.rank + 1}${s.rank + 1 >= MAX_MULTIPLIER ? ' (MAX)' : ''}`;
    $('#missionList').innerHTML = Missions.list().map((m) => `
      <div class="mission ${m.done ? 'done' : ''}"><div class="t">${m.done ? '✔ ' : ''}${m.text}</div><div class="r">+${m.reward}<i class="coin" style="margin-left:4px;width:.9em;height:.9em"></i></div>
      <div class="track"><i style="width:${(m.progress / m.goal) * 100}%"></i></div></div>`).join('');
  }

  renderSettings() {
    const s = Store.get().settings;
    $('#setMusic').classList.toggle('on', s.music); $('#setSfx').classList.toggle('on', s.sfx);
    $$('#setQuality button').forEach((b) => b.classList.toggle('on', b.dataset.q === s.quality));
  }

  // ------------------------------------------------------------------ HUD
  updateHud(g, force) {
    const L = this.last;
    const score = Math.floor(g.score), coins = g.runCoins, mult = g.mult, dist = Math.floor(g.dist);
    if (force || score !== L.score) { $('#score').textContent = fmt(score); L.score = score; }
    if (force || coins !== L.coins) { $('#coinCount').textContent = fmt(coins); if (!force) { const c = $('#coins'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } L.coins = coins; }
    if (force || mult !== L.mult) { const m = $('#mult'); m.textContent = `×${mult}`; m.classList.toggle('boost', g.timers && g.timers.double > 0); L.mult = mult; }
    if (force || dist !== L.dist) { $('#dist').textContent = `${fmt(dist)} m`; L.dist = dist; }
    // power-up bars
    const box = $('#powerups');
    const active = [];
    for (const k of Object.keys(g.timers)) if (g.timers[k] > 0) active.push([k, g.timers[k]]);
    if (g.shield) active.push(['shield', 1]);
    const keys = new Set(active.map((a) => a[0]));
    for (const [k, el] of this.puEls) if (!keys.has(k)) { el.el.remove(); this.puEls.delete(k); }
    for (const [k, t] of active) {
      let e = this.puEls.get(k);
      if (!e) {
        const def = POWERUPS[k], el = document.createElement('div'); el.className = 'pu'; el.style.setProperty('--c', def.color);
        el.innerHTML = `<span class="ico">${def.icon}</span><div class="bar"><i></i></div>`; box.appendChild(el);
        e = { el, bar: $('i', el), max: t }; this.puEls.set(k, e);
      }
      if (t > e.max) e.max = t;
      e.bar.style.width = k === 'shield' ? '100%' : `${Math.min(100, (t / e.max) * 100)}%`;
      e.el.classList.toggle('warn', k !== 'shield' && t < 1.6);
    }
  }

  countdown(text, go) {
    const c = $('#countdown'); c.textContent = text; c.className = ''; void c.offsetWidth; c.className = 'pop' + (go ? ' go' : '');
  }
  showTutorial() { const t = $('#tutorial'); t.classList.remove('hidden'); t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; setTimeout(() => t.classList.add('hidden'), 5200); }

  toast(text, kind = '', color) {
    const box = $('#toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text; if (color) t.style.setProperty('--c', color);
    box.appendChild(t); setTimeout(() => t.remove(), 2400);
  }
  clearToasts() { $('#toasts').innerHTML = ''; for (const [, e] of this.puEls) e.el.remove(); this.puEls.clear(); }

  flash(color) { const f = $('#flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = 1; void f.offsetWidth; f.style.transition = 'opacity .45s ease-out'; f.style.opacity = 0; }

  onBiome(biome, announce) {
    if (!announce) return;
    const b = $('#biomeBanner'); b.textContent = biome.name; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  // ------------------------------------------------------------------ game over
  showGameOver(d) {
    this.hud(false);
    $('#goTitle').textContent = d.cause === 'caught' ? 'Caught!' : 'Crushed!';
    $('#goCause').textContent = d.cause === 'caught' ? 'The Minotaur caught up with you in the dark.' : 'You ran straight into the maze’s stone.';
    $('#goScore').textContent = fmt(d.score);
    $('#goBest').classList.toggle('hidden', !d.newBest);
    $('#goBestVal').textContent = fmt(d.best); $('#goDist').textContent = `${fmt(d.distance)} m`; $('#goCoins').textContent = fmt(d.coins);
    const m = d.missions; let html = '';
    for (const c of m.completed) html += `<div class="gm">✔ ${c.text} — +${c.reward} coins</div>`;
    if (m.newSet) html += `<div class="gm big">All missions complete! Score multiplier increased to ×${Store.get().rank + 1}</div>`;
    $('#goMissions').innerHTML = html;
    this.reviveInfo = d; this.updateRevive();
    this.show('gameover');
  }
  updateRevive() {
    const d = this.reviveInfo, wallet = Store.get().coins, b = $('#btnRevive');
    b.classList.toggle('hidden', !d.canRevive || !this.game);
    if (this.game) { const cost = this.game.reviveCost(); $('#reviveCost').innerHTML = `<span class="cost">· <i class="coin"></i>${fmt(cost)}</span>`; b.disabled = wallet < cost; b.classList.toggle('hidden', this.game.revives >= 3); }
  }
}
