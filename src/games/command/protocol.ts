import type { BuildingKind, DifficultyId, DoctrineId, Mode, TechId, UnitKind } from './defs';

/**
 * What the server tells the screens, and they ask it, as messages.
 *
 * To the screens:
 * - `state` (four times a second): the phase, the mode, every player's seat and resources, and the
 *   deposits' amounts;
 * - `u` (ten times a second): every unit, as numbers in a row, eight each (id, kind index, seat, x, z,
 *   health percent, facing as tenths of a radian, and its flags: `FLAG`) and `b`: every building, as
 *   nine each (id, kind index, seat, x, z, health percent, how built (percent), how far its first
 *   order is (percent), how many are inside it);
 * - `shots`: an attack, from (x, y, z) to (tx, ty, tz); `boom`: a blast at (x, z).
 *
 * - `eyes` (ten times a second, to each human): what their team can see, as `{ all, eyes }`, three numbers
 *   each (x, z, sight radius), for the minimap's fog; units and buildings of the others reach a screen
 *   only where its team sees them.
 *
 * From them: `doctrine` `{ doctrine }` and `mode` `{ mode, doctrine }` (in the lobby: starts the match), `power` `{ x, z }` (the special power), `move` `{ ids, x, z, attack? }`,
 * `attack` `{ ids, id, building }`, `gather` `{ ids, id }`, `build` `{ kind, x, z, ids }`, `wall` `{ x, z, x1, z1, ids }` (a line of wall, dragged), `train`
 * `{ id, kind }`, `rally` `{ id, x, z }`, `cancel` `{ id }`, `enter` `{ ids, id, boat }` (into a bunker
 * or a transport), `unload` `{ id, boat }`, `stance` `{ ids, stance }`, `again` (after a match).
 */

export interface Seat {
  seat: number;
  name: string;
  team: number;
  color: number;
  human: boolean;
  steel: number;
  oil: number;
  pop: number;
  cap: number;
  alive: boolean;
  doctrine: DoctrineId;
  /** How many units and buildings it has (the scoreboard's).  */
  units: number;
  buildings: number;
  /** Seconds until its special power is ready (0: ready), and until its commander's Rally is; whether it has a commander; what it has researched. */
  powerIn: number;
  rallyIn: number;
  hero: boolean;
  techs: TechId[];
  /** What a lot of steel, and a lot of oil, fetches at its trade post now. */
  trade: [number, number];
  /** A bot's way of playing (`bots.ts`), shown by its name. */
  style: string;
  /** What its army is worth, and what it has gathered in the last minute (the strength panel). */
  worth: number;
  income: number;
}

/** A place at the table, before a match: its colour is its number. */
export interface LobbySeat {
  seat: number;
  kind: 'human' | 'bot' | 'closed';
  name: string;
  /** The player's id, for a human. */
  id: string;
  team: number;
  /** A bot's style (a key of `STYLES`, or 'random') and how good it is. */
  style: string;
  difficulty: DifficultyId;
  ready: boolean;
}
/** The match being set up. The first player is the host, and only the host changes the rules. */
export interface Lobby {
  seats: LobbySeat[];
  host: string;
  preset: Mode;
  resources: 'low' | 'normal' | 'high';
  fog: boolean;
  /** Minutes at the start when no side can attack another. */
  peace: number;
  watchers: { id: string; name: string }[];
}

/** A unit's flags in `u`: what it's at, its stars (`>> 4 & 3`), its stance (`>> 7 & 3`), its cargo (`>> 9`). */
export const FLAG = { working: 1, steel: 2, oil: 4, idle: 8, high: 64 };
export const rankBits = (f: number) => (f >> 4) & 3;
export const stanceBits = (f: number) => (f >> 7) & 3;
export const cargoBits = (f: number) => f >> 9;

/** The match in numbers, for the summary at its end: each seat's tallies, and its army's worth over time. */
export interface Summary {
  seats: { seat: number; name: string; trained: number; killed: number; lost: number; built: number; razed: number; steel: number; oil: number; army: number[] }[];
  /** Seconds between the samples of `army`. */
  every: number;
}

export interface State {
  phase: 'lobby' | 'briefing' | 'play' | 'over';
  mode: Mode;
  seats: Seat[];
  /** The seat of each human, by player name (so a screen finds its own). */
  mine: Record<string, number>;
  deposits: number[];
  /** What the fighting has left to strip (deposits past the map's own), still there. */
  salvage: { id: number; x: number; z: number; scrap: 'ruin' | 'henge' | 'rubble'; kind: 'steel' }[];
  /** Each camp's relic: who holds it (a seat, or -1), and how far a side has got to taking it (percent). */
  relics: { owner: number; pct: number }[];
  /** Supply drops on their way down or waiting on the ground. */
  drops: { id: number; x: number; z: number; landIn: number }[];
  /** Last Stand: which wave it's on, how many there are, seconds to the next, and how many raiders are left. */
  stand?: { wave: number; total: number; nextIn: number; left: number };
  time: number;
  winners: number[];
  /** The match being set up (in the lobby), and seconds left of the briefing. */
  lobby?: Lobby;
  briefing?: number;
  /** Match time until which no side can attack another. */
  peaceUntil: number;
  /** Those watching the match rather than playing it. */
  watchers: string[];
  /** At the end of a match. */
  summary?: Summary;
}

/** The kinds, in the order their indexes in `u` and `b` mean. */
export const UNIT_ORDER: UnitKind[] = ['engineer', 'rifle', 'tank', 'heli', 'scout', 'artillery', 'aa', 'hero', 'guard', 'brute', 'at', 'gunboat', 'transport'];
export const BUILDING_ORDER: BuildingKind[] = ['hq', 'depot', 'barracks', 'factory', 'airfield', 'lab', 'tower', 'bunker', 'dock', 'rampart', 'gate', 'market'];

export interface Shot {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  big: boolean;
  /** What fired it (a unit kind's index), -1 a tower, -2 a bomb: each screen gives it its sound. */
  k: number;
  /** Lobbed, not fired straight: seconds in the air. */
  arc?: number;
}
