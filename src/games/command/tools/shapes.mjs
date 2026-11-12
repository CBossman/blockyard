/**
 * Block Command's own voxel models, built in code: the modern army (soldiers, engineers, the
 * commander, tanks, artillery, flak, helicopters, gunboats and landing craft, the camps' militia
 * and their armed truck) and the base (headquarters, supply depot, barracks, factory, airfield,
 * research lab, guard tower, bunker and dock), and the field's steel and oil.
 *
 * Each stands on its origin facing +z, a voxel a sixteenth of a unit, as Blockilization's do
 * (`models.mjs` writes them; `models.ts` scales them to the field). The colours `team`,
 * `teamDark` and `teamLight` are the army's: `models.mjs` writes each model once per team.
 */
import { Palette, Voxels } from './voxel.mjs';

// ---------------------------------------------------------------------------------------------
// Colours

export const COLOURS = {
  skin: 0xd9a27a, skin2: 0xa8724e, skin3: 0x7a4e32, hair: 0x3a2618, black: 0x24262a, white: 0xeeece4, offwhite: 0xd8d6cc,
  olive: 0x5c6440, oliveDark: 0x41482c, oliveLight: 0x7a8456, khaki: 0x9a8e62, tan: 0xb49a6a, sand: 0xc8ae78, sandDark: 0xa48a5a,
  steel: 0x6e7782, steelDark: 0x4a5058, steelLight: 0x9aa2aa, gunmetal: 0x3a3e44, tread: 0x2c2e30, rubber: 0x1e2022,
  concrete: 0xbcb8ae, concreteDark: 0x908c84, concreteLight: 0xd4d0c6, asphalt: 0x46484c, asphaltLight: 0x5e6066, paint: 0xe8e4d4, hazard: 0xe8b830,
  glass: 0x84bede, glassDark: 0x3e6280, wood: 0x9a6a3c, woodDark: 0x6a4424, woodLight: 0xb8885a, rust: 0x9a5a34, roofRed: 0xa4473a,
  corrugated: 0x6a7448, corrugatedDark: 0x515a36, navy: 0x6c7682, navyDark: 0x4e5662, hull: 0x7a3a2e, water: 0x3a7ac0,
  canvas: 0xc8bc94, crate: 0xa07a46, crateDark: 0x7a5a32, drum: 0x3a5a8a, drumRed: 0xa83a2a, gold: 0xe8b84a, silver: 0xc8ccd0, green: 0x4a8a3a,
  ore: 0x6a6a72, oreDark: 0x4a4a52, oreGlint: 0xb8c4d0, oil: 0x141618, dirt: 0x8a7656, dirtDark: 0x6a5a40, grass: 0x6a9a3e,
  smokeD: 0x3c3c40, smokeM: 0x76767a, smokeL: 0xb0aea8, smokeS: 0xb8a884, pressed: 0x5a7038,
  solar: 0x2a3a6a, dish: 0xdcdcd4, brick: 0xa4503a, brickDark: 0x7e3a2a, orange: 0xe8742a,
  // Glowing: lit windows, lamps, screens and warning lights.
  lit: 0xffcf6a, lamp: 0xfff2c8, screen: 0x5ad8ff, redLight: 0xff3a2a, greenLight: 0x4aff6a, fire: 0xffa030,
};
const GLOWS = { lit: 0.55, lamp: 0.9, screen: 0.8, redLight: 0.9, greenLight: 0.9, fire: 0.9 };
const METAL = { steel: 0.35, steelDark: 0.35, steelLight: 0.45, gunmetal: 0.5, silver: 0.6, gold: 0.5, oreGlint: 0.5, navy: 0.25, navyDark: 0.25, drum: 0.2, drumRed: 0.2, dish: 0.2 };
const ROUGH = { glass: 0.15, glassDark: 0.2, oil: 0.1, solar: 0.25, water: 0.2, paint: 0.6 };

/** The armies' colours (`defs.ts`'s TEAM_COLORS), and the wild camps' rust. */
export const TEAMS = [0xe8392e, 0x2f86f0, 0xffc83a, 0x45c93a, 0x9b5de5, 0xff8c2a, 0x9a6a3a];
const shade = (rgb, k) => {
  const c = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map((v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))));
  return (c[0] << 16) | (c[1] << 8) | c[2];
};

/** The palette with team `t`'s colours. */
export function palette(t) {
  const P = new Palette();
  for (const [name, hex] of Object.entries(COLOURS)) P.add(name, hex, { rough: ROUGH[name] ?? 0.85, metal: METAL[name] ?? 0, glow: GLOWS[name] ?? 0, vary: 0 });
  P.add('team', TEAMS[t], { rough: 0.7, vary: 0 });
  P.add('teamDark', shade(TEAMS[t], 0.62), { rough: 0.75, vary: 0 });
  P.add('teamLight', shade(TEAMS[t], 1.35), { rough: 0.7, vary: 0 });
  return P;
}

// ---------------------------------------------------------------------------------------------
// A model: one part of voxels, and ways to fill it

export class Model {
  constructor(id) {
    this.id = id;
    this.vox = new Voxels();
  }
  /** Cells [lo, hi) filled with a colour (`false`: emptied). */
  box(lo, hi, c) {
    for (let k = lo[2]; k < hi[2]; k++)
      for (let j = lo[1]; j < hi[1]; j++)
        for (let i = lo[0]; i < hi[0]; i++) {
          if (c === false) this.vox.del('m', i, j, k);
          else this.vox.set('m', i, j, k, c);
        }
    return this;
  }
  /** A box and its mirror across x = 0 (cells [lo, hi) and [-hi, -lo)). */
  mx(lo, hi, c) {
    this.box(lo, hi, c);
    return this.box([-hi[0], lo[1], lo[2]], [-lo[0], hi[1], hi[2]], c);
  }
  set(i, j, k, c) {
    this.vox.set('m', i, j, k, c);
    return this;
  }
  has(i, j, k) {
    return this.vox.filled(i, j, k, 'm');
  }
  /** Recolour the filled cells of a box: `fn(i, j, k, colour)` gives the new colour, or nothing to keep it. */
  paint(lo, hi, fn) {
    for (let k = lo[2]; k < hi[2]; k++)
      for (let j = lo[1]; j < hi[1]; j++)
        for (let i = lo[0]; i < hi[0]; i++) {
          const c = this.vox.get('m', i, j, k);
          if (!c) continue;
          const n = fn(i, j, k, c);
          if (n) this.vox.set('m', i, j, k, n);
        }
    return this;
  }
  /** A cylinder standing on y: centre (x, z) (a cell's corner at whole numbers), radius, from y0 to y1. */
  disc(x, z, r, y0, y1, c) {
    for (let k = Math.floor(z - r); k <= Math.ceil(z + r); k++)
      for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) if ((i + 0.5 - x) ** 2 + (k + 0.5 - z) ** 2 <= r * r) this.box([i, y0, k], [i + 1, y1, k + 1], c);
    return this;
  }
  /** A ring standing on y: radii r0..r1. */
  ring(x, z, r0, r1, y0, y1, c) {
    for (let k = Math.floor(z - r1); k <= Math.ceil(z + r1); k++)
      for (let i = Math.floor(x - r1); i <= Math.ceil(x + r1); i++) {
        const d = (i + 0.5 - x) ** 2 + (k + 0.5 - z) ** 2;
        if (d <= r1 * r1 && d > r0 * r0) this.box([i, y0, k], [i + 1, y1, k + 1], c);
      }
    return this;
  }
  /** A cylinder lying along x (a wheel, a drum on its side): centre (y, z), radius. `hub`: its middle's colour. */
  cylX(x0, x1, y, z, r, c, hub) {
    for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++)
      for (let k = Math.floor(z - r); k <= Math.ceil(z + r); k++) {
        const d = (j + 0.5 - y) ** 2 + (k + 0.5 - z) ** 2;
        if (d <= r * r) this.box([x0, j, k], [x1, j + 1, k + 1], hub && d < (r * 0.45) ** 2 ? hub : c);
      }
    return this;
  }
  /** A cylinder lying along z (a barrel, a smokestack on its side, a hut's arch): centre (x, y), radius. */
  cylZ(z0, z1, x, y, r, c) {
    for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++)
      for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) if ((i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2 <= r * r) this.box([i, j, z0], [i + 1, j + 1, z1], c);
    return this;
  }
  /** Half a ball on y0: centre (x, z), radius. */
  dome(x, y0, z, r, c) {
    for (let j = y0; j <= y0 + Math.ceil(r); j++)
      for (let k = Math.floor(z - r); k <= Math.ceil(z + r); k++)
        for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) if ((i + 0.5 - x) ** 2 + (j + 0.5 - y0) ** 2 + (k + 0.5 - z) ** 2 <= r * r) this.set(i, j, k, c);
    return this;
  }
}

