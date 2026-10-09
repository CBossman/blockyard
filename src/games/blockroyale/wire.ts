/**
 * What the server tells each screen besides the storm (`storm.ts`): where the bus is going, so the
 * map can draw its route and where it is on it, and where the supply drops are. Plain data: the
 * screen eases between messages.
 */
export interface BusWire {
  /** The route's ends (x, z), and how long the whole crossing takes. */
  from: [number, number];
  to: [number, number];
  seconds: number;
  /** Seconds along it at the message, and whether it's moving (parked in the lobby: no). */
  t: number;
  sailing: boolean;
  /** It's gone (the match is on the ground). */
  over: boolean;
}

/** Where the supply drops are (on their way down, or landed and not yet opened), for the maps: (x, z) each. */
export type SupplyWire = [x: number, z: number][];
