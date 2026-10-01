/**
 * What can be bought (the shop, `run/`), and what it costs: the armory's to say (it owns the
 * items), the run's to sell. `from`: the first wave after which it's on sale.
 */
export interface Ware {
  item: string;
  /** Gold. */
  price: number;
  kind: 'weapon' | 'armor' | 'consumable' | 'ammo' | 'upgrade';
  /** How many come for the price (arrows, bombs). */
  count?: number;
  /** On sale once this many waves are cleared (default 0: from the start). */
  from?: number;
}

export const WARES: Ware[] = [
  { item: 'health_potion', price: 40, kind: 'consumable' },
  { item: 'bomb', price: 30, kind: 'consumable', count: 2 },
  { item: 'arrow', price: 15, kind: 'ammo', count: 12 },
  { item: 'bow', price: 60, kind: 'weapon' },
  { item: 'stone_sword', price: 50, kind: 'weapon' },
  { item: 'iron_sword', price: 120, kind: 'weapon', from: 2 },
  { item: 'pike', price: 150, kind: 'weapon', from: 3 },
  { item: 'battle_axe', price: 220, kind: 'weapon', from: 4 },
  { item: 'diamond_sword', price: 400, kind: 'weapon', from: 6 },
];
