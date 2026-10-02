import { CHARACTER_STYLE, Models, type Behavior, type DamageEvent, type Entity, type GameContext } from '@platform';
import { map } from '../run/state';
import { MONSTER_MODELS } from './models';
import type { MonsterKind } from './registry';
import { ahead, heading, show, turnToward, wrap } from './util';

/**
 * The Knight: a revenant in plate behind a kite shield. The shield turns aside whatever comes at it
 * from in front (blades, arrows, bolts), so it's beaten from the side or behind, from above (a
 * jumping blow), or blown open with a bomb. It turns slowly, so a fighter who circles it gets round
 * its guard; and it lowers the shield to swing, which is the moment to hit it from the front.
 */

interface KnightState {
  /** Where it faces (`heading`), turning no faster than it can. */
  _face?: number;
  _cd?: number;
  _wind?: number;
  /** Its guard is down until then (after a swing, or blown open). */
  _open?: number;
  _bash?: number;
  _told?: number;
}

/** How far either side of straight ahead the shield covers (radians). */
const COVER = 1.25;
/** Turning, a second: on guard, and closing in. */
const TURN = 1.7;
const REACH = 2.3;

/** Its guard: up (true) or down, as every screen should pose its shield arm. */
function guard(game: GameContext, self: Entity, up: boolean) {
  if ((self.data._down === true) === !up) return;
  self.data._down = !up;
  show(game, 'guard', { id: self.id, up });
}

const knightAI: Behavior = (self, game, dt) => {
  const s = self.data as KnightState;
  const now = game.clock.now;
  s._cd = Math.max(0, (s._cd ?? 1.5) - dt);
  s._bash = Math.max(0, (s._bash ?? 0) - dt);
  const target = self.nearestPlayer();
  const e = self.position;
  s._face ??= heading(e, map().center);
  if (!target) {
    self.stop();
    return;
  }
  const p = target.position;
  const want = heading(e, p);
  const open = (s._open ?? 0) > now;
  guard(game, self, !open);
  // Winding up a swing (the shield still up): the sword raised and glinting, its feet planted,
  // still turning to follow.
  if (s._wind !== undefined) {
    self.stop();
    s._face = turnToward(s._face, want, TURN * 0.6 * dt);
    self.lookAt(ahead(e, s._face, 4, 1.5));
    s._wind -= dt;
    if (s._wind > 0) return;
    s._wind = undefined;
    self.glow(null);
    self.animate('attack');
    game.audio.play('knight_swing', { at: e });
    const d = self.distanceTo(target);
    if (d <= REACH + 0.7 && Math.abs(wrap(want - s._face)) < 1.1 && self.canSee(target)) target.damage(5, { source: self, knockback: 1.3, cause: 'melee' });
    // The shield comes back up a moment later: its opening.
    s._open = now + 0.9;
    s._cd = 1.9;
    return;
  }
  s._face = turnToward(s._face, want, TURN * dt);
  self.lookAt(ahead(e, s._face, 4, 1.5));
  const d = self.distanceTo(target);
  const facing = Math.abs(wrap(want - s._face)) < 0.5;
  // Hugged: a shove with the shield, the fighter thrown back.
  if (d < 1.5 && s._bash === 0 && facing && !open) {
    s._bash = 3.5;
    self.animate('attack');
    game.audio.play('shield_block', { at: e, pitch: 0.7 });
    const l = Math.hypot(p.x - e.x, p.z - e.z) || 1;
    target.damage(1.5, { source: self, knockback: 0, cause: 'melee' });
    target.impulse(((p.x - e.x) / l) * 10, 4, ((p.z - e.z) / l) * 10);
    return;
  }
  if (d > REACH - 0.4) self.moveTo(target);
  else self.stop();
  if (d <= REACH && s._cd === 0 && facing && self.canSee(target)) {
    s._wind = 0.6;
    self.stop();
    self.animate('raise');
    self.glow('#ffd27a');
    game.audio.play('knight_raise', { at: e });
  }
};

/**
 * A blow at a Knight (the `damage` event): turned aside by its shield when it comes from in front,
 * with its guard up, and isn't a blast or fire; a bomb knocks its guard open for a moment.
 */
export function knightGuard(game: GameContext, hit: DamageEvent) {
  const self = hit.target;
  if (self.kind !== 'entity' || self.type !== 'knight' || !self.alive) return;
  const s = self.data as KnightState;
  const now = game.clock.now;
  if (hit.cause === 'explosion') {
    s._open = Math.max(s._open ?? 0, now + 1.6);
    return;
  }
  if (hit.cause !== 'melee' && hit.cause !== 'projectile' && hit.cause !== 'gun') return;
  if ((s._open ?? 0) > now) return;
  const src = hit.source && hit.source !== 'world' ? hit.source : null;
  const from = hit.from ?? src?.position;
  if (!from) return;
  const e = self.position;
  // From above: a fighter come down on it out of a jump.
  if (src?.kind === 'player' && src.position.y > e.y + 0.9) return;
  if (Math.abs(wrap(heading(e, from) - (s._face ?? 0))) > COVER) return;
  hit.cancel();
  const at = ahead(e, s._face ?? 0, 0.6, 1.3);
  game.fx.burst(at, { color: '#ffe6a0', count: 12, speed: 4.5, size: 0.07, gravity: 9, glow: 1, life: 0.35 });
  game.audio.play('shield_block', { at, pitch: 0.9 + game.rng.next() * 0.2 });
  if (src?.kind === 'player') {
    if (hit.cause === 'melee') {
      const l = Math.hypot(from.x - e.x, from.z - e.z) || 1;
      src.impulse(((from.x - e.x) / l) * 4, 1.5, ((from.z - e.z) / l) * 4);
    }
    // Told how to beat it, now and then.
    if (now - (s._told ?? -9) > 2.5) {
      s._told = now;
      src.hud.pop('Blocked!', { color: '#d8dee6', sub: 'Strike from the side, behind or above, or bomb it' });
    }
  }
}

const LOOK = Models.gltf(MONSTER_MODELS.knight, { rig: 'humanoid', ...CHARACTER_STYLE });

export const knight: MonsterKind = {
  id: 'knight',
  cost: 3,
  from: 6,
  weight: 0.8,
  max: 4,
  role: 'melee',
  define: () => ({
    name: 'Knight',
    model: LOOK,
    hitbox: { width: 0.75, height: 1.95 },
    health: 34,
    speed: 2.7,
    knockbackResistance: 0.55,
    ai: knightAI,
    drops: [
      { item: 'heart', chance: 0.25 },
      { item: 'health_potion', chance: 0.12 },
    ],
    sounds: { ambient: 'knight', hurt: 'knight_hurt' },
    bloodColor: '#9aa2ac',
  }),
  spawned(_game, e) {
    // Facing into the pit, the way it came in.
    e.data._face = heading(e.position, map().center);
  },
};
