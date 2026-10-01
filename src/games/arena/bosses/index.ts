import type { GameContext } from '@platform';
import { registerKind } from '../run/spawn';
import type { BossKind } from './registry';
import { warden } from './warden';

export type { BossKind } from './registry';

/** Every boss. */
export const BOSSES: readonly BossKind[] = [warden];

const byId = new Map(BOSSES.map((b) => [b.id, b]));
export const bossKind = (id: string): BossKind | undefined => byId.get(id);

/** Every boss's platform definition and hooks (in `setup`). */
export function defineBosses(game: GameContext) {
  for (const b of BOSSES) {
    game.entities.define(b.id, b.define(game));
    registerKind(b.id, b);
  }
}
