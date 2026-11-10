import type { Client } from '@platform/client';
import { UNITS, type UnitKind } from '../defs';
import { UNIT_ORDER } from '../protocol';

/**
 * Block Command's sounds, synthesised on each screen (`client.audio.define`: nothing recorded):
 * each weapon its own report (a rifle's crack, a rocket's whoosh, a tank's boom, the artillery's deep
 * thud and roll, the flak's pops, a machine gun's rattle), the radio's click and squelch, a unit
 * ready, a building done, a star won; the wind over the field. And the units' voices: a line when
 * they're picked out or given an order, spoken by the browser's own speech (off with the speaker
 * button at the top), in a radio's manner.
 */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
let client: Client;

export function setupSounds(c: Client): void {
  client = c;
  const a = c.audio;
  a.acoustics({ air: 1, reverb: { near: 0.12, far: 0.5, seconds: 1.6, damp: 0.5 } });
  a.define('cm_rifle', (s) => {
    const p = s.pitch * rnd(0.92, 1.08);
    s.noise({ duration: 0.09, from: 5200 * p, to: 1400 * p, filter: 'bandpass', q: 0.8, volume: 0.5, attack: 0.001 });
    s.tone({ wave: 'square', from: 420 * p, to: 90 * p, duration: 0.07, volume: 0.18, drive: 0.6, lowpass: 2400 });
  });
  a.define('cm_rocket', (s) => {
    const p = s.pitch * rnd(0.95, 1.05);
    s.noise({ duration: 0.45, from: 900 * p, to: 3800 * p, filter: 'bandpass', q: 1.4, volume: 0.35, attack: 0.03 });
    s.tone({ wave: 'sawtooth', from: 160 * p, to: 50 * p, duration: 0.25, volume: 0.25, lowpass: 700, drive: 0.4 });
  });
  a.define('cm_cannon', (s) => {
    const p = s.pitch * rnd(0.94, 1.04);
    s.tone({ wave: 'sine', from: 120 * p, to: 34 * p, duration: 0.55, volume: 0.7, drive: 0.5 });
    s.noise({ duration: 0.4, from: 2400 * p, to: 200 * p, filter: 'lowpass', volume: 0.55, attack: 0.002 });
    s.noise({ duration: 0.05, from: 6000 * p, filter: 'highpass', volume: 0.25 });
  });
  a.define('cm_arty', (s) => {
    const p = s.pitch * rnd(0.94, 1.04);
    s.tone({ wave: 'sine', from: 80 * p, to: 24 * p, duration: 1.1, volume: 0.8, drive: 0.6 });
    s.noise({ duration: 1.3, from: 1400 * p, to: 90 * p, filter: 'lowpass', volume: 0.6, attack: 0.004 });
    // (The roll of it off the hills.)
    s.noise({ duration: 1.2, from: 500 * p, to: 120 * p, filter: 'lowpass', volume: 0.25, delay: 0.25, attack: 0.1 });
  });
  a.define('cm_flak', (s) => {
    for (let i = 0; i < 3; i++) {
      const p = s.pitch * rnd(0.9, 1.1);
      s.noise({ duration: 0.07, from: 3200 * p, to: 700 * p, filter: 'bandpass', q: 1, volume: 0.32, delay: i * 0.09 });
      s.tone({ wave: 'square', from: 300 * p, to: 80 * p, duration: 0.06, volume: 0.12, delay: i * 0.09, lowpass: 1400 });
    }
  });
  a.define('cm_mg', (s) => {
    for (let i = 0; i < 4; i++) {
      const p = s.pitch * rnd(0.92, 1.08);
      s.noise({ duration: 0.05, from: 4200 * p, to: 1100 * p, filter: 'bandpass', q: 1, volume: 0.28, delay: i * 0.065 });
    }
  });
  // Coming in, then tearing away.
  a.define('cm_jet', (s) => {
    s.noise({ duration: 1.5, from: 420, to: 3200, filter: 'bandpass', q: 0.6, volume: 0.55, attack: 0.9 });
    s.noise({ duration: 1.6, from: 2600, to: 240, filter: 'lowpass', volume: 0.5, delay: 1.1, attack: 0.05 });
    s.tone({ wave: 'sawtooth', from: 210, to: 60, duration: 2.4, volume: 0.1, lowpass: 520 });
  });
  a.define('cm_thump', (s) => {
    s.tone({ wave: 'sine', from: 140 * s.pitch, to: 50 * s.pitch, duration: 0.2, volume: 0.45 });
    s.noise({ duration: 0.12, from: 800, to: 200, filter: 'lowpass', volume: 0.3 });
  });
  // The radio: a click and a burst of squelch.
  a.define('cm_radio', (s) => {
    s.noise({ duration: 0.03, from: 3000, filter: 'highpass', volume: 0.18 });
    s.noise({ duration: 0.16, from: 1800, to: 2600, filter: 'bandpass', q: 3, volume: 0.07, delay: 0.02 });
    s.tone({ wave: 'sine', from: 1450, duration: 0.05, volume: 0.06, delay: 0.01 });
  }, { reverb: 0 });
  a.define('cm_select', (s) => {
    s.tone({ wave: 'triangle', from: 880 * s.pitch, to: 1320 * s.pitch, duration: 0.06, volume: 0.12 });
  }, { reverb: 0 });
  a.define('cm_ready', (s) => {
    s.tone({ wave: 'triangle', from: 660, duration: 0.09, volume: 0.16 });
    s.tone({ wave: 'triangle', from: 990, duration: 0.14, volume: 0.16, delay: 0.1 });
  }, { reverb: 0 });
  a.define('cm_built', (s) => {
    s.noise({ duration: 0.15, from: 900, to: 300, filter: 'lowpass', volume: 0.3 });
    s.tone({ wave: 'triangle', from: 523, duration: 0.12, volume: 0.15, delay: 0.08 });
    s.tone({ wave: 'triangle', from: 784, duration: 0.2, volume: 0.15, delay: 0.2 });
  }, { reverb: 0 });
  // A star won: a little brass fanfare.
  a.define('cm_promote', (s) => {
    [0, 4, 7, 12].forEach((n, i) => s.tone({ wave: 'sawtooth', from: 392 * 2 ** (n / 12), duration: i === 3 ? 0.4 : 0.1, volume: 0.13, delay: i * 0.09, lowpass: 2200, fm: { ratio: 1, depth: 0.4 } }));
  }, { reverb: 0.3 });
  try {
    c.audio.loop('wind', { volume: 0.08 });
  } catch {
    // (No wind: no matter.)
  }
}

