import type { BlueprintLike, Vec3 } from '@platform';

/**
 * The Arena's maps. Each stands in the one void world at its own place (`origin`, far enough
 * apart that one never shows from another), all on the ground at `FLOOR`; a run is fought on one
 * of them (`run/state.ts`: `map()`), and everything that places things (the director's spawns,
 * the monsters' brains, rewards, the lookout) asks the current map rather than assuming the
 * Colosseum. Add a map: a file here exporting an `ArenaMap`, listed in `MAPS`.
 */

/** The ground every map stands on (its surface; fighters stand at FLOOR + 1). */
export const FLOOR = 70;

/** Where monsters come in: a pen or a doorway (`at`, feet), facing into the arena (`yaw`). */
export interface Gate {
  at: Vec3;
  /** The way into the arena from the gate (radians, as `entities.spawn`'s yaw). */
  yaw: number;
  /** Spread either side of `at` monsters are scattered over (default 1.5). */
  spread?: number;
}

/** A keyframe of the opening fly-over: the camera at `at` looking at `look`, `t` seconds in. */
export interface IntroKey {
  t: number;
  at: Vec3;
  look: Vec3;
}

export interface ArenaMap {
  id: string;
  name: string;
  /** A line under its name (the vote, the intro card). */
  line: string;
  /** Its blocks: built once, as part of the world (every screen builds them too). */
  build(): BlueprintLike;
  /** Where its fighters start, come back to and rewards drop (feet). */
  center: Vec3;
  /**
   * How far the fighting floor reaches from `center` (blocks): creatures that keep away (archers,
   * necromancers, goblins) turn along it rather than into the wall.
   */
  radius: number;
  /** Where monsters come in. */
  gates: Gate[];
  /** Where a fallen fighter watches from until the wave's over, looking at `center` (feet). */
  lookout: Vec3;
  /** Time of day for the fight (0..1), and how far it falls by the last wave. */
  time: number;
  dusk?: number;
  /** The opening fly-over (each screen's `client/intro.ts`), if it has one. */
  intro?: IntroKey[];
  /** Spots a boss makes its entrance at (default: the gates, a few blocks in). */
  bossGates?: Gate[];
  /** Where the shop stands between waves (feet), facing `center`. */
  shop?: Vec3;
  /** Where the mystery chest may stand (feet): it's at one of them, and moves on now and then. */
  chests?: Vec3[];
}

/** A point `d` blocks along `yaw`'s facing from `g` (into the arena), `side` to its right. */
export function along(g: Gate, d: number, side = 0): Vec3 {
  const fx = -Math.sin(g.yaw);
  const fz = -Math.cos(g.yaw);
  return { x: g.at.x + fx * d + -fz * side, y: g.at.y, z: g.at.z + fz * d + fx * side };
}
