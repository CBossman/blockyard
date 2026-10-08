import type { GunItem } from '@platform/items';
import { RARITIES, type Rarity } from './rarity';

/**
 * The arsenal: five families of gun, each in five rarities (`rarity.ts`), so a Rare Zipper is a
 * better Zipper and the colour of its beam tells you so from across a field.
 *
 * Numbers are tuned for 100 health under up to 100 shield, so a fight is a few seconds: the Plinker
 * and Zipper win up close, the Trailblazer is the all-rounder, the Boomstick ends a fight in a
 * corridor, the Longshot ends it from a hill (a head shot with a Rare or better takes full health).
 *
 * This is what they do. How they look and sound (their models, icons, first-person holds, tracers
 * and voices) is each screen's: `client/looks.ts`.
 */

/** How a bot fights with a gun (the shooter-bot kit's `BotWeapon`, which only server code may import): the range it likes, down the sights or not, rushing in. */
export interface BotStyle {
  range?: number;
  ads?: boolean | number;
  steady?: boolean;
  rush?: boolean;
}

export type FamilyId = 'plinker' | 'zipper' | 'trailblazer' | 'boomstick' | 'longshot';

export interface Family {
  id: FamilyId;
  name: string;
  /** One line for the pickup toast and the docs. */
  blurb: string;
  /** What a Common one does. */
  gun: GunItem;
  /** How a bot fights with it. */
  bot: BotStyle;
  /** How much a pickup of it is worth against the others, for picking what to drop (higher is kept). */
  worth: number;
}

export const FAMILIES: Record<FamilyId, Family> = {
  plinker: {
    id: 'plinker',
    name: 'Plinker',
    blurb: 'A snappy sidearm. Quick to draw, quick to empty.',
    gun: {
      kind: 'gun',
      name: 'Plinker',
      rpm: 420,
      damage: [24, 16],
      falloff: [16, 40],
      headshot: 1.7,
      magazine: 12,
      reserve: 48,
      reload: 1.4,
      spread: { hip: 1.6, aim: 0.1, move: 1.1, air: 2.4, bloom: 0.5 },
      recoil: { up: 1.3, side: 0.4, recover: 0.75 },
      aim: { zoom: 1.25, time: 0.14, move: 0.8, sight: 'iron' },
      mobility: 1.04,
    },
    bot: { range: 10 },
    worth: 1,
  },
  zipper: {
    id: 'zipper',
    name: 'Zipper',
    blurb: 'A submachine gun that eats a magazine in two seconds.',
    gun: {
      kind: 'gun',
      name: 'Zipper',
      auto: true,
      rpm: 840,
      damage: [14, 9],
      falloff: [10, 28],
      headshot: 1.4,
      magazine: 30,
      reserve: 120,
      reload: 1.8,
      spread: { hip: 2.8, aim: 0.6, move: 1.0, air: 2.6, bloom: 0.16 },
      recoil: { up: 0.55, side: 0.5, recover: 0.8 },
      aim: { zoom: 1.2, time: 0.15, move: 0.8, sight: 'iron' },
      mobility: 1.06,
    },
    bot: { range: 8, rush: true },
    worth: 2,
  },
  trailblazer: {
    id: 'trailblazer',
    name: 'Trailblazer',
    blurb: 'An assault rifle: good at every range that matters.',
    gun: {
      kind: 'gun',
      name: 'Trailblazer',
      auto: true,
      rpm: 560,
      damage: [26, 20],
      falloff: [26, 70],
      headshot: 1.5,
      magazine: 30,
      reserve: 120,
      reload: 2.2,
      spread: { hip: 2.4, aim: 0.12, move: 1.3, air: 3, bloom: 0.2 },
      recoil: { up: 0.8, side: 0.35, recover: 0.7 },
      aim: { zoom: 1.4, time: 0.22, move: 0.62, sight: 'iron' },
      mobility: 0.97,
    },
    bot: { range: 16 },
    worth: 4,
  },
  boomstick: {
    id: 'boomstick',
    name: 'Boomstick',
    blurb: 'A pump shotgun. Get close, then get out.',
    gun: {
      kind: 'gun',
      name: 'Boomstick',
      rpm: 66,
      pellets: 8,
      damage: [14, 3],
      falloff: [7, 20],
      headshot: 1.25,
      magazine: 5,
      reserve: 25,
      reload: 0.55,
      shells: true,
      range: 40,
      spread: { hip: 5, aim: 3.8, move: 0.8, air: 1, bloom: 0 },
      recoil: { up: 3.5, side: 1, recover: 0.8 },
      aim: { zoom: 1.1, time: 0.18, move: 0.75, sight: 'iron' },
      action: 'pump',
    },
    bot: { range: 4, ads: false, rush: true },
    worth: 3,
  },
  longshot: {
    id: 'longshot',
    name: 'Longshot',
    blurb: 'A bolt-action sniper rifle with a scope. One shot, one problem solved.',
    gun: {
      kind: 'gun',
      name: 'Longshot',
      rpm: 38,
      damage: [95, 80],
      falloff: [60, 140],
      headshot: 2,
      magazine: 5,
      reserve: 20,
      reload: 2.8,
      range: 300,
      spread: { hip: 8, aim: 0, move: 5, air: 9, bloom: 0 },
      recoil: { up: 4.5, side: 1, recover: 0.6 },
      aim: { zoom: 4, time: 0.35, move: 0.45, sight: 'scope' },
      action: 'bolt',
      mobility: 0.9,
    },
    bot: { range: 34, ads: true, steady: true },
    worth: 5,
  },
};

