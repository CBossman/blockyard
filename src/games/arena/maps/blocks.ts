import type { BlockDefinition } from '@platform';

/**
 * The maps' own blocks (`shared.ts` lists them): the Colosseum's travertine and its painted crowd,
 * the Necropolis's crypts and graves, the Forge's basalt and magma, the Sanctum's ice. All painted
 * here in code. (31 of the game's 68 block variants.)
 */

/** A steady pseudo-random number in [0, 1) for a pixel (and a seed). */
function rnd(x: number, y: number, k = 0): number {
  let h = Math.imul(x + 31, 374761393) + Math.imul(y + 17, 668265263) + Math.imul(k + 7, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const pick = <T>(list: readonly T[], r: number): T => list[Math.floor(r * list.length) % list.length];

/** One of `colors` per pixel, in blotches (`k` seeds it). */
const mottle = (colors: readonly string[], k: number) => (x: number, y: number) => pick(colors, (rnd(x >> 1, y >> 1, k) + rnd(x, y, k + 1)) / 2);

// -------------------------------------------------------------------------------------------------
// The Colosseum
// -------------------------------------------------------------------------------------------------

const TRAV = ['#dccfb2', '#d3c5a6', '#e3d8be', '#cdbf9f'];
const TRAV_PORE = '#a8977a';

/** Travertine: warm cream stone, faintly banded, pitted with pores. */
const travertine = {
  paint: (x: number, y: number) => {
    if (rnd(x, y, 3) < 0.06) return TRAV_PORE;
    return pick(TRAV, (rnd(x >> 2, y, 1) * 0.7 + rnd(x, y, 2) * 0.3 + (y % 5 === 0 ? 0.25 : 0)) % 1);
  },
};

/** Travertine laid as ashlar: two courses a block, the joints staggered. */
const travertineBricks = {
  paint: (x: number, y: number) => {
    const course = y < 8 ? 0 : 1;
    const joint = course === 0 ? 0 : 8;
    if (y === 7 || y === 15 || x === joint) return '#a7987a';
    if (y === 0 || y === 8 || x === (joint + 1) % 16) return '#eadfc6';
    if (rnd(x, y, 5) < 0.05) return TRAV_PORE;
    return pick(TRAV, rnd(x >> 2, y >> 1, 4 + course));
  },
};

/** Gold leaf over trim: the emperor's box, the arches' keystones. */
const gilt = {
  paint: (x: number, y: number) => {
    if (rnd(x, y, 8) < 0.05) return '#fff1a8';
    return pick(['#e0ad3a', '#d6a22e', '#e8b843', '#cf9a2c'], rnd(x >> 2, y >> 1, 9) * 0.7 + rnd(x, y, 10) * 0.3);
  },
};

const SAND = ['#e0c48c', '#d8ba7f', '#e6cc98', '#d2b277', '#dcc088'];

/** The arena's sand: warm, raked fine. */
const arenaSand = {
  paint: (x: number, y: number) => pick(SAND, (rnd(x, y, 14) * 0.7 + rnd(x >> 2, y >> 1, 15) * 0.3 + (y % 4 === 0 ? 0.15 : 0)) % 1),
};

/** Sand where blood's soaked in: a dark stain spreading through it. */
const bloodySand = {
  paint: (x: number, y: number) => {
    const d = Math.hypot(x - 7.5, y - 7.5) + rnd(x >> 1, y >> 1, 11) * 4 - 2;
    if (d < 4) return rnd(x, y, 12) < 0.3 ? '#4e140c' : '#6a1d12';
    if (d < 6.5) return rnd(x, y, 12) < 0.5 ? '#8a3a22' : '#7a2c18';
    return arenaSand.paint(x, y);
  },
};

/** White marble, faintly veined: columns, statues, the mosaic's ground. */
const marble = {
  paint: (x: number, y: number) => {
    const vein = Math.abs(Math.sin(x * 0.45 + y * 0.9 + rnd(x >> 3, y >> 3, 16) * 5)) < 0.08;
    if (vein) return '#b9b6ae';
    return pick(['#efece4', '#e8e4da', '#f4f1ea', '#e2ded3'], rnd(x >> 1, y >> 1, 17) * 0.6 + rnd(x, y, 18) * 0.4);
  },
};

/** An iron grate over the pit below: bars round 5 by 5 holes. */
const grate = {
  paint: (x: number, y: number) => {
    const bar = (v: number) => v % 7 < 2;
    if (!bar(x) && !bar(y)) return null;
    return rnd(x, y, 21) < 0.18 ? '#6e4b34' : rnd(x, y, 22) < 0.5 ? '#45474c' : '#393b40';
  },
};

const SKIN = ['#f1c7a1', '#e3ad84', '#c98d61', '#a26a45', '#71472c'];
const HAIR = ['#2b1d14', '#4a3020', '#7a5230', '#c9a46a', '#161616', '#8f8a84', '#a3502a'];
const TUNIC = ['#b5382c', '#2f5fb8', '#eae2ce', '#d9a23a', '#4f8a3a', '#7a3f9a', '#cfc7b3', '#8a2a2a', '#2f8f8a', '#d26a2a'];
/** Behind and between the spectators: the seats of the row behind, in their shade. */
const ROW_SHADE = '#8a7c63';

/**
 * Two spectators side by side, seen from the front at the height of their seats: hair, a face,
 * shoulders in a tunic, arms; in `cheering` blocks, one has their arms up. Each variant (`k`)
 * picks its own people.
 */
function crowdFront(k: number, cheering: boolean) {
  return (x: number, y: number): string => {
    const side = x < 8 ? 0 : 1;
    const ox = side * 8;
    const lx = x - ox;
    const seed = k * 2 + side;
    const skin = pick(SKIN, rnd(seed, 1, 31));
    const hair = pick(HAIR, rnd(seed, 2, 32));
    const tunic = pick(TUNIC, rnd(seed, 3, 33));
    const up = cheering && side === (k % 2);
    // Arms up: fists over the head.
    if (up && (lx === 0 || lx === 7) && y >= 1 && y <= 8) return y <= 2 ? skin : tunic;
    // Hair, then the face (eyes as a darker pair).
    if (y >= 2 && y <= 3 && lx >= 2 && lx <= 5) return hair;
    if (y === 4 && (lx === 1 || lx === 6) && rnd(seed, 4, 34) < 0.5) return hair;
    if (y >= 4 && y <= 6 && lx >= 2 && lx <= 5) return y === 5 && (lx === 3 || lx === 4) ? '#2a1c14' : skin;
    if (y === 7 && lx >= 3 && lx <= 4) return skin;
    // Shoulders and body; arms at the sides (unless they're up).
    if (y >= 8 && lx >= 1 && lx <= 6) return y === 8 && (lx === 1 || lx === 6) ? ROW_SHADE : tunic;
    if (!up && y >= 10 && y <= 14 && (lx === 0 || lx === 7)) return y >= 13 ? skin : tunic;
    return ROW_SHADE;
  };
}

/** The crowd from above: the tops of their heads over their shoulders. */
function crowdTop(k: number) {
  return (x: number, y: number): string => {
    const side = x < 8 ? 0 : 1;
    const lx = x - side * 8;
    const seed = k * 2 + side;
    const hair = pick(HAIR, rnd(seed, 2, 32));
    const tunic = pick(TUNIC, rnd(seed, 3, 33));
    if (lx >= 2 && lx <= 5 && y >= 5 && y <= 9) return hair;
    if (lx >= 1 && lx <= 6 && y >= 3 && y <= 11) return tunic;
    return ROW_SHADE;
  };
}

const crowd = (k: number, cheering = false): BlockDefinition => ({
  label: 'Crowd',
  texture: { top: { paint: crowdTop(k) }, bottom: { paint: travertine.paint }, side: { paint: crowdFront(k, cheering) } },
  breakable: false,
  picker: false,
});

// -------------------------------------------------------------------------------------------------
// The Necropolis
// -------------------------------------------------------------------------------------------------

/** Old crypt stone: small dark bricks, moss in the joints. */
const cryptBricks = {
  paint: (x: number, y: number) => {
    const row = y >> 2;
    const off = row % 2 ? 4 : 0;
    const jointX = (x + off) % 8 === 0;
    if (y % 4 === 3 || jointX) return rnd(x, y, 41) < 0.35 ? '#4d6a38' : '#2b2e2b';
    return pick(['#4e524c', '#454944', '#585c55', '#3f433e'], rnd((x + off) >> 3, row, 42) * 0.6 + rnd(x, y, 43) * 0.4);
  },
};

/** Grave soil: dark, loose, a pebble here and there. */
const graveSoil = { paint: mottle(['#3b3127', '#332a20', '#43372b', '#2d251c', '#3b3127', '#4a3d2f'], 51) };

/** A headstone's face: grey, rounded at the top (the corners clear), a cross cut into it. */
const headstone = {
  paint: (x: number, y: number) => {
    const cx = Math.abs(x - 7.5);
    if (y < 4 && cx > 2 + y * 1.6) return null;
    const cross = (x >= 7 && x <= 8 && y >= 3 && y <= 11) || (y >= 5 && y <= 6 && x >= 5 && x <= 10);
    if (cross) return '#5d6064';
    return pick(['#8d9094', '#868a8e', '#969a9e', '#7e8286'], rnd(x >> 1, y >> 1, 61));
  },
};

/** Bone, stacked: the ossuary's walls. */
const bone = {
  paint: (x: number, y: number) => {
    const knob = (x % 8 < 2 || x % 8 > 5) && (y % 8 < 2 || y % 8 > 5);
    if (y % 8 === 7 || (x % 8 === 0 && y % 8 > 1 && y % 8 < 6)) return '#a59c80';
    return knob ? '#f2ecd8' : pick(['#e3dcc4', '#d9d1b6', '#ebe5cf'], rnd(x, y, 71));
  },
};

/** A lantern burning with a soul's green light. */
const soulLantern = {
  paint: (x: number, y: number) => {
    const frame = x < 2 || x > 13 || y < 2 || y > 13 || x === 7 || x === 8;
    if (frame) return '#2a2c30';
    return pick(['#7dffb0', '#5fe88f', '#a8ffcc'], rnd(x, y, 81));
  },
};

// -------------------------------------------------------------------------------------------------
// The Forge
// -------------------------------------------------------------------------------------------------

/** Basalt: dark, in rough columns. */
const basalt = {
  paint: (x: number, y: number) => {
    const col = x >> 2;
    if (x % 4 === 3 && rnd(col, y >> 2, 91) < 0.7) return '#211e1c';
    return pick(['#3b3734', '#34302d', '#433e3a', '#2f2b29'], rnd(col, y >> 3, 92) * 0.5 + rnd(x, y, 93) * 0.5);
  },
};

/** Basalt cut into blocks, the joints dark. */
const basaltBricks = {
  paint: (x: number, y: number) => {
    const off = y < 8 ? 0 : 8;
    if (y === 7 || y === 15 || (x + off) % 16 === 0) return '#1b1918';
    if (y === 0 || y === 8) return '#57514b';
    return pick(['#423d39', '#3b3733', '#4a4440'], rnd((x + off) >> 3, y >> 3, 95) * 0.5 + rnd(x, y, 96) * 0.5);
  },
};

/** Magma: a dark crust cracked through to glowing rock. */
const magma = {
  paint: (x: number, y: number) => {
    const crack = Math.abs(Math.sin(x * 0.9 + rnd(x >> 2, y >> 2, 101) * 4) + Math.cos(y * 0.8 + rnd(y >> 2, x >> 2, 102) * 4)) < 0.35;
    if (crack) return rnd(x, y, 103) < 0.4 ? '#ffd25a' : '#ff8a1e';
    return pick(['#4a1c10', '#3a160c', '#5a2414', '#2e120a'], rnd(x, y, 104));
  },
};

/** Cinders: the forge floor, ash over dark grit, an ember still glowing here and there. */
const cinder = {
  paint: (x: number, y: number) => {
    if (rnd(x, y, 111) < 0.025) return '#e8742a';
    return pick(['#4a4541', '#3f3a37', '#56504a', '#38332f'], rnd(x >> 1, y >> 1, 112) * 0.5 + rnd(x, y, 113) * 0.5);
  },
};

// -------------------------------------------------------------------------------------------------
// The Sanctum
// -------------------------------------------------------------------------------------------------

/** Ice cut into bricks: pale blue, the joints frosted white. */
const iceBricks = {
  paint: (x: number, y: number) => {
    const off = y < 8 ? 4 : 12;
    if (y === 7 || y === 15 || (x + off) % 16 === 0) return '#eef8ff';
    return pick(['#b9d9ee', '#a9cde6', '#c7e3f4', '#b0d3ea'], rnd((x + off) >> 3, y >> 3, 121) * 0.5 + rnd(x, y, 122) * 0.5);
  },
};

/** Old glacier ice: deep blue, streaked. */
const glacier = {
  paint: (x: number, y: number) => {
    const streak = Math.abs(((x * 0.6 + y * 0.35 + rnd(0, y >> 2, 131) * 3) % 5) - 2.5) < 0.4;
    if (streak) return '#9fd2f2';
    return pick(['#5b9fd6', '#4c90c8', '#68acdf', '#5596cd'], rnd(x >> 1, y >> 1, 132));
  },
};

/** Blue-grey temple stone, carved in panels. */
const sanctumStone = {
  paint: (x: number, y: number) => {
    if (x === 0 || y === 0) return '#a6b3c2';
    if (x === 15 || y === 15) return '#55606d';
    return pick(['#7d8a99', '#748190', '#86939f', '#6f7c8b'], rnd(x >> 1, y >> 1, 141));
  },
};

/** A frost crystal: shards of cold light (crossed planes). */
const crystal = {
  paint: (x: number, y: number) => {
    const shard = (cx: number, w: number, top: number) => y >= top && Math.abs(x - cx) <= w * ((y - top) / (16 - top)) + 0.5;
    if (shard(7.5, 2.5, 1) || shard(3.5, 1.5, 6) || shard(12, 1.5, 4)) return rnd(x, y, 151) < 0.3 ? '#e8fdff' : x % 3 === 0 ? '#6fd8f4' : '#a2ecff';
    return null;
  },
};

/** Icicles hanging from a vault (crossed planes): thick at the top, a point below. */
const icicle = {
  paint: (x: number, y: number) => {
    const spike = (cx: number, w: number, len: number) => y <= len && Math.abs(x - cx) <= w * (1 - y / (len + 1)) + 0.3;
    if (spike(7.5, 2.6, 15) || spike(3, 1.4, 9) || spike(12.5, 1.6, 11)) return x % 4 === 1 ? '#f4fbff' : rnd(x, y, 161) < 0.4 ? '#c2e4f7' : '#d9effb';
    return null;
  },
};

export const MAP_BLOCKS: Record<string, BlockDefinition> = {
  travertine: { texture: travertine, hardness: 2 },
  travertine_bricks: { label: 'Travertine Bricks', texture: travertineBricks, hardness: 2 },
  travertine_slab: { label: 'Travertine Slab', texture: travertineBricks, shape: 'slab', full: 'travertine_bricks', hardness: 2 },
  gilt: { texture: gilt, hardness: 2, glow: 0.12 },
  arena_sand: { label: 'Arena Sand', texture: arenaSand, hardness: 0.5 },
  bloody_sand: { label: 'Bloody Sand', texture: bloodySand, hardness: 0.5 },
  marble: { texture: marble, hardness: 2 },
  arena_grate: { label: 'Grate', texture: grate, transparency: 'cutout', hardness: 3 },
  crowd_a: crowd(0),
  crowd_b: crowd(1),
  crowd_c: crowd(2, true),
  // For props (statues, the emperor, lions' heads, the bell): not built with.
  bronze: { texture: { color: ['#a8713a', '#9a6531', '#b57e43', '#8c5a2b'], noise: 0.18, scale: 2 }, hardness: 2, picker: false },
  flesh: { texture: { color: ['#e2b08a', '#d9a47e'], noise: 0.06 }, hardness: 1, picker: false },

  crypt_bricks: { label: 'Crypt Bricks', texture: cryptBricks, hardness: 2 },
  grave_soil: { label: 'Grave Soil', texture: graveSoil, hardness: 0.6 },
  headstone: {
    texture: { front: headstone, back: headstone, all: { color: ['#7e8286', '#868a8e'], noise: 0.1 } },
    boxes: [[1, 0, 6, 15, 13, 10]],
    facing: true,
    transparency: 'cutout',
    hardness: 2,
  },
  bone_block: { label: 'Bones', texture: bone, hardness: 1.5 },
  soul_lantern: { label: 'Soul Lantern', texture: soulLantern, boxes: [[4, 0, 4, 12, 10, 12]], light: 12, glow: 0.9 },

  basalt: { texture: basalt, hardness: 2.5 },
  basalt_bricks: { label: 'Basalt Bricks', texture: basaltBricks, hardness: 2.5 },
  magma: { texture: magma, light: 9, glow: 0.85, hardness: 2 },
  cinder: { texture: cinder, hardness: 0.8 },

  ice_bricks: { label: 'Ice Bricks', texture: iceBricks, hardness: 1.5 },
  glacier: { texture: glacier, glow: 0.2, hardness: 2 },
  sanctum_stone: { label: 'Sanctum Stone', texture: sanctumStone, hardness: 2 },
  frost_crystal: { label: 'Frost Crystal', texture: crystal, shape: 'cross', light: 10, glow: 1, hardness: 0.5 },
  icicle: { texture: icicle, shape: 'cross', transparency: 'cutout', glow: 0.25, hardness: 0.3 },
};
