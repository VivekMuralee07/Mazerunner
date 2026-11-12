import { SKINS, POWERUPS, MAX_UPGRADE, MAX_MULTIPLIER } from './config.js';
import * as Store from './storage.js';
import * as Audio from './audio.js';
import * as Missions from './missions.js';
import * as Cloud from './cloud.js';

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
    click('#setHints', () => { Store.get().settings.hints = {}; Store.save(); this.setMsg('Hints will show again the next time each hazard appears.', true); });
    click('#btnMore', () => this.openPanel('more'));
    click('#btnShop', () => this.openPanel('shop'));
    click('#btnMissions', () => this.openPanel('missionsScreen'));
    click('#btnSettings', () => this.openPanel('settings'));
    click('#btnBoard', () => this.openPanel('board'));
    click('#btnDaily', () => this.openPanel('daily'));
    click('#dailyPlay', () => this.game.playDaily());
    click('#btnTogether', () => { this.openPanel('lobby'); this.game.coop.openLobby(); });
    click('#lobbyCreate', () => this.game.coop.create());
    click('#lobbyJoin', () => { const code = $('#lobbyCode').value.trim(); if (code.length === 4) this.game.coop.join(code); else this.lobbyError('Enter the 4-letter code your friend sees.'); });
    $('#lobbyCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $('#lobbyCode').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('#lobbyJoin').click(); });
    click('#lobbyStart', () => this.game.coop.start());
    click('#lobbyBack', () => { this.game.coop.leave(); this.closePanels(); });
    click('#coRematch', () => this.game.coop.rematch());
    click('#coAgain', () => { this.hide('coopOver'); this.show('lobby'); this.lobby(this.game.coop); });
    click('#coMenu', () => { this.game.coop.leave(); this.hide('coopOver'); this.game.quitToMenu(); });
    $$('.back').forEach((b) => b.addEventListener('click', () => { Audio.sfx.click(); this.closePanels(); }));
    $$('.tab').forEach((t) => t.addEventListener('click', () => { Audio.sfx.click(); this.shopTab = t.dataset.tab; this.renderShop(); }));
    click('#btnPause', () => this.game.pause());
    click('#btnResume', () => this.game.resume());
    click('#btnRestart', () => { this.showPause(false); this.game.replay(); });
    click('#btnQuit', () => { this.showPause(false); this.game.quitToMenu(); });
    click('#btnAgain', () => { this.hide('gameover'); this.game.replay(); });
    click('#btnMenu', () => { this.hide('gameover'); this.game.quitToMenu(); });
    $('#btnRevive').addEventListener('click', () => { if (this.game.revive()) this.updateHud(this.game, true); else this.updateRevive(); });
    // settings
    click('#setMusic', () => { const s = Store.get().settings; s.music = !s.music; Store.save(); Audio.applySettings(); this.renderSettings(); });
    click('#setSfx', () => { const s = Store.get().settings; s.sfx = !s.sfx; Store.save(); Audio.applySettings(); this.renderSettings(); });
    $$('#setQuality button').forEach((b) => b.addEventListener('click', () => {
      Audio.sfx.click(); const s = Store.get().settings; s.quality = b.dataset.q; Store.save();
      this.game.applyQuality(s.quality === 'auto' ? (this.game.isMobile ? 'medium' : 'high') : s.quality); this.renderSettings();
    }));
    $('#setName').addEventListener('change', (e) => {
      const s = Store.get().settings; s.name = e.target.value.replace(/[<>&"'\u0000-\u001f]/g, '').trim().slice(0, 16); e.target.value = s.name; Store.save();
    });
    click('#setCopy', async () => { try { await navigator.clipboard.writeText(Cloud.playerId()); this.setMsg('Recovery code copied.'); } catch { this.setMsg('Select the code and copy it manually.'); } });
    click('#setRestoreBtn', async () => {
      const code = $('#setRestore').value;
      try {
        await Cloud.restore(code);
        const sv = Store.get(); this.game.player.setSkin(SKINS.find((k) => k.id === sv.skin) || SKINS[0]); Missions.ensure(); this.refreshMenu(); this.renderSettings();
        $('#setRestore').value = ''; this.setMsg('Progress restored!', true);
      } catch (e) { this.setMsg(e.message || 'Could not restore.'); }
    });
    click('#setReset', () => {
      if (!confirm('Erase all coins, outfits, upgrades and best scores?')) return;
      Store.reset(); Missions.ensure(); this.game.player.setSkin(SKINS[0]); this.refreshMenu(); this.renderSettings();
    });
    $('#nameSave').addEventListener('click', () => { Audio.sfx.click(); this.saveName($('#nameInput').value); });
    $('#nameSkip').addEventListener('click', () => { Audio.sfx.click(); this.saveName(''); });
    $('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); this.saveName($('#nameInput').value); } e.stopPropagation(); });
    this.refreshMenu();
  }

  saveName(v) {
    const s = Store.get().settings; v = v.replace(/[<>&"'\u0000-\u001f]/g, '').trim().slice(0, 16);
    if (v) s.name = v; s.namePrompted = true; Store.save(); this.hide('nameModal'); this.show('menu'); this.refreshMenu();
  }
  /** First launch: ask for a leaderboard name. */
  maybeAskName() {
    const s = Store.get().settings;
    if (s.name || s.namePrompted) return;
    this.hide('menu'); this.show('nameModal'); setTimeout(() => $('#nameInput').focus(), 300);
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
  loaded() { const l = $('#loading'); l.style.transition = 'opacity .5s'; l.style.opacity = 0; setTimeout(() => l.classList.remove('show'), 500); this.showMenu(); this.maybeAskName(); }
  loadError(msg) { $('#loaderror').textContent = msg; $('#loaderror').classList.remove('hidden'); $('#loadtext').textContent = 'Could not start the game'; }

  refreshMenu() {
    const s = Store.get();
    $('#menuCoins').textContent = fmt(s.coins); $('#menuBest').textContent = fmt(s.best);
    $('#menuRank').textContent = `Multiplier ×${s.rank + 1}`;
  }

  showMenu() { this.hud(false); $('#oppHud').classList.add('hidden'); this.hide('gameover'); this.hide('pause'); this.hide('lobby'); this.hide('coopOver'); this.closePanels(); this.refreshMenu(); this.show('menu'); }
  onPlay() { this.hide('menu'); this.hide('lobby'); this.hide('daily'); this.hide('more'); this.hide('coopOver'); this.closePanels(); this.hide('gameover'); this.hud(true); const co = this.game.coop && this.game.coop.active; $('#coopHud').classList.toggle('hidden', !co); $('#oppHud').classList.toggle('hidden', !co); $('#btnPause').classList.toggle('hidden', !!co); this.showDown(false); $('#tutorial').classList.add('hidden'); this.clearToasts(); this.updateHud(this.game, true); }
  onRevive() { this.hide('gameover'); this.hud(true); }
  showPause(on) { on ? this.show('pause') : this.hide('pause'); }

  openPanel(id) {
    this.hide('menu'); if (id !== 'more') this.hide('more'); this.show(id);
    if (id === 'shop') this.renderShop(); if (id === 'missionsScreen') this.renderMissions(); if (id === 'settings') this.renderSettings(); if (id === 'board') this.renderBoard(); if (id === 'daily') this.renderDaily();
  }
  closePanels() {
    const was = ['shop', 'missionsScreen', 'settings', 'board', 'lobby', 'daily', 'more'].some((id) => $('#' + id).classList.contains('show'));
    ['shop', 'missionsScreen', 'settings', 'board', 'lobby', 'daily', 'more'].forEach((id) => this.hide(id));
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
        if (!def.cost.length) continue;       // shield / jetpack are pick-ups only
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

  setMsg(text, good) { const m = $('#setMsg'); m.textContent = text; m.style.color = good ? '#07705e' : ''; }

  async renderBoard() {
    const lt = Store.get().lifetime, sv = Store.get();
    const t = Math.floor(lt.time / 60), time = t >= 60 ? `${Math.floor(t / 60)}h ${t % 60}m` : `${t}m`;
    const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
    $('#boardStats').innerHTML = cell('Best score', fmt(sv.best)) + cell('Best run', `${fmt(sv.bestDistance)} m`) + cell('Runs', fmt(sv.totalRuns))
      + cell('Distance', `${(lt.distance / 1000).toFixed(1)} km`) + cell('Coins found', fmt(lt.coins)) + cell('Play time', time)
      + cell('Jumps', fmt(lt.jumps)) + cell('Rolls', fmt(lt.rolls)) + cell('Power-ups', fmt(lt.powerups));
    const list = $('#boardList'), msg = $('#boardMsg'), rank = $('#boardRank');
    list.innerHTML = ''; msg.textContent = 'Loading…'; rank.textContent = '—';
    try {
      await Cloud.push();                                   // make sure your newest score is on the board
      const d = await Cloud.leaderboard();
      msg.textContent = d.top.length ? '' : 'No scores yet — be the first!';
      rank.textContent = d.rank ? `You: #${d.rank} of ${fmt(d.players)}` : 'Unranked';
      d.top.forEach((e, i) => {
        const li = document.createElement('li'); if (e.me) li.className = 'me';
        li.innerHTML = '<span class="rk"></span><span class="nm"></span><span class="sc"></span>';
        li.children[0].textContent = i + 1; li.children[1].textContent = e.name + (e.me ? ' (you)' : ''); li.children[2].textContent = `${fmt(e.best)}`;
        li.title = `${fmt(e.distance)} m best run`; list.appendChild(li);
      });
    } catch { msg.textContent = 'The leaderboard is unavailable right now (are you offline?). Your stats are saved on this device.'; }
  }

  async renderDaily() {
    const d = Cloud.dailyLocal(), list = $('#dailyList'), msg = $('#dailyMsg'), date = Cloud.utcDay();
    const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
    $('#dailyInfo').textContent = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)} (UTC): everyone gets the same maze and the same Godzilla today. Your best run counts.`;
    $('#dailyStats').innerHTML = cell('Your best today', fmt(d.best)) + cell('Attempts', fmt(d.plays)) + cell('Rank', '—');
    list.innerHTML = ''; msg.textContent = 'Loading…';
    try {
      const b = await Cloud.dailyBoard(date);
      msg.textContent = b.top.length ? '' : 'No scores yet today: be the first!';
      $('#dailyStats').innerHTML = cell('Your best today', fmt(d.best)) + cell('Attempts', fmt(d.plays)) + cell('Rank', b.rank ? `#${fmt(b.rank)} of ${fmt(b.players)}` : '—');
      b.top.forEach((e, i) => {
        const li = document.createElement('li'); if (e.me) li.className = 'me';
        li.innerHTML = '<span class="rk"></span><span class="nm"></span><span class="sc"></span>';
        li.children[0].textContent = i + 1; li.children[1].textContent = e.name + (e.me ? ' (you)' : ''); li.children[2].textContent = fmt(e.score); li.title = `${fmt(e.dist)} m`; list.appendChild(li);
      });
    } catch { msg.textContent = 'The daily board is unavailable right now (offline?). You can still play.'; }
  }

  renderSettings() {
    const s = Store.get().settings;
    $('#setName').value = s.name || ''; $('#setId').textContent = Cloud.playerId(); this.setMsg('');
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
    const nit = $('#nitro'), pl = g.player;
    if (pl && pl.car) { nit.classList.remove('hidden'); const ready = pl.nitroCd <= 0; nit.textContent = pl.nitro > 0 ? '⚡ NITRO!' : ready ? '⚡ NITRO READY (↑)' : `⚡ ${Math.ceil(pl.nitroCd)}s`; nit.classList.toggle('ready', ready || pl.nitro > 0); } else nit.classList.add('hidden');
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

  toast(text, kind = '', color, ms = 2400) {
    const box = $('#toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text; if (color) t.style.setProperty('--c', color);
    t.style.animationDuration = `${ms}ms`; box.appendChild(t); setTimeout(() => t.remove(), ms);
  }
  /** One-time teaching card for a new hazard. Remembered in the save so it only appears the first time (Settings can reset it). */
  hint(key, icon, title, text, ms = 5200) {
    const s = Store.get().settings; s.hints = s.hints || {};
    if (s.hints[key]) return false;
    s.hints[key] = 1; Store.save();
    const el = $('#hintCard'); el.innerHTML = '';
    const i = document.createElement('span'); i.className = 'hi'; i.textContent = icon;
    const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = title; const p = document.createElement('p'); p.textContent = text; d.append(b, p);
    el.append(i, d); el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = `hintIn ${ms}ms ease both`;
    clearTimeout(this.hintT); this.hintT = setTimeout(() => el.classList.add('hidden'), ms);
    return true;
  }
  hintFor(kind) {
    if (kind === 'quake') this.hint('kaijuQuake', '💥', 'Shockwave!', 'His tail sweeps across every lane. Look for the orange ↑ arrows on the floor and JUMP.');
    else this.hint('kaijuFire', '🔥', 'Godzilla!', 'He breathes blue fire. Lanes with blue arrows will burn: switch to the clear lane, or jump the low flames.');
  }
  clearToasts() { clearTimeout(this.hintT); $('#hintCard').classList.add('hidden'); $('#toasts').innerHTML = ''; for (const [, e] of this.puEls) e.el.remove(); this.puEls.clear(); }

  // ------------------------------------------------------------------ play together
  lobbyError(msg) { $('#lobbyError').textContent = msg || ''; }

  lobby(co) {
    const waiting = co.stage === 'waiting' || co.stage === 'ready';
    $('#lobbyIdle').classList.toggle('hidden', waiting); $('#lobbyWait').classList.toggle('hidden', !waiting);
    $('#lobbyCreate').disabled = co.stage === 'connecting'; $('#lobbyJoin').disabled = co.stage === 'connecting' || co.stage === 'joining';
    $('#lobbyJoin').textContent = co.stage === 'joining' ? 'Joining…' : 'Join';
    this.lobbyError(co.stage === 'connecting' ? 'Connecting…' : co.error);
    if (!waiting) return;
    $('#lobbyBigCode').textContent = co.code;
    const me = co.me().name, peer = co.peer ? co.peer.name : null, host = co.slot === 0;
    const row = (name, tag, cls = '') => `<div class="${cls}"><span></span>${tag ? `<span class="host">${tag}</span>` : ''}</div>`;
    const box = $('#lobbyPlayers'); box.innerHTML = '';
    const add = (name, tag, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; const a = document.createElement('span'); a.textContent = name; d.appendChild(a); if (tag) { const t = document.createElement('span'); t.className = 'host'; t.textContent = tag; d.appendChild(t); } box.appendChild(d); };
    add(`${host ? me : (peer || 'Host')}`, 'host'); add(host ? (peer || 'Waiting for your friend…') : me, host ? '' : 'you', host && !peer ? 'wait' : '');
    $('#lobbyStatus').textContent = co.stage === 'ready' ? (host ? 'Your rival is here. Ready when you are!' : 'Waiting for the host to start…') : 'Share this code with your friend.';
    $('#lobbyStart').classList.toggle('hidden', !(host && co.stage === 'ready'));
  }

  coopBegin() { $('#coopHud').classList.remove('hidden'); $('#oppHud').classList.remove('hidden'); $('#btnPause').classList.add('hidden'); this.coopHudT = 0; }

  /** Versus HUD: only the opponent's points, multiplier, distance and coins (top half). Everything else is a 3-second pop-up. */
  coopHud(co) {
    const now = performance.now(); if (now - (this.coopHudT || 0) < 150) return; this.coopHudT = now;
    const P = co.partner, o = co.opp, fin = P.fin;
    $('#oppScore').textContent = fmt(fin ? fin.score : P.score);
    $('#oppMult').textContent = `×${(o && o.mult) || 1}`;
    $('#oppDist').textContent = `${fmt(fin ? fin.dist : Math.floor(P.dist))} m`;
    $('#oppCoins').textContent = fmt(fin ? fin.coins : (P.stats.c | 0));
    $('#oppHud').classList.toggle('out', !P.alive || P.gone);
  }

  /** "You're out" notice: shows for 3 seconds, then gets out of the way. */
  showDown(on) {
    const b = $('#downBanner'); clearTimeout(this.downT); b.classList.toggle('hidden', !on);
    if (on) this.downT = setTimeout(() => b.classList.add('hidden'), 3000);
  }

  /** The "Rematch" button: hidden when the rival is gone, otherwise shows who has asked. */
  rematchState(co) {
    const b = $('#coRematch'); if (!b) return;
    const ok = !!(co.net && co.net.open && !co.partner.gone && !co.forfeit);
    b.classList.toggle('hidden', !ok); b.disabled = !!co.iWantRematch;
    b.textContent = co.iWantRematch && co.rivalWantsRematch ? 'Starting…' : co.iWantRematch ? 'Waiting for rival…' : co.rivalWantsRematch ? '⚔ Rival wants a rematch: accept' : 'Rematch';
  }

  showCoopOver(r) {
    this.hud(false); $('#coopHud').classList.add('hidden'); $('#oppHud').classList.add('hidden');
    const t = $('#coTitle'); t.textContent = r.winner === 'me' ? 'You win!' : r.winner === 'opp' ? `${r.opp.name} wins` : 'It\'s a draw';
    t.className = r.winner === 'me' ? 'win' : r.winner === 'opp' ? 'lose' : '';
    $('#coWhy').textContent = r.forfeit ? 'You lost your connection.' : r.opp.gone ? `${r.opp.name} left the match.` : r.winner === 'tie' ? 'Equal time and score.' : `${r.winner === 'me' ? 'You' : r.opp.name} lasted longer: ${(r.winner === 'me' ? r.me : r.opp).t.toFixed(1)} s vs ${(r.winner === 'me' ? r.opp : r.me).t.toFixed(1)} s.`;
    $('#coBest').classList.toggle('hidden', !r.newBest);
    const P = $('#coPlayers'); P.innerHTML = '';
    for (const [who, d, w] of [['You', r.me, r.winner === 'me'], [r.opp.name, r.opp, r.winner === 'opp']]) {
      const el = document.createElement('div'); if (w) el.className = 'winner';
      const t1 = document.createElement('small'); t1.textContent = (w ? '🏆 ' : '') + who;
      const b = document.createElement('b'); b.textContent = fmt(d.score); const l = document.createElement('small'); l.textContent = `${fmt(d.dist)} m · ${fmt(d.coins)} coins · ${d.t.toFixed(1)} s`;
      el.append(t1, b, l); P.appendChild(el);
    }
    const M = $('#coMissions'); M.innerHTML = '';
    for (const m of r.missions) { const d = document.createElement('div'); d.className = 'gm' + (m.owner === 'me' ? ' ok' : ''); d.textContent = `${m.owner === 'me' ? '✔ you' : m.owner === 'opp' ? '✗ ' + r.opp.name : '–'}: ${m.text}`; M.appendChild(d); }
    if (r.reward) { const d = document.createElement('div'); d.className = 'gm ok'; d.textContent = `Mission rewards: +${fmt(r.reward)} coins`; M.appendChild(d); }
    this.rematchState(this.game.coop);
    this.show('coopOver');
  }

  flash(color) { const f = $('#flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = 1; void f.offsetWidth; f.style.transition = 'opacity .45s ease-out'; f.style.opacity = 0; }

  onBiome(biome, announce) {
    if (!announce) return;
    const b = $('#biomeBanner'); b.textContent = biome.name; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  // ------------------------------------------------------------------ game over
  showGameOver(d) {
    this.hud(false);
    $('#goTitle').textContent = d.cause === 'caught' ? 'Caught!' : d.cause === 'boulder' ? 'Flattened!' : d.cause === 'burned' ? 'Incinerated!' : d.cause === 'quake' ? 'Shockwave!' : d.cause === 'turn' ? 'Missed the turn!' : 'Crushed!';
    $('#goCause').textContent = d.cause === 'caught' ? 'The Minotaur caught up with you.' : d.cause === 'boulder' ? 'A boulder rolled right over you.' : d.cause === 'burned' ? 'Godzilla\'s blue flame got you. Jump it or take the free lane.' : d.cause === 'quake' ? 'Godzilla\'s tail shockwave hit you. Jump it!' : d.cause === 'turn' ? 'Swipe the way the arrow points to take a corner.' : 'You ran straight into the maze’s stone.';
    $('#goScore').textContent = fmt(d.score);
    $('#goBest').classList.toggle('hidden', !d.newBest);
    $('#goBestVal').textContent = fmt(d.best); $('#goDist').textContent = `${fmt(d.distance)} m`; $('#goCoins').textContent = fmt(d.coins);
    const m = d.missions; let html = '';
    for (const c of m.completed) html += `<div class="gm">✔ ${c.text} — +${c.reward} coins</div>`;
    if (m.newSet) html += `<div class="gm big">All missions complete! Score multiplier increased to ×${Store.get().rank + 1}</div>`;
    $('#goMissions').innerHTML = html;
    this.reviveInfo = d; this.updateRevive();
    this.show('gameover');
    const rk = $('#goRank'); rk.classList.add('hidden');
    if (d.daily) {                                                         // daily challenge: submit to today's board
      Cloud.dailyRecord(d.score);
      Cloud.dailySubmit(d.daily, d.score, d.distance).then((r) => { rk.textContent = `📅 Daily rank #${fmt(r.rank)} of ${fmt(r.players)} today (best ${fmt(r.best)})`; rk.classList.remove('hidden'); }).catch(() => {});
      return;
    }
    Cloud.push().then(() => Cloud.leaderboard(1)).then((r) => { if (r.rank) { rk.textContent = `🌍 Global rank #${fmt(r.rank)} of ${fmt(r.players)} runners`; rk.classList.remove('hidden'); } }).catch(() => {});
  }
  updateRevive() {
    const d = this.reviveInfo, wallet = Store.get().coins, b = $('#btnRevive');
    b.classList.toggle('hidden', !d.canRevive || !this.game);
    if (this.game) { const cost = this.game.reviveCost(); $('#reviveCost').innerHTML = `<span class="cost">· <i class="coin"></i>${fmt(cost)}</span>`; b.disabled = wallet < cost; b.classList.toggle('hidden', this.game.revives >= 3); }
  }
}
