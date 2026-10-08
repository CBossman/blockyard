#!/usr/bin/env node
/**
 * Block Royale's models: the five guns (each in five rarities, the rarity's colour in the stripe
 * on the receiver and the magazine, glowing on a Legendary) and the loot (bandage, med kit, shield
 * potion, frag cube, ammo box), built as micro-voxel models and written as binary glTF (`.glb`) to
 * `src/games/blockroyale/models/`. Dependency-free (Node 22+):
 *
 *   node src/games/blockroyale/tools/build.mjs [ids...] [--show]
 *
 * (`--show` prints each model's side view.) The voxel toolkit (`voxel.mjs`, `meshopt.mjs`) is Call of
 * Blocky's, copied here: this game keeps to itself.
 *
 * Conventions (the game's holds rely on them): 1 glTF unit = 1 block = 16 px; a voxel is 0.625 px.
 * A gun's barrel runs along +z, +y is up, and its origin is the middle of the firing fist on the
 * grip. Markers are empty nodes: `grip` (the origin), `grip2` (the support hand), `muzzle`, `sight`
 * (where the eye lines up when aiming: the notch of the rear sight, or a scope's rear lens) and
 * `mag`. Iron sights: the front post's tip is level with the rear notch, and nothing behind
 * the notch stands higher than it, so the eye line is clear. Loot stands upright along +z.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Palette, Voxels, cellOf, faces, atlas, quadCorners, png, writeGlb, DIRS } from './voxel.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../models');
/** A voxel, in px. */
const V = 0.625;

/** The rarities' colours (rarity.ts). */
const RARITY = [
  ['common', 0xb9bec7, 0],
  ['uncommon', 0x5fd35f, 0],
  ['rare', 0x4aa8ff, 0],
  ['epic', 0xb86bff, 0.25],
  ['legendary', 0xffb93b, 0.8],
];

class Model {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.vox = new Voxels();
    this.P = new Palette();
    this.markers = {};
    /** Cell (i, j, k) spans [i-0.5, i+0.5] across x (a gun's axis is the middle of cell 0), [j, j+1] up and [k, k+1] along. */
    this.offset = [-0.5, 0, 0];
  }
  colours(list) {
    for (const [name, [rgb, rough = 0.8, metal = 0, glow = 0]] of Object.entries(list)) this.P.add(name, rgb, { rough, metal, glow, vary: 0 });
    return this;
  }
  /** The cells along y or z whose centres are in [lo, hi) px. */
  span(lo, hi) {
    const f = (v) => Math.ceil(v / V - 0.5 - 1e-9);
    return [f(lo), f(hi)];
  }
  /** A box: `nx` voxels across (odd, centred on the axis), y and z in px; `c` a colour or `(i, j, k) => colour | false | undefined`. */
  box(nx, [y0, y1], [z0, z1], c) {
    const f = typeof c === 'function' ? c : () => c;
    const h = (nx - 1) / 2;
    const [j0, j1] = this.span(y0, y1);
    const [k0, k1] = this.span(z0, z1);
    this.vox.paint('body', [-h, j0, k0], [h + 1, j1, k1], f);
    return this;
  }
  /** Voxels `i0..i1` across (inclusive, from the axis: negative is the gun's right), y and z in px. */
  cols(i0, i1, [y0, y1], [z0, z1], c) {
    const [j0, j1] = this.span(y0, y1);
    const [k0, k1] = this.span(z0, z1);
    this.vox.paint('body', [i0, j0, k0], [i1 + 1, j1, k1], typeof c === 'function' ? c : () => c);
    return this;
  }
  /** A round section along z: radius `r` px about (x, y), from z0 to z1. */
  tube(r, [x, y], [z0, z1], c) {
    const [k0, k1] = this.span(z0, z1);
    for (let k = k0; k < k1; k++)
      for (let j = Math.floor((y - r) / V) - 1; j <= Math.ceil((y + r) / V); j++)
        for (let i = Math.floor((x - r) / V) - 1; i <= Math.ceil((x + r) / V); i++)
          if (Math.hypot(i * V - x, (j + 0.5) * V - y) <= r + 1e-6) {
            const col = typeof c === 'function' ? c(i, j, k) : c;
            if (col === false) this.vox.del('body', i, j, k);
            else if (col) this.vox.set('body', i, j, k, col);
          }
    return this;
  }
  mark(name, p) {
    this.markers[name] = p.map((v) => Math.round(v * 1e4) / 1e4);
    return this;
  }
}

