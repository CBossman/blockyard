import type { GameContext, Vec3 } from '@platform';
import { inFight, map } from '../run/state';
import { inBox, type Hazard } from './registry';
import { chill } from './traps';

/**
 * The maps' hazards: the Forge's lava burns whoever wades in (fighters and monsters alike: knock
 * them in), the Sanctum's frozen pool bites and slows. Checked a few times a second, not every tick.
 */

const EVERY = 0.25;
let check = 0;
/** When each body last showed it (a burst, a hiss), by id: not every check. */
const shown = new Map<string, number>();

/** How each kind hurts, each check: fighters, monsters. */
const HURT: Record<Hazard['kind'], { player: number; monster: number; color: string; sound: string }> = {
  lava: { player: 2, monster: 4, color: '#ff7a1a', sound: 'hazard_sizzle' },
  frost: { player: 0.75, monster: 1.5, color: '#bfe8ff', sound: 'hazard_chill' },
};

export function startHazards() {
  check = 0;
  shown.clear();
}

export function updateHazards(game: GameContext, dt: number) {
  const hazards = map().hazards;
  if (!hazards?.length || !inFight()) return;
  check -= dt;
  if (check > 0) return;
  check = EVERY;
  const t = game.clock.now;
  const show = (key: string, at: Vec3, h: Hazard) => {
    if ((shown.get(key) ?? 0) > t) return;
    shown.set(key, t + 0.6);
    game.fx.burst({ x: at.x, y: at.y + 0.5, z: at.z }, { color: HURT[h.kind].color, count: 10, speed: 2, gravity: h.kind === 'lava' ? -4 : 2, glow: h.kind === 'lava' ? 1 : 0.3, size: 0.12 });
    game.audio.play(HURT[h.kind].sound, { at, volume: 0.7 });
  };
  for (const h of hazards) {
    const inside = (p: Vec3) => h.zone.some((b) => inBox(b, { x: p.x, y: p.y + 0.3, z: p.z }));
    for (const p of game.players) {
      if (!p.alive || p.spectating || !inside(p.position)) continue;
      p.damage(HURT[h.kind].player, { source: 'world', cause: h.kind === 'lava' ? 'fire' : 'frost', knockback: 0 });
      show(p.id, p.position, h);
    }
    for (const e of game.entities.all()) {
      if (!e.alive || !inside(e.position)) continue;
      e.damage(HURT[h.kind].monster, { source: 'world', cause: h.kind === 'lava' ? 'fire' : 'frost', knockback: 0 });
      if (h.kind === 'frost') chill(game, e);
      show(`e${e.id}`, e.position, h);
    }
  }
}
