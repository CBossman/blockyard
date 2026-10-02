import { Models, type Entity, type GameContext, type Vec3 } from '@platform';
import { spawnMonster } from '../run/spawn';
import { map } from '../run/state';
import { adds, angle, announce, brain, fighters, fromSky, lane, near, ring, stagger, strike, sweep, type Ctx, type Move } from './fight';
import { MODEL } from './models';
import type { BossKind } from './registry';

/**
 * The Bone Colossus (wave 5): a giant of the arena's dead, slow and enormous. It sweeps an arm
 * across whoever's in front of it (step back or roll), stamps a shockwave round itself (jump it),
 * calls bones down out of the sky onto marked circles, and, hurt, tears its ribcage open to let
 * bone thralls climb out and lowers its head to charge: a charge that ends in a wall leaves it
 * stunned. A bomb at its feet staggers it. Below a quarter of its health it burns with fury.
 */

const COLOR = '#ffb24a';
/** Its reach in front (blocks from its middle) and its sweep's arc either side. */
const REACH = 7;
const ARC = 1.3;
const STOMP = 7.5;
const RAIN_R = 2.4;
/** How many thralls may be up at once. */
const THRALLS = 5;

const sweepMove: Move = {
  name: 'sweep',
  can: (c) => c.d < REACH - 0.5,
  cooldown: [2.2, 3],
  windup: 0.85,
  start(c) {
    const p = c.self.position;
    const a = angle(p, c.target.position);
    c.s.mem.sweep = a;
    c.self.lookAt(c.target);
    c.self.animate('sweep_wind', { fade: 0.25 });
    c.self.glow(COLOR);
    sweep(c.game, p, REACH, a, ARC, c.s.t, COLOR);
    c.game.audio.play('colossus_wind', { at: p });
  },
  act(c) {
    const p = c.self.position;
    const a = c.s.mem.sweep as number;
    c.self.animate('sweep', { fade: 0.06 });
    c.self.glow(null);
    strike(c.game, { source: c.self, at: p, r: REACH, damage: 7, arc: [a - ARC, a + ARC], knockback: 9, lift: 4.5 });
    c.game.audio.play('colossus_sweep', { at: p });
    c.game.fx.shake(0.15, 0.3);
  },
  recover: 0.9,
  end: (c) => c.self.glow(null),
};

const stompMove: Move = {
  name: 'stomp',
  can: (c) => c.d < STOMP + 1,
  cooldown: [5, 7],
  windup: 1,
  start(c) {
    const p = c.self.position;
    c.self.animate('stomp_wind', { fade: 0.25 });
    c.self.glow(COLOR);
    ring(c.game, p, STOMP, c.s.t, COLOR);
    c.game.audio.play('colossus_wind', { at: p, pitch: 0.7 });
  },
  act(c) {
    const p = c.self.position;
    c.self.animate('stomp', { fade: 0.06 });
    c.self.glow(null);
    strike(c.game, { source: c.self, at: p, r: STOMP, damage: [8, 4], grounded: true, knockback: 8, lift: 3 });
    c.game.fx.shockwave({ x: p.x, y: p.y + 0.1, z: p.z }, STOMP + 0.5, COLOR);
    c.game.fx.burst({ x: p.x, y: p.y + 0.3, z: p.z }, { color: '#d8c08a', count: 50, speed: 6, size: 0.2, gravity: 6, life: 1 });
    c.game.fx.shake(0.4, 0.6);
    c.game.audio.play('colossus_stomp', { at: p, volume: 1.4 });
  },
  recover: 1.1,
  end: (c) => c.self.glow(null),
};