/** The colours every gun shares, and the rarity's own. */
const gunColours = (m, [, rgb, glow]) =>
  m.colours({
    steel: [0x2d3035, 0.45, 0.6],
    dark: [0x1f2124, 0.5, 0.5],
    light: [0x9aa0a8, 0.3, 1],
    poly: [0x24262a, 0.65, 0],
    wood: [0x8a5a2b, 0.6, 0],
    woodDark: [0x6e4723, 0.65, 0],
    glass: [0x9fd8ff, 0.1, 0.2, 0.25],
    acc: [rgb, 0.5, 0.1, glow],
  });

// ---------------------------------------------------------------------------------------------
// The guns

/** Plinker: a compact sidearm: a slide on a raked grip, iron sights. */
function plinker(r) {
  const g = gunColours(new Model(`plinker_${r[0]}`, `${r[0]} Plinker`), r);
  g.box(3, [3.0, 4.9], [-2.4, 8.4], 'steel');
  g.cols(-1, 1, [3.4, 3.9], [-1.5, 3], (i) => (Math.abs(i) === 1 ? 'acc' : false));
  g.box(3, [1.9, 3.0], [-2.0, 6.2], 'dark');
  g.box(1, [3.4, 4.4], [8.4, 9.4], 'dark');
  // The grip, raked back as it goes down.
  for (let y = 1.9 - V; y >= -3.75; y -= V) {
    const z0 = -1.7 - (1.9 - y) * 0.27;
    g.box(3, [y, y + V], [z0, z0 + 3.1], y < -3.1 ? 'acc' : 'poly');
  }
  g.box(1, [1.3, 1.9], [4.4, 5.0], 'dark').box(1, [0.6, 1.2], [1.8, 5.0], 'dark').box(1, [1.3, 2.4], [2.2, 2.8], 'dark');
  // Sights: the notch between two posts at the back, a post at the front, level with it.
  g.cols(-1, -1, [4.9, 5.6], [-2.4, -1.8], 'dark').cols(1, 1, [4.9, 5.6], [-2.4, -1.8], 'dark');
  g.box(1, [4.9, 5.6], [7.7, 8.3], 'dark');
  return g.mark('grip', [0, 0, 0]).mark('grip2', [0, -2, 2]).mark('muzzle', [0, 4.1, 9.4]).mark('sight', [0, 5.25, -2.1]).mark('mag', [0, -3.4, -2.2]);
}

/** Zipper: a boxy machine pistol with a long magazine, a stubby foregrip and a folded stock. */
function zipper(r) {
  const g = gunColours(new Model(`zipper_${r[0]}`, `${r[0]} Zipper`), r);
  g.box(5, [2.4, 5.4], [-3.6, 6.6], 'steel');
  g.cols(-2, 2, [3.6, 4.2], [-2.5, 4.5], (i) => (Math.abs(i) === 2 ? 'acc' : false));
  g.box(3, [3.2, 4.7], [6.6, 10.6], 'dark');
  g.box(3, [1.0, 3.0], [-9.6, -3.6], 'poly');
  g.box(3, [-3.0, 2.4], [-1.4, 1.5], 'poly');
  g.box(3, [-7.6, -3.0], [1.4, 3.7], (i, j) => (j < -11 ? 'acc' : 'dark'));
  g.box(3, [0.2, 2.4], [4.6, 6.4], 'poly');
  g.box(1, [0.6, 1.2], [1.8, 4.6], 'dark').box(1, [1.2, 2.4], [2.2, 2.8], 'dark');
  g.cols(-2, -2, [5.4, 6.2], [-3.4, -2.8], 'dark').cols(2, 2, [5.4, 6.2], [-3.4, -2.8], 'dark');
  g.box(1, [4.7, 5.8], [9.6, 10.2], 'dark');
  return g.mark('grip', [0, 0, 0]).mark('grip2', [0, 0.3, 5.3]).mark('muzzle', [0, 4.0, 10.6]).mark('sight', [0, 5.8, -3.1]).mark('mag', [0, -5.5, 2.5]);
}

