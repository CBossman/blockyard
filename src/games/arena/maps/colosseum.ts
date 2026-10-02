import { Blueprint, type BlockRef } from '@platform';
import { box, faceTo, gateAt, hash, wallTorch } from './kit';
import { banner, figure, lionHead, statue, throne, type BannerDesign } from './models';
import { FLOOR, type ArenaMap, type Decor, type Fire, type TrapSpec } from './registry';

/**
 * The Colosseum: a sand pit walled in travertine, its podium wall painted Pompeian red under
 * lions' heads that breathe fire, ten tiers of crowd rising to a gallery and the arcaded facade,
 * masts on its rim. Four gates with portcullises (the north one under the emperor's box), iron
 * grates over the hypogeum where spikes wait, two podia to fight from, broken columns and statues.
 */

/** Its middle: the middle of block (0, 0), which every ring below is round. */
const C = { x: 0.5, z: 0.5 };
/** The pit's wall (its inner face), the podium's outer edge, the stands' back wall, the facade's outer face. */
const PIT = 22;
const POD = 25;
const BACK = 35;
const OUT = 38.5;
/** The podium's top (the front row stands on it). */
const POD_TOP = FLOOR + 6;
/** Where the tiers end, and the gallery's floor over them. */
const TIERS = BACK - POD;
const GALLERY = POD_TOP + TIERS + 1;
const ATTIC = FLOOR + 26;

/** The gates: east, south, west and north (under the emperor's box). */
const GATES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
/** The lions' heads on the pit wall, between the gates. */
const LIONS = [Math.PI / 4, (Math.PI * 3) / 4, (-Math.PI * 3) / 4, -Math.PI / 4];
/** Monsters come into the gates' pens here. */
const PEN = 27.5;

/** The spike grates: in front of the north gate (before the emperor) and the south one. */
const GRATES = [box({ x: -2, y: FLOOR, z: -12 }, { x: 2, y: FLOOR, z: -8 }), box({ x: -2, y: FLOOR, z: 8 }, { x: 2, y: FLOOR, z: 12 })];
/** The podia to fight from, east and west: x from..to, 2 high. */
const PODIA = [
  { x0: 13, x1: 16, z0: -3, z1: 3 },
  { x0: -16, x1: -13, z0: -3, z1: 3 },
];

const ang = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
/** How far (blocks, round the ring at radius `d`) angle `a` is from `b`. */
const arc = (a: number, b: number, d: number) => {
  const t = Math.abs(ang(a) - ang(b));
  return Math.min(t, Math.PI * 2 - t) * d;
};
/** Where block (x, z) is across a gate's way (its `side`, blocks from the axis), and along it. */
function inGate(x: number, z: number): { g: number; side: number; along: number } | null {
  for (let g = 0; g < GATES.length; g++) {
    const fx = Math.cos(GATES[g]);
    const fz = Math.sin(GATES[g]);
    const along = x * fx + z * fz;
    const side = -x * fz + z * fx;
    if (along > 0 && Math.abs(side) < 4.5) return { g, side, along };
  }
  return null;
}

function build(): Blueprint {
  const bp = Blueprint.centered(0, 0, Math.ceil(OUT) + 1, FLOOR - 4, ATTIC + 6);

  bp.columns(0, 0, OUT, (x, z, d, a) => {
    if (d < PIT) return pit(bp, x, z, d, a);
    if (d < POD) return podium(bp, x, z, d, a);
    if (d < BACK) return tier(bp, x, z, d, a);
    return rim(bp, x, z, d, a);
  });
  gates(bp);
  box_(bp);
  features(bp);
  return bp;
}

/** The pit's floor: a mosaic in the middle, paths to the gates, sand stained and scuffed, paving round the wall's foot. */
function pit(bp: Blueprint, x: number, z: number, d: number, a: number) {
  for (let y = FLOOR - 3; y < FLOOR; y++) bp.set(x, y, z, 'stone');
  let floor: BlockRef;
  if (d < 4.6) floor = mosaic(d, a);
  else if (d > PIT - 1.6) floor = hash(x, z, 1) < 0.15 ? 'travertine' : 'travertine_bricks';
  else {
    const g = inGate(x, z);
    const worn = hash(x, z, 2);
    if (g && Math.abs(g.side) < 1.6) floor = worn < 0.2 ? 'sand' : worn < 0.3 ? 'travertine' : 'travertine_bricks';
    else {
      // Sand, gravel where it's been churned, blood where it's soaked in (in blots).
      const blot = hash(x >> 2, z >> 2, 3) + hash(x, z, 4) * 0.25;
      floor = blot > 1.08 ? 'bloody_sand' : worn < 0.07 ? 'gravel' : worn < 0.1 ? 'sandstone' : 'sand';
    }
  }
  bp.set(x, FLOOR, z, floor);
}