export const FAMILY_IDS = Object.keys(FAMILIES) as FamilyId[];

/** A gun's item id: `zipper_rare`. */
export const gunId = (family: FamilyId, tier: number) => `${family}_${RARITIES[tier].id}`;

/** What a gun's id says: its family and tier, or null for anything else. */
export function parseGun(id: string): { family: FamilyId; tier: number } | null {
  const cut = id.lastIndexOf('_');
  if (cut < 0) return null;
  const family = id.slice(0, cut) as FamilyId;
  const tier = RARITIES.findIndex((r) => r.id === id.slice(cut + 1));
  return family in FAMILIES && tier >= 0 ? { family, tier } : null;
}

/** A family's gun at a tier: the Common numbers, scaled by what the tier gives. */
export function gunAt(family: Family, tier: number): GunItem {
  const r: Rarity = RARITIES[tier];
  const g = family.gun;
  const damage = typeof g.damage === 'number' ? Math.round(g.damage * r.damage * 10) / 10 : (g.damage.map((d) => Math.round(d * r.damage * 10) / 10) as [number, number]);
  const spread = g.spread && Object.fromEntries(Object.entries(g.spread).map(([k, v]) => [k, k === 'bloom' ? v : Math.round(v * r.spread * 100) / 100]));
  return {
    ...g,
    name: `${r.name} ${g.name}`,
    damage,
    magazine: Math.max(1, Math.round(g.magazine * r.magazine)),
    reload: Math.round(g.reload * r.reload * 100) / 100,
    spread,
    // Better guns outrank worse ones (auto-pick when you find a better one), and within a tier the family's worth decides.
    rank: tier * 10 + family.worth,
  };
}

/** Every gun, by item id. */
export const GUNS: Record<string, GunItem> = Object.fromEntries(FAMILY_IDS.flatMap((f) => RARITIES.map((_, tier) => [gunId(f, tier), gunAt(FAMILIES[f], tier)])));

/** How bots fight with each gun (every tier of a family alike). */
export const BOT_WEAPONS: Record<string, BotStyle> = Object.fromEntries(FAMILY_IDS.flatMap((f) => RARITIES.map((_, tier) => [gunId(f, tier), FAMILIES[f].bot])));

/** Every gun id from a family at a tier or better (the tiers a bot may carry). */
export const gunsOf = (family: FamilyId) => RARITIES.map((_, tier) => gunId(family, tier));
