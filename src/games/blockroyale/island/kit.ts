import { Blueprint, type BlockRef } from '@platform';

/**
 * Drawing a landmark. A `Site` is a patch of ground flattened for a build (`terraform`) and the
 * blueprint stamped over it; its coordinates are the build's own: `x` and `z` from the middle of
 * the site (+x east, +z south), `y` from the ground (0 is the ground's top layer, which a floor
 * replaces; 1 is the first layer of air above it, 2 and 3 are a doorway). A site's helpers draw
 * boxes, shells, gable roofs, houses and furniture, and record where the loot goes.
 */

export type Facing = 'north' | 'east' | 'south' | 'west';

/** Where something to find is: a chest (a block that opens) or a pickup lying about. `tier` is how good the loot is (0..4). */
export interface LootSpot {
  kind: 'chest' | 'floor';
  x: number;
  y: number;
  z: number;
  tier: number;
  /** Which landmark it belongs to (so a bot knows where it's looted). */
  site: string;
  facing?: Facing;
  /** A HUD marker over it (a supply drop's), taken down when it's opened. */
  marker?: string;
}

/** A small seeded random: every machine builds the same landmarks, so a build may not use `Math.random`. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The full block that goes with a roof's stairs and slabs (the ceiling under it). */
const SOLID: Record<string, string> = {
  oak: 'oak_planks',
  spruce: 'spruce_planks',
  birch: 'birch_planks',
  cobblestone: 'cobblestone',
  stone_brick: 'stone_bricks',
  brick: 'bricks',
};

export type Pen = BlockRef | ((x: number, y: number, z: number) => BlockRef | undefined);

export const OPPOSITE: Record<Facing, Facing> = { north: 'south', south: 'north', east: 'west', west: 'east' };
/** The step (x, z) a facing points along. */
export const STEP: Record<Facing, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
export const FACINGS: Facing[] = ['north', 'east', 'south', 'west'];

export interface HouseOptions {
  /** Wall height above the floor (default 4). */
  h?: number;
  wall?: BlockRef;
  /** Corner posts (default logs). */
  post?: BlockRef;
  floor?: BlockRef;
  /** The roof's stairs and slab ('oak', 'spruce', 'birch', 'cobblestone', 'stone_brick', 'brick'). */
  roof?: string;
  /** Which side the door's on. */
  door?: Facing;
  /** Chest tiers (one chest each, against the back wall); none for no chest. */
  chests?: number[];
  /** Furniture and lamps inside. */
  furnish?: boolean;
  /** Windows (default true). */
  windows?: boolean;
  /** Leave the roof off (a ruin). */
  open?: boolean;
}

export class Site {
  readonly bp: Blueprint;
  readonly loot: LootSpot[] = [];
  /** Seeded by its name: furniture and variety, the same on every machine. */
  readonly rand: () => number;
  /** What the map calls it. */
  label = '';
  /** How much ground is flattened round it: flat out to `flat` blocks, then blended back into the land over `blend`. */
  flat: number;
  blend = 14;
  /** Raise or sink the flattened ground by this much against the ground (a hill for a tower). */
  lift = 0;

