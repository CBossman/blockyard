import { TREE_WOOD, type ResKind } from './defs';

/**
 * The battlefield: a square of open ground with a base in each corner, two more spots for the bots
 * of a co-op game, and deposits of steel and oil round each base and in the middle. No imports but
 * types, so the server and each screen read the same map.
 */

/** Half the map's side (blocks), and the ground's height. */
export const HALF = 105;
export const GROUND_Y = 62;
export const FLOOR = GROUND_Y + 1;

export interface Spot {
  x: number;
  z: number;
}

type Round = { x: number; z: number; r: number };
/** A rise: its height, and (a mesa) whether its top is bare rock rather than grass. */
type Rise = Round & { h: number; rock?: boolean };
export type MapId = 'heartland' | 'crossing' | 'badlands' | 'deepwoods' | 'frostline' | 'canyons' | 'highlands';
/**
 * A battlefield: the same four corner bases (and the co-op bots' two) and the roads between them on
 * every map, but its own lakes, mesas, hills, camps, middle deposits, woods and ground. Each is turned
 * round the middle (a half turn) onto itself, so no base has the better of it.
 */
export interface MapDef {
  id: MapId;
  name: string;
  blurb: string;
  lakes: Round[];
  mesas: Rise[];
  hills: Rise[];
  camps: Spot[];
  /** The rich deposits out on the field (not the bases' own). */
  middle: [number, number, ResKind][];
  /** The woods: the share of the field in clumps (`cut`: higher, fewer), how thick they grow, the lone trees between, a seed, the share of pines; `lanes` keeps the roads and the ways to the middle clear. */
  woods: { cut: number; dense: number; sparse: number; seed: number; pines: number; lanes?: boolean };
  ground: 'green' | 'dry' | 'lush' | 'snow';
  /** The minimap's meadow. */
  mini: string;
}
/** A river of round pools across the field (z = 0, winding), with fords at these x: nothing on foot crosses but at a ford. */
const river = (fords: number[]): Round[] => {
  const out: Round[] = [];
  for (let x = -104; x <= 104; x += 8) if (!fords.some((f) => Math.abs(x - f) <= 8)) out.push({ x, z: Math.round(5 * Math.sin(x / 23)), r: 8 });
  return out;
};
/** Mesas in a ring round the middle, with ways in between. */
const ring = (n: number, at: number, r: number, h: number): Rise[] => Array.from({ length: n }, (_, k) => {
  const a = ((k + 0.5) / n) * Math.PI * 2;
  return { x: Math.round(Math.cos(a) * at), z: Math.round(Math.sin(a) * at), r, h };
});
/** A ridge of mesas along x, from z0 to z1, broken by passes at these z. */
const ridge = (x: number, z0: number, z1: number, passes: number[]): Rise[] => {
  const out: Rise[] = [];
  for (let z = z0; z <= z1; z += 7) if (!passes.some((p) => Math.abs(z - p) <= 7)) out.push({ x, z, r: 5, h: 4, rock: true });
  return out;
};
export const MAPS: MapDef[] = [
  {
    id: 'heartland', name: 'Heartland', blurb: 'Rolling meadow: lakes, mesas and woods break up open ground.',
    lakes: [{ x: -40, z: -6, r: 15 }, { x: 40, z: 6, r: 15 }, { x: 0, z: -50, r: 12 }, { x: 0, z: 50, r: 12 }],
    mesas: [{ x: -24, z: -40, r: 7, h: 3 }, { x: 24, z: 40, r: 7, h: 3 }, { x: -56, z: 16, r: 6, h: 4 }, { x: 56, z: -16, r: 6, h: 4 }, { x: -28, z: 30, r: 6, h: 3 }, { x: 28, z: -30, r: 6, h: 3 }],
    hills: [{ x: -14, z: -24, r: 8, h: 3 }, { x: 14, z: 24, r: 8, h: 3 }, { x: -24, z: 56, r: 8, h: 2 }, { x: 24, z: -56, r: 8, h: 2 }, { x: -42, z: -40, r: 7, h: 2 }, { x: 42, z: 40, r: 7, h: 2 }, { x: -84, z: -6, r: 10, h: 3 }, { x: 84, z: 6, r: 10, h: 3 }],
    // (Well out from every base: midway between two on the map's side, or further in.)
    camps: [{ x: -44, z: 27 }, { x: 44, z: -27 }, { x: -68, z: 0 }, { x: 68, z: 0 }],
    middle: [[-14, -10, 'steel'], [14, 10, 'steel'], [0, 0, 'oil'], [-12, 14, 'oil'], [12, -14, 'oil'], [0, -22, 'steel'], [0, 22, 'steel']],
    woods: { cut: 0.5, dense: 0.8, sparse: 0.04, seed: 0, pines: 0.3 },
    ground: 'green',
    mini: '#4a8e38',
  },
  {
    id: 'crossing', name: 'River Crossing', blurb: 'A river cuts the field in two: three fords, and whoever holds them.',
    lakes: river([-52, 0, 52]),
    mesas: [{ x: -30, z: -42, r: 6, h: 3 }, { x: 30, z: 42, r: 6, h: 3 }, { x: -86, z: -32, r: 5, h: 4 }, { x: 86, z: 32, r: 5, h: 4 }],
    hills: [{ x: 0, z: -26, r: 7, h: 3 }, { x: 0, z: 26, r: 7, h: 3 }, { x: -52, z: -24, r: 6, h: 2 }, { x: 52, z: 24, r: 6, h: 2 }],
    camps: [{ x: -24, z: -28 }, { x: 24, z: 28 }, { x: -84, z: 26 }, { x: 84, z: -26 }],
    middle: [[-10, -14, 'oil'], [10, 14, 'oil'], [14, -15, 'steel'], [-14, 15, 'steel'], [-62, -16, 'steel'], [62, 16, 'steel'], [-42, 17, 'oil'], [42, -17, 'oil']],
    woods: { cut: 0.55, dense: 0.8, sparse: 0.04, seed: 7, pines: 0.3 },
    ground: 'lush',
    mini: '#3f8a34',
  },
  {
    id: 'badlands', name: 'Badlands', blurb: 'Dry rock country: a ring of mesas round a rich middle, eight narrow ways in.',
    lakes: [{ x: -62, z: -8, r: 9 }, { x: 62, z: 8, r: 9 }],
    mesas: [...ring(8, 30, 6, 4), { x: -34, z: -64, r: 6, h: 4 }, { x: 34, z: 64, r: 6, h: 4 }, { x: -66, z: -34, r: 5, h: 3 }, { x: 66, z: 34, r: 5, h: 3 }],
    hills: [{ x: -44, z: 42, r: 8, h: 3 }, { x: 44, z: -42, r: 8, h: 3 }],
    camps: [{ x: -50, z: 20 }, { x: 50, z: -20 }, { x: -20, z: -52 }, { x: 20, z: 52 }],
    middle: [[0, 0, 'oil'], [-12, -6, 'steel'], [12, 6, 'steel'], [7, -13, 'steel'], [-7, 13, 'steel']],
    woods: { cut: 0.85, dense: 0.5, sparse: 0.015, seed: 31, pines: 0.15 },
    ground: 'dry',
    mini: '#8f9160',
  },
  {
    id: 'deepwoods', name: 'Deep Woods', blurb: 'Thick forest: fight along the roads and the trails, or blast your own way through.',
    lakes: [{ x: -34, z: 30, r: 11 }, { x: 34, z: -30, r: 11 }],
    mesas: [{ x: -58, z: 6, r: 5, h: 3 }, { x: 58, z: -6, r: 5, h: 3 }],
    hills: [{ x: 0, z: 0, r: 9, h: 3 }, { x: -24, z: -52, r: 7, h: 2 }, { x: 24, z: 52, r: 7, h: 2 }],
    camps: [{ x: -40, z: -26 }, { x: 40, z: 26 }, { x: -20, z: 48 }, { x: 20, z: -48 }],
    middle: [[-14, -12, 'steel'], [14, 12, 'steel'], [-16, 10, 'oil'], [16, -10, 'oil'], [0, -26, 'steel'], [0, 26, 'steel']],
    woods: { cut: 0.22, dense: 0.85, sparse: 0.12, seed: 53, pines: 0.45, lanes: true },
    ground: 'lush',
    mini: '#3f8a34',
  },
  {
    id: 'frostline', name: 'Frostline', blurb: 'A winter front: snowfields, pine woods and frozen-edged lakes.',
    lakes: [{ x: -44, z: -16, r: 13 }, { x: 44, z: 16, r: 13 }, { x: 0, z: -44, r: 9 }, { x: 0, z: 44, r: 9 }],
    mesas: [{ x: -20, z: -30, r: 6, h: 4 }, { x: 20, z: 30, r: 6, h: 4 }, { x: -70, z: 18, r: 6, h: 4 }, { x: 70, z: -18, r: 6, h: 4 }],
    hills: [{ x: -30, z: -58, r: 7, h: 2 }, { x: 30, z: 58, r: 7, h: 2 }, { x: 16, z: -16, r: 8, h: 3 }, { x: -16, z: 16, r: 8, h: 3 }],
    camps: [{ x: -48, z: 30 }, { x: 48, z: -30 }, { x: -80, z: -30 }, { x: 80, z: 30 }],
    middle: [[0, 0, 'oil'], [-12, -6, 'steel'], [12, 6, 'steel'], [-26, 2, 'steel'], [26, -2, 'steel'], [0, -24, 'oil'], [0, 24, 'oil']],
    woods: { cut: 0.55, dense: 0.7, sparse: 0.05, seed: 77, pines: 1 },
    ground: 'snow',
    mini: '#dfe7ec',
  },
  {
    id: 'canyons', name: 'Canyons', blurb: 'Two long walls of rock run down the field: two passes through each, or the long way round their ends.',
    lakes: [{ x: -56, z: 2, r: 7 }, { x: 56, z: -2, r: 7 }],
    mesas: [...ridge(-30, -60, 60, [-20, 36]), ...ridge(30, -60, 60, [20, -36])],
    hills: [{ x: 0, z: -40, r: 8, h: 3 }, { x: 0, z: 40, r: 8, h: 3 }, { x: 0, z: 0, r: 6, h: 2 }],
    camps: [{ x: -50, z: -30 }, { x: 50, z: 30 }, { x: 14, z: -58 }, { x: -14, z: 58 }],
    middle: [[0, -14, 'steel'], [0, 14, 'steel'], [-14, 0, 'oil'], [14, 0, 'oil'], [-16, -28, 'steel'], [16, 28, 'steel']],
    woods: { cut: 0.6, dense: 0.7, sparse: 0.03, seed: 91, pines: 0.2 },
    ground: 'green',
    mini: '#4a8e38',
  },
  {
    id: 'highlands', name: 'Highlands', blurb: 'Big hills everywhere: high ground sees and shoots further. The middle is a hilltop.',
    lakes: [{ x: -46, z: 10, r: 8 }, { x: 46, z: -10, r: 8 }],
    mesas: [{ x: -14, z: -50, r: 5, h: 4 }, { x: 14, z: 50, r: 5, h: 4 }],
    hills: [{ x: 0, z: 0, r: 10, h: 4 }, { x: -30, z: -30, r: 11, h: 4 }, { x: 30, z: 30, r: 11, h: 4 }, { x: 30, z: -34, r: 10, h: 3 }, { x: -30, z: 34, r: 10, h: 3 }, { x: -72, z: 0, r: 10, h: 3 }, { x: 72, z: 0, r: 10, h: 3 }, { x: 0, z: -62, r: 8, h: 2 }, { x: 0, z: 62, r: 8, h: 2 }],
    camps: [{ x: -44, z: -12 }, { x: 44, z: 12 }, { x: -20, z: 62 }, { x: 20, z: -62 }],
    middle: [[-13, -15, 'steel'], [13, 15, 'steel'], [15, -13, 'oil'], [-15, 13, 'oil'], [0, -31, 'steel'], [0, 31, 'steel']],
    woods: { cut: 0.6, dense: 0.75, sparse: 0.04, seed: 113, pines: 0.5 },
    ground: 'lush',
    mini: '#3f8a34',
  },
];
export const MAP_IDS = MAPS.map((m) => m.id);
/** The map in play (the server's word: `useMap`). */
export let MAP: MapDef = MAPS[0];

