import type { MovementAbility } from '@platform';

/**
 * Skydiving. Step off the bus and you fall fast, steering with the keys; Space opens the
 * parachute (and shuts it again), and it opens by itself when the ground gets close. Under the
 * parachute you fall slowly and glide further. It's a movement ability: a pure step that runs on
 * the host and, ahead of it, on each player's own screen, so it answers the moment you press a key.
 *
 * (Falls don't hurt in this game, so a landing is just the end of the glide.)
 */

export const DIVE = {
  /** Below this far above the ground, anyone in free fall gets their parachute. */
  autoOpen: 38,
  /** Higher than this above the ground and falling, they start to dive. */
  start: 12,
  /** Blocks a second down: diving (holding forward, nose down), falling, under the parachute. */
  plunge: 34,
  fall: 22,
  float: 5.5,
  /** Blocks a second along the way they steer, in each. */
  glide: { dive: 17, fall: 7, chute: 12 },
  /** How fast speed follows the steering (a rate: per second). */
  steer: 2.6,
};

export interface DiveState {
  /** 0 on foot, 1 free fall, 2 parachute open. */
  mode: 0 | 1 | 2;
}

export const dive: MovementAbility<DiveState> = {
  state: { mode: 0 },
  step(s, c, body, dt, world) {
    if (body.onGround || body.inWater || body.flying) {
      s.mode = 0;
      return;
    }
    const ground = world.surfaceY(body.position.x, body.position.z);
    // Before the world's under them (a screen still loading), assume the island's ground.
    const alt = body.position.y - (ground >= 0 ? ground + 1 : 66);
    const v = body.velocity;
    if (s.mode === 0) {
      if (alt < DIVE.start || v.y > -8) return;
      s.mode = 1;
      body.trigger('dive');
    }
    if (c.pressed('Space')) {
      s.mode = s.mode === 1 ? 2 : 1;
      c.consume('Space');
      if (s.mode === 2) body.trigger('open');
    }
    if (s.mode === 1 && alt < DIVE.autoOpen) {
      s.mode = 2;
      body.trigger('open');
    }
    const w = body.wish;
    const push = Math.min(1, Math.hypot(w.x, w.z));
    const forward = w.x * -Math.sin(body.yaw) + w.z * -Math.cos(body.yaw);
    const diving = s.mode === 1 && forward > 0.4;
    const speed = s.mode === 2 ? DIVE.glide.chute : diving ? DIVE.glide.dive : DIVE.glide.fall;
    const down = s.mode === 2 ? DIVE.float : diving ? DIVE.plunge : DIVE.fall;
    const k = 1 - Math.exp(-DIVE.steer * dt);
    body.setVelocity({ x: v.x + (w.x * push * speed - v.x) * k, y: v.y + (-down - v.y) * k, z: v.z + (w.z * push * speed - v.z) * k });
    body.gravity = 0;
    body.control = 0;
    body.jump = false;
    // The view leans into the turn, and nods down in a dive.
    const right = w.x * Math.cos(body.yaw) - w.z * Math.sin(body.yaw);
    body.camera.roll = right * push * 0.1;
    body.camera.pitch = diving ? -0.12 : 0;
  },
};
