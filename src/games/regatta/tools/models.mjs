/**
 * Block Regatta's models, built in code (Node 24, no dependencies), in realistic colours. One
 * block is a metre. Written to `models/`:
 *
 *   node src/games/regatta/tools/models.mjs
 *
 * - `hull_<n>.glb`: an AC75-style foiling monohull's hull in each fleet colour, its crew in their
 *   pods and its T-rudder. Origin at the hull's middle, bow toward -z.
 * - `rig_<n>_<side>.glb`: its mast and square-top main, cambered to port or starboard (the game
 *   swaps them as the boat tacks, and turns them with the boom). Origin at the mast's foot.
 * - `foils_<side>.glb`: the foil arms (the leeward one canted down, the windward one up) and the
 *   jib, for the boom out to starboard or port. In the hull's own space.
 * - `scenery.glb`: the islands (shaped by `islands.ts`, as the boats feel them), palms, rocks, a
 *   lighthouse, the marks, the committee boat and the start line's floats, in world places.
 * - `gust.glb` and `lull.glb`: patches of ripples, for the screens to lay over the water where the
 *   wind is; `wake.glb`, `layline.glb`.
 *
 * The sea itself is the engine's water.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { png, writeGlb } from './voxel.mjs';
import { COMMITTEE, GATE, ISLANDS, LINE_HALF, PIN, WATER_TOP, WINDWARD, islandHeight, palms, reach } from '../islands.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../models');

/** The fleet's colours, in the order `race.ts` lists them. */
export const FLEET = ['#ffd23f', '#e8443a', '#3a7be8', '#2fbf71', '#9b5de5', '#f28c28', '#f2f2f2'];

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a, b, t) => a + (b - a) * t;

