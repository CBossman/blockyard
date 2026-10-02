import type { GameContext, Player } from '@platform';
import { bus } from '../run/bus';
import { map } from '../run/state';
import { INTRO_DONE_MSG, INTRO_MSG, introSeconds, type IntroMessage } from './messages';

/**
 * The fly-over each fighter's shown (`client/maps/intro.ts` flies it): the whole of it as a fight
 * begins (`runStart`), a shorter one as someone joins a fight under way. When a fighter's is over
 * (their screen says it's played out or they skipped it, or its time's up and a little more, if
 * their screen never says), the bus hears `introOver`: the run puts up their class menu then.
 */

/** Each fighter's fly-over still playing: until when it's given at the latest (the game's clock). */
const playing = new Map<string, number>();
/** Which map's fly-over each fighter was last shown, and when (all-time clock): not twice for one arrival. */
const shown = new Map<string, { map: string; at: number }>();

/** Slack for a screen's word to arrive (seconds). */
const SLACK = 1;

export function setupIntro(game: GameContext) {
  playing.clear();
  shown.clear();
  game.events.on('clientMessage', ({ player, name }) => {
    if (name === INTRO_DONE_MSG && playing.has(player.id)) over(player);
  });
  game.events.on('playerLeave', ({ player }) => {
    playing.delete(player.id);
  });
}

/** A fight's beginning: everyone's shown it afresh (nothing's playing from the last). */
export function startIntro() {
  playing.clear();
  shown.clear();
}

/** Show a fighter the fly-over (`full` at a fight's start); a bot, or one already shown it, has none (and is told it's over). */
export function introduce(game: GameContext, p: Player, full: boolean) {
  const last = shown.get(p.id);
  const again = last && last.map === map().id && last.at > game.clock.total - 3;
  if (p.bot || again) {
    if (!playing.has(p.id)) bus.emit('introOver', { player: p });
    return;
  }
  shown.set(p.id, { map: map().id, at: game.clock.total });
  playing.set(p.id, game.clock.now + introSeconds(full) + SLACK);
  game.clients.send(p, INTRO_MSG, { map: map().id, full } satisfies IntroMessage);
}

/** Whether a fighter's fly-over is still playing. */
export const watchingIntro = (p: Player) => playing.has(p.id);

/** Every tick: fly-overs whose screens never said they were over, given up on. */
export function updateIntro(game: GameContext) {
  for (const [id, until] of playing) {
    if (game.clock.now < until) continue;
    const p = game.players.find((q) => q.id === id);
    if (p) over(p);
    else playing.delete(id);
  }
}

function over(p: Player) {
  playing.delete(p.id);
  bus.emit('introOver', { player: p });
}
