/**
 * What the maps' server side tells each screen (`game.clients.send`), and the screens' code
 * (`client/maps/`) hears: kept here so both sides agree without either importing the other.
 */

/** The opening fly-over: the map's id, and whether it's a fight's start (else a joiner's, shorter). */
export const INTRO_MSG = 'arena.intro';
export interface IntroMessage {
  map: string;
  full: boolean;
}

/** A screen's fly-over is over (played out, or skipped): it tells the server (`maps/intro.ts`). */
export const INTRO_DONE_MSG = 'arena.introDone';

/** How long the fly-over runs (seconds): at a fight's start, for a joiner; then the ease back into their own view. */
export const INTRO_TIME = { full: 6, short: 3.4, ease: 1.2 };

/** How long a fly-over has the screen, till the camera starts back to the fighter's own view (seconds). */
export const introSeconds = (full: boolean) => (full ? INTRO_TIME.full : INTRO_TIME.short);

/** The crowd cheering (the Crowd's Favour, `big`, or a feat): the stands throw petals into the pit. */
export const CHEER_MSG = 'arena.cheer';
export interface CheerMessage {
  big: boolean;
}

/** A trap's gone off: its id, and for how long (seconds) it's going. */
export const TRAP_MSG = 'arena.trap';
export interface TrapMessage {
  id: string;
  time: number;
}
