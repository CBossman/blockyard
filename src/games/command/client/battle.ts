import type { Client, Node } from '@platform/client';
import { BUILDING_ORDER } from '../protocol';
import { FLOOR, LAKES, heightAt, inLake } from '../map';
import { SCALE, variantOf } from '../models';
import { MODEL_SIZE } from '../modelfiles';
import { cam, inView } from './camera';

/**
 * What the fighting leaves and throws about, on each screen alone: shells and grenades in the air on
 * their arcs, burns on the ground where something blew up, a building going down in its own dust.
 */

interface Flying {
  node: Node;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  t: number;
  time: number;
  height: number;
  big: boolean;
  puff: number;
  rocket: boolean;
}
interface Falling {
  node: Node;
  x: number;
  z: number;
  height: number;
  radius: number;
  t: number;
  lean: number;
}

const flying: Flying[] = [];
const falling: Falling[] = [];
const scars: Node[] = [];
const MOST_SCARS = 90;
/** The mines this screen knows of, by where they are. */
const mineNodes = new Map<string, Node>();
const FALL = 1.7;
const tracks: Node[] = [];
const MOST_TRACKS = 56;
interface Drop {
  crate: Node;
  chute: Node | null;
  x: number;
  z: number;
  ground: number;
  /** When it lands (on this screen's clock). */
  end: number;
  smoke: number;
}
const dropNodes = new Map<number, Drop>();
let dropClock = 0;
let glintIn = 0;
/** What a blast has thrown, tumbling; what's still smoking; the jets going over. */
interface Chunk {
  node: Node;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  floor: number;
  t: number;
  bounced: boolean;
}
const chunks: Chunk[] = [];
const MOST_CHUNKS = 46;
const smoking: { x: number; y: number; z: number; end: number; puff: number; size: number }[] = [];
const MOST_SMOKING = 14;
const jets: { node: Node; x: number; z: number; dx: number; dz: number; t: number; trail: number }[] = [];
let battleClock = 0;

/** Dark smoke, grey, pale, sand-coloured dust, the orange of a marker, fire, white heat. */
export type Shade = 'd' | 'm' | 'l' | 's' | 'o' | 'f' | 'y';
interface Puff {
  node: Node;
  shade: Shade;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  life: number;
  size: number;
  spin: number;
}
const puffs: Puff[] = [];
const MOST_PUFFS = 260;
const spare: Record<Shade, Node[]> = { d: [], m: [], l: [], s: [], o: [], f: [], y: [] };
/** How much the wind carries smoke, blocks a second, when it has fully got hold of it. */
const WIND_X = 1.2;
const WIND_Z = 0.4;

function retire(p: Puff): void {
  p.node.visible = false;
  spare[p.shade].push(p.node);
}

/** A puff of smoke, dust or fire (`size` blocks across at its fullest): it swells, drifts, and shrinks away. */
export function puff(client: Client, x: number, y: number, z: number, shade: Shade, size: number, life: number, vx = 0, vy = 1.6, vz = 0): void {
  if (puffs.length >= MOST_PUFFS) retire(puffs.shift()!);
  let node = spare[shade].pop();
  if (!node) {
    const made = client.scene.item(`ic_puff_${shade}`);
    if (!made) return;
    node = made.node;
    client.scene.add(node);
  }
  node.visible = true;
  node.scale.setScalar(0.01);
  node.position.set(x, y, z);
  puffs.push({ node, shade, x, y, z, vx, vy, vz, t: 0, life: life * (0.8 + Math.random() * 0.4), size: size * (0.8 + Math.random() * 0.4), spin: (Math.random() - 0.5) * 2 });
}

/** Several, out from a spot in all directions: a fireball, a burst of dust. */
export function plume(client: Client, x: number, y: number, z: number, n: number, shade: Shade, size: number, life: number, out: number, rise: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = out * (0.4 + Math.random() * 0.8);
    puff(client, x + Math.cos(a) * 0.4, y + Math.random() * 0.5, z + Math.sin(a) * 0.4, shade, size, life, Math.cos(a) * v, rise * (0.6 + Math.random() * 0.8), Math.sin(a) * v);
  }
}

