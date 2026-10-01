import { Models, type Behavior, type CharacterLook, type ProjectileSpec } from '@platform';
import { Sprite } from '../art';
import { map } from '../run/state';
import { spawnMonster } from '../run/spawn';
import type { BossKind } from './registry';

const WARDEN: CharacterLook = { build: 'heavy', skin: '#5a4a7a', hair: 'long', hairColor: '#241a33', facialHair: 'goatee', face: 'glow', eyes: '#c79bff', top: 'tunic', topColor: '#3a1f5c', accent: '#e0b83a', bottom: 'trousers', bottomColor: '#1e1a24', shoes: 'boots', shoeColor: '#1a1414', hat: 'crown' };
const FIREBALL: ProjectileSpec = { sprite: Sprite.soul_fireball, speed: 17, gravity: 1.5, damage: 5, knockback: 1.1, glow: '#5fe8ff' };

export const warden: BossKind = {
  id: 'warden',
  name: 'The Warden',
  title: 'Keeper of the Pit',
  color: '#c9a2ff',
  escort: { zombie: 2 },
  define: () => ({
    name: 'The Warden',
    model: Models.character(WARDEN, { scale: 1.95 }),
    hitbox: { width: 1.7, height: 4.2 },
    health: 340,
    speed: 2.6,
    knockbackResistance: 0.9,
    boss: true,
    ai: wardenAI,
    sounds: { ambient: 'boss', hurt: 'brute', death: 'boss' },
    bloodColor: '#6a2bd9',
  }),
};

interface WardenState {
  phase?: 'chase' | 'windup' | 'slam' | 'recover';
  timer?: number;
  slamCd?: number;
  fireCd?: number;
  meleeCd?: number;
  summoned?: number;
  enraged?: boolean;
}

/** Final boss: melee swipes, telegraphed ground slams, soul fireballs, summons and an enrage phase. */
const wardenAI: Behavior = (self, game, dt) => {
  const s = self.data as WardenState;
  s.phase ??= 'chase';
  s.timer = (s.timer ?? 0) - dt;
  s.slamCd = (s.slamCd ?? 5) - dt;
  s.fireCd = (s.fireCd ?? 3) - dt;
  s.meleeCd = (s.meleeCd ?? 0) - dt;
  s.summoned ??= 0;
  const hp = self.health / self.maxHealth;
  // The Warden hunts whoever is closest.
  const target = self.nearestPlayer();
  if (!target) {
    self.stop();
    return;
  }
  const d = self.distanceTo(target);

  // Summons at 66% and 33% health.
  const thresholds = [0.66, 0.33];
  if (s.summoned < thresholds.length && hp < thresholds[s.summoned]) {
    s.summoned++;
    game.audio.play('boss', { at: self.position, volume: 1.2 });
    game.hud.banner('The Warden calls for aid!', undefined, { duration: 2, color: '#c9a2ff' });
    // Sappers among them: slay one beside the Warden and its keg goes off in its face.
    const aid = ['zombie', 'sapper', 'skeleton', 'sapper'];
    const gates = map().gates;
    aid.forEach((type, i) => {
      const g = gates[i % gates.length];
      spawnMonster(game, type, g.at, { yaw: g.yaw });
    });
  }
  if (!s.enraged && hp < 0.3) {
    s.enraged = true;
    self.setSpeed(1.45);
    game.hud.banner('ENRAGED', undefined, { duration: 1.6, color: '#ff5a5a' });
    game.audio.play('boss', { at: self.position, pitch: 1.2 });
  }
  const tempo = s.enraged ? 0.7 : 1;

  switch (s.phase) {
    case 'chase': {
      self.moveTo(target);
      self.lookAt(target);
      self.glow(s.enraged ? '#ff2a2a' : null);
      if (d < 3.4 && s.meleeCd <= 0 && self.canSee(target)) {
        // Heavy swipe.
        s.meleeCd = 1.4 * tempo;
        self.animate('attack');
        target.damage(7, { source: self, knockback: 1.8 });
        game.fx.shake(0.12, 0.25);
      } else if (d < 11 && s.slamCd <= 0) {
        s.phase = 'windup';
        s.timer = 0.95 * tempo;
        self.stop();
        self.animate('raise');
        self.glow('#b76bff');
        game.audio.play('brute', { at: self.position, pitch: 0.7 });
      } else if (d > 9 && s.fireCd <= 0 && self.canSee(target)) {
        s.fireCd = 3.2 * tempo;
        self.animate('cast');
        for (const spread of [0, -0.08, 0.08]) self.shoot(FIREBALL, target, { lead: true, spread: 0.02 + Math.abs(spread) });
        game.audio.play('spawn', { at: self.position, pitch: 0.6 });
        game.clock.after(0.4, () => self.alive && self.animate('none'));
      }
      break;
    }
    case 'windup': {
      self.stop();
      self.lookAt(target);
      if (s.timer <= 0) {
        // Slam: shockwave that only hits grounded players — jump to dodge.
        const p = self.position;
        self.animate('attack');
        game.fx.shockwave({ x: p.x, y: p.y, z: p.z }, 8, '#b76bff');
        game.fx.shake(0.35, 0.6);
        game.audio.play('slam', { at: p, volume: 1.3 });
        for (const pl of game.players) {
          const pp = pl.position;
          const dist = Math.hypot(pp.x - p.x, pp.z - p.z);
          if (dist < 8 && pl.onGround) pl.damage(Math.round(10 * (1 - dist / 10)), { source: self, knockback: 2.2 });
          // In the air as it lands: jumped clean over it.
          else if (dist < 8 && pl.alive) pl.achieve('slam_dodge');
        }
        s.phase = 'recover';
        s.timer = 1.1 * tempo;
        s.slamCd = game.rng.range(6.5, 9) * tempo;
        self.glow(null);
      }
      break;
    }
    case 'recover': {
      self.stop();
      if (s.timer <= 0) {
        s.phase = 'chase';
        self.animate('none');
      }
      break;
    }
  }
};
