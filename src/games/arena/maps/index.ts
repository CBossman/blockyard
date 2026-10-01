import { COLOSSEUM } from './colosseum';
import type { ArenaMap } from './registry';

export { FLOOR, along, type ArenaMap, type Gate, type IntroKey } from './registry';

/** Every map, in the order the public rotation takes them (the first is the default). */
export const MAPS: readonly ArenaMap[] = [COLOSSEUM];

export const mapById = (id: string): ArenaMap | undefined => MAPS.find((m) => m.id === id);
