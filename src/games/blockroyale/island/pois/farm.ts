import { Site } from '../kit';

/**
 * Windmill Farm: a white windmill on the rise with its sails turned toward the south (a sniper's
 * perch, reached by a ladder inside), a red barn full of hay, a farmhouse, a silo, and fenced fields
 * of wheat to cross in the open.
 */
export function farm(): Site {
  const s = new Site('windmill', 376, 591, 69, 30);
  s.label = 'Windmill Farm';

  // Fields: dirt with wheat in rows, fenced.
  const field = (x0: number, z0: number, x1: number, z1: number) => {
    s.box(x0, 0, z0, x1, 0, z1, 'podzol');
    for (let x = x0 + 1; x < x1; x += 2) s.box(x, 1, z0 + 1, x, 1, z1 - 1, 'wheat');
    s.shell(x0, 1, z0, x1, 1, z1, 'fence');
  };
  field(-26, 4, -12, 18);
  field(-10, 12, 6, 24);
  field(8, 12, 24, 24);

  // The windmill: a round white tower, a floor, a ladder up its inside to the deck, and sails.
  s.round(-12, -12, 1, 13, 4.2, 'white_concrete');
  s.disc(-12, 0, -12, 4.2, 'stone_bricks');
  s.disc(-12, 10, -12, 3.1, (x, _y, z) => (x === -12 && z === -15 ? undefined : 'oak_planks'));
  s.disc(-12, 14, -12, 4.2, (x, _y, z) => (x === -12 && z === -15 ? undefined : 'oak_planks'));
  s.disc(-12, 15, -12, 4.2, 'oak_slab[type=bottom]', 3.4);
  s.clear(-12, 1, -8, -12, 2, -8);
  s.ladder(-12, 1, 14, -15, 'south');
  s.set(-12, 5, -14, 'lamp');
  s.chest(-10, 11, -10, 'west', 3);
  // The sails, on the south face: two beams crossing, with cloth between.
  for (let k = -9; k <= 9; k++) {
    s.set(-12 + k, 12 + k, -7, 'oak_log');
    s.set(-12 + k, 12 - k, -7, 'oak_log');
    if (Math.abs(k) > 3 && Math.abs(k) % 2 === 0) {
      for (const d of [-1, 1]) {
        s.set(-12 + k + d, 12 + k, -7, 'white_wool');
        s.set(-12 + k + d, 12 - k, -7, 'white_wool');
      }
    }
  }
  s.box(-13, 11, -8, -11, 13, -8, 'oak_log');
  s.set(-12, 12, -9, 'oak_log');

  // The barn: red, tall, with hay.
  s.house(6, -22, 15, 11, { door: 'south', wall: 'red_concrete', post: 'oak_log', roof: 'spruce', h: 6, floor: 'oak_planks', chests: [1, 2, 1] });
  s.clear(12, 1, -12, 14, 5, -12);
  for (const [x, z] of [
    [8, -20],
    [9, -20],
    [8, -19],
    [18, -20],
    [19, -20],
    [19, -19],
    [18, -14],
    [8, -14],
  ])
    s.box(x, 1, z, x, 2, z, 'hay');
  // The farmhouse: oak and stone, with a porch.
  s.house(-24, -4, 9, 8, { door: 'east', wall: 'oak_planks', post: 'oak_log', roof: 'brick', h: 4, floor: 'spruce_planks', chests: [1] });
  // The silo: a round tower with a ladder up it and a chest on a ring at the top.
  s.round(18, 4, 1, 15, 3.2, 'light_gray_concrete');
  s.disc(18, 0, 4, 3.2, 'stone');
  s.disc(18, 8, 4, 2.5, (x, _y, z) => (x === 18 && z === 2 ? undefined : 'oak_planks'));
  s.clear(18, 1, 7, 18, 2, 7);
  s.ladder(18, 1, 15, 2, 'south');
  s.disc(18, 15, 4, 3.2, (x, _y, z) => (x === 18 && z === 2 ? undefined : 'light_gray_concrete'));
  s.chest(20, 16, 5, 'west', 2);
  // Hay, crates and a tractor-ish wagon for cover in the yard.
  for (const [x, z] of [
    [-2, 2],
    [0, 2],
    [3, -4],
    [-6, -3],
    [4, 8],
  ])
    s.box(x, 1, z, x, 1, z, 'hay');
  s.box(-2, 1, 8, 2, 1, 9, 'oak_planks');
  s.floorLoot(-4, 1, 0, 1).floorLoot(12, 1, 2, 1);
  return s;
}