/**
 * Neutral camps: a few wild guards round a relic, a rich steel deposit and an oil well, out on the
 * field. Clear the guards, then hold the relic to have it pay steel. (The map's: `useMap` fills it.)
 */
export const CAMPS: Spot[] = [];

/** The four players' bases, then the two a co-op game's bots take. */
export const BASES: Spot[] = [
  { x: -68, z: -68 },
  { x: 68, z: -68 },
  { x: -68, z: 68 },
  { x: 68, z: 68 },
  { x: 0, z: -90 },
  { x: 0, z: 90 },
];

export interface Deposit extends Spot {
  id: number;
  kind: ResKind;
  amount: number;
  /** Scrap: a wreck or a ruin out on the field that engineers strip for steel (its model, not a steel pile's). */
  scrap?: 'ruin' | 'henge' | 'rubble';
  /** Left by the fighting (a wreck, a ruin): anyone may strip it, and it doesn't stand in anyone's way. */
  salvage?: boolean;
  /** A tree's wood (`TREES` index): engineers fell it a load at a time, and when it's all taken the tree is down. */
  tree?: number;
}

/** The scrap out on the field: bombed-out houses and burned-out tanks, each worth some steel to whoever strips it. */
const SCRAP: [ 'ruin' | 'henge', number, number][] = [['ruin', -24, 22], ['ruin', 24, -22], ['henge', -58, 42], ['henge', 58, -42], ['ruin', -8, -32], ['ruin', 8, 32], ['henge', -8, 64], ['henge', 8, -64]];

