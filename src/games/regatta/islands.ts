/**
 * The course's islands, rocks, buoys and committee boat as shapes: smooth heights that both the
 * models (drawn from them, `tools/models.mjs`) and the boats (which run aground on them) read, so
 * what you see is what you hit. No imports, so the model tool can read it as it is.
 */

export const WATER_TOP = 63;
export const LINE_HALF = 100;
export const PIN = { x: -LINE_HALF, z: 0 };
export const COMMITTEE = { x: LINE_HALF + 8, z: 0 };
export const WINDWARD = { x: 0, z: -600 };
export const GATE = [
  { x: -45, z: 120 },
  { x: 45, z: 120 },
];

export interface Island {
  x: number;
  z: number;
  r: number;
  /** How high its top stands over the water. */
  h: number;
  rock?: boolean;
}

export const ISLANDS: Island[] = [
  { x: -520, z: -260, r: 80, h: 20 },
  { x: 560, z: -560, r: 95, h: 26 },
  { x: -470, z: -830, r: 70, h: 16 },
  { x: 500, z: 170, r: 65, h: 15 },
  { x: -540, z: 240, r: 55, h: 12 },
  { x: 300, z: -300, r: 8, h: 5, rock: true },
  { x: -290, z: -470, r: 7, h: 5, rock: true },
];

// A fixed hash and smooth value noise, so every screen and the server shape the same islands.
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function noise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const u = x - xi;
  const v = z - zi;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

/** How far an island reaches (past this it's all sea). */
export const reach = (isl: Island) => isl.r * 1.25;

/** An island's ground height at a point (well under the water off its shores). */
export function islandHeight(isl: Island, x: number, z: number): number {
  const dist = Math.hypot(x - isl.x, z - isl.z);
  if (dist > reach(isl)) return 40;
  const wobble = 0.8 + noise(x / (isl.r * 0.3), z / (isl.r * 0.3)) * 0.4;
  const d = dist / (isl.r * wobble);
  return WATER_TOP - 4 + (isl.h + 4) * (1 - d * d) + (noise(x / 5 + 40, z / 5) - 0.5) * (isl.rock ? 1.6 : 0.8);
}

/** The ground's height anywhere on the course (the sea floor where there's no island). */
export function groundHeight(x: number, z: number): number {
  let h = 40;
  for (const isl of ISLANDS) h = Math.max(h, islandHeight(isl, x, z));
  return h;
}

/** Ground this high or more stops a boat: a beach just awash. */
export const SHORE = WATER_TOP - 0.25;

/** How far a buoy reaches (they are big inflatable racing marks). */
export const BUOY_R = 2.2;

/** Whether a boat would hit something here: land, a buoy, the committee boat. */
export function landAt(x: number, z: number): boolean {
  if (groundHeight(x, z) >= SHORE) return true;
  for (const b of [WINDWARD, GATE[0], GATE[1], PIN]) if (Math.hypot(x - b.x, z - b.z) < BUOY_R) return true;
  return Math.abs(x - COMMITTEE.x) < 4 && z > COMMITTEE.z - 10 && z < COMMITTEE.z + 9.5;
}

/** Palms on the islands: where, how tall, which way they lean (the same everywhere). */
export function palms(): { x: number; y: number; z: number; h: number; lean: number; turn: number }[] {
  const out: { x: number; y: number; z: number; h: number; lean: number; turn: number }[] = [];
  for (const isl of ISLANDS) {
    if (isl.rock) continue;
    const n = Math.round(isl.r / 3);
    for (let i = 0; i < n * 4 && out.length < 160; i++) {
      const a = hash(i, isl.x) * Math.PI * 2;
      const r = Math.sqrt(hash(isl.z, i)) * isl.r * 0.85;
      const x = isl.x + Math.cos(a) * r;
      const z = isl.z + Math.sin(a) * r;
      const y = islandHeight(isl, x, z);
      if (y < WATER_TOP + 1 || y > WATER_TOP + isl.h * 0.75) continue;
      out.push({ x, y, z, h: 5 + hash(x, z) * 3, lean: 0.15 + hash(z, x) * 0.25, turn: hash(x + 1, z) * Math.PI * 2 });
      if (out.filter((p) => Math.hypot(p.x - isl.x, p.z - isl.z) < reach(isl)).length >= n) break;
    }
  }
  return out;
}
