import { Behaviors, Models, type Behavior, type CharacterLook, type Entity, type GameContext, type ProjectileSpec } from '@platform';
import type { ConsumableItem, ThrowableItem } from '@platform/items';
import { archer, goblinAI, necromancerAI, sapperAI } from './ai';
import { FLOOR, GATES, GATE_SPAWN_RADIUS } from './structure';
import { ARENA_ATLAS, Skin, Sprite, paintArenaAtlas } from './art';

/**
 * The Arena's own art: mob skins, item sprites and the held weapons' textures painted into the
 * `arena` atlas, which goes to every screen (the monsters are drawn from it, and the screens'
 * item looks name its sprites: `client/looks.ts`).
 */
export function defineArt(game: GameContext) {
  const a = paintArenaAtlas();
  game.items.atlas(ARENA_ATLAS, { width: a.width, height: a.height, pixels: a.albedo, emissive: a.emissive });
}

/**
 * The monsters are the platform's people gone bad: the risen dead, bones, an ogre, a dark king;
 * a sapper with a powder keg, a hooded necromancer, and a little gold-mad goblin.
 */
const ZOMBIE: CharacterLook = { build: 'broad', skin: '#7a9a5e', hair: 'short', hairColor: '#2e3322', face: 'glow', eyes: '#e4ff8a', top: 'shirt', topColor: '#50708f', bottom: 'trousers', bottomColor: '#3a3f55', shoes: 'shoes', shoeColor: '#3a2a1c', ragged: true };
const SKELETON: CharacterLook = { build: 'slim', skin: '#e8e2d0', hair: 'bald', face: 'skull', eyes: '#7fd8ff', top: 'ribs', bottom: 'shorts', bottomColor: '#4a4036', shoes: 'flats', shoeColor: '#d8d2c0', ragged: true };
const BRUTE: CharacterLook = { build: 'heavy', skin: '#8e7f6a', hair: 'mohawk', hairColor: '#2a1c14', facialHair: 'beard', face: 'glow', eyes: '#ff5a2a', top: 'tank', topColor: '#5a3a24', bottom: 'trousers', bottomColor: '#4a3a2a', shoes: 'boots', shoeColor: '#2a1c14', ragged: true };
const WARDEN: CharacterLook = { build: 'heavy', skin: '#5a4a7a', hair: 'long', hairColor: '#241a33', facialHair: 'goatee', face: 'glow', eyes: '#c79bff', top: 'tunic', topColor: '#3a1f5c', accent: '#e0b83a', bottom: 'trousers', bottomColor: '#1e1a24', shoes: 'boots', shoeColor: '#1a1414', hat: 'crown' };
const SAPPER: CharacterLook = { build: 'broad', skin: '#9a8a5e', hair: 'mohawk', hairColor: '#e0602a', face: 'glow', eyes: '#ffb03a', top: 'apron', topColor: '#6a4424', accent: '#2a1c14', bottom: 'trousers', bottomColor: '#3a3024', shoes: 'boots', shoeColor: '#2a1c14', ragged: true };
const NECROMANCER: CharacterLook = { build: 'slim', skin: '#a9b0a8', hair: 'long', hairColor: '#101410', face: 'glow', eyes: '#5fe87f', top: 'hoodie', topColor: '#1c2a20', accent: '#5fe87f', bottom: 'trousers', bottomColor: '#141a16', shoes: 'boots', shoeColor: '#0e120f' };
const GOBLIN: CharacterLook = { build: 'slim', skin: '#78b04a', hair: 'bald', face: 'glow', eyes: '#ffe14a', top: 'apron', topColor: '#7a5230', accent: '#e8b923', bottom: 'shorts', bottomColor: '#4a3a24', shoes: 'flats', shoeColor: '#3a2a1c', hat: 'crown' };
const skin = (s: readonly [number, number]): [number, number] => [s[0], s[1]];

