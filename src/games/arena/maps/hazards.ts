import type { Entity, GameContext, Player, Vec3 } from '@platform';
import { inFight, map } from '../run/state';
import { inBox, type Box, type Hazard } from './registry';
import { chill } from './traps';

/**
 * The maps' hazards: the Forge's lava burns whoever's in it (fighters and monsters alike: knock
 * them in), the Sanctum's frozen pool bites and slows. Checked a few times a second, not every
 * tick. Each time it hurts a body it throws it up and toward the nearest bank, so falling in costs
 * a burn or two, never a fighter stuck in a pit too deep to climb out of (nor a monster stalling
 * a wave in one): in it means feet in it, or afloat at its surface. (A fighter in a liquid only
 * swims, slowly, however hard they're pushed, and can't climb a bank out of lava: so the lava
 * spits them out onto the bank, with a hop.)
 */

const EVERY = 0.25;
let check = 0;
/** When each body last showed it (a burst, a hiss), by id: not every check. */
const shown = new Map<string, number>();

/** How each kind hurts, each check: fighters, monsters. */
const HURT: Record<Hazard['kind'], { player: number; monster: number; color: string; sound: string }> = {
  lava: { player: 2, monster: 4, color: '#ff7a1a', sound: 'hazard_sizzle' },
  frost: { player: 0.75, monster: 1.5, color: '#bfe8ff', sound: 'hazard_chill' },
};

/** How hard it throws a monster up out of a 2-deep pool and toward the bank (blocks a second), and the hop a fighter's spat out with. */
const THROW_UP = 11;
const THROW_OUT = 6.5;
const HOP = 5;
/** How far round it looks for a bank (blocks): far enough to reach back out of the Forge's lava cave. */
const BANK_REACH = 12;
/** A body afloat has its feet up to this far over the surface. */
const AFLOAT = 0.45;

export function startHazards() {
  check = 0;
  shown.clear();
}

/** Whether a body with its feet at `p` is in a hazard's zone: feet in it, or afloat on it. */
export function inHazard(zone: Box[], p: Vec3): boolean {
  return zone.some((b) => inBox(b, { x: p.x, y: p.y + 0.3, z: p.z }) || inBox(b, { x: p.x, y: p.y - AFLOAT, z: p.z }));
}

/** Whether a column is part of a hazard, at any height. */
const hazardColumn = (zone: Box[], x: number, z: number) => zone.some((b) => x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z);

/**
 * The nearest bank to `p` out of a hazard: the middle of the nearest column off it with floor a
 * body stands on, near the height of the pool's own bottom (not a ledge up a lavafall a body's
 * swum up). Null if there's none near.
 */
export function bankFrom(game: GameContext, zone: Box[], p: Vec3): Vec3 | null {
  const bx = Math.floor(p.x);
  const bz = Math.floor(p.z);
  // The bottom of the hazard under the body (else where its feet are).
  let y0 = Math.floor(p.y);
  for (const b of zone) if (bx >= b.min.x && bx <= b.max.x && bz >= b.min.z && bz <= b.max.z && b.min.y <= p.y + 0.5) y0 = Math.min(y0, b.min.y);
  let best: Vec3 | null = null;
  let bestD = Infinity;
  for (let r = 1; r <= BANK_REACH && !best; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = bx + dx;
        const z = bz + dz;
        if (hazardColumn(zone, x, z)) continue;
        for (let y = y0 - 1; y <= y0 + 3; y++) {
          const at = { x: x + 0.5, y, z: z + 0.5 };
          if (!game.world.fits(at) || game.world.fits({ x: at.x, y: y - 1, z: at.z })) continue;
          const d = Math.hypot(dx, dz) + Math.abs(y - p.y) * 0.5;
          if (d < bestD) {
            bestD = d;
            best = at;
          }
          break;
        }
      }
  return best;
}

/** Throw a monster up out of a hazard and toward its nearest bank. */
function throwOut(game: GameContext, zone: Box[], e: Entity) {
  const p = e.position;
  const bank = bankFrom(game, zone, p);
  if (!bank) return e.impulse(0, THROW_UP, 0);
  const dx = bank.x - p.x;
  const dz = bank.z - p.z;
  const l = Math.hypot(dx, dz) || 1;
  e.impulse((dx / l) * THROW_OUT, THROW_UP, (dz / l) * THROW_OUT);
}

/** Spit a fighter out onto the middle of the nearest bank, with a hop straight up (a bank may be a strip between two pools: they land where they're put). */
function spitOut(game: GameContext, zone: Box[], p: Player) {
  const bank = bankFrom(game, zone, p.position);
  if (!bank) return;
  p.teleport({ x: bank.x, y: bank.y + 0.05, z: bank.z });
  p.impulse(0, HOP, 0);
}

export function updateHazards(game: GameContext, dt: number) {
  const hazards = map().hazards;
  if (!hazards?.length || !inFight()) return;
  check -= dt;
  if (check > 0) return;
  check = EVERY;
  const t = game.clock.now;
  const show = (key: string, at: Vec3, h: Hazard) => {
    if ((shown.get(key) ?? 0) > t) return;
    shown.set(key, t + 0.6);
    game.fx.burst({ x: at.x, y: at.y + 0.5, z: at.z }, { color: HURT[h.kind].color, count: 10, speed: 2, gravity: h.kind === 'lava' ? -4 : 2, glow: h.kind === 'lava' ? 1 : 0.3, size: 0.12 });
    game.audio.play(HURT[h.kind].sound, { at, volume: 0.7 });
  };
  for (const h of hazards) {
    for (const p of game.players) {
      if (!p.alive || p.spectating || !inHazard(h.zone, p.position)) continue;
      p.damage(HURT[h.kind].player, { source: 'world', cause: h.kind === 'lava' ? 'fire' : 'frost', knockback: 0 });
      if (p.alive) spitOut(game, h.zone, p);
      show(p.id, p.position, h);
    }
    for (const e of game.entities.all()) {
      if (!e.alive || !inHazard(h.zone, e.position)) continue;
      e.damage(HURT[h.kind].monster, { source: 'world', cause: h.kind === 'lava' ? 'fire' : 'frost', knockback: 0 });
      if (h.kind === 'frost') chill(game, e);
      if (e.alive) throwOut(game, h.zone, e);
      show(`e${e.id}`, e.position, h);
    }
  }
}
