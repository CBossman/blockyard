import type { Entity, Player, Vec3 } from '@platform';
import type { ArenaMap } from '../maps';

/**
 * The Arena's own events, between its parts: the director says a wave's begun, a monster says
 * it's slain, and whoever cares (gold, the crowd, the HUD, achievements) listens, so no part has to
 * call into another. Listeners are added in `setup` (`bus.clear()` first: one game per module).
 */
export interface ArenaEvents {
  /** A fight begins on `map` (after `start`, or a restart). */
  runStart: { map: ArenaMap };
  /** A wave begins: its number, name, twist and boss (ids), and whether it's the last. */
  waveStart: { wave: number; name: string; twist: string | null; boss: string | null; final: boolean };
  /** Every monster of the wave is down. */
  waveCleared: { wave: number; final: boolean };
  /** A monster (or a boss) came into the arena. */
  spawned: { entity: Entity; type: string };
  /** A monster died: who did it (a fighter, or nobody: a trap, another monster), with what, where. */
  slain: { entity: Entity; type: string; by: Player | null; weapon?: string; at: Vec3 };
  /** A fighter is down, and back up. */
  fell: { player: Player };
  rejoined: { player: Player };
  /** The fight is over. */
  runEnd: { won: boolean; wave: number };
  /** A fighter's gold changed (`delta` this time, `total` now), from `at` if it was picked up somewhere. */
  gold: { player: Player; delta: number; total: number; at?: Vec3 };
  /** The crowd's hype (0..1), and whether it just boiled over into the Crowd's Favour. */
  hype: { value: number; favour: boolean };
  /** Something worth a callout (the announcer, the crowd): a multikill, a parry, a trap kill… */
  feat: { player: Player | null; name: string; text: string };
}

type Listener<K extends keyof ArenaEvents> = (e: ArenaEvents[K]) => void;

const listeners = new Map<keyof ArenaEvents, Listener<keyof ArenaEvents>[]>();

export const bus = {
  on<K extends keyof ArenaEvents>(name: K, fn: Listener<K>) {
    const list = listeners.get(name) ?? [];
    list.push(fn as Listener<keyof ArenaEvents>);
    listeners.set(name, list);
  },
  emit<K extends keyof ArenaEvents>(name: K, e: ArenaEvents[K]) {
    for (const fn of listeners.get(name) ?? []) fn(e);
  },
  clear() {
    listeners.clear();
  },
};