/** The weapons and what's picked up: what each does. (How they look is each screen's: `client/looks.ts`.) */
export function defineItems(game: GameContext) {
  const it = game.items;
  it.define('wooden_sword', { kind: 'melee', name: 'Wooden Sword', damage: 4, cooldown: 0.45, reach: 3.3, rank: 1 });
  it.define('stone_sword', { kind: 'melee', name: 'Stone Sword', damage: 5, cooldown: 0.45, reach: 3.4, rank: 2 });
  it.define('iron_sword', { kind: 'melee', name: 'Iron Sword', damage: 6.5, cooldown: 0.42, reach: 3.5, knockback: 1.1, rank: 3 });
  // Two-handed: long reach and a heavy shove, but a slower thrust.
  it.define('pike', { kind: 'melee', name: 'Pike', damage: 7.5, cooldown: 0.7, reach: 5, knockback: 2.2, rank: 3.5 });
  it.define('battle_axe', { kind: 'melee', name: 'Battle Axe', damage: 10, cooldown: 0.85, reach: 3.3, knockback: 1.8, sweep: true, rank: 4 });
  it.define('diamond_sword', { kind: 'melee', name: 'Diamond Sword', damage: 9, cooldown: 0.4, reach: 3.7, knockback: 1.2, sweep: true, rank: 5 });
  // What it shoots is drawn by the server, as an arrow (the bow's own look is each screen's).
  it.define('bow', { kind: 'bow', name: 'Bow', ammo: 'arrow', projectile: 'arrow', damage: [2, 9], drawTime: 0.9, speed: 42, rank: 0 });
  it.define('arrow', { kind: 'misc', name: 'Arrow', stack: 64 });
  // Thrown with G (or the attack button in hand): it bounces about for a moment, then goes off,
  // throwing monsters across the pit. It never hurts a fighter (the server's no-friendly-fire).
  it.define('bomb', {
    kind: 'throwable',
    name: 'Bomb',
    key: 'KeyG',
    fuse: 1.6,
    cook: false,
    speed: 19,
    lift: 9,
    physics: { gravity: 24, bounce: 0.35, friction: 0.5, radius: 0.18 },
    blast: { radius: 4.2, damage: [22, 6], knockback: 2.4, size: 1.6, color: '#ff9a3a' },
    cooldown: 0.5,
    stack: 8,
    rank: -1,
  } satisfies ThrowableItem);
  it.define('health_potion', {
    kind: 'consumable',
    name: 'Health Potion',
    stack: 4,
    use(g, player) {
      if (player.health >= player.maxHealth) return false;
      player.heal(10);
      g.audio.play('heal', { at: player.position });
      g.fx.burst(player.eye, { color: '#ff4f6d', count: 16, speed: 2, gravity: -3 });
      return true;
    },
  } satisfies ConsumableItem);
  it.define('heart', {
    kind: 'misc',
    name: 'Heart',
    onPickup(g, count, player) {
      player.heal(4 * count);
      g.audio.play('heal', { at: player.position, volume: 0.8 });
      return true;
    },
  });
  it.define('bomb_bundle', {
    kind: 'misc',
    name: 'Bombs',
    onPickup(g, count, player) {
      player.inventory.give('bomb', count);
      player.hud.toast(`+${count} ${count === 1 ? 'Bomb' : 'Bombs'}`);
      g.audio.play('pickup', { at: player.position });
      return true;
    },
  });
  it.define('arrow_bundle', {
    kind: 'misc',
    name: 'Arrows',
    onPickup(g, count, player) {
      player.inventory.give('arrow', 6 * count);
      player.hud.toast(`+${6 * count} Arrows`);
      g.audio.play('pickup', { at: player.position });
      return true;
    },
  });
}

const ARROW: ProjectileSpec = { sprite: 'arrow', speed: 23, gravity: 20, damage: 2, knockback: 0.3, sticky: true };
const FIREBALL: ProjectileSpec = { sprite: Sprite.soul_fireball, speed: 17, gravity: 1.5, damage: 5, knockback: 1.1, glow: '#5fe8ff' };

