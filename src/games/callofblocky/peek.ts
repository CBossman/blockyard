import type { MovementAbility, Vec3, VehicleWorld } from '@platform';

/**
 * Peeking round corners: press Q to lean out to the left, E to the right, and it stays leaned;
 * the same key again stands up straight, and the other key leans the other way. The head and
 * shoulders go out sideways (`body.lean`), so the eyes, where shots start, the head's hitbox and
 * the figure everyone sees all go with them, and the view tilts the way it leans. It eases out
 * and back, stops short of a wall on that side, and sprinting or sliding stands you up (and
 * you stay up after). A pure step: it runs on the host and, ahead of it, on the player's own
 * screen, so the lean answers the moment the key goes down, online too.
 */
/** Its keys, how far out (blocks), how quickly it eases (per second), the view's tilt at full lean (radians), and the gap it keeps from walls. */
export const PEEK = { left: 'KeyQ', right: 'KeyE', reach: 0.4, rate: 16, roll: 0.22, gap: 0.25 };

export interface PeekState {
  /** Which way it's leaning: -1 left, 1 right, 0 upright. */
  side: number;
  /** How far out it leans now (blocks, positive right). */
  lean: number;
}

export const peek: MovementAbility<PeekState> = {
  state: { side: 0, lean: 0 },
  step(s, c, body, dt, world) {
    // A key leans that way and stays; the same key again stands up, the other swaps sides.
    if (c.pressed(PEEK.left)) s.side = s.side === -1 ? 0 : -1;
    if (c.pressed(PEEK.right)) s.side = s.side === 1 ? 0 : 1;
    if (body.sprinting || body.sliding || body.flying) s.side = 0;
    const want = s.side * PEEK.reach;
    s.lean += (want - s.lean) * (1 - Math.exp(-dt * PEEK.rate));
    if (Math.abs(want - s.lean) < 0.005) s.lean = want;
    if (s.lean !== 0) {
      // Never into a wall: out only as far as there's room, at the eyes and the top of the head.
      const room = clearance(world, body.position, body.crouching ? 1.27 : 1.62, body.yaw, Math.sign(s.lean));
      s.lean = Math.sign(s.lean) * Math.min(Math.abs(s.lean), room);
    }
    body.lean = s.lean;
    body.camera.roll = (s.lean / PEEK.reach) * PEEK.roll;
  },
};

/** How far out the head can go to one side (+1 right, -1 left) before it's within `gap` of a block. */
function clearance(world: VehicleWorld, feet: Vec3, eye: number, yaw: number, dir: number): number {
  const d = { x: Math.cos(yaw) * dir, y: 0, z: -Math.sin(yaw) * dir };
  let room = PEEK.reach;
  for (const up of [eye, eye + 0.3]) {
    const o = { x: feet.x, y: feet.y + up, z: feet.z };
    const hit = world.raycast(o, d, PEEK.reach + PEEK.gap);
    if (hit) room = Math.min(room, Math.max(0, Math.hypot(hit.point.x - o.x, hit.point.z - o.z) - PEEK.gap));
  }
  return room;
}