/** A deterministic hash in [0, 1). */
const hash = (a, b = 0, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------------------------------------
// People: a soldier at (x, z) facing +z, 16 voxels tall to the helmet's top.

/**
 * `o`: vest (colour), shirt, legs, skin, helmet ('helmet', 'hardhat', 'beret', 'cap', 'boonie',
 * 'bandana', 'headset'), weapon ('rifle', 'smg', 'launcher', 'pistol', 'wrench', 'binoculars', 'ak'),
 * pack (a backpack's colour), radio (an aerial on the pack), y (raised), kneel.
 */
export function soldier(m, x, z, o = {}) {
  const y = o.y ?? 0;
  const shirt = o.shirt ?? 'olive';
  const vest = o.vest ?? 'team';
  const legs = o.legs ?? 'oliveDark';
  const skin = o.skin ?? 'skin';
  const b = (lo, hi, c) => m.box([lo[0] + x, lo[1] + y, lo[2] + z], [hi[0] + x, hi[1] + y, hi[2] + z], c);
  // Boots and legs (a stride's gap between them). `noLegs`: the body alone, for the field, where each leg swings on its own.
  if (!o.noLegs) {
    b([-3, 0, -1], [-1, 1, 2], 'black');
    b([1, 0, -1], [3, 1, 2], 'black');
    b([-3, 1, -1], [-1, 5, 1], legs);
    b([1, 1, -1], [3, 5, 1], legs);
    b([-3, 3, 0], [-1, 4, 1], o.knee ?? legs);
    b([1, 3, 0], [3, 4, 1], o.knee ?? legs);
  }
  // Body: a shirt under the vest, a belt with pouches.
  b([-3, 5, -2], [3, 10, 2], shirt);
  b([-3, 6, -2], [3, 10, 2], vest);
  b([-3, 5, -2], [3, 6, 2], o.belt ?? 'black');
  b([-2, 5, 2], [-1, 7, 3], 'oliveDark');
  b([1, 5, 2], [2, 7, 3], 'oliveDark');
  if (o.stripe) b([-3, 8, -2], [3, 9, 2], o.stripe);
  // Shoulders and arms; the hands in front, holding the weapon.
  if (!o.noLegs) {
    b([-4, 6, -1], [-3, 10, 1], shirt);
    b([3, 6, -1], [4, 10, 1], shirt);
  }
  b([-4, 9, -1], [-3, 10, 1], vest);
  b([3, 9, -1], [4, 10, 1], vest);
  const w = o.weapon;
  const forward = w === 'rifle' || w === 'smg' || w === 'ak';
  if (o.noLegs) {
    // (The arms and the weapon are models of their own on the field: `arms`, below.)
  } else if (forward) {
    b([3, 7, 1], [4, 8, 3], shirt);
    b([-4, 7, 1], [-3, 8, 4], shirt);
    b([2, 7, 3], [3, 8, 4], skin);
    b([-3, 7, 4], [-2, 8, 5], skin);
  } else {
    b([-4, 5, -1], [-3, 6, 1], skin);
    b([3, 5, -1], [4, 6, 1], skin);
  }
  // Head: face, eyes; a pack behind.
  b([-2, 10, -2], [2, 14, 2], skin);
  b([-1, 12, 1], [0, 13, 2], 'black');
  b([1, 12, 1], [2, 13, 2], 'black');
  b([-2, 10, -2], [2, 11, -1], o.hair ?? 'hair');
  if (o.pack) {
    b([-2, 6, -4], [2, 10, -2], o.pack);
    b([-2, 9, -4], [2, 10, -3], 'oliveDark');
    if (o.radio) b([1, 10, -4], [2, 18, -3], 'black');
  }
  // Headgear.
  const h = o.helmet ?? 'helmet';
  if (h === 'helmet') {
    b([-3, 13, -3], [3, 15, 3], o.helmColour ?? 'olive');
    b([-2, 15, -2], [2, 16, 2], o.helmColour ?? 'olive');
    b([-3, 12, -3], [3, 13, -1], o.helmColour ?? 'olive');
    b([-3, 14, -3], [3, 15, -2], 'oliveDark');
    if (o.goggles) b([-2, 14, 2], [2, 15, 3], 'glassDark');
  } else if (h === 'hardhat') {
    b([-3, 13, -3], [3, 14, 3], 'hazard');
    b([-2, 14, -2], [2, 16, 2], 'hazard');
    b([-1, 16, -1], [1, 16, 2], 'hazard');
    b([-3, 13, 2], [3, 14, 4], 'hazard');
  } else if (h === 'beret') {
    b([-2, 14, -2], [2, 15, 2], o.beretColour ?? 'teamDark');
    b([-3, 14, -2], [-2, 16, 2], o.beretColour ?? 'teamDark');
    b([-2, 15, -2], [1, 16, 2], o.beretColour ?? 'teamDark');
    b([0, 14, 2], [1, 15, 3], 'gold');
    b([-2, 13, -2], [2, 14, -1], 'hair');
  } else if (h === 'cap') {
    b([-2, 14, -2], [2, 16, 2], o.capColour ?? 'olive');
    b([-2, 14, 2], [2, 15, 4], o.capColour ?? 'olive');
  } else if (h === 'boonie') {
    b([-3, 14, -3], [3, 15, 3], 'khaki');
    b([-2, 15, -2], [2, 16, 2], 'khaki');
  } else if (h === 'bandana') {
    b([-2, 14, -2], [2, 15, 2], o.bandColour ?? 'team');
    b([-2, 13, -2], [2, 14, -1], o.bandColour ?? 'team');
    b([-1, 11, -3], [1, 14, -2], o.bandColour ?? 'team');
    // A beard, and a scarf about the neck.
    b([-2, 10, 1], [2, 11, 2], 'hair');
    b([-2, 11, 1], [-1, 12, 2], 'hair');
    b([1, 11, 1], [2, 12, 2], 'hair');
    b([-3, 9, -2], [3, 10, 2], o.bandColour ?? 'team');
  } else if (h === 'headset') {
    b([-2, 14, -2], [2, 15, 2], 'hair');
    b([-3, 11, -1], [-2, 14, 1], 'black');
    b([2, 11, -1], [3, 14, 1], 'black');
    b([-2, 15, -1], [2, 16, 1], 'black');
  }
  // The weapon.
  if (o.noLegs) return m;
  if (w === 'rifle' || w === 'ak') {
    b([1, 7, -1], [2, 9, 3], w === 'ak' ? 'wood' : 'black');
    b([1, 8, 3], [2, 9, 9], 'gunmetal');
    b([1, 6, 4], [2, 8, 5], w === 'ak' ? 'black' : 'gunmetal');
    if (w === 'rifle') b([1, 9, 2], [2, 10, 4], 'black');
  } else if (w === 'smg') {
    b([1, 7, 0], [2, 9, 3], 'black');
    b([1, 8, 3], [2, 9, 6], 'gunmetal');
  } else if (w === 'launcher') {
    // On the right shoulder, pointing ahead: the tube, its sight, the warhead.
    b([3, 10, -5], [5, 12, 6], 'olive');
    b([3, 10, 6], [5, 12, 9], 'oliveDark');
    b([5, 11, 1], [6, 12, 3], 'black');
    b([3, 9, 1], [4, 10, 2], 'black');
    b([3, 10, -6], [5, 12, -5], 'black');
  } else if (w === 'pistol') {
    b([3, 5, 0], [4, 7, 2], 'black');
  } else if (w === 'wrench') {
    b([3, 2, 0], [4, 6, 1], 'steelLight');
    b([3, 1, -1], [4, 2, 2], 'steelLight');
    // A toolbox in the other hand.
    b([-6, 2, -1], [-3, 5, 2], 'drumRed');
    b([-5, 5, 0], [-4, 6, 1], 'black');
  } else if (w === 'binoculars') {
    b([-1, 12, 2], [1, 13, 4], 'black');
    b([-4, 9, 1], [-3, 12, 2], o.shirt ?? 'olive');
    b([3, 9, 1], [4, 12, 2], o.shirt ?? 'olive');
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Vehicles: tracks, wheels

/** A pair of tracks: from z0 to z1 at |x| from xi to xo, height h; road wheels showing. */
function tracks(m, xi, xo, z0, z1, h, o = {}) {
  m.mx([xi, 1, z0], [xo, h, z1], 'tread');
  m.mx([xi, 0, z0 + 1], [xo, 1, z1 - 1], 'tread');
  // The wheels on the outer face, and the sprocket and idler at the ends.
  for (let z = z0 + 2; z < z1 - 2; z += 3) m.mx([xo - 1, 1, z], [xo, 3, z + 2], 'steelDark');
  m.mx([xo - 1, 2, z0], [xo, h - 1, z0 + 1], 'steelDark');
  m.mx([xo - 1, 2, z1 - 1], [xo, h - 1, z1], 'steelDark');
  // Treads' grip on the top run.
  for (let z = z0; z < z1; z += 2) m.mx([xi, h - 1, z], [xo, h, z + 1], 'rubber');
  if (o.skirt) m.mx([xo - 1, h - 2, z0 + 1], [xo, h + 1, z1 - 1], o.skirt);
}

/** Four (or six) wheels along x at |x| from xi to xo. */
function wheels(m, xi, xo, zs, r = 2.2) {
  for (const z of zs) {
    m.cylX(xi, xo, r, z, r, 'rubber', 'steelLight');
    m.cylX(-xo, -xi, r, z, r, 'rubber', 'steelLight');
  }
}

// ---------------------------------------------------------------------------------------------
// The units

/**
 * Camouflage: the cells of colour `base` broken into blotches of `dark` and `light` (a few voxels
 * across, the same on every army's copy), so a hull isn't one flat slab of paint.
 */
function camo(m, base, dark, light, seed = 0, y0 = 0, amount = 0.24) {
  return m.paint([-40, y0, -40], [40, 60, 40], (i, j, k, c) => {
    if (c !== base) return undefined;
    const h = hash((i + 40 + ((k >> 2) & 1)) >> 2, ((j >> 1) + seed) | 0, (k + 40 + ((i >> 2) & 1) * 2) >> 2);
    return h < amount ? dark : h > 0.86 ? light : undefined;
  });
}

const UNITS = [];
const unit = (id, fn) => UNITS.push({ id, build: () => fn(new Model(id)) });
/** Someone on foot: the whole figure (the interface's picture), and `<id>_t`, the body the field draws over its swinging legs. */
const foot = (id, fn) => {
  unit(id, (m) => fn(m, {}));
  unit(`${id}_t`, (m) => fn(m, { noLegs: true }));
};

foot('engineer', (m, x) => soldier(m, 0, 0, { ...x, vest: 'team', shirt: 'khaki', legs: 'steelDark', helmet: 'hardhat', weapon: 'wrench', stripe: 'hazard', pack: 'oliveDark' }));

foot('rifle', (m, x) => soldier(m, 0, 0, { ...x, weapon: 'rifle', pack: 'oliveDark', goggles: true }));

foot('at', (m, x) => soldier(m, 0, 0, { ...x, weapon: 'launcher', pack: 'olive', knee: 'black' }));

foot('hero', (m, x) => {
  soldier(m, 0, 0, { ...x, vest: 'oliveDark', shirt: 'olive', legs: 'oliveDark', helmet: 'beret', weapon: 'binoculars', belt: 'woodDark' });
  // A long coat to the knee, the team's shoulder boards, medals, a sidearm.
  m.box([-3, 3, -2], [3, 6, 2], 'oliveDark');
  m.box([-1, 3, 1], [1, 6, 2], 'olive');
  m.mx([2, 10, -1], [4, 11, 1], 'team');
  m.box([-3, 8, 2], [-1, 9, 3], 'gold');
  m.box([-3, 7, 2], [-2, 8, 3], 'team');
  m.box([-2, 7, 2], [-1, 8, 3], 'redLight');
  m.box([3, 5, 1], [4, 7, 2], 'woodDark');
  // A cape of the team's colour behind.
  m.box([-3, 3, -3], [3, 10, -2], 'teamDark');
  m.box([-3, 3, -3], [3, 4, -2], 'team');
  return m;
});

foot('guard', (m, x) => soldier(m, 0, 0, { ...x, vest: 'tan', shirt: 'team', legs: 'khaki', helmet: 'bandana', bandColour: 'drumRed', weapon: 'ak' }));

unit('scout', (m) => {
  // A dirt bike: two wheels, a frame, the rider low over the bars with a carbine slung.
  m.cylX(-1, 1, 3, 9, 3, 'rubber', 'steelLight');
  m.cylX(-1, 1, 3, -6, 3, 'rubber', 'steelLight');
  m.box([-1, 4, 7], [1, 8, 8], 'steelLight');
  m.box([-1, 8, 6], [1, 9, 8], 'black');
  m.box([-4, 9, 6], [4, 10, 7], 'black');
  m.box([-2, 4, -3], [2, 7, 6], 'team');
  m.box([-2, 6, 3], [2, 8, 6], 'team');
  m.box([-2, 4, -4], [2, 5, 0], 'steelDark');
  m.box([-1, 3, -2], [1, 4, 4], 'gunmetal');
  m.box([2, 3, -6], [3, 5, -2], 'steelLight');
  m.box([-2, 7, -6], [2, 8, -1], 'black');
  m.box([-2, 6, -7], [2, 8, -6], 'teamDark');
  m.box([-1, 7, 8], [1, 8, 9], 'lamp');
  // The rider: legs astride, leaning forward.
  m.mx([2, 4, -1], [3, 8, 2], 'oliveDark');
  m.mx([2, 3, 2], [3, 5, 4], 'black');
  m.box([-3, 8, -2], [3, 13, 2], 'olive');
  m.box([-3, 9, -2], [3, 13, 1], 'team');
  m.mx([3, 10, 0], [4, 11, 6], 'olive');
  m.mx([3, 9, 6], [4, 10, 7], 'skin');
  m.box([-2, 13, -1], [2, 17, 3], 'skin');
  m.box([-1, 15, 2], [0, 16, 3], 'black');
  m.box([1, 15, 2], [2, 16, 3], 'black');
  m.box([-3, 16, -2], [3, 18, 4], 'oliveDark');
  m.box([-2, 15, 3], [2, 16, 4], 'glassDark');
  m.box([-3, 11, -4], [-2, 12, 2], 'gunmetal');
  m.box([-1, 13, -3], [0, 21, -2], 'black');
  return m;
});

// A length of flag: three of these, hinged, ripple.
unit('cloth', (m) => m.box([0, -3, 0], [3, 2, 1], 'team').box([0, -1, 0], [3, 0, 1], 'white'));

/** A tank: `hull` or `gun` alone (the field draws them apart, the turret turning on the hull), or the whole of it. */
const tank = (m, part) => {
  if (part !== 'gun') {
  // Hull: low, its glacis sloping up to the front; tracks with skirts.
  tracks(m, 5, 8, -14, 15, 5, { skirt: 'olive' });
  m.box([-5, 2, -14], [5, 7, 14], 'olive');
  m.box([-8, 6, -14], [8, 8, 13], 'olive');
  m.box([-8, 6, 13], [8, 7, 15], 'olive');
  m.box([-7, 5, 14], [7, 6, 16], 'oliveDark');
  m.mx([4, 7, 11], [6, 8, 13], 'lamp');
  // Engine deck: grilles behind; stowage boxes and an exhaust.
  for (let z = -13; z < -6; z += 2) m.box([-5, 8, z], [5, 9, z + 1], 'oliveDark');
  m.mx([6, 8, -13], [8, 10, -5], 'oliveDark');
  m.box([-4, 8, -14], [4, 9, -13], 'gunmetal');
  m.mx([7, 4, -15], [8, 7, -14], 'redLight');
  // The army's colour where it shows from above: the stowage boxes, a band across the front.
  m.mx([6, 9, -13], [8, 10, -5], 'team');
  m.box([-8, 7, 9], [8, 8, 11], 'team');
  m.box([-8, 7, -14], [8, 8, -13], 'teamDark');
  camo(m, 'olive', 'oliveDark', 'oliveLight', 1);
  }
  if (part === 'hull') return m;
  // Turret: wide and flat, its cheeks angled; the team's panel on each side.
  m.box([-6, 8, -6], [6, 12, 7], 'olive');
  m.box([-5, 8, 7], [5, 11, 9], 'olive');
  m.box([-4, 8, 9], [4, 10, 10], 'olive');
  m.box([-6, 8, -9], [6, 11, -6], 'oliveDark');
  m.mx([6, 9, -4], [7, 11, 4], 'team');
  m.box([-6, 12, -6], [6, 13, -5], 'team');
  // The gun: a mantlet, a long barrel with its fume extractor and muzzle.
  m.box([-2, 9, 9], [2, 12, 12], 'oliveDark');
  m.box([-1, 10, 12], [1, 11, 30], 'olive');
  m.box([-1, 9, 20], [1, 12, 23], 'oliveDark');
  m.box([-1, 10, 29], [1, 11, 31], 'gunmetal');
  // Hatches, a machine gun on the commander's, a sight, aerials.
  m.box([1, 12, -3], [5, 14, 1], 'oliveDark');
  m.box([2, 14, -2], [4, 15, 0], 'gunmetal');
  m.box([3, 15, -1], [4, 16, 6], 'gunmetal');
  m.box([-4, 12, 1], [-2, 14, 3], 'glassDark');
  m.box([-5, 12, -2], [-2, 13, 0], 'oliveDark');
  m.box([-5, 12, -5], [-4, 22, -4], 'black');
  // The turret's roof in the army's colour, edged darker, a pale recognition stripe across it.
  m.paint([-6, 11, -9], [6, 12, 9], (i, j, k, c) => (c !== 'olive' ? undefined : Math.abs(i) >= 5 || k <= -6 || k >= 6 ? 'teamDark' : k === 3 || k === 4 ? 'teamLight' : 'team'));
  m.box([-6, 10, -9], [6, 11, -6], 'teamDark');
  camo(m, 'olive', 'oliveDark', 'oliveLight', 2);
  return m;
};
unit('tank', (m) => tank(m));
unit('tank_h', (m) => tank(m, 'hull'));
unit('tank_g', (m) => tank(m, 'gun'));

unit('artillery', (m) => {
  // A self-propelled gun: a long hull, its big turret set back, a very long barrel raised high.
  tracks(m, 5, 8, -16, 15, 5, { skirt: 'tan' });
  m.box([-5, 2, -16], [5, 7, 15], 'tan');
  m.box([-8, 6, -16], [8, 8, 15], 'tan');
  m.box([-7, 5, 15], [7, 7, 16], 'sandDark');
  m.box([-6, 8, 6], [6, 9, 14], 'sandDark');
  m.box([-6, 8, 12], [-3, 10, 14], 'glassDark');
  m.box([3, 8, 12], [6, 10, 14], 'glassDark');
  m.mx([4, 7, 14], [6, 8, 15], 'lamp');
  // The turret: boxy, the team's band; a hatch; ammunition racks behind.
  m.box([-7, 8, -15], [7, 15, 4], 'tan');
  m.box([-7, 13, -15], [7, 14, 4], 'team');
  m.box([-6, 15, -12], [6, 16, 2], 'team');
  m.box([-6, 15, -12], [6, 16, -11], 'teamDark');
  m.box([-6, 15, 1], [6, 16, 2], 'teamDark');
  m.box([-6, 15, -2], [6, 16, 0], 'teamLight');
  m.box([-5, 15, -8], [-1, 17, -4], 'tan');
  m.box([-7, 8, -17], [7, 12, -15], 'sandDark');
  m.box([2, 15, -10], [4, 18, -8], 'gunmetal');
  // The barrel climbs from the mantlet at 30 degrees: a step up every two.
  m.box([-3, 9, 4], [3, 14, 7], 'sandDark');
  for (let i = 0; i < 24; i++) m.box([-1, 12 + Math.floor(i / 2), 7 + i], [1, 14 + Math.floor(i / 2), 8 + i], i > 19 ? 'sandDark' : 'tan');
  m.box([-2, 23, 29], [2, 26, 32], 'gunmetal');
  // Spades folded at the back.
  m.mx([4, 2, -18], [7, 6, -16], 'steelDark');
  m.box([-8, 7, 9], [8, 8, 11], 'team');
  camo(m, 'tan', 'sandDark', 'sand', 3);
  return m;
});

unit('aa', (m) => {
  // A tracked flak gun: twin cannons, a radar dish turning on its mast.
  tracks(m, 4, 7, -12, 12, 5);
  m.box([-4, 2, -12], [4, 7, 12], 'olive');
  m.box([-7, 6, -12], [7, 8, 11], 'olive');
  m.box([-6, 6, 11], [6, 7, 13], 'oliveDark');
  m.box([-5, 8, 4], [-1, 10, 10], 'oliveDark');
  m.box([-5, 8, 9], [-1, 10, 10], 'glassDark');
  m.mx([4, 7, 11], [6, 8, 12], 'lamp');
  // Turret: a drum, the team's ring, the guns either side.
  m.disc(0, -2, 5.5, 8, 13, 'olive');
  m.ring(0, -2, 4.5, 5.5, 11, 12, 'team');
  m.mx([5, 9, -4], [7, 13, 3], 'oliveDark');
  for (const x of [5, -7]) {
    m.box([x, 11, 3], [x + 2, 12, 17], 'gunmetal');
    m.box([x, 10, 9], [x + 2, 11, 10], 'gunmetal');
    m.box([x, 11, 16], [x + 2, 12, 18], 'black');
  }
  m.box([-2, 13, -5], [2, 15, 0], 'oliveDark');
  // The radar's mast (the dish is its own model, turned by the screen: `radar`).
  m.box([0, 13, -7], [1, 20, -6], 'steelDark');
  // The drum's top and a band across the front in the army's colour.
  m.paint([-6, 12, -8], [6, 13, 4], (i, j, k, c) => (c === 'olive' ? 'team' : undefined));
  m.box([-7, 7, 7], [7, 8, 9], 'team');
  m.box([-7, 7, -12], [7, 8, -11], 'teamDark');
  camo(m, 'olive', 'oliveDark', 'oliveLight', 4);
  return m;
});

unit('heli', (m) => {
  // An attack helicopter: a slim body, two seats under one canopy, stub wings with rocket pods,
  // a long boom to a fin and tail rotor. The main rotor is its own model, spun by the screen.
  m.box([-3, 2, -6], [3, 9, 10], 'olive');
  m.box([-2, 2, 10], [2, 8, 14], 'olive');
  m.box([-1, 3, 14], [1, 6, 16], 'oliveDark');
  m.box([-2, 9, -4], [2, 11, 4], 'oliveDark');
  // The canopy: two steps of glass.
  m.box([-2, 6, 4], [2, 10, 11], 'glass');
  m.box([-2, 8, 0], [2, 11, 4], 'glass');
  m.box([-2, 6, 6], [2, 10, 7], 'oliveDark');
  m.box([-3, 2, -6], [3, 3, 10], 'oliveDark');
  // The team's band; the nose gun under it.
  m.mx([3, 4, -3], [4, 7, 3], 'team');
  m.box([-1, 0, 11], [1, 2, 13], 'gunmetal');
  m.box([0, 0, 13], [1, 1, 18], 'gunmetal');
  // Stub wings and pods.
  m.mx([3, 5, -1], [9, 6, 3], 'oliveDark');
  m.mx([6, 2, -2], [9, 5, 5], 'steelDark');
  m.mx([6, 3, 5], [9, 4, 6], 'black');
  m.mx([9, 3, 0], [10, 5, 2], 'gunmetal');
  // The engines; the boom; the fin, the tail planes, the tail rotor.
  m.mx([2, 9, -6], [4, 11, 0], 'steelDark');
  m.mx([2, 9, -7], [4, 10, -6], 'black');
  m.box([-1, 6, -24], [1, 9, -6], 'olive');
  m.box([-1, 7, -24], [1, 8, -18], 'team');
  m.box([-1, 9, -26], [1, 16, -22], 'olive');
  m.box([-5, 7, -21], [5, 8, -19], 'oliveDark');
  m.box([-1, 15, -24], [1, 16, -23], 'redLight');
  // Skids and the rotor's mast.
  m.mx([3, 0, -4], [4, 1, 8], 'gunmetal');
  m.mx([3, 1, -2], [4, 2, -1], 'gunmetal');
  m.mx([3, 1, 5], [4, 2, 6], 'gunmetal');
  m.box([-1, 11, -1], [1, 14, 1], 'gunmetal');
  // The army's colour on the spine, the wing tips and the fin.
  m.box([-2, 10, -4], [2, 11, 0], 'team');
  m.mx([8, 5, -1], [9, 6, 3], 'team');
  m.box([-1, 12, -26], [1, 15, -22], 'team');
  m.box([-1, 8, -18], [1, 9, -6], 'teamDark');
  camo(m, 'olive', 'oliveDark', 'oliveLight', 5);
  return m;
});

unit('brute', (m) => {
  // The camps' technical: a battered pickup, a heavy machine gun on a post in its bed.
  wheels(m, 6, 8, [8, -7], 2.6);
  m.box([-6, 2, -12], [6, 5, 14], 'team');
  m.box([-7, 3, 12], [7, 5, 15], 'black');
  m.box([-6, 5, 2], [6, 7, 14], 'team');
  m.box([-6, 5, -12], [6, 7, 2], 'teamDark');
  m.box([-5, 3, -11], [5, 6, 1], 'woodDark');
  m.box([-6, 7, -5], [6, 13, 3], 'team');
  m.box([-5, 9, 2], [5, 12, 3], 'glassDark');
  m.box([-6, 9, -5], [6, 12, -4], 'glassDark');
  m.mx([6, 9, -3], [7, 12, 1], 'glassDark');
  m.box([-6, 13, -5], [6, 14, 3], 'teamDark');
  m.mx([4, 5, 14], [6, 6, 15], 'lamp');
  m.box([-4, 4, 15], [4, 5, 16], 'steelDark');
  m.paint([-7, 2, -13], [7, 14, 16], (i, j, k, c) => (c.startsWith('team') && hash(i, j, k) < 0.18 ? 'rust' : undefined));
  // The gun: post, cradle, barrel, a shield; sandbags and a crate in the bed.
  m.box([-1, 6, -8], [1, 13, -6], 'gunmetal');
  m.box([-2, 13, -10], [2, 15, -4], 'gunmetal');
  m.box([-1, 14, -4], [1, 15, 8], 'black');
  m.box([-1, 14, 8], [1, 15, 9], 'gunmetal');
  m.box([-3, 13, -3], [3, 17, -2], 'steelDark');
  m.box([-5, 6, -12], [-2, 8, -9], 'sand');
  m.box([2, 6, -12], [5, 8, -9], 'sand');
  m.box([3, 6, -2], [5, 8, 1], 'crate');
  m.box([2, 10, -4], [3, 18, -3], 'black');
  m.box([3, 15, -4], [7, 18, -3], 'teamLight');
  return m;
});

unit('gunboat', (m) => {
  // A patrol boat: a sharp bow, grey hull, the team's stripe, a wheelhouse amidships, a gun
  // forward and a machine gun aft, a mast with a radar.
  const half = (z) => (z > 10 ? Math.max(1, Math.round(7 - (z - 10) * 0.5)) : 7);
  for (let z = -16; z < 22; z++) {
    const w = half(z);
    m.box([-w, 0, z], [w, 4, z + 1], 'navy');
    m.box([-w, 0, z], [w, 1, z + 1], 'hull');
    m.box([-w, 3, z], [w, 4, z + 1], 'team');
    m.box([-w + 1, 4, z], [w - 1, 5, z + 1], 'woodLight');
    m.box([-w, 4, z], [-w + 1, 6, z + 1], 'navyDark');
    m.box([w - 1, 4, z], [w, 6, z + 1], 'navyDark');
  }
  // The wheelhouse: windows all round, a roof with a lamp.
  m.box([-5, 5, -4], [5, 12, 6], 'navy');
  m.box([-5, 9, -4], [5, 11, 6], 'glassDark');
  m.box([-4, 9, 5], [4, 11, 6], 'glass');
  m.box([-6, 12, -5], [6, 13, 7], 'teamDark');
  m.box([-5, 12, -4], [5, 13, 6], 'team');
  m.box([-1, 13, -2], [1, 24, 0], 'steelDark');
  m.box([-4, 21, -2], [4, 22, 0], 'steelDark');
  m.box([-3, 22, -3], [3, 24, 1], 'dish');
  m.box([0, 24, -1], [1, 25, 0], 'redLight');
  m.box([-1, 13, 4], [1, 14, 6], 'lamp');
  m.box([-1, 18, -1], [1, 20, -1], 'team');
  m.box([1, 17, -1], [6, 20, 0], 'team');
  // The deck gun: a round base, a turret, a barrel over the bow.
  m.disc(0, 13, 3, 5, 7, 'navyDark');
  m.box([-2, 7, 11], [2, 10, 16], 'navy');
  m.box([-1, 8, 16], [1, 9, 25], 'gunmetal');
  // Aft: a gun on a pintle, life rings, a wake rail.
  m.box([-1, 5, -12], [1, 9, -10], 'gunmetal');
  m.box([-1, 9, -12], [1, 10, -5], 'black');
  m.box([-6, 5, -16], [6, 7, -15], 'navyDark');
  m.mx([6, 5, 0], [7, 7, 2], 'drumRed');
  m.mx([6, 6, 0], [7, 7, 1], 'white');
  return m;
});

unit('transport', (m) => {
  // A landing craft: a flat box, its well deck open, the ramp at the bow, the wheelhouse aft.
  m.box([-8, 0, -16], [8, 6, 18], 'navy');
  m.box([-8, 0, -16], [8, 1, 18], 'hull');
  m.box([-8, 5, -16], [8, 6, 18], 'navyDark');
  m.box([-8, 4, -16], [8, 5, 18], 'team');
  m.box([-6, 2, -6], [6, 6, 16], false);
  m.box([-6, 2, -6], [6, 3, 16], 'steelDark');
  // The ramp: raised, its hinge, its chains.
  m.box([-7, 1, 18], [7, 9, 20], 'navyDark');
  m.box([-6, 8, 19], [6, 9, 20], 'hazard');
  m.mx([6, 6, 16], [7, 10, 17], 'gunmetal');
  // The wheelhouse aft, its gun tubs.
  m.box([-6, 6, -16], [6, 13, -8], 'navy');
  m.box([-6, 10, -8], [6, 12, -7], 'glassDark');
  m.box([-5, 10, -9], [5, 12, -8], 'glass');
  m.box([-7, 13, -17], [7, 14, -6], 'teamDark');
  m.box([-6, 13, -16], [6, 14, -7], 'team');
  m.box([-1, 14, -14], [1, 21, -12], 'steelDark');
  m.box([0, 21, -13], [1, 22, -12], 'redLight');
  m.box([1, 17, -13], [6, 20, -12], 'team');
  m.mx([5, 6, -5], [8, 8, -2], 'navyDark');
  m.mx([6, 8, -4], [7, 9, 1], 'black');
  return m;
});

// The rotor (the screen spins it over the helicopter), the flak tank's radar dish (it turns on
// its mast); the loads an engineer carries.
const PLAIN = [];
const plain = (id, fn) => PLAIN.push({ id, build: () => fn(new Model(id)) });
plain('rotor', (m) => {
  m.box([-1, 0, -1], [1, 1, 1], 'gunmetal');
  m.box([-24, 0, -1], [24, 1, 1], 'black');
  m.box([-1, 0, -24], [1, 1, 24], 'black');
  m.box([-24, 0, -1], [-21, 1, 1], 'hazard');
  m.box([21, 0, -1], [24, 1, 1], 'hazard');
  m.box([-1, 0, -24], [1, 1, -21], 'hazard');
  m.box([-1, 0, 21], [1, 1, 24], 'hazard');
  return m;
});
// Arms and what they hold, each set as the field draws it: the shoulders at y = 9, where it turns.
const armsAhead = (m, c) => m.box([3, 6, -1], [4, 9, 1], c).box([-4, 6, -1], [-3, 9, 1], c).box([3, 7, 1], [4, 8, 3], c).box([-4, 7, 1], [-3, 8, 4], c).box([2, 7, 3], [3, 8, 4], 'skin').box([-3, 7, 4], [-2, 8, 5], 'skin');
plain('arms_rifle', (m) => armsAhead(m, 'olive').box([1, 7, -1], [2, 9, 3], 'black').box([1, 8, 3], [2, 9, 10], 'gunmetal').box([1, 6, 4], [2, 8, 5], 'gunmetal').box([1, 9, 2], [2, 10, 4], 'black'));
plain('arms_ak', (m) => armsAhead(m, 'wood').box([1, 7, -1], [2, 9, 3], 'wood').box([1, 8, 3], [2, 9, 10], 'gunmetal').box([1, 6, 4], [2, 8, 6], 'black'));
plain('arms_at', (m) => m.box([3, 6, -1], [4, 9, 1], 'olive').box([-4, 6, -1], [-3, 9, 1], 'olive').box([-4, 8, 1], [-3, 10, 4], 'olive').box([-3, 9, 3], [3, 10, 4], 'skin')
  .box([3, 10, -5], [5, 12, 6], 'olive').box([3, 10, 6], [5, 12, 9], 'oliveDark').box([5, 11, 1], [6, 12, 3], 'black').box([3, 9, 1], [4, 10, 2], 'black').box([3, 10, -6], [5, 12, -5], 'black'));
// A sledgehammer and the arm that swings it; the toolbox and the other.
plain('arm_e_r', (m) => m.box([3, 6, -1], [4, 9, 1], 'khaki').box([3, 5, -1], [4, 6, 1], 'skin').box([3, 0, 0], [4, 5, 1], 'woodLight').box([3, -3, -2], [4, 0, 3], 'steelLight'));
plain('arm_e_l', (m) => m.box([-4, 6, -1], [-3, 9, 1], 'khaki').box([-4, 5, -1], [-3, 6, 1], 'skin').box([-6, 2, -1], [-3, 5, 2], 'drumRed').box([-5, 5, 0], [-4, 6, 1], 'black'));
plain('arm_h_r', (m) => m.box([3, 6, -1], [4, 9, 1], 'olive').box([3, 5, -1], [4, 6, 1], 'skin').box([3, 4, 0], [4, 6, 3], 'black'));
plain('arm_h_l', (m) => m.box([-4, 6, -1], [-3, 9, 1], 'olive').box([-4, 5, -1], [-3, 6, 1], 'skin'));
// What turns on the buildings and the helicopter (each about its own origin).
plain('tail_rotor', (m) => m.box([0, -4, -1], [1, 4, 0], 'black').box([0, -1, -4], [1, 0, 3], 'black').box([0, -4, -1], [1, -3, 0], 'hazard').box([0, 3, -1], [1, 4, 0], 'hazard'));
plain('hq_dish', (m) => m.box([-7, 0, -2], [7, 1, 2], 'dish').box([-5, 1, -3], [5, 3, -2], 'dish').box([-5, -1, 2], [5, 0, 3], 'dish').box([-1, 0, 2], [1, 1, 5], 'steelDark').box([-1, 1, 4], [1, 2, 5], 'redLight'));
plain('tower_gun', (m) => m.box([-1, 0, 0], [1, 2, 4], 'gunmetal').box([0, 1, 4], [1, 2, 11], 'black').box([-1, 0, 3], [1, 1, 4], 'black')
  // The gunner behind it.
  .box([-3, -3, -5], [3, 2, -1], 'olive').box([-2, 2, -4], [2, 5, -1], 'skin').box([-3, 5, -5], [3, 7, 0], 'olive').box([-4, 0, -2], [-3, 1, 2], 'olive').box([3, 0, -2], [4, 1, 2], 'olive'));
plain('tower_lamp', (m) => m.box([-2, 0, -2], [1, 3, 1], 'steelDark').box([-2, 0, 1], [1, 3, 2], 'lamp'));
plain('pump', (m) => m.box([-1, 0, -7], [1, 2, 6], 'drumRed').box([-1, -2, 5], [1, 3, 8], 'drumRed').box([0, -11, 6], [1, -2, 7], 'black').box([-1, -5, -6], [1, 0, -5], 'steelDark').box([-1, 2, -1], [1, 3, 1], 'hazard'));
plain('sock', (m) => m.box([0, -1, 0], [2, 2, 1], 'orange').box([2, -1, 0], [4, 1, 1], 'white').box([4, -1, 0], [6, 1, 1], 'orange').box([6, 0, 0], [8, 1, 1], 'white'));
plain('rocket', (m) => m.box([-1, -1, -5], [1, 1, 4], 'offwhite').box([-1, -1, 4], [1, 1, 6], 'drumRed').box([-2, 0, -5], [2, 1, -3], 'steelDark').box([0, -2, -5], [1, 2, -3], 'steelDark'));
plain('jet', (m) => {
  // A strike jet, seen from below as it goes over: fuselage, swept wings, twin tails.
  m.box([-2, 2, -22], [2, 6, 16], 'steelLight').box([-1, 3, 16], [1, 5, 24], 'steel').box([-1, 6, 6], [1, 8, 14], 'glassDark');
  for (let i = 0; i < 16; i++) m.mx([2 + i, 3, Math.round(-8 - i * 0.7)], [3 + i, 4, Math.round(6 - i * 0.9)], 'steel');
  m.mx([2, 6, -22], [3, 14, -14], 'steelDark');
  for (let i = 0; i < 6; i++) m.mx([3 + i, 3, -22], [4 + i, 4, Math.round(-15 - i * 0.6)], 'steelDark');
  m.mx([1, 2, -24], [3, 6, -22], 'black');
  m.mx([9, 1, -6], [11, 3, 6], 'gunmetal');
  m.mx([15, 2, -14], [16, 4, -6], 'redLight');
  return m;
});
plain('bird', (m) => m.box([-1, 0, -3], [1, 2, 4], 'white').box([-1, 1, 4], [1, 2, 6], 'hazard').box([-1, 0, -6], [1, 1, -3], 'canvas'));
plain('wing_r', (m) => m.box([1, 0, -2], [6, 1, 3], 'white').box([6, 0, -2], [11, 1, 2], 'concreteLight').box([11, 0, -2], [13, 1, 1], 'black'));
plain('wing_l', (m) => m.box([-6, 0, -2], [-1, 1, 3], 'white').box([-11, 0, -2], [-6, 1, 2], 'concreteLight').box([-13, 0, -2], [-11, 1, 1], 'black'));
// A puff, of smoke or fire: a rough ball of voxels, swelled and shrunk by the screen.
for (const [id, c] of [['d', 'smokeD'], ['m', 'smokeM'], ['l', 'smokeL'], ['s', 'smokeS'], ['o', 'orange'], ['f', 'fire'], ['y', 'lamp']]) {
  plain(`puff_${id}`, (m) => {
    for (let i = -8; i < 8; i++) for (let j = -8; j < 8; j++) for (let k = -8; k < 8; k++) {
      // (In chunky steps of two voxels, the surface a little lumpy.)
      const a = (i >> 1) * 2 + 1;
      const b = (j >> 1) * 2 + 1;
      const e = (k >> 1) * 2 + 1;
      if (Math.hypot(a, b, e) + hash(a, b, e) * 2.4 < 8) m.set(i, j, k, c);
    }
    return m;
  });
}
// What a blast throws: lumps of hull, of concrete, of earth.
plain('chunk_m', (m) => m.box([-2, -1, -2], [2, 1, 2], 'steelDark').box([-1, 1, -2], [2, 2, 0], 'rust').box([-3, -1, 0], [-2, 0, 2], 'gunmetal'));
plain('chunk_c', (m) => m.box([-3, -2, -2], [3, 2, 2], 'concreteDark').box([-2, 2, -1], [2, 3, 2], 'concrete').box([1, -3, -2], [3, -2, 1], 'brickDark'));
plain('chunk_e', (m) => m.box([-2, -2, -2], [2, 2, 2], 'dirtDark').box([-1, 2, -1], [2, 3, 1], 'dirt'));
// A leg: boot and trouser, the hip at the top of it (y = 5), for each kind of trousers.
const leg = (m, c) => m.box([-1, 0, -1], [1, 1, 2], 'black').box([-1, 1, -1], [1, 5, 1], c);
plain('leg', (m) => leg(m, 'oliveDark'));
plain('leg_e', (m) => leg(m, 'steelDark'));
plain('leg_w', (m) => leg(m, 'khaki'));
// A burn on the ground, ragged at its edge, a voxel thick.
plain('scorch', (m) => {
  // (In chunks, like the ground it's on; earth at the rim, soot only in the middle, gaps towards the edge.)
  const c = 2;
  for (let i = -10; i < 10; i++) for (let k = -10; k < 10; k++) {
    const d = Math.hypot(i + 0.5, k + 0.5) / 10 + (hash(i, k, 3) - 0.5) * 0.12;
    if (d > 0.98 || (d > 0.78 && hash(k, i, 7) < 0.45)) continue;
    m.box([i * c, 0, k * c], [(i + 1) * c, 1, (k + 1) * c], d < 0.28 ? 'asphalt' : d < 0.62 ? 'dirtDark' : hash(i, k, 19) < 0.5 ? 'dirtDark' : 'dirt');
  }
  return m;
});
// What a building leaves: a low heap of broken concrete and brick, with twisted girders sticking out.
plain('rubble', (m) => {
  const r = 26;
  const cols = ['concrete', 'concreteDark', 'concreteDark', 'concreteDark', 'asphaltLight', 'dirtDark', 'brickDark'];
  for (let i = -r; i < r; i += 3) for (let k = -r; k < r; k += 3) {
    const d = Math.hypot(i + 1.5, k + 1.5) / r + (hash(i, k, 11) - 0.5) * 0.3;
    if (d > 0.98) continue;
    const h = Math.max(1, Math.round((1 - d) * 11 + hash(k, i, 13) * 5 - 2));
    m.box([i, 0, k], [i + 3, h, k + 3], cols[Math.floor(hash(i, k, 17) * cols.length)]);
  }
  m.box([-9, 4, -3], [-7, 20, -1], 'rust');
  m.box([-9, 18, -3], [-1, 20, -1], 'rust');
  m.box([8, 3, 6], [10, 15, 8], 'steelDark');
  m.box([8, 13, 6], [10, 15, 14], 'steelDark');
  m.box([-14, 6, 10], [-3, 8, 12], 'rust');
  return m;
});
// A supply pallet, strapped and stencilled, as it lands.
plain('airdrop', (m) => {
  m.box([-13, 0, -13], [13, 3, 13], 'woodDark');
  m.box([-11, 3, -11], [11, 19, 11], 'olive');
  m.box([-12, 19, -12], [12, 21, 12], 'oliveDark');
  for (const a of [-5, 4]) {
    m.box([a, 3, -12], [a + 2, 22, 12], 'tread');
    m.box([-12, 3, a], [12, 22, a + 2], 'tread');
  }
  m.box([-3, 9, -12], [3, 15, -11], 'hazard');
  m.box([-3, 9, 11], [3, 15, 12], 'hazard');
  m.box([-1, 21, -1], [1, 25, 1], 'redLight');
  return m;
});
// Its parachute: a striped canopy on lines that meet at the crate.
plain('chute', (m) => {
  for (let y = 0; y < 12; y++) {
    const r = Math.sqrt(Math.max(0, 1 - (y / 12) ** 2)) * 34;
    const cut = r > 8 ? r - 3 : 0;
    m.disc(0, 0, r, 54 + y, 55 + y, y % 4 < 2 ? 'orange' : 'white');
    if (cut) m.disc(0, 0, cut, 54 + y, 55 + y, false);
  }
  m.disc(0, 0, 10, 65, 66, 'orange');
  for (const [x, z] of [[-24, -24], [24, -24], [-24, 24], [24, 24]]) {
    for (let k = 0; k < 54; k += 1) {
      const t = k / 54;
      const px = Math.round(x * t);
      const pz = Math.round(z * t);
      m.box([px, k, pz], [px + 1, k + 1, pz + 1], 'canvas');
    }
  }
  return m;
});
// What a tracked vehicle leaves in the dirt: two rows of cleat marks.
plain('tracks', (m) => {
  for (const side of [-6, 4]) for (let k = -8; k < 8; k += 5) m.box([side, 0, k], [side + 2, 1, k + 1], 'pressed');
  return m;
});
// A mine, its pressure plate showing.
plain('mine', (m) => {
  m.disc(0, 0, 8, 0, 2, 'oliveDark');
  m.disc(0, 0, 4, 2, 3, 'steelDark');
  m.disc(0, 0, 1.6, 3, 4, 'redLight');
  return m;
});
// A shell or a grenade, in the air.
plain('shell', (m) => {
  m.box([-1, -1, -4], [1, 1, 3], 'gunmetal');
  m.box([-1, -1, 3], [1, 1, 5], 'hazard');
  return m;
});
plain('radar', (m) => {
  // A dish on its arm, tilted up, the turning point at the origin (the mast's top).
  m.box([0, 0, 0], [1, 2, 1], 'steelDark');
  m.box([0, 1, -1], [1, 2, 0], 'steelDark');
  m.box([-4, 1, -2], [5, 5, -1], 'dish');
  m.box([-3, 0, -1], [4, 1, 0], 'dish');
  m.box([-3, 5, -3], [4, 6, -2], 'dish');
  m.box([0, 2, -1], [1, 3, 2], 'steelDark');
  m.box([0, 5, -2], [1, 6, -1], 'redLight');
  return m;
});

// ---------------------------------------------------------------------------------------------
// The base

const BUILDINGS = [];
// (Each building is built, then dressed for war: `WAR` below.)
const building = (id, fn) =>
  BUILDINGS.push({
    id,
    build: () => {
      const m = fn(new Model(id));
      WAR[id]?.(m);
      return m;
    },
  });

/** Sandbags along a line from (x0, z0), n bags, along x (dir 0) or z (dir 1), two rows high. */
function sandbags(m, x0, z0, n, dir, y = 0, rows = 2) {
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < n; i++) {
      const off = r % 2 ? 1 : 0;
      const a = i * 3 + off;
      const c = (i + r) % 3 === 0 ? 'sandDark' : 'sand';
      if (dir === 0) m.box([x0 + a, y + r * 2, z0], [x0 + a + 3, y + r * 2 + 2, z0 + 2], c);
      else m.box([x0, y + r * 2, z0 + a], [x0 + 2, y + r * 2 + 2, z0 + a + 3], c);
    }
}

/** A flag on a pole at (x, z): the team's banner. */
function flagpole(m, x, z, h) {
  m.box([x, 0, z], [x + 1, h, z + 1], 'steelLight');
  m.box([x, h, z], [x + 1, h + 1, z + 1], 'gold');
}

/** Windows in a wall face at z (facing +z if dir > 0): every `step` from x0 to x1, from y0 to y1. */
function windowsZ(m, x0, x1, z, y0, y1, step, lit = 0.4, seed = 1) {
  for (let x = x0; x + 2 <= x1; x += step) m.box([x, y0, z], [x + 2, y1, z + 1], hash(x, y0, seed) < lit ? 'lit' : 'glassDark');
}
function windowsX(m, z0, z1, x, y0, y1, step, lit = 0.4, seed = 2) {
  for (let z = z0; z + 2 <= z1; z += step) m.box([x, y0, z], [x + 1, y1, z + 2], hash(z, y0, seed) < lit ? 'lit' : 'glassDark');
}

/** A concrete pad (the ground a building stands on): its edge darker. */
function pad(m, r0, r1, z0, z1, c = 'concreteDark', edge = 'asphalt') {
  m.box([r0, 0, z0], [r1, 1, z1], c);
  m.box([r0, 0, z0], [r1, 1, z0 + 1], edge);
  m.box([r0, 0, z1 - 1], [r1, 1, z1], edge);
  m.box([r0, 0, z0], [r0 + 1, 1, z1], edge);
  m.box([r1 - 1, 0, z0], [r1, 1, z1], edge);
}

/** Barbed wire: posts every five, strands sagging between, along x (dir 0) or z (dir 1). Only where nothing stands. */
function wire(m, x0, z0, len, dir) {
  for (let a = 0; a < len; a++) {
    const x = dir === 0 ? x0 + a : x0;
    const z = dir === 0 ? z0 : z0 + a;
    if (m.has(x, 1, z)) continue;
    if (a % 5 === 0) m.box([x, 1, z], [x + 1, 5, z + 1], 'woodDark');
    else {
      m.set(x, 2 + (a % 2), z, 'steelDark');
      if (a % 2) m.set(x, 4, z, 'steelLight');
    }
  }
}

/** Camouflage netting over [x0, x1) by [z0, z1), on poles at its corners, sagging in the middle, torn in places. */
function netting(m, x0, x1, z0, z1, y, seed = 0) {
  for (const [x, z] of [[x0, z0], [x1 - 1, z0], [x0, z1 - 1], [x1 - 1, z1 - 1]]) m.box([x, 1, z], [x + 1, y + 1, z + 1], 'woodDark');
  for (let z = z0; z < z1; z++)
    for (let x = x0; x < x1; x++) {
      const h = hash(x >> 1, z >> 1, seed);
      if (h < 0.14) continue;
      const edge = x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1;
      m.set(x, edge ? y : y - 1, z, h < 0.45 ? 'oliveDark' : h < 0.82 ? 'olive' : 'khaki');
    }
}

/** A tank trap: three steel beams crossed. */
function hedgehog(m, x, z) {
  m.box([x, 1, z + 1], [x + 3, 2, z + 2], 'rust');
  m.box([x + 1, 1, z], [x + 2, 2, z + 3], 'rust');
  m.box([x + 1, 1, z + 1], [x + 2, 4, z + 2], 'steelDark');
}

/** A concrete road barrier along x, a warning stripe on its top. */
function barrier(m, x, z, len) {
  m.box([x, 1, z], [x + len, 3, z + 2], 'concreteLight');
  m.box([x, 3, z], [x + len, 4, z + 1], 'concrete');
  for (let i = x; i < x + len; i += 2) m.set(i, 3, z, 'hazard');
}

/** A gun pit: a ring of sandbags standing on y, a heavy machine gun on its post looking out to +z. */
function gunpit(m, x, y, z) {
  m.ring(x, z, 2.2, 3.6, y, y + 2, 'sand');
  m.paint([x - 4, y, z - 4], [x + 4, y + 2, z + 4], (i, j, k, c) => (c === 'sand' && (i + j + k) % 3 === 0 ? 'sandDark' : undefined));
  m.box([x - 1, y, z - 1], [x + 1, y + 3, z + 1], 'gunmetal');
  m.box([x - 1, y + 3, z - 2], [x + 1, y + 4, z + 6], 'black');
  m.box([x - 2, y + 2, z + 1], [x + 2, y + 5, z + 2], 'steelDark');
}

/** Fewer lit windows: a base at war is blacked out. */
const blackout = (m, keep = 0.35) => m.paint([-40, 0, -40], [40, 60, 40], (i, j, k, c) => (c === 'lit' && hash(i >> 1, j >> 1, k >> 1) > keep ? 'glassDark' : undefined));

/**
 * What makes each building a base at war and not a town: disruptive paint on its walls, blacked-out
 * windows, wire and sandbags and tank traps at its edges, gun pits, netting over its stores. All
 * of it inside the building's own pad (the field scales a model by its footprint).
 */
/** Every cell of one colour to another, from y0 up. */
const swap = (m, map, y0 = 1) => m.paint([-40, y0, -40], [40, 60, 40], (i, j, k, c) => map[c]);
/** Windows narrowed to slits: two cells in three of the glass walled up. */
const slits = (m, wall) => m.paint([-40, 1, -40], [40, 60, 40], (i, j, k, c) => ((c === 'glass' || c === 'glassDark' || c === 'lit') && ((i + k + 80) >> 1) % 3 !== 0 ? wall : undefined));

const WAR = {
  hq: (m) => {
    blackout(m, 0.2);
    slits(m, 'concrete');
    swap(m, { concreteLight: 'concrete' }, 2);
    camo(m, 'concrete', 'olive', 'concreteDark', 7, 2, 0.38);
    netting(m, 9, 20, -13, 0, 23, 5);
    // The roof: sandbags along its front, a gun pit; the ground: a sandbagged front, barriers before the door, wire behind.
    sandbags(m, -17, 5, 11, 0, 18, 1);
    gunpit(m, -11, 18, 0);
    barrier(m, 0, 17, 6);
    barrier(m, 10, 17, 6);
    wire(m, -20, -18, 41, 0);
    wire(m, -21, -17, 20, 1);
    hedgehog(m, -20, 4);
    hedgehog(m, 17, 12);
    netting(m, -21, -15, -14, -2, 12, 2);
  },
  depot: (m) => {
    m.paint([-12, 0, -12], [12, 30, 12], (i, j, k, c) => (c === 'brick' ? 'sand' : c === 'brickDark' ? 'sandDark' : undefined));
    netting(m, -9, 1, 4, 10, 8, 3);
    wire(m, -10, -9, 20, 0);
    // Shells stacked by the drums.
    for (let i = 0; i < 3; i++) m.box([7, 1, 7 + i], [10, 2, 8 + i], i % 2 ? 'gold' : 'oliveDark');
  },
  barracks: (m) => {
    camo(m, 'corrugated', 'corrugatedDark', 'olive', 8, 1);
    wire(m, -14, -14, 28, 0);
    wire(m, -14, -13, 22, 1);
    wire(m, 13, -9, 18, 1);
    hedgehog(m, 10, 11);
  },
  factory: (m) => {
    blackout(m, 0.45);
    // Steel stacks and a concrete annex, not a mill's brick.
    m.paint([-16, 0, -16], [16, 40, 17], (i, j, k, c) => (c === 'brick' ? (i >= 12 ? 'concrete' : 'steelDark') : c === 'brickDark' ? (i >= 12 ? 'concreteDark' : 'gunmetal') : undefined));
    // The skylights painted over, the hall in drab.
    swap(m, { glass: 'corrugated', steelLight: 'steel' }, 12);
    camo(m, 'steel', 'olive', 'oliveDark', 9, 3, 0.5);
    camo(m, 'steelDark', 'corrugated', 'steel', 12, 3, 0.55);
    // The hull under the gantry is a tank: tracks down its sides.
    m.box([-8, 1, 10], [4, 3, 11], 'tread');
    m.box([-8, 1, 15], [4, 3, 16], 'tread');
    for (let x = -8; x < 4; x += 3) m.box([x, 1, 16], [x + 2, 3, 17], 'steelDark');
    sandbags(m, 6, 15, 3, 0, 1);
    wire(m, -15, -16, 31, 0);
    hedgehog(m, 13, 9);
  },
  airfield: (m) => {
    blackout(m, 0.5);
    swap(m, { steelLight: 'olive', offwhite: 'concrete', glass: 'glassDark' });
    camo(m, 'olive', 'oliveDark', 'khaki', 10, 1, 0.34);
    camo(m, 'concrete', 'olive', 'concreteDark', 13, 2);
    wire(m, -17, -17, 35, 0);
    wire(m, -18, -16, 20, 1);
  },
  dock: (m) => {
    swap(m, { roofRed: 'corrugated' });
    camo(m, 'corrugated', 'corrugatedDark', 'olive', 15, 1);
  },
  lab: (m) => {
    blackout(m, 0.5);
    // Not a white observatory: a hardened research bunker in drab.
    swap(m, { offwhite: 'concrete', white: 'concrete', concreteLight: 'concrete', silver: 'olive' });
    camo(m, 'concrete', 'olive', 'concreteDark', 11, 1, 0.36);
    camo(m, 'olive', 'oliveDark', 'khaki', 14, 1);
    sandbags(m, -3, 10, 4, 0, 1, 1);
    wire(m, -12, -12, 24, 0);
    wire(m, -12, -11, 16, 1);
    hedgehog(m, 9, 9);
  },
};

building('hq', (m) => {
  // Headquarters: a two-storey command block of concrete on a pad, a glass band round its
  // operations floor, the team's banners, a radar dish and an aerial mast on the roof, and a
  // helipad in front.
  pad(m, -21, 21, -18, 21);
  // The helipad: a disc on the pad, its H.
  m.disc(-10, 13, 6.5, 1, 2, 'asphalt');
  m.ring(-10, 13, 5.5, 6.5, 1, 2, 'paint');
  m.box([-13, 1, 10], [-12, 2, 17], 'paint');
  m.box([-9, 1, 10], [-8, 2, 17], 'paint');
  m.box([-12, 1, 13], [-9, 2, 14], 'paint');
  m.mx([4, 1, 8], [5, 3, 9], 'redLight');
  // The block: lower storey with its doors, the glass band, the upper storey.
  m.box([-18, 1, -16], [18, 10, 8], 'concrete');
  m.box([-18, 1, -16], [18, 2, 8], 'concreteDark');
  m.box([-17, 10, -15], [17, 15, 7], 'glassDark');
  windowsZ(m, -16, 16, 7, 10, 15, 3, 0.55, 3);
  windowsX(m, -14, 6, 16, 10, 15, 3, 0.5, 4);
  windowsX(m, -14, 6, -17, 10, 15, 3, 0.5, 5);
  for (let x = -17; x <= 15; x += 4) m.box([x, 10, 7], [x + 1, 15, 8], 'concrete');
  m.box([-18, 15, -16], [18, 18, 8], 'concrete');
  m.box([-18, 17, -16], [18, 18, 8], 'concreteLight');
  windowsZ(m, -16, 16, 8, 4, 7, 4, 0.3, 6);
  // The entrance: a porch on columns, the door, steps; the team's banners either side.
  m.box([1, 1, 8], [15, 2, 13], 'concreteLight');
  m.box([2, 8, 8], [14, 9, 13], 'concrete');
  m.box([2, 9, 8], [14, 10, 13], 'team');
  m.box([2, 2, 12], [3, 8, 13], 'concreteLight');
  m.box([13, 2, 12], [14, 8, 13], 'concreteLight');
  m.box([6, 2, 8], [10, 7, 9], 'glassDark');
  m.box([7, 2, 8], [9, 7, 9], 'glass');
  for (const x of [-17, -1, 16]) {
    m.box([x, 3, 8], [x + 1, 16, 9], 'team');
    m.box([x, 3, 8], [x + 1, 4, 9], 'teamDark');
  }
  m.box([-14, 4, 8], [-4, 7, 9], 'teamDark');
  m.box([-12, 5, 8], [-6, 6, 9], 'gold');
  // Roof: a parapet, vents, the operations tower with its radar dish, the mast, a dish array.
  m.box([-18, 18, -16], [18, 19, -15], 'concreteDark');
  m.box([-18, 18, 7], [18, 19, 8], 'concreteDark');
  m.box([-18, 18, -16], [-17, 19, 8], 'concreteDark');
  m.box([17, 18, -16], [18, 19, 8], 'concreteDark');
  m.box([-14, 18, -12], [-6, 21, -6], 'steelLight');
  m.box([-13, 21, -11], [-7, 22, -7], 'steelDark');
  // The command tower: two more storeys, windows on every face, the team's crown, the ops room's
  // screens glowing through its glass.
  m.box([-6, 18, -14], [8, 33, -1], 'concrete');
  for (const y of [20, 25]) {
    windowsZ(m, -5, 7, -1, y, y + 3, 3, 0.6, y);
    windowsX(m, -13, -2, 8, y, y + 3, 3, 0.6, y + 1);
    windowsX(m, -13, -2, -7, y, y + 3, 3, 0.6, y + 2);
  }
  m.box([-6, 29, -14], [8, 31, -1], 'glassDark');
  m.box([-5, 29, -1], [7, 31, 0], 'screen');
  m.box([-7, 31, -15], [9, 33, 0], 'team');
  m.box([-7, 33, -15], [9, 34, 0], 'teamDark');
  m.box([0, 34, -9], [2, 37, -7], 'steelDark');
  m.box([12, 18, -14], [13, 46, -13], 'steelDark');
  for (let y = 22; y < 46; y += 4) m.box([11, y, -14], [14, y + 1, -13], 'steelDark');
  m.box([12, 46, -14], [13, 47, -13], 'redLight');
  m.box([12, 34, -14], [13, 35, -13], 'redLight');
  m.dome(10, 18, 2, 3, 'dish');
  m.dome(14, 18, 2, 2, 'dish');
  // Generator and fuel at the side; sandbags and a flag.
  m.box([-21, 1, -12], [-18, 6, -4], 'olive');
  m.box([-21, 6, -11], [-18, 7, -5], 'oliveDark');
  m.box([-20, 7, -10], [-19, 10, -9], 'black');
  m.cylZ(-2, 6, -19.5, 3, 1.6, 'drum');
  sandbags(m, 19, -14, 9, 1, 1);
  sandbags(m, -20, 14, 3, 0, 1);
  flagpole(m, 17, 16, 34);
  return m;
});

building('depot', (m) => {
  // A supply depot: shipping containers stacked, crates on pallets, fuel drums, a lamp post.
  pad(m, -10, 10, -9, 10, 'concreteDark');
  const container = (x0, y0, z0, len, c, along = 'x') => {
    const hi = along === 'x' ? [x0 + len, y0 + 6, z0 + 6] : [x0 + 6, y0 + 6, z0 + len];
    m.box([x0, y0, z0], hi, c);
    // Corrugation: ribs of a darker shade every other cell; doors at an end.
    if (along === 'x') {
      for (let x = x0 + 1; x < x0 + len - 1; x += 2) {
        m.box([x, y0 + 1, z0], [x + 1, y0 + 5, z0 + 1], c === 'team' ? 'teamDark' : `${c}Dark`);
        m.box([x, y0 + 1, z0 + 5], [x + 1, y0 + 5, z0 + 6], c === 'team' ? 'teamDark' : `${c}Dark`);
      }
      m.box([x0 + len - 1, y0 + 1, z0 + 2], [x0 + len, y0 + 5, z0 + 3], 'steelLight');
    } else
      for (let z = z0 + 1; z < z0 + len - 1; z += 2) {
        m.box([x0, y0 + 1, z], [x0 + 1, y0 + 5, z + 1], c === 'team' ? 'teamDark' : `${c}Dark`);
        m.box([x0 + 5, y0 + 1, z], [x0 + 6, y0 + 5, z + 1], c === 'team' ? 'teamDark' : `${c}Dark`);
      }
  };
  container(-9, 1, -8, 13, 'olive');
  container(-9, 7, -8, 13, 'team');
  container(-8, 1, -2, 12, 'steel');
  container(4, 1, -8, 13, 'brick', 'z');
  // Crates on pallets, drums, a forklift.
  for (const [x, z, h] of [[-8, 5, 3], [-4, 5, 2], [-8, 8, 2]]) {
    m.box([x, 1, z], [x + 3, 2, z + 3], 'woodDark');
    m.box([x, 2, z], [x + 3, 2 + h, z + 3], 'crate');
    m.box([x + 1, 2, z + 2], [x + 2, 2 + h, z + 3], 'crateDark');
  }
  for (const [x, z, c] of [[1, 6, 'drum'], [3, 6, 'drumRed'], [1, 8, 'drum'], [5, 8, 'drum'], [3, 8, 'drumRed']]) {
    m.disc(x, z, 1, 1, 4, c);
    m.box([x - 1, 3, z - 1], [x, 4, z], 'steelDark');
  }
  m.box([5, 1, 3], [9, 3, 6], 'hazard');
  m.box([5, 3, 4], [8, 5, 6], 'hazard');
  m.box([5, 5, 3], [9, 6, 6], 'black');
  m.box([6, 1, 1], [7, 7, 2], 'gunmetal');
  m.box([8, 1, 1], [9, 7, 2], 'gunmetal');
  m.box([6, 1, 0], [9, 2, 1], 'steelDark');
  m.box([9, 1, 9], [10, 14, 10], 'steelDark');
  m.box([7, 14, 8], [10, 15, 10], 'lamp');
  return m;
});

building('barracks', (m) => {
  // Barracks: two round-roofed huts of corrugated steel, the team's doors, a sandbagged yard,
  // the flag, a notice board and a water tank on legs.
  pad(m, -14, 14, -14, 14, 'dirt', 'dirtDark');
  const hut = (x, z0, z1) => {
    // The arch: a half cylinder along z, ribbed.
    for (let j = 1; j < 10; j++)
      for (let i = x - 7; i < x + 7; i++) {
        const d = (i + 0.5 - x) ** 2 + (j - 0.5) ** 2;
        if (d <= 49) m.box([i, j, z0], [i + 1, j + 1, z1], (z0 + i) % 2 ? 'corrugated' : 'corrugated');
      }
    for (let z = z0 + 1; z < z1; z += 3)
      for (let j = 1; j < 10; j++)
        for (let i = x - 7; i < x + 7; i++) {
          const d = (i + 0.5 - x) ** 2 + (j - 0.5) ** 2;
          if (d <= 49 && d > 30) m.set(i, j, z, 'corrugatedDark');
        }
    // The ends: the door in the team's colour, windows, a lamp.
    m.box([x - 2, 1, z1], [x + 2, 6, z1 + 1], 'team');
    m.box([x - 2, 6, z1], [x + 2, 7, z1 + 1], 'teamDark');
    m.box([x - 5, 3, z1 - 1], [x - 3, 5, z1], 'lit');
    m.box([x + 3, 3, z1 - 1], [x + 5, 5, z1], 'lit');
    m.box([x - 1, 7, z1], [x + 1, 8, z1 + 1], 'lamp');
    m.box([x - 1, 9, z0 + 2], [x + 1, 11, z0 + 4], 'steelDark');
  };
  hut(-6, -12, 6);
  hut(7, -12, 3);
  // The yard: sandbags at its front, the flagpole, a board, a tank.
  sandbags(m, -13, 11, 4, 0, 1);
  sandbags(m, 4, 11, 3, 0, 1);
  flagpole(m, 0, 9, 24);
  m.box([3, 1, 6], [4, 6, 7], 'woodDark');
  m.box([9, 1, 6], [10, 6, 7], 'woodDark');
  m.box([3, 4, 6], [10, 8, 7], 'woodLight');
  m.box([4, 5, 7], [6, 7, 7], 'paint');
  m.box([4, 5, 6], [6, 7, 7], 'paint');
  m.box([7, 5, 6], [9, 6, 7], 'team');
  for (const [x, z] of [[9, -13], [12, -13], [9, -10], [12, -10]]) m.box([x, 1, z], [x + 1, 10, z + 1], 'steelDark');
  m.disc(10.5, -11.5, 3, 10, 15, 'olive');
  m.ring(10.5, -11.5, 2, 3, 13, 14, 'oliveDark');
  // Crates and a rack of rifles by the door.
  m.box([-13, 1, 7], [-10, 4, 10], 'crate');
  m.box([-13, 4, 8], [-11, 6, 10], 'crateDark');
  m.box([-9, 1, 8], [-8, 5, 9], 'black');
  m.box([-8, 1, 8], [-7, 5, 9], 'black');
  return m;
});

building('factory', (m) => {
  // A war factory: a hall of brick and steel, its saw-tooth roof of glass, two smokestacks, a
  // great door striped for warning, a gantry crane over the yard.
  pad(m, -16, 16, -16, 17, 'asphalt', 'asphaltLight');
  m.box([-15, 1, -14], [12, 16, 8], 'steel');
  m.box([-15, 1, -14], [12, 3, 8], 'steelDark');
  for (let x = -14; x < 12; x += 4) m.box([x, 3, 8], [x + 1, 16, 9], 'steelDark');
  windowsX(m, -12, 6, -16, 9, 13, 3, 0.6, 7);
  windowsX(m, -12, 6, 12, 9, 13, 3, 0.6, 8);
  // The saw-tooth roof: ridges along x, glazed to the north.
  for (let z = -14; z < 8; z += 6)
    for (let s = 0; s < 6; s++) {
      m.box([-15, 16, z + s], [12, 16 + Math.min(s, 4), z + s + 1], 'steelDark');
      if (s === 5) m.box([-15, 16, z + s], [12, 21, z + s + 1], 'glass');
    }
  // The door: a frame, its hazard stripes, a lit sign of the team above.
  m.box([-9, 1, 8], [5, 13, 9], 'gunmetal');
  for (let x = -9; x < 5; x++) m.box([x, 11, 9], [x + 1, 13, 10], (x & 1) ? 'hazard' : 'black');
  m.mx([9, 1, 9], [10, 11, 10], 'hazard');
  m.box([-9, 1, 9], [-8, 11, 10], 'hazard');
  m.box([4, 1, 9], [5, 11, 10], 'hazard');
  for (let y = 2; y < 11; y += 2) m.box([-8, y, 8], [4, y + 1, 9], 'steelDark');
  m.box([-6, 13, 9], [2, 15, 10], 'team');
  m.box([-5, 14, 10], [1, 15, 10], 'team');
  // Smokestacks of brick, banded; a furnace's glow at the base of one.
  for (const [x, z, h] of [[-11, -10, 34], [-4, -10, 30]]) {
    m.disc(x, z, 2.6, 16, h, 'brick');
    for (let y = 20; y < h; y += 5) m.ring(x, z, 1.6, 2.6, y, y + 1, 'brickDark');
    m.ring(x, z, 1.6, 2.6, h - 1, h, 'black');
    m.disc(x, z, 1.5, h - 1, h, 'black');
  }
  m.box([-15, 1, -2], [-14, 4, 2], 'fire');
  // The annex: the offices, its windows lit.
  m.box([12, 1, -14], [15, 10, 2], 'brick');
  windowsX(m, -12, 1, 15, 4, 7, 3, 0.7, 9);
  m.box([12, 10, -14], [15, 11, 2], 'brickDark');
  // The gantry over the yard: legs, beam, its hook; a half-built hull under it.
  for (const x of [-14, 10]) m.box([x, 1, 12], [x + 2, 20, 14], 'hazard');
  m.box([-14, 20, 12], [12, 22, 14], 'hazard');
  m.box([-3, 18, 12], [1, 20, 14], 'gunmetal');
  m.box([-1, 13, 13], [0, 18, 14], 'black');
  m.box([-8, 1, 10], [4, 5, 16], 'olive');
  m.box([-5, 5, 11], [1, 7, 15], 'oliveDark');
  m.box([-2, 6, 15], [-1, 7, 20], 'oliveDark');
  return m;
});

building('airfield', (m) => {
  // An airfield: a hangar of arched steel open at the front, a tarmac apron with its markings
  // and the team's landing circle, a control tower with a glass cab, and a windsock.
  pad(m, -18, 18, -17, 18, 'asphalt', 'asphaltLight');
  // The hangar: an arch along z, open to +z; the dark inside; ribs.
  const hx = -6;
  for (let j = 1; j < 14; j++)
    for (let i = hx - 11; i < hx + 11; i++) {
      const d = (i + 0.5 - hx) ** 2 + ((j - 0.5) * 1.6) ** 2;
      if (d <= 121) m.box([i, j, -16], [i + 1, j + 1, 4], d > 81 ? 'steelLight' : 'black');
    }
  for (let z = -16; z < 4; z += 4)
    for (let j = 1; j < 14; j++)
      for (let i = hx - 11; i < hx + 11; i++) {
        const d = (i + 0.5 - hx) ** 2 + ((j - 0.5) * 1.6) ** 2;
        if (d <= 121 && d > 100) m.set(i, j, z, 'steel');
      }
  m.box([hx - 11, 1, -17], [hx + 11, 2, -16], 'steelDark');
  m.box([hx - 4, 8, 3], [hx + 4, 10, 4], 'team');
  m.box([hx - 7, 1, 2], [hx + 7, 2, 3], 'hazard');
  // The apron: a landing circle in the team's colour, lines, lights at its edge.
  m.ring(hx, 11, 4, 5, 1, 2, 'team');
  // A helicopter parked on it: body, canopy, boom, skids, blades.
  m.box([hx - 2, 2, 8], [hx + 2, 6, 14], 'olive');
  m.box([hx - 2, 4, 12], [hx + 2, 6, 15], 'glass');
  m.box([hx - 1, 4, 2], [hx + 1, 6, 8], 'olive');
  m.box([hx - 1, 4, 1], [hx + 1, 9, 3], 'olive');
  m.box([hx - 2, 5, 9], [hx + 2, 6, 11], 'team');
  m.box([hx - 3, 1, 8], [hx - 2, 2, 14], 'gunmetal');
  m.box([hx + 2, 1, 8], [hx + 3, 2, 14], 'gunmetal');
  m.box([hx, 6, 10], [hx + 1, 7, 11], 'gunmetal');
  m.box([hx - 9, 7, 10], [hx + 10, 8, 11], 'black');
  m.box([hx, 7, 3], [hx + 1, 8, 18], 'black');
  for (let z = -15; z < 17; z += 4) m.box([16, 1, z], [17, 2, z + 2], 'paint');
  for (let x = -17; x < 17; x += 6) m.box([x, 1, 16], [x + 1, 2, 17], (x / 6) & 1 ? 'redLight' : 'greenLight');
  // The tower: a shaft, a gallery, the glass cab, its roof, a beacon.
  m.box([8, 1, -14], [14, 18, -8], 'concrete');
  windowsZ(m, 9, 13, -8, 4, 6, 3, 0.5, 10);
  windowsZ(m, 9, 13, -8, 10, 12, 3, 0.5, 11);
  m.box([6, 18, -16], [16, 19, -6], 'concreteDark');
  m.box([7, 19, -15], [15, 23, -7], 'glass');
  m.box([8, 19, -14], [14, 23, -8], 'screen');
  m.box([6, 23, -16], [16, 24, -6], 'concreteDark');
  m.box([10, 24, -12], [12, 27, -10], 'steelDark');
  m.box([10, 27, -12], [12, 28, -10], 'redLight');
  // Fuel tanks, a fuel truck, the windsock.
  m.cylZ(-14, -6, 12.5, 3.5, 2.5, 'offwhite');
  m.box([10, 1, -5], [15, 2, -4], 'steelDark');
  m.box([9, 1, 2], [14, 4, 10], 'drumRed');
  m.box([9, 4, 7], [14, 6, 10], 'drumRed');
  m.box([9, 5, 7], [14, 6, 9], 'glassDark');
  m.box([10, 0, 3], [13, 1, 5], 'rubber');
  m.box([10, 0, 8], [13, 1, 9], 'rubber');
  m.box([16, 1, 13], [17, 14, 14], 'steelLight');
  return m;
});

building('lab', (m) => {
  // A research lab: white and clean, a dome open to the sky with its telescope, a wing of lit
  // windows, solar panels on the roof, an aerial, a blue screen glow at the door.
  pad(m, -12, 12, -12, 12, 'concrete', 'concreteDark');
  m.box([-11, 1, -10], [3, 10, 8], 'white');
  m.box([-11, 1, -10], [3, 2, 8], 'offwhite');
  windowsZ(m, -10, 2, 8, 4, 8, 3, 0.8, 12);
  windowsX(m, -8, 6, -12, 4, 8, 3, 0.8, 13);
  m.box([-11, 10, -10], [3, 11, 8], 'offwhite');
  m.box([-11, 6, 8], [3, 7, 9], 'team');
  // Solar panels on the wing's roof, tilted rows.
  for (let z = -9; z < 6; z += 4) {
    m.box([-10, 11, z], [2, 12, z + 2], 'solar');
    m.box([-10, 12, z + 1], [2, 13, z + 3], 'solar');
  }
  // The observatory: a drum, its dome, the slit, the telescope looking out.
  m.disc(6, -2, 6, 1, 12, 'offwhite');
  m.ring(6, -2, 5, 6, 11, 12, 'team');
  m.dome(6, 12, -2, 6, 'silver');
  m.box([5, 12, -2], [7, 19, 5], false);
  m.box([5, 12, -2], [7, 13, 5], 'black');
  m.box([5, 13, -1], [7, 15, 1], 'steelDark');
  for (let i = 0; i < 5; i++) m.box([5, 14 + i, 1 + i], [7, 16 + i, 2 + i], 'white');
  m.box([5, 18, 5], [7, 20, 7], 'glassDark');
  // The door: glass, glowing; steps; an aerial; a tank of coolant.
  m.box([-5, 1, 8], [-1, 6, 9], 'screen');
  m.box([-6, 6, 8], [0, 7, 10], 'offwhite');
  m.box([-6, 1, 9], [0, 2, 11], 'concreteLight');
  m.box([-9, 11, -8], [-8, 24, -7], 'steelDark');
  m.box([-11, 20, -8], [-6, 21, -7], 'steelDark');
  m.box([-9, 24, -8], [-8, 25, -7], 'redLight');
  m.disc(9, 9, 2.5, 1, 7, 'steelLight');
  m.box([8, 7, 8], [10, 8, 10], 'screen');
  m.box([-12, 1, 9], [-9, 4, 11], 'drum');
  return m;
});

building('rampart', (m) => {
  // A length of wall: wire-mesh baskets of earth stacked two high (they join on every side), earth
  // heaped on top, a band of the team's colour, coils of wire along the crest.
  m.box([-8, 0, -8], [8, 18, 8], 'sand');
  m.paint([-8, 0, -8], [8, 18, 8], (i, j, k) => {
    const sx = i === -8 || i === 7;
    const sz = k === -8 || k === 7;
    if (!sx && !sz) return undefined;
    if (j === 0 || j === 9 || j === 17) return 'steelDark';
    if ((sz && (i + 8) % 8 === 0) || (sx && (k + 8) % 8 === 0)) return 'steelDark';
    if (j === 14 || j === 15) return 'team';
    return hash(i >> 1, j >> 1, k >> 1) < 0.3 ? 'sandDark' : hash(i, j, k) < 0.08 ? 'khaki' : undefined;
  });
  m.box([-7, 18, -7], [7, 19, 7], 'khaki');
  for (let i = -7; i < 7; i++) for (let k = -7; k < 7; k++) if (hash(i, k, 5) < 0.3) m.set(i, 18, k, 'sandDark');
  for (let a = -8; a < 8; a++) {
    if ((a + 8) % 4 === 0) {
      m.box([a, 18, -1], [a + 1, 22, 0], 'woodDark');
      m.box([-1, 18, a], [0, 22, a + 1], 'woodDark');
    } else {
      m.set(a, 20 + (a & 1), -1, 'steelDark');
      m.set(-1, 20 + (a & 1), a, 'steelDark');
    }
  }
  return m;
});

building('gate', (m) => {
  // A gate: four concrete posts, open between them every way, a road through, a slab over it
  // edged in the team's colour, warning stripes on the posts.
  m.box([-8, 0, -8], [8, 1, 8], 'asphalt');
  for (const [x, z] of [[-8, -8], [4, -8], [-8, 4], [4, 4]]) {
    m.box([x, 0, z], [x + 4, 20, z + 4], 'concrete');
    m.box([x, 0, z], [x + 4, 3, z + 4], 'concreteDark');
    for (let j = 7; j < 11; j++) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) m.set(x + a, j, z + b, (a + b + j) % 4 < 2 ? 'hazard' : 'black');
  }
  m.box([-8, 20, -8], [8, 22, 8], 'concreteDark');
  m.box([-8, 22, -8], [8, 24, 8], 'team');
  m.box([-6, 22, -6], [6, 24, 6], 'concreteDark');
  m.box([-1, 24, -1], [1, 27, 1], 'steelDark');
  m.set(0, 27, 0, 'lit');
  return m;
});

building('market', (m) => {
  // A trade post: an open hall under a striped awning, a counter and crates under it; steel
  // girders stacked on one side of the yard, oil drums on the other; a weighbridge before it, a
  // price board on a post, and a crane to lift the loads.
  pad(m, -11, 11, -11, 11, 'concreteDark');
  // The hall: steel columns, a roof sloping to the front in stripes of the team's colour.
  for (const [x, z] of [[-9, -9], [8, -9], [-9, 2], [8, 2]]) m.box([x, 1, z], [x + 1, z < 0 ? 14 : 11, z + 1], 'steelDark');
  for (let z = -10; z <= 3; z++) {
    const y = 14 - Math.max(0, Math.floor((z + 9) / 4));
    for (let x = -10; x <= 9; x++) m.set(x, y, z, Math.floor((x + 10) / 3) % 2 ? 'team' : 'white');
  }
  for (let x = -10; x <= 9; x++) if (x % 2) m.set(x, 10, 4, Math.floor((x + 10) / 3) % 2 ? 'teamDark' : 'white');
  // A back wall of corrugated steel; the counter, the crates and a lamp.
  m.box([-9, 1, -10], [9, 13, -9], 'corrugated');
  for (let x = -8; x < 9; x += 2) m.box([x, 1, -10], [x + 1, 13, -9], 'corrugatedDark');
  m.box([-6, 1, -1], [6, 4, 1], 'wood');
  m.box([-6, 4, -1], [6, 5, 1], 'woodLight');
  for (const [x, z, h] of [[-8, -7, 3], [-5, -7, 5], [-2, -7, 3], [3, -7, 4], [6, -6, 2]]) {
    m.box([x, 1, z], [x + 3, 1 + h, z + 3], 'crate');
    m.box([x + 1, 1, z + 2], [x + 2, 1 + h, z + 3], 'crateDark');
  }
  m.box([-1, 10, -2], [1, 11, 0], 'lamp');
  // Girders on the left of the yard, steel on chocks; drums on the right.
  for (let i = 0; i < 3; i++) {
    m.box([-10, 1 + i * 2, 5 + i], [-4, 2 + i * 2, 6 + i], i % 2 ? 'steel' : 'steelLight');
    m.box([-10, 1 + i * 2, 8 - i], [-4, 2 + i * 2, 9 - i], 'steelDark');
  }
  m.box([-10, 1, 9], [-9, 2, 11], 'woodDark');
  m.box([-5, 1, 9], [-4, 2, 11], 'woodDark');
  for (const [x, z, c] of [[5, 6, 'drum'], [7, 6, 'drumRed'], [9, 6, 'drum'], [5, 8, 'drumRed'], [7, 8, 'drum'], [9, 8, 'drum'], [6, 10, 'drum'], [8, 10, 'drumRed']]) {
    m.disc(x, z, 1, 1, 4, c);
    m.box([x - 1, 3, z - 1], [x, 4, z], 'steelDark');
  }
  // The weighbridge between them, its edges in warning stripes.
  m.box([-3, 0, 4], [3, 1, 10], 'steelDark');
  for (let x = -3; x < 3; x++) {
    m.set(x, 1, 4, (x & 1) ? 'hazard' : 'black');
    m.set(x, 1, 9, (x & 1) ? 'black' : 'hazard');
  }
  // The price board: black, two rows of lit figures, on a post.
  m.box([9, 1, -3], [10, 15, -2], 'gunmetal');
  m.box([8, 15, -6], [11, 21, 1], 'black');
  for (const y of [16, 19]) for (let z = -5; z < 0; z++) if ((z + y) % 3) m.set(11, y, z, 'lit');
  // The crane: a mast at the back corner, a jib out over the yard, a hook on its line.
  m.box([-11, 1, -11], [-9, 25, -9], 'hazard');
  for (let j = 2; j < 25; j += 3) m.box([-11, j, -11], [-9, j + 1, -9], 'black');
  for (let i = 0; i < 14; i++) m.set(-10 + i, 25, -10 + Math.floor(i * 1.1), 'hazard');
  m.box([2, 13, 3], [3, 25, 4], 'steelDark');
  m.box([1, 12, 3], [4, 13, 4], 'gunmetal');
  return m;
});

building('tower', (m) => {
  // A guard tower: four legs braced, a platform walled with sandbags, a tin roof, a searchlight
  // and a machine gun; a ladder.
  const H = 16;
  for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) m.box([x, 0, z], [x + 1, H, z + 1], 'woodDark');
  for (const y of [4, 10]) {
    m.box([-6, y, -6], [6, y + 1, -5], 'wood');
    m.box([-6, y, 5], [6, y + 1, 6], 'wood');
    m.box([-6, y, -6], [-5, y + 1, 6], 'wood');
    m.box([5, y, -6], [6, y + 1, 6], 'wood');
  }
  // Diagonal braces on two faces.
  for (let i = 0; i < 6; i++) {
    m.set(-5 + i * 2, 4 + i, -6, 'wood');
    m.set(-5 + i * 2, 4 + i, 5, 'wood');
  }
  m.box([-7, H, -7], [7, H + 1, 7], 'woodLight');
  sandbags(m, -7, -7, 5, 0, H + 1);
  sandbags(m, -7, 5, 2, 0, H + 1);
  sandbags(m, 2, 5, 2, 0, H + 1);
  sandbags(m, -7, -5, 4, 1, H + 1);
  sandbags(m, 5, -5, 4, 1, H + 1);
  // Posts and a tin roof in the team's colour.
  for (const [x, z] of [[-7, -7], [6, -7], [-7, 6], [6, 6]]) m.box([x, H + 1, z], [x + 1, H + 10, z + 1], 'woodDark');
  m.box([-8, H + 10, -8], [8, H + 11, 8], 'team');
  m.box([-6, H + 11, -6], [6, H + 12, 6], 'teamDark');
  m.box([-8, H + 10, 7], [8, H + 11, 8], 'teamDark');
  // The gun over the front wall; the searchlight on the roof.
  // The ladder at the back.
  m.box([-2, 0, -8], [-1, H, -7], 'woodLight');
  m.box([1, 0, -8], [2, H, -7], 'woodLight');
  for (let y = 1; y < H; y += 2) m.box([-1, y, -8], [1, y + 1, -7], 'woodLight');
  return m;
});

