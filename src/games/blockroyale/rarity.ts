/**
 * Loot comes in five tiers, the way every battle royale has taught people to read it: the colour of
 * the beam over a pickup says how good it is before you're close enough to read its name.
 *
 * Shared by the server (what a tier changes about a gun) and each screen (the beams and the HUD).
 */

export interface Rarity {
  id: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  name: string;
  /** The beam over a pickup, the name in the feed, the border of the slot. */
  color: string;
  /** Times a gun's damage. */
  damage: number;
  /** Times a gun's magazine (rounded). */
  magazine: number;
  /** Times a gun's reload time. */
  reload: number;
  /** Times a gun's spread (a steadier gun). */
  spread: number;
}

export const RARITIES: readonly Rarity[] = [
  { id: 'common', name: 'Common', color: '#b9bec7', damage: 1, magazine: 1, reload: 1, spread: 1 },
  { id: 'uncommon', name: 'Uncommon', color: '#5fd35f', damage: 1.07, magazine: 1, reload: 0.96, spread: 0.95 },
  { id: 'rare', name: 'Rare', color: '#4aa8ff', damage: 1.14, magazine: 1.1, reload: 0.92, spread: 0.9 },
  { id: 'epic', name: 'Epic', color: '#b86bff', damage: 1.21, magazine: 1.2, reload: 0.88, spread: 0.85 },
  { id: 'legendary', name: 'Legendary', color: '#ffb93b', damage: 1.28, magazine: 1.3, reload: 0.84, spread: 0.8 },
];

/** A tier's index, clamped into the table. */
export const tierOf = (n: number) => Math.max(0, Math.min(RARITIES.length - 1, Math.round(n)));
