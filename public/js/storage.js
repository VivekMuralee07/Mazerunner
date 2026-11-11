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
  settings: { music: true, sfx: true, quality: 'auto', tutorialDone: false },
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

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(get())); } catch { /* ignore */ }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  data = DEFAULTS();
  return data;
}