/** Bones out of the sky: a circle under each fighter (where they're going), and more about them. */
const rainMove: Move = {
  name: 'rain',
  can: () => true,
  cooldown: [10, 13],
  weight: 1.4,
  windup: 0.9,
  start(c) {
    c.self.animate('rain', { fade: 0.25 });
    c.game.audio.play('colossus_roar', { at: c.self.position, pitch: 1.15, volume: 1.1 });
  },
  act(c) {
    const { game, self, s } = c;
    const m = map();
    const t = s.enraged ? 1.15 : 1.45;
    const spots: Vec3[] = [];
    for (const p of fighters(game)) {
      const q = p.position;
      spots.push({ x: q.x + p.velocity.x * 0.6, y: q.y, z: q.z + p.velocity.z * 0.6 });
    }
    const extra = 2 + s.phase + (s.enraged ? 2 : 0);
    for (let i = 0; i < extra; i++) {
      const by = spots[i % Math.max(1, spots.length)] ?? self.position;
      spots.push(near(game, by, 7, m.center, m.radius));
    }
    spots.forEach((at, i) => {
      const delay = i < fighters(game).length ? 0 : game.rng.range(0, 0.6);
      game.clock.after(delay, () => {
        if (!self.alive) return;
        ring(game, at, RAIN_R, t, COLOR);
        game.audio.play('bone_whistle', { at, pitch: game.rng.range(0.9, 1.1) });
        fromSky(game, MODEL.bone, at, t, () => {
          strike(game, { source: self, at, r: RAIN_R, damage: 6, knockback: 5, lift: 3 });
          game.fx.burst({ x: at.x, y: at.y + 0.4, z: at.z }, { color: '#efe4c8', count: 26, speed: 6, size: 0.16, gravity: 16 });
          game.fx.burst({ x: at.x, y: at.y + 0.3, z: at.z }, { color: '#c9b48a', count: 18, speed: 3, size: 0.3, gravity: -0.5, life: 1.2, drag: 2 });
          game.fx.shockwave({ x: at.x, y: at.y + 0.1, z: at.z }, RAIN_R + 0.4, COLOR);
          game.audio.play('bone_crash', { at });
        });
      });
    });
    self.animate('none', { fade: 0.4 });
  },
  recover: 0.6,
};

const thralls = (c: Ctx) => c.game.entities.all('thrall').filter((t) => t.alive && t.data.master === c.self.id).length;

/** Its ribcage opens and thralls climb out of it. */
const ribsMove: Move = {
  name: 'ribs',
  can: (c) => c.s.phase >= 2 && thralls(c) < THRALLS - 1,
  cooldown: [15, 18],
  windup: 1.1,
  start(c) {
    c.self.animate('rib_open', { fade: 0.3 });
    c.self.glow(COLOR);
    c.game.audio.play('rib_creak', { at: c.self.position });
  },
  act(c) {
    const { game, self } = c;
    self.glow(null);
    const n = Math.min(THRALLS - thralls(c), adds(game, 2));
    for (let i = 0; i < n; i++) {
      game.clock.after(i * 0.35, () => {
        if (!self.alive) return;
        const p = self.position;
        const a = angle(p, c.target.position) + (i - (n - 1) / 2) * 0.5;
        const chest = { x: p.x + Math.cos(a) * 1.9, y: p.y + 2.6, z: p.z + Math.sin(a) * 1.9 };
        const at = game.world.fits(chest) ? chest : { x: p.x + Math.cos(a) * 2.4, y: p.y + 0.05, z: p.z + Math.sin(a) * 2.4 };
        const t = spawnMonster(game, 'thrall', at, { yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), data: { master: self.id } });
        t.impulse(Math.cos(a) * 4, 3, Math.sin(a) * 4);
        game.fx.burst({ x: chest.x, y: chest.y, z: chest.z }, { color: COLOR, count: 24, speed: 3, size: 0.14, gravity: -1, glow: 1.2, life: 0.7 });
        game.audio.play('skeleton', { at, pitch: 0.8 });
      });
    }
  },
  recover: 1.2,
  end: (c) => {
    c.self.glow(null);
    c.self.animate('none', { fade: 0.4 });
  },
};

