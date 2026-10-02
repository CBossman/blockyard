import { Blueprint, type BlockRef, type Vec3 } from '@platform';
import { picture, voxels } from './kit';

/**
 * The maps' props as micro-block builds (meshed with the world's block textures, `props.model`):
 * what moves (portcullises, levers, the traps' spikes, blades, hammer, bell and icicles) and
 * set pieces too fine for whole blocks (banners, the emperor and his guards, lions' heads,
 * statues). Each is a `Model`: its blocks, the size of one (`scale`, in blocks) and the point of it
 * that stands at the prop's position (`pivot`, in its own blocks).
 */
export interface Model {
  bp: Blueprint;
  scale: number;
  pivot: Vec3;
}

/** A box of one block in a build: [x0, y0, z0, x1, y1, z1] (inclusive), and the block. */
type Part = [number, number, number, number, number, number, BlockRef];

/** A build from boxes (later ones over earlier ones), the bounds worked out from them. */
function parts(list: Part[]): Blueprint {
  const lo = { x: Infinity, y: Infinity, z: Infinity };
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const [x0, y0, z0, x1, y1, z1] of list) {
    lo.x = Math.min(lo.x, x0);
    lo.y = Math.min(lo.y, y0);
    lo.z = Math.min(lo.z, z0);
    hi.x = Math.max(hi.x, x1);
    hi.y = Math.max(hi.y, y1);
    hi.z = Math.max(hi.z, z1);
  }
  const bp = new Blueprint(lo, { x: hi.x - lo.x + 1, y: hi.y - lo.y + 1, z: hi.z - lo.z + 1 });
  for (const [x0, y0, z0, x1, y1, z1, b] of list) bp.fill({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 }, b);
  return bp;
}

// -------------------------------------------------------------------------------------------------
// Gates and levers
// -------------------------------------------------------------------------------------------------

/**
 * A portcullis `width` by `height` blocks: iron bars (gaps too narrow for a body) on oak cross
 * beams, pointed at the foot. Its pivot is the middle of its foot, its bars across x.
 */
export function portcullis(width: number, height: number): Model {
  const W = width * 8;
  const H = height * 8;
  const bp = voxels({ x: W, y: H, z: 3 }, (x, y, z) => {
    const bar = x % 5 === 2 || x % 5 === 3;
    const beam = y % 12 >= 8 && y % 12 <= 9 && y > 4;
    if (beam && z >= 0) return z === 1 ? 'spruce_planks' : x % 5 === 2 && z !== 1 ? 'iron_block' : 'spruce_planks';
    if (!bar || z !== 1) return undefined;
    // The points: the bar's foot narrows.
    if (y < 3) return x % 5 === 2 && y >= 1 ? 'iron_block' : y >= 2 ? 'iron_block' : undefined;
    return 'deepslate';
  });
  return { bp, scale: 1 / 8, pivot: { x: W / 2, y: 0, z: 1.5 } };
}

/** A floor lever's stand: an iron quadrant on a stone foot. Pivot: the middle of its foot. */
export function leverStand(): Model {
  const bp = parts([
    [0, 0, 0, 7, 1, 9, 'stone_bricks'],
    [1, 2, 1, 6, 2, 8, 'deepslate'],
    [0, 2, 4, 0, 5, 5, 'deepslate'],
    [7, 2, 4, 7, 5, 5, 'deepslate'],
    [0, 3, 2, 0, 4, 7, 'deepslate'],
    [7, 3, 2, 7, 4, 7, 'deepslate'],
    [1, 2, 0, 6, 2, 0, 'gilt'],
    [1, 2, 9, 6, 2, 9, 'gilt'],
  ]);
  return { bp, scale: 1 / 8, pivot: { x: 4, y: 0, z: 5 } };
}

