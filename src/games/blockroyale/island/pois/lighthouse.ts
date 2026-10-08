import { Site } from '../kit';

/**
 * Lighthouse Point: a tall red and white tower on the south-east shore, a ladder inside up to a
 * gallery round a glass lamp room, a keeper's cottage and a short dock. A sniper's tower: from the
 * gallery you see the whole bay, and everyone on the way to the circle sees you.
 */
export function lighthouse(): Site {
  const s = new Site('lighthouse', 406, 716, 65, 22, 40, 10);
  s.label = 'Lighthouse Point';
  s.flat = 16;
  s.blend = 10;

  // The tower: round, banded, with a floor every eight blocks and a ladder up the inside.
  const R = 3.6;
  for (let y = 1; y <= 22; y++) s.round(0, 0, y, y, R - (y > 14 ? (y - 14) * 0.06 : 0), Math.floor((y - 1) / 4) % 2 === 0 ? 'white_concrete' : 'red_concrete');
  s.disc(0, 0, 0, R, 'stone_bricks');
  s.clear(0, 1, 3, 0, 2, 3);
  for (const y of [8, 15]) s.disc(0, y, 0, R - 1, (x, _y, z) => (x === 0 && z === -2 ? undefined : 'oak_planks'));
  s.ladder(0, 1, 23, -2, 'south');
  for (const y of [4, 11, 18]) s.set(0, y, 2, 'lamp');
  // The gallery: a ring of planks round the lamp room, with a rail, and the lamp itself.
  s.disc(0, 22, 0, 5.4, 'oak_planks', R - 0.5);
  s.round(0, 0, 23, 23, 5.6, 'fence');
  for (let y = 23; y <= 26; y++) s.round(0, 0, y, y, 2.6, 'glass');
  s.set(0, 24, 0, 'sea_lantern').set(0, 25, 0, 'sea_lantern');
  s.disc(0, 27, 0, 3.4, 'red_concrete');
  s.disc(0, 28, 0, 2.2, 'red_concrete');
  s.disc(0, 29, 0, 1, 'red_concrete');
  s.set(0, 30, 0, 'lamp');
  // A doorway in the glass for the ladder to come out through.
  s.clear(0, 23, -2, 0, 24, -2);
  s.ladder(0, 23, 23, -2, 'south');
  s.chest(4, 23, 0, 'west', 3);
  s.chest(2, 1, 1, 'north', 2);

  // The keeper's cottage and a woodshed.
  s.house(6, -8, 9, 7, { door: 'west', wall: 'white_concrete', post: 'oak_log', roof: 'brick', h: 4, floor: 'oak_planks', chests: [1, 1] });
  s.house(-14, 3, 6, 6, { door: 'east', wall: 'spruce_planks', post: 'spruce_log', roof: 'spruce', h: 3, chests: [1] });
  // The dock, running out into the water to the south.
  s.box(-1, 0, 8, 1, 0, 20, 'oak_planks');
  for (let z = 9; z <= 20; z += 4) for (const x of [-1, 1]) s.box(x, -7, z, x, -1, z, 'oak_log').set(x, 1, z, 'fence');
  s.set(0, 1, 20, 'lamp');
  for (const [x, z] of [
    [-9, 8],
    [-8, 8],
    [9, 6],
  ])
    s.set(x, 1, z, 'crate');
  s.floorLoot(7, 1, 8, 2).floorLoot(0, 1, 14, 1);
  return s;
}
