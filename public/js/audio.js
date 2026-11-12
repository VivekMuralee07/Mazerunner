// Fully synthesised audio (no asset files): SFX + a procedural driving score.
import * as Store from './storage.js';

let ctx = null, master, sfxGain, musicGain, noiseBuf;
let musicTimer = null, step = 0, nextTime = 0, tempo = 118, intensity = 0;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.connect(master);
  musicGain = ctx.createGain(); musicGain.connect(master);
  applySettings();
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

export function unlock() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
}

export function applySettings() {
  if (!ctx) return;
  const s = Store.get().settings;
  sfxGain.gain.value = s.sfx ? 0.9 : 0;
  musicGain.gain.value = s.music ? 0.38 : 0;
}

function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.005, dest } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || sfxGain);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, { vol = 0.3, freq = 1200, q = 1, type = 'bandpass', sweep = 0, delay = 0, dest } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest || sfxGain);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

let lastCoin = 0, coinPitch = 0;
let mood = 'normal';
/** 'retro' = the synth-wave score used in the Hollow Realm / during the car ride. */
export function setMood(m) { mood = m; }

let engineNodes = null;
export function engine(on) {
  if (!ctx) return;
  if (on && !engineNodes) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxGain); o.start(); o2.start(); g.gain.setTargetAtTime(0.15, ctx.currentTime, 0.2);
    engineNodes = { o, o2, f, g };
  } else if (!on && engineNodes) {
    const e = engineNodes; engineNodes = null; e.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch { /* ignore */ } }, 500);
  }
}
export function engineSpeed(v, boost) {
  if (!engineNodes) return;
  const f = 46 + v * 3.2 + (boost ? 30 : 0), t = ctx.currentTime;
  engineNodes.o.frequency.setTargetAtTime(f, t, 0.05); engineNodes.o2.frequency.setTargetAtTime(f * 0.502, t, 0.05);
  engineNodes.f.frequency.setTargetAtTime(500 + v * 20 + (boost ? 500 : 0), t, 0.1);
}

export const sfx = {
  horn() { tone(392, 0.45, { type: 'square', vol: 0.12 }); tone(494, 0.45, { type: 'square', vol: 0.1 }); },
  smash() { noise(0.4, { vol: 0.45, freq: 900, sweep: -700, type: 'lowpass' }); tone(80, 0.3, { type: 'sine', vol: 0.4, slide: -40 }); tone(220, 0.18, { type: 'sawtooth', vol: 0.12, slide: -150 }); },
  nitro() { noise(0.8, { vol: 0.3, freq: 500, sweep: 4500, q: 0.8, type: 'bandpass' }); tone(120, 0.8, { type: 'sawtooth', vol: 0.18, slide: 380 }); },
  thunder() { noise(1.6, { vol: 0.5, freq: 380, sweep: -280, type: 'lowpass' }); tone(46, 1.4, { type: 'sine', vol: 0.45, slide: -12 }); },
  skid() { noise(0.7, { vol: 0.22, freq: 2400, sweep: -1800, q: 1.4, type: 'bandpass' }); },
  click() { unlock(); tone(520, 0.08, { type: 'triangle', vol: 0.2 }); tone(780, 0.1, { type: 'triangle', vol: 0.15, delay: 0.04 }); },
  coin() {
    const now = performance.now();
    coinPitch = now - lastCoin < 400 ? Math.min(coinPitch + 1, 7) : 0; lastCoin = now;
    const f = 988 * Math.pow(1.0595, coinPitch * 2);
    tone(f, 0.12, { type: 'square', vol: 0.08 });
    tone(f * 1.5, 0.22, { type: 'sine', vol: 0.16, delay: 0.05 });
  },
  jump() { tone(280, 0.28, { type: 'sine', vol: 0.22, slide: 420 }); noise(0.18, { vol: 0.08, freq: 900, sweep: 1500, q: 0.8 }); },
  boost() { tone(320, 0.4, { type: 'triangle', vol: 0.25, slide: 700 }); },
  land() { tone(110, 0.14, { type: 'sine', vol: 0.3, slide: -50 }); noise(0.1, { vol: 0.08, freq: 500, type: 'lowpass' }); },
  roll() { noise(0.4, { vol: 0.18, freq: 2200, sweep: -1700, q: 0.7 }); tone(220, 0.3, { type: 'sine', vol: 0.12, slide: -100 }); },
  lane() { noise(0.12, { vol: 0.1, freq: 1800, sweep: -900, q: 1.2 }); },
  step() { noise(0.05, { vol: 0.05, freq: 700, type: 'lowpass' }); },
  stumble() { tone(90, 0.35, { type: 'sawtooth', vol: 0.3, slide: -40 }); noise(0.35, { vol: 0.3, freq: 600, type: 'lowpass' }); },
  crash() {
    tone(70, 0.9, { type: 'sawtooth', vol: 0.4, slide: -45 });
    noise(0.9, { vol: 0.5, freq: 1200, sweep: -1000, type: 'lowpass' });
    tone(40, 1.0, { type: 'sine', vol: 0.5 });
  },
  roar() {
    tone(95, 0.9, { type: 'sawtooth', vol: 0.28, slide: -30 });
    tone(140, 0.9, { type: 'square', vol: 0.1, slide: -60 });
    noise(0.9, { vol: 0.22, freq: 400, sweep: 300, q: 2 });
  },
  turn() { noise(0.35, { vol: 0.2, freq: 900, sweep: -600, q: 0.8 }); tone(330, 0.2, { type: 'triangle', vol: 0.12, slide: 220 }); },
  rumble() { noise(0.55, { vol: 0.5, freq: 160, sweep: -60, q: 0.7, type: 'lowpass' }); tone(48, 0.5, { type: 'sine', vol: 0.35, slide: -10 }); },
  growl() { tone(70, 0.5, { type: 'sawtooth', vol: 0.12, slide: 15 }); noise(0.5, { vol: 0.08, freq: 300, type: 'lowpass' }); },
  power() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.22, delay: i * 0.07 })); },
  shieldBreak() { noise(0.5, { vol: 0.35, freq: 4000, sweep: -3000, q: 0.6 }); tone(880, 0.4, { type: 'triangle', vol: 0.25, slide: -600 }); },
  mission() { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.22, delay: i * 0.09 })); },
  count() { tone(440, 0.15, { type: 'square', vol: 0.12 }); },
  go() { tone(880, 0.35, { type: 'square', vol: 0.14 }); tone(1320, 0.4, { type: 'triangle', vol: 0.12, delay: 0.05 }); },
  buy() { tone(740, 0.12, { type: 'triangle', vol: 0.2 }); tone(1110, 0.25, { type: 'triangle', vol: 0.2, delay: 0.08 }); },
  deny() { tone(160, 0.25, { type: 'square', vol: 0.15, slide: -40 }); },
};

