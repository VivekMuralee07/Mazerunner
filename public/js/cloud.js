// Optional server-side copy of the player's progress (keyed by an anonymous id) + the leaderboard.
// The game works fully offline: every call here fails silently.
import * as Store from './storage.js';

const ID_KEY = 'labyrinth-run-player-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function playerId() {
  let id = null;
  try { id = localStorage.getItem(ID_KEY); } catch { /* ignore */ }
  if (!id || !UUID.test(id)) { id = uuid(); try { localStorage.setItem(ID_KEY, id); } catch { /* ignore */ } }
  return id;
}

let timer = null;
export const status = { ok: null, last: 0 };

export async function push() {
  const s = Store.get();
  try {
    const r = await fetch(`/api/save/${playerId()}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: s.settings.name, save: s }), keepalive: true });
    status.ok = r.ok; status.last = Date.now();
  } catch { status.ok = false; }
}

/** Debounced upload after every local save. */
export function init() {
  Store.onSave(() => { clearTimeout(timer); timer = setTimeout(push, 2500); });
  const s = Store.get();
  if (s.best > 0 || s.coins > 0 || s.totalRuns > 0) push();      // make sure existing players are backed up too
}

export async function leaderboard() {
  const r = await fetch(`/api/leaderboard?id=${playerId()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('unavailable');
  return r.json();
}

/** Restore progress from a recovery code. Returns true on success. */
export async function restore(code) {
  const id = String(code || '').trim().toLowerCase();
  if (!UUID.test(id)) throw new Error('That code doesn\u2019t look right.');
  const r = await fetch(`/api/save/${id}`, { cache: 'no-store' });
  if (r.status === 404) throw new Error('No saved progress found for that code.');
  if (!r.ok) throw new Error('Could not reach the server.');
  const j = await r.json();
  try { localStorage.setItem(ID_KEY, id); } catch { /* ignore */ }
  Store.replace(j.save);
  if (j.name && !Store.get().settings.name) { Store.get().settings.name = j.name; Store.save(); }
  return true;
}
