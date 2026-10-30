import { GATE, LEGS, LINE_HALF, landAt } from './course';
import { DOWNWIND_VMG, IRONS, TAKEOFF, UPWIND_VMG, forward, idealBoom, sheetToBoom, wrapAngle, type BoatState, type Helm } from './sailing';

/**
 * AI skippers. They keep flying through the start sequence (hanging back below the line, then
 * going for it), beat upwind on whichever tack points them closer to the mark and run downwind at
 * the foiling angle, gybing rather than sailing deep (so they tack and gybe on the wind's shifts),
 * steer clear of land and boats, and trim to the apparent wind with an error that shrinks with skill.
 */

const DEG = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const bearing = (dx: number, dz: number) => Math.atan2(dx, -dz);
/** The true wind angle a boat in the water builds speed to take off at. */
const TAKEOFF_TWA = 75 * DEG;

/** What a bot can see of the race. */
export interface BotView {
  /** Seconds since the gun (negative before it). */
  time: number;
  windAt(x: number, z: number): number;
  /** Every boat's position, its own included. */
  boats: readonly { x: number; z: number }[];
}

/** Where a racer is in the race, as a bot needs it. */
export interface BotRace {
  started: boolean;
  ocs: boolean;
  finished: boolean;
  leg: number;
  target: { x: number; z: number };
}

export class BotBrain {
  private tack: number;
  private cooldown = 0;
  private trimBias: number;
  private startOffset: number;
  private loiterSide: number;
  private wobble: number;
  /** The true wind angles it sails upwind and downwind. */
  private up: number;
  private down: number;
  private corridor: number;

  constructor(
    private rng: () => number,
    readonly skill: number,
    private holdX: number,
  ) {
    this.tack = rng() < 0.5 ? 1 : -1;
    this.trimBias = (rng() - 0.3) * 6 * DEG * (1 - skill);
    this.startOffset = (rng() - 0.35) * 16 * (1.1 - skill); // + late to the line, − early (and maybe over)
    this.loiterSide = rng() < 0.5 ? 1 : -1;
    this.wobble = rng() * 100;
    this.up = UPWIND_VMG + (1 - skill) * 10 * DEG;
    this.down = DOWNWIND_VMG - (1 - skill) * 14 * DEG;
    this.corridor = 0.2 + rng() * 0.25;
  }

  think(b: BoatState, race: BotRace, view: BotView, dt: number): Helm {
    this.cooldown -= dt;
    const wd = view.windAt(b.x, b.z);
    let desired: number;
    let slow = false;

    if (view.time < 0) {
      const eta = Math.max(0, b.z) / 15 + 6 + this.startOffset;
      if (-view.time > eta) {
        const hold = { x: this.holdX, z: 120 };
        if (Math.hypot(hold.x - b.x, hold.z - b.z) > 60) desired = this.route(b, hold, wd);
        else {
          // Back and forth on a reach, sails half eased: slow, but still flying.
          if (b.x > hold.x + 15) this.loiterSide = -1;
          else if (b.x < hold.x - 15) this.loiterSide = 1;
          desired = wd + this.loiterSide * 100 * DEG;
          slow = true;
        }
      } else desired = this.route(b, { x: this.holdX, z: -80 }, wd);
    } else if (race.finished) {
      desired = wd + this.loiterSide * 100 * DEG;
      slow = true;
    } else if (!race.started) {
      // Over the line (early, or round an end): get back below it, then cross.
      const below = race.ocs || b.z < -2 || Math.abs(b.x) > LINE_HALF + 6;
      desired = this.route(b, below && b.z < 20 ? { x: clamp(b.x, -80, 80), z: 50 } : { x: clamp(b.x, -85, 85), z: -80 }, wd);
    } else {
      const type = LEGS[race.leg].type;
      let t = race.target;
      if (type === 'finish') t = { x: t.x, z: 40 };
      else if (type === 'gate') t = { x: clamp(b.x, GATE[0].x + 15, GATE[1].x - 15), z: t.z + 25 };
      desired = this.route(b, t, wd);
    }

    // Off the foils: bear away (or head up) to a reach on this tack until they lift it clear.
    if (b.ride < 0.5 && !race.finished) {
      desired = wd + (wrapAngle(b.heading - wd) >= 0 ? 1 : -1) * TAKEOFF_TWA;
      slow = false;
    }
    // Hanging about with the sails eased is for a boat with speed to spare.
    if (slow && b.speed < TAKEOFF + 3) slow = false;

    desired = this.avoid(b, desired, wd, view);
    const steer = clamp(wrapAngle(desired - b.heading) * 2, -1, 1);
    const ideal = idealBoom(Math.abs(b.awa));
    const want = ideal + (slow ? 14 * DEG : this.trimBias + Math.sin(view.time * 0.7 + this.wobble) * 2 * DEG * (1 - this.skill));
    const sheet = clamp((sheetToBoom(b.sheet) - want) / (4 * DEG), -1, 1);
    return { steer, sheet };
  }

  /**
   * The heading toward `t`: straight there if it can be sailed fast, else upwind close-hauled or
   * downwind at the foiling angle, on the better tack or gybe.
   */
  private route(b: BoatState, t: { x: number; z: number }, wd: number): number {
    const brg = bearing(t.x - b.x, t.z - b.z);
    const rel = wrapAngle(brg - wd);
    let angle: number;
    if (Math.abs(rel) < this.up) angle = this.up;
    else if (Math.abs(rel) > this.down) angle = this.down;
    else {
      this.tack = rel >= 0 ? 1 : -1;
      return brg;
    }
    const h1 = wd + this.tack * angle;
    const h2 = wd - this.tack * angle;
    if (this.cooldown <= 0 && Math.cos(wrapAngle(brg - h2)) > Math.cos(wrapAngle(brg - h1)) + this.corridor) {
      this.tack = -this.tack;
      this.cooldown = 14 + this.rng() * 10;
      return h2;
    }
    return h1;
  }

  /** The nearest heading to `desired` with no land, buoy or boat ahead (never dodging into irons). */
  private avoid(b: BoatState, desired: number, wd: number, view: BotView): number {
    const crowded = (px: number, pz: number) => view.boats.some((o) => (o.x !== b.x || o.z !== b.z) && Math.hypot(o.x - px, o.z - pz) < 20);
    for (const o of [0, 0.25, -0.25, 0.5, -0.5, 0.9, -0.9, 1.4, -1.4]) {
      const h = desired + o;
      if (o !== 0 && Math.abs(wrapAngle(wd - h)) < IRONS + 6 * DEG) continue;
      const f = forward(h);
      let ok = true;
      for (const d of [12, 30, 60, 100]) {
        if (landAt(b.x + f.x * d, b.z + f.z * d)) { ok = false; break; }
      }
      if (ok && (crowded(b.x + f.x * 15, b.z + f.z * 15) || crowded(b.x + f.x * 30, b.z + f.z * 30))) ok = false;
      if (ok) return h;
    }
    return desired;
  }
}