/** Each kind's weapon's sound. */
const SHOT: Partial<Record<UnitKind, string>> = { rifle: 'cm_rifle', scout: 'cm_rifle', guard: 'cm_rifle', hero: 'cm_rifle', engineer: 'cm_rifle', at: 'cm_rocket', tank: 'cm_cannon', artillery: 'cm_arty', aa: 'cm_flak', heli: 'cm_mg', gunboat: 'cm_mg', brute: 'cm_thump' };
const lastShot = new Map<string, number>();

/** A pair of jets on their run. */
export const jetSound = (x: number, y: number, z: number): void => void client.audio.play('cm_jet', { at: { x, y, z }, volume: 1 });

/** A volley of shots: each its weapon's sound where it was fired (a few at most at once, so a battle doesn't roar). */
export function shotSounds(list: { x: number; y: number; z: number; k: number }[]): void {
  let n = 0;
  const now = performance.now();
  for (const s of list) {
    const name = s.k === -1 ? 'cm_mg' : s.k >= 0 ? SHOT[UNIT_ORDER[s.k]] : undefined;
    if (!name || n >= 6) continue;
    // (The same weapon not twice in a few hundredths of a second: a volley, not a din.)
    if (now - (lastShot.get(name) ?? 0) < (name === 'cm_rifle' ? 45 : 90)) continue;
    lastShot.set(name, now);
    n++;
    client.audio.play(name, { at: { x: s.x, y: s.y, z: s.z }, volume: name === 'cm_arty' || name === 'cm_cannon' ? 0.9 : 0.55 });
  }
}

// ---------------------------------------------------------------------------------------------
// Voices

const LINES: Record<'select' | 'move' | 'attack', Partial<Record<UnitKind | 'any', string[]>>> = {
  select: {
    engineer: ['Engineer here.', 'What are we building?', 'Ready to work.'],
    rifle: ['Squad ready.', 'Orders, sir?', 'Standing by.'],
    scout: ['Eyes open.', 'Scout here.'],
    at: ['Rockets ready.', 'Point me at armor.'],
    tank: ['Tank ready.', 'Armor standing by.', 'Loaded.'],
    artillery: ['Guns ready.', 'Give us coordinates.'],
    aa: ['Flak up.', 'Watching the skies.'],
    heli: ['Air support here.', 'Rotors turning.'],
    hero: ['Commander here.', 'With you.'],
    gunboat: ['Gunboat ready.', 'Decks clear.'],
    transport: ['Transport here.', 'Room aboard.'],
  },
  move: { any: ['Moving.', 'On our way.', 'Copy that.', 'Roger.', 'Moving out.'], tank: ['Rolling.', 'Rolling out.'], heli: ['Inbound.', 'Copy, en route.'], engineer: ['On it.', 'Right away.'], gunboat: ['Under way.', 'Aye.'], transport: ['Under way.'] },
  attack: { any: ['Engaging!', 'Open fire!', 'Taking them down!', 'Contact!'], tank: ['Firing!', 'Target sighted!'], artillery: ['Shot out!', 'Firing for effect!'], heli: ['Going in hot!'], at: ['Rocket away!'] },
};

let voicesOn = true;
try {
  voicesOn = localStorage.getItem('cm_voices') !== 'off';
} catch {
  // (No storage: voices on.)
}
let saidAt = 0;

export const voices = {
  get on(): boolean {
    return voicesOn;
  },
  toggle(): void {
    voicesOn = !voicesOn;
    try {
      localStorage.setItem('cm_voices', voicesOn ? 'on' : 'off');
    } catch {
      // (No storage: for this visit only.)
    }
    if (!voicesOn) speechSynthesis?.cancel();
  },
};

/** A line over the radio from a unit: picked out, sent somewhere, sent to fight; or anything said (`text`). */
export function say(kind: UnitKind | null, what: 'select' | 'move' | 'attack' | 'text', text = ''): void {
  const now = performance.now();
  if (now - saidAt < (what === 'select' ? 900 : 1300)) return;
  saidAt = now;
  client.audio.play(what === 'select' ? 'cm_select' : 'cm_radio');
  if (!voicesOn || typeof speechSynthesis === 'undefined') return;
  const pool = what === 'text' ? [text] : (kind && LINES[what][kind]) ?? LINES[what].any ?? [];
  const line = pool[Math.floor(Math.random() * pool.length)];
  if (!line) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.rate = 1.15;
    // Big machines' crews lower, flyers and scouts higher.
    u.pitch = kind && (UNITS[kind].size >= 3 || kind === 'hero') ? 0.75 : kind === 'scout' || kind === 'heli' ? 1.2 : 1;
    u.volume = 0.55;
    speechSynthesis.speak(u);
  } catch {
    // (No speech on this browser: the radio's click will do.)
  }
}
