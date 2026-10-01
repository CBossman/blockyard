import type { GameContext } from '@platform';
import type { ConsumableItem, ThrowableItem } from '@platform/items';
import { ARENA_ATLAS, paintArenaAtlas } from '../art';

/**
 * The Arena's own art: mob skins, item sprites and the held weapons' textures painted into the
 * `arena` atlas, which goes to every screen (the monsters are drawn from it, and the screens'
 * item looks name its sprites: `client/looks.ts`).
 */
export function defineArt(game: GameContext) {
  const a = paintArenaAtlas();
  game.items.atlas(ARENA_ATLAS, { width: a.width, height: a.height, pixels: a.albedo, emissive: a.emissive });
}

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