/** What the server does when a Treasure Goblin gets away (it's gone, with its loot). */
export function defineMonsters(game: GameContext, goblinEscaped: (self: Entity) => void) {
  const e = game.entities;
  e.define('zombie', {
    name: 'Zombie',
    model: Models.character(ZOMBIE),
    hitbox: { width: 0.6, height: 1.95 },
    health: 20,
    speed: 3.2,
    ai: Behaviors.melee({ damage: 3, reach: 1.9, cooldown: 1.1, windup: 0.25 }),
    drops: [{ item: 'heart', chance: 0.18 }],
    sounds: { ambient: 'zombie' },
    bloodColor: '#6b8f3a',
  });
  e.define('skeleton', {
    name: 'Skeleton',
    model: Models.character(SKELETON),
    hitbox: { width: 0.6, height: 1.95 },
    health: 16,
    speed: 3.2,
    held: 'bow',
    // A slow, glowing draw you can see and hear, a wide spread, and they take turns (`archer`).
    ai: archer({ projectile: ARROW, range: 20, preferred: 9, cooldown: 3, draw: 1, spread: 0.075, lead: 0.15 }),
    drops: [
      { item: 'arrow_bundle', chance: 0.6 },
      { item: 'heart', chance: 0.08 },
    ],
    sounds: { ambient: 'skeleton', hurt: 'skeleton' },
    bloodColor: '#e8e2d0',
  });
  e.define('spider', {
    name: 'Spider',
    model: Models.spider({ skin: skin(Skin.spider), atlas: ARENA_ATLAS }),
    hitbox: { width: 1.3, height: 0.9 },
    health: 14,
    speed: 5.2,
    jump: 9,
    ai: Behaviors.leaper({ damage: 2.5, range: [2.5, 7.5], cooldown: 2.2, speed: 10, height: 6 }),
    drops: [{ item: 'heart', chance: 0.12 }],
    sounds: { ambient: 'spider', hurt: 'spider' },
    bloodColor: '#3d6b2a',
  });
  e.define('sapper', {
    name: 'Sapper',
    model: Models.character(SAPPER),
    hitbox: { width: 0.6, height: 1.95 },
    health: 12,
    speed: 3.9,
    ai: sapperAI,
    drops: [
      { item: 'bomb_bundle', chance: 0.35 },
      { item: 'heart', chance: 0.1 },
    ],
    sounds: { ambient: 'sapper', hurt: 'sapper' },
    bloodColor: '#8a7a4e',
  });
  e.define('necromancer', {
    name: 'Necromancer',
    model: Models.character(NECROMANCER),
    hitbox: { width: 0.6, height: 1.95 },
    health: 18,
    speed: 3.3,
    ai: necromancerAI,
    drops: [
      { item: 'health_potion', chance: 0.5 },
      { item: 'bomb_bundle', chance: 0.4 },
    ],
    sounds: { ambient: 'necro', hurt: 'skeleton' },
    bloodColor: '#3a5a3e',
  });
  e.define('goblin', {
    name: 'Treasure Goblin',
    model: Models.character(GOBLIN, { scale: 0.72 }),
    hitbox: { width: 0.5, height: 1.4 },
    health: 22,
    speed: 5.1,
    jump: 9,
    knockbackResistance: 0.5,
    ai: goblinAI((self) => goblinEscaped(self)),
    // Caught: it bursts into loot.
    drops: [
      { item: 'heart', chance: 1, count: 3 },
      { item: 'health_potion', chance: 1 },
      { item: 'bomb_bundle', chance: 1, count: 3 },
      { item: 'arrow_bundle', chance: 1, count: 2 },
    ],
    sounds: { ambient: 'goblin', hurt: 'goblin' },
    bloodColor: '#ffd23a',
  });
  e.define('brute', {
    name: 'Brute',
    model: Models.character(BRUTE, { scale: 1.2 }),
    hitbox: { width: 1.1, height: 2.55 },
    health: 70,
    speed: 2.9,
    knockbackResistance: 0.6,
    ai: Behaviors.melee({ damage: 7, reach: 2.7, cooldown: 1.7, windup: 0.55, knockback: 1.8 }),
    drops: [
      { item: 'health_potion', chance: 1 },
      { item: 'arrow_bundle', chance: 0.7, count: 2 },
    ],
    sounds: { ambient: 'brute', hurt: 'brute' },
    bloodColor: '#7a2f22',
  });
  e.define('warden', {
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
  });
}

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
    for (let i = 0; i < 4; i++) {
      const a = GATES[i];
      const type = aid[i];
      game.entities.spawn(type, { x: Math.cos(a) * GATE_SPAWN_RADIUS, y: FLOOR + 1, z: Math.sin(a) * GATE_SPAWN_RADIUS });
    }
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
