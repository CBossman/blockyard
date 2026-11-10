import type { Client, Node } from '@platform/client';
import { FLOOR, LAKES, TREES, deposits, hashYaw, heightAt, type Deposit } from '../map';
import { SCALE, variantOf } from '../models';
import type { Shot, State } from '../protocol';
import type { BuildingKind } from '../defs';
import { cam, inView } from './camera';
import { puff } from './battle';
import type { B } from './ui';

/**
 * What moves about the base and the field without anyone ordering it: the dish on the HQ, a tower's
 * gun and searchlight, flags in the wind, pumpjacks nodding, beacons blinking, welders at work; and
 * round all that, gulls going over, pollen drifting, leaves coming off the trees, a splash on a lake.
 * None of it can be clicked or fought: it is scenery on this screen alone.
 */

type Move = 'spin' | 'sweep' | 'sock' | 'gun';
interface Part {
  id: string;
  /** Where on the building's model, in voxels. */
  at: [number, number, number];
  move: Move;
  speed?: number;
}

const PARTS: Partial<Record<BuildingKind, Part[]>> = {
  hq: [{ id: 'ic_hq_dish', at: [1, 37, -8], move: 'spin', speed: 0.55 }],
  tower: [
    { id: 'ic_tower_gun', at: [0, 20, 0], move: 'gun' },
    { id: 'ic_tower_lamp', at: [3.5, 28, 0.5], move: 'sweep', speed: 0.8 },
  ],
  airfield: [
    { id: 'ic_sock', at: [17, 12, 13], move: 'sock' },
    { id: 'ic_radar', at: [13, 24, -13], move: 'spin', speed: 1.5 },
  ],
};
/** Where a flag flies: the top of its pole on the model (voxels: x, z, height). */
const POLES: Partial<Record<BuildingKind, [number, number, number]>> = { hq: [17, 16, 34], barracks: [0, 9, 24] };
/** The beacons that blink: voxels on the model. */
const BEACONS: Partial<Record<BuildingKind, [number, number, number]>> = { hq: [12.5, 47.5, -13.5], airfield: [11, 28.5, -11], lab: [-8.5, 25.5, -7.5] };

interface Built {
  id: number;
  kind: BuildingKind;
  x: number;
  z: number;
  y: number;
  parts: { node: Node; move: Move; speed: number; yaw: number }[];
  cloth: Node[];
  root: Node[];
  hp: number;
  queue: number;
  aim: number;
  firedAt: number;
}

const built = new Map<number, Built>();
const seenDone = new Set<number>();
const pumps = new Map<number, { node: Node; yaw: number; d: Deposit }>();
interface Bird {
  node: Node;
  left: Node;
  right: Node;
  x: number;
  y: number;
  z: number;
  phase: number;
}
let flock: { birds: Bird[]; dx: number; dz: number; end: number } | null = null;
let nextFlock = 14;
let clock = 0;
let beaconIn = 0;
let weldIn = 0;
let moteIn = 0;
let leafIn = 0;
let splashIn = 3;
let pumpTry = 0;
let phaseNow = 'lobby';
let depositsNow: number[] = [];
const AUTUMN = TREES.filter((t) => Math.abs(Math.sin(t.x * 12.9 + t.z * 78.2)) < 0.25);

function piece(client: Client, id: string, scale: number): Node | null {
  const made = client.scene.item(id);
  if (!made) return null;
  made.node.scale.setScalar(scale);
  const holder = client.scene.node();
  holder.add(made.node);
  return holder;
}

