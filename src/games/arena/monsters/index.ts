import type { GameContext } from '@platform';
import { registerKind } from '../run/spawn';
import type { MonsterKind } from './registry';
import { brute, goblin, necromancer, sapper, skeleton, spider, zombie } from './roster';

export type { MonsterKind } from './registry';

/** Every kind of monster (bosses are `bosses/`). */
export const MONSTERS: readonly MonsterKind[] = [zombie, skeleton, spider, sapper, necromancer, brute, goblin];

const byId = new Map(MONSTERS.map((m) => [m.id, m]));
export const monsterKind = (id: string): MonsterKind | undefined => byId.get(id);

/** Every kind's platform definition and hooks (in `setup`). */
export function defineMonsters(game: GameContext) {
  for (const m of MONSTERS) {
    game.entities.define(m.id, m.define(game));
    registerKind(m.id, m);
  }
}
