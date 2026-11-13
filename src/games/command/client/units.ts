import type { Client, Node } from '@platform/client';
import { UNITS, type UnitKind } from '../defs';
import { FLOOR, heightAt } from '../map';
import { rankBits } from '../protocol';
import { SCALE, variantOf } from '../models';
import { BUILDINGS } from '../defs';
import type { B, U } from './ui';
import { inView } from './camera';
import { puff } from './battle';

/**
 * The units as this screen draws them, in Blockilization's manner (its `client/models3d.ts`): each
 * a model of its own in the scene, not a prop the server moves, so it glides between the server's
 * updates and has a gait. Infantry go as a little squad (fewer as it takes hits): each man steps,
 * carries his weapon low and brings it up to fire, looks about when he's idle, and goes down in his
 * own way; an engineer swings a hammer and carries its load on its back. Vehicles ride the ground,
 * squat as they pull away and dip as they stop; helicopters lean into a turn; a burning wreck can
 * throw its turret.
 * Each wears its army's colours (`tools/shapes.mjs`); the commander carries its army's standard. Only what the server
 * sends this screen is drawn, so the fog hides what it should.
 */

interface Shown {
  kind: UnitKind;
  seat: number;
  node: Node;
  /** The figures (a squad's several, else one), each in its own holder so it can step on its own. */
  men: Node[];
  /** Each man's two legs, each hung from its hip (none for what doesn't walk). */
  legs: Node[][];
  /** Each man's arms, on a pivot at the shoulder: one piece if he holds his weapon in both hands, else right and left. */
  arms: Node[][];
  /** How far each man is kicked back by his own shot, 1 to 0; and whose turn it is. */
  kicks: number[];
  /** How far the squad has settled into a firing stance, 0 to 1. */
  brace: number;
  /** The last hammer blow it struck (an engineer's). */
  beat: number;
  tail: Node | null;
  /** The ground's slope under a vehicle, eased; speeding up (+) or slowing (-); leaning into a turn. */
  tilt: number;
  tiltRoll: number;
  surge: number;
  bank: number;
  was: number;
  /** Until its next puff of exhaust or smoke. */
  puff: number;
  flag: Node | null;
  /** A tank's turret, which turns on the hull, and which way it's pointing. */
  gun: Node | null;
  aim: number;
  /** What turns on it: a helicopter's main rotor (fast), a flak tank's radar dish (slowly). */
  rotor: Node | null;
  crate: Node | null;
  crateKind: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  tx: number;
  tz: number;
  tyaw: number;
  /** Its velocity, from the server's last two updates (so it glides on between them rather than lurching to each). */
  vx: number;
  vz: number;
  /** When the server last moved it. */
  at: number;
  hp: number;
  flags: number;
  phase: number;
  speed: number;
  kick: number;
  /** When it last fired. */
  fired: number;
  hit: number;
  seen: number;
  /** The ground's height under it, eased (it walks up a hill's terraces, not jumps them). */
  gy: number;
}

interface Dying {
  node: Node;
  t: number;
  y: number;
  yaw: number;
  air: boolean;
  boat: boolean;
  /** A vehicle on land: it stays where it stopped, burning, before it sinks away. */
  wreck: boolean;
  x: number;
  z: number;
  /** On foot: each man, how he goes over. */
  men: Node[];
  legs: Node[][];
  arms: Node[][];
  dirs: { back: number; side: number }[];
  /** A tank's turret, thrown clear. */
  gun: Node | null;
  rotor: Node | null;
  tail: Node | null;
  crashed: boolean;
}

const shown = new Map<number, Shown>();
const dying: Dying[] = [];
/** Where each unit is drawn this frame (the interface puts rings and bars there, not at the server's last word). */
export const drawnAt = new Map<number, { x: number; z: number; y: number }>();
/** Where something blew up lately: a unit gone from there died (it didn't just walk into the fog). */
const blasts: { x: number; z: number; t: number }[] = [];
let tick = 0;
let now = 0;

