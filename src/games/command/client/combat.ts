import type { Client } from '@platform/client';
import { UNITS, type UnitKind } from '../defs';
import { FLOOR, heightAt } from '../map';
import { SCALE } from '../models';
import { UNIT_ORDER, type Shot } from '../protocol';
import { lob, plume, puff, rocket, scar, smoulder, throwChunks } from './battle';
import { inView } from './camera';
import { towerMuzzle } from './life';
import { blastAt, firedFrom, struck, type Firer } from './units';
import { ui } from './ui';

/**
 * What the fighting looks like on this screen: each weapon's own flash, streak and report, what a
 * round does to what it lands on, and blasts in layers (a flash, a fireball, thrown earth and scrap,
 * a column of smoke that stays). All of it is this screen's alone, and what's off the screen is skipped.
 */

type At = { x: number; y: number; z: number };

/** Where each kind's weapon fires from on its model (voxels: ahead of its middle, and up). */
const MUZZLE: Partial<Record<string, [number, number]>> = {
  tank: [31, 10.5], artillery: [32, 25], aa: [17.5, 11.5], gunboat: [25, 8.5], heli: [18, 0.5], brute: [9, 14.5],
  rifle: [10, 8.5], guard: [10, 8.5], at: [9, 11], hero: [3, 6], scout: [6, 11], engineer: [3, 4],
};
const SQUADS: Partial<Record<UnitKind, number>> = { rifle: 0.78, guard: 0.78, at: 0.78 };

/** Done a moment from now: a squad's men don't all fire on the one instant. */
const waiting: { at: number; run: () => void }[] = [];
let clock = 0;
const later = (delay: number, run: () => void) => waiting.push({ at: clock + delay, run });

/** A shot's start: at this man's muzzle (or as the server has it, from a tower or a bomber). */
function muzzle(s: Shot, spot?: { x: number; z: number }): At {
  const kind = UNIT_ORDER[s.k];
  const m = kind && MUZZLE[kind];
  if (!m) return { x: s.x, y: s.y, z: s.z };
  const x = spot?.x ?? s.x;
  const z = spot?.z ?? s.z;
  const d = Math.hypot(s.tx - x, s.tz - z) || 1;
  const k = ((SCALE[kind] ?? 3) / 16) * (SQUADS[kind] ?? 1);
  const def = UNITS[kind];
  const base = def.air ? FLOOR + 5 : def.naval ? FLOOR - 0.45 : FLOOR + heightAt(x, z);
  const ahead = Math.min(m[0] * k, d * 0.8);
  return { x: x + ((s.tx - x) / d) * ahead, y: base + m[1] * k, z: z + ((s.tz - z) / d) * ahead };
}

/** Standing on or by a building? */
const onBuilding = (x: number, z: number) => ui.buildings.some((b) => Math.abs(b.x - x) < 5 && Math.abs(b.z - z) < 5);

/** What a small round does where it lands. */
function ping(client: Client, to: At): void {
  const what = struck(to.x, to.z);
  if (what === 'armor' || what === 'air') {
    client.fx.burst(to, { color: '#ffd27a', count: 4, speed: 6, size: 0.1, glow: 1.3, life: 0.22, gravity: 12 });
  } else if (what === 'foot') {
    client.fx.burst(to, { color: '#c9b98a', count: 3, speed: 1.8, size: 0.2, life: 0.3, drag: 3, gravity: 1 });
  } else if (onBuilding(to.x, to.z)) {
    client.fx.burst(to, { color: '#aaa69c', count: 4, speed: 3, size: 0.16, life: 0.32, gravity: 12 });
  } else {
    const ground = { x: to.x, y: FLOOR + heightAt(to.x, to.z) + 0.1, z: to.z };
    client.fx.particles(ground, [0.3, 0.22, 0.12], { count: 4, speed: 1.2, up: 3.4, size: 0.15, life: 0.42, gravity: 15 });
  }
}

/** What a heavy round does where it lands. */
function slam(client: Client, to: At): void {
  const what = struck(to.x, to.z);
  if (what === 'armor' || what === 'air') {
    client.fx.flare(to, 1.1);
    client.fx.burst(to, { color: '#ffb347', count: 14, speed: 8, size: 0.14, glow: 1.4, life: 0.36, gravity: 12 });
    plume(client, to.x, to.y, to.z, 2, 'd', 0.62, 0.8, 1.4, 1.8);
  } else {
    const ground = { x: to.x, y: FLOOR + heightAt(to.x, to.z) + 0.2, z: to.z };
    client.fx.flare(ground, 0.8);
    client.fx.particles(ground, [0.26, 0.18, 0.1], { count: 9, speed: 2, up: 7, size: 0.28, life: 0.6, gravity: 18 });
    plume(client, ground.x, ground.y, ground.z, 3, 's', 0.62, 0.7, 2, 1.2);
  }
}

