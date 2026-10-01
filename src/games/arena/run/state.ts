import { MAPS, type ArenaMap } from '../maps';

/** `intro`: not begun. `waiting`: everyone left, and the next to arrive begins it afresh. */
export type Phase = 'intro' | 'waiting' | 'countdown' | 'fighting' | 'intermission' | 'victory' | 'defeat';

const fresh = () => ({
  phase: 'intro' as Phase,
  wave: 0,
  /** Monsters still to come this wave (types), and seconds to the next. */
  queue: [] as string[],
  spawnTimer: 0,
  nextWaveAt: 0,
  kills: 0,
  damageDealt: 0,
  damageTaken: 0,
  startedAt: 0,
  lastBeep: 0,
  /** This wave's twist (an id of the director's), and the last one rolled. */
  twist: null as string | null,
  lastTwist: null as string | null,
  /** This wave's boss (its type), if any. */
  boss: null as string | null,
});

/** The fight as it stands (one per game: a room's server runs its own copy of this module). */
export const state = fresh();

let current: ArenaMap = MAPS[0];

/** The map this fight is on. */
export const map = (): ArenaMap => current;
export function setMap(m: ArenaMap) {
  current = m;
}

export function resetState() {
  Object.assign(state, fresh());
}

/**
 * Each fighter's own fight, for their achievements (by player id, from when they're armed): the
 * wave they joined in (0: from the start), whether they've fallen, whether they've been hurt this
 * wave, and the weapons they've slain with.
 */
export interface Run {
  from: number;
  fell: boolean;
  hurt: boolean;
  arms: Set<string>;
}
export const runs = new Map<string, Run>();

/** Fighting, or between waves: a fight's in progress. */
export const inFight = () => state.phase === 'countdown' || state.phase === 'fighting' || state.phase === 'intermission';
