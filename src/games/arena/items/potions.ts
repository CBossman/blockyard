import type { GameContext, Player } from '@platform';

/**
 * R drinks a health potion wherever it's carried: the potion comes up in hand, a sip, five hearts
 * mended, and back to what was in hand. Switching away first stops it (nothing's drunk). (With the
 * potion in hand, the right button still drinks it at once: the platform's consumables.)
 */
export const POTION_KEY = 'KeyR';
const POTION = 'health_potion';
/** When the sip begins, when it's drunk, and when the hand goes back (seconds after R). */
const SIP = 0.25;
const DRUNK = 0.6;
const BACK = 0.85;

interface Quaff {
  t: number;
  slot: number;
  back: number;
  sipped: boolean;
  drunk: boolean;
}
const quaffs = new Map<Player, Quaff>();

export function updatePotions(game: GameContext, dt: number) {
  for (const p of game.players) {
    const q = quaffs.get(p);
    if (q) step(game, p, q, dt);
    else if (p.alive && !p.spectating && p.input.pressed(POTION_KEY)) start(game, p);
  }
}

function start(game: GameContext, p: Player) {
  const inv = p.inventory;
  const slot = inv.slots.findIndex((s) => s?.item === POTION);
  if (slot < 0) {
    p.hud.toast('No potions');
    p.audio.play('click', { pitch: 0.7 });
    return;
  }
  if (p.health >= p.maxHealth) {
    p.hud.toast('Already at full health');
    return;
  }
  quaffs.set(p, { t: 0, slot, back: inv.selected, sipped: false, drunk: false });
  inv.select(slot);
  game.audio.play('arena_uncork', { at: p.eye });
}

function step(game: GameContext, p: Player, q: Quaff, dt: number) {
  const inv = p.inventory;
  q.t += dt;
  // Put away, or down: nothing more.
  if (!p.alive || (!q.drunk && inv.selected !== q.slot)) {
    quaffs.delete(p);
    return;
  }
  if (!q.sipped && q.t >= SIP) {
    q.sipped = true;
    p.viewModel.play('sip');
  }
  if (!q.drunk && q.t >= DRUNK) {
    q.drunk = true;
    if (inv.take(POTION, 1)) {
      p.heal(10);
      game.audio.play('heal', { at: p.position });
      game.audio.play('arena_gulp', { at: p.eye });
      game.fx.burst(p.eye, { color: '#ff4f6d', count: 16, speed: 2, gravity: -3, glow: 0.8 });
    }
  }
  if (q.t >= BACK) {
    quaffs.delete(p);
    if (inv.selected === q.slot && inv.slots[q.back]) inv.select(q.back);
  }
}

export function resetPotions() {
  quaffs.clear();
}