/** Trailblazer: an assault rifle: stock, receiver, handguard, a curved magazine and a tall front post. */
function trailblazer(r) {
  const g = gunColours(new Model(`trailblazer_${r[0]}`, `${r[0]} Trailblazer`), r);
  g.box(3, [0.6, 3.6], [-10.2, -4.0], (i, j, k) => (k <= -9.2 ? 'acc' : 'poly'));
  g.box(5, [1.2, 4.6], [-4.0, 6.2], 'steel');
  g.cols(-2, 2, [2.8, 3.4], [-3.0, 5.5], (i) => (Math.abs(i) === 2 ? 'acc' : false));
  g.box(5, [1.8, 4.4], [6.2, 13.2], 'poly');
  g.box(1, [2.6, 3.8], [13.2, 18.0], 'dark');
  g.box(3, [2.2, 4.2], [17.0, 18.6], 'light');
  // A magazine curving forward, and the grip behind the trigger.
  g.box(3, [-1.2, 1.2], [3.2, 5.8], 'dark');
  g.box(3, [-3.8, -1.2], [3.8, 6.4], (i, j) => (j < -4 ? 'acc' : 'dark'));
  g.box(3, [-3.6, 1.2], [-1.4, 1.2], 'poly');
  g.box(1, [0.6, 1.2], [1.8, 4.2], 'dark');
  // Sights: a rear post pair on the back of the receiver and a tall front post, level.
  g.cols(-1, -1, [4.6, 6.2], [-3.8, -3.2], 'dark').cols(1, 1, [4.6, 6.2], [-3.8, -3.2], 'dark');
  g.box(1, [3.8, 6.4], [13.4, 14.0], 'dark');
  return g.mark('grip', [0, 0, 0]).mark('grip2', [0, 1.0, 9.8]).mark('muzzle', [0, 3.2, 18.6]).mark('sight', [0, 6.0, -3.5]).mark('mag', [0, -2.4, 4.4]);
}

/** Boomstick: a pump shotgun: wooden stock and pump, a long barrel with a tube under it, a bead at the end. */
function boomstick(r) {
  const g = gunColours(new Model(`boomstick_${r[0]}`, `${r[0]} Boomstick`), r);
  g.box(3, [0.2, 3.8], [-10.4, -3.4], (i, j, k) => (k <= -9.6 ? 'acc' : 'wood'));
  g.box(3, [-1.6, 2.2], [-3.4, -0.6], 'wood');
  g.box(3, [2.2, 4.6], [-3.4, 4.4], 'steel');
  g.cols(-1, 1, [2.8, 3.3], [-2.4, 3.4], (i) => (Math.abs(i) === 1 ? 'acc' : false));
  g.box(3, [3.1, 4.5], [4.4, 21.0], 'dark');
  g.box(3, [1.8, 3.1], [4.4, 17.0], 'light');
  g.box(5, [1.2, 3.0], [8.4, 13.6], 'woodDark');
  g.box(1, [0.6, 1.4], [1.8, 4.4], 'dark');
  g.cols(-1, -1, [4.6, 5.3], [-2.8, -2.2], 'dark').cols(1, 1, [4.6, 5.3], [-2.8, -2.2], 'dark');
  g.box(1, [4.5, 5.2], [20.2, 20.8], 'light');
  return g.mark('grip', [0, 0, 0]).mark('grip2', [0, 0.4, 11]).mark('muzzle', [0, 3.8, 21]).mark('sight', [0, 4.95, -2.5]).mark('mag', [0, 2.2, 1]);
}

