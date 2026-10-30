import { math, type VehicleDefinition } from '@platform';
import { landAt } from './course';
import { step, forward, type Motion } from './physics';

export { DOWNWIND_VMG, IRONS, KNOTS, MAX_BOOM, TAKEOFF, UPWIND_VMG, forward, idealBoom, sheetToBoom, wrapAngle } from './physics';

/**
 * The boat as a vehicle: a 20-metre foiling monohull (`physics.ts`), sailed the same on the
 * server and, ahead of it, on the skipper's own screen. The server writes the wind at the boat
 * into the state every tick (`wd`, `ws`), so the step itself stays pure.
 */

export interface BoatState extends Motion {
  x: number;
  z: number;
  /** Seconds sailed: the boat's bob on the swell. */
  t: number;
  /** The camera (C): 0 behind the boat, 1 high above it, looking upwind to read the gusts. */
  view: number;
  /** Set when the boat ran aground this step. */
  aground: boolean;
}

/** Half the hull's length: what runs aground first is its bow. */
export const HALF_LENGTH = 10;

export function freshBoat(x: number, z: number, heading: number, wd: number, ws: number): BoatState {
  return { x, z, heading, speed: 3, rudder: 0, sheet: 0.5, boom: 0, ride: 0, heel: 0, t: 0, wd, ws, twa: 0, awa: 0, aws: 0, auto: true, view: 0, eff: 0, luff: 0, aground: false };
}

/** Steering and trim, from the keyboard or from a bot. */
export interface Helm {
  steer: number;
  sheet: number;
}

/** One step of sailing: the boat answers the helm, the sails and the wind, and moves (unless that's onto land). */
export function sail(s: BoatState, helm: Helm, dt: number): void {
  s.t += dt;
  step(s, helm, dt);
  // Leeway: in the water the hull slips a little downwind; flying, the foils grip.
  const f = forward(s.heading);
  const up = forward(s.wd);
  const slip = s.ws * 0.04 * (1 - s.ride);
  const nx = s.x + (f.x * s.speed - up.x * slip) * dt;
  const nz = s.z + (f.z * s.speed - up.z * slip) * dt;
  s.aground = landAt(nx + f.x * HALF_LENGTH, nz + f.z * HALF_LENGTH) || landAt(nx, nz);
  if (s.aground) {
    s.x -= f.x * 1.5;
    s.z -= f.z * 1.5;
    s.speed *= 0.2;
    s.ride = 0;
  } else {
    s.x = nx;
    s.z = nz;
  }
}

const _euler = new math.Euler(0, 0, 0, 'YXZ');
const _v = new math.Vector3();

export const boatVehicle: VehicleDefinition<BoatState> = {
  step(s, c, dt) {
    if (c.pressed('KeyT')) s.auto = !s.auto;
    if (c.pressed('KeyC')) s.view = s.view ? 0 : 1;
    const steer = (c.isDown('KeyD') || c.isDown('ArrowRight') ? 1 : 0) - (c.isDown('KeyA') || c.isDown('ArrowLeft') ? 1 : 0);
    const sheet = (c.isDown('KeyW') || c.isDown('ArrowUp') ? 1 : 0) - (c.isDown('KeyS') || c.isDown('ArrowDown') ? 1 : 0);
    sail(s, { steer, sheet }, dt);
  },
  pose(s, position, quaternion) {
    position.set(s.x, boatY(s), s.z);
    // In the water it pitches and rolls on the swell; flying, the foils hold it steady, the bow a
    // touch up while it climbs out.
    const sea = 1 - s.ride * 0.85;
    const pitch = Math.sin(s.t * 1.1 + s.z * 0.02) * 0.03 * sea + (s.ride > 0 && s.ride < 1 ? 0.04 : 0.01 * s.ride);
    quaternion.setFromEuler(_euler.set(pitch, -s.heading, s.heel + Math.sin(s.t * 0.8 + s.x * 0.02) * 0.02 * sea));
  },
  camera(s, cam, dt) {
    if (s.view) {
      // Up over the boat, downwind of it and looking upwind: the gusts coming, the laylines, the fleet.
      const up = forward(s.wd);
      _v.set(s.x - up.x * 40, WATER_Y + 45, s.z - up.z * 40);
      cam.position.lerp(_v, cam.snap ? 1 : 1 - Math.exp(-dt * 3));
      cam.target.set(s.x + up.x * 45, WATER_Y, s.z + up.z * 45);
      cam.fov = 60;
      return;
    }
    // Behind and above, like the broadcast chase boat, swinging round with the boat.
    const f = forward(s.heading);
    _v.set(s.x - f.x * 42, boatY(s) + 13, s.z - f.z * 42);
    cam.position.lerp(_v, cam.snap ? 1 : 1 - Math.exp(-dt * 3));
    cam.target.set(s.x + f.x * 18, boatY(s) + 6, s.z + f.z * 18);
    cam.fov = 68;
  },
};

/** The sea's surface. */
export const WATER_Y = 63;
/** Where the hull sits: down in the water, or flown clear of it on the foils. */
export const boatY = (s: BoatState) => WATER_Y - 0.6 + s.ride * 2.4 + Math.sin(s.t * 1.3 + s.z * 0.02 - 0.8) * 0.15 * (1 - s.ride);