/** Head down, it charges along a lane at its target: whoever's in the way is thrown, and a wall at the end stuns it. */
const chargeMove: Move = {
  name: 'charge',
  can: (c) => c.s.phase >= 2 && c.d > 8 && c.d < 24 && c.self.canSee(c.target),
  cooldown: [8, 11],
  weight: 1.2,
  windup: 1.1,
  start(c) {
    const p = c.self.position;
    const a = angle(p, c.target.position);
    const dir = { x: Math.cos(a), y: 0, z: Math.sin(a) };
    // As far as the floor goes that way (up to 22 blocks).
    const hit = c.game.world.raycast({ x: p.x, y: p.y + 1.2, z: p.z }, dir, 22);
    const len = Math.max(6, (hit ? Math.hypot(hit.point.x - p.x, hit.point.z - p.z) : 22) - 0.5);
    c.s.mem.charge = { dir, len, from: { ...p }, hit: [] as string[], t: 0 };
    c.self.lookAt(c.target);
    c.self.animate('charge_wind', { fade: 0.25 });
    c.self.glow('#ff6a2a');
    lane(c.game, p, { x: p.x + dir.x * len, y: p.y, z: p.z + dir.z * len }, 3.6, c.s.t, '#ff6a2a');
    c.game.audio.play('colossus_snort', { at: p });
  },
  act(c) {
    c.self.glow(null);
    c.self.animate('charge', { loop: true, fade: 0.1 });
    c.self.setSpeed(c.s.enraged ? 4 : 3.4);
    c.game.audio.play('colossus_roar', { at: c.self.position, pitch: 1.3, volume: 0.9 });
  },
  during(c) {
    const ch = c.s.mem.charge as { dir: Vec3; len: number; from: Vec3; hit: string[]; t: number; last?: Vec3 };
    const { self, game } = c;
    const p = self.position;
    ch.t += c.dt;
    self.moveDirection(ch.dir.x, ch.dir.z);
    for (const f of fighters(game)) {
      if (ch.hit.includes(f.id)) continue;
      const q = f.position;
      if (Math.hypot(q.x - p.x, q.z - p.z) > 2.4 || Math.abs(q.y - p.y) > 3) continue;
      ch.hit.push(f.id);
      if (f.damage(8, { source: self, knockback: 0, cause: 'melee' })) f.impulse(ch.dir.x * 12 - ch.dir.z * 6, 7, ch.dir.z * 12 + ch.dir.x * 6);
    }
    if (Math.floor(ch.t * 8) !== Math.floor((ch.t - c.dt) * 8)) game.fx.burst({ x: p.x, y: p.y + 0.2, z: p.z }, { color: '#d8c08a', count: 8, speed: 2, size: 0.25, gravity: -0.5, life: 0.8, drag: 2 });
    const gone = Math.hypot(p.x - ch.from.x, p.z - ch.from.z);
    // Stopped dead against something (after getting going): a wall, a pillar.
    const moved = ch.last ? Math.hypot(p.x - ch.last.x, p.z - ch.last.z) : 1;
    ch.last = { ...p };
    if (ch.t > 0.35 && moved < 0.02) {
      crash(c);
      return true;
    }
    return gone >= ch.len || ch.t > 2.6;
  },
  recover: 1,
  end(c) {
    c.self.setSpeed(c.s.enraged ? 1.25 : 1);
    c.self.animate('none', { fade: 0.3 });
  },
};

/** It ran into a wall: it reels, stunned, wide open. */
function crash(c: Ctx) {
  const { self, game } = c;
  const p = self.position;
  self.setSpeed(c.s.enraged ? 1.25 : 1);
  game.fx.shake(0.5, 0.8);
  game.fx.burst({ x: p.x, y: p.y + 2.5, z: p.z }, { color: '#9a9a9a', count: 40, speed: 6, size: 0.25, gravity: 14 });
  game.fx.burst({ x: p.x, y: p.y + 4.5, z: p.z }, { color: '#fff1a8', count: 16, speed: 2, size: 0.12, gravity: -2, glow: 1.5, life: 1.5 });
  game.audio.play('colossus_crash', { at: p, volume: 1.4 });
  game.hud.pop('STUNNED!', { color: COLOR, sub: 'It ran into the wall: hit it now' });
  stagger(self, game, 3);
  c.s.vulnerable = 3;
}