/** A fixed small random (0..1), so every screen and the server agree. */
export function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The deposits: three steel and two oil near each base, and a rich cluster in the middle. */
/** Which way each deposit's model (and a pumpjack's beam on it) faces. */
export const hashYaw = (n: number): number => (n * 2.399) % (Math.PI * 2);

/** The map's deposits: the bases', the middle's, the camps', the scrap; then, unless `trees` is false, each tree's wood. */
export function deposits(trees = true): Deposit[] {
  const out: Deposit[] = [];
  const add = (x: number, z: number, kind: ResKind, amount: number) => out.push({ id: out.length, x, z, kind, amount });
  BASES.forEach((b, i) => {
    // Towards the middle of the map: the way each base faces.
    const dx = -Math.sign(b.x) || 1;
    const dz = -Math.sign(b.z) || 1;
    for (let k = 0; k < 3; k++) add(b.x + dx * (14 + k * 4) + (hash(i, k) - 0.5) * 6, b.z + (k - 1) * 9 + (hash(i, k + 9) - 0.5) * 4, 'steel', 1800);
    for (let k = 0; k < 2; k++) add(b.x + (k ? 11 : -11) * -dx * 0.5 + (hash(i, k + 20) - 0.5) * 3, b.z + dz * (13 + k * 5), 'oil', 1400);
  });
  for (const [x, z, kind] of MAP.middle) add(x, z, kind, 2600);
  for (const c of CAMPS) {
    // (Mirrored, as the map is: the east half's camps are the west half's turned round the middle.)
    const s = c.x < 0 ? 1 : -1;
    add(c.x + 7 * s, c.z + 5 * s, 'steel', 3500);
    add(c.x - 7 * s, c.z + 5 * s, 'oil', 2500);
  }
  for (const [scrap, x, z] of SCRAP) {
    if (inLake(x, z, 3) || inMesa(x, z, 3) || inHill(x, z, 1)) continue;
    add(x, z, 'steel', scrap === 'henge' ? 900 : 700);
    out[out.length - 1].scrap = scrap;
  }
  if (trees) TREES.forEach((t, i) => {
    add(t.x, t.z, 'wood', TREE_WOOD);
    out[out.length - 1].tree = i;
  });
  return out;
}

