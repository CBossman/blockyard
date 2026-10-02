import type { GameContext, Player } from '@platform';
import { RARE_BASES, RARITY, rarityOf, variant } from '../items/rarity';
import { rollChest } from '../items/loot';
import { forge, forgeNext } from '../items/forge';

export { baseOf, RARITY, rarityOf } from '../items/rarity';
export { describe, dropWeapon } from '../items/loot';
export { deliver, WARES, type Ware } from '../items/catalog';
export { forgeNext } from '../items/forge';

/**
 * Weapons as the run deals in them, in one place: what the mystery chest gives (the armory's
 * roll, `items/loot.ts`: rarer later in the run), the forge (a weapon to its next rarity,
 * `items/forge.ts`), wares handed over (`items/catalog.ts`), and a weapon's plain self and rarity
 * (`items/rarity.ts`). The shop and the chest ask here, never the armory's files themselves.
 */

/** Forge one of theirs, paid for already: taken up a rarity (with the anvil's sparks). Whether it was. */
export const forgeWeapon = (game: GameContext, p: Player, item: string): boolean => forgeNext(item) !== null && forge(game, p, item) !== null;

/** A roll of the mystery chest on wave `n`: a weapon, of some rarity. */
export const rollWeapon = (game: GameContext, n: number): string => rollChest(() => game.rng.next(), n);

/** What spins above the chest while it rolls: the arsenal, each of some rarity. */
export const chestSpin = (game: GameContext, n: number): string[] =>
  Array.from({ length: n }, () => variant(game.rng.pick(RARE_BASES), game.rng.pick(['common', 'common', 'rare', 'rare', 'epic', 'legendary'] as const)));

/** A weapon's rarity colour (its beam, its name). */
export const rarityColor = (item: string): string => RARITY[rarityOf(item)].color;