/** Longshot: a bolt-action sniper rifle: a long barrel, a wooden stock, a scope on mounts, a bolt handle. */
function longshot(r) {
  const g = gunColours(new Model(`longshot_${r[0]}`, `${r[0]} Longshot`), r);
  g.box(3, [0.6, 4.4], [-10.6, -3.0], (i, j, k) => (k <= -9.8 ? 'acc' : 'woodDark'));
  g.box(3, [-1.6, 1.8], [-3.0, -0.8], 'woodDark');
  g.box(3, [1.8, 4.8], [-3.0, 5.4], 'steel');
  g.cols(-1, 1, [2.6, 3.2], [-2.0, 4.8], (i) => (Math.abs(i) === 1 ? 'acc' : false));
  g.box(3, [2.7, 4.1], [5.4, 22.0], 'dark');
  g.box(3, [2.3, 4.5], [22.0, 23.4], 'light');
  g.box(3, [-1.4, 1.8], [0.4, 3.0], 'dark');
  // The scope: a tube on two mounts, a bell at the front, lenses at both ends.
  g.box(3, [4.8, 5.4], [-1.0, 0.0], 'dark').box(3, [4.8, 5.4], [3.4, 4.4], 'dark');
  g.tube(1.2, [0, 6.3], [-2.0, 8.6], 'light');
  g.tube(1.9, [0, 6.3], [8.6, 11.2], 'dark');
  g.tube(0.7, [0, 6.3], [-2.0, -1.4], 'glass');
  g.tube(1.4, [0, 6.3], [11.0, 11.4], 'glass');
  // The bolt handle, on the right.
  g.cols(-3, -2, [3.2, 3.8], [-0.5, 0.1], 'light').cols(-3, -3, [2.6, 3.8], [-0.5, 0.1], 'light');
  return g.mark('grip', [0, 0, 0]).mark('grip2', [0, 1.5, 7.0]).mark('muzzle', [0, 3.4, 23.4]).mark('sight', [0, 6.3, -2.0]).mark('mag', [0, 0.2, 1.8]);
}

// ---------------------------------------------------------------------------------------------
// The loot: standing upright along +z, its origin the middle of its base

function loot(id, name, colours, build) {
  const m = new Model(id, name).colours(colours);
  build(m);
  return m.mark('grip', [0, 0, 1]);
}

const bandage = () =>
  loot('bandage', 'Bandage', { gauze: [0xf1ece0, 0.9], band: [0xd9d2c0, 0.9], red: [0xd63a3a, 0.6] }, (m) => {
    m.tube(2.5, [0, 2.5], [0, 3.8], (i, j, k) => (k === 2 ? 'red' : (i + j) % 4 === 0 ? 'band' : 'gauze'));
    m.tube(0.9, [0, 2.5], [0, 3.8], false);
  });

const medkit = () =>
  loot('medkit', 'Med Kit', { shell: [0xe9ecef, 0.6], red: [0xd63a3a, 0.5, 0, 0.15], grey: [0x9aa0a8, 0.5, 0.5] }, (m) => {
    m.box(9, [0, 3.8], [0, 5.6], (i, j, k) => (j >= 5 && ((Math.abs(i) <= 0 && k >= 1 && k <= 7) || (k === 4 && Math.abs(i) <= 2)) ? 'red' : 'shell'));
    m.box(3, [3.8, 4.4], [1.6, 3.8], 'grey');
  });

const shield = () =>
  loot('shield', 'Shield Potion', { glass: [0x9fd8ff, 0.1, 0.1, 0.3], brew: [0x3a86e8, 0.2, 0, 0.9], cork: [0x8a5a2b, 0.8], rim: [0xcfd6dc, 0.3, 0.7] }, (m) => {
    m.tube(2.5, [0, 0], [0, 4.4], (i, j, k) => (k < 3.5 / V ? 'brew' : 'glass'));
    m.tube(1.2, [0, 0], [4.4, 6.9], 'glass');
    m.tube(1.5, [0, 0], [6.9, 7.5], 'rim');
    m.tube(0.9, [0, 0], [7.5, 8.4], 'cork');
  });

const frag = () =>
  loot('frag', 'Frag Cube', { iron: [0x3a3d42, 0.5, 0.7], band: [0xffb93b, 0.4, 0.4, 0.2], pin: [0xcfd6dc, 0.3, 1] }, (m) => {
    m.box(5, [0, 4.4], [0, 4.4], (i, j, k) => (j === 3 ? 'band' : 'iron'));
    m.box(1, [4.4, 5.6], [1.2, 2.4], 'pin');
    m.box(3, [5.6, 6.2], [0.6, 3.1], 'pin');
  });

const ammo = () =>
  loot('ammo', 'Ammo Box', { olive: [0x5c6b3a, 0.8], yellow: [0xf2c230, 0.5, 0, 0.1], dark: [0x2a2d22, 0.7] }, (m) => {
    m.box(9, [0, 4.4], [0, 5.6], (i, j, k) => (j >= 3 && j <= 4 && Math.abs(i) <= 2 ? 'yellow' : 'olive'));
    m.box(5, [4.4, 5.0], [0.6, 5.0], 'dark');
  });