building('bunker', (m) => {
  // A bunker: a low pillbox of thick concrete, eight-sided, its firing slits all round in shadow,
  // the team's band; sandbags about its door at the back, a camouflage net, a periscope.
  m.disc(0, 0, 10, 0, 1, 'dirt');
  for (let j = 1; j < 9; j++) m.disc(0, 0, 9 - Math.max(0, j - 5) * 0.8, j, j + 1, j === 1 ? 'concreteDark' : 'concrete');
  m.ring(0, 0, 7.5, 9.2, 4, 5, 'team');
  // Slits: a gap of black at eye height in each face, toward the eight points.
  for (let a = 0; a < 8; a++) {
    if (a === 4) continue;
    const t = (a / 8) * Math.PI * 2;
    const x = Math.round(Math.sin(t) * 8.4);
    const z = Math.round(Math.cos(t) * 8.4);
    m.box([x - 1, 6, z - 1], [x + 1, 7, z + 1], 'black');
  }
  m.disc(0, 0, 5.5, 9, 10, 'concreteDark');
  m.disc(0, 0, 3, 10, 11, 'concrete');
  m.box([-1, 11, 0], [1, 14, 2], 'steelDark');
  m.box([-1, 13, 2], [1, 14, 3], 'glassDark');
  // The door at the back: a sandbagged trench to it; a net draped over one side.
  m.box([-2, 1, -10], [2, 6, -8], 'black');
  m.box([-3, 6, -10], [3, 7, -8], 'concreteDark');
  sandbags(m, -6, -13, 2, 1, 1);
  sandbags(m, 4, -13, 2, 1, 1);
  m.paint([-10, 1, -10], [10, 12, 10], (i, j, k, c) => (c === 'concrete' && i > 0 && j > 4 && hash(i >> 1, j >> 1, k >> 1) < 0.6 ? (hash(k >> 1, i >> 1, 7) < 0.5 ? 'olive' : 'oliveDark') : undefined));
  sandbags(m, -9, 8, 6, 0, 1, 1);
  return m;
});

