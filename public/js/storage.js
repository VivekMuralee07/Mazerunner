import { SKINS } from './config.js';

const KEY = 'labyrinth-run-save-v1';

const DEFAULTS = () => ({
  coins: 0,
  best: 0,
  bestDistance: 0,
  totalRuns: 0,
  skin: 'explorer',
  ownedSkins: ['explorer'],
  upgrades: { magnet: 0, double: 0, boots: 0, wings: 0 },
  rank: 0,                  // permanent score multiplier level (from missions)
  missionSet: 0,
  missions: null,           // generated lazily by missions.js
  lifetime: { distance: 0, coins: 0, jumps: 0, rolls: 0, powerups: 0, lanes: 0, climbs: 0, time: 0 },
  settings: { music: true, sfx: true, quality: 'auto', tutorialDone: false, name: '', namePrompted: false },
});

let data = null;

function merge(base, extra) {
  for (const k of Object.keys(base)) {
    if (extra && typeof extra[k] === typeof base[k] && extra[k] !== null) {
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], extra[k]);
      else base[k] = extra[k];
    }
  }
  return base;
}

export function load() {
  const d = DEFAULTS();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      merge(d, parsed);
      if (parsed.missions) d.missions = parsed.missions;
    }
  } catch { /* private mode or corrupt – fall back to defaults */ }
  if (!SKINS.some((s) => s.id === d.skin)) d.skin = 'explorer';
  if (!d.ownedSkins.includes('explorer')) d.ownedSkins.push('explorer');
  data = d;
  return data;
}

export function get() {
  return data || load();
}

const listeners = [];
/** Register a callback that runs after every save (used for cloud sync). */
export function onSave(fn) { listeners.push(fn); }

export function save() {
  const json = JSON.stringify(get());
  try { localStorage.setItem(KEY, json); } catch { /* ignore */ }
  idbMirror(json);
  for (const fn of listeners) { try { fn(); } catch { /* ignore */ } }
}

/** Replace the whole save (used when restoring from a recovery code). */
export function replace(obj) {
  const d = DEFAULTS();
  merge(d, obj || {});
  if (obj && obj.missions) d.missions = obj.missions;
  data = d; save(); return data;
}

// ---- a second copy in IndexedDB + a request for "persistent" storage, so the browser doesn't evict progress
const IDB = 'labyrinth-run', STORE = 'kv';
function idb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no idb'));
    const rq = indexedDB.open(IDB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
let idbTimer = null;
function idbMirror(json) {
  clearTimeout(idbTimer);
  idbTimer = setTimeout(async () => {
    try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).put(json, KEY); } catch { /* ignore */ }
  }, 400);
}
/** Call once before load(): if localStorage was wiped but IndexedDB still has the save, bring it back. */
export async function restoreFromMirror() {
  try {
    if (localStorage.getItem(KEY)) return false;
    const db = await idb();
    const json = await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    if (json) { localStorage.setItem(KEY, json); return true; }
  } catch { /* ignore */ }
  return false;
}
export async function requestPersistence() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  data = DEFAULTS();
  return data;
}