/** A lever's handle: an iron rod with a red grip, turning about its foot (pivot) along z. */
export function leverHandle(): Model {
  const bp = parts([
    [0, 0, 0, 1, 11, 1, 'deepslate'],
    [-1, 12, -1, 2, 15, 2, 'red_concrete'],
    [0, 16, 0, 1, 16, 1, 'red_concrete'],
  ]);
  return { bp, scale: 1 / 8, pivot: { x: 1, y: 0.5, z: 1 } };
}

// -------------------------------------------------------------------------------------------------
// The traps' moving parts
// -------------------------------------------------------------------------------------------------

/** A bed of iron spikes over `w` by `d` blocks: a plate, and a spike every half block. Pivot: its corner. */
export function spikes(w: number, d: number): Model {
  const W = w * 8;
  const D = d * 8;
  const bp = voxels({ x: W, y: 16, z: D }, (x, y, z) => {
    if (y === 0) return x % 4 === 0 || z % 4 === 0 ? 'deepslate' : undefined;
    const sx = x % 4;
    const sz = z % 4;
    // A spike every 4: two across at its foot, one at its tip.
    const at = (sx === 1 || sx === 2) && (sz === 1 || sz === 2);
    if (!at) return undefined;
    if (y > 9) return sx === 1 && sz === 1 ? 'iron_block' : undefined;
    return 'iron_block';
  });
  return { bp, scale: 1 / 8, pivot: { x: 0, y: 0, z: 0 } };
}

/**
 * A pendulum: an iron pole `length` blocks long hanging from its pivot (the top), a great curved
 * blade at its foot, its edge along x (it swings about x, so across z).
 */
export function scythe(length: number): Model {
  const L = Math.round(length * 8);
  const list: Part[] = [
    [-1, -2, -1, 1, 1, 1, 'deepslate'],
    [0, -L + 6, 0, 0, -2, 0, 'deepslate'],
    [-1, -L + 6, -1, 1, -L + 8, 1, 'gilt'],
  ];
  // The blade: a crescent below the pole's foot, wide across x, sharp at both ends.
  for (let x = -14; x <= 14; x++) {
    const u = x / 14;
    const top = -L + 6 - Math.round(4 * (1 - u * u));
    const bottom = top - Math.max(1, Math.round(5 * Math.sqrt(1 - u * u)));
    list.push([x, bottom, 0, x, top, 0, Math.abs(x) > 11 || bottom === top ? 'iron_block' : 'light_gray_concrete']);
    list.push([x, bottom, 0, x, bottom, 0, 'iron_block']);
  }
  return { bp: parts(list), scale: 1 / 8, pivot: { x: 0.5, y: 0.5, z: 0.5 } };
}

/** The drop hammer's head: a block of iron-banded basalt, `w` blocks square and `h` high, its shaft above. Pivot: its foot's middle. */
export function hammerHead(w: number, h: number): Model {
  const list: Part[] = [[0, 0, 0, w - 1, h - 1, w - 1, 'basalt_bricks']];
  list.push([0, 1, 0, w - 1, 1, w - 1, 'iron_block']);
  list.push([0, h - 2, 0, w - 1, h - 2, w - 1, 'iron_block']);
  const m = Math.floor(w / 2);
  list.push([m, h, m, m, h + 9, m, 'iron_block']);
  return { bp: parts(list), scale: 1, pivot: { x: w / 2, y: 0, z: w / 2 } };
}

/** A great bronze bell, its crown at the pivot (it swings from there). */
export function bell(): Model {
  const R = 11;
  const H = 22;
  const bp = voxels({ x: R * 2 + 1, y: H + 3, z: R * 2 + 1 }, (x, y, z) => {
    const dx = x - R;
    const dz = z - R;
    const d = Math.hypot(dx, dz);
    if (y >= H) return d < 2.5 ? 'deepslate' : undefined;
    // Its profile: a flared lip, a waist, a round shoulder.
    const t = y / H;
    const r = t < 0.12 ? R - t * 10 : t < 0.8 ? R * (0.88 - (t - 0.12) * 0.42) : R * 0.6 * Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) + 1;
    if (d > r) return undefined;
    // Hollow under the shoulder, a clapper inside.
    if (t < 0.78 && d < r - 1.6) return d < 2 && y < 8 && y > 1 ? 'deepslate' : undefined;
    return y === 3 || y === 15 ? 'gilt' : 'bronze';
  });
  return { bp, scale: 1 / 8, pivot: { x: R + 0.5, y: H + 3, z: R + 0.5 } };
}

