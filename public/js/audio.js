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
export const sfx = {
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

function scheduleStep(t, s) {
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