/** The emperor's star: red rays on white marble in a gilt ring. */
function mosaic(d: number, a: number): BlockRef {
  if (d > 3.9) return 'gilt';
  if (d < 0.8) return 'gilt';
  const ray = Math.abs(Math.sin(a * 4)) < 0.5 / Math.max(d, 1) + 0.1;
  return ray ? 'red_concrete' : 'diorite';
}

/**
 * The podium wall: Pompeian red panels between travertine pilasters, a gilt band, a cornice; on
 * top, a parapet and the front row of the crowd.
 */
function podium(bp: Blueprint, x: number, z: number, d: number, a: number) {
  for (let y = FLOOR - 3; y <= POD_TOP; y++) bp.set(x, y, z, 'travertine');
  if (d < PIT + 1) {
    const pilaster = (arc(a, 0, PIT) % 7) < 1.3;
    for (let y = FLOOR + 1; y <= POD_TOP; y++) {
      let b: BlockRef = 'travertine_bricks';
      if (y === FLOOR + 1) b = 'travertine';
      else if (y === FLOOR + 5) b = 'gilt';
      else if (y < FLOOR + 5 && !pilaster) b = 'red_concrete';
      bp.set(x, y, z, b);
    }
    // The parapet over it.
    bp.set(x, POD_TOP + 1, z, 'travertine_slab');
    return;
  }
  bp.set(x, POD_TOP, z, 'travertine_bricks');
  // The front row: senators in white.
  if (d >= POD - 1.2 && hash(x, z, 7) < 0.7) bp.set(x, POD_TOP + 1, z, 'crowd_b');
}

/** The tiers: a step a row, the crowd on them; aisles every so often, and doorways into the stands. */
function tier(bp: Blueprint, x: number, z: number, d: number, a: number) {
  const i = Math.floor(d - POD);
  const top = POD_TOP + 1 + i;
  for (let y = FLOOR - 3; y <= top; y++) bp.set(x, y, z, 'travertine');
  const aisle = arc(a, 0, d) % 13 < 1.2;
  bp.set(x, top, z, aisle ? 'travertine_slab[type=top]' : i % 2 ? 'travertine' : 'travertine_bricks');
  if (aisle) {
    // A doorway (a vomitorium) in some aisles, halfway up.
    if (i === 4 && Math.floor(arc(a, 0, d) / 13) % 3 === 0) {
      bp.set(x, top + 1, z, 'air');
      bp.set(x, top + 2, z, 'air');
    }
    return;
  }
  // The crowd: most seats taken, the odd one cheering.
  const r = hash(x, z, 9);
  if (r < 0.78) bp.set(x, top + 1, z, r < 0.12 ? 'crowd_c' : r < 0.45 ? 'crowd_a' : 'crowd_b');
}

/**
 * The rim: the stands' back wall, a gallery over the top tier with the plebs standing, and the
 * facade: three orders of arches and an attic with windows, masts on top.
 */
