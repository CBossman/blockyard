import type { GameContext } from '@platform';
import { CENTER, RADIUS } from './island';
import { Storm, type StormWire } from './storm';
import { alive } from './match';

/**
 * The storm in play: the circle (`storm.ts`), the damage to anyone outside it each second, the
 * announcements, and the state each screen draws the circle from.
 */
export class Zone {
  readonly storm: Storm;
  private tick = 0;
  /** Seconds since the last state went out to the screens. */
  private sent = 99;
  /** The circle whose warning has gone out (it's said once, a little before the storm moves). */
  private warned = -1;

  constructor(game: GameContext) {
    this.storm = new Storm({
      start: { x: CENTER.x, z: CENTER.z, r: RADIUS },
      random: () => game.rng.next(),
      // A circle's middle is picked from dry ground: nobody wants the last circle on the bay.
      land: (x, z) => {
        const y = game.world.surfaceY(x, z);
        return y < 0 || y > game.world.seaLevel;
      },
    });
  }

  update(game: GameContext, dt: number) {
    const storm = this.storm;
    storm.update(dt);
    for (const e of storm.events) {
      if (e === 'announce') {
        game.hud.banner('SAFE ZONE MARKED', `The storm closes in ${Math.round(storm.left)} seconds`, { color: '#ffffff', duration: 3 });
        game.audio.play('wave', { volume: 0.5 });
      } else if (e === 'shrink') {
        game.hud.banner('THE STORM IS CLOSING', 'Get inside the circle', { color: '#b86bff', duration: 3 });
        game.audio.play('storm', { volume: 0.7 });
      } else if (e === 'closed') game.hud.banner('FINAL CIRCLE', '', { color: '#ff4a5a', duration: 3 });
      this.sent = 99;
    }
    // Fifteen seconds before it moves: a word to each person outside where it's going, and how far that is.
    const next = storm.next;
    if (storm.step === 'wait' && next && storm.left <= 15 && this.warned !== storm.phase) {
      this.warned = storm.phase;
      for (const f of alive()) {
        const p = f.player;
        if (p.bot || f.drop !== 'down') continue;
        const far = Math.hypot(p.position.x - next.x, p.position.z - next.z) - next.r;
        if (far > 0) p.hud.toast(`The storm moves in ${Math.ceil(storm.left)} s: the safe zone is ${Math.ceil(far)} blocks away`);
      }
    }
    // Once a second: the storm's damage to anyone outside the circle, and the state for the screens.
    this.tick += dt;
    this.sent += dt;
    if (this.sent >= 1) {
      this.sent = 0;
      game.clients.send('all', 'storm', storm.wire());
    }
    if (this.tick < 1) return;
    this.tick -= 1;
    for (const f of alive()) {
      if (f.drop === 'bus') continue;
      const p = f.player;
      const out = !storm.inside(p.position.x, p.position.z);
      f.stormFor = out ? f.stormFor + 1 : 0;
      if (out) p.damage(storm.damage, { source: 'world', cause: 'storm', knockback: 0 });
    }
  }

  /** What the status pill says about the storm: what it's doing, and the seconds left. */
  describe(): { text: string; time: number; tone: string } {
    const s = this.storm;
    switch (s.step) {
      case 'calm':
        return { text: 'Storm forms', time: s.left, tone: 'calm' };
      case 'wait':
        return { text: 'Zone closes in', time: s.left, tone: '' };
      case 'shrink':
        return { text: 'Storm closing', time: s.left, tone: 'closing' };
      default:
        return { text: 'Final circle', time: 0, tone: 'closing' };
    }
  }

  wire(): StormWire {
    return this.storm.wire();
  }
}