// A seeded random, so every build is the same.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/**
 * A mesh of coloured faces. Each colour is a strip of a palette texture (four texels wide, so
 * mipmaps don't bleed), with how much it glows; neighbouring vertices of different colours blend
 * along the palette, which is how the islands' beaches fade into grass.
 */
class Mesh {
  constructor(palette) {
    this.palette = palette;
    this.names = Object.keys(palette);
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.idx = [];
  }
  u(col) {
    const i = this.names.indexOf(col);
    if (i < 0) throw new Error(`no colour ${col}`);
    return (i * 4 + 2) / (this.names.length * 4);
  }
  vert(p, n, col, uv) {
    this.pos.push(...p);
    this.nor.push(...n);
    this.uv.push(...(uv ?? [this.u(col), 0.5]));
    return this.pos.length / 3 - 1;
  }
  /** A triangle facing `out` (its winding turned to match), flat-shaded. */
  tri(a, b, c, col, out) {
    let n = norm(cross(sub(b, a), sub(c, a)));
    if (out && dot(n, out) < 0) {
      [b, c] = [c, b];
      n = mul(n, -1);
    }
    this.idx.push(this.vert(a, n, col), this.vert(b, n, col), this.vert(c, n, col));
  }
  quad(a, b, c, d, col, out) {
    this.tri(a, b, c, col, out);
    this.tri(a, c, d, col, out);
  }
  /**
   * A smooth surface: `at(i, j)` gives each point of a rows × cols grid ({ p, col }), and `out(p)`
   * which way is outward there. Normals from the neighbours, so it shades round.
   */
  grid(rows, cols, at, out, { both = false, keep = () => true } = {}) {
    const P = [];
    for (let i = 0; i < rows; i++) {
      P.push([]);
      for (let j = 0; j < cols; j++) P[i].push(at(i, j));
    }
    const p = (i, j) => P[Math.min(rows - 1, Math.max(0, i))][Math.min(cols - 1, Math.max(0, j))].p;
    const N = P.map((row, i) =>
      row.map((_, j) => {
        let n = norm(cross(sub(p(i, j + 1), p(i, j - 1)), sub(p(i + 1, j), p(i - 1, j))));
        if (!Number.isFinite(n[0]) || Math.hypot(...n) < 0.5) n = norm(out(P[i][j].p));
        return dot(n, out(P[i][j].p)) < 0 ? mul(n, -1) : n;
      }),
    );
    const sides = both ? [1, -1] : [1];
    for (const s of sides) {
      const I = P.map((row, i) => row.map((q, j) => this.vert(q.p, mul(N[i][j], s), q.col, q.uv)));
      for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
          if (!keep(P[i][j].p, P[i + 1][j].p, P[i][j + 1].p, P[i + 1][j + 1].p)) continue;
          const a = I[i][j], b = I[i + 1][j], c = I[i + 1][j + 1], d = I[i][j + 1];
          // Wind each triangle to face its normals' side.
          const geo = norm(cross(sub(P[i + 1][j].p, P[i][j].p), sub(P[i + 1][j + 1].p, P[i][j].p)));
          const want = mul(add(N[i][j], N[i + 1][j + 1]), s);
          if (dot(geo, want) >= 0) this.idx.push(a, b, c, a, c, d);
          else this.idx.push(a, c, b, a, d, c);
        }
      }
    }
  }
  /** A round post from `a` to `b`, radius `r0` to `r1`, smooth round its sides, capped. */
  post(a, b, r0, r1, col, seg = 10, cap = true) {
    const axis = norm(sub(b, a));
    const up = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const s = norm(cross(axis, up));
    const t = cross(s, axis);
    this.grid(
      2,
      seg + 1,
      (i, j) => {
        const ang = (j / seg) * Math.PI * 2;
        const r = i ? r1 : r0;
        const c = i ? b : a;
        return { p: add(c, add(mul(s, Math.cos(ang) * r), mul(t, Math.sin(ang) * r))), col };
      },
      (q) => {
        const along = dot(sub(q, a), axis);
        return sub(q, add(a, mul(axis, along)));
      },
    );
    if (!cap) return;
    for (let j = 0; j < seg; j++) {
      const a0 = (j / seg) * Math.PI * 2, a1 = ((j + 1) / seg) * Math.PI * 2;
      const rim = (c, r, ang) => add(c, add(mul(s, Math.cos(ang) * r), mul(t, Math.sin(ang) * r)));
      this.tri(b, rim(b, r1, a0), rim(b, r1, a1), col, axis);
      this.tri(a, rim(a, r0, a0), rim(a, r0, a1), col, mul(axis, -1));
    }
  }
  /** A box, faces outward. */
  box(x0, y0, z0, x1, y1, z1, col) {
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const f = (pts) => this.quad(...pts, col, sub(pts.reduce((s, q) => add(s, q), [0, 0, 0]).map((v) => v / 4), c));
    f([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]);
    f([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
    f([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]);
    f([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
    f([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
    f([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
  }
  glb(name, { texture, glow, cutout = false } = {}) {
    let albedo, emissive;
    if (texture) {
      albedo = texture;
      emissive = glow ?? null;
    } else {
      const n = this.names.length * 4;
      albedo = { w: n, h: 1, px: new Uint8Array(n * 4) };
      emissive = { w: n, h: 1, px: new Uint8Array(n * 4) };
      this.names.forEach((c, i) => {
        const k = this.palette[c];
        const rgb = hex(k.rgb);
        for (let q = 0; q < 4; q++) {
          albedo.px.set([...rgb, 255], (i * 4 + q) * 4);
          emissive.px.set([...rgb.map((v) => Math.round(v * (k.glow ?? 0))), 255], (i * 4 + q) * 4);
        }
      });
    }
    const mr = { w: 1, h: 1, px: new Uint8Array([0, 235, 0, 255]) };
    const bytes = writeGlb({
      generator: 'Block Regatta src/games/regatta/tools/models.mjs',
      nodes: [{ name, children: [1] }, { name: `${name}_body` }],
      sceneName: name,
      meshName: `${name}_body`,
      meshNode: 1,
      attributes: {
        POSITION: { values: this.pos, componentType: 5126, type: 'VEC3', minmax: true },
        NORMAL: { values: this.nor, componentType: 5126, type: 'VEC3' },
        TEXCOORD_0: { values: this.uv, componentType: 5126, type: 'VEC2' },
      },
      indices: this.idx,
      material: { name, albedo: png(albedo, { alpha: cutout }), mr: png(mr), ...(emissive ? { glow: png(emissive) } : {}), cutout },
      compress: true,
    });
    writeFileSync(join(OUT, `${name}.glb`), bytes);
    console.log(`${name}.glb  ${(bytes.length / 1024).toFixed(0)} KB  ${this.idx.length / 3} triangles`);
  }
}


// ---------------------------------------------------------------------------------------------
// The committee boat's hull (a launch lofted from smooth sections)

/** Its hull's sections: half-beam, sheer (deck edge) and keel heights at t (0 the bow, 1 the stern). */
const beamAt = (t) => 1.2 * (t < 0.55 ? Math.pow(Math.sin((Math.PI / 2) * (t / 0.55)), 0.75) : 1 - 0.2 * ((t - 0.55) / 0.45) ** 2);
const sheerAt = (t) => 0.62 + 0.32 * Math.pow(1 - t, 2.5);
const keelAt = (t) => -0.5 + 0.25 * t;
const LEN = 6;

function hullShape(m, colours, { scale = 1, at = [0, 0, 0] } = {}) {
  const S = (p) => add(mul(p, scale), at);
  const rows = 17;
  const cols = 13;
  const zOf = (t) => -LEN / 2 + LEN * t;
  m.grid(
    rows,
    cols,
    (i, j) => {
      const t = i / (rows - 1);
      const th = (Math.PI * j) / (cols - 1);
      const c = Math.cos(th);
      const x = beamAt(t) * Math.sign(c) * Math.pow(Math.abs(c), 0.7);
      const y = keelAt(t) + (sheerAt(t) - keelAt(t)) * (1 - Math.pow(Math.sin(th), 1.6));
      const col = y > sheerAt(t) - 0.13 ? colours.rail : y > 0.2 ? colours.side : colours.bottom;
      return { p: S([x, y, zOf(t)]), col };
    },
    (q) => {
      const p = mul(sub(q, at), 1 / scale);
      const t = (p[2] + LEN / 2) / LEN;
      return [p[0], p[1] - (sheerAt(t) + keelAt(t)) / 2, t < 0.05 ? -1 : 0];
    },
  );
  // The deck, crowned a little.
  m.grid(
    rows,
    3,
    (i, j) => {
      const t = i / (rows - 1);
      const x = (j - 1) * beamAt(t);
      return { p: S([x, sheerAt(t) - 0.02 + (j === 1 ? 0.05 : 0), zOf(t)]), col: colours.deck };
    },
    () => [0, 1, 0],
  );
  // The transom.
  const tEnd = 1;
  const ring = [];
  for (let j = 0; j < cols; j++) {
    const th = (Math.PI * j) / (cols - 1);
    const c = Math.cos(th);
    ring.push(S([beamAt(tEnd) * Math.sign(c) * Math.pow(Math.abs(c), 0.7), keelAt(tEnd) + (sheerAt(tEnd) - keelAt(tEnd)) * (1 - Math.pow(Math.sin(th), 1.6)), LEN / 2]));
  }
  const mid = S([0, sheerAt(tEnd) - 0.02, LEN / 2]);
  for (let j = 0; j < cols - 1; j++) m.tri(mid, ring[j], ring[j + 1], colours.side, [0, 0, 1]);
}

// An AC75-style foiling monohull, 20 metres: a flat, wide scow hull with a blunt bow and the beam
// carried right aft, a long flat deck with the crew down in their pods, and a T-rudder. Origin at
// the middle of the hull, 0.6 under the waterline's plane when it floats; bow toward -z.
const AC_LEN = 20;
const MAST = 26;
const acBeam = (t) => 2.45 * (0.42 + 0.58 * Math.pow(Math.sin((Math.PI / 2) * Math.min(1, t / 0.6)), 0.7));
const acSheer = (t) => 1.25 + 0.35 * Math.pow(1 - t, 3);
const acKeel = (t) => -0.75 + 0.35 * t * t + 0.5 * Math.pow(1 - t, 6);
const acZ = (t) => -AC_LEN / 2 + AC_LEN * t;

function foiler(colour) {
  const m = new Mesh({
    hull: { rgb: colour, glow: 0.04 },
    stripe: { rgb: '#f2f2f2', glow: 0.04 },
    bottom: { rgb: '#24272c' },
    deck: { rgb: '#3a3e45' },
    pod: { rgb: '#15171a' },
    carbon: { rgb: '#1c1e22' },
    crew: { rgb: '#2b2f36' },
    helmet: { rgb: colour, glow: 0.05 },
    kit: { rgb: '#d9dde2' },
  });
  const rows = 25;
  const cols = 15;
  m.grid(
    rows,
    cols,
    (i, j) => {
      const t = i / (rows - 1);
      const th = (Math.PI * j) / (cols - 1);
      const c = Math.cos(th);
      // Boxy sections: near-vertical topsides turning sharply into a flat, shallow bottom.
      const x = acBeam(t) * Math.sign(c) * Math.pow(Math.abs(c), 0.35);
      const y = acKeel(t) + (acSheer(t) - acKeel(t)) * (1 - Math.pow(Math.sin(th), 4));
      const col = y > acSheer(t) - 0.12 ? 'stripe' : y > 0.15 ? 'hull' : 'bottom';
      return { p: [x, y, acZ(t)], col };
    },
    (q) => {
      const t = (q[2] + AC_LEN / 2) / AC_LEN;
      return [q[0], q[1] - (acSheer(t) + acKeel(t)) / 2, t < 0.04 ? -1 : 0];
    },
  );
  // The deck, nearly flat, a little crowned.
  m.grid(
    rows,
    5,
    (i, j) => {
      const t = i / (rows - 1);
      const k = (j - 2) / 2;
      return { p: [k * acBeam(t), acSheer(t) - 0.02 + 0.08 * (1 - k * k), acZ(t)], col: 'deck' };
    },
    () => [0, 1, 0],
  );
  // The transom: flat and wide.
  const ring = [];
  for (let j = 0; j < cols; j++) {
    const th = (Math.PI * j) / (cols - 1);
    const c = Math.cos(th);
    ring.push([acBeam(1) * Math.sign(c) * Math.pow(Math.abs(c), 0.35), acKeel(1) + (acSheer(1) - acKeel(1)) * (1 - Math.pow(Math.sin(th), 4)), AC_LEN / 2]);
  }
  const mid = [0, acSheer(1) - 0.02, AC_LEN / 2];
  for (let j = 0; j < cols - 1; j++) m.tri(mid, ring[j], ring[j + 1], 'bottom', [0, 0, 1]);

  // The crew's pods, sunk into the deck either side, and the crew in them: helms aft, grinders
  // (cyclors) and trimmers forward of them.
  for (const side of [-1, 1]) {
    m.box(side * 1.95 - 0.45, acSheer(0.6) - 0.25, -3, side * 1.95 + 0.45, acSheer(0.6) + 0.06, 8.6, 'pod');
    for (const [z, tall] of [[-2.2, 0.7], [0, 0.75], [2.2, 0.75], [6.8, 0.95]]) {
      const x = side * 1.95;
      const y = acSheer(0.6) + 0.05;
      m.box(x - 0.24, y, z - 0.2, x + 0.24, y + tall, z + 0.2, 'crew');
      m.box(x - 0.22, y + tall - 0.05, z - 0.23, x + 0.22, y + tall + 0.08, z + 0.23, 'kit');
      m.box(x - 0.15, y + tall + 0.08, z - 0.15, x + 0.15, y + tall + 0.36, z + 0.15, 'helmet');
    }
  }
  // The T-rudder off the transom: a blade down into the water and its elevator.
  m.box(-0.08, -3.4, 8.9, 0.08, acKeel(1), 9.7, 'carbon');
  m.box(-1.3, -3.5, 8.75, 1.3, -3.32, 9.75, 'carbon');
  return m;
}

/**
 * What changes sides with the tack, in the hull's own space: the foil arms (the leeward one canted
 * down with its T-wing deep, the windward one swung up clear) and the jib, sheeted to leeward.
 */
function foilArms(side) {
  const m = new Mesh({
    carbon: { rgb: '#1c1e22' },
    wing: { rgb: '#2a2d33' },
    tip: { rgb: '#c8ccd2', glow: 0.03 },
    sail: { rgb: '#4a4f57', glow: 0.03 },
    panel: { rgb: '#3a3e45', glow: 0.02 },
    band: { rgb: '#eef0f2', glow: 0.04 },
  });
  // The jib: tack at the bow, head up the forestay, clew just aft of the mast (at 0, 1.3, -2).
  const tack = [0, 1.4, -9.6];
  const head = [0, 1.3 + MAST * 0.82, -2.5];
  const clew = [side * 1.1, 1.6, -1.2];
  m.grid(
    14,
    8,
    (i, j) => {
      const v = i / 13;
      const u = j / 7;
      const luff = add(tack, mul(sub(head, tack), v));
      const leech = add(clew, mul(sub(head, clew), v));
      const p = add(luff, mul(sub(leech, luff), u));
      p[0] += side * 0.6 * Math.sin(Math.PI * u) * (1 - v);
      return { p, col: v > 0.9 ? 'band' : Math.floor(v * 6) % 2 ? 'panel' : 'sail' };
    },
    () => [side, 0, 0],
    { both: true },
  );
  const pivot = (s) => [s * 2.3, 0.2, 0.5];
  const wingAt = (at, span, vertical) => {
    // A wing of span `span` across x (or up y when swung up), chord along z, a torpedo bulb in the middle.
    m.post(add(at, [0, 0, -1.4]), add(at, [0, 0, 1.6]), 0.24, 0.12, 'carbon', 10);
    if (vertical) m.box(at[0] - 0.09, at[1] - span / 2, at[2] - 0.35, at[0] + 0.09, at[1] + span / 2, at[2] + 0.55, 'wing');
    else m.box(at[0] - span / 2, at[1] - 0.09, at[2] - 0.35, at[0] + span / 2, at[1] + 0.09, at[2] + 0.55, 'wing');
    const tips = vertical ? [[0, span / 2], [0, -span / 2]] : [[span / 2, 0], [-span / 2, 0]];
    for (const [dx, dy] of tips) m.box(at[0] + dx - 0.1, at[1] + dy - 0.1, at[2] - 0.36, at[0] + dx + 0.1, at[1] + dy + 0.1, at[2] + 0.56, 'tip');
  };
  // Down: straight down and a little out, the wing 4 metres under the hull.
  const down = pivot(side);
  const foot = [side * 3.1, -4.3, 0.5];
  m.post(down, foot, 0.22, 0.18, 'carbon', 8);
  m.box(Math.min(down[0], foot[0]) - 0.05, -4.3, 0.1, Math.max(down[0], foot[0]) + 0.05, -4.2, 0.2, 'carbon');
  wingAt(foot, 4.2, false);
  // Up: swung out and up past the horizontal, its wing standing on end in the air.
  const up = pivot(-side);
  const end = [-side * 6.6, 2.6, 0.5];
  m.post(up, end, 0.22, 0.18, 'carbon', 8);
  wingAt(end, 4.2, true);
  return m;
}

/**
 * The rig, turning with the boom: a wing-section mast and a square-top double-skin main sweeping
 * the deck, cambered to leeward. Origin at the mast's foot; the main runs aft along +z.
 */
function rigFor(colour, side) {
  const m = new Mesh({
    spar: { rgb: '#1c1e22' },
    sail: { rgb: '#4a4f57', glow: 0.03 },
    panel: { rgb: '#3a3e45', glow: 0.02 },
    band: { rgb: colour, glow: 0.06 },
    white: { rgb: '#eef0f2', glow: 0.04 },
  });
  m.post([0, -0.2, 0], [0, MAST, 0], 0.32, 0.12, 'spar', 10);
  const sailGrid = (rows, cols, at) => m.grid(rows, cols, at, () => [side, 0, 0], { both: true });
  // The main: its chord shrinking from 8.5 at the deck to 3 at the square head.
  sailGrid(18, 10, (i, j) => {
    const v = i / 17;
    const u = j / 9;
    const y = 0.15 + v * (MAST - 0.8);
    const chord = 8.6 - 5.6 * Math.pow(v, 1.15);
    const p = [side * 0.85 * Math.sin(Math.PI * Math.pow(u, 0.8)) * (1 - 0.45 * v), y, 0.25 + u * chord];
    const col = v > 0.88 ? 'band' : v > 0.6 && v < 0.66 ? 'band' : u > 0.35 && u < 0.75 && v > 0.3 && v < 0.5 ? 'white' : Math.floor(v * 7) % 2 ? 'panel' : 'sail';
    return { p, col };
  });
  return m;
}

// ---------------------------------------------------------------------------------------------
// Scenery

function scenery() {
  const m = new Mesh({
    seabed: { rgb: '#2f4f52' },
    wetsand: { rgb: '#6f7a62' },
    sand: { rgb: '#d6c49b', glow: 0.03 },
    grass: { rgb: '#5e7f3c', glow: 0.02 },
    grass2: { rgb: '#486a2e', glow: 0.02 },
    scrub: { rgb: '#6f7a45', glow: 0.02 },
    rock: { rgb: '#8d8983', glow: 0.02 },
    rock2: { rgb: '#6e6a64' },
    trunk: { rgb: '#7a5d40' },
    frond: { rgb: '#4b7434', glow: 0.02 },
    coconut: { rgb: '#5a4026' },
    orange: { rgb: '#ff6a13', glow: 0.12 },
    yellow: { rgb: '#ffcc1a', glow: 0.12 },
    white: { rgb: '#f4f5f6', glow: 0.05 },
    red: { rgb: '#d23a30', glow: 0.05 },
    blue: { rgb: '#24508f', glow: 0.03 },
    dark: { rgb: '#2a2f38' },
    pole: { rgb: '#8b7355' },
    lamp: { rgb: '#fff2a8', glow: 1 },
    deck: { rgb: '#b89b72', glow: 0.02 },
  });

  // Islands: hills, beaches fading into grass and scrub, rock on the tops, and the bare rocks.
  for (const isl of ISLANDS) {
    const R = reach(isl);
    const step = isl.rock ? 1.6 : Math.max(3.4, R / 28);
    const n = Math.ceil((R * 2) / step) + 1;
    const x0 = isl.x - R, z0 = isl.z - R;
    const h = (x, z) => islandHeight(isl, x, z);
    m.grid(
      n,
      n,
      (i, j) => {
        const x = x0 + j * step;
        const z = z0 + i * step;
        const y = Math.max(h(x, z), WATER_TOP - 3);
        const above = y - WATER_TOP;
        let col;
        if (isl.rock) col = above < -0.5 ? 'seabed' : above > isl.h * 0.6 ? 'rock' : 'rock2';
        else if (above < -1.2) col = 'seabed';
        else if (above < -0.2) col = 'wetsand';
        else if (above < 0.9) col = 'sand';
        else if (above > isl.h * 0.82) col = 'rock';
        else col = above > isl.h * 0.55 ? 'scrub' : (x * 0.07 + Math.sin(z * 0.05) * 2) % 3 > 1.5 ? 'grass' : 'grass2';
        return { p: [x, y, z], col };
      },
      () => [0, 1, 0],
      { keep: (...q) => q.some((p) => p[1] > WATER_TOP - 2.5) },
    );
  }

  for (const p of palms()) palm(m, p);
  lighthouse(m);

  // The marks: big inflatable racing buoys, banded, a flag on top.
  const buoy = (at, col, tall) => {
    const top = tall ? 67.5 : 65.5;
    m.post([at.x, 61.5, at.z], [at.x, top, at.z], 2.1, 1.7, col, 18);
    m.post([at.x, 64, at.z], [at.x, 64.8, at.z], 2.04, 2.0, 'white', 18, false);
    m.post([at.x, top, at.z], [at.x, top + 4, at.z], 0.1, 0.1, 'dark', 6);
    m.tri([at.x, top + 4, at.z], [at.x, top + 2.8, at.z], [at.x + 2, top + 3.4, at.z], col, [0, 0, 1]);
    m.tri([at.x, top + 4, at.z], [at.x, top + 2.8, at.z], [at.x + 2, top + 3.4, at.z], col, [0, 0, -1]);
  };
  buoy(WINDWARD, 'orange', true);
  buoy(GATE[0], 'yellow', true);
  buoy(GATE[1], 'yellow', true);
  buoy(PIN, 'orange', false);

  // The committee boat: a bigger hull, a cabin, a mast of signal flags.
  const { x: cx, z: cz } = COMMITTEE;
  hullShape(m, { side: 'white', rail: 'blue', deck: 'deck', bottom: 'white' }, { scale: 3, at: [cx, WATER_TOP - 0.9, cz] });
  m.box(cx - 1.9, 65.3, cz - 1.4, cx + 1.9, 67.8, cz + 4.6, 'white');
  m.box(cx - 2.05, 67.8, cz - 1.5, cx + 2.05, 68.2, cz + 4.8, 'blue');
  m.box(cx - 1.92, 66.4, cz - 0.8, cx + 1.92, 67.4, cz + 4, 'dark');
  m.post([cx, 68.2, cz + 1.4], [cx, 75, cz + 1.4], 0.1, 0.07, 'white', 6);
  ['orange', 'yellow', 'blue', 'red'].forEach((c, i) => {
    const y = 74.5 - i * 1.2;
    m.quad([cx, y, cz + 1.5], [cx, y - 0.95, cz + 1.5], [cx, y - 0.95, cz + 2.9], [cx, y, cz + 2.9], c, [1, 0, 0]);
    m.quad([cx, y, cz + 1.5], [cx, y - 0.95, cz + 1.5], [cx, y - 0.95, cz + 2.9], [cx, y, cz + 2.9], c, [-1, 0, 0]);
  });

  // Floats along the start line.
  for (let x = -LINE_HALF + 20; x < LINE_HALF; x += 20) m.post([x, 62.8, 0], [x, 63.45, 0], 0.5, 0.35, 'orange', 10);
  return m;
}

function palm(m, { x, y, z, h, lean, turn }) {
  const dir = [Math.cos(turn), 0, Math.sin(turn)];
  const at = (s) => [x + dir[0] * lean * h * s * s, y + h * s, z + dir[2] * lean * h * s * s];
  const segs = 5;
  for (let i = 0; i < segs; i++) m.post(at(i / segs), at((i + 1) / segs), 0.32 - i * 0.03, 0.29 - i * 0.03, 'trunk', 7, i === segs - 1);
  const top = at(1);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + turn;
    const d = [Math.cos(a), 0, Math.sin(a)];
    const side = [-d[2], 0, d[0]];
    const len = 3.4;
    m.grid(
      6,
      3,
      (i, j) => {
        const s = i / 5;
        const w = 0.55 * Math.sin(Math.PI * Math.min(1, s * 1.15)) * (j - 1);
        const p = add(top, add(mul(d, s * len), mul(side, w)));
        p[1] += 0.6 * s - 1.9 * s * s + (j === 1 ? 0.12 : 0);
        return { p, col: 'frond' };
      },
      () => [0, 1, 0],
      { both: true },
    );
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const c = [top[0] + Math.cos(a) * 0.3, top[1] - 0.35, top[2] + Math.sin(a) * 0.3];
    m.box(c[0] - 0.18, c[1] - 0.18, c[2] - 0.18, c[0] + 0.18, c[1] + 0.18, c[2] + 0.18, 'coconut');
  }
}

/** The lighthouse, on the big island's highest ground. */
export function lighthouseSpot() {
  const isl = ISLANDS[1];
  let best = { x: isl.x, z: isl.z, y: -1 };
  for (let dx = -20; dx <= 20; dx += 2) {
    for (let dz = -20; dz <= 20; dz += 2) {
      const y = islandHeight(isl, isl.x + dx, isl.z + dz);
      if (y > best.y) best = { x: isl.x + dx, z: isl.z + dz, y };
    }
  }
  return best;
}

function lighthouse(m) {
  const { x, y, z } = lighthouseSpot();
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = y - 1 + i * 2.6, y1 = y0 + 2.6;
    m.post([x, y0, z], [x, y1, z], 2.3 - i * 0.22, 2.3 - (i + 1) * 0.22, i % 2 ? 'red' : 'white', 16, false);
  }
  const top = y - 1 + bands * 2.6;
  m.post([x, top, z], [x, top + 0.4, z], 1.9, 1.9, 'dark', 16);
  m.post([x, top + 0.4, z], [x, top + 2.2, z], 0.9, 0.9, 'lamp', 12);
  m.post([x, top + 2.2, z], [x, top + 3.6, z], 1.4, 0.05, 'red', 16);
}

// ---------------------------------------------------------------------------------------------
// The sea

/**
 * A patch of ripples (dark for a gust, pale for a lull) in a unit circle: a scatter of fine curved
 * strokes across the wind (along x), thickest toward the middle, lying flat on the water (so they
 * catch no light of their own). Geometry rather than a cut-out texture, so they stay crisp however
 * low and far you look across the sea.
 */
function ripples(name, colour, strokes) {
  const m = new Mesh({ ripple: { rgb: colour } });
  let made = 0;
  while (made < strokes) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand());
    if (rand() > 1 - r * r * 0.85) continue;
    const cx = Math.cos(a) * r * 0.9;
    const cz = Math.sin(a) * r * 0.9;
    const len = 0.012 + rand() * 0.025 * (1 - r * 0.6);
    const bend = (rand() * 0.5 + 0.3) * len * 0.25;
    const w = 0.0022 + rand() * 0.0018;
    m.grid(
      6,
      2,
      (i, j) => {
        const t = i / 5 - 0.5;
        const taper = Math.sin(Math.PI * (t + 0.5));
        return { p: [cx + t * len, 0, cz + bend * (4 * t * t - 0.5) + (j - 0.5) * w * (0.3 + taper)], col: 'ripple' };
      },
      () => [0, 1, 0],
    );
    made++;
  }
  // A hair of height, so the platform keeps it (a perfectly flat model is dropped).
  m.box(-0.001, 0, -0.001, 0.001, 0.002, 0.001, 'ripple');
  m.glb(name);
}

/**
 * A boat's wake, lying on the water (origin at the boat's middle, bow toward -z): the two arms of
 * the V spreading from the stern quarters, the churned trail straight astern, and the bow wave
 * curling off the stem. Foam white at the boat, fading into the sea's colour behind it.
 */
function wake() {
  const m = new Mesh({ foam: { rgb: '#dfe8ec', glow: 0.06 }, froth: { rgb: '#7f9fb0' }, fade: { rgb: '#2f5d78' } });
  const shade = (s) => (s < 0.18 ? 'foam' : s < 0.45 ? 'froth' : 'fade');
  // A ribbon along a path: `at(s)` its middle (0..1 along), `w(s)` its width, lying flat.
  const ribbon = (at, w, n = 14) =>
    m.grid(
      n + 1,
      2,
      (i, j) => {
        const s = i / n;
        const p = at(s);
        const q = at(Math.min(1, s + 0.01));
        const r = at(Math.max(0, s - 0.01));
        const d = norm([q[0] - r[0], 0, q[2] - r[2]]);
        const side = [-d[2], 0, d[0]];
        return { p: add(p, mul(side, (j - 0.5) * w(s))), col: shade(s) };
      },
      () => [0, 1, 0],
    );
  for (const k of [-1, 1]) {
    // The V: from the stern quarter, out at the Kelvin angle (about 19 degrees), a gentle wobble.
    ribbon((s) => [k * (0.9 + s * 4.2 + Math.sin(s * 9) * 0.12), 0.07 - s * 0.03, 2.6 + s * 12], (s) => 0.22 * (1 - s) + 0.05);
    // The bow wave, peeling off the stem and running aft along the hull.
    ribbon((s) => [k * (0.15 + Math.sin(s * Math.PI * 0.6) * 1.35), 0.12 - s * 0.05, -3.1 + s * 3.4], (s) => 0.55 * Math.sin(Math.PI * Math.min(1, s * 1.2)) + 0.1, 8);
  }
  // The churned trail straight astern.
  ribbon((s) => [Math.sin(s * 7) * 0.2, 0.06 - s * 0.03, 3 + s * 7], (s) => 0.35 * (1 - s * 0.8), 12);
  return m;
}

/**
 * A layline: a dashed line lying on the water, from its origin (the windward mark) out along -z.
 * Sailed close-hauled, a boat on it just fetches the mark; each screen lays two out from the mark.
 */
function layline() {
  const m = new Mesh({ dash: { rgb: '#ffffff', glow: 0.6 } });
  for (let z = 10; z < 900; z += 40) {
    const w = 0.8;
    m.quad([-w, 0.12, -z], [w, 0.12, -z], [w, 0.12, -z - 24], [-w, 0.12, -z - 24], 'dash', [0, 1, 0]);
  }
  // A hair of height, so the platform keeps it (a perfectly flat model is dropped).
  m.box(-0.05, 0.05, -1, 0.05, 0.1, -0.5, 'dash');
  return m;
}

// ---------------------------------------------------------------------------------------------

wake().glb('wake');
layline().glb('layline');
FLEET.forEach((colour, i) => {
  foiler(colour).glb(`hull_${i}`);
  rigFor(colour, 1).glb(`rig_${i}_s`);
  rigFor(colour, -1).glb(`rig_${i}_p`);
});
foilArms(1).glb('foils_s');
foilArms(-1).glb('foils_p');
scenery().glb('scenery');
ripples('gust', '#163049', 1100);
ripples('lull', '#9fbccc', 450);
