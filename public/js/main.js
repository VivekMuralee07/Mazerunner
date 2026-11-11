import { UI } from './ui.js';
import { Game } from './game.js';
import { Input } from './input.js';
import * as Audio from './audio.js';
import * as Store from './storage.js';
import * as Missions from './missions.js';

const ui = new UI();
// a clicked button must not keep keyboard focus, otherwise Space/Enter would re-trigger it mid-run
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
const canvas = document.getElementById('game');

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

async function boot() {
  Store.load(); Missions.ensure();
  if (!webglOk()) { ui.loadError('Your browser does not support WebGL. Please try an up-to-date Chrome, Edge, Firefox or Safari.'); return; }
  const game = new Game(canvas, ui);
  window.__game = game;                    // handy for debugging / automated tests
  ui.bind(game);
  new Input(canvas, (a) => { Audio.unlock(); game.action(a); });
  addEventListener('keydown', () => Audio.unlock(), { once: true });
  addEventListener('pointerdown', () => Audio.unlock(), { once: true });
  const msgs = ['Carving the corridors…', 'Lighting the torches…', 'Waking the Minotaur…', 'Ready!'];
  await game.init((p) => ui.loading(p, msgs[Math.min(3, Math.floor(p * 4))]));
  Audio.applySettings();
  ui.loaded();
}

boot().catch((err) => {
  console.error(err);
  ui.loadError(`Something went wrong while loading: ${err && err.message ? err.message : err}`);
});
