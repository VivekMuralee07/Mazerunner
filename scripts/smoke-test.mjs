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
const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
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
  check('the 3D scene actually renders (canvas is not black)', lum > 8, `avg luminance ${lum.toFixed(1)}`);

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

const bad = problems.filter((p) => !/GPU stall|swiftshader|WebGL: INVALID_VALUE: texImage|Automatic fallback to software WebGL|GL Driver Message/i.test(p));
check('no console errors or page exceptions', bad.length === 0, bad.slice(0, 3).join(' | '));

await browser.close(); server.kill();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