/** Lakes: round pools between the bases that nothing on foot can cross (boats and bridges may come), with a sand shore. */
export const LAKES: Round[] = [];
/** The lake a point is in (or nearest), by index. */
export const lakeOf = (x: number, z: number): number => {
  let best = 0;
  let bd = 1e9;
  LAKES.forEach((l, i) => {
    const d = Math.hypot(l.x - x, l.z - z) - l.r;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
};
/** The point on a lake's shore (on dry land, `out` blocks past the water) nearest a point. */
export function shore(lake: number, x: number, z: number, out = 2): { x: number; z: number } {
  const l = LAKES[lake];
  const d = Math.hypot(x - l.x, z - l.z) || 1;
  return { x: l.x + ((x - l.x) / d) * (l.r + out), z: l.z + ((z - l.z) / d) * (l.r + out) };
}
/** A point kept inside a lake (where a boat can be): `pad` blocks in from its shore. */
export function inside(lake: number, x: number, z: number, pad = 2): { x: number; z: number } {
  const l = LAKES[lake];
  const d = Math.hypot(x - l.x, z - l.z);
  const max = l.r - pad;
  if (d <= max) return { x, z };
  return { x: l.x + ((x - l.x) / d) * max, z: l.z + ((z - l.z) / d) * max };
}
/**
 * Walls stand on the cells of the grid units find their way on (3 blocks a cell: the server's
 * `CELL`), so a line of them has no gaps. This is the middle of the cell a point is in.
 */
export const WALL_CELL = 3;
export const wallSnap = (v: number): number => Math.floor((v + HALF) / WALL_CELL) * WALL_CELL - HALF + WALL_CELL / 2;
/**
 * A gate is a gatehouse three cells long, set in a wall line: `axis` 0 runs along x (the way through
 * is along z), 1 along z. These are its cells, the middle one first.
 */
export const gateCells = (x: number, z: number, axis: number): { x: number; z: number }[] => {
  const cx = wallSnap(x);
  const cz = wallSnap(z);
  const ax = axis ? 0 : WALL_CELL;
  const az = axis ? WALL_CELL : 0;
  return [{ x: cx, z: cz }, { x: cx - ax, z: cz - az }, { x: cx + ax, z: cz + az }];
};
/**
 * Which way a gate dropped at a spot runs: along the wall it's set in (`wall` says whether a cell has
 * a length of one's own wall). With wall on neither line, or both, along x.
 */
export function gateAxis(x: number, z: number, wall: (x: number, z: number) => boolean): number {
  const cx = wallSnap(x);
  const cz = wallSnap(z);
  let alongX = 0;
  let alongZ = 0;
  for (const k of [-2, -1, 1, 2]) {
    if (wall(cx + k * WALL_CELL, cz)) alongX++;
    if (wall(cx, cz + k * WALL_CELL)) alongZ++;
  }
  return alongZ > alongX ? 1 : 0;
}
/** The cells of a wall dragged from one point to another: each next to the last by a side (never only a corner), so nothing on foot slips between. */
export function wallLine(x0: number, z0: number, x1: number, z1: number, max = 40): { x: number; z: number }[] {
  let x = wallSnap(x0);
  let z = wallSnap(z0);
  const di = Math.round(Math.abs(wallSnap(x1) - x) / WALL_CELL);
  const dj = Math.round(Math.abs(wallSnap(z1) - z) / WALL_CELL);
  const si = Math.sign(x1 - x0) * WALL_CELL;
  const sj = Math.sign(z1 - z0) * WALL_CELL;
  const out = [{ x, z }];
  let a = 0;
  let b = 0;
  while ((a < di || b < dj) && out.length < max) {
    if (a < di && (b >= dj || (a + 0.5) * dj < (b + 0.5) * di)) {
      x += si;
      a++;
    } else {
      z += sj;
      b++;
    }
    out.push({ x, z });
  }
  return out;
}

export const inLake = (x: number, z: number, pad = 0) => LAKES.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + pad);

/** Plateaus: rocky mesas (a few blocks high) that nothing on foot can climb: they split the field and give the eye something to read. */
export const MESAS: Rise[] = [];
export const inMesa = (x: number, z: number, pad = 0) => MESAS.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + pad);

