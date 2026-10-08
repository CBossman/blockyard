/**
 * The storm: a safe circle that closes in over the match, in phases. A phase waits (the next circle
 * is shown on the map, so everyone can plan the walk), then shrinks the safe circle to it, and
 * anyone outside the circle takes the phase's damage every second.
 *
 * It's plain arithmetic with no game in it: the server runs it, and each screen draws the circle
 * from the state the server sends (`wire()`), easing the radius itself between messages.
 */

export interface Phase {
  /** Seconds the next circle is shown before the storm starts closing on it. */
  wait: number;
  /** Seconds the safe circle takes to close on it. */
  shrink: number;
  /** The circle it closes to (blocks). */
  radius: number;
  /** Health lost a second outside the circle, from the moment the wait begins. */
  damage: number;
}

/** The whole match: about eight minutes from the first shrink to the last. */
export const PHASES: readonly Phase[] = [
  { wait: 55, shrink: 50, radius: 100, damage: 1 },
  { wait: 45, shrink: 45, radius: 62, damage: 2 },
  { wait: 40, shrink: 40, radius: 35, damage: 4 },
  { wait: 30, shrink: 35, radius: 18, damage: 7 },
  { wait: 25, shrink: 30, radius: 7, damage: 10 },
  { wait: 20, shrink: 25, radius: 0, damage: 14 },
];

/** Seconds after the last player lands (or the bus empties) before the first circle is announced. */
export const CALM = 50;

/** Damage a second outside the first circle (the island's edge) before any phase has begun. */
export const EDGE_DAMAGE = 1;

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export type StormStep = 'calm' | 'wait' | 'shrink' | 'closed';

/** What the server tells each screen (`game.clients.send('storm', …)`): enough to draw the circle and count the timer down. */
export interface StormWire {
  /** 0 before the first phase; then 1..PHASES.length. */
  phase: number;
  step: StormStep;
  /** The safe circle now (for a shrink: where it is as the message is sent). */
  now: Circle;
  /** The circle it's closing on (the next one, shown while it waits). Null while calm, and once closed. */
  next: Circle | null;
  /** Seconds left in this step, and how long a shrink takes in all (for easing the radius). */
  left: number;
  total: number;
  /** Health a second outside. */
  damage: number;
}

export interface StormOptions {
  /** The first circle: the island. */
  start: Circle;
  /** A random number in [0, 1). */
  random(): number;
  /** Whether a spot is somewhere to stand (not the sea): the next circle's middle is picked from land when there's some. */
  land?(x: number, z: number): boolean;
}

export class Storm {
  phase = 0;
  step: StormStep = 'calm';
  now: Circle;
  next: Circle | null = null;
  left = CALM;
  total = 0;
  private from: Circle;
  /** Events since the last `update` (the game announces them). */
  readonly events: ('announce' | 'shrink' | 'settled' | 'closed')[] = [];

  constructor(private o: StormOptions) {
    this.now = { ...o.start };
    this.from = { ...o.start };
  }

  /** Health a second outside the circle right now. */
  get damage(): number {
    if (this.phase === 0) return EDGE_DAMAGE;
    return PHASES[Math.min(this.phase, PHASES.length) - 1].damage;
  }

  /** Whether a point is inside the safe circle (`margin`: that many blocks further in, or out if negative). */
  inside(x: number, z: number, margin = 0): boolean {
    return Math.hypot(x - this.now.x, z - this.now.z) <= this.now.r - margin;
  }

  /** How far outside the circle a point is (0 inside). */
  outBy(x: number, z: number): number {
    return Math.max(0, Math.hypot(x - this.now.x, z - this.now.z) - this.now.r);
  }

  update(dt: number) {
    this.events.length = 0;
    if (this.step === 'closed') return;
    this.left -= dt;
    if (this.step === 'shrink') {
      const k = this.total > 0 ? Math.min(1, 1 - this.left / this.total) : 1;
      // Eased a little at each end, so the wall doesn't lurch.
      const e = k * k * (3 - 2 * k) * 0.5 + k * 0.5;
      const to = this.next!;
      this.now = { x: this.from.x + (to.x - this.from.x) * e, z: this.from.z + (to.z - this.from.z) * e, r: this.from.r + (to.r - this.from.r) * e };
    }
    if (this.left > 0) return;
    switch (this.step) {
      case 'calm':
        this.announce();
        break;
      case 'wait':
        this.step = 'shrink';
        this.total = this.left = PHASES[this.phase - 1].shrink;
        this.from = { ...this.now };
        this.events.push('shrink');
        break;
      case 'shrink':
        this.now = { ...this.next! };
        this.events.push('settled');
        if (this.phase >= PHASES.length) {
          this.step = 'closed';
          this.next = null;
          this.left = 0;
          this.events.push('closed');
        } else this.announce();
        break;
    }
  }

  /** Show the next circle and start its wait. */
  private announce() {
    const p = PHASES[this.phase];
    this.phase++;
    this.step = 'wait';
    this.left = p.wait;
    this.total = 0;
    this.next = this.pick(p.radius);
    this.events.push('announce');
  }

  /** The next circle: inside this one, on land if it can be. */
  private pick(radius: number): Circle {
    const room = Math.max(0, this.now.r - radius);
    let best: Circle = { x: this.now.x, z: this.now.z, r: radius };
    for (let tries = 0; tries < 12; tries++) {
      const a = this.o.random() * Math.PI * 2;
      const d = Math.sqrt(this.o.random()) * room * 0.9;
      const c = { x: this.now.x + Math.cos(a) * d, z: this.now.z + Math.sin(a) * d, r: radius };
      best = c;
      if (!this.o.land || this.o.land(c.x, c.z)) break;
    }
    return best;
  }

  /** Everything a screen needs. */
  wire(): StormWire {
    return { phase: this.phase, step: this.step, now: this.now, next: this.next, left: Math.max(0, this.left), total: this.total, damage: this.damage };
  }
}
