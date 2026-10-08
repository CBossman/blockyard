import { Site } from '../kit';

/**
 * The Harbor: warehouses and a boathouse on the bay's north shore, a long pier running out into
 * the water, a crane, and stacks of crates for cover. Only the middle is flattened: the bay stays
 * where it is, and the pier stands in it on piles.
 */
export function harbor(): Site {
  const s = new Site('harbor', 326, 678, 64, 26);
  s.label = 'Harbor';
  s.flat = 15;
  s.blend = 8;

  // The quay: a plank strip along the shore, and the pier out over the water.
  s.box(-13, 0, 1, 13, 0, 3, 'oak_planks');
  s.box(-2, 0, 4, 2, 0, 25, 'oak_planks');
  for (let z = 4; z <= 25; z += 3) {
    for (const x of [-2, 2]) s.box(x, -9, z, x, -1, z, 'oak_log');
    for (const x of [-3, 3]) s.box(x, 1, z, x, 1, z, 'fence');
  }
  // The bollards and lamps along it.
  for (let z = 6; z <= 24; z += 6) {
    s.set(-2, 1, z, 'lamp');
    s.set(2, 1, z, 'lamp');
  }

  // The warehouses on the shore: big, plain, and full.
  s.house(-14, -14, 14, 9, { door: 'south', wall: 'gray_concrete', post: 'iron_block', floor: 'stone', roof: 'stone_brick', h: 5, chests: [2, 1, 1] });
  s.house(2, -15, 12, 10, { door: 'south', wall: 'light_gray_concrete', post: 'iron_block', floor: 'stone', roof: 'cobblestone', h: 5, chests: [2, 2] });
  // A boathouse on the quay, open to the water.
  s.house(-12, 5, 8, 6, { door: 'south', wall: 'spruce_planks', post: 'spruce_log', roof: 'spruce', h: 4, chests: [1] });

  // The crane: a hollow log tower with a ladder up the inside, a platform on top and a long arm out over the pier.
  s.shell(8, 1, 5, 10, 12, 7, 'oak_log');
  s.clear(9, 1, 5, 9, 2, 5);
  s.ladder(9, 1, 13, 6, 'north');
  s.box(7, 13, 4, 11, 13, 8, (x, _y, z) => (x === 9 && z === 6 ? undefined : 'oak_planks'));
  s.box(-4, 13, 6, 6, 13, 6, 'iron_block');
  s.box(-1, 9, 6, -1, 12, 6, 'fence');
  s.box(-1, 8, 6, -1, 8, 6, 'crate');
  s.chest(10, 14, 7, 'north', 3);
  // Cargo: stacks of crates, barrels and a few containers.
  for (const [x, z, h] of [
    [10, -2, 3],
    [11, -2, 2],
    [-9, 12, 2],
    [-8, 12, 1],
    [4, 8, 2],
    [-4, 9, 3],
  ])
    s.box(x, 1, z, x, h, z, 'crate');
  for (const [x, z] of [
    [5, 0],
    [6, 0],
    [-5, 0],
    [-4, 1],
    [12, 3],
  ])
    s.set(x, 1, z, 'barrel');
  s.box(6, 1, 6, 6, 3, 9, 'red_concrete');
  s.box(-8, 1, 8, -8, 3, 11, 'blue_concrete');
  s.floorLoot(0, 1, 2, 1).floorLoot(1, 1, 18, 2).floorLoot(-6, 1, 0, 1);
  return s;
}
