import { MISSION_TEMPLATES, MAX_MULTIPLIER } from './config.js';
import * as Store from './storage.js';

const reward = (goalIdx) => 120 + goalIdx * 90;

function generate() {
  const save = Store.get();
  const gi = Math.min(4, save.missionSet);
  const pool = [...MISSION_TEMPLATES];
  const picks = [];
  while (picks.length < 3) {
    const i = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  save.missions = picks.map((t) => ({ id: t.id, gi, progress: 0, done: false }));
  Store.save();
}

export function ensure() {
  const save = Store.get();
  if (!save.missions || save.missions.length !== 3 || save.missions.some((m) => !MISSION_TEMPLATES.find((t) => t.id === m.id))) generate();
  return save.missions;
}

const tplOf = (m) => MISSION_TEMPLATES.find((t) => t.id === m.id);

export function describe(m) {
  const t = tplOf(m), goal = t.goals[m.gi];
  return { text: t.text(goal), goal, progress: Math.min(goal, Math.floor(m.progress)), done: m.done, reward: reward(m.gi) };
}

export function list() { return ensure().map(describe); }

/** Projected progress during a run (not persisted). Returns the missions newly completed by `stats`. */
export function peek(stats, notified) {
  const out = [];
  ensure().forEach((m, i) => {
    if (m.done || notified.has(i)) return;
    const t = tplOf(m), goal = t.goals[m.gi];
    const cur = t.single ? Math.max(m.progress, stats[t.key] || 0) : m.progress + (stats[t.key] || 0);
    if (cur >= goal) { notified.add(i); out.push({ idx: i, text: t.text(goal), reward: reward(m.gi) }); }
  });
  return out;
}

/** Persist a finished run. Returns { completed, newSet, bonusCoins }. */
export function commit(stats) {
  const save = Store.get();
  const ms = ensure();
  const completed = [];
  ms.forEach((m) => {
    if (m.done) return;
    const t = tplOf(m), goal = t.goals[m.gi];
    m.progress = t.single ? Math.max(m.progress, stats[t.key] || 0) : m.progress + (stats[t.key] || 0);
    if (m.progress >= goal) { m.done = true; m.progress = goal; completed.push({ text: t.text(goal), reward: reward(m.gi) }); }
  });
  let bonus = completed.reduce((a, c) => a + c.reward, 0);
  let newSet = false;
  if (ms.every((m) => m.done)) {
    newSet = true;
    save.rank = Math.min(MAX_MULTIPLIER - 1, save.rank + 1);
    save.missionSet += 1;
    save.missions = null;
    ensure();
  }
  save.coins += bonus;
  Store.save();
  return { completed, newSet, bonusCoins: bonus };
}
