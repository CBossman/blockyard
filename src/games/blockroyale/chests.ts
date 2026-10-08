import type { GameContext, Player, Vec3 } from '@platform';
import { LOOT } from './island';
import { fighterOf } from './match';
import type { LootSpot } from './island/kit';
import { above, rollChest, rollFloor, spawn } from './loot';

/**
 * The island's chests and the loot lying about. A chest is a block in a landmark's blueprint, so
 * it's there from the first frame; opening one (E, close, looking at it) swaps it for an open
 * chest and throws its loot out. Loot on the floor appears when the first person comes near (the
 * ground has to have loaded under it) and is spawned once a match.
 */

/** How close someone has to be to open a chest, and how close to show the hint. */
export const REACH = 3.4;
/** Floor loot appears when someone is this near (and the ground under it has loaded). */
const NEAR = 90;

const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

export class Chests {
  /** The island's chests and floor loot, then any added during the match (supply drops). */
  readonly spots: LootSpot[] = [...LOOT];
  private index = new Map<string, number>();
  readonly opened = new Set<number>();
  private floor = new Set<number>();
  /** The chest each person's hint is up for. */
  private hint = new Map<string, number | null>();

  constructor() {
    this.spots.forEach((s, i) => {
      if (s.kind === 'chest') this.index.set(keyOf(s.x, s.y, s.z), i);
    });
  }

  /** A new match: every chest shut again (the world's blocks are put back by the restart), no floor loot out yet, no supply drops. */
  reset() {
    for (const s of this.spots.slice(LOOT.length)) this.index.delete(keyOf(s.x, s.y, s.z));
    this.spots.length = LOOT.length;
    this.opened.clear();
    this.floor.clear();
    this.hint.clear();
  }

  /** A chest that turns up during the match (a supply drop landing): its block, and its place in the list. */
  add(game: GameContext, spot: LootSpot): number {
    game.world.setBlock(spot.x, spot.y, spot.z, `chest[facing=${spot.facing ?? 'south'}]`);
    this.spots.push(spot);
    const i = this.spots.length - 1;
    this.index.set(keyOf(spot.x, spot.y, spot.z), i);
    return i;
  }

  /** Open chest `i`: its block, a flash, and its loot thrown out. */
  open(game: GameContext, i: number, by: Player | null): boolean {
    const s = this.spots[i];
    if (!s || s.kind !== 'chest' || this.opened.has(i)) return false;
    this.opened.add(i);
    game.world.setBlock(s.x, s.y, s.z, `chest_open[facing=${s.facing ?? 'south'}]`);
    const at = above(s);
    game.fx.burst(at, { color: '#ffd23a', count: 22, speed: 3.2, size: 0.12, gravity: 1, glow: 1.4, life: 0.7 });
    game.audio.play('chest_open', { at, volume: 1 });
    spawn(game, rollChest(game, s.tier), at);
    if (s.marker) game.hud.marker(s.marker, null);
    if (by && !by.bot) {
      by.hud.marker('chest', null);
      const f = fighterOf(by);
      if (f && ++f.chestsOpened >= 8) by.achieve('treasure_hunter');
    }
    return true;
  }

  /** The unopened chest nearest `p` within `reach` blocks (bots go for these), or -1. */
  nearest(p: Vec3, reach: number, wanted?: (s: LootSpot) => boolean): number {
    let best = -1;
    let bestD = reach;
    this.spots.forEach((s, i) => {
      if (s.kind !== 'chest' || this.opened.has(i) || (wanted && !wanted(s))) return;
      const d = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y, s.z + 0.5 - p.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** Floor loot for the places anyone is near. */
  activate(game: GameContext, near: Vec3[]) {
    this.spots.forEach((s, i) => {
      if (s.kind !== 'floor' || this.floor.has(i)) return;
      if (!near.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < NEAR)) return;
      // Only once the ground under it is there.
      if (game.world.getBlock(s.x, s.y - 1, s.z) < 0) return;
      this.floor.add(i);
      spawn(game, [rollFloor(game, s.tier)], { x: s.x + 0.5, y: s.y + 1, z: s.z + 0.5 }, { burst: 0 });
    });
  }

  /** People open the chest in front of them with E; the nearest one near them gets a hint. */
  update(game: GameContext, people: Player[]) {
    for (const p of people) {
      const eye = p.eye;
      const look = p.look;
      let best = -1;
      let bestScore = -Infinity;
      this.spots.forEach((s, i) => {
        if (s.kind !== 'chest' || this.opened.has(i)) return;
        const dx = s.x + 0.5 - eye.x;
        const dy = s.y + 0.5 - eye.y;
        const dz = s.z + 0.5 - eye.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > REACH + 1.5) return;
        // Near enough, and roughly where they're looking (so the chest behind them isn't opened).
        const facing = (dx * look.x + dy * look.y + dz * look.z) / (d || 1);
        const score = facing * 2 - d * 0.4;
        if (facing > 0.35 && score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      const was = this.hint.get(p.id) ?? null;
      if (best !== was) {
        this.hint.set(p.id, best < 0 ? null : best);
        const s = best >= 0 ? this.spots[best] : null;
        p.hud.marker('chest', s ? above(s) : null, { label: 'Open (E)', shape: 'dot', color: '#ffd23a', size: 9 });
      }
      if (best >= 0 && p.input.pressed('KeyE')) this.open(game, best, p);
    }
  }
}
