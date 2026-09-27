import { readFileSync } from 'node:fs';
import { defineGame, type GameDefinition } from '../../src/platform';
import { GameHost } from '../../src/platform/host/game';
import type { PlayerInput } from '../../src/platform/net/protocol';
import { guns as gunKit } from '../../src/platform/kits';
import { peek, PEEK } from '../../src/games/callofblocky/peek';
import { check } from './_harness';

const wasm = readFileSync('engine/pkg/voxel_engine_bg.wasm');

/** A flat field, a rifle with no spread, and Call of Blocky's peek. */
const range: GameDefinition = defineGame({
  id: 'peek-range',
  title: 'Peek range',
  world: { terrain: 'flat', flatHeight: 64, spawn: { x: 0.5, y: 65, z: 0.5 }, time: 0.5, freezeTime: true },
  player: { health: 100, hurtCooldown: 0, pvp: true, hotbar: 'items', movement: { abilities: { peek } } },
  items: [gunKit()],
  setup(game) {
    game.items.define('rifle', {
      kind: 'gun',
      name: 'Rifle',
      icon: 'iron_sword',
      rpm: 600,
      auto: true,
      damage: 10,
      headshot: 2,
      magazine: 30,
      reload: 1,
      spread: { hip: 0, aim: 0, move: 0, air: 0, bloom: 0 },
      recoil: { up: 0, side: 0 },
    });
  },
});

const idle = (viewSeq: number): PlayerInput => ({ active: true, down: [], pressed: [], buttons: 0, clicked: 0, mouseX: 0, mouseY: 0, wheel: 0, yaw: 0, pitch: 0, viewSeq, acts: { gun: [] } });

/**
 * Peeking (Call of Blocky's Q and E, the platform's `body.lean`): a tap leans and it stays, the
 * same key stands up, the other swaps sides. The eyes go out sideways, and so does the head's
 * hitbox, so a shot at a leaned-out head is a headshot and one where it was upright meets
 * nothing. A wall on that side cuts the lean short; a sprint stands you up.
 */
export default function peekTest() {
  // Ann holds the rifle 8 blocks down the field; Bob faces her, so his right is -x.
  const host = new GameHost(range, { engine: wasm, seed: 1, remote: true, radius: 3, budget: Infinity, player: { id: 'p1', name: 'Ann' } });
  const ann = host.connect('Ann');
  const bob = host.connect('Bob');
  host.command(ann.id, { t: 'start' });
  host.command(bob.id, { t: 'start' });
  const sim = host.sim;
  const A = sim.players.find((p) => p.id === ann.id)!;
  const B = sim.players.find((p) => p.id === bob.id)!;
  const step = () => host.step(1 / 30);
  for (let i = 0; i < 3; i++) step();
  A.api.teleport({ x: 0.5, y: 65, z: 8.5 }, 0, 0);
  B.api.teleport({ x: 0.5, y: 65, z: 0.5 }, Math.PI, 0);
  A.api.inventory.give('rifle');
  for (let i = 0; i < 20; i++) step();

  /** Bob's controls for a step, facing Ann: keys held, and keys that went down this step. */
  const send = (down: string[], pressed: string[] = []) => host.command(bob.id, { t: 'input', input: { ...idle(B.viewSeq), yaw: Math.PI, down, pressed } });
  /** Bob holds these keys for a while. */
  const hold = (keys: string[], seconds = 0.5) => {
    for (let i = 0; i < Math.round(seconds * 30); i++) {
      send(keys);
      step();
    }
  };
  /** Bob taps a key, then lets go and waits. */
  const tap = (key: string) => {
    send([key], [key]);
    step();
    hold([]);
  };
  const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) < eps;

  // A tap leans and it stays leaned, with nothing held.
  tap('KeyE');
  check(near(B.lean, PEEK.reach) && near(B.eye.x, 0.5 - PEEK.reach) && near(B.eye.z, 0.5), `E leans right (-x, facing +z) and stays: lean ${B.lean.toFixed(3)}, eye ${B.eye.x.toFixed(3)}, ${B.eye.z.toFixed(3)}`);
  tap('KeyE');
  check(B.lean === 0 && near(B.eye.x, 0.5, 1e-6), `E again stands up straight: lean ${B.lean}`);
  tap('KeyQ');
  check(near(B.lean, -PEEK.reach) && near(B.eye.x, 0.5 + PEEK.reach), `Q leans left: lean ${B.lean.toFixed(3)}, eye x ${B.eye.x.toFixed(3)}`);
  tap('KeyE');
  check(near(B.lean, PEEK.reach), `E while leaning left leans right: ${B.lean.toFixed(3)}`);
  tap('KeyE');
  check(B.lean === 0, `and E again stands up (${B.lean})`);

  // Ann's shots, at a point `dy` up and `dx` along x from Bob's feet.
  let serial = 1;
  const hurt: { head: boolean }[] = [];
  sim.ctx.events.on('playerDamage', (e) => {
    if (e.player === B.api) hurt.push({ head: !!e.headshot });
  });
  const fire = (dx: number, dy: number) => {
    const e = A.eye;
    const [tx, ty, tz] = [B.position.x + dx, B.position.y + dy, B.position.z];
    const yaw = Math.atan2(-(tx - e.x), -(tz - e.z));
    const pitch = Math.atan2(ty - e.y, Math.hypot(tx - e.x, tz - e.z));
    host.command(ann.id, { t: 'input', input: { ...idle(A.viewSeq), yaw, pitch, acts: { gun: [[serial++, yaw, pitch, 0]] }, seen: sim.time } });
    send([]);
    step();
    // Past the hurt cooldown and the fire rate before the next.
    hold([], 4 / 30);
    const h = hurt.splice(0);
    return h.length ? (h[0].head ? 'head' : 'body') : 'miss';
  };
  // Above the shoulders, 0.4 out to his right: nothing there upright, his head leaning out.
  check(fire(-0.4, 1.75) === 'miss', 'upright, a shot beside his head misses');
  tap('KeyE');
  const out = fire(-0.4, 1.75);
  check(out === 'head', `leaning out, the same shot is a headshot (${out})`);
  const where = fire(0.45, 1.75);
  check(where === 'miss', `leaning out, where his head was upright is empty (${where})`);

  // A wall just to his right: the lean stops short of it (the wall's face is 0.5 from his middle).
  tap('KeyE');
  for (let y = 65; y <= 67; y++) sim.ctx.world.setBlock(-1, y, 0, 'stone');
  tap('KeyE');
  check(B.lean > 0 && B.lean <= 0.5 - PEEK.gap + 1e-6, `a wall on the right cuts the lean short: ${B.lean.toFixed(3)}`);
  tap('KeyQ');
  check(near(B.lean, -PEEK.reach), `the other way is clear: ${B.lean.toFixed(3)}`);

  // Sprinting stands him up, and he stays up after.
  hold(['KeyW', 'ControlLeft'], 0.4);
  check(B.lean === 0, `sprinting doesn't lean (${B.lean})`);
  hold([]);
  check(B.lean === 0, `after the sprint he's still upright (${B.lean})`);
  console.log(`  lean ${PEEK.reach} blocks · headshot on a leaned-out head · wall-clamped to ${(0.5 - PEEK.gap).toFixed(2)}`);
}