  constructor(
    readonly name: string,
    /** Where the middle of the site is in the world. */
    readonly cx: number,
    readonly cz: number,
    /** The ground's top layer (a block's y). */
    readonly ground: number,
    /** The blueprint covers this many blocks each way from the middle (builds stay within the inscribed circle). */
    readonly radius: number,
    /** Room above and below the ground. */
    readonly up = 40,
    readonly down = 10,
  ) {
    this.flat = radius;
    this.rand = seeded([...name].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261));
    this.bp = new Blueprint({ x: cx - radius, y: ground - down, z: cz - radius }, { x: radius * 2 + 1, y: up + down + 1, z: radius * 2 + 1 });
  }

  /** The terraform that flattens the ground for this site (`world.terraform`). */
  get terraform() {
    return { x: this.cx, z: this.cz, radius: this.flat, blend: this.blend, height: this.ground + this.lift + 0.5 };
  }

  /** The world position of a site coordinate. */
  at(x: number, y: number, z: number) {
    return { x: this.cx + x, y: this.ground + y, z: this.cz + z };
  }

  set(x: number, y: number, z: number, block: BlockRef) {
    this.bp.set(this.cx + x, this.ground + y, this.cz + z, block);
    return this;
  }

  /** What's been drawn at a spot (as written). */
  get(x: number, y: number, z: number) {
    return this.bp.get(this.cx + x, this.ground + y, this.cz + z);
  }

  /** A solid box, corners inclusive. `pen` may be a function of the site coordinates. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, pen: Pen) {
    const f = typeof pen === 'function' ? pen : () => pen;
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          const b = f(x, y, z);
          if (b !== undefined) this.set(x, y, z, b);
        }
    return this;
  }

  /** The walls of a box (its floor and roof left alone), a ring of blocks a layer. */
  shell(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, pen: Pen) {
    const f = typeof pen === 'function' ? pen : () => pen;
    return this.box(x0, y0, z0, x1, y1, z1, (x, y, z) =>
      x === Math.min(x0, x1) || x === Math.max(x0, x1) || z === Math.min(z0, z1) || z === Math.max(z0, z1) ? f(x, y, z) : undefined,
    );
  }

  /** Clear a box to air (a doorway, a hall inside something solid, a pit). */
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    return this.box(x0, y0, z0, x1, y1, z1, 'air');
  }

  /** A filled disc on one layer (a round tower, a well), or a ring with `hole` blocks cut from its middle. */
  disc(x: number, y: number, z: number, radius: number, pen: Pen, hole = 0) {
    const f = typeof pen === 'function' ? pen : () => pen;
    for (let dz = -Math.ceil(radius); dz <= Math.ceil(radius); dz++)
      for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++) {
        const d = Math.hypot(dx, dz);
        if (d > radius || d < hole) continue;
        const b = f(x + dx, y, z + dz);
        if (b !== undefined) this.set(x + dx, y, z + dz, b);
      }
    return this;
  }

  /** A round tower: a shell of `radius` from `y0` to `y1`, hollow inside. */
  round(x: number, z: number, y0: number, y1: number, radius: number, wall: BlockRef) {
    for (let y = y0; y <= y1; y++) this.disc(x, y, z, radius, (px, _y, pz) => (Math.hypot(px - x, pz - z) > radius - 1.1 ? wall : 'air'));
    return this;
  }

  /** A stair block climbing toward `dir` (so the high side is that way). */
  stairs(x: number, y: number, z: number, kind: string, dir: Facing, top = false) {
    return this.set(x, y, z, `${kind}_stairs[facing=${dir},half=${top ? 'top' : 'bottom'}]`);
  }

  /** A chest facing `dir`, with loot of `tier` in it. */
  chest(x: number, y: number, z: number, dir: Facing, tier: number) {
    this.set(x, y, z, `chest[facing=${dir}]`);
    const p = this.at(x, y, z);
    this.loot.push({ kind: 'chest', ...p, tier, site: this.name, facing: dir });
    return this;
  }

  /** Something lying about on the floor (a pickup of `tier`, spawned when someone's near). */
  floorLoot(x: number, y: number, z: number, tier: number) {
    const p = this.at(x, y, z);
    this.loot.push({ kind: 'floor', ...p, tier, site: this.name });
    return this;
  }

  /** A ladder up a wall: its blocks face away from the wall they hang on. */
  ladder(x: number, y0: number, y1: number, z: number, dir: Facing) {
    for (let y = y0; y <= y1; y++) this.set(x, y, z, `ladder[facing=${dir}]`);
    return this;
  }

  /** A torch-lamp on a wall at a height (a glowing lamp block: reads from outside, lights a room). */
  lamp(x: number, y: number, z: number) {
    return this.set(x, y, z, 'lamp');
  }

  /**
   * A gable-roofed building: floor, four walls with corner posts, windows, a door, a roof that
   * peaks along its longer side, and furniture and chests inside. `(x0, z0)` is its north-west
   * corner; it's `w` blocks along x and `d` along z (the outer size). Returns the inside's range.
   */
  house(x0: number, z0: number, w: number, d: number, o: HouseOptions = {}) {
    const h = o.h ?? 4;
    const wall = o.wall ?? 'oak_planks';
    const post = o.post ?? 'oak_log';
    const floor = o.floor ?? 'spruce_planks';
    const roof = o.roof ?? 'spruce';
    const x1 = x0 + w - 1;
    const z1 = z0 + d - 1;
    const door = o.door ?? 'south';
    this.box(x0, 0, z0, x1, 0, z1, floor);
    this.shell(x0, 1, z0, x1, h, z1, wall);
    // Corner posts.
    for (const [px, pz] of [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1],
    ])
      this.box(px, 1, pz, px, h, pz, post);
    // The doorway, in the middle of its side, and a window to each side of it.
    const mid = door === 'north' || door === 'south' ? Math.floor((x0 + x1) / 2) : Math.floor((z0 + z1) / 2);
    const dx = door === 'east' ? x1 : door === 'west' ? x0 : mid;
    const dz = door === 'south' ? z1 : door === 'north' ? z0 : mid;
    this.clear(dx, 1, dz, dx, 2, dz);
    if (o.windows !== false) {
      // Along each wall: a window a couple in from each corner and one in the middle, never beside the door.
      const spots = (a0: number, a1: number) => [...new Set([a0 + 2, a1 - 2, Math.floor((a0 + a1) / 2)])].filter((v) => v > a0 && v < a1);
      const nearDoor = (side: Facing, v: number) => side === door && Math.abs(v - mid) <= 1;
      if (w >= 5)
        for (const x of spots(x0, x1)) {
          if (!nearDoor('north', x)) this.box(x, 2, z0, x, 3, z0, 'glass_pane');
          if (!nearDoor('south', x)) this.box(x, 2, z1, x, 3, z1, 'glass_pane');
        }
      if (d >= 5)
        for (const z of spots(z0, z1)) {
          if (!nearDoor('west', z)) this.box(x0, 2, z, x0, 3, z, 'glass_pane');
          if (!nearDoor('east', z)) this.box(x1, 2, z, x1, 3, z, 'glass_pane');
        }
    }
    if (!o.open) this.gable(x0, z0, x1, z1, h + 1, roof, wall);
    const range = { x0: x0 + 1, x1: x1 - 1, z0: z0 + 1, z1: z1 - 1 };
    if (o.furnish !== false) this.furnish(range, door, o.chests ?? [], h, o.open ?? false);
    return range;
  }

  /** A gable roof over the box (x0..x1, z0..z1) starting at layer `y`, its ridge along the longer side. */
  gable(x0: number, z0: number, x1: number, z1: number, y: number, kind: string, gableWall: BlockRef) {
    const alongX = x1 - x0 >= z1 - z0;
    const [a0, a1, b0, b1] = alongX ? [z0, z1, x0, x1] : [x0, x1, z0, z1];
    const put = (a: number, b: number, yy: number, block: BlockRef) => (alongX ? this.set(b, yy, a, block) : this.set(a, yy, b, block));
    for (let k = 0; a0 - 1 + k <= a1 + 1 - k; k++) {
      const lo = a0 - 1 + k;
      const hi = a1 + 1 - k;
      const yy = y + k;
      for (let b = b0; b <= b1; b++) {
        if (lo === hi) {
          put(lo, b, yy, `${kind}_slab`);
          continue;
        }
        // Climbing toward the ridge: from the low edge toward +a, and from the high edge toward -a.
        const toHigh: Facing = alongX ? 'south' : 'east';
        const toLow: Facing = alongX ? 'north' : 'west';
        put(lo, b, yy, `${kind}_stairs[facing=${toHigh},half=bottom]`);
        put(hi, b, yy, `${kind}_stairs[facing=${toLow},half=bottom]`);
        // The ceiling between them (and the gable's wall at the two ends).
        for (let a = lo + 1; a < hi; a++) put(a, b, yy, b === b0 || b === b1 ? gableWall : (SOLID[kind] ?? 'oak_planks'));
      }
    }
    return this;
  }

  /** Beds, tables, shelves and a lamp inside a room (`r`: its inside), and the chests along its back wall. */
  furnish(r: { x0: number; x1: number; z0: number; z1: number }, door: Facing, chests: number[], h: number, open: boolean) {
    const back = OPPOSITE[door];
    const spots = (): [number, number, Facing][] => {
      // Along the back wall, then each side wall: where something can stand against a wall.
      const out: [number, number, Facing][] = [];
      const sides: Record<Facing, Facing[]> = { north: ['west', 'east'], south: ['west', 'east'], east: ['north', 'south'], west: ['north', 'south'] };
      const line = (side: Facing): [number, number, Facing][] => {
        const res: [number, number, Facing][] = [];
        if (side === 'north' || side === 'south') for (let x = r.x0; x <= r.x1; x++) res.push([x, side === 'north' ? r.z0 : r.z1, OPPOSITE[side]]);
        else for (let z = r.z0; z <= r.z1; z++) res.push([side === 'west' ? r.x0 : r.x1, z, OPPOSITE[side]]);
        return res;
      };
      out.push(...line(back));
      for (const s of sides[back]) out.push(...line(s));
      return out;
    };
    const free = spots().filter(([x, z]) => !this.get(x, 1, z));
    const take = (): [number, number, Facing] | undefined => {
      const i = Math.floor(this.rand() * Math.min(free.length, 4));
      return free.splice(i, 1)[0];
    };
    // Chests against the back wall, spread apart; the rest of the room's walls are for furniture.
    const wall = free.filter(([x, z]) => (back === 'north' ? z === r.z0 : back === 'south' ? z === r.z1 : back === 'west' ? x === r.x0 : x === r.x1));
    chests.forEach((tier, i) => {
      const pick = wall[Math.min(wall.length - 1, Math.floor(((i + 0.5) * wall.length) / chests.length))];
      if (!pick) return;
      free.splice(free.indexOf(pick), 1);
      this.chest(pick[0], 1, pick[1], pick[2], tier);
    });
    if (!open) {
      const [x, z, face] = take() ?? [r.x0, r.z0, 'south' as Facing];
      const roll = this.rand();
      if (roll < 0.4) {
        // A bed (two blocks long, its head to the wall).
        const [sx, sz] = STEP[OPPOSITE[face]];
        if (!this.get(x + sx, 1, z + sz)) {
          this.set(x, 1, z, `red_bed[facing=${OPPOSITE[face]},part=head]`);
          this.set(x + sx, 1, z + sz, `red_bed[facing=${OPPOSITE[face]},part=foot]`);
        }
      } else if (roll < 0.7) {
        this.set(x, 1, z, 'bookshelf').set(x, 2, z, 'bookshelf');
      } else {
        // A table: a fence post with a slab on it.
        this.set(x, 1, z, 'fence').set(x, 2, z, 'oak_slab[type=bottom]');
      }
      this.lamp(Math.floor((r.x0 + r.x1) / 2), h, Math.floor((r.z0 + r.z1) / 2));
    }
  }
}