function framePuffs(dt: number): void {
  let gone = 0;
  for (const p of puffs) {
    p.t += dt;
    const k = p.t / p.life;
    if (k >= 1) {
      retire(p);
      gone++;
      continue;
    }
    const slow = Math.max(0, 1 - dt * 2.6);
    p.vx *= slow;
    p.vz *= slow;
    p.vy *= Math.max(0, 1 - dt * 0.9);
    const smoke = p.shade !== 'f' && p.shade !== 'y';
    p.x += (p.vx + (smoke ? WIND_X * k : 0)) * dt;
    p.y += p.vy * dt;
    p.z += (p.vz + (smoke ? WIND_Z * k : 0)) * dt;
    p.node.position.set(p.x, p.y, p.z);
    p.node.scale.setScalar(Math.max(0.01, p.size * Math.min(1, k * 4.5) * (1 - k * k * k)));
    p.node.rotation.set(p.t * p.spin * 0.6, p.t * p.spin, 0);
  }
  if (gone) {
    let w = 0;
    for (const p of puffs) if (p.t < p.life) puffs[w++] = p;
    puffs.length = w;
  }
}

/** A shell or a grenade, from here to there, in the air for a while (`time` seconds). */
export function lob(client: Client, from: Flying['from'], to: Flying['to'], time: number, big: boolean): void {
  const made = client.scene.item('ic_shell');
  if (!made) return;
  made.node.scale.setScalar(SCALE.shell * (big ? 1.5 : 0.8));
  made.node.position.set(from.x, from.y, from.z);
  client.scene.add(made.node);
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  flying.push({ node: made.node, from, to, t: 0, time, height: Math.min(16, 2 + d * 0.32), big, puff: 0, rocket: false });
}

/** A rocket, straight there on its flame. */
export function rocket(client: Client, from: Flying['from'], to: Flying['to'], time: number): void {
  const made = client.scene.item('ic_rocket');
  if (!made) return;
  made.node.scale.setScalar(SCALE.shell * 1.2);
  made.node.position.set(from.x, from.y, from.z);
  client.scene.add(made.node);
  flying.push({ node: made.node, from, to, t: 0, time, height: 0.12, big: true, puff: 0, rocket: true });
}

/** Lumps thrown out of a blast (the oldest go when there are too many). */
export function throwChunks(client: Client, x: number, y: number, z: number, id: string, n: number, speed: number, size: number): void {
  for (let i = 0; i < n; i++) {
    const made = client.scene.item(id);
    if (!made) return;
    made.node.scale.setScalar(size * (0.65 + Math.random() * 0.7));
    made.node.position.set(x, y, z);
    client.scene.add(made.node);
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.75);
    chunks.push({ node: made.node, x, y, z, vx: Math.cos(a) * v, vy: speed * (0.7 + Math.random() * 0.8), vz: Math.sin(a) * v, spin: 5 + Math.random() * 9, floor: FLOOR + heightAt(x, z), t: 0, bounced: false });
    if (chunks.length > MOST_CHUNKS) client.scene.remove(chunks.shift()!.node);
  }
}

/** Something left burning here: smoke goes on rising for a while. */
export function smoulder(x: number, y: number, z: number, seconds: number, size: number): void {
  smoking.push({ x, y, z, end: battleClock + seconds, puff: 0, size });
  if (smoking.length > MOST_SMOKING) smoking.shift();
}

/** A pair of jets over a spot, low and fast. */
export function flyover(client: Client, x: number, z: number): void {
  const a = Math.random() * Math.PI * 2;
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  for (const side of [-1, 1]) {
    const made = client.scene.item('ic_jet');
    if (!made) return;
    made.node.scale.setScalar(SCALE.heli * 0.9);
    made.node.rotation.order = 'YXZ';
    made.node.rotation.set(0, Math.atan2(dx, dz), side * 0.1);
    client.scene.add(made.node);
    const back = 92 + (side + 1) * 7;
    jets.push({ node: made.node, x: x - dx * back - dz * side * 7, z: z - dz * back + dx * side * 7, dx, dz, t: 0, trail: 0 });
  }
}