/** How many men a unit's squad has (at full strength). */
const SQUAD: Partial<Record<UnitKind, number>> = { rifle: 3, guard: 2, at: 2 };
const FOOT: UnitKind[] = ['engineer', 'rifle', 'hero', 'guard', 'at', 'medic'];
const SPOTS = [[0, 0.75], [-0.8, -0.45], [0.8, -0.45]];
/** Which trousers each kind on foot wears. */
const LEGS: Partial<Record<UnitKind, string>> = { engineer: 'ic_leg_e', rifle: 'ic_leg', at: 'ic_leg', hero: 'ic_leg', medic: 'ic_leg', guard: 'ic_leg_w' };
/** A leg's hip on its model: voxels up from the ground, and out from the middle. */
const HIP_Y = 5 / 16;
const HIP_X = 2 / 16;
/** What each kind's arms are, on the field. */
const ARMS: Partial<Record<UnitKind, string[]>> = { rifle: ['ic_arms_rifle'], guard: ['ic_arms_ak'], at: ['ic_arms_at'], engineer: ['ic_arm_e_r', 'ic_arm_e_l'], hero: ['ic_arm_h_r', 'ic_arm_h_l'], medic: ['ic_arm_m_r', 'ic_arm_m_l'] };
/** The shoulders on a soldier's model, in voxels up from the ground. */
const SHOULDER_Y = 9 / 16;
const flagOf = (seat: number) => `flag_${seat >= 6 ? 6 : seat % 6}`;

function model(client: Client, id: string, scale: number): Node | null {
  const made = client.scene.item(id);
  if (!made) return null;
  made.node.scale.setScalar(scale);
  const holder = client.scene.node();
  holder.add(made.node);
  return holder;
}

/** The flag: on a pole behind the squad (or the vehicle), in the team's colour; null while its file loads. */
function addFlag(client: Client, node: Node, kind: UnitKind, seat: number): Node | null {
  if (kind !== 'hero') return null;
  const flag = model(client, flagOf(seat), kind === 'hero' ? 3.6 : kind === 'engineer' ? 2.4 : 3.1);
  if (!flag) return null;
  const big = UNITS[kind].size >= 2;
  flag.position.set(big ? -1.1 : -0.55, big ? 1.4 : 0, big ? -1.2 : -0.9);
  node.add(flag);
  return flag;
}

/** A leg, hung from its hip so it swings from there (null while its file loads). */
function leg(client: Client, id: string, scale: number, side: number): Node | null {
  const made = client.scene.item(id);
  if (!made) return null;
  made.node.scale.setScalar(scale);
  made.node.position.y = -HIP_Y * scale;
  const hip = client.scene.node();
  hip.add(made.node);
  hip.position.set(side * HIP_X * scale, HIP_Y * scale, 0);
  return hip;
}

/** Arms (or anything hung from the shoulder), so they turn from there (null while its file loads). */
function hungArm(client: Client, id: string, scale: number): Node | null {
  const made = client.scene.item(id);
  if (!made) return null;
  made.node.scale.setScalar(scale);
  made.node.position.y = -SHOULDER_Y * scale;
  const pivot = client.scene.node();
  pivot.add(made.node);
  pivot.position.y = SHOULDER_Y * scale;
  return pivot;
}