building('dock', (m) => {
  // A dock: a deck of planks on pilings (it stands on the shore, the lake at its front), a
  // boathouse in the team's colour, a crane over the water, bollards, crates, a fuel tank.
  for (let z = -12; z < 14; z++) m.box([-12, 2, z], [12, 3, z + 1], z % 3 === 0 ? 'woodDark' : 'wood');
  for (let x = -11; x < 12; x += 5) for (const z of [-11, -3, 5, 12]) m.box([x, -4, z], [x + 1, 2, z + 1], 'woodDark');
  m.box([-12, 0, -13], [12, 2, -11], 'concrete');
  // The slipway in the middle: a gap down to the water with rails.
  m.box([-4, 2, 2], [4, 3, 14], false);
  m.mx([1, 1, 2], [2, 2, 14], 'steelDark');
  m.mx([4, 3, 2], [5, 4, 14], 'hazard');
  // The boathouse.
  m.box([-12, 3, -12], [-4, 11, -2], 'team');
  m.box([-12, 3, -12], [-4, 4, -2], 'teamDark');
  m.box([-10, 3, -2], [-6, 8, -1], 'black');
  windowsX(m, -10, -4, -13, 6, 8, 3, 0.7, 14);
  for (let i = 0; i < 4; i++) m.box([-13 + i, 11 + i, -13], [-3 - i, 12 + i, -1], i === 3 ? 'teamDark' : 'roofRed');
  // The crane: a post at the right, a jib out over the slipway, a hook and its load.
  m.box([7, 3, -2], [9, 22, 0], 'hazard');
  m.box([6, 3, -3], [10, 5, 1], 'steelDark');
  m.box([7, 20, -2], [9, 22, 0], 'gunmetal');
  m.box([-1, 22, -2], [9, 23, 0], 'hazard');
  m.box([-1, 22, 0], [9, 23, 10], 'hazard');
  for (let z = 1; z < 10; z += 2) m.box([-1, 21, z], [9, 22, z + 1], 'black');
  m.box([-2, 22, -4], [10, 24, -2], 'gunmetal');
  m.box([0, 13, 8], [1, 21, 9], 'black');
  m.box([-2, 10, 7], [3, 13, 10], 'crate');
  // Bollards and rope; crates and drums; a lamp; tyres hung as fenders.
  for (const x of [-11, 10]) m.box([x, 3, 12], [x + 1, 5, 13], 'black');
  m.box([10, 3, 4], [12, 6, 7], 'crate');
  m.disc(-9, 6, 1.2, 3, 6, 'drum');
  m.disc(-7, 8, 1.2, 3, 6, 'drumRed');
  m.box([11, 3, -12], [12, 14, -11], 'steelDark');
  m.box([9, 14, -12], [12, 15, -11], 'lamp');
  for (const x of [-10, -6, 6, 10]) m.box([x, 0, 14], [x + 2, 2, 15], 'rubber');
  return m;
});