/** A heavy gun going off: the flash, the smoke, the dust the blast slaps up off the ground under it. */
function report(client: Client, from: At, size: number): void {
  client.fx.flare(from, size);
  plume(client, from.x, from.y, from.z, 3, 'l', 0.56, 0.7, 2, 0.8);
  plume(client, from.x, FLOOR + heightAt(from.x, from.z) + 0.2, from.z, 4, 's', 0.42, 0.45, 6, 0.3);
}

function small(client: Client, from: At, to: At): void {
  client.fx.tracer(from, to, '#fff2b0', { speed: 130, length: 1.3, width: 0.08, glow: 0.8 });
  client.fx.flare(from, 0.42);
}

/** Each man still on his feet fires, a moment apart. */
function volley(client: Client, s: Shot, firer: Firer | null, to: At): void {
  const n = firer?.men.length ?? 1;
  for (let i = 0; i < n; i++) {
    const man = firer?.men[i];
    later(i * 0.075 + Math.random() * 0.03, () => {
      firer?.kick(i);
      small(client, muzzle(s, man), { x: to.x + (Math.random() - 0.5) * 0.5, y: to.y, z: to.z + (Math.random() - 0.5) * 0.5 });
      ping(client, to);
    });
  }
}

/** A shot on this screen. */
export function shoot(client: Client, s: Shot): void {
  const kind = UNIT_ORDER[s.k];
  const firer = s.k >= 0 && s.y < FLOOR + 12 ? firedFrom(s.x, s.z) : null;
  const to = { x: s.tx, y: s.ty, z: s.tz };
  if (s.k === -2) {
    // A bomb, off the jets going over.
    lob(client, { x: s.x, y: FLOOR + 21, z: s.z }, to, 0.3, true);
    return;
  }
  const tip = s.k === -1 ? towerMuzzle(s) : null;
  if (!inView(s.x, s.z, 12) && !inView(s.tx, s.tz, 12)) return;
  const from = tip ?? muzzle(s, firer?.men[0]);
  if (s.arc) {
    // Lobbed: a flash and a puff where it left, and it's up in the air on its way (the blast is the server's, when it lands).
    lob(client, from, to, s.arc, s.big);
    if (s.big) report(client, from, 2.2);
    else client.fx.flare(from, 0.3);
    return;
  }
  const d = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  const dir = { x: (to.x - from.x) / d, z: (to.z - from.z) / d };
  if (kind === 'at') {
    // A rocket: it leaves on a jet of flame, with a blast out of the back of the tube.
    firer?.kick(0);
    rocket(client, from, to, d / 46);
    client.fx.flare(from, 0.9);
    for (let i = 0; i < 4; i++) puff(client, from.x - dir.x * 1.6, from.y, from.z - dir.z * 1.6, 'l', 0.46, 0.45, -dir.x * (6 + Math.random() * 6), 0.4, -dir.z * (6 + Math.random() * 6));
    later(d / 46, () => slam(client, to));
  } else if (kind === 'heli' && s.big) {
    // Rockets off the pods, left then right.
    const k = SCALE.heli / 16;
    for (const side of [-1, 1]) {
      later(side > 0 ? 0.1 : 0, () => {
        const pod = { x: from.x + dir.z * side * 7.5 * k, y: from.y + 3 * k, z: from.z - dir.x * side * 7.5 * k };
        rocket(client, pod, to, d / 60);
        client.fx.flare(pod, 0.7);
      });
    }
    later(d / 60, () => slam(client, to));
  } else if (kind === 'aa') {
    // Twin barrels; high up, the rounds burst in black puffs.
    const high = s.ty > FLOOR + 3;
    for (let i = 0; i < 2; i++)
      later(i * 0.09, () => {
        client.fx.tracer(from, to, '#ffb07a', { speed: 110, length: 1.6, width: 0.14, glow: 1 });
        client.fx.flare(from, 0.6);
      });
    if (high) later(d / 110 + 0.03, () => {
      client.fx.flare(to, 0.9);
      plume(client, to.x, to.y, to.z, 3, 'd', 0.72, 0.85, 2, 0.4);
      client.fx.burst(to, { color: '#ffd27a', count: 6, speed: 6, size: 0.1, glow: 1.2, life: 0.24, gravity: 8 });
    });
    else ping(client, to);
  } else if (s.big) {
    // A tank's gun: a flash and a slap of dust at the muzzle, a fat shell, and what it does where it lands.
    client.fx.tracer(from, to, '#ffd27a', { speed: 74, length: 2, width: 0.3, glow: 0.9 });
    report(client, from, 1.5);
    later(d / 74, () => slam(client, to));
  } else if (firer && SQUADS[firer.kind]) {
    volley(client, s, firer, to);
  } else if (kind === 'heli' || s.k === -1) {
    // The chin gun, and a tower's: short bursts.
    for (let i = 0; i < 3; i++)
      later(i * 0.06, () => {
        small(client, from, { x: to.x + (Math.random() - 0.5) * 0.6, y: to.y, z: to.z + (Math.random() - 0.5) * 0.6 });
        if (i === 2) ping(client, to);
      });
  } else {
    small(client, from, to);
    ping(client, to);
  }
}

