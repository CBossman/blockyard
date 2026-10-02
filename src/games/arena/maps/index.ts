import { COLOSSEUM } from './colosseum';
import type { ArenaMap } from './registry';

export { FLOOR, along, inBox, mapNear, type ArenaMap, type Box, type Fire, type Gate, type IntroKey, type TrapSpec } from './registry';
export { MAP_BLOCKS } from './blocks';

/** Every map, in the order the public rotation takes them (the first is the default). */
export const MAPS: readonly ArenaMap[] = [COLOSSEUM];

export const mapById = (id: string): ArenaMap | undefined => MAPS.find((m) => m.id === id);
