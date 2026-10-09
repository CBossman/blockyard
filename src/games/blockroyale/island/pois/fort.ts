import { Site } from '../kit';

/**
 * Fort Brickhaven: a square stone fort with a moat, a gate facing south over a plank bridge, four
 * corner towers you climb by ladder, a long barracks, and a keep in the courtyard with its best
 * loot on the upper floor. Strong walls to fight behind, and a long way up to be shot from.
 */
export function fort(): Site {
  const s = new Site('brickhaven', 226, 586, 69, 30);
  s.label = 'Fort Brickhaven';
  const W = 17;

  // The moat: a ring of water one deep round the walls (deep enough to slow you, shallow enough to climb out of).
  for (let z = -W - 6; z <= W + 6; z++)
    for (let x = -W - 6; x <= W + 6; x++) {
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d >= W + 3 && d <= W + 5) {
        s.set(x, 0, z, 'water');
        s.set(x, -1, z, 'stone_bricks');
      }
    }
  // The courtyard's floor.
  s.box(-W, 0, -W, W, 0, W, (x, _y, z) => ((x + z) % 3 === 0 ? 'cobblestone' : 'stone'));

  // Walls: two thick, seven high, with battlements.
  for (let h = 1; h <= 7; h++) {
    s.shell(-W, h, -W, W, h, W, 'stone_bricks');
    s.shell(-W + 1, h, -W + 1, W - 1, h, W - 1, 'stone_bricks');
  }
  for (let i = -W; i <= W; i += 2)
    for (const [x, z] of [
      [i, -W],
      [i, W],
      [-W, i],
      [W, i],
    ])
      s.set(x, 8, z, 'stone_bricks');
  // The wall's walk, along the inside, reached by the towers.
  s.shell(-W + 2, 7, -W + 2, W - 2, 7, W - 2, 'oak_planks');
  s.clear(-W + 2, 8, -W + 2, W - 2, 12, W - 2);
  // The gate, with a bridge over the moat.
  s.clear(-2, 1, W - 1, 2, 5, W);
  s.box(-2, 6, W - 1, 2, 6, W, 'stone_bricks');
  s.box(-2, 0, W + 2, 2, 0, W + 6, 'oak_planks');
  for (const x of [-3, 3]) s.box(x, 1, W + 2, x, 1, W + 6, 'fence');

  // Corner towers: hollow, a ladder up, a floor at the top and a chest on it.
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const cx = sx * (W + 1);
    const cz = sz * (W + 1);
    s.box(cx - 3, 0, cz - 3, cx + 3, 0, cz + 3, 'stone_bricks');
    s.box(cx - 3, 1, cz - 3, cx + 3, 13, cz + 3, (x, _y, z) => (Math.abs(x - cx) === 3 || Math.abs(z - cz) === 3 ? 'stone_bricks' : 'air'));
    // The doorway onto the courtyard, and the walk beside it.
    s.clear(cx - sx * 3, 1, cz, cx - sx * 3, 2, cz);
    // (The ladder hangs on the wall nearest the middle of the fort, facing away from it.)
    s.ladder(cx - sx * 2, 1, 12, cz, sx > 0 ? 'east' : 'west');
    s.box(cx - 2, 13, cz - 2, cx + 2, 13, cz + 2, (x, _y, z) => (x === cx - sx * 2 && z === cz ? undefined : 'oak_planks'));
    s.shell(cx - 3, 14, cz - 3, cx + 3, 14, cz + 3, 'stone_bricks');
    for (let i = -3; i <= 3; i += 2)
      for (const [x, z] of [
        [cx + i, cz - 3],
        [cx + i, cz + 3],
        [cx - 3, cz + i],
        [cx + 3, cz + i],
      ])
        s.set(x, 15, z, 'stone_bricks');
    s.chest(cx + sx * 2, 14, cz + sz * 2, sz > 0 ? 'north' : 'south', 2);
    s.set(cx, 13, cz + sz * 2, 'lamp');
  }

  // The barracks along the west wall.
  s.house(-14, -6, 8, 12, { door: 'east', wall: 'cobblestone', post: 'stone_bricks', roof: 'cobblestone', h: 4, floor: 'oak_planks', chests: [1, 2] });

  // The keep: two floors, a ladder between them, slits for windows, and the good chests above.
  s.box(-5, 0, -5, 5, 0, 5, 'stone_bricks');
  s.shell(-5, 1, -5, 5, 9, 5, 'stone_bricks');
  s.box(-4, 5, -4, 4, 5, 4, (x, _y, z) => (x === 0 && z === -4 ? undefined : 'oak_planks'));
  s.clear(0, 1, 5, 0, 2, 5);
  s.ladder(0, 1, 5, -4, 'south');
  s.ladder(0, 6, 9, -4, 'south');
  s.box(-4, 10, -4, 4, 10, 4, 'stone_brick_slab[type=bottom]');
  for (const x of [-3, 3]) for (const y of [3, 7]) s.set(x, y, 5, 'glass_pane').set(x, y, -5, 'glass_pane').set(5, y, x, 'glass_pane').set(-5, y, x, 'glass_pane');
  s.chest(-3, 1, -3, 'south', 3);
  s.chest(3, 1, -3, 'south', 3);
  s.chest(-3, 6, 3, 'north', 4);
  s.set(0, 4, 0, 'lamp').set(0, 9, 0, 'lamp');
  // A banner over the door, and lamps by the gate.
  s.box(-1, 7, 6, 1, 9, 6, 'red_wool');
  s.set(-3, 3, W + 1, 'lamp').set(3, 3, W + 1, 'lamp');

  // Cover in the courtyard.
  for (const [x, z] of [
    [8, -3],
    [9, -3],
    [8, 4],
    [-2, 12],
    [3, 12],
    [11, 10],
    [-9, 13],
  ])
    s.set(x, 1, z, 'crate');
  for (const [x, z] of [
    [10, -3],
    [-3, 12],
    [12, 10],
  ])
    s.set(x, 1, z, 'barrel');
  s.floorLoot(9, 1, 0, 2).floorLoot(-8, 1, 14, 2);
  return s;
}
