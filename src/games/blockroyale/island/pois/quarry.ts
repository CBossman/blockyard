import { Site } from '../kit';

/**
 * The Quarry: a round pit cut down in terraces, a wooden catwalk spiralling from the rim to the
 * floor on half-block steps (no jumping), a derrick in the middle, a shed and stacked stone on the
 * rim. The loot is on the way down: the deeper, the better, and the farther from the rim's cover.
 */
export function quarry(): Site {
  const s = new Site('quarry', 206, 646, 72, 28, 30, 16);
  s.label = 'The Quarry';
  const FLOOR = -14;
  /** The pit's radius at a depth: terraces three deep, narrowing as it goes. */
  const radius = (dy: number) => 17 - Math.floor(-dy / 3) * 3;

  // The pit: air, with a stone floor, and its walls in cut stone.
  for (let dy = FLOOR + 1; dy <= 8; dy++) s.disc(0, dy, 0, dy <= 0 ? Math.max(4, radius(dy)) : 17, 'air');
  s.disc(0, FLOOR, 0, 17, (x, _y, z) => ((x + z) % 3 === 0 ? 'andesite' : 'stone'));
  for (let dy = FLOOR + 1; dy <= 0; dy++) {
    const rr = Math.max(4, radius(dy));
    s.disc(0, dy, 0, rr + 1.2, (x, _y, z) => (Math.hypot(x, z) > rr ? ((x + z + dy) % 3 === 0 ? 'andesite' : 'stone') : undefined));
  }

  // The catwalk: three wide, spiralling inward as it goes down, a half-block lower every two blocks.
  const th0 = 0.4;
  for (let n = 0; n <= 28; n++)
    for (let c = 0; c < 2; c++) {
      const idx = n * 2 + c;
      const rho = 15 - idx * 0.18;
      const th = th0 + idx / 12;
      const m = Math.floor(n / 2);
      const [cx, cz] = [Math.cos(th), Math.sin(th)];
      for (let w = -1; w <= 1; w++) {
        const x = Math.round(cx * (rho + w));
        const z = Math.round(cz * (rho + w));
        s.set(x, -m, z, n % 2 === 0 ? 'oak_planks' : 'oak_slab[type=bottom]');
        s.clear(x, -m + 1, z, x, -m + 3, z);
        // A rail on the outside, so it reads as a walk.
        if (w === 1 && c === 0 && n % 2 === 0) s.set(x, -m + 1, z, 'fence');
      }
    }
  // The derrick: a wooden tower over the middle of the pit with a platform near the top and a ladder up.
  for (const [x, z] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ])
    s.box(x, FLOOR + 1, z, x, 12, z, 'oak_log');
  for (let y = FLOOR + 2; y <= 10; y += 4) s.shell(-2, y, -2, 2, y, 2, 'oak_planks');
  s.box(-1, FLOOR + 1, -2, 1, 5, -2, 'fence');
  s.box(-2, 6, -2, 2, 6, 2, (x, _y, z) => (x === 0 && z === -1 ? undefined : 'oak_planks'));
  s.ladder(0, FLOOR + 1, 7, -1, 'south');
  s.chest(2, 7, 2, 'north', 3);
  s.set(0, 12, 0, 'lamp').set(0, FLOOR + 6, 0, 'lamp');

  // A haul road: a straight stair three wide from the floor up the north side to the rim, cut through
  // the terraces (the quickest way out, and the only one when the storm is coming).
  for (let k = 0; k <= -FLOOR; k++) {
    const z = -4 - k;
    const y = FLOOR + k;
    for (let x = -1; x <= 1; x++) {
      for (let below = FLOOR; below < y; below++) s.set(x, below, z, 'stone');
      s.stairs(x, y, z, 'cobblestone', 'north');
      s.clear(x, y + 1, z, x, y + 4, z);
    }
    for (const x of [-2, 2]) s.box(x, FLOOR, z, x, y, z, 'andesite');
  }

  // Chests on the way down and at the bottom.
  s.chest(-12, -3, 3, 'east', 2);
  s.chest(10, -6, -5, 'west', 2);
  s.chest(0, FLOOR + 1, 7, 'north', 3);
  s.chest(-6, FLOOR + 1, -6, 'east', 3);

  // The shed on the rim, and stacked cut stone and crates for cover.
  s.house(10, 14, 9, 7, { door: 'west', wall: 'spruce_planks', post: 'spruce_log', roof: 'spruce', h: 4, floor: 'gravel', chests: [2, 1] });
  s.box(-24, 1, 6, -20, 1, 9, 'stone');
  s.box(-24, 2, 6, -22, 2, 8, 'stone');
  s.box(-26, 1, -12, -22, 3, -9, 'andesite');
  for (const [x, z] of [
    [19, -4],
    [21, -2],
    [-8, 20],
    [-20, -19],
  ])
    s.box(x, 1, z, x + 1, 2, z + 1, 'crate');
  s.floorLoot(-12, 1, -19, 2)
    .floorLoot(15, 1, -10, 2)
    .floorLoot(0, FLOOR + 1, -9, 3);
  return s;
}
