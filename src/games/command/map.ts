import type { ResKind } from './defs';

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

/**
 * Neutral camps: a few wild guards round a relic, a rich steel deposit and an oil well, out on the
 * field. Clear the guards, then hold the relic to have it pay steel.
 */
export const CAMPS: Spot[] = [
  { x: -45, z: 45 },
  { x: 45, z: -45 },
  { x: -62, z: -32 },
  { x: 62, z: 32 },
];

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
}

/** The scrap out on the field: bombed-out houses and burned-out tanks, each worth some steel to whoever strips it. */
const SCRAP: [ 'ruin' | 'henge', number, number][] = [['ruin', -24, 22], ['ruin', 24, -22], ['henge', -52, 24], ['henge', 52, -24], ['ruin', -8, -32], ['ruin', 8, 32], ['henge', -8, 64], ['henge', 8, -64]];

/** A fixed small random (0..1), so every screen and the server agree. */
export function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The deposits: three steel and two oil near each base, and a rich cluster in the middle. */
/** Which way each deposit's model (and a pumpjack's beam on it) faces. */
export const hashYaw = (n: number): number => (n * 2.399) % (Math.PI * 2);

export function deposits(): Deposit[] {
  const out: Deposit[] = [];
  const add = (x: number, z: number, kind: ResKind, amount: number) => out.push({ id: out.length, x, z, kind, amount });
  BASES.forEach((b, i) => {
    // Towards the middle of the map: the way each base faces.
    const dx = -Math.sign(b.x) || 1;
    const dz = -Math.sign(b.z) || 1;
    for (let k = 0; k < 3; k++) add(b.x + dx * (14 + k * 4) + (hash(i, k) - 0.5) * 6, b.z + (k - 1) * 9 + (hash(i, k + 9) - 0.5) * 4, 'steel', 1800);
    for (let k = 0; k < 2; k++) add(b.x + (k ? 11 : -11) * -dx * 0.5 + (hash(i, k + 20) - 0.5) * 3, b.z + dz * (13 + k * 5), 'oil', 1400);
  });
  for (const [x, z, kind] of [[-14, -10, 'steel'], [14, 10, 'steel'], [0, 0, 'oil'], [-12, 14, 'oil'], [12, -14, 'oil'], [0, -22, 'steel'], [0, 22, 'steel']] as [number, number, ResKind][]) add(x, z, kind, 2600);
  for (const c of CAMPS) {
    add(c.x + 7, c.z + 5, 'steel', 3500);
    add(c.x - 7, c.z + 5, 'oil', 2500);
  }
  for (const [scrap, x, z] of SCRAP) {
    if (inLake(x, z, 3) || inMesa(x, z, 3) || inHill(x, z, 1)) continue;
    add(x, z, 'steel', scrap === 'henge' ? 900 : 700);
    out[out.length - 1].scrap = scrap;
  }
  return out;
}

/** Lakes: round pools between the bases that nothing on foot can cross (boats and bridges may come), with a sand shore. */
export const LAKES: { x: number; z: number; r: number }[] = [
  { x: -40, z: -6, r: 15 },
  { x: 40, z: 6, r: 15 },
  { x: 0, z: -50, r: 12 },
  { x: 0, z: 50, r: 12 },
];
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
export const MESAS: { x: number; z: number; r: number; h: number }[] = [
  { x: -24, z: -40, r: 7, h: 3 },
  { x: 24, z: 40, r: 7, h: 3 },
  { x: -56, z: 16, r: 6, h: 4 },
  { x: 56, z: -16, r: 6, h: 4 },
  { x: -28, z: 30, r: 6, h: 3 },
  { x: 28, z: -30, r: 6, h: 3 },
];
export const inMesa = (x: number, z: number, pad = 0) => MESAS.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + pad);

/**
 * Hills: gentle grassy rises in terraces a block high, that anything can walk up. High ground sees
 * further and shoots further, and is harder to hit from below.
 */
export const HILLS: { x: number; z: number; r: number; h: number }[] = [
  { x: -14, z: -24, r: 8, h: 3 },
  { x: 14, z: 24, r: 8, h: 3 },
  { x: -24, z: 56, r: 8, h: 2 },
  { x: 24, z: -56, r: 8, h: 2 },
  { x: -42, z: -40, r: 7, h: 2 },
  { x: 42, z: 40, r: 7, h: 2 },
  { x: -84, z: -6, r: 10, h: 3 },
  { x: 84, z: 6, r: 10, h: 3 },
];
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
export const TREES: Spot[] = (() => {
  const all = deposits();
  const out: Spot[] = [];
  for (let gx = -HALF + 5; gx < HALF - 4; gx += 4.2) {
    for (let gz = -HALF + 5; gz < HALF - 4; gz += 4.2) {
      const x = gx + (hash(gx * 3, gz) - 0.5) * 3;
      const z = gz + (hash(gx, gz * 3) - 0.5) * 3;
      const clump = hash(Math.floor(gx / 16), Math.floor(gz / 16)) > 0.5;
      if (!(clump ? hash(gx, gz) < 0.8 : hash(gx + 7, gz - 3) < 0.04)) continue;
      if (inLake(x, z, 5) || inMesa(x, z, 3) || inHill(x, z, 1) || CAMPS.some((c) => Math.hypot(c.x - x, c.z - z) < 12) || BASES.some((b) => Math.hypot(b.x - x, b.z - z) < 28) || all.some((d) => Math.hypot(d.x - x, d.z - z) < 8)) continue;
      out.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
    }
  }
  return out;
})();

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
