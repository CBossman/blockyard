import type { ClientPart } from './part';
import { announcer } from './hud/announcer';
import { status } from './hud/status';
import { hudState } from './hud/store';

/**
 * The HUD on each screen: the Arena's look over the platform's pieces is the theme's
 * (`hud/theme.ts`); these kits draw the rest from what the HUD's server part says (`hud/part.ts`):
 * the state they read (`hud/store.ts`, first), the standing HUD (the wave, gold and the crowd, the
 * party, blessings), the announcer, the wave-cleared card, hits (markers, hit-stop, gore), the
 * fighter's vitals, the music and the crowd in the stands. Its voices are `sounds/hud.ts`.
 */
export const hudClient: ClientPart = { name: 'hudClient', kits: [hudState(), status(), announcer()] };