function dress(client: Client, b: B): Built | null {
  const s = SCALE[b.kind];
  const k = s / 16;
  const y = FLOOR + heightAt(b.x, b.z);
  const out: Built = { id: b.id, kind: b.kind, x: b.x, z: b.z, y, parts: [], cloth: [], root: [], hp: b.hp, queue: b.queue, aim: 0, firedAt: -9 };
  for (const p of PARTS[b.kind] ?? []) {
    const node = piece(client, p.id, s);
    if (!node) return null;
    node.position.set(b.x + p.at[0] * k, y + p.at[1] * k, b.z + p.at[2] * k);
    client.scene.add(node);
    out.root.push(node);
    out.parts.push({ node, move: p.move, speed: p.speed ?? 1, yaw: Math.random() * 6 });
  }
  const pole = POLES[b.kind];
  if (pole) {
    // Three lengths of cloth, each hung from the last, so a ripple runs down it.
    let parent: Node | null = null;
    for (let i = 0; i < 3; i++) {
      const seg = piece(client, `ic_cloth_${variantOf(b.seat)}`, s);
      if (!seg) return null;
      if (parent) {
        seg.position.set(3 * k, 0, 0);
        parent.add(seg);
      } else {
        seg.position.set(b.x + (pole[0] + 1) * k, y + (pole[2] - 3.5) * k, b.z + (pole[1] + 0.5) * k);
        client.scene.add(seg);
        out.root.push(seg);
      }
      out.cloth.push(seg);
      parent = seg;
    }
  }
  return out;
}

function undress(client: Client, b: Built): void {
  for (const n of out(b)) client.scene.remove(n);
}
const out = (b: Built) => b.root;

/** The buildings this screen sees, to dress the finished ones and to show what's happening to them. */
export function updateLife(client: Client, list: B[]): void {
  const want = new Set<number>();
  for (const b of list) {
    if (b.built < 100) continue;
    want.add(b.id);
    let d = built.get(b.id);
    if (!d) {
      const made = dress(client, b);
      if (!made) continue;
      d = made;
      built.set(b.id, d);
      // A building just finished: its dust settles.
      if (!seenDone.has(b.id) && seenDone.size && inView(b.x, b.z, 10)) {
        const r = SCALE[b.kind] * 0.26;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          puff(client, b.x + Math.cos(a) * r, d.y + 0.5, b.z + Math.sin(a) * r, 's', 0.95, 0.85, Math.cos(a) * 4, 0.6, Math.sin(a) * 4);
        }
      }
      seenDone.add(b.id);
    }
    // Hit: chips and sparks off a wall.
    if (b.hp < d.hp && inView(b.x, b.z, 10)) {
      const a = Math.random() * Math.PI * 2;
      const r = SCALE[b.kind] * 0.22;
      const at = { x: b.x + Math.cos(a) * r, y: d.y + 1 + Math.random() * 3, z: b.z + Math.sin(a) * r };
      client.fx.burst(at, { color: '#a4a096', count: 6, speed: 4.5, size: 0.2, life: 0.5, gravity: 14 });
      client.fx.burst(at, { color: '#ffd27a', count: 3, speed: 6, size: 0.09, glow: 1.2, life: 0.22, gravity: 10 });
    }
    d.hp = b.hp;
    d.queue = b.queue;
  }
  for (const [id, d] of built) if (!want.has(id)) {
    undress(client, d);
    built.delete(id);
  }
}

/** A tower (or an HQ's guns) fired: its gun swings round, and where the round leaves it. */
export function towerMuzzle(s: Shot): { x: number; y: number; z: number } | null {
  for (const d of built.values()) {
    if (d.kind !== 'tower' || Math.abs(d.x - s.x) > 0.6 || Math.abs(d.z - s.z) > 0.6) continue;
    d.aim = Math.atan2(s.tx - s.x, s.tz - s.z);
    d.firedAt = clock;
    const k = SCALE.tower / 16;
    const dist = 11 * k;
    return { x: d.x + Math.sin(d.aim) * dist, y: d.y + 21.5 * k, z: d.z + Math.cos(d.aim) * dist };
  }
  return null;
}

/** The phase, and what's left in each deposit: pumpjacks stand where there's oil and a match on. */
export function lifeState(state: State): void {
  phaseNow = state.phase;
  depositsNow = state.deposits;
}

