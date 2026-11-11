// End-to-end checks for Labyrinth Run. Needs Playwright (not a runtime dependency):
//   npm i -g playwright   (or in a scratch folder)   then:   npm test
// Add --shots to also write screenshots into ./screenshots
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv.includes('--shots');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))); }

const PORT = 3100 + Math.floor(Math.random() * 500);
import os from 'node:os';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-data-'));
const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA }, stdio: 'ignore' });
const url = `http://localhost:${PORT}/`;
for (let i = 0; i < 50; i++) { try { await new Promise((r, j) => http.get(url + 'healthz', (x) => (x.statusCode === 200 ? r() : j())).on('error', j)); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

try {
  console.log('Boot');
  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 90000 });
  check('game boots to the main menu', true);
  check('menu is visible', await page.isVisible('#btnPlay'));
  if (SHOTS) { fs.mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true }); await page.waitForTimeout(1500); await page.screenshot({ path: path.join(ROOT, 'screenshots/menu.png') }); }

  // --- helper injected into the page: deterministic scenarios stepping the game logic directly
  await page.evaluate(() => {
    const g = window.__game;
    window.T = {
      start() { g.play(); let n = 0; while (g.state !== 'running' && n++ < 600) { g.step(1 / 60); } g.world.spawnS = 1e12; for (const s of g.world.solids) s.ghost = true; g.world.coins.length = 0; return g.state; },
      run(sec, fn) { for (let i = 0; i < sec * 60 && g.state === 'running'; i++) { fn && fn(i); g.step(1 / 60); } },
      until(cond, maxSec = 20, fn) { for (let i = 0; i < maxSec * 60; i++) { if (cond()) return true; if (g.state !== 'running' && g.state !== 'dying') return cond(); fn && fn(i); g.step(1 / 60); } return false; },
      add(type, lane, ahead, o) { return g.world.addSolid(type, lane, g.dist + ahead, o); },
      jumpFor(sd) { const d = sd.s0 - g.dist; if (d > 0 && d < g.speed * 0.28) g.action('jump'); },
    };
  });

  console.log('Core rules');
  let r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start();
    const sd = T.add('block', 1, 25, { ramp: true, body: 10 });
    let maxY = 0; T.until(() => g.dist > sd.s1 + 4, 20, () => { maxY = Math.max(maxY, g.player.y); });
    return { st: g.state, maxY, y: g.player.y, climbs: g.stats.climbs };
  });
  check('ramp lets you run up onto a slab without crashing', r.st === 'running' && r.maxY > 1.4 && r.maxY < 1.6, JSON.stringify(r));
  check('you drop back to the floor after the slab', r.y < 0.01);
  check('climbing a slab is counted for missions', r.climbs >= 1);

  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); T.add('block', 1, 25, { ramp: false, body: 10 }); T.until(() => g.state === 'dying', 5); return { st: g.state, cause: g.cause }; });
  check('running head-on into a slab is fatal', r.st === 'dying' && r.cause === 'crash', JSON.stringify(r));

  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start();
    const sd = T.add('block', 1, 30, { ramp: false, body: 10 }); let maxY = 0;
    T.until(() => g.dist > sd.s1 + 4, 20, () => { T.jumpFor(sd); maxY = Math.max(maxY, g.player.y); });
    return { st: g.state, maxY };
  });
  check('jumping onto a no-ramp slab works and you run along its top', r.st === 'running' && r.maxY > 1.4, JSON.stringify(r));

  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); T.add('wall', 1, 25); T.until(() => g.state === 'dying', 5); return { st: g.state, cause: g.cause }; });
  check('a stone gate is fatal head-on', r.st === 'dying' && r.cause === 'crash');

  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); const sd = T.add('low', 1, 25); T.until(() => g.dist > sd.s1 + 4, 8, () => T.jumpFor(sd)); return { st: g.state, near: g.chaser.isNear }; });
  check('jumping clears a low barrier (no stumble)', r.st === 'running' && !r.near, JSON.stringify(r));

  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); const sd = T.add('low', 1, 25); T.until(() => g.dist > sd.s1 + 3, 8); return { st: g.state, near: g.chaser.isNear, slow: g.slowT > 0 }; });
  check('hitting a low barrier = stumble: Minotaur closes in, you slow down', r.st === 'running' && r.near && r.slow, JSON.stringify(r));

  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); T.add('low', 1, 25); T.add('low', 1, 45); T.until(() => g.state === 'dying', 8); return { st: g.state, cause: g.cause }; });
  check('a second stumble while the Minotaur is close = caught', r.st === 'dying' && r.cause === 'caught', JSON.stringify(r));

  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start();
    const a = T.add('low', 1, 25); T.until(() => g.dist > a.s1 + 2, 6);
    const near1 = g.chaser.isNear; T.run(8.5);       // Minotaur gives up after nearTime
    const b = T.add('low', 1, 25); T.until(() => g.dist > b.s1 + 2, 6);
    return { st: g.state, near1, near2: g.chaser.isNear };
  });
  check('the Minotaur falls back after a few seconds (a later stumble is survivable)', r.st === 'running' && r.near1 && r.near2, JSON.stringify(r));

  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); const sd = T.add('high', 1, 25); let rolled = false; T.until(() => g.dist > sd.s1 + 4, 8, () => { const d = sd.s0 - g.dist; if (d > 0 && d < g.speed * 0.25) { g.action('roll'); rolled = true; } }); return { st: g.state, near: g.chaser.isNear, rolled }; });
  check('rolling slides under a spike beam', r.st === 'running' && !r.near && r.rolled, JSON.stringify(r));

  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); const sd = T.add('high', 1, 25); T.until(() => g.dist > sd.s1 + 3, 8, () => T.jumpFor(sd)); return { near: g.chaser.isNear }; });
  check('jumping into a spike beam stumbles', r.near === true);

  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start();
    const sd = T.add('block', 2, 12, { ramp: false, body: 14 });
    T.until(() => sd.s0 - g.dist < g.speed * 0.1, 3); g.action('right'); T.run(0.7);
    return { st: g.state, lane: g.player.target, near: g.chaser.isNear, x: +g.player.x.toFixed(2), jumpedOn: g.player.y > 1 };
  });
  check('steering into the side of a slab scrapes: bounced back to your lane + stumble', r.st === 'running' && r.lane === 1 && r.near, JSON.stringify(r));

  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start(); g.grant('shield', 0, 1);
    const sd = T.add('wall', 1, 25); T.until(() => g.dist > sd.s1 + 4, 8);
    const survived = g.state === 'running'; const hadShield = g.shield;
    const sd2 = T.add('wall', 1, 25); T.until(() => g.state === 'dying' || g.dist > sd2.s1 + 4, 8);
    return { survived, hadShield, second: g.state };
  });
  check('Spirit Shield absorbs exactly one crash', r.survived && !r.hadShield && r.second === 'dying', JSON.stringify(r));

  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start(); g.grant('wings', 0, 1);
    const sd = T.add('wall', 1, 40), sd2 = T.add('block', 1, 60, { ramp: false, body: 10 });
    let maxY = 0; T.until(() => g.timers.wings <= 0 && g.player.grounded, 14, () => { maxY = Math.max(maxY, g.player.y); });
    const flewOver = g.state === 'running'; if (g.state !== 'running') return { flewOver };
    return { flewOver, maxY: +maxY.toFixed(1), flying: g.player.flying, coinsAloft: g.runCoins };
  });
  check('Wings lift you over the maze safely and set you down afterwards', r.flewOver && r.maxY > 4 && !r.flying, JSON.stringify(r));
  check('flying collects the sky coin trail', r.coinsAloft > 12, `coins ${r.coinsAloft}`);

  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start(); const base = g.player.jumpVelocity(); g.grant('boots', 0, 1); T.run(0.1);
    let maxY = 0; g.action('jump'); T.run(1.2, () => { maxY = Math.max(maxY, g.player.y); });
    return { base, boosted: g.player.jumpVelocity(), maxY: +maxY.toFixed(2) };
  });
  check('Spring Boots make you jump much higher', r.maxY > 3.5 && r.boosted > r.base * 1.3, JSON.stringify(r));

  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start();
    for (let i = 0; i < 6; i++) g.world.addCoin(g.dist + 20 + i * 2, 2.4, 0.8);          // lane 2 coins; player in lane 1
    const w0 = g.runCoins; T.run(2.5); const noMagnet = g.runCoins - w0;
    T.start();
    g.grant('magnet', 0, 1);
    for (let i = 0; i < 6; i++) g.world.addCoin(g.dist + 20 + i * 2, 2.4, 0.8);
    const w1 = g.runCoins; T.run(2.5); const withMagnet = g.runCoins - w1;
    return { noMagnet, withMagnet };
  });
  check('Magnet pulls in coins from neighbouring lanes', r.noMagnet === 0 && r.withMagnet >= 5, JSON.stringify(r));

  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); g.stats.coins = 0; const s0 = g.score; T.run(3); const s1 = g.score; g.grant('double', 0, 1); T.run(0.05); const m = g.mult; return { gained: s1 - s0, mult: m }; });
  check('score grows with distance and Double Points doubles the multiplier', r.gained > 20 && r.mult === 2, JSON.stringify(r));

  console.log('Run lifecycle & meta game');
  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start(); const save = JSON.parse(localStorage.getItem('labyrinth-run-save-v1') || '{}');
    g.runCoins = 120; T.add('wall', 1, 20); T.until(() => g.state === 'over', 10);
    const s = JSON.parse(localStorage.getItem('labyrinth-run-save-v1'));
    return { over: g.state, coinsBanked: s.coins, best: s.best, runs: s.totalRuns };
  });
  check('dying banks coins, best score and run count to localStorage', r.over === 'over' && r.coinsBanked >= 120 && r.best > 0 && r.runs >= 1, JSON.stringify(r));
  check('game-over screen is shown', await page.isVisible('#gameover'));
  if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: path.join(ROOT, 'screenshots/gameover.png') }); }

  r = await page.evaluate(() => {
    const g = window.__game, before = JSON.parse(localStorage.getItem('labyrinth-run-save-v1')).coins;
    const ok = g.revive(); let n = 0; while (g.state !== 'running' && n++ < 600) g.step(1 / 60);
    const after = JSON.parse(localStorage.getItem('labyrinth-run-save-v1')).coins;
    return { ok, st: g.state, spent: before - after, invuln: g.player.invuln > 0, alive: !g.player.dead };
  });
  check('revive costs coins, resumes the run and grants brief invulnerability', r.ok && r.st === 'running' && r.spent === 50 && r.invuln && r.alive, JSON.stringify(r));

  // UI flows through real clicks
  await page.evaluate(() => { const g = window.__game; g.state = 'menu'; g.resetRun(); g.ui.showMenu(); const s = JSON.parse(localStorage.getItem('labyrinth-run-save-v1')); });
  await page.evaluate(() => { const Store = null; });
  await page.click('#btnShop');
  check('shop opens', await page.isVisible('#shop'));
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('labyrinth-run-save-v1')); s.coins = 5000; localStorage.setItem('labyrinth-run-save-v1', JSON.stringify(s)); });
  r = await page.evaluate(async () => { const m = await import('/js/storage.js'); m.load(); return m.get().coins; });
  check('save can be reloaded', r === 5000);
  await page.click('#btnShop >> nth=0').catch(() => {});
  await page.evaluate(async () => { window.__game.ui.renderShop(); });
  await page.click('.card:nth-child(2) button');
  r = await page.evaluate(async () => { const m = await import('/js/storage.js'); return { skin: m.get().skin, coins: m.get().coins }; });
  check('buying an outfit spends coins and equips it', r.skin === 'shadow' && r.coins === 4600, JSON.stringify(r));
  await page.click('.tab[data-tab="upgrades"]');
  await page.click('.upg:nth-child(1) button');
  r = await page.evaluate(async () => { const m = await import('/js/storage.js'); return { lvl: m.get().upgrades.magnet, coins: m.get().coins }; });
  check('buying a Magnet upgrade works', r.lvl === 1 && r.coins === 4400, JSON.stringify(r));
  if (SHOTS) { await page.screenshot({ path: path.join(ROOT, 'screenshots/shop.png') }); }
  await page.click('#shop .back');
  await page.click('#btnMissions');
  check('missions screen lists three missions', (await page.locator('#missionList .mission').count()) === 3);
  if (SHOTS) { await page.screenshot({ path: path.join(ROOT, 'screenshots/missions.png') }); }
  await page.click('#missionsScreen .back');
  await page.click('#btnSettings');
  await page.click('#setMusic');
  r = await page.evaluate(async () => { const m = await import('/js/storage.js'); return m.get().settings.music; });
  check('settings toggles persist', r === false);
  await page.click('#settings .back');

  console.log('Jetpack');
  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start(); g.grant('jetpack', 0, 1);
    const t0 = g.timers.jetpack; T.add('wall', 1, 40); T.add('block', 1, 70, { ramp: false, body: 10 });
    let maxY = 0, coins0 = g.runCoins; T.run(14, () => { maxY = Math.max(maxY, g.player.y); });
    const stillFlying = g.player.flying && g.state === 'running'; const left = g.timers.jetpack;
    T.until(() => !g.player.flying && g.player.grounded, 8);
    return { t0, stillFlying, left: +left.toFixed(2), landed: g.player.grounded && !g.player.flying, st: g.state, maxY: +maxY.toFixed(1), coins: g.runCoins - coins0, effect: g.player.jet.visible };
  });
  check('Jetpack lasts 15 seconds', r.t0 === 15 && r.stillFlying && r.left > 0.5 && r.left < 1.5, JSON.stringify(r));
  check('Jetpack flies over gates and slabs, then lands safely', r.landed && r.st === 'running' && r.maxY > 4);
  check('Jetpack collects the sky coin trail', r.coins > 15, `coins ${r.coins}`);
  check('Jetpack pick-up exists in the spawn pool', await page.evaluate(async () => (await (await fetch('/js/world.js')).text()).includes("'jetpack'")));

  console.log('Boulder');
  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start(); g.boulderT = 1e9;
    const b = g.world.addBoulder(1, g.dist + 45, 14); g.boulder = b; T.until(() => g.state === 'dying', 8);
    return { st: g.state, cause: g.cause };
  });
  check('a boulder rolling down your lane kills you', r.st === 'dying' && r.cause === 'boulder', JSON.stringify(r));
  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start(); g.boulderT = 1e9;
    const b = g.world.addBoulder(1, g.dist + 120, 14); g.boulder = b; let moved = false, homed = 0;
    const x0 = b.x; g.player.moveLane(1); T.run(1.5); homed = b.x;         // player stepped right: the boulder should follow while far away
    T.until(() => { if (!moved && b.s0 - g.dist < 22) { moved = true; g.action('left'); } return b.s1 < g.dist - 2; }, 12, () => {});
    return { st: g.state, locked: b.locked, homed: +homed.toFixed(2), x0, counted: !!b.counted, lane: g.player.target };
  });
  check('the boulder homes in on you from afar, then locks its lane', r.homed > 0.5 && r.locked, JSON.stringify(r));
  check('a late lane change dodges the boulder (and scores a bonus)', r.st === 'running' && r.counted, JSON.stringify(r));
  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); g.boulderT = 1e9; let maxY = 0; const b = g.world.addBoulder(1, g.dist + 40, 14); g.boulder = b; T.until(() => g.state === 'dying' || b.s1 < g.dist - 2, 8, () => { if (b.s0 - g.dist < 10 && g.player.grounded) g.action('jump'); maxY = Math.max(maxY, g.player.y); }); return { st: g.state, maxY: +maxY.toFixed(2) }; });
  check('jumping does not clear a boulder', r.st === 'dying', JSON.stringify(r));
  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); g.boulderT = 1e9; g.grant('shield', 0, 1); const b = g.world.addBoulder(1, g.dist + 40, 14); g.boulder = b; T.until(() => b.s1 < g.dist - 2 || g.state === 'dying', 8); return { st: g.state, shield: g.shield }; });
  check('the Spirit Shield smashes a boulder', r.st === 'running' && !r.shield, JSON.stringify(r));
  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); g.boulderT = 1e9; g.grant('jetpack', 0, 1); const b = g.world.addBoulder(1, g.dist + 40, 14); g.boulder = b; T.until(() => b.s1 < g.dist - 2 || g.state === 'dying', 8); return { st: g.state }; });
  check('you fly safely over a boulder with the jetpack', r.st === 'running', JSON.stringify(r));
  r = await page.evaluate(() => {
    const g = window.__game, T = window.T; T.start(); g.boulderT = 0.5; g.dist = 400; g.world.reset(3, 400); let seen = 0, t = 0;
    for (let i = 0; i < 60 * 70 && g.state === 'running'; i++) { g.step(1 / 60); if (g.boulder && !seen) seen = i / 60; }
    return { seen: +seen.toFixed(1), spawned: !!seen };
  });
  check('boulders appear on their own at random times', r.spawned, JSON.stringify(r));
  r = await page.evaluate(() => {
    const g = window.__game, w = g.world; w.reset(77, 0); let jets = 0; const orig = w.addPickup.bind(w);
    w.addPickup = (t, ...a) => { if (t === 'jetpack') jets++; return orig(t, ...a); };
    for (let d = 0; d < 30000; d += 25) { w.update(0.016, d, 25, 0); w.solids.length = 0; w.pickups.length = 0; w.coins.length = 0; }
    return { jets };
  });
  check('jetpacks are rare (a handful per 30 km)', r.jets >= 2 && r.jets <= 14, JSON.stringify(r));
  r = await page.evaluate(() => { const g = window.__game, T = window.T; T.start(); g.grant('jetpack', 0, 1); T.run(1.2); const ys = g.world.coins.map((c) => c.y); const xs = g.world.coins.map((c) => c.x); return { n: ys.length, minY: Math.min(...ys), spread: +(Math.max(...xs) - Math.min(...xs)).toFixed(1), scale: g.world.coins[0].scale }; });
  check('jetpack coins form big, high, flowing ribbons across the lanes', r.n > 30 && r.minY > 6.5 && r.spread > 3 && r.scale > 1.2, JSON.stringify(r));

  console.log('Persistent stats (server + device)');
  r = await page.evaluate(async () => {
    const id = crypto.randomUUID(), put = (i, b) => fetch(`/api/save/${i}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const ok = (await put(id, { name: 'Tester<b>', save: { best: 4242, bestDistance: 700, totalRuns: 2, coins: 9 } })).status;
    const got = await (await fetch(`/api/save/${id}`)).json();
    const lb = await (await fetch(`/api/leaderboard?id=${id}`)).json();
    const badId = (await put('nope', { save: {} })).status, badBody = (await put(id, { save: 'x' })).status;
    const big = (await put(id, { save: { x: 'a'.repeat(30000) } })).status;
    const none = (await fetch(`/api/save/${crypto.randomUUID()}`)).status;
    return { ok, name: got.name, best: got.save.best, rank: lb.rank, me: lb.top.some((e) => e.me && e.best === 4242), badId, badBody, big, none };
  });
  check('API stores and returns a player save', r.ok === 200 && r.best === 4242, JSON.stringify(r));
  check('names are sanitised, leaderboard ranks the player', r.name === 'Testerb' && r.rank >= 1 && r.me);
  check('API rejects bad ids, bodies, oversize uploads and unknown players', r.badId === 400 && r.badBody === 400 && r.big === 413 && r.none === 404);

  r = await page.evaluate(async () => {
    const g = window.__game, T = window.T, Store = await import('/js/storage.js'), Cloud = await import('/js/cloud.js');
    Store.get().settings.name = 'Vivek'; Store.save();
    T.start(); g.runCoins = 33; T.add('wall', 1, 20); T.until(() => g.state === 'over', 10);
    await new Promise((r) => setTimeout(r, 3500));            // debounce window, then it uploads on its own
    const remote = await (await fetch(`/api/save/${Cloud.playerId()}`)).json();
    return { remoteBest: remote.save.best, localBest: Store.get().best, name: remote.name, runs: remote.save.totalRuns, lifeCoins: remote.save.lifetime.coins };
  });
  check('finishing a run auto-uploads the stats to the server', r.remoteBest === r.localBest && r.remoteBest > 0 && r.name === 'Vivek' && r.lifeCoins >= 33, JSON.stringify(r));

  r = await page.evaluate(async () => {
    const Store = await import('/js/storage.js'), Cloud = await import('/js/cloud.js');
    const code = Cloud.playerId(), before = Store.get().best;
    await Cloud.push();
    localStorage.removeItem('labyrinth-run-save-v1');            // simulate "cleared site data" on the device...
    Store.load(); const wiped = Store.get().best;
    await Store.restoreFromMirror?.();
    await Cloud.restore(code);                                    // ...and recover from the recovery code
    return { before, wiped, after: Store.get().best };
  });
  check('a recovery code restores progress after local data is wiped', r.wiped === 0 && r.after === r.before && r.before > 0, JSON.stringify(r));

  r = await page.evaluate(async () => {
    const Store = await import('/js/storage.js'); Store.save(); await new Promise((r) => setTimeout(r, 800));
    localStorage.removeItem('labyrinth-run-save-v1');
    const restored = await Store.restoreFromMirror(); Store.load();
    return { restored, best: Store.get().best };
  });
  check('IndexedDB mirror restores a save that localStorage lost', r.restored && r.best > 0, JSON.stringify(r));

  await page.evaluate(() => { const g = window.__game; g.state = 'menu'; g.resetRun(); g.ui.showMenu(); });
  await page.click('#btnBoard');
  await page.waitForFunction(() => document.querySelectorAll('#boardList li').length > 0, null, { timeout: 8000 });
  check('leaderboard screen lists players and highlights you', (await page.locator('#boardList li.me').count()) === 1 && (await page.locator('#boardStats div').count()) === 9);
  if (SHOTS) await page.screenshot({ path: path.join(ROOT, 'screenshots/leaderboard.png') });
  await page.click('#board .back');
  await page.click('#btnSettings');
  await page.fill('#setName', 'Maze Master'); await page.dispatchEvent('#setName', 'change');
  r = await page.evaluate(async () => { const m = await import('/js/storage.js'); return m.get().settings.name; });
  check('nickname is saved', r === 'Maze Master');
  check('recovery code is shown', /^[0-9a-f-]{36}$/i.test(await page.textContent('#setId')));
  await page.click('#settings .back');

  console.log('PWA');
  const man = await page.evaluate(async () => { const r = await fetch('/manifest.webmanifest'); const m = await r.json(); const ok = await Promise.all(m.icons.map((i) => fetch(i.src).then((x) => x.ok))); return { name: m.name, display: m.display, icons: ok }; });
  check('web manifest is served and all its icons exist', man.name === 'Labyrinth Run' && man.icons.every(Boolean), JSON.stringify(man));
  await page.evaluate(() => navigator.serviceWorker.ready);
  check('service worker is active', await page.evaluate(() => !!navigator.serviceWorker.controller || !!navigator.serviceWorker.ready));
  await page.waitForTimeout(1500);
  const cached = await page.evaluate(async () => (await (await caches.open('labyrinth-run-v2')).keys()).length);
  check('app shell is precached for offline play', cached >= 30, `${cached} files`);

  console.log('Pause, controls & visuals');
  await page.click('#btnPlay');
  await page.waitForFunction(() => window.__game.state === 'running', null, { timeout: 30000 });
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  check('keyboard changes lane', await page.evaluate(() => window.__game.player.target === 0));
  await page.keyboard.press('p');
  check('P pauses', await page.evaluate(() => window.__game.state === 'paused') && (await page.isVisible('#pause')));
  await page.click('#btnResume');
  await page.waitForFunction(() => window.__game.state === 'running', null, { timeout: 15000 });
  check('resume returns to the run after a countdown', true);
  // touch swipe
  const box = await page.locator('#game').boundingBox();
  await page.mouse.move(box.x + 640, box.y + 400); await page.mouse.down(); await page.mouse.move(box.x + 760, box.y + 405, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(300);
  check('swipe right changes lane', await page.evaluate(() => window.__game.player.target === 1));
  if (SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(ROOT, 'screenshots/gameplay.png') }); }
  // canvas is not blank
  const lum = await page.evaluate(() => { const g = window.__game; g.composer.render(0.016); const c = document.createElement('canvas'); c.width = 64; c.height = 36; const x = c.getContext('2d'); x.drawImage(document.getElementById('game'), 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; });
  check('the 3D scene renders in a bright, light theme', lum > 80, `avg luminance ${lum.toFixed(1)}`);

  console.log('Endless-run fuzz (bot plays ~10 simulated minutes, all biomes)');
  r = await page.evaluate(() => {
    const g = window.__game; g.state = 'menu'; g.ui.hide('pause'); g.play(); let n = 0; while (g.state !== 'running' && n++ < 600) g.step(1 / 60);
    const w = g.world; let t = 0;
    const biomes = new Set(); let trace = null; const origDie = g.die.bind(g);
    g.die = (c) => { trace = { c, lane: g.player.target, x: +g.player.x.toFixed(2), y: +g.player.y.toFixed(2), roll: g.player.rollT > 0, near: w.solids.filter((s) => Math.abs(s.s0 - g.dist) < 14).map((s) => `${s.type}${s.lane}@${(s.s0 - g.dist).toFixed(1)}..${(s.s1 - g.dist).toFixed(1)}${s.ghost ? 'G' : ''}${s.ignore ? 'I' : ''}`) }; origDie(c); };
    // A look-ahead bot: backward DP over lane-reachability that uses the same movement rules it executes
    // (never cut into a lane that has an obstacle right there), jumps barriers and rolls under beams.
    const bot = () => {
      const p = g.player, sp = Math.max(g.speed, 10), look = Math.max(60, sp * 2.6), STEP = 4, n = Math.floor(look / STEP);
      const sols = w.solids.filter((sd) => !sd.ghost && !sd.ignore && sd.s1 > g.dist - 5 && sd.s0 < g.dist + look + 10);
      const fatal = (l, s) => sols.some((sd) => sd.lane === l && (sd.type === 'wall' || sd.type === 'block') && s > sd.s0 - 1.8 && s < sd.s1 + 1.8);
      const canEnter = (m, s) => !sols.some((sd) => sd.lane === m && sd.s0 - 2.4 < s + sp * 0.18 && sd.s1 + 2.4 > s);
      const safe = Array.from({ length: n + 1 }, () => [false, false, false]);
      for (let l = 0; l < 3; l++) safe[n][l] = !fatal(l, g.dist + n * STEP);
      for (let i = n - 1; i >= 0; i--) for (let l = 0; l < 3; l++) {
        const s = g.dist + i * STEP;
        if (fatal(l, s)) continue;
        if (safe[i + 1][l]) { safe[i][l] = true; continue; }
        for (const m of [l - 1, l + 1]) if (m >= 0 && m <= 2 && canEnter(m, s) && safe[i + 1][m]) { safe[i][l] = true; break; }
      }
      const cur = p.target; let want = cur;
      if (!safe[1][cur]) for (const m of [cur - 1, cur + 1]) if (m >= 0 && m <= 2 && canEnter(m, g.dist) && safe[1][m]) { want = m; break; }
      if (want !== cur) g.action(want < cur ? 'left' : 'right');
      let near = null;
      for (const sd of sols) if (sd.lane === p.target && (sd.type === 'low' || sd.type === 'high')) { const d = sd.s0 - g.dist; if (d > -0.3 && (!near || d < near.d)) near = { d, type: sd.type }; }
      if (near && near.d < sp * 0.3 && near.d > 0.2) g.action(near.type === 'low' ? 'jump' : 'roll');
    };
    while (t < 600 && g.state === 'running') {
      bot();
      if (t % 37 < 1 / 60) g.grant(['magnet', 'double', 'boots', 'wings', 'shield'][Math.floor(t / 37) % 5], g.player.x, 1);
      g.step(1 / 60); g.time += 1 / 60; t += 1 / 60; biomes.add(g.biomeIdx);
    }
    g.die = origDie;
    return { t: Math.round(t), st: g.state, dist: Math.round(g.dist), cause: g.cause, speed: +g.speed.toFixed(1), biomes: [...biomes], coins: g.runCoins, trace };
  });
  check('10 minutes of bot play never hit an impossible pattern', r.st === 'running' && r.t >= 600, JSON.stringify(r));
  check('all four biomes were visited', r.biomes.length === 4);
  check('speed ramps up to the cap', r.speed >= 35);
} catch (e) {
  fail++; console.log('  FAIL  test run crashed:', e.message);
}

const bad = problems.filter((p) => !/status of (400|404|413)|GPU stall|swiftshader|WebGL: INVALID_VALUE: texImage|Automatic fallback to software WebGL|GL Driver Message/i.test(p));
check('no console errors or page exceptions', bad.length === 0, bad.slice(0, 3).join(' | '));

await browser.close(); server.kill();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