function make(client: Client, u: U): Shown | null {
  const n = SQUAD[u.kind] ?? 1;
  const k = n > 1 ? 0.78 : 1;
  const node = client.scene.node();
  const men: Node[] = [];
  const legs: Node[][] = [];
  const trousers = LEGS[u.kind];
  const arms: Node[][] = [];
  for (let i = 0; i < n; i++) {
    const scale = SCALE[u.kind] * k;
    const m = model(client, trousers ? `ic_${u.kind}_t_${variantOf(u.seat)}` : u.kind === 'tank' ? `ic_tank_h_${variantOf(u.seat)}` : `ic_${u.kind}_${variantOf(u.seat)}`, scale);
    if (!m) return null;
    if (trousers) {
      const pair = [leg(client, trousers, scale, -1), leg(client, trousers, scale, 1)];
      if (!pair[0] || !pair[1]) return null;
      m.add(pair[0]);
      m.add(pair[1]);
      legs.push(pair as Node[]);
    }
    const held = (ARMS[u.kind] ?? []).map((a) => hungArm(client, a, scale));
    if (held.some((a) => !a)) return null;
    for (const a of held) m.add(a!);
    arms.push(held as Node[]);
    if (n > 1) m.position.set(SPOTS[i][0], 0, SPOTS[i][1]);
    node.add(m);
    men.push(m);
  }
  let gun: Node | null = null;
  if (u.kind === 'tank') {
    gun = model(client, `ic_tank_g_${variantOf(u.seat)}`, SCALE.tank);
    if (!gun) return null;
    node.add(gun);
  }
  // The rotor over a helicopter's mast (14 voxels up, at its scale).
  let rotor: Node | null = null;
  if (u.kind === 'heli') {
    rotor = model(client, 'ic_rotor', SCALE.rotor);
    rotor?.position.set(0, (14 / 16) * SCALE.heli, 0);
  } else if (u.kind === 'aa') {
    // The dish on its mast (20 voxels up, 6.5 back).
    rotor = model(client, 'ic_radar', SCALE.aa);
    rotor?.position.set(0, (20 / 16) * SCALE.aa, (-7 / 16) * SCALE.aa);
  }
  if (rotor) node.add(rotor);
  // The tail rotor, out on the boom.
  let tail: Node | null = null;
  if (u.kind === 'heli') {
    tail = model(client, 'ic_tail_rotor', SCALE.heli);
    const k = SCALE.heli / 16;
    tail?.position.set(1.5 * k, 14.5 * k, -25.5 * k);
    if (tail) node.add(tail);
  }
  // (Pitch and roll about the unit's own length and width, whichever way it faces.)
  node.rotation.order = 'YXZ';
  client.scene.add(node);
  const flag = addFlag(client, node, u.kind, u.seat);
  const gy = UNITS[u.kind].naval ? 0 : heightAt(u.x, u.z);
  const y = FLOOR + gy + (UNITS[u.kind].air ? 5 : 0);
  return { arms, kicks: men.map(() => 0), brace: 0, beat: 0, tail, tilt: 0, tiltRoll: 0, surge: 0, bank: 0, was: 0, puff: Math.random(), kind: u.kind, seat: u.seat, node, men, legs, gun, aim: u.yaw, flag, rotor, crate: null, crateKind: 0, x: u.x, z: u.z, y, yaw: u.yaw, tx: u.x, tz: u.z, tyaw: u.yaw, vx: 0, vz: 0, at: now, hp: u.hp, flags: u.flags, phase: Math.random() * 6, speed: 0, kick: 0, fired: -9, hit: -9, seen: tick, gy };
}

let ghost: { id: string; node: Node } | null = null;
/** The building being placed, as a model under the mouse (null: none). */
export function frameGhost(client: Client, kind: string | null, seat: number, x: number, z: number): void {
  const id = kind ? `ic_${kind}_${variantOf(seat)}` : '';
  if (ghost && ghost.id !== id) {
    client.scene.remove(ghost.node);
    ghost = null;
  }
  if (kind && !ghost) {
    const node = model(client, id, SCALE[kind]);
    if (node) {
      client.scene.add(node);
      ghost = { id, node };
    }
  }
  ghost?.node.position.set(x, FLOOR, z);
}