function framePumps(client: Client, dt: number): void {
  pumpTry -= dt;
  const live = phaseNow !== 'lobby';
  if (live && pumpTry <= 0) {
    pumpTry = 1;
    for (const d of deposits()) {
      if (d.kind !== 'oil' || d.scrap || pumps.has(d.id)) continue;
      const node = piece(client, 'ic_pump', SCALE.oil);
      if (!node) break;
      const k = SCALE.oil / 16;
      node.position.set(d.x, FLOOR + 13 * k, d.z);
      node.rotation.order = 'YXZ';
      client.scene.add(node);
      pumps.set(d.id, { node, yaw: hashYaw(d.id), d });
    }
  }
  for (const [id, p] of pumps) {
    if (!live || (depositsNow[id] ?? 1) <= 0) {
      client.scene.remove(p.node);
      pumps.delete(id);
      continue;
    }
    if (inView(p.d.x, p.d.z, 8)) p.node.rotation.set(Math.sin(clock * 1.7 + id) * 0.2, p.yaw, 0);
  }
}

function spawnFlock(client: Client): void {
  const a = Math.random() * Math.PI * 2;
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  const reach = cam.dist * 1.6 + 16;
  const startX = cam.x - dx * reach;
  const startZ = cam.z - dz * reach;
  const n = 5 + Math.floor(Math.random() * 5);
  const birds: Bird[] = [];
  for (let i = 0; i < n; i++) {
    const body = piece(client, 'ic_bird', 0.8);
    const l = piece(client, 'ic_wing_l', 0.8);
    const r = piece(client, 'ic_wing_r', 0.8);
    if (!body || !l || !r) return;
    body.add(l);
    body.add(r);
    body.rotation.order = 'YXZ';
    client.scene.add(body);
    // A loose V behind the first.
    const side = (i & 1 ? 1 : -1) * Math.ceil(i / 2);
    const back = Math.abs(side) * 2.4 + Math.random();
    birds.push({ node: body, left: l, right: r, x: startX - dx * back + dz * side * 2.2, y: FLOOR + 20 + Math.random() * 3, z: startZ - dz * back - dx * side * 2.2, phase: Math.random() * 6 });
  }
  flock = { birds, dx, dz, end: clock + (reach * 2 + 20) / 11 };
}

function frameBirds(client: Client, dt: number): void {
  if (!flock) {
    nextFlock -= dt;
    if (nextFlock <= 0 && phaseNow === 'play') {
      nextFlock = 26 + Math.random() * 30;
      spawnFlock(client);
    }
    return;
  }
  const yaw = Math.atan2(flock.dx, flock.dz);
  for (const b of flock.birds) {
    b.x += flock.dx * 11 * dt;
    b.z += flock.dz * 11 * dt;
    b.phase += dt;
    // Flapping for a while, then a glide.
    const glide = Math.max(0, Math.sin(b.phase * 0.5)) > 0.7;
    const wing = glide ? 0.12 : Math.sin(b.phase * 9) * 0.62;
    b.left.rotation.z = -wing;
    b.right.rotation.z = wing;
    b.node.position.set(b.x, b.y + Math.sin(b.phase * 9) * (glide ? 0 : 0.12), b.z);
    b.node.rotation.set(0, yaw, 0);
  }
  if (clock > flock.end) {
    for (const b of flock.birds) client.scene.remove(b.node);
    flock = null;
  }
}

