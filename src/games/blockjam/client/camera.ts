import type { Client, ClientKit } from '@platform/client';
import { CAMERA, FLOOR, HALF_LENGTH, rim, type Side } from '../court';
import type { JamState } from '../moves';
import type { JamView } from './state';

/**
 * The broadcast camera: up in the stands on the near sideline, panning with the ball along the
 * court (easing, a little behind it), punching in a touch on a slam. It's this screen's own (the
 * server knows nothing of it), and it watches from the home page too, so the game on show is the
 * game as it's played.
 *
 * And which way our own baller faces: where they run, squared up to the rim to shoot or dunk (the
 * view's turn is their figure's facing; the camera above is the screen's).
 */
export function cameraKit(view: JamView): ClientKit {
  let tx = 0;
  let kick = 0;
  let started = false;
  return {
    name: 'jam.camera',
    frame(client, dt) {
      for (const m of view.moments) if (m.k === 'slam') kick = 1;
      kick = Math.max(0, kick - dt * 1.6);
      const target = ballX(client, view);
      const lim = HALF_LENGTH - 5.5;
      const want = Math.max(-lim, Math.min(lim, target));
      tx = started ? tx + (want - tx) * (1 - Math.exp(-dt * 2.6)) : want;
      started = true;
      const k = kick * kick;
      client.camera.take({
        position: { x: tx * 0.86, y: CAMERA.y - k * 0.8, z: CAMERA.z - k * 1.5 },
        target: { x: tx, y: FLOOR + 0.9, z: -1.3 },
        fov: CAMERA.fov - k * 5,
      });
    },
    controls(client, c, dt) {
      const s = client.me.abilities?.jam as unknown as JamState | undefined;
      if (!s || !c.active) return;
      const p = client.me.position;
      const v = client.me.velocity;
      let want: number | null = null;
      // Shooting, dunking, hanging on the rim: facing the basket.
      if (s.air === 1 || s.air === 3 || s.air === 4 || (s.ball && (c.isDown('Space') || c.button(0)))) {
        const r = rim((s.side >= 0 ? 1 : -1) as Side);
        want = Math.atan2(-(r.x - p.x), -(r.z - p.z));
      } else if (Math.hypot(v.x, v.z) > 0.8 && s.stun <= 0) want = Math.atan2(-v.x, -v.z);
      let dy = 0;
      if (want !== null) {
        let d = want - c.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        dy = d * Math.min(1, dt * 16);
      }
      c.turn(-c.pitch, dy);
    },
  };
}

/** Where along the court the ball is (whoever has it, or where it's flying). */
function ballX(client: Client, view: JamView): number {
  if (view.holder) {
    for (const f of client.figures.all) if (f.player === view.holder) return f.root.position.x;
    if (view.holder === client.me.id) return client.me.position.x;
  }
  const f = view.ballInAir();
  return f ? f.x : 0;
}
