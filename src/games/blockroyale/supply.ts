import { Blueprint, math, type BlockRef, type GameContext, type Prop, type PropModel, type Vec3 } from '@platform';
import type { Chests } from './chests';

/**
 * Supply drops: whenever the storm shows its next circle, a crate on a striped balloon comes down
 * somewhere inside it, and lands with a chest of the best loot there is. Everyone sees it coming
 * (a marker, the balloon in the sky), so it pulls fights to where the circle is going.
 */

/** Blocks a second it falls, and how high above the ground it starts. */
const FALL = 7;
const START = 130;

function model(): Blueprint {
  const bp = new Blueprint({ x: -5, y: 0, z: -5 }, { x: 11, y: 17, z: 11 });
  const set = (x: number, y: number, z: number, b: BlockRef) => bp.set(x, y, z, b);
  // The crate, three blocks across, with a lid.
  for (let y = 0; y < 3; y++) for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) set(x, y, z, y === 2 ? 'oak_planks' : 'crate');
  set(0, 3, 0, 'lamp');
  // Four cords up to the balloon, and the balloon: red and white.
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    for (let y = 3; y <= 8; y++) set(x, y, z, 'fence');
  for (let y = 8; y <= 16; y++)
    for (let z = -4; z <= 4; z++)
      for (let x = -4; x <= 4; x++)
        if (Math.hypot(x, (y - 12) * 1.0, z) <= 4.3) set(x, y, z, Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 3)) % 2 === 0 ? 'red_wool' : 'white_wool');
  return bp;
}

let drop: PropModel | null = null;

export function prepareSupply(game: GameContext) {
  drop = game.props.model(model());
}

interface Falling {
  prop: Prop;
  at: Vec3;
  /** Where the ground is, and the balloon's height now. */
  ground: number;
  y: number;
  marker: string;
}

export class Supply {
  private falling: Falling[] = [];
  private n = 0;

  /** A drop inside the circle `c`: on land, not in the sea. Returns where, or null if no good spot was found. */
  call(game: GameContext, c: { x: number; z: number; r: number }): Vec3 | null {
    for (let tries = 0; tries < 20; tries++) {
      const a = game.rng.range(0, Math.PI * 2);
      const d = Math.sqrt(game.rng.next()) * c.r * 0.8;
      const x = Math.floor(c.x + Math.cos(a) * d);
      const z = Math.floor(c.z + Math.sin(a) * d);
      const ground = game.world.surfaceY(x, z);
      if (ground <= game.world.seaLevel + 1) continue;
      // Not on a roof or a tree: the ground block must be dirt-like (the loot lands in the open).
      const name = game.world.blockName(game.world.getBlock(x, ground, z));
      if (!['grass_block', 'dirt', 'podzol', 'sand', 'gravel', 'stone', 'cobblestone'].includes(name)) continue;
      const prop = game.props.spawn(drop!, { position: { x: x + 0.5, y: ground + START, z: z + 0.5 } });
      const marker = `supply${this.n++}`;
      this.falling.push({ prop, at: { x, y: ground + 1, z }, ground, y: ground + START, marker });
      game.hud.marker(marker, { x: x + 0.5, y: ground + 2, z: z + 0.5 }, { label: 'Supply drop', shape: 'diamond', color: '#ffd23a', edge: true, size: 14, pulse: true });
      game.hud.banner('SUPPLY DROP INBOUND', 'Legendary loot, inside the next circle', { color: '#ffd23a', duration: 3 });
      game.audio.play('horn', { volume: 0.5 });
      return { x: x + 0.5, y: ground + 1, z: z + 0.5 };
    }
    return null;
  }

  update(game: GameContext, dt: number, chests: Chests, landed: (spot: number) => void) {
    for (const f of [...this.falling]) {
      f.y -= FALL * dt;
      const wobble = Math.sin(game.clock.now * 1.7 + f.at.x) * 0.5;
      f.prop.position.set(f.at.x + 0.5 + wobble * 0.3, Math.max(f.ground + 1, f.y), f.at.z + 0.5);
      f.prop.quaternion.setFromEuler(new math.Euler(0, wobble * 0.15, 0));
      if (f.y > f.ground + 1) continue;
      this.falling.splice(this.falling.indexOf(f), 1);
      f.prop.remove();
      // It lands as a chest (the best kind), with a puff of dust.
      const spot = chests.add(game, { kind: 'chest', x: f.at.x, y: f.at.y, z: f.at.z, tier: 4, site: 'supply', facing: 'south', marker: f.marker });
      game.fx.burst({ x: f.at.x + 0.5, y: f.at.y + 0.5, z: f.at.z + 0.5 }, { color: '#e8d9a0', count: 30, speed: 4, size: 0.2, gravity: 4, life: 1 });
      game.audio.play('chest_open', { at: f.at, volume: 0.6, pitch: 0.7 });
      landed(spot);
    }
  }

  clear() {
    for (const f of this.falling) f.prop.remove();
    this.falling = [];
    this.n = 0;
  }
}
