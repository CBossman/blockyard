import type { SynthKit } from '@platform';
import type { Client } from '@platform/client';

/**
 * The game's voices, synthesised on each screen (`client.audio.define`: nothing is recorded or
 * sent): each gun its own, the reloads, the chest, the parachute, and the storm. The guns play
 * theirs through their looks (`./looks`); the server plays the rest by name.
 */

/** A gunshot: a low punch, a burst of filtered noise, a crack, and a tail. */
function shot(s: SynthKit, o: { punch: number; body: number; bright: number; crack: number; tail: number; loud?: number }) {
  const p = s.pitch;
  const v = o.loud ?? 1;
  s.tone({ wave: 'sine', from: o.punch * p, to: 40, duration: o.body * 0.7, volume: 0.9 * v });
  s.tone({ wave: 'square', from: o.punch * 1.7 * p, to: 70, duration: 0.05, volume: 0.16 * v, lowpass: 900 });
  s.noise({ duration: o.body, filter: 'lowpass', from: o.bright * p, to: 420, volume: 0.7 * v });
  s.noise({ duration: 0.03, filter: 'highpass', from: 5400, to: 3200, volume: o.crack * v });
  if (o.tail > 0) {
    s.noise({ duration: o.tail, delay: 0.04, filter: 'lowpass', from: 1500 * p, to: 170, volume: 0.15 * v });
    s.noise({ duration: o.tail * 0.8, delay: 0.17, filter: 'lowpass', from: 900 * p, to: 120, volume: 0.06 * v });
  }
}

/** A mechanical click. */
function click(s: SynthKit, delay: number, f: number, v = 0.3) {
  s.tone({ wave: 'square', from: f * s.pitch, to: f * 0.6 * s.pitch, duration: 0.035, volume: v * 0.5, delay, lowpass: 3200 });
  s.noise({ duration: 0.04, delay, filter: 'bandpass', from: f * 2.6, to: f * 1.8, q: 3, volume: v });
}

export function defineSounds(client: Client) {
  const a = client.audio;
  a.acoustics({ air: 1, reverb: { near: 0.06, far: 0.5, seconds: 1.6, damp: 0.55 } });

  a.define('shot_plinker', (s) => shot(s, { punch: 220, body: 0.11, bright: 4300, crack: 0.5, tail: 0.24, loud: 0.8 }));
  a.define('shot_zipper', (s) => shot(s, { punch: 190, body: 0.1, bright: 7000, crack: 0.32, tail: 0.16, loud: 0.75 }));
  a.define('shot_trailblazer', (s) => shot(s, { punch: 140, body: 0.19, bright: 5200, crack: 0.45, tail: 0.34 }));
  a.define('shot_boomstick', (s) => shot(s, { punch: 92, body: 0.42, bright: 3000, crack: 0.3, tail: 0.6, loud: 1.2 }));
  a.define('shot_longshot', (s) => {
    shot(s, { punch: 118, body: 0.28, bright: 4200, crack: 0.8, tail: 0.9, loud: 1.2 });
    // The echo off the far hills.
    s.noise({ duration: 0.5, delay: 0.34, filter: 'lowpass', from: 1100, to: 140, volume: 0.1 });
  });
  a.define('reload_mag', (s) => {
    click(s, 0.05, 900, 0.35);
    click(s, 0.55, 700, 0.45);
    click(s, 0.9, 1200, 0.35);
    click(s, 1.0, 1000, 0.4);
  });
  a.define('reload_pistol', (s) => {
    click(s, 0.05, 1100, 0.3);
    click(s, 0.55, 850, 0.4);
    click(s, 0.9, 1400, 0.4);
  });
  a.define('reload_shell', (s) => click(s, 0, 1000, 0.4));
  a.define('pump', (s) => {
    click(s, 0, 800, 0.4);
    click(s, 0.12, 1100, 0.45);
  });
  a.define('bolt', (s) => {
    click(s, 0, 700, 0.4);
    click(s, 0.2, 1000, 0.45);
  });

  // A chest: a creak of wood and a bright little chime as the lid goes back.
  a.define('chest_open', (s) => {
    s.noise({ duration: 0.28, filter: 'bandpass', from: 380, to: 900, q: 4, volume: 0.25 });
    s.tone({ wave: 'triangle', from: 130 * s.pitch, to: 190 * s.pitch, duration: 0.22, volume: 0.2, lowpass: 600 });
    s.tone({ wave: 'sine', from: 1320 * s.pitch, to: 1320 * s.pitch, duration: 0.5, volume: 0.22, delay: 0.14, attack: 0.005 });
    s.tone({ wave: 'sine', from: 1980 * s.pitch, to: 1980 * s.pitch, duration: 0.6, volume: 0.15, delay: 0.2, attack: 0.005 });
    s.tone({ wave: 'sine', from: 2640 * s.pitch, to: 2640 * s.pitch, duration: 0.7, volume: 0.1, delay: 0.26, attack: 0.005 });
  });

  // The parachute opening: a rush of air and a flap.
  a.define('chute', (s) => {
    s.noise({ duration: 0.5, filter: 'lowpass', from: 3000, to: 500, volume: 0.45 });
    s.tone({ wave: 'sine', from: 90 * s.pitch, to: 45, duration: 0.35, volume: 0.5, delay: 0.1 });
  });
  // The storm's low rumble when it starts to close.
  a.define('storm', (s) => {
    s.tone({ wave: 'sawtooth', from: 55 * s.pitch, to: 48, duration: 2.4, volume: 0.35, lowpass: 220, attack: 0.5 });
    s.noise({ duration: 2.4, filter: 'lowpass', from: 400, to: 140, volume: 0.25, attack: 0.5 });
  });
  // The bus's horn as it leaves.
  a.define('horn', (s) => {
    s.tone({ wave: 'sawtooth', from: 196 * s.pitch, to: 190 * s.pitch, duration: 0.9, volume: 0.3, lowpass: 900, attack: 0.04 });
    s.tone({ wave: 'sawtooth', from: 247 * s.pitch, to: 240 * s.pitch, duration: 0.9, volume: 0.22, lowpass: 900, attack: 0.04 });
  });

  // Wind that rises as someone falls: a loop the client's frame hook sets.
  a.defineLoop('freefall', (l) => {
    l.noise({ freq: 700, filter: 'bandpass', q: 0.7, volume: 0.9 });
    l.noise({ freq: 2400, filter: 'highpass', volume: 0.25 });
  });
}
