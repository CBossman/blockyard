/**
 * The race course: a start line between a pin buoy and the committee boat, a windward mark
 * upwind, and a leeward gate of two buoys downwind. The breeze comes from about north (-z).
 * Where things are, and the islands' shapes, are `islands.ts` (the models are drawn from them).
 */

export { COMMITTEE, GATE, LINE_HALF, PIN, WINDWARD, landAt } from './islands';

/** How close a boat must come to round a mark. */
export const ZONE = 40;

export type LegType = 'mark' | 'gate' | 'finish';
export const LEGS: { type: LegType; name: string }[] = [
  { type: 'mark', name: 'Windward mark' },
  { type: 'gate', name: 'Leeward gate' },
  { type: 'mark', name: 'Windward mark' },
  { type: 'finish', name: 'Finish' },
];