/** A burn on the ground, `size` blocks across (the oldest go when there are too many). */
export function scar(client: Client, x: number, z: number, size: number): void {
  if (inLake(x, z, 1)) return;
  const made = client.scene.item('ic_scorch');
  if (!made) return;
  made.node.scale.setScalar(SCALE.scorch * size);
  made.node.position.set(x, FLOOR + heightAt(x, z) + 0.01, z);
  made.node.rotation.set(0, Math.random() * Math.PI * 2, 0);
  client.scene.add(made.node);
  scars.push(made.node);
  if (scars.length > MOST_SCARS) client.scene.remove(scars.shift()!);
}

/** Tread marks where a vehicle has just driven (the oldest go when there are too many). */
export function tread(client: Client, x: number, z: number, yaw: number): void {
  if (inLake(x, z, 0.5)) return;
  const made = client.scene.item('ic_tracks');
  if (!made) return;
  made.node.scale.setScalar(SCALE.tracks);
  made.node.position.set(x, FLOOR + heightAt(x, z) + 0.015, z);
  made.node.rotation.set(0, yaw, 0);
  client.scene.add(made.node);
  tracks.push(made.node);
  if (tracks.length > MOST_TRACKS) client.scene.remove(tracks.shift()!);
}

/** The supply drops this screen should show: coming down on their chutes, or waiting, smoking, on the ground. */
export function showDrops(client: Client, list: { id: number; x: number; z: number; landIn: number }[]): void {
  const want = new Set(list.map((d) => d.id));
  for (const d of list) {
    if (dropNodes.has(d.id)) continue;
    const crate = client.scene.item('ic_airdrop');
    const chute = d.landIn > 0.1 ? client.scene.item('ic_chute') : null;
    if (!crate) continue;
    crate.node.scale.setScalar(SCALE.airdrop);
    client.scene.add(crate.node);
    if (chute) {
      chute.node.scale.setScalar(SCALE.chute);
      client.scene.add(chute.node);
    }
    const ground = FLOOR + heightAt(d.x, d.z);
    crate.node.position.set(d.x, ground, d.z);
    dropNodes.set(d.id, { crate: crate.node, chute: chute?.node ?? null, x: d.x, z: d.z, ground, end: dropClock + d.landIn, smoke: 0 });
  }
  for (const [id, d] of dropNodes) if (!want.has(id)) {
    client.scene.remove(d.crate);
    if (d.chute) client.scene.remove(d.chute);
    dropNodes.delete(id);
  }
}

function frameDrops(client: Client, dt: number): void {
  dropClock += dt;
  for (const d of dropNodes.values()) {
    const left = d.end - dropClock;
    if (left > 0) {
      const y = d.ground + left * 6.5;
      const sway = Math.sin(dropClock * 1.3 + d.x) * 0.05;
      d.crate.position.set(d.x, y, d.z);
      d.crate.rotation.set(sway, dropClock * 0.2, -sway);
      if (d.chute) {
        d.chute.position.set(d.x, y + 0.9, d.z);
        d.chute.rotation.set(sway, dropClock * 0.2, -sway);
      }
      continue;
    }
    if (d.chute) {
      // Down: the chute goes, in a puff of dust.
      client.scene.remove(d.chute);
      d.chute = null;
      d.crate.position.set(d.x, d.ground, d.z);
      d.crate.rotation.set(0, 0, 0);
      plume(client, d.x, d.ground + 0.4, d.z, 12, 's', 0.9, 0.9, 7, 0.8);
    }
    d.smoke -= dt;
    if (d.smoke <= 0) {
      d.smoke = 0.26;
      puff(client, d.x, d.ground + 2.6, d.z, Math.random() < 0.6 ? 'o' : 'l', 0.8, 2.4, 0, 2.6, 0);
    }
  }
}