// ---------------------------------------------------------------------------------------------
// The field's resources (one look for everyone)

plain('steel', (m) => {
  // A seam of ore: rocks of dark stone, the steel glinting in them, rusty spoil.
  for (const [x, z, r, h] of [[0, 0, 5, 7], [-5, 3, 3.4, 5], [4, 4, 3, 4], [3, -4, 3.5, 5], [-4, -4, 3, 3]])
    for (let j = 0; j < h; j++) m.disc(x, z, r * (1 - (j / h) ** 2 * 0.7), j, j + 1, 'ore');
  m.paint([-10, 0, -10], [10, 10, 10], (i, j, k) => {
    const v = hash(i >> 1, j >> 1, k >> 1);
    return hash(i, j, k) < 0.07 ? 'oreGlint' : v < 0.35 ? 'oreDark' : v > 0.9 ? 'rust' : undefined;
  });
  m.box([-7, 0, 5], [-5, 1, 7], 'rust');
  m.box([6, 0, -1], [8, 1, 1], 'oreGlint');
  return m;
});

plain('oil', (m) => {
  // A pumpjack over a pool of crude: the frame, the walking beam and its horse's head, the
  // counterweights, a tank.
  m.disc(0, 0, 7, 0, 1, 'dirtDark');
  m.disc(-1, 3, 4, 0, 1, 'oil');
  m.box([-3, 1, -7], [3, 2, 5], 'steelDark');
  m.mx([1, 2, -1], [2, 12, 1], 'hazard');
  m.box([-2, 11, -1], [2, 13, 1], 'hazard');
  m.box([-1, 1, 5], [2, 3, 8], 'steel');
  m.mx([1, 3, -7], [3, 8, -3], 'gunmetal');
  m.disc(4, -4, 2.2, 1, 7, 'steelLight');
  m.box([2, 7, -6], [7, 8, -2], 'steelDark');
  return m;
});