function rim(bp: Blueprint, x: number, z: number, d: number, a: number) {
  const step = arc(a, 0, d) % 4;
  for (let y = FLOOR - 3; y <= FLOOR; y++) bp.set(x, y, z, 'travertine');
  if (d < BACK + 1) {
    // The back wall up to the gallery's floor; on it, the plebs standing under a colonnade.
    for (let y = FLOOR + 1; y <= GALLERY; y++) bp.set(x, y, z, 'travertine');
    bp.set(x, GALLERY, z, 'travertine_bricks');
    if (step < 1) for (let y = GALLERY + 1; y <= GALLERY + 4; y++) bp.set(x, y, z, y === GALLERY + 4 ? 'travertine_bricks' : 'diorite');
    else if (hash(x, z, 10) < 0.6) bp.set(x, GALLERY + 1, z, hash(x, z, 11) < 0.5 ? 'crowd_a' : 'crowd_c');
    portico(bp, x, z);
    return;
  }
  if (d < BACK + 2) {
    // The ambulatory behind the arches: dark corridors between floors; the gallery over them.
    for (let y = FLOOR + 1; y <= GALLERY; y++) {
      const level = y - FLOOR;
      const floor = level === 6 || level === 12 || y === GALLERY;
      bp.set(x, y, z, floor ? 'travertine_bricks' : 'air');
    }
    bp.set(x, FLOOR, z, 'stone_bricks');
    if (hash(x, z, 13) < 0.5) bp.set(x, GALLERY + 1, z, hash(x, z, 14) < 0.5 ? 'crowd_b' : 'crowd_a');
    portico(bp, x, z);
    return;
  }
  // The facade: pilasters, arches on three orders, an attic with windows, a cornice.
  for (let y = FLOOR + 1; y <= ATTIC; y++) {
    const level = y - FLOOR;
    const order = level <= 6 ? 0 : level <= 12 ? 1 : level <= 18 ? 2 : 3;
    const base = order * 6;
    const lv = level - base;
    let b: BlockRef | 'air' = 'travertine';
    if (order < 3) {
      // An arch: 2 wide, 4 high with a rounded top; its frame in bricks; a cornice between orders.
      const open = step >= 1 && step < 3 && lv >= 1 && lv <= 4;
      if (open) b = 'air';
      else if (lv === 6 || lv === 0) b = 'travertine_bricks';
      else if (step < 1) b = lv === 5 ? 'travertine_bricks' : 'travertine';
    } else {
      const window = step >= 1.5 && step < 2.5 && (lv === 3 || lv === 4);
      if (window) b = 'air';
      else if (lv === 1 || y === ATTIC) b = 'travertine_bricks';
    }
    bp.set(x, y, z, b);
  }
  // Masts on the rim, every so often (the velarium's).
  if (d > OUT - 1 && arc(a, 0, d) % 12 < 0.9) for (let y = ATTIC + 1; y <= ATTIC + 5; y++) bp.set(x, y, z, y === ATTIC + 1 ? 'travertine_bricks' : 'spruce_log');
}

/** The colonnade's entablature and roof over the gallery. */
function portico(bp: Blueprint, x: number, z: number) {
  bp.set(x, GALLERY + 5, z, 'travertine_bricks');
  bp.set(x, GALLERY + 6, z, 'travertine_slab');
}

/**
 * The gates: tunnels through the podium and under the stands to their pens, torch-lit; the arches
 * on the pit wall framed in brick with a gilt keystone.
 */
function gates(bp: Blueprint) {
  const R = Math.ceil(PEN + 4);
  for (let x = -R; x <= R; x++)
    for (let z = -R; z <= R; z++) {
      const g = inGate(x, z);
      if (!g || g.along < PIT - 0.6 || g.along > PEN + 3) continue;
      const pen = g.along > PEN - 2;
      const half = pen ? 3.6 : 2.6;
      if (Math.abs(g.side) > half + 1) continue;
      const wall = Math.abs(g.side) > half || g.along > PEN + 2.4;
      for (let y = FLOOR + 1; y <= FLOOR + 6; y++) bp.set(x, y, z, wall || y === FLOOR + 6 ? 'travertine_bricks' : 'air');
      bp.set(x, FLOOR, z, wall ? 'travertine_bricks' : hash(x, z, 12) < 0.3 ? 'gravel' : 'stone_bricks');
    }
  for (const a of GATES) {
    const fx = Math.cos(a);
    const fz = Math.sin(a);
    const at = (along: number, side: number) => ({ x: Math.round(fx * along - fz * side), z: Math.round(fz * along + fx * side) });
    // The arch on the pit wall: rounded at its top corners, framed, a keystone.
    for (let side = -3; side <= 3; side++) {
      const p = at(PIT, side);
      for (let y = FLOOR + 1; y <= FLOOR + 6; y++) {
        const edge = Math.abs(side) === 3;
        const corner = Math.abs(side) === 2 && y === FLOOR + 5;
        if (edge || y === FLOOR + 6 || corner) bp.set(p.x, y, p.z, side === 0 && y === FLOOR + 6 ? 'gilt' : 'travertine_bricks');
      }
    }
    // Torches down the tunnel on its walls, pointing in toward its middle.
    for (let along = PIT + 3; along < PEN; along += 3) {
      for (const s of [-1, 1]) {
        const p = at(along, s * 2);
        bp.set(p.x, FLOOR + 3, p.z, wallTorch(facing(s * fz, -s * fx)));
      }
    }
  }
}

/** The way a block faces that's nearest to (dx, dz). */
const facing = (dx: number, dz: number) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north');

/**
 * The emperor's box over the north gate: a balcony on gilt columns under a purple canopy, red
 * drapes behind; the throne (a prop) stands at its back.
 */
