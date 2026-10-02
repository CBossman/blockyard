import type { GameContext } from '@platform';
import { WARES } from '../items/catalog';

/**
 * Weapons as the run deals in them (the mystery chest's rolls, the forge at the shop, Master of
 * Arms), in one place: what the chest may give, of what rarity, and what a weapon forges into. The
 * weapons, their rarities and the forge are the armory's (`items/`): this asks it, and where it
 * has nothing to say yet a weapon is plain (common, not forged).
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY: Record<Rarity, { name: string; color: string }> = {
  common: { name: 'Common', color: '#d8d2c0' },
  rare: { name: 'Rare', color: '#4da6ff' },
  epic: { name: 'Epic', color: '#b765ff' },
  legendary: { name: 'Legendary', color: '#ffb52e' },
};

/** The chest's odds of each rarity on wave `n` (better as the run goes on). */
function rarityWeights(n: number): [Rarity, number][] {
  const late = Math.min(1, n / 20);
  return [
    ['common', 58 - 22 * late],
    ['rare', 28 + 6 * late],
    ['epic', 11 + 10 * late],
    ['legendary', 3 + 6 * late],
  ];
}

/** Weapons the chest may give besides the shop's (the armory's new ones, once they're in the game). */
const CHEST_ONLY = ['gladius', 'warhammer', 'spear', 'crossbow', 'daggers', 'greatsword', 'fire_staff', 'frost_staff', 'storm_wand'];

/** A weapon's rarity (plain: common). */
export const rarityOf = (_item: string): Rarity => 'common';

/** A weapon of `base` in `rarity`, as an item the game has (plain until the armory has rarities). */
export const variant = (base: string, _rarity: Rarity): string => base;

/** A weapon's plain self (a rare iron sword: the iron sword). */
export const baseOf = (item: string): string => item;

/** What a weapon forges into at the shop, and for how much: null when it can't be. */
export const forgeNext = (_item: string): { item: string; price: number } | null => null;

/** The weapons the mystery chest may give (all the game has), each with how likely it is. */
export function chestPool(game: GameContext): { item: string; weight: number }[] {
  const shop = WARES.filter((w) => w.kind === 'weapon').map((w) => ({ item: w.item, weight: 1 + Math.min(3, w.price / 150) }));
  const more = CHEST_ONLY.filter((id) => !shop.some((w) => w.item === id)).map((item) => ({ item, weight: 3 }));
  return [...shop, ...more].filter((w) => game.items.get(w.item));
}

/** A roll of the mystery chest on wave `n`: a weapon, and its rarity. */
export function rollWeapon(game: GameContext, n: number): { item: string; rarity: Rarity } {
  const pool = chestPool(game);
  let r = game.rng.next() * pool.reduce((a, w) => a + w.weight, 0);
  const base = (pool.find((w) => (r -= w.weight) <= 0) ?? pool[pool.length - 1]).item;
  const weights = rarityWeights(n);
  let q = game.rng.next() * weights.reduce((a, [, w]) => a + w, 0);
  const rarity = (weights.find(([, w]) => (q -= w) <= 0) ?? weights[0])[0];
  const item = variant(base, rarity);
  return { item, rarity: rarityOf(item) };
}
