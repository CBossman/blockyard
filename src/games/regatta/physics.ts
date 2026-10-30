/**
 * A foiling monohull's physics (an AC75-style boat): no imports, so the server, every screen and
 * the tuning script (`tools/polar.mjs`) all run the same numbers. One block is a metre and speeds
 * are metres a second. Headings are radians clockwise from north (-z); the wind's direction is
 * where it blows from.
 *
 * The sail feels the apparent wind: the true wind less the boat's own motion, so the faster it
 * sails the further forward the wind comes and the harder the sail is sheeted in, upwind and down.
 * Its lift and drag drive the boat forward against the water's drag. In the water (hullborne) the
 * hull drags hard and the boat crawls; past take-off speed the foils lift it clear and the drag
 * falls away, until it slows past touch-down and drops back in. A tack or a gybe through the wind
 * bleeds speed; done slowly, or too tight, the boat comes off its foils.
 */

export const DEG = Math.PI / 180;
/** Knots in a metre a second. */
export const KNOTS = 1.944;

/** Closer to the true wind than this the sails can't drive at all. */
export const IRONS = 32 * DEG;
/** Good true wind angles for making ground upwind and downwind, a little inside the best (`tools/polar.mjs`): any deeper than about 145 degrees and the boat comes off its foils. */
export const UPWIND_VMG = 42 * DEG;
export const DOWNWIND_VMG = 132 * DEG;
export const MIN_BOOM = 1 * DEG;
export const MAX_BOOM = 70 * DEG;

/** Speeds the foils lift the hull clear at, and let it drop back in. */
export const TAKEOFF = 8;
export const TOUCHDOWN = 6;

// The tuned constants (per tonne of boat): sail force for the apparent wind's pressure, the
// hull's and the foils' drag, and the most sail force the boat can hold up before it must spill.
export const TUNE = {
  sail: 0.0132,
  cl: 1.45,
  cd: 0.011,
  hullDrag: 0.011,
  hullHump: 0.3,
  foilDrag: 0.00214,
  induced: 0.25,
  rudderDrag: 0.0015,
  holdHull: 9,
  holdFoil: 4.15,
};

