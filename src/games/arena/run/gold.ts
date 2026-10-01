import type { GameContext, Player, Vec3 } from '@platform';
import { bus } from './bus';

/**
 * Each fighter's gold for this fight (by player id): earned from kills and pickups, spent at the
 * shop, on traps, the mystery chest. Every change is told on the bus (`gold`), for the HUD.
 */
const purses = new Map<string, number>();

export const gold = (p: Player): number => purses.get(p.id) ?? 0;

export function addGold(_game: GameContext, p: Player, n: number, at?: Vec3) {
  if (n === 0) return;
  const total = Math.max(0, gold(p) + Math.round(n));
  purses.set(p.id, total);
  bus.emit('gold', { player: p, delta: Math.round(n), total, at });
}

/** Take `n` gold if they have it (true), or nothing (false). */
export function spend(game: GameContext, p: Player, n: number): boolean {
  if (gold(p) < n) return false;
  addGold(game, p, -n);
  return true;
}

/** A fresh fight: everyone's purse empty. */
export function resetGold() {
  purses.clear();
}
