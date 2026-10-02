import type { Entity, GameContext, Player, Vec3 } from '@platform';
import { FLOOR, along, MAPS, type ArenaMap, type TrapSpec } from '../../src/games/arena/maps';
import { bus } from '../../src/games/arena/run/bus';
import { addGold, gold } from '../../src/games/arena/run/gold';
import { map } from '../../src/games/arena/run/state';
import { check, launch } from './_harness';

/**
 * Probe: every map is walkable, and its traps work. On each, zombies brought in at every gate
 * and every boss gate must find their way to a fighter standing in the middle, at the shop, at
 * each chest and at spots round the floor (each placement in turn); the map's own places (the
 * middle, the shop, the chests, the lookout) must have room for a body. Then each trap: a fighter with gold
 * walks up to its lever and presses E, pays, and zombies held where it works are hurt and slain
 * by it, the kills theirs. The waves' own monsters are cleared as they come.
 * `node scripts/headless.mjs tests/headless/_arena-maps.ts` (MAP=id for one map).
 */

/** Close enough to be fighting them. */
const REACH = 2.4;
/** How long they get to come (seconds). */
const LIMIT = 40;

export default function arenaMaps() {
  const only = process.env.MAP;
  const rows: string[] = [];
  const failed: string[] = [];
  for (const m of MAPS) {
    if (only && m.id !== only) continue;
    const r = probe(m);
    rows.push(r.row);
    failed.push(...r.failed);
    console.log(`  ${r.row}`);
  }
  check(!failed.length, `monsters that never got there:\n    ${failed.join('\n    ')}`);
  return rows.join(' · ');
}

function probe(m: ArenaMap): { row: string; failed: string[] } {
  const h = launch('arena', { seed: 3 });
  const game = h.ctx as GameContext;
  const me = game.player as Player;
  if (map() !== m) game.commands.run(`/map ${m.id}`);
  h.run(0.5, { pilot: () => ({}) });
  check(map() === m, `on ${m.id}`);
  const failed: string[] = [];

  const places: [string, Vec3][] = [['the middle', m.center], ...(m.shop ? [['the shop', m.shop] as [string, Vec3]] : []), ...(m.chests ?? []).map((c, i) => [`chest ${i + 1}`, c] as [string, Vec3])];
  for (const [name, p] of [...places, ['the lookout', m.lookout] as [string, Vec3]]) {
    if (!game.world.fits({ x: p.x, y: p.y + 0.05, z: p.z })) failed.push(`${m.id}: no room for a body at ${name} (${fmt(p)})`);
  }

  // Spots round the floor too: out toward the edge, all round.
  const round = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = m.radius * 0.6;
    return [`floor ${i + 1}`, ground(game, { x: m.center.x + Math.cos(a) * r, y: m.center.y + 4, z: m.center.z + Math.sin(a) * r })] as [string, Vec3 | null];
  });
  const spots = [...places, ...round.filter((s): s is [string, Vec3] => s[1] !== null)];
  const gates = [...m.gates.map((g, i) => [`gate ${i + 1}`, along(g, 0)] as [string, Vec3]), ...(m.bossGates ?? []).map((g, i) => [`boss gate ${i + 1}`, along(g, 0)] as [string, Vec3])];

  let slowest = 0;
  let trips = 0;
  for (const [spot, at] of spots) {
    me.teleport({ x: at.x, y: at.y + 0.05, z: at.z }, 0, 0);
    me.protect(1e6);
    const mine = gates.map(([gate, g]) => ({ gate, e: game.entities.spawn('zombie', g) as Entity, reached: -1 }));
    const ours = new Set(mine.map((x) => x.e));
    const start = game.clock.now;
    h.run(LIMIT, {
      pilot: () => {
        for (const e of game.entities.all()) if (!ours.has(e)) e.remove();
        for (const x of mine) if (x.reached < 0 && x.e.alive && x.e.distanceTo(me) < REACH) x.reached = game.clock.now - start;
        return {};
      },
      until: () => mine.every((x) => x.reached >= 0 || !x.e.alive),
    });
    for (const x of mine) {
      if (x.reached >= 0) {
        slowest = Math.max(slowest, x.reached);
        trips++;
      } else failed.push(`${m.id}: from ${x.gate} to ${spot} (${fmt(at)}): stuck at ${fmt(x.e.position)}${x.e.alive ? '' : ' (dead)'}`);
      x.e.remove();
    }
  }
  const traps = (m.traps ?? []).map((t) => trap(h, game, me, t, failed));
  return {
    row: `${m.name}: ${trips} trips from ${gates.length} gates to ${spots.length} spots, the slowest ${slowest.toFixed(1)} s; traps ${traps.join(', ')}; ${failed.length} failed`,
    failed,
  };
}