/**
 * Hills: gentle grassy rises in terraces a block high, that anything can walk up. High ground sees
 * further and shoots further, and is harder to hit from below.
 */
export const HILLS: Rise[] = [];
export const inHill = (x: number, z: number, pad = 0) => HILLS.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + pad);
/** How many blocks the ground stands above the field's floor at a point (0 off the hills). */
export function heightAt(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  let h = 0;
  for (const s of HILLS) {
    if (Math.abs(s.x - x) > s.r + 1 || Math.abs(s.z - z) > s.r + 1) continue;
    const d = Math.hypot(ix + 0.5 - s.x, iz + 0.5 - s.z) + (hash(ix, iz + 313) - 0.5) * 1.4;
    if (d < s.r) h = Math.max(h, Math.min(s.h, 1 + Math.floor((s.r - d) / 2.4)));
  }
  return h;
}

/**
 * Woods: clumps of trees scattered over the field, away from the bases and the deposits, that
 * units must go round (the pathfinder treats each as an obstacle) and that break up the view.
 */
export const TREES: Spot[] = [];
/** Whether a point is on one of the trails a forest map keeps clear: the roads between the bases, the ways in to the middle, and out to the co-op bases. */
const onLane = (x: number, z: number): boolean => {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return (Math.abs(ax - 68) < 6 && az < 74) || (Math.abs(az - 68) < 6 && ax < 74) || Math.abs(ax - az) < 7 || (ax < 6 && az > 55);
};
function plantTrees(): void {
  const all = deposits(false);
  const w = MAP.woods;
  TREES.length = 0;
  for (let gx = -HALF + 5; gx < HALF - 4; gx += 4.2) {
    for (let gz = -HALF + 5; gz < HALF - 4; gz += 4.2) {
      const x = gx + (hash(gx * 3, gz) - 0.5) * 3;
      const z = gz + (hash(gx, gz * 3) - 0.5) * 3;
      const clump = hash(Math.floor(gx / 16) + w.seed, Math.floor(gz / 16) - w.seed) > w.cut;
      if (!(clump ? hash(gx, gz) < w.dense : hash(gx + 7, gz - 3) < w.sparse)) continue;
      if (inLake(x, z, 5) || inMesa(x, z, 3) || inHill(x, z, 1) || CAMPS.some((c) => Math.hypot(c.x - x, c.z - z) < 12) || BASES.some((b) => Math.hypot(b.x - x, b.z - z) < 28) || all.some((d) => Math.hypot(d.x - x, d.z - z) < 8)) continue;
      if (w.lanes && onLane(x, z)) continue;
      TREES.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
    }
  }
}