function frameAir(client: Client, dt: number): void {
  // Pollen drifting on the wind, near where the camera's looking.
  moteIn -= dt;
  if (moteIn <= 0) {
    moteIn = 0.14;
    const x = cam.x + (Math.random() - 0.5) * cam.dist * 1.5;
    const z = cam.z + (Math.random() - 0.5) * cam.dist * 1.1;
    client.fx.particles({ x, y: FLOOR + heightAt(x, z) + 0.8 + Math.random() * 3, z }, [0.95, 0.88, 0.58], { count: 1, speed: 0.15, size: 0.075, glow: 0.4, life: 3.4, drag: 0.2, gravity: 0, velocity: { x: 1.1, y: 0.1, z: 0.35 } });
  }
  // Leaves, off the turning trees and now and then the others.
  leafIn -= dt;
  if (leafIn <= 0) {
    leafIn = 0.2;
    const pool = Math.random() < 0.7 ? AUTUMN : TREES;
    const t = pool[Math.floor(Math.random() * pool.length)];
    if (t && inView(t.x, t.z, -6)) client.fx.particles({ x: t.x + (Math.random() - 0.5) * 3, y: FLOOR + 3 + Math.random() * 2, z: t.z + (Math.random() - 0.5) * 3 }, pool === AUTUMN ? [0.7, 0.34, 0.06] : [0.12, 0.3, 0.07], { count: 1, speed: 0.25, size: 0.15, life: 4, drag: 1.4, gravity: 1, velocity: { x: 1.3, y: -0.1, z: 0.4 } });
  }
  // A fish, somewhere on a lake in view.
  splashIn -= dt;
  if (splashIn <= 0) {
    splashIn = 1.8 + Math.random() * 3;
    const near = LAKES.filter((l) => inView(l.x, l.z, l.r));
    const l = near[Math.floor(Math.random() * near.length)];
    if (l) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (l.r - 3);
      const at = { x: l.x + Math.cos(a) * r, y: FLOOR + 0.1, z: l.z + Math.sin(a) * r };
      client.fx.particles(at, [0.85, 0.95, 1], { count: 7, speed: 0.9, up: 2.4, size: 0.1, glow: 0.4, life: 0.5, gravity: 11 });
    }
  }
}

export function frameLife(client: Client, dt: number): void {
  clock += dt;
  const beacon = (beaconIn -= dt) <= 0;
  if (beacon) beaconIn = 1.5;
  const weld = (weldIn -= dt) <= 0;
  if (weld) weldIn = 0.2;
  for (const d of built.values()) {
    const seen = inView(d.x, d.z, 12);
    if (!seen) continue;
    for (const p of d.parts) {
      if (p.move === 'spin') p.node.rotation.set(0, (p.yaw += dt * p.speed), 0);
      else if (p.move === 'sweep') p.node.rotation.set(0, p.yaw + Math.sin(clock * p.speed + d.id) * 1.3, 0);
      else if (p.move === 'sock') p.node.rotation.set(0, Math.sin(clock * 0.9 + d.id) * 0.32, Math.sin(clock * 1.7 + d.id) * 0.08 - 0.08);
      else if (p.move === 'gun') {
        // On watch it looks slowly about; at work it's on the target.
        if (clock - d.firedAt > 3) d.aim = Math.sin(clock * 0.35 + d.id) * 1.4 + d.id;
        let gap = d.aim - p.yaw;
        while (gap > Math.PI) gap -= Math.PI * 2;
        while (gap < -Math.PI) gap += Math.PI * 2;
        p.yaw += gap * Math.min(1, dt * 7);
        p.node.rotation.set(0, p.yaw, 0);
      }
    }
    d.cloth.forEach((c, i) => c.rotation.set(0, Math.sin(clock * 3.6 - i * 1.1 + d.id) * (i ? 0.5 : 0.28), Math.sin(clock * 2.1 + i) * 0.03));
    const k = SCALE[d.kind] / 16;
    if (beacon) {
      const at = BEACONS[d.kind];
      if (at) client.fx.flare({ x: d.x + at[0] * k, y: d.y + at[1] * k, z: d.z + at[2] * k }, 1.5);
    }
    // Something being built in the factory's yard: the welders are at it.
    if (weld && d.kind === 'factory' && d.queue) {
      const at = { x: d.x + (-2 + (Math.random() - 0.5) * 12) * k, y: d.y + 6 * k, z: d.z + 13 * k };
      client.fx.flare(at, 0.7);
      client.fx.burst(at, { color: '#ffe0a0', count: 4, speed: 5, size: 0.09, glow: 1.4, life: 0.3, gravity: 13 });
    }
  }
  framePumps(client, dt);
  frameBirds(client, dt);
  if (phaseNow === 'play') frameAir(client, dt);
}

/** All gone (back to the lobby). */
export function clearLife(client: Client): void {
  for (const d of built.values()) undress(client, d);
  built.clear();
  seenDone.clear();
  for (const p of pumps.values()) client.scene.remove(p.node);
  pumps.clear();
  if (flock) for (const b of flock.birds) client.scene.remove(b.node);
  flock = null;
}
