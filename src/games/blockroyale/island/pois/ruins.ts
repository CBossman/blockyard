import { OPPOSITE, Site, STEP, type Facing } from '../kit';

/**
 * The Ruins: an old temple platform with broken columns round an altar and a legendary chest, and
 * a stair down on the north side to a crypt under it with three chests. Mossy, half fallen,
 * and quiet until somebody opens the first chest.
 */
export function ruins(): Site {
  const s = new Site('ruins', 396, 666, 66, 28, 30, 14);
  s.label = 'The Ruins';
  const r = s.rand;

  // The platform, three high, with two steps up on the east, west and south sides.
  s.box(-11, 0, -11, 11, 2, 11, (x, y, z) => (Math.abs(x) >= 10 || Math.abs(z) >= 10 || y === 2 ? (r() < 0.3 ? 'mossy_cobblestone' : 'stone_bricks') : 'cobblestone'));
  const steps = (side: Facing) => {
    const [sx, sz] = STEP[side];
    for (let j = 0; j < 2; j++)
      for (let t = -2; t <= 2; t++) {
        const d = 13 - j;
        const x = sx !== 0 ? sx * d : t;
        const z = sz !== 0 ? sz * d : t;
        for (let y = 0; y < j; y++) s.set(x, y, z, 'stone_bricks');
        s.stairs(x, j, z, 'stone_brick', OPPOSITE[side]);
      }
  };
  for (const side of ['east', 'west', 'south'] as const) steps(side);

  // Columns round it, each broken at its own height, with rubble where the rest of it fell.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const x = Math.round(Math.cos(a) * 8);
    const z = Math.round(Math.sin(a) * 8);
    const h = 2 + Math.floor(r() * 6);
    s.box(x, 3, z, x, 2 + h, z, (_x, y) => (y > 2 + h - 2 && r() < 0.5 ? 'mossy_cobblestone' : 'stone_bricks'));
    if (h > 5) s.set(x, 3 + h, z, 'stone_brick_slab[type=bottom]');
    else s.set(x + (r() < 0.5 ? 1 : -1), 3, z + (r() < 0.5 ? 1 : -1), 'cobblestone_slab[type=bottom]');
  }
  // The altar: marble, with the chest on it and lamps at its corners.
  s.box(-1, 3, -1, 1, 3, 1, 'marble');
  s.set(0, 4, 0, 'marble');
  s.chest(0, 5, 0, 'south', 4);
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    s.set(x, 4, z, 'lamp');
  // Fallen walls round the edge, for cover.
  for (const [x, z, w, d] of [
    [-16, -3, 3, 7],
    [14, 4, 2, 6],
    [-5, 15, 8, 2],
    [4, -17, 6, 2],
  ])
    s.box(x, 0, z, x + w - 1, Math.floor(r() * 2), z + d - 1, 'mossy_cobblestone');

  // The crypt: eight steps down on the north side, into a hall under the platform.
  for (let i = 0; i < 8; i++) {
    const z = -15 + i;
    s.clear(-1, -i, z, 1, -i + 3, z);
    for (let x = -1; x <= 1; x++) s.stairs(x, -i - 1, z, 'cobblestone', 'north');
    for (const x of [-2, 2]) s.box(x, -i - 1, z, x, -i + 3, z, 'mossy_cobblestone');
    s.box(-1, -i + 4, z, 1, -i + 4, z, 'mossy_cobblestone');
  }
  // The hall: its floor level with the bottom step, stone brick columns, lit, and three chests.
  s.clear(-6, -7, -7, 6, -4, 5);
  s.shell(-7, -7, -8, 7, -4, 6, 'mossy_cobblestone');
  s.box(-7, -8, -8, 7, -8, 6, 'stone_bricks');
  s.box(-7, -3, -8, 7, -3, 6, 'stone_bricks');
  s.clear(-1, -7, -8, 1, -5, -8);
  for (const [x, z] of [
    [-3, -3],
    [3, -3],
    [-3, 2],
    [3, 2],
  ]) {
    s.box(x, -7, z, x, -4, z, 'stone_bricks');
    s.set(x, -6, z + 1, 'lamp');
  }
  s.chest(-6, -7, -6, 'east', 3);
  s.chest(6, -7, -6, 'west', 3);
  s.chest(0, -7, 5, 'north', 2);
  s.floorLoot(-8, 3, 0, 3).floorLoot(8, 3, 4, 3);
  return s;
}