/** Put a map in play: its lakes, mesas, hills, camps and woods in the lists every part of the game reads (the same lists, filled again). */
export function useMap(id: MapId): void {
  MAP = MAPS.find((m) => m.id === id) ?? MAPS[0];
  const fill = <T>(list: T[], from: T[]) => {
    list.length = 0;
    for (const x of from) list.push({ ...x });
  };
  fill(LAKES, MAP.lakes);
  fill(MESAS, MAP.mesas);
  fill(HILLS, MAP.hills);
  fill(CAMPS, MAP.camps);
  plantTrees();
}
useMap('heartland');

/** How far past each thing on the land the grid units find their way on counts a cell shut (to the cell's middle, plus half a cell). */
export const SHUT = { lake: 0.6, mesa: 0.8, tree: 0.9, deposit: 1.8, building: 1 };
/** Whether the cell round (x, z) is shut to walkers by the land itself: water, a mesa or a tree. */
export function landShut(x: number, z: number): boolean {
  const near = (cx: number, cz: number, r: number) => Math.hypot(x - cx, z - cz) <= r + WALL_CELL * 0.5;
  return LAKES.some((l) => near(l.x, l.z, l.r + SHUT.lake)) || MESAS.some((m) => near(m.x, m.z, m.r + SHUT.mesa)) || TREES.some((t) => near(t.x, t.z, SHUT.tree));
}

/**
 * A base's walls, as a bot puts them up: a square round it, `r` out, but a side that would come near
 * the map's edge is left out and the two beside it run on to the edge instead (the edge is wall
 * enough). Two gates in each side: one level with the base, one further towards the middle.
 */
export function wallPlan(bx: number, bz: number, r = 32): { lines: [number, number, number, number][]; gates: { x: number; z: number }[] } {
  const edge = HALF - WALL_CELL / 2;
  const span = (c: number) => {
    const loOpen = c - r > -edge + 14;
    const hiOpen = c + r < edge - 14;
    return { lo: wallSnap(loOpen ? c - r : -edge), hi: wallSnap(hiOpen ? c + r : edge), loOpen, hiOpen };
  };
  const X = span(bx);
  const Z = span(bz);
  const lines: [number, number, number, number][] = [];
  const gates: { x: number; z: number }[] = [];
  const side = (alongZ: boolean, at: number, lo: number, hi: number, mid: number) => {
    lines.push(alongZ ? [at, lo, at, hi] : [lo, at, hi, at]);
    for (const g of [mid, mid + (Math.sign(-mid) || 1) * 12]) {
      const v = wallSnap(Math.max(lo + WALL_CELL, Math.min(hi - WALL_CELL, g)));
      gates.push(alongZ ? { x: at, z: v } : { x: v, z: at });
    }
  };
  if (X.loOpen) side(true, X.lo, Z.lo, Z.hi, bz);
  if (X.hiOpen) side(true, X.hi, Z.lo, Z.hi, bz);
  if (Z.loOpen) side(false, Z.lo, X.lo, X.hi, bx);
  if (Z.hiOpen) side(false, Z.hi, X.lo, X.hi, bx);
  return { lines, gates };
}