/** A building coming down: it leans, sinks into its own dust, and what's left is the rubble the server has put there. */
export function fall(client: Client, kindIndex: number, seat: number, x: number, z: number): void {
  const kind = BUILDING_ORDER[kindIndex];
  if (!kind) return;
  const made = client.scene.item(`ic_${kind}_${variantOf(seat)}`);
  if (!made) return;
  made.node.scale.setScalar(SCALE[kind]);
  made.node.position.set(x, FLOOR, z);
  client.scene.add(made.node);
  falling.push({ node: made.node, x, z, height: (MODEL_SIZE[kind].hi[1] / 16) * SCALE[kind], radius: SCALE[kind] * 0.3, t: 0, lean: (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.1) });
}

function frameDebris(client: Client, dt: number): void {
  battleClock += dt;
  framePuffs(dt);
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    c.t += dt;
    c.vy -= 26 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.z += c.vz * dt;
    if (c.y < c.floor + 0.12) {
      // Once off the ground, then it lies where it stops, and sinks away after a while.
      c.y = c.floor + 0.12;
      if (c.bounced || c.vy > -4) {
        c.vx = c.vz = c.vy = 0;
        c.spin = 0;
      } else {
        c.bounced = true;
        c.vy *= -0.34;
        c.vx *= 0.45;
        c.vz *= 0.45;
        c.spin *= 0.4;
      }
    }
    c.node.position.set(c.x, c.y - Math.max(0, c.t - 4.5) * 0.7, c.z);
    if (c.spin) c.node.rotation.set(c.t * c.spin, c.t * c.spin * 0.6, 0);
    if (c.t > 6) {
      client.scene.remove(c.node);
      chunks.splice(i, 1);
    }
  }
  for (let i = smoking.length - 1; i >= 0; i--) {
    const s = smoking[i];
    if (battleClock > s.end) {
      smoking.splice(i, 1);
      continue;
    }
    s.puff -= dt;
    if (s.puff > 0) continue;
    s.puff = 0.3;
    if (!inView(s.x, s.z, 10)) continue;
    // Thick at first, thinner as it burns out, rising and leaning on the wind.
    const left = Math.min(1, (s.end - battleClock) / 7);
    puff(client, s.x + (Math.random() - 0.5) * s.size, s.y + 0.8, s.z + (Math.random() - 0.5) * s.size, left > 0.5 ? 'd' : 'm', (0.6 + 0.55 * left) * s.size, 3.2, 0, 2.4, 0);
    if (left >= 1 && Math.random() < 0.6) puff(client, s.x + (Math.random() - 0.5) * s.size * 1.4, s.y + 0.4, s.z + (Math.random() - 0.5) * s.size * 1.4, 'f', 0.5, 0.5, 0, 2.6, 0);
  }
  for (let i = jets.length - 1; i >= 0; i--) {
    const j = jets[i];
    j.t += dt;
    j.x += j.dx * 86 * dt;
    j.z += j.dz * 86 * dt;
    j.node.position.set(j.x, FLOOR + 21, j.z);
    j.trail -= dt;
    if (j.trail <= 0) {
      j.trail = 0.045;
      if (inView(j.x, j.z, 20)) puff(client, j.x - j.dx * 4, FLOOR + 21.4, j.z - j.dz * 4, 'l', 0.42, 0.55, j.dx * 3, 0.2, j.dz * 3);
    }
    if (j.t > 2.4) {
      client.scene.remove(j.node);
      jets.splice(i, 1);
    }
  }
}