/** An icicle as it falls: a cone of ice, point down. Pivot: its point. */
export function fallingIcicle(): Model {
  const bp = voxels({ x: 5, y: 18, z: 5 }, (x, y, z) => {
    const r = 0.5 + (y / 18) * 2.2;
    return Math.hypot(x - 2, z - 2) <= r ? (y % 5 === 0 ? 'snow_block' : 'ice') : undefined;
  });
  return { bp, scale: 1 / 8, pivot: { x: 2.5, y: 0, z: 2.5 } };
}

// -------------------------------------------------------------------------------------------------
// Set pieces
// -------------------------------------------------------------------------------------------------

/** A banner's picture, 16 wide: rows from the top down; its palette by character. */
export interface BannerDesign {
  rows: string[];
  palette: Record<string, BlockRef>;
}

/** A banner hung by its top (the pivot: the middle of its top edge), the picture facing +z. */
export function banner(d: BannerDesign): Model {
  const bp = picture(d.rows, d.palette, 1);
  return { bp, scale: 1 / 8, pivot: { x: bp.size.x / 2, y: bp.size.y, z: 0.5 } };
}

/** Clothes, skin and kit for the figures below. */
export interface Dress {
  robe: BlockRef;
  trim: BlockRef;
  skin: BlockRef;
  hair: BlockRef;
  /** A laurel (the emperor), a crested helmet (a guard). */
  head?: 'laurel' | 'helmet';
  /** A spear and a shield (a guard). */
  arms?: boolean;
}

/** A standing figure about 1.9 blocks tall, facing +z (its pivot: between its feet). */
export function figure(dress: Dress): Model {
  const { robe, trim, skin, hair } = dress;
  const list: Part[] = [
    // Legs and sandals under the robe's hem.
    [1, 0, 1, 2, 4, 2, skin],
    [4, 0, 1, 5, 4, 2, skin],
    [1, 0, 1, 2, 0, 3, 'brown_concrete'],
    [4, 0, 1, 5, 0, 3, 'brown_concrete'],
    // The robe, its hem trimmed, a sash across.
    [0, 4, 0, 6, 10, 3, robe],
    [0, 4, 0, 6, 4, 3, trim],
    [0, 9, 3, 1, 10, 3, trim],
    [2, 8, 3, 3, 9, 3, trim],
    [4, 6, 3, 5, 7, 3, trim],
    // Arms.
    [-2, 6, 1, -1, 10, 2, robe],
    [-2, 5, 1, -1, 5, 2, skin],
    [7, 6, 1, 8, 10, 2, robe],
    [7, 5, 1, 8, 5, 2, skin],
    // Neck and head, the hair behind.
    [2, 11, 1, 4, 11, 2, skin],
    [1, 12, 0, 5, 15, 3, skin],
    [1, 15, 0, 5, 16, 3, hair],
    [1, 12, 0, 5, 14, 0, hair],
    [2, 13, 3, 2, 13, 3, 'black_concrete'],
    [4, 13, 3, 4, 13, 3, 'black_concrete'],
  ];
  if (dress.head === 'laurel') {
    list.push([0, 15, 0, 6, 15, 3, 'lime_concrete'], [0, 15, 1, 0, 16, 2, 'gilt'], [6, 15, 1, 6, 16, 2, 'gilt'], [3, 16, 3, 3, 16, 3, 'gilt']);
  }
  if (dress.head === 'helmet') {
    list.push([0, 14, 0, 6, 17, 3, 'gilt'], [0, 13, 0, 0, 13, 3, 'gilt'], [6, 13, 0, 6, 13, 3, 'gilt'], [3, 18, -1, 3, 20, 4, 'red_concrete']);
    list.push([2, 13, 3, 4, 13, 3, 'black_concrete']);
  }
  if (dress.arms) {
    // A spear in the right hand, a round shield on the left arm.
    list.push([-2, 0, 2, -2, 24, 2, 'spruce_planks'], [-2, 25, 2, -2, 27, 2, 'iron_block']);
    for (let y = 3; y <= 11; y++) for (let z = -1; z <= 5; z++) if (Math.hypot(y - 7, z - 2) <= 4.2) list.push([9, y, z, 9, y, z, Math.hypot(y - 7, z - 2) < 1.2 ? 'gilt' : 'red_concrete']);
  }
  return { bp: parts(list), scale: 1 / 8, pivot: { x: 3.5, y: 0, z: 2 } };
}

