import { Site } from '../kit';

/**
 * Pine Hollow: log cabins round a firepit in a clearing, with a stilt watchtower. Small places
 * with one chest each, so it's a quiet start: but there's a lot of cover and nobody sees you
 * coming through the trees.
 */
export function cabins(): Site {
  const s = new Site('pinehollow', 276, 716, 67, 28);
  s.label = 'Pine Hollow';

  // The firepit: a ring of stone, a fire, and logs to sit on.
  s.disc(0, 0, 0, 3, 'gravel');
  s.disc(0, 1, 0, 2.2, 'cobblestone', 1.2);
  s.set(0, 1, 0, 'glowstone');
  for (const [x, z] of [
    [-4, 0],
    [4, 0],
    [0, -4],
    [0, 4],
  ])
    s.set(x, 1, z, 'spruce_slab[type=bottom]');

  // Cabins on every side, doors toward the fire.
  const cabin = (x: number, z: number, w: number, d: number, door: 'north' | 'south' | 'east' | 'west', chests: number[]) =>
    s.house(x, z, w, d, { door, wall: 'spruce_planks', post: 'spruce_log', roof: 'spruce', h: 4, floor: 'oak_planks', chests });
  cabin(-20, -14, 8, 7, 'south', [1]);
  cabin(-4, -20, 9, 7, 'south', [1]);
  cabin(12, -14, 8, 7, 'south', [0]);
  cabin(-21, 6, 7, 8, 'east', [0]);
  cabin(12, 7, 8, 8, 'west', [1]);
  cabin(-5, 14, 8, 7, 'north', [1]);

  // A watchtower on stilts: four legs, a ladder, a floor with a rail, a little roof and a chest.
  for (const [x, z] of [
    [18, -2],
    [22, -2],
    [18, 2],
    [22, 2],
  ])
    s.box(x, 1, z, x, 9, z, 'spruce_log');
  s.box(18, 3, -2, 22, 3, -2, 'spruce_planks').box(18, 3, 2, 22, 3, 2, 'spruce_planks');
  s.ladder(20, 1, 10, -1, 'south');
  s.box(17, 9, -3, 23, 9, 3, (x, _y, z) => (x === 20 && z === -1 ? undefined : 'oak_planks'));
  s.shell(17, 10, -3, 23, 10, 3, 'fence');
  s.box(-0 + 18, 14, -2, 22, 14, 2, 'spruce_slab[type=bottom]');
  for (const [x, z] of [
    [18, -2],
    [22, -2],
    [18, 2],
    [22, 2],
  ])
    s.box(x, 10, z, x, 13, z, 'spruce_log');
  s.chest(22, 10, 2, 'west', 2);
  s.set(20, 13, 0, 'lamp');
  // Woodpiles and a few barrels.
  for (const [x, z] of [
    [-8, -6],
    [8, 12],
    [-14, 2],
    [6, -8],
  ])
    s.box(x, 1, z, x + 2, 2, z, 'spruce_log');
  for (const [x, z] of [
    [-9, 8],
    [10, 2],
    [-2, -10],
  ])
    s.set(x, 1, z, 'barrel');
  s.floorLoot(2, 1, 6, 1).floorLoot(-8, 1, -3, 1);
  return s;
}