// ---------------------------------------------------------------------------------------------
// Writing

function glb(g) {
  const { faces: list, before } = faces(g.vox, g.P, { merge: true });
  const A = atlas(list, g.P);
  const pos = [], nor = [], uv = [], idx = [];
  list.forEach((f, fi) => {
    const base = pos.length / 3;
    const n = DIRS[f.dir].n;
    quadCorners(f).forEach((c, ci) => {
      pos.push(...c.map((v, a) => ((v + g.offset[a]) * V) / 16));
      nor.push(...n);
      uv.push(Math.round(A.uvs[fi][ci][0] * 65535), Math.round(A.uvs[fi][ci][1] * 65535));
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const markerNames = Object.keys(g.markers);
  const nodes = [
    { name: g.id, children: [1, ...markerNames.map((_, k) => k + 2)], extras: { title: g.name } },
    { name: `${g.id}_body` },
    ...markerNames.map((m) => ({ name: m, translation: g.markers[m].map((v) => Math.round((v / 16) * 1e6) / 1e6) })),
  ];
  const glows = [...g.P.colours.values()].some((c) => c.glow > 0);
  const bytes = writeGlb({
    generator: 'Block Royale src/games/blockroyale/tools/build.mjs',
    nodes,
    sceneName: g.id,
    meshName: `${g.id}_body`,
    meshNode: 1,
    attributes: {
      POSITION: { values: pos, componentType: 5126, type: 'VEC3', minmax: true },
      NORMAL: { values: nor, componentType: 5126, type: 'VEC3' },
      TEXCOORD_0: { values: uv, componentType: 5123, type: 'VEC2', normalized: true },
    },
    indices: idx,
    material: { name: `${g.id}_atlas`, albedo: png(A.albedo), mr: png(A.mr), glow: glows ? png(A.glow, { grey: true }) : null },
  });
  return { bytes, stats: { voxels: g.vox.count, quads: list.length, faces: before } };
}

/** The model from the side (the gun pointing right), for a look: # is a voxel, o the rarity's colour, ~ glass. */
function show(g) {
  const grid = new Map();
  let jMin = Infinity, jMax = -Infinity, kMin = Infinity, kMax = -Infinity;
  for (const p of g.vox.parts.values())
    for (const [key, col] of p) {
      const [, j, k] = cellOf(key);
      grid.set(`${k},${j}`, col);
      [jMin, jMax, kMin, kMax] = [Math.min(jMin, j), Math.max(jMax, j), Math.min(kMin, k), Math.max(kMax, k)];
    }
  const rows = [];
  for (let j = jMax; j >= jMin; j--) {
    let line = '';
    for (let k = kMin; k <= kMax; k++) {
      const c = grid.get(`${k},${j}`);
      line += c ? (c === 'acc' ? 'o' : c === 'glass' ? '~' : '#') : '.';
    }
    rows.push(line);
  }
  console.log([`${g.id} (z ${kMin}..${kMax}, y ${jMin}..${jMax})`, ...rows].join('\n'));
}

const MAKERS = { plinker, zipper, trailblazer, boomstick, longshot };
const ITEMS = { bandage, medkit, shield, frag, ammo };
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const showIt = process.argv.includes('--show');
mkdirSync(OUT, { recursive: true });
const built = [];
for (const [family, make] of Object.entries(MAKERS)) for (const r of RARITY) built.push(make(r));
for (const make of Object.values(ITEMS)) built.push(make());
let total = 0;
for (const g of built) {
  if (want.length && !want.some((w) => g.id === w || g.id.startsWith(`${w}_`))) continue;
  const { bytes, stats } = glb(g);
  writeFileSync(join(OUT, `${g.id}.glb`), bytes);
  total += bytes.length;
  if (showIt) show(g);
  else if (g.id.endsWith('_common') || !g.id.includes('_')) console.log(`${g.id.padEnd(22)} ${String(bytes.length).padStart(6)} bytes  ${stats.voxels} voxels, ${stats.quads} quads`);
}
console.log(`${built.length} models, ${(total / 1024).toFixed(0)} KB`);
