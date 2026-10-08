import type { Client, ClientKit } from '@platform/client';
import { Color } from '@platform/client/math';
import type { Circle, StormStep, StormWire } from '../storm';

/**
 * The storm on this screen. The server sends the circle's state a second at a time (`storm`); the
 * kit eases the radius between messages, draws the wall as a haze of purple light along the circle
 * near the camera, and tints the whole screen when this player is outside it. The map reads
 * `stormView` to draw the circle and the next one.
 */

export const stormView: {
  /** The safe circle now, and the one it's closing on (null while calm or once closed). */
  now: Circle | null;
  next: Circle | null;
  step: StormStep;
  phase: number;
  /** Seconds left in this step, as of this frame. */
  left: number;
  damage: number;
  /** This player is outside the safe circle. */
  outside: boolean;
} = { now: null, next: null, step: 'calm', phase: 0, left: 0, damage: 0, outside: false };

const PURPLE = new Color('#7a2cff');
const RING = new Color('#b98aff');

const STYLE = `
.br-storm { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.4s;
  background: radial-gradient(ellipse at center, #7a2cff00 38%, #7a2cff55 72%, #5a12d6aa 100%); mix-blend-mode: normal; }
.br-storm.on { opacity: 1; animation: br-storm-pulse 1.4s ease-in-out infinite; }
@keyframes br-storm-pulse { 50% { filter: brightness(1.35); } }
.br-storm .warn { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); font: 700 18px/1 var(--pixel, sans-serif); letter-spacing: 0.1em; color: #fff;
  text-shadow: 0 2px 0 #3a0a88, 0 0 12px #a45bff; text-transform: uppercase; }
`;

export function stormKit(): ClientKit {
  let wire: StormWire | null = null;
  let gotAt = 0;
  let acc = 0;
  let overlay: HTMLElement | null = null;
  let off: (() => void) | null = null;

  return {
    name: 'storm',
    setup(client: Client) {
      off = client.hud.style(STYLE);
      overlay = client.hud.layer('br-storm', 'panels');
      overlay.classList.add('br-storm');
      overlay.innerHTML = '<div class="warn">You are in the storm</div>';
      client.on('storm', (data) => {
        wire = data as StormWire;
        gotAt = client.time;
      });
    },
    frame(client: Client, dt: number) {
      // A new match clears it.
      if (client.events.some((e) => e.t === 'reset')) wire = null;
      if (!wire) {
        stormView.now = stormView.next = null;
        stormView.outside = false;
        overlay?.classList.remove('on');
        return;
      }
      const el = client.time - gotAt;
      let cur: Circle = wire.now;
      if (wire.step === 'shrink' && wire.next && wire.left > 0) {
        const k = Math.min(1, el / wire.left);
        cur = { x: wire.now.x + (wire.next.x - wire.now.x) * k, z: wire.now.z + (wire.next.z - wire.now.z) * k, r: wire.now.r + (wire.next.r - wire.now.r) * k };
      }
      stormView.now = cur;
      stormView.next = wire.next;
      stormView.step = wire.step;
      stormView.phase = wire.phase;
      stormView.left = Math.max(0, wire.left - el);
      stormView.damage = wire.damage;
      const me = client.me.position;
      const dist = Math.hypot(me.x - cur.x, me.z - cur.z);
      stormView.outside = dist > cur.r && !client.me.dead;
      overlay?.classList.toggle('on', stormView.outside);

      // The wall: puffs of light along the circle nearest the camera, drifting up.
      const cam = client.camera.position;
      const camDist = Math.hypot(cam.x - cur.x, cam.z - cur.z);
      if (cur.r < 1 || Math.abs(camDist - cur.r) > 240) return;
      acc += Math.min(dt, 0.05) * 520;
      const around = Math.atan2(cam.z - cur.z, cam.x - cur.x);
      // Cover about 200 blocks of the arc, more of it when the camera's near the wall.
      const spread = Math.min(Math.PI, (camDist > cur.r ? 120 : 200) / Math.max(30, cur.r));
      while (acc >= 1) {
        acc -= 1;
        // Most of it close by, thinning out along the arc (squaring the draw bunches it toward the camera).
        const u = Math.random() * 2 - 1;
        const a = around + Math.sign(u) * u * u * spread;
        const at = { x: cur.x + Math.cos(a) * cur.r, y: cam.y + (Math.random() * 2 - 1) * 28, z: cur.z + Math.sin(a) * cur.r };
        const c = Math.random() < 0.18 ? RING : PURPLE;
        client.fx.particles(at, [c.r, c.g, c.b], {
          count: 1,
          // (Sizes are in blocks: a few small bright motes each, thousands of them, make a wall.)
          size: 0.35 + Math.random() * 0.8,
          glow: 0.2,
          life: 2.2 + Math.random(),
          speed: 0.25,
          gravity: -0.03,
          up: 0.35,
          drag: 0.4,
          collide: false,
        });
      }
    },
    dispose() {
      off?.();
    },
  };
}