export interface Motion {
  heading: number;
  speed: number;
  /** -1..1, where the helm has the rudder. */
  rudder: number;
  /** 0 = sheeted hard in, 1 = eased right out. */
  sheet: number;
  /** The boom's angle off the centreline, + to starboard. */
  boom: number;
  /** 0 in the water, 1 flying on the foils. */
  ride: number;
  heel: number;
  /** The true wind at the boat: where it blows from, and how fast. */
  wd: number;
  ws: number;
  /** True and apparent wind angle (+ from starboard), and the apparent wind's speed. */
  twa: number;
  awa: number;
  aws: number;
  /** How well the sails are trimmed (0..1), and how much they flap. */
  eff: number;
  luff: number;
  /** Auto-trim: the sheet follows the apparent wind. */
  auto: boolean;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export const forward = (h: number) => ({ x: Math.sin(h), z: -Math.cos(h) });

/** The apparent wind on a boat: its angle off the bow (+ from starboard) and speed. */
export function apparent(heading: number, speed: number, wd: number, ws: number): { awa: number; aws: number } {
  const w = forward(wd);
  const f = forward(heading);
  // Where it comes from: the true wind's, plus the headwind of the boat's own way.
  const x = w.x * ws + f.x * speed;
  const z = w.z * ws + f.z * speed;
  return { awa: wrapAngle(Math.atan2(x, -z) - heading), aws: Math.hypot(x, z) };
}

/** Where the boom wants to be for an apparent wind at angle `a`: the sails at their best angle of attack. */
export const idealBoom = (a: number) => clamp(a - 16 * DEG, MIN_BOOM + 2 * DEG, MAX_BOOM);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sheetToBoom = (s: number) => lerp(MIN_BOOM, MAX_BOOM, s);
export const boomToSheet = (b: number) => clamp((b - MIN_BOOM) / (MAX_BOOM - MIN_BOOM), 0, 1);

/** Too eased and the sails luff (drive goes fast); too tight and they stall (drive goes slowly). */
export function trim(boom: number, ideal: number): { eff: number; luff: number } {
  const err = (boom - ideal) / DEG;
  if (err > 0) {
    const e = Math.max(0, err - 2) / 14;
    return { eff: clamp(1 - e * e, 0, 1), luff: clamp((err - 2) / 14, 0, 1) };
  }
  const e = Math.max(0, -err - 2) / 22;
  return { eff: clamp(1 - e * e * 0.7, 0.3, 1), luff: 0 };
}

/** The sails' push forward and sideways (per tonne) for the apparent wind and the trim. */
export function sailForce(awa: number, aws: number, eff: number, luff: number, ride: number): { drive: number; side: number; spilled: number } {
  const a = Math.abs(awa);
  const q = TUNE.sail * aws * aws;
  const cl = TUNE.cl * eff * (1 - luff * 0.8);
  const cd = TUNE.cd + luff * 0.35 + (1 - eff) * 0.15;
  let drive = q * (cl * Math.sin(a) - cd * Math.cos(a));
  let side = q * (cl * Math.cos(a) + cd * Math.sin(a));
  // More than the boat can hold up (its foil on its arm, far out to leeward, or only its hull's
  // own form in the water), and the crew spill the excess: twist off, traveller down.
  const hold = lerp(TUNE.holdHull, TUNE.holdFoil, ride);
  const total = Math.hypot(drive, side);
  const spilled = total > hold ? 1 - hold / total : 0;
  drive *= 1 - spilled;
  side *= 1 - spilled;
  return { drive, side, spilled };
}

/** The water's drag (per tonne) at a speed, in the water and on the foils, and turning. */
export function drag(speed: number, ride: number, rudder: number): number {
  const v2 = speed * speed;
  // The hull ploughs: its drag climbs steeply toward its hump, which only the foils get past.
  const hull = TUNE.hullDrag * v2 + TUNE.hullHump * smooth(3, 8, speed);
  // On the foils: their own drag, and the cost of lifting the boat (less the faster they fly).
  const foil = TUNE.foilDrag * v2 + TUNE.induced * (TAKEOFF * TAKEOFF) / Math.max(v2, TAKEOFF * TAKEOFF);
  return lerp(hull, foil, ride) + TUNE.rudderDrag * rudder * rudder * v2 + 0.02 * speed;
}

/**
 * One step: the helm (steer -1..1, sheet + in / − out) and the wind move the boat. Where it goes
 * (and whether that's land) is the caller's business; this moves its speed, heading and trim.
 */
export function step(s: Motion, helm: { steer: number; sheet: number }, dt: number): void {
  s.twa = wrapAngle(s.wd - s.heading);
  const ap = apparent(s.heading, s.speed, s.wd, s.ws);
  s.awa = ap.awa;
  s.aws = ap.aws;
  const a = Math.abs(ap.awa);
  const ideal = idealBoom(a);

  if (s.auto) s.sheet += clamp(boomToSheet(ideal + 1 * DEG) - s.sheet, -dt * 1.4, dt * 1.4);
  else s.sheet = clamp(s.sheet - helm.sheet * dt * 0.5, 0, 1);

  // The sheet only holds the boom in; the apparent wind blows it out as far as that lets it.
  const boomAbs = Math.min(sheetToBoom(s.sheet), a);
  const t = trim(boomAbs, ideal);
  s.eff = t.eff * (s.auto ? 0.95 : 1);
  s.luff = Math.abs(s.twa) < IRONS ? 1 : t.luff;
  const target = (ap.awa >= 0 ? -1 : 1) * boomAbs;
  s.boom += (target - s.boom) * Math.min(1, dt * (Math.abs(target - s.boom) > 0.5 ? 3 : 6));

  // Take-off and touch-down, with the gap between them: a boat flying keeps flying a little
  // slower than it took off, and the hull lifts and settles over a second or so.
  const fly = s.ride > 0.5 ? s.speed > TOUCHDOWN : s.speed > TAKEOFF;
  s.ride = clamp(s.ride + (fly ? 1.1 : -1.6) * dt, 0, 1);

  const f = sailForce(ap.awa, ap.aws, s.eff, s.luff, s.ride);
  s.rudder += (helm.steer - s.rudder) * Math.min(1, dt * 5);
  const acc = f.drive - drag(s.speed, s.ride, s.rudder);
  s.speed = Math.max(0, s.speed + acc * dt);

  // It turns slowly in the water and faster flying (a foiling boat carves round on its foils).
  const rate = 0.12 + 0.28 * smooth(1, 8, s.speed) + 0.08 * s.ride;
  s.heading = wrapAngle(s.heading + s.rudder * rate * dt);

  // Flying, the boat is held level and leans a touch to windward; in the water it heels to leeward.
  const lean = s.ride > 0.5 ? -0.06 * smooth(0, 3, f.side) : 0.18 * smooth(0, TUNE.holdHull, f.side);
  const heel = (ap.awa >= 0 ? 1 : -1) * lean;
  s.heel += (heel - s.heel) * Math.min(1, dt * 2);
}
