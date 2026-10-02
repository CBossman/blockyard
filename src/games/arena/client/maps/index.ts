import type { ClientPart } from '../part';
import { air } from './air';
import { intro } from './intro';
import { trapFx } from './traps';

/** The maps on screen: the opening fly-over, each map's air and fires, the traps at work. (Their voices: `sounds/maps.ts`.) */
export const mapsClient: ClientPart = { name: 'mapsClient', kits: [intro(), air(), trapFx()] };