/** Blasts: x, z and what blew (three numbers each): 0 a soldier, 1 a shell, 2 a building, 3 a vehicle. */
export function booms(client: Client, a: number[]): void {
  let loud = 0;
  for (let i = 0; i + 2 < a.length; i += 3) {
    const kind = a[i + 2];
    const x = a[i];
    const z = a[i + 1];
    const floor = FLOOR + heightAt(x, z);
    const at = { x, y: floor + 1.2, z };
    blastAt(x, z);
    if (kind) scar(client, x, z, kind === 2 ? 7 : kind === 3 ? 2.6 : 1.1 + Math.random() * 0.6);
    if (kind === 2) loud += 1;
    else if (kind === 3) loud += 0.6;
    else if (kind === 1) loud += 0.3;
    if (kind >= 2) smoulder(x, floor, z, kind === 2 ? 26 : 13, kind === 2 ? 1.7 : 1);
    if (!inView(x, z, 12)) continue;
    const dirt = { x, y: floor + 0.3, z };
    if (kind === 0) {
      client.fx.burst(at, { color: '#c9b98a', count: 6, speed: 3.4, size: 0.24, life: 0.45, gravity: 9 });
      plume(client, at.x, at.y, at.z, 2, 'l', 0.46, 0.7, 1, 1);
    } else if (kind === 1) {
      client.fx.flare(at, 1.5);
      plume(client, at.x, at.y, at.z, 4, 'f', 0.72, 0.3, 4, 1.4);
      plume(client, at.x, at.y, at.z, 4, 'm', 0.72, 1.1, 2.2, 2);
      client.fx.burst(at, { color: '#ffb347', count: 8, speed: 7, size: 0.1, glow: 1.3, life: 0.32, gravity: 8 });
      // Earth thrown straight up in a spout, and a few clods.
      client.fx.particles(dirt, [0.24, 0.17, 0.09], { count: 14, speed: 2.2, up: 9, size: 0.32, life: 0.75, gravity: 20 });
      throwChunks(client, x, floor + 0.6, z, 'ic_chunk_e', 3, 6, 0.8);
    } else {
      const big = kind === 2;
      client.fx.flare(at, big ? 3.4 : 1.9);
      if (big) client.fx.shockwave({ x, y: floor + 0.4, z }, 9, '#ffb347');
      // White heat, then the fireball rolling up, embers on long arcs, the dust slapped out along the ground, a column of smoke.
      plume(client, x, at.y, z, big ? 6 : 3, 'y', big ? 1.5 : 1, 0.22, big ? 6 : 4, 2);
      plume(client, x, at.y, z, big ? 14 : 8, 'f', big ? 1.8 : 1.15, 0.5, big ? 8 : 5.5, 3.4);
      client.fx.particles(at, [1, 0.62, 0.2], { count: big ? 30 : 16, speed: big ? 14 : 11, up: 3, size: 0.09, glow: 1.6, life: 1.15, drag: 0.5, gravity: 11 });
      plume(client, x, dirt.y, z, big ? 16 : 9, 's', big ? 1.2 : 0.8, 0.75, big ? 15 : 10, 0.5);
      plume(client, x, at.y + 0.6, z, big ? 12 : 6, 'd', big ? 1.7 : 1.15, big ? 3 : 2, big ? 3 : 1.8, big ? 4.4 : 3.4);
      throwChunks(client, x, floor + 1.4, z, big ? 'ic_chunk_c' : 'ic_chunk_m', big ? 15 : 7, big ? 12 : 9.5, big ? 1.5 : 1);
      if (big) client.fx.shake(0.22, 0.4);
    }
  }
  if (loud > 0) client.audio.play('explosion', { volume: Math.min(0.6, 0.15 + loud * 0.2) });
}

export function frameCombat(dt: number): void {
  clock += dt;
  for (let i = waiting.length - 1; i >= 0; i--) {
    if (waiting[i].at > clock) continue;
    const w = waiting[i];
    waiting.splice(i, 1);
    w.run();
  }
}

export function clearCombat(): void {
  waiting.length = 0;
}