function box_(bp: Blueprint) {
  const zf = -PIT + 2; // its front, over the pit
  const zb = -POD - 1;
  for (let x = -6; x <= 6; x++) {
    for (let z = zb - 2; z <= zf; z++) {
      // Clear the stands where it stands.
      for (let y = POD_TOP + 1; y <= POD_TOP + 8; y++) bp.set(x, y, z, 'air');
      bp.set(x, POD_TOP, z, z === zf ? 'gilt' : (x + z) % 2 ? 'purple_concrete' : 'white_concrete');
      if (z > -PIT) bp.set(x, POD_TOP - 1, z, 'travertine_bricks');
    }
    // A balustrade along its front, gilt on top.
    bp.set(x, POD_TOP + 1, zf, Math.abs(x) % 2 ? 'travertine_slab' : 'travertine_bricks');
    if (Math.abs(x) % 2 === 0) bp.set(x, POD_TOP + 2, zf, 'travertine_slab');
    // The back wall, hung with red drapes.
    for (let y = POD_TOP + 1; y <= POD_TOP + 7; y++) bp.set(x, y, zb - 2, y > POD_TOP + 5 ? 'gilt' : 'red_wool');
    // The canopy: purple and gilt stripes, a gilt rim.
    for (let z = zb - 2; z <= zf + 1; z++) bp.set(x, POD_TOP + 8, z, z === zf + 1 || Math.abs(x) === 6 ? 'gilt' : x % 2 ? 'purple_concrete' : 'magenta_concrete');
  }
  for (let z = zb - 2; z <= zf + 1; z++) bp.set(0, POD_TOP + 9, z, 'gilt');
  // The columns.
  for (const x of [-6, 6])
    for (const z of [zf, zb - 2]) for (let y = POD_TOP + 1; y <= POD_TOP + 7; y++) bp.set(x, y, z, y === POD_TOP + 1 || y === POD_TOP + 7 ? 'gilt' : 'white_concrete');
}

/**
 * In the pit: the grates over the hypogeum (lit from below, the spikes waiting under them), the
 * podia with their steps, broken columns, the statues' pedestals, braziers on the parapet.
 */
function features(bp: Blueprint) {
  for (const g of GRATES) {
    for (let x = g.min.x - 1; x <= g.max.x + 1; x++)
      for (let z = g.min.z - 1; z <= g.max.z + 1; z++) {
        const inside = x >= g.min.x && x <= g.max.x && z >= g.min.z && z <= g.max.z;
        if (!inside) {
          // A travertine kerb round it, the hypogeum's wall below.
          bp.set(x, FLOOR, z, 'travertine');
          for (let y = FLOOR - 3; y < FLOOR; y++) bp.set(x, y, z, 'stone_bricks');
          continue;
        }
        bp.set(x, FLOOR, z, 'arena_grate');
        bp.set(x, FLOOR - 1, z, 'air');
        bp.set(x, FLOOR - 2, z, 'air');
        bp.set(x, FLOOR - 3, z, (x + z) % 3 === 0 ? 'glowstone' : 'stone_bricks');
      }
  }
  for (const p of PODIA) {
    for (let x = p.x0; x <= p.x1; x++)
      for (let z = p.z0; z <= p.z1; z++) {
        const rim = x === p.x0 || x === p.x1 || z === p.z0 || z === p.z1;
        bp.set(x, FLOOR + 1, z, 'travertine_bricks');
        bp.set(x, FLOOR + 2, z, rim ? 'travertine_bricks' : 'travertine');
      }
    // Steps up on its north and south sides: a slab, then onto it.
    for (let x = p.x0; x <= p.x1; x++) {
      bp.set(x, FLOOR + 1, p.z0 - 1, 'travertine_slab');
      bp.set(x, FLOOR + 1, p.z1 + 1, 'travertine_slab');
    }
  }
  // Broken columns, each its own height, a fallen drum beside the shortest.
  LIONS.forEach((a, i) => {
    const cx = Math.round(Math.cos(a) * 11);
    const cz = Math.round(Math.sin(a) * 11);
    const h = [5, 3, 6, 2][i];
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        bp.set(cx + dx, FLOOR + 1, cz + dz, 'travertine_bricks');
        if (Math.abs(dx) + Math.abs(dz) === 2) continue;
        for (let y = FLOOR + 2; y <= FLOOR + 1 + h; y++) {
          // Broken off raggedly at the top.
          if (y === FLOOR + 1 + h && hash(cx + dx, cz + dz, i) < 0.45) continue;
          bp.set(cx + dx, y, cz + dz, 'diorite');
        }
      }
    if (h === 6) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) bp.set(cx + dx, FLOOR + 8, cz + dz, Math.abs(dx) + Math.abs(dz) === 2 ? 'gilt' : 'travertine_bricks');
    if (h <= 3) {
      // A drum that fell, lying toward the middle.
      const fx = -Math.sign(cx);
      for (let k = 2; k <= 3; k++) {
        bp.set(cx + fx * k, FLOOR + 1, cz, 'diorite');
        bp.set(cx + fx * k, FLOOR + 1, cz + Math.sign(cz), 'diorite');
      }
    }
  });
  // Braziers on the parapet, either side of every gate and lion.
  for (const f of FIRES) {
    const x = Math.floor(f.at.x);
    const z = Math.floor(f.at.z);
    const top = Math.floor(f.at.y) - 1;
    bp.set(x, top, z, 'magma');
    bp.set(x, top - 1, z, 'gilt');
    for (let y = POD_TOP + 1; y < top - 1; y++) bp.set(x, y, z, 'travertine_bricks');
  }
}