// ---------- Music: Dm pulse, evolving with intensity ----------
const BASS = [0, 0, 7, 0, 5, 5, 3, 7];             // semitones above D1 per 8th note
const ARP = [0, 7, 12, 15, 12, 7, 10, 14];
const D = 36.7;                                   // D1
const hz = (semi, oct = 0) => D * Math.pow(2, (semi + oct * 12) / 12);

const RETRO_ROOT = [0, 8, 3, 10];                        // A minor, F, C, G (semitones above A1)
function scheduleRetro(t, s) {
  const dur = 60 / tempo / 2, bar = Math.floor(s / 8) % 4, i = s % 8, base = 55 * Math.pow(2, RETRO_ROOT[bar] / 12);
  const third = bar === 0 ? 3 : 4;
  oscAt(base, t, dur * 0.85, 'sawtooth', 0.2, 420 + (i % 2) * 380);                     // pulsing bass
  oscAt(base * 4 * Math.pow(2, [0, third, 7, 12, 7, third, 12, 7][i] / 12), t, dur * 0.7, 'square', 0.06, 2800);   // arpeggio
  if (i === 0) for (const iv of [0, third, 7]) { oscAt(base * 2 * Math.pow(2, iv / 12) * 1.004, t, dur * 8, 'sawtooth', 0.035, 1100); oscAt(base * 2 * Math.pow(2, iv / 12) * 0.996, t, dur * 8, 'sawtooth', 0.035, 1100); }
  if (i % 4 === 0) kickAt(t); if (i === 4) snareAt(t); if (i % 2 === 1) hatAt(t, 0.07);
}

function scheduleStep(t, s) {
  if (mood === 'retro') return scheduleRetro(t, s);
  const dur = 60 / tempo / 2;
  const bar = Math.floor(s / 8) % 4;
  const root = [0, 0, -2, 3][bar];
  const i = s % 8;
  // bass
  oscAt(hz(BASS[i] + root, 0), t, dur * 0.9, 'sawtooth', 0.22, 340 + intensity * 500);
  // kick on 1 and 5, tick on every step
  if (i % 4 === 0) kickAt(t);
  if (i % 2 === 1) hatAt(t, 0.05 + intensity * 0.05);
  if (i === 4 && intensity > 0.15) snareAt(t);
  // arp (enters with intensity)
  if (intensity > 0.2) oscAt(hz(ARP[i] + root, 2), t, dur * 0.8, 'triangle', 0.1 * Math.min(1, intensity + 0.3), 2400);
  // pad on bar start
  if (i === 0) {
    [0, 7, 15].forEach((n) => oscAt(hz(n + root, 2), t, dur * 8, 'sine', 0.05, 1200));
  }
}

function oscAt(f, t, dur, type, vol, cutoff) {
  const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = f;
  fl.type = 'lowpass'; fl.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); fl.connect(g); g.connect(musicGain);
  o.start(t); o.stop(t + dur + 0.05);
}
function kickAt(t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
  g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.25);
}
function hatAt(t, vol) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(f); f.connect(g); g.connect(musicGain); s.start(t, Math.random()); s.stop(t + 0.08);
}
function snareAt(t) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  s.connect(f); f.connect(g); g.connect(musicGain); s.start(t, Math.random()); s.stop(t + 0.2);
}

export function startMusic() {
  if (!ensure()) return;
  unlock();
  if (musicTimer) return;
  step = 0; nextTime = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.25) {
      scheduleStep(nextTime, step++);
      nextTime += 60 / tempo / 2;
    }
  }, 60);
}
export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
/** 0 = menu ambience, 1 = full intensity (top speed). */
export function setIntensity(v, speedNorm = 0) {
  intensity = v;
  tempo = 108 + speedNorm * 38;
}
export function duck(on) {
  if (!ctx) return;
  const s = Store.get().settings;
  musicGain.gain.setTargetAtTime(s.music ? (on ? 0.12 : 0.38) : 0, ctx.currentTime, 0.1);
}
