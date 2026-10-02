import type { GameContext, Player } from '@platform';
import { WARES, type Ware } from '../items/catalog';

/**
 * Weapons as the run deals in them, in one place: what the mystery chest gives and of what
 * rarity, what a weapon forges into at the shop and the forging, a ware handed over, and a
 * weapon's plain self (Master of Arms). The weapons, their rarities, the forge and the armour are
 * the armory's (`items/`): until it has a word on them, a weapon here is plain (common, not
 * forged), the chest picks among the catalog's weapons, and a ware is simply given.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY: Record<Rarity, { name: string; color: string }> = {
  common: { name: 'Common', color: '#c9ced6' },
  rare: { name: 'Rare', color: '#4aa8ff' },
  epic: { name: 'Epic', color: '#b46bff' },
  legendary: { name: 'Legendary', color: '#ffb12e' },
};

/** The chest's odds of each rarity on wave `n` (better as the run goes on). */
function rarityWeights(n: number): [Rarity, number][] {
  const late = Math.min(1, Math.max(0, (n - 1) / 19));
  return [
    ['common', 50 - 20 * late],
    ['rare', 32 + 4 * late],
    ['epic', 14 + 10 * late],
    ['legendary', 4 + 6 * late],
  ];
}

/** A weapon's rarity (plain: common). */
export const rarityOf = (_item: string): Rarity => 'common';

/** A weapon of `base` in `rarity`, as an item the game has (plain until the armory has rarities). */
const variant = (base: string, _rarity: Rarity): string => base;

/** A weapon's plain self (a rare iron sword: the iron sword). */
export const baseOf = (item: string): string => item;

/** What a weapon forges into at the shop, and for how much: null when it can't be. */
export const forgeNext = (_item: string): { item: string; price: number } | null => null;

/** Forge one of theirs, paid for already: `item` taken, the next rarity given in its place. Whether it was. */
export function forgeWeapon(_game: GameContext, p: Player, item: string): boolean {
  const next = forgeNext(item);
  if (!next || !p.inventory.take(item, 1)) return false;
  p.inventory.give(next.item);
  return true;
}

/** Hand over a ware, paid for already: false if it couldn't be (no room), and then the gold isn't taken. */
export function deliver(_game: GameContext, p: Player, w: Ware): boolean {
  const count = w.count ?? 1;
  return p.inventory.give(w.item, count) < count;
}

/** The weapons the mystery chest may give (all the catalog's the game has), each with how likely it is. */
export function chestPool(game: GameContext): { item: string; weight: number }[] {
  return WARES.filter((w) => w.kind === 'weapon' && game.items.get(w.item)).map((w) => ({ item: w.item, weight: 1 + Math.min(3, w.price / 150) }));
}

/** A roll of the mystery chest on wave `n`: a weapon, of some rarity. */
export function rollWeapon(game: GameContext, n: number): string {
  const pool = chestPool(game);
  let r = game.rng.next() * pool.reduce((a, w) => a + w.weight, 0);
  const base = (pool.find((w) => (r -= w.weight) <= 0) ?? pool[pool.length - 1]).item;
  const weights = rarityWeights(n);
  let q = game.rng.next() * weights.reduce((a, [, w]) => a + w, 0);
  return variant(base, (weights.find(([, w]) => (q -= w) <= 0) ?? weights[0])[0]);
}
