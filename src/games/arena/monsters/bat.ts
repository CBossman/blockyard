import { Models, type Behavior, type Entity, type GameContext, type Vec3 } from '@platform';
import { map } from '../run/state';
import { spawnMonster } from '../run/spawn';
import { MONSTER_MODELS } from './models';
import type { MonsterKind } from './registry';
import { held } from './util';

/**
 * Bats come in flocks of four, circling over your head out of reach of a blade. One at a time
 * (two at most) a bat shrieks, its eyes flaring, and dives at your face to bite, then climbs
 * away: that's when to swing. Arrows find them anywhere.
 */

interface BatState {
  _mode?: 'circle' | 'shriek' | 'dive' | 'climb';
  _t?: number;
  _cd?: number;
  _ang?: number;
  _dir?: number;
}

const HOVER = 3.2;
const ORBIT = 5;
/** Bats diving at once: one, and another with more fighters. */
const divers = (game: GameContext) => game.entities.all('bat').filter((b) => (b.data as BatState)._mode === 'shriek' || (b.data as BatState)._mode === 'dive').length;

/** Fly toward a point: full speed when far, easing in. */
function flyTo(self: Entity, to: Vec3, ease = 2) {
  const e = self.position;
  const dx = to.x - e.x, dy = to.y - e.y, dz = to.z - e.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  const k = Math.min(1, l / ease);
  self.fly((dx / l) * k, (dy / l) * k, (dz / l) * k);
}

const batAI: Behavior = (self, game, dt) => {
  const s = self.data as BatState;
  // Frozen or dazed it drops out of the air (and a blade can reach it).
  if (
    held(self, () => {
      const had = s._mode === 'shriek';
      if (s._mode === 'shriek' || s._mode === 'dive') self.setSpeed((self.data.speed as number | undefined) ?? 1);
      s._mode = 'circle';
      s._cd = 2;
      return had;
    })
  )
    return;
  s._cd = (s._cd ?? game.rng.range(2, 5)) - dt;
  s._ang ??= game.rng.range(0, Math.PI * 2);
  s._dir ??= game.rng.chance(0.5) ? 1 : -1;
  const target = self.nearestPlayer();
  const e = self.position;
  if (!target) {
    flyTo(self, { x: e.x, y: map().center.y + 6, z: e.z });
    return;
  }
  const p = target.position;
  const eye = target.eye;
  if (s._mode === 'shriek') {
    // Hanging in the air, eyes flaring: then down.
    flyTo(self, e, 1);
    self.lookAt(target);
    s._t! -= dt;
    if (s._t! > 0) return;
    s._mode = 'dive';
    s._t = 1.4;
    self.glow(null);
    self.setSpeed(1.9);
    return;
  }
  if (s._mode === 'dive') {
    flyTo(self, { x: eye.x, y: eye.y - 0.3, z: eye.z }, 0.1);
    s._t! -= dt;
    if (self.distanceTo(eye) < 1.1) {
      self.animate('attack');
      target.damage(1.5, { source: self, knockback: 0.3, cause: 'melee' });
      game.audio.play('bat', { at: e, pitch: 1.4 });
      s._t = 0;
    }
    if (s._t! <= 0) {
      s._mode = 'climb';
      s._t = 0.9;
      self.setSpeed(1.3);
    }
    return;
  }
  if (s._mode === 'climb') {
    const l = Math.hypot(e.x - p.x, e.z - p.z) || 1;
    flyTo(self, { x: e.x + ((e.x - p.x) / l) * 3, y: p.y + HOVER + 1.5, z: e.z + ((e.z - p.z) / l) * 3 });
    s._t! -= dt;
    if (s._t! <= 0) {
      s._mode = 'circle';
      s._cd = game.rng.range(3, 5.5);
      self.setSpeed(1);
    }
    return;
  }
  // Circling over their head (out of the gates first, if it can't see them yet).
  s._mode = 'circle';
  if (!self.canSee(target)) {
    const c = map().center;
    flyTo(self, { x: c.x, y: Math.max(c.y, p.y) + HOVER + 1, z: c.z });
    return;
  }
  s._ang += dt * 0.9 * s._dir;
  const bob = Math.sin(self.age * 2.3 + self.id) * 0.5;
  flyTo(self, { x: p.x + Math.cos(s._ang) * ORBIT, y: p.y + HOVER + bob, z: p.z + Math.sin(s._ang) * ORBIT });
  self.lookAt(target);
  if (s._cd <= 0 && divers(game) < 1 + Math.min(1, game.players.length - 1)) {
    s._mode = 'shriek';
    s._t = 0.4;
    self.glow('#ff3030');
    game.audio.play('bat_shriek', { at: e });
  }
};

export const bat: MonsterKind = {
  id: 'bat',
  cost: 2,
  from: 6,
  weight: 0.7,
  max: 3,
  role: 'swarm',
  tip: 'They circle out of reach and dive to bite: swing as they come, or shoot them down',
  color: '#c06a8a',
  define: () => ({
    name: 'Bat',
    model: Models.gltf(MONSTER_MODELS.bat, { clips: { idle: 'idle', walk: 'walk', attack: 'attack' }, head: 'head' }),
    hitbox: { width: 0.6, height: 0.6 },
    health: 5,
    speed: 6,
    ai: batAI,
    drops: [{ item: 'arrow_bundle', chance: 0.08 }],
    sounds: { ambient: 'bat', hurt: 'bat', death: 'bat_death' },
    bloodColor: '#6a2a3a',
  }),
  // One comes in with three more beside it.
  spawned(game, e) {
    if (e.data.flock) return;
    const q = e.position;
    for (let n = 0; n < 3; n++) {
      let at = { x: q.x + game.rng.range(-1, 1), y: q.y + 0.3 + n * 0.4, z: q.z + game.rng.range(-1, 1) };
      if (!game.world.fits(at)) at = { x: q.x, y: q.y + 0.3, z: q.z };
      spawnMonster(game, 'bat', at, { data: { flock: true } });
    }
  },
};
