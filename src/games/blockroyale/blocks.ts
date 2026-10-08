import type { BlockDefinition } from '@platform';

/**
 * The game's own blocks (named in the landmarks' blueprints): loot chests that glow so they can
 * be found, and the furnishings that make a barn a barn. All painted in code: no image files.
 */

const hash = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const pick = (list: string[], x: number, y: number, s = 0) => list[Math.floor(hash(x, y, s) * list.length)];

const WOOD = ['#8f5d2e', '#85542a', '#996433'];
const DARK = '#3a2412';
const GOLD = '#f4c542';

/** A chest's wooden skin: planks with iron bands (rows counted from the top of the block's 16 x 16). */
const chestSkin = (face: 'front' | 'side' | 'top') => ({
  paint(x: number, y: number): string | null {
    const plank = pick(WOOD, x, face === 'top' ? y : Math.floor(y / 5), 3);
    const band = x < 2 || x > 13;
    if (face === 'front') {
      if (y === 9 || y === 10) return DARK;
      if (x >= 7 && x <= 8 && y >= 9 && y <= 12) return GOLD;
      if (band && y >= 6) return '#4b4f57';
      return plank;
    }
    if (face === 'side') return y === 9 ? DARK : band && y >= 6 ? '#4b4f57' : plank;
    return x === 7 || x === 8 ? '#4b4f57' : plank;
  },
});

/** Two rails and a rung every fourth row. */
const LADDER = { paint: (x: number, y: number): string | null => (x < 2 || x > 13 || y % 4 === 1 ? '#8a5a2b' : null) };

export const BLOCKS: Record<string, BlockDefinition> = {
  // The loot chest: a box with a lid, and an iron latch. It glows a little, so it can be seen across a room.
  chest: {
    label: 'Loot Chest',
    facing: true,
    boxes: [[1, 0, 2, 15, 10, 14]],
    texture: { front: chestSkin('front'), side: chestSkin('side'), top: chestSkin('top'), bottom: '#6e4723' },
    light: 5,
    glow: 0.3,
    hardness: 2,
  },
  // Opened: the lid thrown back, and dark inside.
  chest_open: {
    label: 'Opened Chest',
    facing: true,
    boxes: [
      [1, 0, 2, 15, 6, 14],
      [1, 6, 13, 15, 13, 14],
    ],
    texture: { front: chestSkin('front'), side: chestSkin('side'), top: { color: ['#1d130b', '#241810'], noise: 0.3 }, bottom: '#6e4723' },
    hardness: 2,
  },
  crate: {
    label: 'Crate',
    texture: {
      paint(x, y) {
        const edge = x < 2 || x > 13 || y < 2 || y > 13;
        const diag = Math.abs(x - y) < 2 || Math.abs(x + y - 15) < 2;
        return edge ? '#6e4723' : diag ? '#7d5228' : pick(WOOD, x, y, 5);
      },
    },
    hardness: 1,
  },
  barrel: {
    label: 'Barrel',
    texture: {
      top: { paint: (x, y) => (Math.hypot(x - 7.5, y - 7.5) > 6.5 ? '#6e4723' : pick(['#9a6a38', '#8f5d2e'], x, y, 7)) },
      bottom: '#6e4723',
      side: { paint: (x, y) => (y === 3 || y === 12 ? '#4b4f57' : x % 4 === 0 ? '#7a4d25' : pick(WOOD, x, y, 8)) },
    },
    hardness: 1,
  },
  hay: {
    label: 'Hay Bale',
    texture: {
      top: { color: ['#d9b44a', '#e6c25a', '#c9a23c'], noise: 0.4, scale: 1 },
      bottom: { color: ['#d9b44a', '#c9a23c'], noise: 0.3 },
      side: { paint: (x, y) => (y === 5 || y === 10 ? '#8f6b24' : pick(['#d9b44a', '#e6c25a', '#c9a23c'], x, y, 9)) },
    },
    hardness: 0.6,
  },
  glass_pane: { label: 'Window', texture: 'glass', shape: 'pane', transparency: 'cutout' },
  marble: { label: 'Marble', texture: { color: ['#dfe2e6', '#d2d6db', '#e8eaed'], noise: 0.3, scale: 3 } },
  // Lattice for the radio mast: steel bars with gaps, so you see (and shoot) through it.
  grate: { label: 'Steel Grate', texture: { paint: (x, y) => (x % 5 === 0 || y % 5 === 0 || Math.abs(x - y) < 1 ? '#7b8089' : null) }, transparency: 'cutout' },
  fence: { label: 'Fence', texture: 'oak_planks', shape: 'fence' },
  ladder: { label: 'Ladder', texture: LADDER, boxes: [[0, 0, 14, 16, 16, 16]], facing: true, climbable: true, transparency: 'cutout' },
  // Wheat, for the farm's fields: walked through.
  wheat: {
    label: 'Wheat',
    shape: 'cross',
    transparency: 'cutout',
    texture: { paint: (x, y) => (y > 14 - Math.floor(4 + hash(x, 0, 1) * 10) && x % 3 !== 1 ? pick(['#d9b44a', '#e6c25a', '#b98f2c'], x, y, 4) : null) },
  },
  lamp: { label: 'Lamp', texture: { color: ['#ffd27a', '#ffc061', '#ffe19a'], noise: 0.3 }, light: 14, glow: 0.85 },
};
