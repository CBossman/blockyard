import type { Entity, EntityDefinition, GameContext, Player } from '@platform';

/**
 * A boss: a wave's star (`run/director.ts` names one per boss wave). Its definition has
 * `boss: true` (the boss bar); `name` and `title` go on its entrance card, in `color`. Add one: a
 * file in `bosses/` exporting a `BossKind`, listed in `bosses/index.ts`.
 */
export interface BossKind {
  id: string;
  /** "The Warden", and a line under it: "Keeper of the Pit". */
  name: string;
  title: string;
  /** Its colour: the entrance card, the banners. */
  color: string;
  define(game: GameContext): EntityDefinition;
  /** What comes in with it (types and counts, before party size). */
  escort?: Record<string, number>;
  spawned?(game: GameContext, e: Entity): void;
  slain?(game: GameContext, e: Entity, by: Player | null): void;
}