/** Below a quarter of its health: a second sweep follows the first, the other way. */
const twinMove: Move = {
  ...sweepMove,
  name: 'twin',
  can: (c) => c.s.enraged && c.d < REACH - 0.5,
  cooldown: [4, 5],
  weight: 1.5,
  during(c) {
    const m = c.s.mem as { twinT?: number; twinAt?: number };
    m.twinT = (m.twinT ?? 0) + c.dt;
    if (m.twinAt === undefined) {
      // The second, aimed anew, a beat after the first.
      const p = c.self.position;
      m.twinAt = angle(p, c.target.position);
      sweep(c.game, p, REACH, m.twinAt, ARC, 0.55, '#ff6a2a');
      c.self.glow('#ff6a2a');
    }
    if (m.twinT < 0.55) return false;
    c.s.mem.sweep = m.twinAt;
    sweepMove.act(c);
    m.twinT = undefined;
    m.twinAt = undefined;
    return true;
  },
};

const colossusAI = brain({
  moves: [sweepMove, twinMove, stompMove, rainMove, ribsMove, chargeMove],
  tempo: (s) => (s.enraged ? 0.72 : 1),
  phases: [
    {
      at: 0.6,
      enter(c) {
        roar(c.game, c.self);
        announce(c.game, 'The Colossus tears open its ribcage', 'Bone thralls are climbing out', COLOR);
        c.s.cds.ribs = 0;
        c.s.cds.charge = 4;
      },
    },
    {
      at: 0.25,
      enter(c) {
        roar(c.game, c.self);
        c.s.enraged = true;
        c.self.setSpeed(1.25);
        announce(c.game, 'ENRAGED', 'The Bone Colossus burns with fury', '#ff5a2a');
      },
    },
  ],
});

/** Its roar: arms up, a blast of dust and bone that throws back whoever's close. */
function roar(game: GameContext, e: Entity) {
  const p = e.position;
  e.animate('roar', { fade: 0.2 });
  game.audio.play('colossus_roar', { at: p, volume: 1.6 });
  game.fx.shake(0.35, 1.4);
  game.fx.shockwave({ x: p.x, y: p.y + 0.1, z: p.z }, 9, COLOR);
  game.fx.burst({ x: p.x, y: p.y + 0.4, z: p.z }, { color: '#d8c08a', count: 60, speed: 7, size: 0.3, gravity: -0.3, life: 1.4, drag: 2 });
  strike(game, { source: e, at: p, r: 6, damage: 0.5, knockback: 11, lift: 4 });
}

export const colossus: BossKind = {
  id: 'colossus',
  name: 'The Bone Colossus',
  title: 'Titan of the Ossuary',
  color: COLOR,
  height: 6.6,
  bounty: 150,
  stagger: 2.4,
  escort: { skeleton: 2 },
  define: () => ({
    name: 'The Bone Colossus',
    model: Models.gltf(MODEL.colossus, { clips: { idle: 'idle', walk: 'walk' }, head: 'skull', scale: 3.5 }),
    hitbox: { width: 3.2, height: 6.4 },
    health: 760,
    speed: 2.3,
    knockbackResistance: 1,
    boss: true,
    ai: colossusAI,
    sounds: { ambient: 'colossus_groan', hurt: 'colossus_hurt' },
    bloodColor: '#e8dcc0',
  }),
  spawned(game, e) {
    // It heaves itself up out of the sand.
    const p = e.position;
    game.fx.burst({ x: p.x, y: p.y + 0.5, z: p.z }, { color: '#d8c08a', count: 90, speed: 8, size: 0.3, gravity: 4, life: 1.6, drag: 1.5 });
    game.fx.burst({ x: p.x, y: p.y + 1, z: p.z }, { color: '#efe4c8', count: 40, speed: 7, size: 0.16, gravity: 14 });
    game.audio.play('colossus_rise', { at: p, volume: 1.4 });
  },
  roar,
  throes(game, e) {
    e.animate('death', { fade: 0.25 });
    game.audio.play('colossus_death', { at: e.position, volume: 1.5 });
  },
};
