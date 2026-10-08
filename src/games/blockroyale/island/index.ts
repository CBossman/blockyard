import type { Vec3 } from '@platform';
import { Site, type LootSpot } from './kit';
import { cabins } from './pois/cabins';
import { farm } from './pois/farm';
import { fort } from './pois/fort';
import { harbor } from './pois/harbor';
import { lighthouse } from './pois/lighthouse';
import { quarry } from './pois/quarry';
import { radio } from './pois/radio';
import { ruins } from './pois/ruins';
import { village } from './pois/village';

/**
 * The island: a stretch of the natural world picked for its shape (a river across the north, a bay
 * to the south, a lake in the east, forest between), with landmarks stamped on it. Each landmark is
 * a `Site`: ground flattened for it and a blueprint over the ground, drawn in code (`pois/`).
 *
 * Every screen and the server build the same island from the same seed and the same code.
 */

/** Which stretch of the natural world: found by looking at the heights and coasts of many seeds (`tools/`). */
export const SEED = 5;

/** The middle of the island, and how far its safe ground reaches: the storm's first circle. */
export const CENTER = { x: 312, z: 632 };
export const RADIUS = 150;

/** The landmarks. */
export const SITES: Site[] = [village(), fort(), harbor(), farm(), radio(), ruins(), quarry(), cabins(), lighthouse()];

export const STRUCTURES = SITES.map((s) => s.bp);
export const TERRAFORMS = SITES.map((s) => s.terraform);

/** Every chest and every heap of loot lying about, in the world's own coordinates. */
export const LOOT: LootSpot[] = SITES.flatMap((s) => s.loot);

/** Where a landmark's middle stands (the ground there), for bots, the map and the minimap. */
export const middleOf = (s: Site): Vec3 => ({ x: s.cx + 0.5, y: s.ground + 1, z: s.cz + 0.5 });
