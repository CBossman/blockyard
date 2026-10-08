import { Site, type Facing } from '../kit';

/**
 * Pinecrest: the village at the middle of the island. Two gravel roads cross at a plaza with a
 * well; houses of oak, spruce and brick line them, and the town hall with its clock tower stands at
 * the east end. The loot is in the houses (so it's a place to land and look through doors),
 * and more of it in the hall.
 */
export function village(): Site {
  const s = new Site('pinecrest', 296, 606, 69, 30);
  s.label = 'Pinecrest';

  // Roads and the plaza.
  s.box(-27, 0, -1, 27, 0, 1, 'gravel');
  s.box(-1, 0, -27, 1, 0, 27, 'gravel');
  s.disc(0, 0, 0, 6.5, (x, _y, z) => ((x + z) % 2 === 0 ? 'cobblestone' : 'stone'));

  // The well: a ring of cobblestone round water, with a little roof on posts.
  s.disc(0, 0, 0, 2.2, 'water');
  s.disc(0, 1, 0, 2.6, 'cobblestone', 1.6);
  for (const [x, z] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ])
    s.box(x, 1, z, x, 4, z, 'oak_log');
  s.box(-3, 5, -3, 3, 5, 3, 'oak_slab[type=bottom]');
  s.floorLoot(3, 1, 3, 1);
  s.floorLoot(-3, 1, -3, 1);

  // North of the east-west road: doors face south, onto it.
  const rows: [number, number, number, number, Facing, Parameters<Site['house']>[4]][] = [
    [-24, -15, 9, 7, 'south', { wall: 'oak_planks', roof: 'spruce', chests: [1] }],
    [-12, -15, 7, 7, 'south', { wall: 'birch_planks', post: 'birch_log', roof: 'birch', chests: [0] }],
    [-3, -17, 9, 9, 'south', { wall: 'bricks', post: 'stone_bricks', roof: 'brick', h: 5, floor: 'oak_planks', chests: [1, 0] }],
    // South of it: doors face north.
    [-24, 8, 7, 8, 'north', { wall: 'spruce_planks', post: 'spruce_log', roof: 'spruce', chests: [0] }],
    [-14, 8, 9, 7, 'north', { wall: 'oak_planks', roof: 'cobblestone', chests: [1] }],
    [6, 8, 8, 8, 'north', { wall: 'stone_bricks', post: 'oak_log', roof: 'stone_brick', floor: 'oak_planks', chests: [1] }],
    [-8, 20, 7, 6, 'north', { wall: 'birch_planks', post: 'birch_log', roof: 'birch', chests: [0] }],
    [4, -24, 8, 6, 'south', { wall: 'spruce_planks', post: 'spruce_log', roof: 'spruce', chests: [0] }],
  ];
  for (const [x, z, w, d, door, o] of rows) s.house(x, z, w, d, { door, ...o });

  // The town hall, east of the plaza: tall, brick, two chests of the good kind, and a clock tower.
  s.house(11, -5, 13, 9, { door: 'west', wall: 'stone_bricks', post: 'oak_log', roof: 'stone_brick', h: 5, floor: 'oak_planks', chests: [2, 2] });
  // The clock tower beside it: a hollow shaft of brick with a ladder up the inside, a doorway on the
  // south side, a roof of slabs with a hatch over the ladder, and a chest up on the roof.
  s.shell(24, 1, -4, 26, 9, -2, 'stone_bricks');
  s.clear(25, 1, -2, 25, 2, -2);
  s.ladder(25, 1, 9, -3, 'south');
  s.box(24, 10, -4, 26, 10, -2, (x, _y, z) => (x === 25 && z === -3 ? undefined : 'stone_brick_slab[type=bottom]'));
  for (const [x, z] of [
    [24, -4],
    [26, -4],
    [24, -2],
    [26, -2],
  ])
    s.set(x, 11, z, 'stone_bricks');
  s.chest(25, 11, -4, 'south', 3);
  s.set(25, 9, -4, 'lamp');

  // Market stalls and crates along the road, for cover.
  for (const x of [-10, -6, 7, 11]) {
    s.box(x, 1, 3, x + 1, 1, 3, 'crate');
    s.set(x, 2, 3, 'barrel');
  }
  return s;
}