/** The server's latest: where each unit is going, and which have gone (died, or out of sight). */
export function updateUnits(client: Client, list: U[]): void {
  tick++;
  for (const u of list) {
    let s = shown.get(u.id);
    if (!s) {
      const made = make(client, u);
      if (!made) continue;
      s = made;
      shown.set(u.id, s);
    }
    if (u.hp < s.hp) s.hit = now;
    // Being patched up: a green glimmer.
    else if (u.hp > s.hp && rankBits(u.flags) === rankBits(s.flags)) client.fx.burst({ x: s.x, y: s.y + 2, z: s.z }, { color: '#7dff7d', count: 3, speed: 1.2, size: 0.2, glow: 0.9, life: 0.6, gravity: -2.4 });
    // A star won: a gold burst and a fanfare.
    if (rankBits(u.flags) > rankBits(s.flags)) {
      client.fx.burst({ x: s.x, y: s.y + 3, z: s.z }, { color: '#ffd23a', count: 26, speed: 6, size: 0.3, glow: 1, life: 0.8, gravity: -1 });
      client.fx.shockwave({ x: s.x, y: s.y + 0.3, z: s.z }, 5, '#ffd23a');
      client.audio.play('cm_promote', { at: { x: s.x, y: s.y, z: s.z } });
    }
    if (u.x !== s.tx || u.z !== s.tz) {
      const gap = Math.min(0.5, Math.max(0.05, now - s.at));
      const jump = Math.hypot(u.x - s.tx, u.z - s.tz) > 10;
      s.vx = jump ? 0 : s.vx + ((u.x - s.tx) / gap - s.vx) * 0.6;
      s.vz = jump ? 0 : s.vz + ((u.z - s.tz) / gap - s.vz) * 0.6;
      s.at = now;
    }
    s.tx = u.x;
    s.tz = u.z;
    s.tyaw = u.yaw;
    s.hp = u.hp;
    s.flags = u.flags;
    s.seen = tick;
    // A squad loses men as it's hurt.
    if (s.men.length > 1) s.men.forEach((m, i) => (m.visible = i < Math.max(1, Math.ceil((u.hp / 100) * s!.men.length))));
  }
  for (const [id, s] of shown) {
    if (s.seen === tick) continue;
    shown.delete(id);
    drawnAt.delete(id);
    // Killed (it was hurt and something blew near it, or it was nearly dead): it topples and sinks.
    const killed = s.hp <= 40 || blasts.some((b) => now - b.t < 0.6 && Math.hypot(b.x - s.x, b.z - s.z) < 4);
    if (killed) {
      dying.push({ node: s.node, t: now, y: s.y, yaw: s.yaw, air: !!UNITS[s.kind].air, boat: !!UNITS[s.kind].naval, wreck: !FOOT.includes(s.kind) && !UNITS[s.kind].air && !UNITS[s.kind].naval, x: s.x, z: s.z, men: FOOT.includes(s.kind) ? s.men : [], legs: s.legs, arms: s.arms, dirs: s.men.map(() => ({ back: Math.random() < 0.75 ? 1 : -1, side: (Math.random() - 0.5) * 0.7 })), gun: s.gun && Math.random() < 0.7 ? s.gun : null, rotor: s.rotor, tail: s.tail, crashed: false });
      if (s.flag) s.flag.visible = false;
      if (s.crate) s.crate.visible = false;
    } else client.scene.remove(s.node);
  }
}

/** A blast at a spot (a death, a shell): what goes missing near it next was killed. */
export function blastAt(x: number, z: number): void {
  blasts.push({ x, z, t: now });
  if (blasts.length > 40) blasts.splice(0, blasts.length - 40);
}

/** Who fired, as a shot's start tells it: the kind, and where each man still standing is. */
export interface Firer {
  kind: UnitKind;
  men: { x: number; z: number }[];
  kick(man: number): void;
}

/** A shot from a spot: the unit standing there kicks back with it (and fires it, a man at a time). */
export function firedFrom(x: number, z: number): Firer | null {
  let best: Shown | null = null;
  let bd = 3;
  for (const s of shown.values()) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  if (!best) return null;
  const b = best;
  b.kick = 1;
  b.fired = now;
  const cs = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  const live = b.men.map((_, i) => i).filter((i) => b.men[i].visible);
  return {
    kind: b.kind,
    men: live.map((i) => {
      const at = b.men.length > 1 ? SPOTS[i] : [0, 0];
      return { x: b.x + at[0] * cs + at[1] * sn, z: b.z - at[0] * sn + at[1] * cs };
    }),
    kick: (man) => {
      if (live[man] !== undefined) b.kicks[live[man]] = 1;
    },
  };
}

/** What a shot landing here hit, by what's standing there. */
export function struck(x: number, z: number): 'foot' | 'armor' | 'air' | null {
  let best: Shown | null = null;
  let bd = 2.8;
  for (const s of shown.values()) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  if (!best) return null;
  return UNITS[best.kind].air ? 'air' : FOOT.includes(best.kind) ? 'foot' : 'armor';
}

const turn = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
};

/** What a unit on the field looks to be at: on the move, in a fight (fired lately). */
export function activity(id: number): { moving: boolean; fighting: boolean } {
  const s = shown.get(id);
  return { moving: !!s && s.speed > 0.6, fighting: !!s && now - s.fired < 2.5 };
}