/** Where a trap does its work: spots to hold zombies at. */
function targets(game: GameContext, t: TrapSpec): Vec3[] {
  const mid = (b: TrapSpec['zone'][number]) => ({ x: (b.min.x + b.max.x + 1) / 2, y: b.max.y + 3, z: (b.min.z + b.max.z + 1) / 2 });
  const raw: Vec3[] =
    t.kind === 'jets'
      ? t.jets.map((j) => ({ x: j.at.x + j.dir.x * j.length * 0.45, y: j.at.y + 1, z: j.at.z + j.dir.z * j.length * 0.45 }))
      : t.kind === 'pendulum'
        ? t.blades.map((b) => ({ x: b.pivot.x, y: b.pivot.y - b.length + 2, z: b.pivot.z }))
        : t.kind === 'bell'
          ? [0, 1, 2].map((i) => ({ x: t.bell.x + Math.cos(i * 2.1) * t.reach * 0.6, y: FLOOR + 3, z: t.bell.z + Math.sin(i * 2.1) * t.reach * 0.6 }))
          : t.kind === 'sluice'
            ? [t.channel[Math.floor(t.channel.length / 3)], t.channel[Math.floor((t.channel.length * 2) / 3)]].map((c) => ({ x: c.x + 0.5, y: c.y + 1.5, z: c.z + 0.5 }))
            : t.zone.map(mid);
  return raw.map((p) => ground(game, p)).filter((p): p is Vec3 => p !== null);
}

/**
 * A trap, end to end: gold in hand, up to its lever, E; zombies held where it works must be hurt
 * by it (credited to whoever pulled it) and, mostly, slain. Its row: hits and kills.
 */
function trap(h: ReturnType<typeof launch>, game: GameContext, me: Player, t: TrapSpec, failed: string[]): string {
  const where = targets(game, t);
  if (!where.length) {
    failed.push(`${t.id}: nowhere to stand in it`);
    return `${t.id} ?`;
  }
  // Stand at the lever's front, looking at it.
  const front = { x: Math.sin(t.lever.face), z: Math.cos(t.lever.face) };
  const stand = ground(game, { x: t.lever.at.x + front.x * 1.3, y: t.lever.at.y + 2, z: t.lever.at.z + front.z * 1.3 }) ?? t.lever.at;
  const eye = { x: stand.x, y: stand.y + 1.62, z: stand.z };
  const aim = { x: t.lever.at.x - eye.x, y: t.lever.at.y + 0.9 - eye.y, z: t.lever.at.z - eye.z };
  const yaw = Math.atan2(-aim.x, -aim.z);
  const pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z));
  me.teleport(stand, yaw, pitch);
  me.protect(1e6);
  addGold(game, me, t.price + 50 - gold(me));
  const held = where.flatMap((p) => [0, 1].map((k) => game.entities.spawn('zombie', { x: p.x + (k ? 0.3 : -0.3), y: p.y + 0.05, z: p.z })));
  for (const e of held) e.setSpeed(0);
  const ours = new Set(held);
  let hits = 0;
  let kills = 0;
  let wrong = 0;
  const off = game.events.on('damage', (d) => {
    if (d.weapon !== 'trap' || d.target.kind !== 'entity' || !ours.has(d.target)) return;
    if (d.source === me) hits++;
    else wrong++;
  });
  bus.on('slain', ({ entity, by, weapon }) => {
    if (ours.has(entity) && weapon === 'trap' && by === me) kills++;
  });
  let pressed = false;
  h.run(t.time + 2, {
    pilot: () => {
      for (const e of game.entities.all()) if (!ours.has(e)) e.remove();
      for (const e of held) if (e.alive) e.setSpeed(0);
      if (pressed) return { yaw, pitch };
      pressed = true;
      return { yaw, pitch, pressed: ['KeyE'] };
    },
  });
  off();
  const paid = gold(me) === 50;
  for (const e of held) e.remove();
  if (!paid) failed.push(`${t.id}: the lever didn't take ${t.price} gold (left ${gold(me)})`);
  if (!hits) failed.push(`${t.id}: hurt nothing held in it (${where.map(fmt).join('; ')})`);
  if (wrong) failed.push(`${t.id}: ${wrong} hits not credited to the puller`);
  return `${t.id.split('.')[1]} ${hits}/${kills}`;
}

/** The floor under a point (feet), or null where there's none within a few blocks. */
function ground(game: GameContext, p: Vec3): Vec3 | null {
  for (let y = Math.floor(p.y); y > p.y - 10; y--) {
    const at = { x: p.x, y, z: p.z };
    if (game.world.fits(at) && !game.world.fits({ x: p.x, y: y - 1, z: p.z })) return at;
  }
  return null;
}

const fmt = (p: Vec3) => `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