/** What an engineer carries home: a crate of steel, a drum of oil. */
plain('crate', (m) => {
  m.box([-3, 0, -3], [3, 5, 3], 'crate');
  m.box([-3, 2, -3], [3, 3, 3], 'crateDark');
  m.box([-2, 5, -2], [2, 6, 2], 'oreGlint');
  return m;
});
plain('drum', (m) => {
  m.disc(0, 0, 2.6, 0, 7, 'drum');
  m.ring(0, 0, 1.8, 2.6, 2, 3, 'steelDark');
  m.ring(0, 0, 1.8, 2.6, 5, 6, 'steelDark');
  m.box([0, 7, 0], [1, 8, 1], 'black');
  return m;
});

// ---------------------------------------------------------------------------------------------
// The field's scenery: round each base a farm, out on the field the wrecks of an older war, at
// each camp the militia's tents about the supply cache they guard.

plain('house', (m) => {
  // A farmhouse: whitewashed, a pitched roof of red tin, a porch, a chimney, a water butt.
  m.box([-8, 0, -6], [8, 9, 6], 'offwhite');
  m.box([-8, 0, -6], [8, 1, 6], 'concreteDark');
  for (let i = 0; i < 6; i++) m.box([-9, 9 + i, -7 + i], [9, 10 + i, 7 - i], i === 5 ? 'brickDark' : 'roofRed');
  m.box([-8, 9, -6], [-7, 14, 6], 'offwhite');
  m.box([7, 9, -6], [8, 14, 6], 'offwhite');
  m.box([4, 9, -3], [6, 17, -1], 'brick');
  windowsZ(m, -6, 6, 6, 4, 7, 5, 0.5, 21);
  m.box([-1, 1, 6], [2, 7, 7], 'woodDark');
  m.box([-5, 0, 6], [5, 1, 9], 'woodLight');
  m.box([-5, 6, 7], [5, 7, 9], 'roofRed');
  m.mx([4, 1, 8], [5, 6, 9], 'wood');
  m.disc(-9.5, -4, 1.5, 0, 4, 'drum');
  return m;
});