export function frameUnits(client: Client, dt: number): void {
  now += dt;
  for (const [id, s] of shown) {
    const def = UNITS[s.kind];
    // Glide on at its pace from where the server last had it (its updates come ten times a second, so
    // chasing each would lurch); stopped once the updates stop moving it; jump if it's far off.
    const age = now - s.at;
    if (age > 0.3) {
      s.vx *= Math.max(0, 1 - dt * 10);
      s.vz *= Math.max(0, 1 - dt * 10);
    }
    const ahead = Math.min(age, 0.15);
    const dx = s.tx + s.vx * ahead - s.x;
    const dz = s.tz + s.vz * ahead - s.z;
    const d = Math.hypot(dx, dz);
    if (d > 10) {
      s.x = s.tx;
      s.z = s.tz;
    } else {
      const k = Math.min(1, dt * 6);
      s.x += dx * k;
      s.z += dz * k;
    }
    s.speed += (Math.hypot(s.vx, s.vz) - s.speed) * Math.min(1, dt * 6);
    const visible = inView(s.x, s.z, 8);
    const accel = (s.speed - s.was) / Math.max(dt, 0.008);
    s.was = s.speed;
    s.surge += (Math.max(-1, Math.min(1, accel * 0.14)) - s.surge) * Math.min(1, dt * 7);
    const moving = s.speed > 0.6;
    const moved = s.speed * dt;
    // (A tank turns its hull only to drive; standing, its turret does the turning.)
    const heading = s.yaw;
    if (s.kind !== 'tank' || moving) s.yaw = turn(s.yaw, s.tyaw, dt * (s.kind === 'tank' ? 4 : 10));
    if (s.gun) {
      s.aim = turn(s.aim, now - s.fired < 3 ? s.tyaw : s.yaw, dt * 5);
      const rel = s.aim - s.yaw;
      s.gun.rotation.set(0, rel, 0);
      // The gun comes back on its mount with each shot.
      s.gun.position.set(-Math.sin(rel) * s.kick * 0.3, 0, -Math.cos(rel) * s.kick * 0.3);
    }
    {
      let rate = s.yaw - heading;
      while (rate > Math.PI) rate -= Math.PI * 2;
      while (rate < -Math.PI) rate += Math.PI * 2;
      s.bank += (Math.max(-0.45, Math.min(0.45, (rate / Math.max(dt, 0.008)) * 0.2)) - s.bank) * Math.min(1, dt * 5);
    }
    s.phase += moved * (def.air ? 0 : 2.3);
    s.kick = Math.max(0, s.kick - dt * 7);
    const foot = FOOT.includes(s.kind);
    // Up and down the hills' terraces, eased.
    s.gy += ((def.naval ? 0 : heightAt(s.x, s.z)) - s.gy) * Math.min(1, dt * 7);
    const ground = FLOOR + s.gy;
    let y = ground;
    let pitch = 0;
    let roll = 0;
    if (def.air) {
      y = FLOOR + 5 + Math.sin(now * 2.2 + id) * 0.3;
      // Nose down as it picks up speed, up as it flares to stop; banking into a turn.
      pitch = Math.min(0.26, s.speed * 0.03) + s.surge * 0.1;
      roll = -s.bank;
    } else if (def.naval) {
      // Afloat: low in the water, rocking; a wake behind it when it's under way.
      y = FLOOR - 0.45 + Math.sin(now * 1.6 + id) * 0.08;
      pitch = Math.sin(now * 1.1 + id) * 0.03 - s.kick * 0.06 - Math.min(0.16, s.speed * 0.02);
      roll = Math.sin(now * 1.4 + id * 2) * 0.05 - s.bank * 0.4;
      if (moving && Math.random() < dt * 14) client.fx.burst({ x: s.x - Math.sin(s.yaw) * 2.2, y: FLOOR + 0.1, z: s.z - Math.cos(s.yaw) * 2.2 }, { color: '#e8f4ff', count: 3, speed: 1.6, size: 0.35, life: 0.7, drag: 2, gravity: 1 });
    } else if (foot) {
      // Each man steps on his own beat: a soft bob (twice a stride), a sway from foot to foot, a lean
      // into the walk, all eased in and out with his pace. Stopped, he breathes and looks about;
      // shooting, he sets his feet and brings his weapon up.
      const pace = Math.min(1, s.speed / 3);
      s.brace += ((now - s.fired < 1.8 && !moving ? 1 : 0) - s.brace) * Math.min(1, dt * 9);
      const atWork = !!(s.flags & 1);
      s.men.forEach((m, i) => {
        const p = s.phase + i * 1.3;
        const k = (s.kicks[i] = Math.max(0, s.kicks[i] - dt * 9));
        const idle = (1 - pace) * (1 - s.brace) * (atWork ? 0 : 1);
        const t = now * 0.7 + id * 1.7 + i * 2.3;
        const breath = Math.sin(now * 1.7 + i + id);
        const base = s.men.length > 1 ? SPOTS[i] : [0, 0];
        m.position.set(base[0] + Math.sin(p) * 0.04 * pace, (0.5 - 0.5 * Math.cos(p * 2)) * 0.13 * pace + breath * 0.012 * idle - s.brace * 0.05, base[1] - k * 0.16);
        m.rotation.set(0.11 * pace + s.brace * 0.14 - k * 0.1, Math.sin(p) * 0.05 * pace + idle * Math.sin(t * 0.5 + Math.sin(t * 0.21) * 2.4) * 0.55, Math.sin(p) * 0.06 * pace + idle * Math.sin(t * 0.4) * 0.02);
        // The legs swing from the hips, one forward as the other goes back; set apart to shoot.
        const swing = Math.sin(p) * 0.78 * pace;
        const pair = s.legs[i];
        if (pair) {
          pair[0].rotation.x = swing - s.brace * 0.3;
          pair[1].rotation.x = -swing + s.brace * 0.34;
        }
        const a = s.arms[i];
        if (a?.length === 1) {
          // Both hands on the weapon: low while he walks, level to fire, jolted up by each shot.
          const low = (s.kind === 'at' ? 0.4 : 1) * (0.5 * pace * (1 - s.brace) + 0.26 * idle);
          a[0].rotation.x = low + Math.sin(p * 2) * 0.05 * pace + breath * 0.016 * idle - k * 0.32;
        } else if (a?.length === 2) {
          // Arms at his sides swing against his legs; a commander brings his sidearm up.
          const arm = Math.sin(p) * 0.7 * pace;
          a[0].rotation.x = -arm - s.brace * 1.35 - k * 0.3;
          a[1].rotation.x = arm + breath * 0.02 * idle;
        }
      });
      // At work: raising the hammer slowly, bringing it down fast, sparks and dust as it lands.
      if (atWork && s.arms[0]?.length === 2) {
        const clock = now * 1.5 + id * 0.37;
        const c = clock % 1;
        const up = c < 0.72 ? c / 0.72 : 1 - (c - 0.72) / 0.28;
        const eased = up * up * (3 - 2 * up);
        s.arms[0][0].rotation.x = -0.35 - eased * 2.2;
        s.men[0].rotation.x = c < 0.72 ? -eased * 0.12 : (1 - up) * 0.28;
        const blow = Math.floor(clock);
        if (blow !== s.beat) {
          s.beat = blow;
          if (visible) {
            const at = { x: s.x + Math.sin(s.yaw) * 1.1, y: ground + 0.4, z: s.z + Math.cos(s.yaw) * 1.1 };
            client.fx.burst(at, { color: '#ffd27a', count: 3, speed: 3.6, size: 0.1, glow: 1.2, life: 0.28, gravity: 11 });
            client.fx.burst(at, { color: '#9a8a62', count: 2, speed: 1.2, size: 0.28, life: 0.5, gravity: 2 });
          }
        }
      }
    } else {
      // Tracks and wheels: riding the slope, a low rumble; squatting as it pulls away and dipping
      // as it brakes; the gun kicks it back.
      if (visible) {
        const sn = Math.sin(s.yaw);
        const cs = Math.cos(s.yaw);
        const reach = def.size >= 2 ? 2.2 : 1.4;
        const h = (a: number, b: number) => heightAt(s.x + sn * a + cs * b, s.z + cs * a - sn * b);
        s.tilt += (Math.atan2(h(-reach, 0) - h(reach, 0), reach * 2) - s.tilt) * Math.min(1, dt * 7);
        s.tiltRoll += (Math.atan2(h(0, reach) - h(0, -reach), reach * 2) - s.tiltRoll) * Math.min(1, dt * 7);
      }
      y = ground + (moving ? Math.abs(Math.sin(s.phase * 2.5)) * 0.06 : Math.sin(now * 40 + id) * 0.006);
      pitch = s.tilt - s.surge * 0.07 - s.kick * 0.1;
      roll = s.tiltRoll - s.bank * 0.12;
      if (s.kind === 'brute' || s.kind === 'scout') {
        y = ground + (moving ? Math.abs(Math.sin(s.phase)) * 0.2 : 0);
        // A bike leans right over into a turn and lifts its front wheel to pull away.
        pitch = s.tilt - Math.max(0, s.surge) * (s.kind === 'scout' ? 0.26 : 0.1);
        roll = s.tiltRoll + (moving ? Math.sin(s.phase) * 0.05 : 0) - s.bank * (s.kind === 'scout' ? 1.1 : 0.3);
      }
    }
    // Exhaust from what's running; smoke, then fire, from what's hurt.
    if (!foot && visible) {
      s.puff -= dt;
      if (s.puff <= 0) {
        s.puff = 0.24 + Math.random() * 0.12;
        const back = def.size >= 2 ? 2.8 : 1.4;
        const at = { x: s.x - Math.sin(s.yaw) * back, y: y + 1.2, z: s.z - Math.cos(s.yaw) * back };
        if (s.kind === 'tank' || s.kind === 'artillery' || s.kind === 'aa') puff(client, at.x, at.y, at.z, 'm', moving ? 0.34 : 0.22, 0.7, 0, 1.6, 0);
        const body = { x: s.x, y: y + 1.6, z: s.z };
        if (s.hp < 55) puff(client, body.x, body.y, body.z, 'd', 0.62, 1.4, 0, 2.3, 0);
        if (s.hp < 28) puff(client, body.x, body.y - 0.3, body.z, 'f', 0.46, 0.42, 0, 2.4, 0);
      }
    }
    // Hit: a shudder.
    const shake = now - s.hit < 0.15 ? (Math.random() - 0.5) * 0.25 : 0;
    s.y = y;
    const back = s.kick * (foot || s.gun ? 0 : 0.35);
    s.node.position.set(s.x - Math.sin(s.yaw) * back + shake, y, s.z - Math.cos(s.yaw) * back);
    s.node.rotation.set(pitch, s.yaw, roll);
    if (!s.flag && s.kind === 'hero') s.flag = addFlag(client, s.node, s.kind, s.seat);
    // The flag streams out behind, fluttering.
    if (s.flag) s.flag.rotation.set(0, Math.sin(now * 3 + id) * 0.25 + (moving ? 0.3 : 0), 0);
    // An engineer's load: a crate of steel or a drum of oil on its back.
    const want = s.flags & 2 ? 1 : s.flags & 4 ? 2 : 0;
    if (want !== s.crateKind) {
      if (s.crate) s.node.remove(s.crate);
      s.crate = want ? model(client, want === 1 ? 'ic_crate' : 'ic_drum', want === 1 ? SCALE.crate : SCALE.drum) : null;
      if (s.crate) {
        s.crate.position.set(0, 1.5, -1.1);
        s.node.add(s.crate);
      }
      s.crateKind = want;
    }
    if (s.crate) s.crate.position.y = 1.5 + (s.men[0]?.position.y ?? 0);
    if (s.rotor) s.rotor.rotation.set(0, (s.kind === 'heli' ? now * 22 : now * 1.6) + id, 0);
    if (s.tail) s.tail.rotation.set(now * 34, 0, 0);
    drawnAt.set(id, { x: s.x, z: s.z, y });
  }
  // The dead: over they go, and down into the ground.
  for (let i = dying.length - 1; i >= 0; i--) {
    const f = dying[i];
    const t = now - f.t;
    if (f.air) {
      // A helicopter spins down trailing fire, and goes up where it hits.
      const drop = f.y - t * t * 6;
      f.node.position.y = Math.max(FLOOR, drop);
      if (drop > FLOOR) {
        f.node.rotation.set(0.4, f.yaw + t * 6, 0.3);
        if (f.rotor) f.rotor.rotation.y += dt * Math.max(4, 22 - t * 8);
        const at = { x: f.x, y: f.node.position.y + 1.2, z: f.z };
        puff(client, at.x, at.y, at.z, 'f', 0.6, 0.35, 0, 1, 0);
        if (Math.random() < 0.6) puff(client, at.x, at.y + 0.3, at.z, 'd', 0.8, 1.4, 0, 2, 0);
      } else if (!f.crashed) {
        f.crashed = true;
        const at = { x: f.x, y: FLOOR + 1, z: f.z };
        client.fx.flare(at, 3);
        client.fx.burst(at, { color: '#ffb347', count: 16, speed: 9, size: 0.12, glow: 1.4, life: 0.5, gravity: 8 });
        for (let n = 0; n < 8; n++) puff(client, at.x, at.y, at.z, n < 4 ? 'f' : 'd', n < 4 ? 1.1 : 1.3, n < 4 ? 0.45 : 1.8, (Math.random() - 0.5) * 8, 2 + Math.random() * 2, (Math.random() - 0.5) * 8);
      }
    } else if (f.boat) {
      // A boat lists and goes down by the bow.
      f.node.rotation.set(Math.min(0.5, t * 0.3), f.yaw, Math.min(0.6, t * 0.4));
      f.node.position.y = f.y - t * 1.1;
    } else if (f.wreck) {
      // A knocked-out vehicle: a lurch, it settles into its own wreck (the server's left that where it stopped), and burns on.
      f.node.rotation.set(Math.min(0.12, t * 0.6), f.yaw, Math.min(0.08, t * 0.4));
      f.node.position.y = f.y - Math.max(0, t - 2.4) * 2.4;
      // Its turret, blown up off the hull: up, over, and down beside it.
      if (f.gun) {
        const g = Math.min(t, 1);
        f.gun.position.set(g * 1.6, Math.max(0, 11 * g - 12 * g * g), -g * 1.1);
        f.gun.rotation.set(g * 2.2, g * 1.4, g * 1.1);
      }
      if (t < 3.6 && Math.random() < 0.5) {
        const at = { x: f.x + (Math.random() - 0.5) * 1.6, y: f.y + 1.6, z: f.z + (Math.random() - 0.5) * 1.6 };
        puff(client, at.x, at.y, at.z, 'f', 0.55, 0.42, 0, 2.6, 0);
        if (Math.random() < 0.5) puff(client, at.x, at.y + 0.4, at.z, 'd', 0.85, 1.8, 0, 2.4, 0);
      }
    } else {
      // Each man goes over his own way, a moment apart: thrown back, arms flung, and he lies there.
      f.men.forEach((m, i) => {
        if (!m.visible) return;
        const d = f.dirs[i];
        const k = Math.min(1, Math.max(0, t - i * 0.09) / 0.42);
        const e = k * k * (3 - 2 * k);
        m.rotation.set(-e * 1.48 * d.back, m.rotation.y, e * d.side);
        m.position.y = Math.sin(k * Math.PI) * 0.34;
        const pair = f.legs[i];
        if (pair) {
          pair[0].rotation.x = -e * 0.42;
          pair[1].rotation.x = e * 0.28;
        }
        for (const a of f.arms[i] ?? []) a.rotation.x = -e * 1.5;
      });
      f.node.position.y = f.y - Math.max(0, t - 1.35) * 1.4;
    }
    if (t > (f.wreck ? 4.4 : 2.4)) {
      client.scene.remove(f.node);
      dying.splice(i, 1);
    }
  }
}

