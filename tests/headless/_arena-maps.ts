import type { Entity, GameContext, Player, Vec3 } from '@platform';
import { along, MAPS, type ArenaMap } from '../../src/games/arena/maps';
import { map } from '../../src/games/arena/run/state';
import { check, launch } from './_harness';

/**
 * Probe: every map is walkable. On each, zombies brought in at every gate and every boss gate
 * must find their way to a fighter standing in the middle, at the shop, at each chest and at
 * spots round the floor (each placement in turn); and the map's own places (the middle, the
 * shop, the chests) must have room for a body. The waves' own monsters are cleared as they come.
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
  for (const [name, p] of places) {
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
  return { row: `${m.name}: ${trips} trips from ${gates.length} gates to ${spots.length} spots, the slowest ${slowest.toFixed(1)} s, ${failed.length} failed`, failed };
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
