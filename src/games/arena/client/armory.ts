import type { ViewAnimation } from '@platform';
import type { Client, ClientKit, Node } from '@platform/client';
import { firstPerson } from '@platform/client/kits';
import { Quat, Vec3 } from '@platform/client/math';
import type { CrossbowItem } from '../items/crossbow';
import type { ArmsMelee } from '../items/melee';
import { crossbowMove, meleeMove, type CrossbowShown } from '../items/moves';
import { rarityOf, shieldOf } from '../items/rarity';
import type { ClientPart } from './part';

/**
 * The armory on each screen: the first-person view (the platform's kit, `fp`, which the Arena's
 * `client.ts` lists in place of `firstPerson.standard()`) with the Arena's own swings and holds;
 * the gladius's shield on the off hand, raised to guard; the guard, the warhammer's raised charge
 * and the spear raised to throw, the moment the button goes down (the host decides what they do);
 * and the crossbow's screen half (spanning shown as a reload, aiming as aiming down sights, other
 * players' figures shouldering it).
 */
export const fp = new firstPerson.FirstPersonKit({ styles: { staff: 'sword' } });
// (Development: screenshots reach it, to freeze a swing with `timeScale`.)
if (import.meta.env.DEV) (globalThis as { __fp?: unknown }).__fp = fp;

/** The Arena's first-person swings and poses (keys: `move` in blocks, `hand` and `wrist` in radians, pitch-yaw-roll). */
const ANIMS: Record<string, ViewAnimation> = {
  // The gladius: a short, punchy cut from the right, across and down.
  arena_slash: {
    duration: 0.3,
    keys: [
      { t: 0 },
      { t: 0.18, hand: [0.3, -0.15, -0.55], move: [0.08, 0.1, 0.04], ease: 'out' },
      { t: 0.42, hand: [-0.25, 0.3, 1.0], move: [-0.22, 0.06, -0.16], ease: 'in' },
      { t: 0.58, hand: [-0.35, 0.35, 1.25], move: [-0.28, 0.0, -0.1], ease: 'out' },
      { t: 1, ease: 'inOut' },
    ],
  },
  // The daggers: a quick stab straight out, the blade turned down at the end.
  arena_stab: {
    duration: 0.2,
    keys: [{ t: 0 }, { t: 0.35, wrist: [-1.25, 0, 0], move: [-0.14, 0.06, -0.34], ease: 'out' }, { t: 1, ease: 'inOut' }],
  },
  // The greatsword: laid back over to the right, swept wide and flat across to the left (mostly a roll, the blade level).
  arena_sweep: {
    duration: 0.55,
    keys: [
      { t: 0 },
      { t: 0.28, hand: [0.1, -0.35, -1.25], move: [0.18, 0.02, 0.06], ease: 'out' },
      { t: 0.5, hand: [-0.1, 0.3, 1.25], move: [-0.3, -0.04, -0.12], ease: 'in' },
      { t: 0.64, hand: [-0.12, 0.35, 1.45], move: [-0.36, -0.06, -0.08], ease: 'out' },
      { t: 1, ease: 'inOut' },
    ],
  },
  // The warhammer's plain swing: up and over, down in front.
  arena_hammer: {
    duration: 0.5,
    keys: [
      { t: 0 },
      { t: 0.38, hand: [0.55, -0.05, -0.15], move: [0.03, 0.14, 0.08], ease: 'out' },
      { t: 0.58, hand: [-0.95, 0.15, 0.2], move: [-0.06, -0.1, -0.2], ease: 'in' },
      { t: 1, ease: 'inOut' },
    ],
  },
  // The slam, from the raised charge: down hard into the ground.
  arena_slam: {
    duration: 0.6,
    keys: [
      { t: 0, hand: [0.42, -0.2, -0.45], move: [0.02, 0.08, 0.1] },
      { t: 0.22, hand: [-1.25, 0.15, 0.25], move: [-0.08, -0.22, -0.3], ease: 'in' },
      { t: 0.45, hand: [-1.2, 0.15, 0.25], move: [-0.08, -0.24, -0.28] },
      { t: 1, ease: 'inOut' },
    ],
  },
  // A staff thrust forward and up as the spell leaves it; the frost staff's, quicker and smaller.
  arena_cast: {
    duration: 0.4,
    keys: [{ t: 0 }, { t: 0.3, hand: [-0.45, 0.1, 0.1], move: [-0.06, 0.08, -0.24], ease: 'out' }, { t: 1, ease: 'inOut' }],
  },
  arena_cast_quick: {
    duration: 0.2,
    keys: [{ t: 0 }, { t: 0.35, hand: [-0.2, 0.05, 0.05], move: [-0.03, 0.03, -0.1], ease: 'out' }, { t: 1, ease: 'inOut' }],
  },
  // The wand flicked at the target.
  arena_flick: {
    duration: 0.28,
    keys: [{ t: 0 }, { t: 0.15, wrist: [0.35, 0, 0], ease: 'out' }, { t: 0.4, wrist: [-0.85, 0.1, 0], move: [-0.06, 0.04, -0.14], ease: 'in' }, { t: 1, ease: 'inOut' }],
  },
  // The spear's throw: the arm whips forward from the raised pose.
  arena_spear_throw: {
    duration: 0.35,
    keys: [
      { t: 0, hand: [0.22, 0, 0], move: [0.08, 0.1, 0.2] },
      { t: 0.35, hand: [-0.6, 0.1, 0], move: [-0.1, 0.0, -0.45], ease: 'in' },
      { t: 1, hand: [-0.2, 0, 0], move: [0, -0.5, -0.1], ease: 'out' },
    ],
  },
};

