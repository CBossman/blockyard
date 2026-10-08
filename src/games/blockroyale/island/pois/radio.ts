import { Site } from '../kit';

/**
 * Radio Hill: a raised hilltop with a tall lattice mast, a concrete bunker dug into the side with
 * the good chests, a satellite dish and sandbags. The mast is a ladder climb to a platform with a
 * view of the whole island, and a legendary chest on it.
 */
export function radio(): Site {
  // The ground here is raised by 9 blocks: the hill.
  const s = new Site('radio', 266, 566, 80, 24);
  s.label = 'Radio Hill';
  s.blend = 16;
  s.flat = 18;

  // The mast: four legs, rings of grating, a grated face for the ladder to hang on, a platform near the top.
  const legs: [number, number][] = [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ];
  for (const [x, z] of legs) s.box(x, 1, z, x, 24, z, 'iron_block');
  for (let y = 4; y <= 24; y += 4) s.shell(-2, y, -2, 2, y, 2, 'grate');
  s.box(-2, 1, -2, 2, 22, -2, (x, y) => (Math.abs(x) === 2 || y % 4 === 0 ? 'iron_block' : 'grate'));
  s.ladder(0, 1, 23, -1, 'south');
  s.box(-3, 23, -3, 3, 23, 3, (x, _y, z) => (x === 0 && z === -1 ? undefined : 'oak_planks'));
  s.shell(-3, 24, -3, 3, 24, 3, 'fence');
  s.box(0, 24, 0, 0, 34, 0, 'iron_block');
  s.set(0, 35, 0, 'lamp');
  s.chest(2, 24, 2, 'north', 4);

  // The bunker: concrete, two rooms, half under the hill, with a flat roof and a door on the south.
  s.box(-9, -3, 6, 9, -1, 18, 'air');
  s.box(-9, 0, 6, 9, 0, 18, 'gray_concrete');
  s.shell(-9, 1, 6, 9, 4, 18, 'gray_concrete');
  s.box(-8, 5, 6, 8, 5, 18, 'stone_slab[type=bottom]');
  s.clear(-1, 1, 18, 1, 3, 18);
  s.box(-1, 1, 12, 1, 3, 12, 'air');
  s.box(0, 1, 6, 0, 3, 12, (_x, _y, z) => (z === 12 ? 'gray_concrete' : undefined));
  s.clear(0, 1, 12, 0, 3, 12);
  for (const x of [-5, 5]) s.set(x, 3, 6, 'glass_pane').set(x, 3, 18, 'glass_pane');
  s.set(0, 4, 10, 'lamp').set(0, 4, 15, 'lamp');
  s.chest(-7, 1, 8, 'east', 3);
  s.chest(7, 1, 8, 'west', 3);
  s.chest(-7, 1, 16, 'east', 2);
  // Sandbags and a crate wall in front, the dish, and a generator shed.
  for (let x = -6; x <= 6; x++) if (Math.abs(x) > 2) s.set(x, 1, 21, 'sandstone_slab[type=bottom]');
  s.set(-3, 1, 21, 'crate').set(3, 1, 21, 'crate');
  s.box(11, 1, -2, 11, 3, -2, 'iron_block');
  s.disc(11, 4, -2, 3, 'white_concrete', 1);
  s.disc(11, 5, -2, 2, 'white_concrete', 1);
  s.set(11, 4, -2, 'lamp');
  s.house(-16, -4, 6, 6, { door: 'east', wall: 'gray_concrete', post: 'iron_block', roof: 'stone_brick', h: 3, floor: 'stone', chests: [2] });
  s.floorLoot(-4, 1, 3, 3).floorLoot(8, 1, 12, 3);
  return s;
}
