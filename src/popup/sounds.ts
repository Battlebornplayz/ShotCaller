import type { RarityTier } from '../../shared/types';

/**
 * Unlock sounds, synthesized with Web Audio so there are no audio files to ship.
 * Rarer tiers get more notes, a bass hit, a shimmer and (legendary) a fanfare.
 * The custom sound pack replaces these in Phase 11.
 */

const C4 = 261.63,
  E4 = 329.63,
  F4 = 349.23,
  G4 = 392,
  A4 = 440,
  B4 = 493.88,
  C5 = 523.25,
  D5 = 587.33,
  E5 = 659.25,
  G5 = 783.99,
  B5 = 987.77,
  C6 = 1046.5,
  E6 = 1318.5,
  G6 = 1568;

export function playUnlockSound(tier: RarityTier, volume: number): void {
  if (volume <= 0) return;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = Math.min(1, volume) * 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  const t0 = ctx.currentTime + 0.05;

  /** A bell-ish tone: fundamental + soft octave partial, fast attack, exponential decay. */
  const bell = (freq: number, at: number, dur = 0.9, gain = 0.35, type: OscillatorType = 'sine') => {
    for (const [mult, g] of [
      [1, gain],
      [2, gain * 0.25],
      [3.01, gain * 0.08],
    ] as const) {
      const o = ctx.createOscillator();
      const e = ctx.createGain();
      o.type = type;
      o.frequency.value = freq * mult;
      e.gain.setValueAtTime(0.0001, t0 + at);
      e.gain.exponentialRampToValueAtTime(g, t0 + at + 0.012);
      e.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(e).connect(master);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.05);
    }
  };

  /** A warm, filtered chord (brass-like for the fanfare). */
  const chord = (freqs: number[], at: number, dur: number, gain = 0.12, cutoff = 2200) => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff * 0.4, t0 + at);
    f.frequency.exponentialRampToValueAtTime(cutoff, t0 + at + 0.08);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t0 + at);
    e.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.04);
    e.gain.setValueAtTime(gain, t0 + at + dur * 0.6);
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    f.connect(e).connect(master);
    for (const freq of freqs) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        o.detune.value = detune;
        o.connect(f);
        o.start(t0 + at);
        o.stop(t0 + at + dur + 0.05);
      }
    }
  };

  /** Sub hit with a falling pitch. */
  const boom = (at: number, gain = 0.6) => {
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.frequency.setValueAtTime(140, t0 + at);
    o.frequency.exponentialRampToValueAtTime(42, t0 + at + 0.5);
    e.gain.setValueAtTime(gain, t0 + at);
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.7);
    o.connect(e).connect(master);
    o.start(t0 + at);
    o.stop(t0 + at + 0.75);
  };

  /** Filtered noise sweep. */
  const whoosh = (at: number, dur: number, gain = 0.12) => {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t0 + at);
    f.frequency.exponentialRampToValueAtTime(6000, t0 + at + dur);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t0 + at);
    e.gain.exponentialRampToValueAtTime(gain, t0 + at + dur * 0.7);
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    src.connect(f).connect(e).connect(master);
    src.start(t0 + at);
  };

  /** Random high glints. */
  const shimmer = (at: number, count: number, spread: number) => {
    const pool = [C6, E6, G6, B5 * 2, C6 * 2];
    for (let i = 0; i < count; i++) bell(pool[i % pool.length], at + (spread * i) / count, 0.5, 0.06);
  };

  let length = 1.2;
  switch (tier) {
    case 'common':
      bell(E5, 0, 0.7, 0.3);
      bell(B5, 0.09, 0.9, 0.3);
      break;
    case 'uncommon':
      bell(C5, 0, 0.6);
      bell(E5, 0.08, 0.6);
      bell(G5, 0.16, 1.1);
      break;
    case 'rare':
      [C5, E5, G5, C6].forEach((n, i) => bell(n, i * 0.07, i === 3 ? 1.4 : 0.6));
      chord([C4, G4], 0.28, 1.2, 0.05, 1400);
      length = 1.8;
      break;
    case 'epic':
      whoosh(0, 0.35, 0.08);
      boom(0.32, 0.5);
      [G4, C5, E5, G5, C6, E6].forEach((n, i) => bell(n, 0.32 + i * 0.055, i === 5 ? 1.6 : 0.6, 0.3));
      chord([C4, E4, G4], 0.36, 1.5, 0.07, 1800);
      shimmer(0.7, 8, 1.0);
      length = 2.6;
      break;
    case 'legendary':
      whoosh(0, 0.6, 0.14);
      boom(0.58, 0.7);
      chord([C4, E4, G4], 0.6, 0.32, 0.13);
      chord([F4, A4, C5], 0.95, 0.32, 0.13);
      chord([G4, B4, D5], 1.3, 0.32, 0.13);
      chord([C5, E5, G5, C6 / 2], 1.65, 1.8, 0.15, 2600);
      boom(1.65, 0.55);
      [C5, E5, G5, C6, E6, G6].forEach((n, i) => bell(n, 1.65 + i * 0.06, i === 5 ? 2 : 0.8, 0.22));
      shimmer(1.9, 14, 1.6);
      length = 4;
      break;
  }
  setTimeout(() => void ctx.close(), (length + 0.5) * 1000);
}
