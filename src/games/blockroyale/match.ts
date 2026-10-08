import type { Player } from '@platform';

/**
 * The match as the server's parts share it (`server.ts` runs it; `loot.ts`, `bots.ts`, `bus.ts` and
 * `zone.ts` read it): who's in it, how it's going, and what each fighter has done. Each room is a
 * worker of its own, so this is that room's.
 */

export type Phase =
  /** Waiting on the bus, parked: people arrive, bots fill the rest, the countdown runs. */
  | 'lobby'
  /** The bus is crossing the island: jump when you like. */
  | 'bus'
  /** Everyone's down (or the bus has gone): the storm is closing in. */
  | 'playing'
  /** Someone won; the results are up. */
  | 'over';

export interface Fighter {
  player: Player;
  /** In the fight: false once they're out (or arrived too late to play). */
  alive: boolean;
  kills: number;
  /** Damage dealt, for the results. */
  damage: number;
  /** Their place when they went out (1 is the winner); 0 while still in. */
  placed: number;
  /** Shield points on top of health (0..100). */
  shield: number;
  /** Where they are in the drop. */
  drop: 'bus' | 'air' | 'down';
  /** When they went out (`game.clock.now`), and how long they lasted in all. */
  diedAt: number;
  /** Who and what took them out, for the results. */
  by: string;
  with: string;
  /** Seconds in a row they've been outside the storm's circle. */
  stormFor: number;
  /** Chests they've opened this match. */
  chestsOpened: number;
  /** The last time their HUD was refreshed (only changes go out). */
  hudKey: string;
  /** When they left the bus (`game.clock.now`). */
  airAt: number;
}

export const match = {
  phase: 'lobby' as Phase,
  fighters: new Map<string, Fighter>(),
  /** When the bus left (`game.clock.now`); 0 while it's parked. */
  busAt: 0,
  /** When the storm's calm began (the first player landed, or the bus emptied). */
  playingAt: 0,
  /** The winner, once there is one. */
  winner: null as Player | null,
};

export const fighterOf = (p: Player): Fighter | undefined => match.fighters.get(p.id);

/** Everyone still in the fight. */
export const alive = (): Fighter[] => [...match.fighters.values()].filter((f) => f.alive);

/** The people (not bots) among a list of fighters. */
export const people = (list: Iterable<Fighter>): Fighter[] => [...list].filter((f) => !f.player.bot);
