import type { Entity, GameContext, Player, Vec3 } from '@platform';
import { map } from '../run/state';

/** Ground distance between two points (heights apart don't count). */
export const flat = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

/** The heading from `a` to `b` (radians; the figures' own: 0 faces +z, a quarter turn +x). */
export const heading = (a: Vec3, b: Vec3) => Math.atan2(b.x - a.x, b.z - a.z);

/** An angle put in -π..π. */
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** `from` turned toward `to`, by at most `max`. */
export function turnToward(from: number, to: number, max: number): number {
  const d = wrap(to - from);
  return wrap(from + Math.max(-max, Math.min(max, d)));
}

/** A spot `d` along `h` from `at`. */
export const ahead = (at: Vec3, h: number, d: number, y = 0): Vec3 => ({ x: at.x + Math.sin(h) * d, y: at.y + y, z: at.z + Math.cos(h) * d });

/** Somewhere in the map's pit (not out past its rim), where a body fits. */
export function inPit(game: GameContext, at: Vec3): boolean {
  const m = map();
  return flat(at, m.center) < m.radius - 2 && game.world.fits(at);
}

/**
 * Tell every screen something the bestiary draws itself (`client/bestiary.ts`): a ring on the
 * ground filling until something lands there, an elite's aura, a tether, a patch of fire. Sent once
 * per thing, each screen animating it, so the server never streams effects.
 */
export function show(game: GameContext, what: string, data: Record<string, unknown>) {
  game.clients.send('all', `bestiary.${what}`, data);
}

/** A warning ring on the ground at `at`, `radius` across, filling for `time` seconds. */
export function ring(game: GameContext, at: Vec3, radius: number, time: number, color: string) {
  show(game, 'ring', { x: at.x, y: at.y, z: at.z, radius, time, color });
}

/** Players standing (not in the air) within `radius` of `at`. */
export function grounded(game: GameContext, at: Vec3, radius: number, rise = 1.2): Player[] {
  return game.players.filter((p) => p.alive && !p.spectating && flat(p.position, at) <= radius && p.position.y - at.y < rise && (p.onGround || p.position.y - at.y < 0.5));
}

/** The monsters (not bosses) within `radius` of `at`, but `self`. */
export function near(game: GameContext, at: Vec3, radius: number, self?: Entity): Entity[] {
  return game.entities.near(at, radius).filter((e) => e !== self && e.alive);
}
