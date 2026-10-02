/**
 * What the maps' server side tells each screen (`game.clients.send`), and the screens' code
 * (`client/maps/`) hears: kept here so both sides agree without either importing the other.
 */

/** The opening fly-over: the map's id, and whether it's a fight's start (else a joiner's, shorter and skippable). */
export const INTRO_MSG = 'arena.intro';
export interface IntroMessage {
  map: string;
  full: boolean;
}

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