plain('hut', (m) => {
  // A site cabin on blocks: corrugated sides, a door, a window, an air conditioner.
  m.box([-7, 0, -4], [7, 1, 4], 'concreteDark');
  m.box([-7, 1, -4], [7, 8, 4], 'concreteLight');
  for (let x = -6; x < 7; x += 2) m.box([x, 1, 4], [x + 1, 8, 4], 'concrete');
  for (let x = -6; x < 7; x += 2) m.box([x, 2, 3], [x + 1, 7, 4], 'concrete');
  m.box([-7, 8, -4], [7, 9, 4], 'steelDark');
  m.box([2, 1, 3], [5, 7, 4], 'steelDark');
  m.box([-5, 4, 3], [-1, 6, 4], 'glassDark');
  m.box([-6, 5, -5], [-3, 7, -4], 'steelLight');
  m.box([2, 0, 4], [5, 1, 6], 'woodLight');
  return m;
});

plain('wall', (m) => {
  // A run of barriers: concrete blocks with a tapered foot, striped at the ends.
  for (let x = -14; x < 14; x += 7) {
    m.box([x, 0, -2], [x + 6, 2, 2], 'concrete');
    m.box([x, 2, -1], [x + 6, 7, 1], 'concrete');
    m.box([x, 6, -1], [x + 6, 7, 1], 'concreteLight');
    m.box([x + 1, 3, 1], [x + 2, 5, 1], 'concreteDark');
  }
  m.box([-14, 2, 1], [-13, 6, 2], 'hazard');
  m.box([13, 2, 1], [14, 6, 2], 'hazard');
  return m;
});