export function frameBattle(client: Client, dt: number): void {
  frameDrops(client, dt);
  frameDebris(client, dt);
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.time);
    const x = f.from.x + (f.to.x - f.from.x) * k;
    const z = f.from.z + (f.to.z - f.from.z) * k;
    const y = f.from.y + (f.to.y - f.from.y) * k + 4 * f.height * k * (1 - k);
    f.node.position.set(x, y, z);
    f.node.rotation.set(f.rocket ? 0 : f.t * 9, Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z), 0);
    f.puff -= dt;
    if (f.puff <= 0) {
      f.puff = f.big ? 0.05 : 0.08;
      if (f.rocket) client.fx.flare({ x, y, z }, 0.55);
      if (f.big) puff(client, x, y, z, 'l', 0.36, 0.7, 0, 0.3, 0);
      else client.fx.burst({ x, y, z }, { color: '#e8e4d8', count: 1, speed: 0.3, size: 0.22, life: 0.4, drag: 2, gravity: -0.4 });
    }
    if (k >= 1) {
      client.scene.remove(f.node);
      flying.splice(i, 1);
    }
  }
  for (let i = falling.length - 1; i >= 0; i--) {
    const f = falling[i];
    f.t += dt;
    const k = Math.min(1, f.t / FALL);
    f.node.position.y = FLOOR - k * k * f.height;
    f.node.rotation.set(f.lean * k, 0, f.lean * 0.7 * k);
    if (Math.random() < dt * 34) {
      const a = Math.random() * Math.PI * 2;
      puff(client, f.x + Math.cos(a) * f.radius, FLOOR + 0.6, f.z + Math.sin(a) * f.radius, Math.random() < 0.5 ? 's' : 'l', 1.5, 1.7, Math.cos(a) * 3, 1.2, Math.sin(a) * 3);
    }
    if (k >= 1) {
      client.scene.remove(f.node);
      falling.splice(i, 1);
    }
  }
  // Light catching the lakes near where the camera is looking.
  glintIn -= dt;
  if (glintIn <= 0) {
    glintIn = 0.09;
    const near = LAKES.filter((l) => Math.hypot(l.x - cam.x, l.z - cam.z) < cam.dist * 1.4 + l.r);
    const l = near[Math.floor(Math.random() * near.length)];
    if (l) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (l.r - 1.5);
      client.fx.burst({ x: l.x + Math.cos(a) * r, y: FLOOR + 0.12, z: l.z + Math.sin(a) * r }, { color: '#f4fbff', count: 2, speed: 0.5, size: 0.24, glow: 0.7, life: 0.55, drag: 4, gravity: 0 });
    }
  }
}

/** The mines this screen should show: `[x, z, ours]` in a row. */
export function showMines(client: Client, list: number[]): void {
  const want = new Set<string>();
  for (let i = 0; i < list.length; i += 3) {
    const key = `${list[i]},${list[i + 1]}`;
    want.add(key);
    if (mineNodes.has(key)) continue;
    const made = client.scene.item('ic_mine');
    if (!made) continue;
    made.node.scale.setScalar(SCALE.mine);
    made.node.position.set(list[i], FLOOR + heightAt(list[i], list[i + 1]), list[i + 1]);
    client.scene.add(made.node);
    mineNodes.set(key, made.node);
  }
  for (const [key, node] of mineNodes) if (!want.has(key)) {
    client.scene.remove(node);
    mineNodes.delete(key);
  }
}

/** All gone (back to the lobby). */
export function clearBattle(client: Client): void {
  for (const f of flying) client.scene.remove(f.node);
  for (const f of falling) client.scene.remove(f.node);
  for (const n of scars) client.scene.remove(n);
  for (const n of mineNodes.values()) client.scene.remove(n);
  for (const n of tracks) client.scene.remove(n);
  tracks.length = 0;
  for (const c of chunks) client.scene.remove(c.node);
  chunks.length = 0;
  smoking.length = 0;
  for (const p of puffs) retire(p);
  puffs.length = 0;
  for (const j of jets) client.scene.remove(j.node);
  jets.length = 0;
  for (const d of dropNodes.values()) {
    client.scene.remove(d.crate);
    if (d.chute) client.scene.remove(d.chute);
  }
  dropNodes.clear();
  mineNodes.clear();
  flying.length = 0;
  falling.length = 0;
  scars.length = 0;
}