/** Scaffolding round each building going up (it comes down when the building's done). */
const scaffolds = new Map<number, Node>();
export function updateScaffolds(client: Client, list: B[]): void {
  const want = new Set<number>();
  for (const b of list) {
    if (b.built >= 100) continue;
    want.add(b.id);
    if (scaffolds.has(b.id)) continue;
    const made = client.scene.item('ic_scaffold');
    if (!made) continue;
    // The model is a unit square, a unit tall: stretched to the footprint, half as tall as wide.
    const w = BUILDINGS[b.kind].radius * 2.1;
    made.node.scale.set(w, Math.min(6, w * 0.55), w);
    const node = client.scene.node();
    node.add(made.node);
    node.position.set(b.x, FLOOR + heightAt(b.x, b.z), b.z);
    client.scene.add(node);
    scaffolds.set(b.id, node);
  }
  for (const [id, node] of scaffolds) if (!want.has(id)) {
    client.scene.remove(node);
    scaffolds.delete(id);
  }
}

/** Everything off the field (back to the lobby). */
export function clearUnits(client: Client): void {
  for (const n of scaffolds.values()) client.scene.remove(n);
  scaffolds.clear();
  for (const s of shown.values()) client.scene.remove(s.node);
  for (const f of dying) client.scene.remove(f.node);
  shown.clear();
  dying.length = 0;
  drawnAt.clear();
}