/** Poses held while a button is: the guard (the sword in close, the shield up), the hammer raised, the spear drawn back. */
const POSES: Record<string, ViewAnimation> = {
  arena_guard: { duration: 1, keys: [{ t: 0, hand: [0.15, 0.25, 0.35], move: [-0.04, -0.04, 0.1] }] },
  arena_raise: { duration: 1, keys: [{ t: 0, hand: [0.42, -0.2, -0.45], move: [0.02, 0.08, 0.1] }] },
  arena_aim: { duration: 1, keys: [{ t: 0, hand: [0.22, 0, 0], move: [0.08, 0.1, 0.2] }] },
};

/** Where the shield sits on the off hand (the view's space): at rest low at the left, and raised to guard. */
const SHIELD_REST = new Vec3(-0.52, -0.5, -0.78);
const SHIELD_UP = new Vec3(-0.22, -0.27, -0.62);
const SHIELD_SCALE = 0.38;

/** Development: a pose held as if its button were down (screenshots have no mouse): `__armoryPose('arena_guard')`. */
let forced: string | null = null;
if (import.meta.env.DEV) (globalThis as { __armoryPose?: unknown }).__armoryPose = (p: string | null) => void (forced = p);

function armory(): ClientKit {
  let lmb = false;
  let rmb = false;
  let pose: string | null = null;
  /** The shield on show (by item), its node, and how far it's raised (0..1). */
  let shield: { id: string; node: Node } | null = null;
  let raised = 0;
  const qRest = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), 0.5).multiply(new Quat().setFromAxisAngle(new Vec3(1, 0, 0), -0.15));
  const qUp = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), 0.12);
  const at = new Vec3();
  const q = new Quat();

  const setShield = (client: Client, id: string | null) => {
    if (shield?.id === id) return;
    if (shield) client.view.free(shield.node);
    shield = null;
    if (!id) return;
    const node = client.view.item(id);
    if (!node) return;
    client.view.root.add(node);
    shield = { id, node };
  };

  return {
    name: 'arena.armory',
    setup() {
      for (const [name, anim] of Object.entries({ ...ANIMS, ...POSES })) fp.define(name, anim);
    },
    controls(_client, c) {
      lmb = c.active && c.button(0);
      rmb = c.active && c.button(2);
    },
    frame(client, dt) {
      const me = client.me;
      const id = me.hand.item;
      const def = id ? (client.item(id) as ArmsMelee | undefined) : undefined;
      const melee = def?.kind === 'melee' && !me.dead;
      // What's held up while the button is: the host decides what comes of it.
      let want: string | null = null;
      if (melee && def.guard && rmb) want = 'arena_guard';
      else if (melee && def.slam && lmb) want = 'arena_raise';
      else if (melee && def.throw && rmb) want = 'arena_aim';
      if (forced) want = forced;
      if (want !== pose) {
        pose = want;
        fp.pose(want, { ease: want ? 0.08 : 0.14 });
      }
      // The gladius's shield on the off hand, raised behind the guard.
      setShield(client, melee && def.guard && id ? shieldOf(rarityOf(id)) : null);
      if (!shield) return;
      raised += ((pose === 'arena_guard' ? 1 : 0) - raised) * Math.min(1, dt * 16);
      const bob = me.bob.amount * Math.sin(me.bob.phase) * 0.02;
      at.copy(SHIELD_REST).lerp(SHIELD_UP, raised);
      at.y += bob * (1 - raised);
      shield.node.position.copy(at);
      shield.node.quaternion.copy(q.copy(qRest).slerp(qUp, raised));
      shield.node.scale.setScalar(SHIELD_SCALE);
      shield.node.visible = fp.visible;
    },
    dispose() {
      shield?.node.parent?.remove(shield.node);
      shield = null;
    },
  };
}

/**
 * The crossbow's screen half (its kind is `gun`: `items/crossbow.ts`): how aimed it is (the right
 * button, eased), spanning shown as the gun pose's reload, figures shouldering it, and its slower
 * steps while aiming, predicted as the host has them.
 */
function crossbowScreen(): ClientKit {
  let want = false;
  let aim = 0;
  return {
    name: 'arena.crossbow',
    kind: 'gun',
    controls(_client, c) {
      want = c.active && c.button(2);
    },
    frame(_client, dt) {
      aim += ((want ? 1 : 0) - aim) * Math.min(1, dt * 12);
    },
    move: (def, controls) => crossbowMove(def, controls),
    heldState(client, _item, def) {
      const st = client.me.hand.state as CrossbowShown | null;
      const arrows = client.me.hotbar?.slots.reduce((n, s) => n + (s?.item === 'arrow' ? s.count : 0), 0) ?? 0;
      return { aim, sprint: client.me.sprinting ? 1 : 0, slide: 0, reload: st?.r ?? -1, shells: 0, sight: 'iron', zoom: (def as CrossbowItem | undefined)?.zoom ?? 1.5, mag: st?.l ? 1 : 0, reserve: arrows };
    },
    figureSignals(state) {
      const s = state as CrossbowShown | null;
      return { aim: 1, sights: s?.a ? 1 : 0, reloading: (s?.r ?? -1) >= 0 };
    },
  };
}

/** The melee weapons' screen half: only how they slow their holder (guarding, charging), predicted as the host has it. */
const meleeScreen: ClientKit = { name: 'arena.melee', kind: 'melee', move: (def, controls) => meleeMove(def as ArmsMelee, controls) };

export const armoryClient: ClientPart = { name: 'armoryClient', kits: [armory(), crossbowScreen(), meleeScreen] };
