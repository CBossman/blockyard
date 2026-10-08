import { Blueprint, math, type BlockRef, type GameContext, type Player, type Prop, type PropModel, type Vec3 } from '@platform';
import { CENTER, RADIUS } from './island';

/**
 * The drop bus: a balloon airship that crosses the island on a line each match, with everyone
 * aboard until they step off the side (or it's over the far shore and tips them out). It's a solid
 * prop, so people walk its deck as it sails.
 *
 * Its own space: the origin is the middle of the deck's top, the bow points toward -z and +y is up.
 */

/** Height the bus flies at (blocks, in the world), and how fast it goes. */
export const ALTITUDE = 175;
export const SPEED = 15;
/** How far past the island's edge the route starts and ends. */
const OVERRUN = 45;
/** The deck's half length and half width; the gangways (gaps in the rail) are amidships. */
const LENGTH = 13;
const WIDTH = 4;
export const GANGWAY = { z0: -2, z1: 2 };

/** Half the hull's width at `z`: full amidships, a pointed bow, a narrower stern. */
const half = (z: number) => (z < -7 ? Math.round(WIDTH * Math.sqrt(Math.max(0, (z + LENGTH) / 6))) : z > 8 ? WIDTH - 1 : WIDTH);
const inside = (x: number, z: number) => z >= -LENGTH && z <= LENGTH - 1 && Math.abs(x) <= half(z);
const edge = (x: number, z: number) => inside(x, z) && (!inside(x - 1, z) || !inside(x + 1, z) || !inside(x, z - 1) || !inside(x, z + 1));

const BAG = { y: 16, rx: 7, ry: 6, rz: 14.5 };
const inBag = (x: number, y: number, z: number) => (x / BAG.rx) ** 2 + ((y + 0.5 - BAG.y) / BAG.ry) ** 2 + ((z + 0.5) / BAG.rz) ** 2 <= 1;

function model(): Blueprint {
  const bp = new Blueprint({ x: -9, y: -6, z: -LENGTH - 2 }, { x: 19, y: 30, z: LENGTH * 2 + 4 });
  const set = (x: number, y: number, z: number, b: BlockRef) => bp.set(x, y, z, b);
  for (let z = -LENGTH; z < LENGTH; z++)
    for (let x = -WIDTH; x <= WIDTH; x++) {
      if (!inside(x, z)) continue;
      // The deck, edged with the hull's planking; the hull narrows below it to a keel.
      set(x, -1, z, edge(x, z) ? 'spruce_planks' : 'oak_planks');
      for (let d = 1; d <= 3; d++) {
        const w = half(z) - d;
        if (Math.abs(x) <= w) set(x, -1 - d, z, Math.abs(x) === w || d === 3 ? 'spruce_planks' : 'birch_planks');
      }
      // A rail two blocks high round the deck, open at the gangways amidships.
      if (edge(x, z) && !(Math.abs(x) === WIDTH && z >= GANGWAY.z0 && z <= GANGWAY.z1)) {
        set(x, 0, z, 'spruce_planks');
        set(x, 1, z, 'fence');
      }
    }
  // Lamps on the rail's corners and at the bow.
  for (const [x, z] of [
    [-WIDTH, -6],
    [WIDTH, -6],
    [-WIDTH, 6],
    [WIDTH, 6],
    [0, -LENGTH],
  ])
    set(x, 2, z, 'lamp');
  // Struts up to the gas bag.
  for (const [x, z] of [
    [-3, -7],
    [3, -7],
    [-3, 7],
    [3, 7],
  ])
    for (let y = 0; y <= 9; y++) set(x, y, z, 'oak_log');
  // The bag: red and white bands.
  for (let y = 8; y <= 24; y++)
    for (let z = -16; z <= 16; z++) for (let x = -8; x <= 8; x++) if (inBag(x, y, z)) set(x, y, z, Math.floor((z + 20) / 3) % 2 === 0 ? 'red_wool' : 'white_wool');
  // A little propeller housing on the stern.
  for (let y = -1; y <= 1; y++) set(0, y, LENGTH, 'spruce_log');
  return bp;
}

/** The line the bus flies this match, and how long it takes. */
export interface Route {
  from: Vec3;
  to: Vec3;
  /** A unit vector along it (x, z). */
  dir: [number, number];
  length: number;
  seconds: number;
}

/** A route straight across the island at a random angle, off to one side of the middle by up to a third of its radius. */
export function pickRoute(game: GameContext): Route {
  const a = game.rng.range(0, Math.PI * 2);
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  const side = game.rng.range(-RADIUS / 3, RADIUS / 3);
  const reach = RADIUS + OVERRUN;
  const mid = { x: CENTER.x - dz * side, z: CENTER.z + dx * side };
  const from = { x: mid.x - dx * reach, y: ALTITUDE, z: mid.z - dz * reach };
  const to = { x: mid.x + dx * reach, y: ALTITUDE, z: mid.z + dz * reach };
  const length = reach * 2;
  return { from, to, dir: [dx, dz], length, seconds: length / SPEED };
}

let busModel: PropModel | null = null;

/** Mesh the bus once, in `setup` (every match spawns a copy). */
export function prepareBus(game: GameContext) {
  busModel = game.props.model(model());
}

export class Bus {
  readonly prop: Prop;
  /** Seconds along the route (0 while parked). */
  t = 0;
  sailing = false;

  constructor(
    private game: GameContext,
    readonly route: Route,
  ) {
    this.prop = game.props.spawn(busModel!, { solid: true });
    this.place();
  }

  /** Where the bus is now. */
  get position(): Vec3 {
    const k = Math.min(1, this.t / this.route.seconds);
    const { from, to } = this.route;
    return { x: from.x + (to.x - from.x) * k, y: ALTITUDE, z: from.z + (to.z - from.z) * k };
  }

  /** How far along the route (0..1). */
  get progress(): number {
    return Math.min(1, this.t / this.route.seconds);
  }

  private place() {
    const p = this.position;
    const [dx, dz] = this.route.dir;
    this.prop.position.set(p.x, p.y + Math.sin(this.t * 0.9) * 0.15, p.z);
    // The bow (-z) points the way it goes.
    this.prop.quaternion.setFromEuler(new math.Euler(0, Math.atan2(-dx, -dz), 0));
  }

  update(dt: number) {
    if (this.sailing) this.t = Math.min(this.route.seconds, this.t + dt);
    this.place();
  }

  /** A spot on the deck, in the world: `i`th of the places along the deck, so people don't stand in each other. */
  deckSpot(i: number): Vec3 {
    const row = Math.floor(i / 3);
    const col = (i % 3) - 1;
    return this.prop.toWorld({ x: col * 2 + 0.5, y: 0.2, z: -6 + row * 2 + (i % 2) * 0.5 });
  }

  /** Put someone on the deck. */
  seat(p: Player, i: number) {
    const [dx, dz] = this.route.dir;
    p.teleport(this.deckSpot(i), Math.atan2(-dx, -dz), -0.1);
    p.protect(3);
  }

  /** A gangway's outer edge on one side (`1` starboard, `-1` port), in the world: where a bot walks to leave. */
  gangway(side: 1 | -1): Vec3 {
    return this.prop.toWorld({ x: side * (WIDTH + 2), y: 0, z: 0 });
  }

  /** Whether someone's on the deck. */
  carries(p: Player): boolean {
    return p.riding === this.prop;
  }

  /** The bus is done: it stops being a floor (whoever's still aboard falls), and goes. */
  retire(after = 1.5) {
    this.prop.solid = false;
    this.game.clock.after(after, () => this.prop.remove());
  }
}
