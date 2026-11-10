import { Blueprint } from '@platform';
import { DRESSING } from './dressing';
import { BASES, CAMPS, FLOOR, GROUND_Y, HALF, HILLS, LAKES, MESAS, TREES, deposits, hash, heightAt, inHill, inLake, inMesa } from './map';

/**
 * The woods, the rocks, the roads and the bases' gravel pads, stamped into the world as it's made (so
 * they cost nothing to keep), in Blockilization's manner: a tree is a trunk of two or three blocks under a blob of leaves, a rock
 * a lump of grey blocks. Where the trees stand is `TREES` (`map.ts`), the same for the server's
 * pathfinder, which goes round each.
 */
export function woods(): Blueprint {
  const pad = 24;
  const b = new Blueprint({ x: -HALF - pad, y: GROUND_Y, z: -HALF - pad }, { x: (HALF + pad) * 2, y: 18, z: (HALF + pad) * 2 });
  // The meadow's own variety: broad patches of lusher and of dry grass, flowers and bare dirt, ragged at
  // the edges, so it isn't one flat green.
  const smooth = (x: number, z: number, s: number, seed: number) => {
    const fx = x / s;
    const fz = z / s;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const ux = fx - ix;
    const uz = fz - iz;
    const sx = ux * ux * (3 - 2 * ux);
    const sz = uz * uz * (3 - 2 * uz);
    const a = hash(ix + seed, iz) * (1 - sx) + hash(ix + 1 + seed, iz) * sx;
    const c = hash(ix + seed, iz + 1) * (1 - sx) + hash(ix + 1 + seed, iz + 1) * sx;
    return a * (1 - sz) + c * sz;
  };
  for (let x = -HALF; x < HALF; x++) for (let z = -HALF; z < HALF; z++) {
    // Broad sweeps with finer ones laid over, and a little scatter so one shade feathers into the next.
    const j = (hash(x, z + 77) - 0.5) * 0.05;
    const t = smooth(x, z, 38, 11) * 0.55 + smooth(x, z, 15, 400) * 0.3 + smooth(x, z, 6, 950) * 0.15 + j;
    const bloom = smooth(x, z, 9, 900) + j;
    const bare = smooth(x, z, 14, 1700) + j;
    if (bare > 0.8) b.set(x, GROUND_Y, z, 'cm_dirt');
    else if (bare > 0.74) b.set(x, GROUND_Y, z, 'cm_worn');
    else if (bloom > 0.82 && t > 0.4 && t < 0.55) b.set(x, GROUND_Y, z, 'cm_flowers');
    else b.set(x, GROUND_Y, z, t < 0.38 ? 'cm_g0' : t < 0.45 ? 'cm_g1' : t < 0.53 ? 'cm_ground' : t < 0.59 ? 'cm_g3' : t < 0.65 ? 'cm_g4' : 'cm_g5');
  }
  // Roads, a wide strip of packed earth joining the corner bases in a square; gravel pads under each
  // base; dark soil under the deposits. (They replace the ground's own top block.)
  // (Two ruts down the middle, the verge worn and uneven.)
  const road = (x: number, z: number, k: number) => {
    const a = Math.abs(k);
    if (a === 3) {
      if (hash(x, z + 9) < 0.55) b.set(x, GROUND_Y, z, 'cm_worn');
    } else if (a === 2) b.set(x, GROUND_Y, z, hash(x + 3, z) < 0.3 ? 'cm_worn' : 'cm_road');
    else b.set(x, GROUND_Y, z, a === 1 && hash(x, z + 5) < 0.7 ? 'cm_road2' : 'cm_road');
  };
  for (let t = -68; t <= 68; t++) for (let k = -3; k <= 3; k++) {
    road(t, -68 + k, k);
    road(t, 68 + k, k);
    road(-68 + k, t, k);
    road(68 + k, t, k);
  }
  for (const base of BASES) {
    for (let x = Math.floor(base.x - 17); x <= base.x + 17; x++) for (let z = Math.floor(base.z - 17); z <= base.z + 17; z++) {
      const d = Math.hypot(x - base.x, z - base.z) + (hash(x, z + 31) - 0.5) * 1.8;
      if (d <= 15 && Math.abs(x) < HALF && Math.abs(z) < HALF) b.set(x, GROUND_Y, z, d > 13.8 ? 'cm_worn' : d > 12.2 ? 'cm_road' : hash(x + 8, z) < 0.14 ? 'cm_pad2' : 'cm_pad');
    }
  }
  for (const n of deposits()) for (let x = Math.floor(n.x - 7); x <= n.x + 7; x++) for (let z = Math.floor(n.z - 7); z <= n.z + 7; z++) {
    // (Ragged at the edge, fading out through dirt and scuffed grass, not a stamp.)
    const d = Math.hypot(x + 0.5 - n.x, z + 0.5 - n.z) + (hash(x, z + 41) - 0.5) * 2.2;
    if (d <= 2.3) b.set(x, GROUND_Y, z, 'cm_soil');
    else if (d <= 4) b.set(x, GROUND_Y, z, 'cm_dirt');
    else if (d <= 5.6) b.set(x, GROUND_Y, z, hash(x + 2, z - 3) < 0.65 ? 'cm_worn' : 'cm_dirt');
    else if (d <= 6.6 && hash(x - 5, z + 9) < 0.5) b.set(x, GROUND_Y, z, 'cm_worn');
  }
  // Lakes: flat blue pools (not the engine's water, which costs a frame more than the field does) on a
  // sand shore.
  for (const l of LAKES) {
    for (let x = Math.floor(l.x - l.r - 3); x <= l.x + l.r + 3; x++) for (let z = Math.floor(l.z - l.r - 3); z <= l.z + l.r + 3; z++) {
      const d = Math.hypot(x - l.x, z - l.z) + (hash(x, z) - 0.5) * 1.6;
      if (d < l.r) b.set(x, GROUND_Y, z, d < l.r - 6 ? 'cm_deep' : d < l.r - 2.2 ? 'cm_water' : 'cm_shallows');
      else if (d < l.r + 2.6) b.set(x, GROUND_Y, z, 'cm_sand');
    }
  }
  // Mesas: stacks of rock under a grassy top, ragged at the edge.
  for (const s of MESAS) {
    for (let x = Math.floor(s.x - s.r - 2); x <= s.x + s.r + 2; x++) for (let z = Math.floor(s.z - s.r - 2); z <= s.z + s.r + 2; z++) {
      const d = Math.hypot(x - s.x, z - s.z) + (hash(x, z) - 0.5) * 2.2;
      if (d >= s.r) continue;
      // Lower towards the rim, a step at a time.
      const h = Math.max(1, Math.round(s.h * Math.min(1, (s.r - d) / 2.4)));
      for (let y = 0; y < h; y++) b.set(x, GROUND_Y + y, z, y === h - 1 ? 'cm_ground' : hash(x + y, z - y) < 0.34 ? 'cm_cliff2' : 'cm_cliff');
    }
  }
  // Hills: terraces of earth a block high under lusher grass, a boulder or two on top.
  for (const s of HILLS) {
    for (let x = Math.floor(s.x - s.r - 1); x <= s.x + s.r + 1; x++) for (let z = Math.floor(s.z - s.r - 1); z <= s.z + s.r + 1; z++) {
      const h = heightAt(x, z);
      for (let y = 1; y <= h; y++) b.set(x, GROUND_Y + y, z, 'cm_hill');
    }
    for (let k = 0; k < 3; k++) {
      const x = Math.floor(s.x + (hash(s.x + k, s.z) - 0.5) * s.r);
      const z = Math.floor(s.z + (hash(s.z, s.x + k) - 0.5) * s.r);
      if (hash(k, s.x) < 0.6) b.set(x, FLOOR + heightAt(x, z), z, k % 2 ? 'cm_rock' : 'cm_rock2');
    }
  }
  // Trees in Blockilization's manner: a trunk two or three blocks high under a broad canopy of
  // leaf blocks stacked in layers, the corners left ragged; pines taper in steps.
  for (const t of TREES) {
    const x = Math.floor(t.x);
    const z = Math.floor(t.z);
    const trunk = 2 + Math.floor(hash(x, z) * 2);
    for (let i = 0; i < trunk; i++) b.set(x, FLOOR + i, z, 'cm_trunk');
    const y = FLOOR + trunk;
    const roll = hash(x + 1, z);
    const kind = hash(z, x) < 0.3 ? 'cm_pine' : roll < 0.45 ? 'cm_leaves' : 'cm_leaves2';
    // The canopy shaded: dark underneath, the crown catching the sun; one tree in eleven turning.
    const autumn = kind !== 'cm_pine' && hash(x + 7, z + 2) < 0.09;
    const under = autumn ? 'cm_amber' : kind;
    const crown = autumn ? 'cm_amber2' : 'cm_leaves3';
    if (kind === 'cm_pine') {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) b.set(x + dx, y - 1, z + dz, kind);
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) b.set(x + dx, y, z + dz, 'cm_pine2');
      b.set(x, y + 1, z, 'cm_pine2');
      b.set(x, y + 2, z, 'cm_pine2');
    } else {
      const wide = hash(x, z + 5) < 0.45;
      const r = wide ? 2 : 1;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (!(corner && hash(x + dx, z + dz) < 0.6)) b.set(x + dx, y, z + dz, under);
      }
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!(Math.abs(dx) + Math.abs(dz) === 2 && hash(x - dx, z - dz) < 0.35)) b.set(x + dx, y + 1, z + dz, autumn ? 'cm_amber' : roll < 0.45 ? 'cm_leaves2' : 'cm_leaves3');
      b.set(x, y + 2, z, crown);
      if (hash(x + 3, z) < 0.5) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.set(x + dx, y + 2, z + dz, crown);
    }
  }
  // The highlands: a ring of terraced hills round the field, steps of rock rising to grass and, high
  // up, snow, so the world has an edge and the field a frame.
  const edge = HALF - 2;
  for (let x = -HALF - pad; x < HALF + pad; x++) for (let z = -HALF - pad; z < HALF + pad; z++) {
    const d = Math.max(Math.abs(x), Math.abs(z)) - edge;
    if (d <= 0) continue;
    const ridge = smooth(x, z, 11, 3100) * 5 + smooth(x, z, 5, 3500) * 2;
    const h = Math.min(16, Math.round(d * 0.55 + ridge - 2));
    if (h < 1) continue;
    for (let y = 0; y < h; y++) {
      const top = y === h - 1;
      // (Grass banks low down, rock showing higher up.)
      const block = top && h >= 13 ? 'cm_snow' : y < 7 ? 'cm_hill' : hash(x + y, z - y) < 0.34 ? 'cm_cliff2' : 'cm_cliff';
      b.set(x, GROUND_Y + y, z, block);
    }
  }
  // Scattered rocks on open ground.
  for (let i = 0; i < 70; i++) {
    const x = Math.floor((hash(i, 1) - 0.5) * 2 * (HALF - 6));
    const z = Math.floor((hash(i, 2) - 0.5) * 2 * (HALF - 6));
    if (TREES.some((t) => Math.hypot(t.x - x, t.z - z) < 3) || inHill(x, z, 1) || inLake(x, z, 2)) continue;
    b.set(x, FLOOR, z, 'cm_rock').set(x + 1, FLOOR, z, 'cm_rock2');
    if (hash(i, 3) < 0.5) b.set(x, FLOOR + 1, z, 'cm_rock2');
  }
  // Bushes and boulders in small groups, and fence posts round the fields: the little things that make
  // open ground read as a place.
  const taken = deposits();
  for (let i = 0; i < 260; i++) {
    const x = Math.floor((hash(i, 11) - 0.5) * 2 * (HALF - 5));
    const z = Math.floor((hash(i, 12) - 0.5) * 2 * (HALF - 5));
    if (inLake(x, z, 4) || inMesa(x, z, 2) || inHill(x, z, 1) || BASES.some((s) => Math.hypot(s.x - x, s.z - z) < 15) || TREES.some((t) => Math.hypot(t.x - x, t.z - z) < 2.5) || taken.some((d) => Math.hypot(d.x - x, d.z - z) < 5) || Math.abs(Math.abs(x) - 68) < 3 || Math.abs(Math.abs(z) - 68) < 3) continue;
    // (A shrub is a low, uneven clump, shaded like the trees: never one lone cube.)
    if (i % 2) continue;
    const leaf = hash(i, 13) < 0.5 ? 'cm_leaves' : 'cm_leaves2';
    b.set(x, FLOOR, z, leaf).set(x + 1, FLOOR, z, leaf);
    if (hash(i, 15) < 0.7) b.set(x, FLOOR, z + 1, leaf);
    if (hash(i, 17) < 0.5) b.set(x - 1, FLOOR, z, leaf);
    if (hash(i, 18) < 0.5) b.set(x + 1, FLOOR, z - 1, leaf);
    b.set(x, FLOOR + 1, z, 'cm_leaves3');
    if (hash(i, 16) < 0.5) b.set(x + 1, FLOOR + 1, z, 'cm_leaves3');
  }
  // Last, on open meadow only: tufts of grass, thick in patches and thin between, and flowers in drifts.
  const meadow = new Set(['cm_g0', 'cm_g1', 'cm_ground', 'cm_g3', 'cm_g4', 'cm_g5', 'cm_flowers']);
  const clear = [...CAMPS, ...DRESSING];
  for (let x = -HALF + 1; x < HALF - 1; x++) for (let z = -HALF + 1; z < HALF - 1; z++) {
    const top = b.get(x, GROUND_Y, z) as string | undefined;
    if (!top || !meadow.has(top) || b.get(x, FLOOR, z) !== undefined || heightAt(x, z) > 0) continue;
    if (clear.some((c) => Math.abs(c.x - x) < 9 && Math.abs(c.z - z) < 9)) continue;
    const roll = hash(x + 41, z - 17);
    const drift = smooth(x, z, 8, 2300);
    const thick = smooth(x, z, 12, 5100);
    if (drift > 0.68 && roll < 0.26) {
      const which = smooth(x, z, 22, 7300);
      b.set(x, FLOOR, z, which < 0.42 ? 'cm_bloom' : which < 0.6 ? 'cm_bloom2' : 'cm_bloom3');
    } else if (roll < 0.03 + Math.max(0, thick - 0.34) * 0.5) {
      const dry = top === 'cm_g4' || top === 'cm_g5';
      b.set(x, FLOOR, z, dry ? 'cm_tuft3' : hash(x - 9, z + 4) < 0.55 ? 'cm_tuft' : 'cm_tuft2');
    }
  }
  return b;
}