plain('tent', (m) => {
  // A militia tent: a ridge of canvas over poles, its flap open, a crate and a fire outside.
  // Its two slopes (two cells thick, so no gaps on the diagonal), the ridge, the back closed.
  for (let i = 0; i < 8; i++) {
    const c = i % 3 === 0 ? 'khaki' : 'canvas';
    m.box([-9 + i, i, -7], [-7 + i, i + 1, 7], c);
    m.box([7 - i, i, -7], [9 - i, i + 1, 7], c);
    m.box([-8 + i, i, -7], [8 - i, i + 1, -6], 'canvas');
  }
  m.box([-1, 8, -7], [1, 9, 7], 'sandDark');
  // The flap tied back at the front.
  m.box([-4, 0, 7], [-2, 5, 8], 'khaki');
  m.box([-1, 0, 7], [1, 9, 8], 'woodDark');
  m.box([-1, 0, -8], [1, 9, -7], 'woodDark');
  m.box([-5, 0, 1], [-1, 1, 6], 'black');
  m.box([3, 0, 9], [6, 3, 12], 'crate');
  m.box([-4, 0, 10], [-1, 1, 13], 'woodDark');
  m.box([-3, 1, 11], [-2, 2, 12], 'fire');
  return m;
});

plain('relic', (m) => {
  // The supply cache the camps guard: crates and drums under a camouflage net on poles, a radio
  // beacon blinking over it.
  m.disc(0, 0, 9, 0, 1, 'dirt');
  for (const [x, z, w, h] of [[-6, -4, 4, 4], [-2, -5, 4, 6], [2, -4, 4, 4], [-5, 1, 3, 3], [3, 1, 4, 3]]) {
    m.box([x, 1, z], [x + w, 1 + h, z + 3], 'crate');
    m.box([x, 1 + h - 1, z], [x + w, 1 + h, z + 3], 'crateDark');
    m.box([x + 1, 2, z + 3], [x + 2, h, z + 3], 'black');
  }
  for (const [x, z] of [[-1, 2], [1, 3], [0, 4]]) m.disc(x, z, 1, 1, 5, 'drum');
  m.box([-1, 7, -4], [1, 8, -2], 'gold');
  for (const [x, z] of [[-8, -7], [7, -7], [-8, 6], [7, 6]]) m.box([x, 1, z], [x + 1, 9, z + 1], 'woodDark');
  for (let x = -8; x < 8; x++) for (let z = -7; z < 7; z++) if (hash(x >> 1, z >> 1, 3) < 0.75) m.set(x, 9, z, hash(x, z, 4) < 0.5 ? 'olive' : 'oliveDark');
  m.box([5, 9, -2], [6, 18, -1], 'black');
  m.box([4, 18, -3], [7, 19, 0], 'redLight');
  return m;
});

plain('ruin', (m) => {
  // A bombed-out house: broken walls of brick and plaster, charred beams, rubble.
  m.box([-8, 0, -7], [8, 1, 7], 'concreteDark');
  m.box([-8, 1, -7], [8, 10, -6], 'brick');
  m.box([-8, 1, -7], [-7, 12, 7], 'brick');
  m.box([7, 1, -7], [8, 6, 3], 'brick');
  m.box([-8, 1, 6], [-2, 5, 7], 'brick');
  m.paint([-9, 0, -8], [9, 13, 8], (i, j, k, c) => (c === 'brick' && (j > 4 + hash(i, k, 1) * 8 || hash(i, j, k) < 0.08) ? 'brickDark' : undefined));
  for (let x = -8; x < 8; x++) for (let z = -7; z < 7; z++) if (hash(x, z, 9) < 0.3) m.box([x, 1, z], [x + 1, 1 + Math.floor(hash(z, x, 2) * 3), z + 1], hash(x, z, 5) < 0.5 ? 'concrete' : 'brickDark');
  m.box([-6, 1, -5], [-5, 9, -4], 'black');
  for (let i = 0; i < 8; i++) m.set(-6 + i, 9 - i, -3, 'black');
  m.box([-8, 10, -7], [-4, 12, -6], false);
  m.box([2, 1, 2], [4, 2, 6], 'woodDark');
  return m;
});

plain('henge', (m) => {
  // The burned-out hulk of a tank from an older war, its turret knocked askew, rust through it.
  m.mx([5, 0, -12], [8, 4, 13], 'tread');
  m.box([-5, 1, -12], [5, 5, 12], 'rust');
  m.box([-8, 4, -12], [8, 6, 11], 'rust');
  m.box([-6, 1, 12], [6, 4, 13], 'oliveDark');
  // The turret, off its ring and tipped; the barrel bent down to the dirt.
  m.box([-9, 6, -6], [3, 10, 5], 'oliveDark');
  m.box([-8, 10, -5], [2, 11, 3], 'rust');
  m.box([-4, 7, 5], [-2, 9, 12], 'rust');
  m.box([-4, 5, 12], [-2, 7, 16], 'rust');
  m.box([-4, 2, 16], [-2, 5, 18], 'rust');
  m.paint([-10, 0, -13], [10, 12, 19], (i, j, k, c) => (c === 'tread' ? undefined : hash(i >> 1, j >> 1, k >> 1) < 0.18 ? 'gunmetal' : c === 'rust' && hash(i >> 2, j >> 1, k >> 2) < 0.45 ? 'oliveDark' : undefined));
  m.mx([3, 0, 14], [5, 1, 16], 'tread');
  m.box([8, 0, -14], [10, 2, -10], 'tread');
  return m;
});

plain('scaffold', (m) => {
  // Scaffolding round a building going up: a unit square (16 voxels) of poles, boards at each
  // level, braces, warning tape; open in the middle (the screens stretch it to the footprint).
  for (const x of [-8, -1, 7]) for (const z of [-8, -1, 7]) if (x !== -1 || z !== -1) m.box([x, 0, z], [x + 1, 16, z + 1], 'steelLight');
  for (const y of [5, 10, 15]) {
    m.box([-8, y, -8], [8, y + 1, -6], 'woodLight');
    m.box([-8, y, 6], [8, y + 1, 8], 'woodLight');
    m.box([-8, y, -8], [-6, y + 1, 8], 'woodLight');
    m.box([6, y, -8], [8, y + 1, 8], 'woodLight');
  }
  for (let i = 0; i < 5; i++) {
    m.set(-7 + i, 5 + i, 7, 'steel');
    m.set(6 - i, 5 + i, -8, 'steel');
  }
  for (let x = -8; x < 8; x += 2) m.box([x, 2, 7], [x + 1, 3, 8], 'hazard');
  return m;
});

export const SCENERY = ['house', 'hut', 'wall', 'tent', 'relic', 'ruin', 'henge'];
export const TEAMED = [...UNITS, ...BUILDINGS];
export { PLAIN, UNITS, BUILDINGS };