/** A throne: gilt and purple, high-backed. Pivot: the middle of its foot, facing +z. */
export function throne(): Model {
  const bp = parts([
    [0, 0, 0, 11, 1, 9, 'gilt'],
    [1, 2, 1, 10, 5, 8, 'purple_concrete'],
    [0, 2, 0, 1, 9, 1, 'gilt'],
    [10, 2, 0, 11, 9, 1, 'gilt'],
    [0, 2, 0, 11, 16, 1, 'purple_concrete'],
    [0, 16, 0, 11, 17, 1, 'gilt'],
    [5, 18, 0, 6, 19, 1, 'gilt'],
    [0, 6, 2, 1, 7, 8, 'gilt'],
    [10, 6, 2, 11, 7, 8, 'gilt'],
  ]);
  return { bp, scale: 1 / 8, pivot: { x: 6, y: 0, z: 5 } };
}

/** A bronze lion's head on a wall, its mouth open (the fire comes out of it), facing +z. Pivot: the mouth. */
export function lionHead(): Model {
  const bp = voxels({ x: 17, y: 17, z: 8 }, (x, y, z) => {
    const dx = x - 8;
    const dy = y - 8;
    const r = Math.hypot(dx, dy);
    // The mane: a ragged disc at the back.
    if (z <= 2) return r <= 8 - (Math.abs(Math.atan2(dy, dx) * 6) % 2 > 1 ? 1 : 0) ? (r > 6 ? 'gilt' : 'bronze') : undefined;
    // The face, its muzzle forward.
    const face = Math.abs(dx) <= 4.5 - (z - 3) * 0.4 && dy >= -5 && dy <= 4;
    if (!face) return undefined;
    // The open mouth: dark, below the nose.
    if (dy >= -4 && dy <= -2 && Math.abs(dx) <= 2) return z >= 6 ? undefined : 'black_concrete';
    if (dy === 2 && (dx === -2 || dx === 2) && z === 6) return 'black_concrete';
    return z === 7 && dy > -1 ? 'gilt' : 'bronze';
  });
  return { bp, scale: 1 / 8, pivot: { x: 8.5, y: 5, z: 7 } };
}

/** A marble statue of a gladiator on guard, sword up, about 3.6 blocks tall. Pivot: its feet, facing +z. */
export function statue(): Model {
  const m = 'diorite';
  const bp = parts([
    [1, 0, 1, 2, 6, 2, m],
    [4, 0, 2, 5, 6, 3, m],
    [0, 6, 0, 6, 11, 3, m],
    [0, 7, 0, 6, 7, 3, 'andesite'],
    [-2, 7, 1, -1, 11, 2, m],
    [7, 9, 1, 8, 11, 3, m],
    [7, 9, 4, 8, 10, 5, m],
    [7, 10, 5, 8, 18, 5, 'andesite'],
    [2, 12, 1, 4, 12, 2, m],
    [1, 13, 0, 5, 16, 3, m],
    [0, 16, 0, 6, 17, 3, m],
    [3, 18, 0, 3, 19, 4, m],
    [-4, 4, 0, -3, 12, 4, m],
  ]);
  return { bp, scale: 1 / 5, pivot: { x: 2.5, y: 0, z: 2 } };
}
