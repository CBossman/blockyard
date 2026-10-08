import { Blueprint, math, type GameContext, type Player, type Prop, type PropModel } from '@platform';
import type { Fighter } from './match';

/**
 * Parachutes: a striped canopy over each fighter who has theirs open, drawn as a prop that follows
 * them down. (The fall itself is the movement ability, `dive.ts`; this is only what everyone else
 * sees.) Each canopy is white and one colour, picked by who's under it.
 */

const COLORS = ['red_wool', 'blue_wool', 'green_wool', 'yellow_wool'];
const RADIUS = 4;

/** A dome of wool, white bands alternating with `color`, its base centred on the origin. */
function dome(color: string): Blueprint {
  const bp = new Blueprint({ x: -RADIUS - 1, y: 0, z: -RADIUS - 1 }, { x: RADIUS * 2 + 3, y: RADIUS + 2, z: RADIUS * 2 + 3 });
  for (let y = 0; y <= RADIUS; y++)
    for (let z = -RADIUS; z <= RADIUS; z++)
      for (let x = -RADIUS; x <= RADIUS; x++) {
        const d = Math.hypot(x, y, z);
        if (d > RADIUS + 0.4 || d < RADIUS - 1.3) continue;
        const band = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % 2;
        bp.set(x, y, z, band === 0 ? color : 'white_wool');
      }
  return bp;
}

const models: PropModel[] = [];

/** Mesh the canopies once, in `setup`. */
export function prepareChutes(game: GameContext) {
  for (const c of COLORS) models.push(game.props.model(dome(c), { scale: 0.5 }));
}

export class Chutes {
  private open = new Map<string, Prop>();

  /** Put a canopy over everyone gliding, move it with them, and take it off the ones who've landed. */
  update(game: GameContext, fighters: Iterable<Fighter>) {
    const live = new Set<string>();
    let i = 0;
    for (const f of fighters) {
      const p = f.player;
      const color = i++ % models.length;
      if (!f.alive || f.drop !== 'air' || (p.abilities.dive as { mode?: number } | undefined)?.mode !== 2) continue;
      live.add(p.id);
      let prop = this.open.get(p.id);
      if (!prop) {
        prop = game.props.spawn(models[color]);
        this.open.set(p.id, prop);
        game.audio.play('chute', { at: p.position, volume: 0.8 });
      }
      this.follow(prop, p);
    }
    for (const [id, prop] of this.open)
      if (!live.has(id)) {
        prop.remove();
        this.open.delete(id);
      }
  }

  private follow(prop: Prop, p: Player) {
    prop.position.set(p.position.x, p.position.y + 2.2, p.position.z);
    prop.quaternion.setFromEuler(new math.Euler(0, p.yaw, 0));
  }

  clear() {
    for (const prop of this.open.values()) prop.remove();
    this.open.clear();
  }
}
