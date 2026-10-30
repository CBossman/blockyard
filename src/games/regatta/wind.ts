import { forward } from './sailing';

/**
 * The breeze: it swings slowly from side to side, and gusts (dark patches on the water) and lulls
 * drift down the course with it. The server keeps it and writes it into each boat's state.
 */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const MAX_GUSTS = 16;
export const COURSE_CENTER = { x: 0, z: -240 };

export interface Gust {
  /** Its own number, for whatever shows it. */
  id: number;
  x: number;
  z: number;
  radius: number;
  /** + a puff, − a lull, as a share of the breeze. */
  strength: number;
  shift: number;
  age: number;
  life: number;
  env: number;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class Wind {
  readonly baseSpeed = 8;
  time = 0;
  gusts: Gust[] = [];
  private nextId = 1;
  private phase1: number;
  private phase2: number;
  private shiftAmp: number;
  private bias: number;

  constructor(private rng: () => number) {
    this.phase1 = rng() * TAU;
    this.phase2 = rng() * TAU;
    this.shiftAmp = (5 + rng() * 7) * DEG;
    this.bias = (rng() - 0.5) * 8 * DEG;
    for (let i = 0; i < 10; i++) this.spawn(true);
  }

  /** Where the breeze blows from. */
  get dir(): number {
    const t = this.time;
    return this.bias + Math.sin((t * TAU) / 75 + this.phase1) * this.shiftAmp + Math.sin((t * TAU) / 27 + this.phase2) * this.shiftAmp * 0.35;
  }

  private spawn(anywhere: boolean): void {
    const r = this.rng;
    const d = this.dir;
    const up = forward(d);
    const puff = r() < 0.72;
    const g: Gust = {
      id: this.nextId++,
      x: 0,
      z: 0,
      radius: 60 + r() * 80,
      strength: puff ? 0.22 + r() * 0.28 : -(0.18 + r() * 0.14),
      shift: (r() - 0.5) * 14 * DEG,
      age: anywhere ? r() * 20 : 0,
      // From upwind, long enough to drift right across the course (about 1,500 metres).
      life: anywhere ? 150 + r() * 120 : 300 + r() * 80,
      env: 0,
    };
    if (anywhere) {
      g.x = COURSE_CENTER.x + (r() - 0.5) * 1300;
      g.z = COURSE_CENTER.z + (r() - 0.5) * 1300;
    } else {
      // Upwind of the course, anywhere across it, to drift down over it.
      const across = (r() - 0.5) * 1300;
      g.x = COURSE_CENTER.x + up.x * 700 + Math.cos(d) * across;
      g.z = COURSE_CENTER.z + up.z * 700 + Math.sin(d) * across;
    }
    this.gusts.push(g);
  }

  /** How gusts drift: downwind, at a little over half the breeze (metres a second). */
  drift(): { x: number; z: number } {
    const up = forward(this.dir);
    const v = this.baseSpeed * 0.55;
    return { x: -up.x * v, z: -up.z * v };
  }

  update(dt: number): void {
    this.time += dt;
    const v = this.drift();
    for (const g of this.gusts) {
      g.age += dt;
      g.x += v.x * dt;
      g.z += v.z * dt;
      g.env = smoothstep(0, 6, g.age) * smoothstep(g.life, g.life - 8, g.age);
    }
    this.gusts = this.gusts.filter((g) => g.age < g.life);
    while (this.gusts.length < MAX_GUSTS) this.spawn(false);
  }

  /** The wind at a spot: its direction (gusts veer it a little) and speed. */
  sample(x: number, z: number): { dir: number; speed: number } {
    let s = 1;
    let shift = 0;
    for (const g of this.gusts) {
      const dx = x - g.x;
      const dz = z - g.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > g.radius * g.radius) continue;
      const f = 1 - Math.sqrt(d2) / g.radius;
      const w = f * f * (3 - 2 * f) * g.env;
      s += g.strength * w;
      shift += g.shift * w;
    }
    return { dir: this.dir + shift, speed: this.baseSpeed * s };
  }
}