/** Braziers on the parapet: at the gates' sides and over the lions. */
const FIRES: Fire[] = [...GATES.flatMap((a) => [a - 0.2, a + 0.2]), ...LIONS].map((a) => {
  const r = PIT + 0.5;
  return { at: { x: Math.round(Math.cos(a) * r) + 0.5, y: POD_TOP + 4, z: Math.round(Math.sin(a) * r) + 0.5 }, size: 0.9 };
});

/** The Colosseum's banner: red, a gilt border, a laurel wreath round crossed swords, swallow-tailed. */
function design(): BannerDesign {
  const W = 16;
  const H = 40;
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const tail = y > H - 7 && Math.abs(x - 7.5) < (y - (H - 7)) * 1.2;
      const cx = x - 7.5;
      const cy = y - 17;
      const r = Math.hypot(cx, cy * 0.95);
      let c = 'r';
      if (y < 2) c = 'g';
      else if (x === 0 || x === W - 1 || y === 2) c = 'g';
      else if (r > 4.6 && r < 6.2 && cy > -5) c = (x + y) % 3 ? 'l' : 'g';
      else if (Math.abs(cx - cy * 0.75) < 0.8 && r < 5) c = 'w';
      else if (Math.abs(cx + cy * 0.75) < 0.8 && r < 5) c = 'w';
      else if (y === 28 || y === 30) c = 'g';
      if (tail) c = '.';
      row += c;
    }
    rows.push(row);
  }
  return { rows, palette: { r: 'red_concrete', g: 'gilt', l: 'lime_concrete', w: 'iron_block' } };
}
const BANNER = banner(design());

/** Banners down the podium wall between the gates and the lions, facing the middle; the box's own either side of it. */
const BANNERS: Decor[] = [Math.PI / 8, (Math.PI * 3) / 8, (Math.PI * 5) / 8, (Math.PI * 7) / 8, (-Math.PI * 7) / 8, (-Math.PI * 5) / 8, (-Math.PI * 3) / 8, (-Math.PI * 1) / 8].map((a) => {
  const x = C.x + Math.cos(a) * (PIT - 0.56);
  const z = C.z + Math.sin(a) * (PIT - 0.56);
  return { model: BANNER, at: { x, y: POD_TOP + 0.9, z }, face: faceTo(x, z, C.x, C.z) };
});

const EMPEROR = figure({ robe: 'purple_concrete', trim: 'gilt', skin: 'flesh', hair: 'white_concrete', head: 'laurel' });
const GUARD = figure({ robe: 'red_concrete', trim: 'gilt', skin: 'flesh', hair: 'brown_concrete', head: 'helmet', arms: true });
const THRONE = throne();
const LION = lionHead();
const STATUE = statue();

const LION_MOUTH = (a: number) => ({ x: C.x + Math.cos(a) * (PIT - 0.5), y: FLOOR + 3.2, z: C.z + Math.sin(a) * (PIT - 0.5) });

