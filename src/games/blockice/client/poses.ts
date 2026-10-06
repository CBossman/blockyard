import type { ClientKit, FigureRig } from '@platform/client';
import { Euler, Quat } from '@platform/client/math';
import type { IceView } from './state';

/**
 * The skaters' poses, over the figures kit (this kit runs after it): a big head on everyone (the
 * helmet's on it, so it's big too); skating (a crouch, leaning into it, the legs pushing out to the
 * sides in turn, gliding when they coast); both hands on the stick; a slap shot's wind-up and its
 * follow-through; a check's shoulder, a poke's reach; flattened and getting up; arms up after a
 * goal. The goalies: a wide crouch, the glove out, the blocker down; the butterfly, a glove save, a
 * blocker save, a sprawl.
 */

/** How big the heads are (arcade). */
export const HEAD = 1.6;

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const e1 = new Euler(0, 0, 0, 'YXZ');
const q1 = new Quat();
const rot = (x: number, y = 0, z = 0) => q1.setFromEuler(e1.set(x, y, z, 'YXZ'));

type Joints = FigureRig['joints'];
type Rest = FigureRig['rest'];

/** An arm set from rest: the shoulder turned (x forward-and-up when negative, z out), the elbow bent. */
function arm(j: Joints, rest: Rest, side: 'L' | 'R', x: number, z: number, bend: number, y = 0) {
  const s = side === 'L' ? -1 : 1;
  j[`upperArm${side}`].quaternion.copy(rest[`upperArm${side}`].quaternion).multiply(rot(x, y * s, z * s));
  j[`lowerArm${side}`].quaternion.copy(rest[`lowerArm${side}`].quaternion).multiply(rot(-bend, 0, 0));
}

/** A leg set from rest: the hip turned forward (`hip`), out to the side (`out`), the knee bent. */
function leg(j: Joints, rest: Rest, side: 'L' | 'R', hip: number, out: number, knee: number) {
  j[`upperLeg${side}`].quaternion.copy(rest[`upperLeg${side}`].quaternion).multiply(rot(-hip, 0, side === 'L' ? out : -out));
  j[`lowerLeg${side}`].quaternion.copy(rest[`lowerLeg${side}`].quaternion).multiply(rot(knee, 0, 0));
}

/** The body: the hips dropped (blocks) and turned, the back leaning forward, the head up to look ahead. */
function body(j: Joints, rest: Rest, drop: number, lean: number, twist = 0, tilt = 0) {
  const r = rest.hips.position;
  j.hips.position.set(r.x, r.y - drop, r.z);
  j.hips.quaternion.copy(rest.hips.quaternion).multiply(rot(0, 0, tilt));
  j.spine.quaternion.copy(rest.spine.quaternion).multiply(rot(lean * 0.6, twist * 0.5, 0));
  j.chest.quaternion.copy(rest.chest.quaternion).multiply(rot(lean * 0.4, twist * 0.5, 0));
  j.neck.quaternion.copy(rest.neck.quaternion).multiply(rot(-lean * 0.7, 0, 0));
}

export function posesKit(view: IceView): ClientKit {
  /** Each figure's stride. */
  const phase = new Map<string, number>();
  /** Who checked, poked or scored lately (this screen's clock). */
  const checked = new Map<string, number>();
  const poked = new Map<string, number>();
  const scored = new Map<string, number>();
  return {
    name: 'ice.poses',
    frame(client, dt) {
      for (const m of view.moments) {
        if (m.k === 'hit') checked.set(m.by, client.time);
        else if (m.k === 'poke') poked.set(m.by, client.time);
        else if (m.k === 'goal' && m.by) scored.set(m.by, client.time);
      }
      for (const fig of client.figures.all) {
        const rig = fig.rig;
        const id = fig.player;
        if (!rig || !id) continue;
        const j = rig.joints;
        const rest = rig.rest;
        j.head.scale.setScalar(HEAD);
        const s = view.skaters.get(id);
        if (!s) continue;

        // Flattened: sprawled on the ice, arms out; up again as it wears off.
        if (s.stun > 0) {
          const t = s.stun > 0.35 ? 1 : s.stun / 0.35;
          const r = rest.hips.position;
          j.hips.position.set(r.x, r.y - (r.y - 0.2) * t, r.z - 0.4 * t);
          j.hips.quaternion.copy(rest.hips.quaternion).multiply(rot(1.45 * t));
          arm(j, rest, 'R', -1.4 * t, 1.1 * t, 0.4 * t);
          arm(j, rest, 'L', -1.4 * t, 1.1 * t, 0.4 * t);
          leg(j, rest, 'L', 0.2 * t, 0.15 * t, 0.5 * t);
          leg(j, rest, 'R', 0.2 * t, 0.15 * t, 0.5 * t);
          continue;
        }

        if (s.goalie) {
          goalie(j, rest, s.save, s.saveT, client.time);
          continue;
        }

        // Skating: a crouch, leaning in; the legs push out in turn, faster and further the quicker they go.
        const speed = fig.state.speed ?? 0;
        const amount = Math.min(1, Math.max(0, (speed - 1.5) / 6));
        const p = (phase.get(id) ?? Math.random() * 6) + dt * (3 + speed * 0.5) * (amount > 0.05 ? 1 : 0);
        phase.set(id, p);
        body(j, rest, 0.08 + 0.04 * amount, 0.35 + 0.25 * amount);
        for (const side of ['L', 'R'] as const) {
          const ph = side === 'L' ? p : p + Math.PI;
          const push = Math.max(0, Math.sin(ph)) * amount;
          leg(j, rest, side, 0.55 + 0.18 * Math.cos(ph) * amount, 0.07 + 0.42 * push, 1.0 - 0.55 * push);
        }

        // The arms: both hands on the stick, low and ahead (the top hand, the left, across the body).
        const sinceGoal = client.time - (scored.get(id) ?? -9);
        if (sinceGoal < 2.6) {
          const k = smooth(sinceGoal / 0.3);
          arm(j, rest, 'L', -0.7 - 1.9 * k, 0.2, 0.3);
          arm(j, rest, 'R', -0.8 - 2.0 * k, 0.15, 0.2);
          continue;
        }
        const ch = client.time - (checked.get(id) ?? -9);
        if (ch < 0.4) {
          // A check: the shoulder dropped into them, the arms in.
          const k = Math.sin((ch / 0.4) * Math.PI);
          body(j, rest, 0.12, 0.55 + 0.3 * k, -0.5 * k);
          arm(j, rest, 'L', -0.5, -0.1, 1.4);
          arm(j, rest, 'R', -0.5, 0.1, 1.4);
          continue;
        }
        const po = client.time - (poked.get(id) ?? -9);
        if (s.wind > 0.02) {
          // A wind-up: the stick back over the right shoulder, the shoulders turned away, the weight
          // sinking onto the back leg.
          const k = smooth(s.wind * 1.4);
          body(j, rest, 0.1 + 0.06 * k, 0.3 + 0.1 * k, -0.7 * k);
          leg(j, rest, 'L', 0.55 + 0.15 * k, 0.07 + 0.2 * k, 1.0 + 0.15 * k);
          leg(j, rest, 'R', 0.55 - 0.15 * k, 0.07 + 0.25 * k, 1.0 - 0.3 * k);
          arm(j, rest, 'L', -0.75 - 1.4 * k, -0.2 + 0.2 * k, 0.6 + 0.4 * k);
          arm(j, rest, 'R', -0.9 - 1.7 * k, 0.15 + 0.35 * k, 0.4 + 0.6 * k);
        } else if (s.shot > 0 && s.shot < 0.45) {
          // The follow-through: swept through, the stick up ahead, the shoulders round.
          const k = Math.sin((s.shot / 0.45) * Math.PI);
          body(j, rest, 0.1, 0.35, 0.6 * k);
          arm(j, rest, 'L', -0.9 - 0.7 * k, -0.3, 0.4);
          arm(j, rest, 'R', -1.0 - 0.9 * k, -0.1, 0.2);
        } else if (po < 0.3) {
          // A poke: both hands thrust ahead.
          const k = Math.sin((po / 0.3) * Math.PI);
          arm(j, rest, 'L', -0.9 - 0.5 * k, -0.25, 0.6 - 0.5 * k);
          arm(j, rest, 'R', -1.0 - 0.5 * k, 0.1, 0.3 - 0.2 * k);
        } else {
          const sway = Math.sin(p) * 0.12 * amount;
          arm(j, rest, 'L', -0.78 + sway, -0.28, 0.65);
          arm(j, rest, 'R', -0.95 - sway, 0.12, 0.35);
        }
      }
    },
  };
}

/** A goalie: the ready crouch, or a save (by kind) for a moment after it's made. */
function goalie(j: Joints, rest: Rest, save: number, t: number, now: number) {
  const k = save ? smooth(t / 0.12) * (1 - smooth((t - 0.7) / 0.4)) : 0;
  const breathe = Math.sin(now * 2.2) * 0.01;
  if (save === 1 && k > 0) {
    // The butterfly: down on the knees, the pads flared out along the ice.
    body(j, rest, 0.18 + 0.2 * k, 0.25);
    leg(j, rest, 'L', 0.7 + 0.5 * k, 0.45 + 0.7 * k, 1.3 + 0.9 * k);
    leg(j, rest, 'R', 0.7 + 0.5 * k, 0.45 + 0.7 * k, 1.3 + 0.9 * k);
    arm(j, rest, 'L', -1.1, 0.9, 0.8);
    arm(j, rest, 'R', -0.7, 0.5, 0.4);
    return;
  }
  body(j, rest, 0.18 + breathe, 0.3, 0, save === 4 ? 0.7 * k : 0);
  leg(j, rest, 'L', 0.7, 0.45, 1.3);
  leg(j, rest, 'R', 0.7, 0.45, 1.3);
  if (save === 4) leg(j, rest, 'R', 0.3, 1.0 * k + 0.45, 0.4);
  // The glove out and up (higher for a glove save), the blocker down by the stick (out for a blocker save).
  arm(j, rest, 'L', -0.95 - 1.4 * (save === 2 ? k : 0), 0.75 + 0.3 * (save === 2 ? k : 0), 0.9 - 0.5 * (save === 2 ? k : 0));
  arm(j, rest, 'R', -0.6 - 0.9 * (save === 3 ? k : 0), 0.35 + 0.7 * (save === 3 ? k : 0), 0.5);
}