const DECOR: Decor[] = [
  ...BANNERS,
  { model: THRONE, at: { x: 0.5, y: POD_TOP + 1, z: -POD - 1.6 }, face: 0 },
  { model: EMPEROR, at: { x: 0.5, y: POD_TOP + 1, z: -POD + 0.6 }, face: 0 },
  { model: GUARD, at: { x: -3.5, y: POD_TOP + 1, z: -PIT + 0.8 }, face: 0 },
  { model: GUARD, at: { x: 4.5, y: POD_TOP + 1, z: -PIT + 0.8 }, face: 0 },
  ...LIONS.map((a) => {
    const m = LION_MOUTH(a);
    return { model: LION, at: m, face: faceTo(m.x, m.z, C.x, C.z) };
  }),
  // Gladiators in marble at the back of the podia, facing the middle.
  ...PODIA.map((p) => {
    const x = p.x0 > 0 ? p.x1 - 0.5 : p.x0 + 1.5;
    return { model: STATUE, at: { x, y: FLOOR + 3, z: 0.5 }, face: faceTo(x, 0.5, C.x, C.z) };
  }),
];

/** The traps: the spikes under the two grates (a lever beside each), and the lions' fire (a lever on the east podium). */
const TRAPS: TrapSpec[] = [
  {
    id: 'colosseum.spikes_n',
    name: 'Spike Pit',
    kind: 'spikes',
    lever: { at: { x: 4.5, y: FLOOR + 1, z: -9.5 }, face: Math.PI / 2 },
    price: 60,
    time: 8,
    cooldown: 30,
    zone: [GRATES[0]],
  },
  {
    id: 'colosseum.spikes_s',
    name: 'Spike Pit',
    kind: 'spikes',
    lever: { at: { x: -3.5, y: FLOOR + 1, z: 10.5 }, face: -Math.PI / 2 },
    price: 60,
    time: 8,
    cooldown: 30,
    zone: [GRATES[1]],
  },
  {
    id: 'colosseum.lions',
    name: "Lions' Fire",
    kind: 'jets',
    element: 'fire',
    lever: { at: { x: 14.5, y: FLOOR + 3, z: 0.5 }, face: Math.PI / 2 },
    price: 90,
    time: 7,
    cooldown: 40,
    zone: [],
    jets: LIONS.map((a) => {
      const m = LION_MOUTH(a);
      return { at: { x: m.x - Math.cos(a) * 0.6, y: FLOOR + 2.6, z: m.z - Math.sin(a) * 0.6 }, dir: { x: -Math.cos(a), y: -0.12, z: -Math.sin(a) }, length: 8.5 };
    }),
  },
];

const gate = (a: number) => gateAt(C, a, PEN);

export const COLOSSEUM: ArenaMap = {
  id: 'colosseum',
  name: 'The Colosseum',
  line: 'Sand, stone and a roaring crowd',
  color: '#ffb36b',
  icon: 'travertine_bricks',
  origin: C,
  build: () => [build()],
  center: { x: 0.5, y: FLOOR + 1, z: 0.5 },
  radius: PIT - 1,
  gates: GATES.map(gate),
  bossGates: GATES.map((a) => gateAt(C, a, PIT - 4)),
  portcullises: GATES.map((a) => ({ at: { x: C.x + Math.cos(a) * (PIT + 0.2), y: FLOOR + 1, z: C.z + Math.sin(a) * (PIT + 0.2) }, yaw: gate(a).yaw, width: 5, height: 5 })),
  lookout: { x: 0.5, y: POD_TOP + 5, z: POD + 3.5 },
  time: 0.66,
  dusk: 0.07,
  intro: [
    { at: { x: 70, y: FLOOR + 40, z: 62 }, look: { x: 0, y: FLOOR + 12, z: 0 } },
    { at: { x: 34, y: FLOOR + 34, z: 46 }, look: { x: 0, y: FLOOR + 10, z: 0 } },
    { at: { x: 6, y: FLOOR + 22, z: 30 }, look: { x: 0, y: FLOOR + 8, z: -20 } },
    { at: { x: -10, y: FLOOR + 12, z: 8 }, look: { x: 0.5, y: POD_TOP + 3, z: -24 } },
  ],
  shop: { x: -6.5, y: FLOOR + 1, z: 5.5 },
  chests: [
    { x: 7.5, y: FLOOR + 1, z: 5.5 },
    { x: -15.5, y: FLOOR + 1, z: -10.5 },
    { x: 16.5, y: FLOOR + 1, z: 10.5 },
  ],
  traps: TRAPS,
  decor: DECOR,
  fires: FIRES,
  air: { kind: 'dust', heading: 0.6, wind: 1.2, gust: 3.5, loop: 'amb_arena_wind', calls: ['amb_hawk', 'amb_horn'] },
};
