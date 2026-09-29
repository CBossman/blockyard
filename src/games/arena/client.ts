import { defineClient } from '@platform/client';
import { effects, figures, firstPerson, hud, items, sounds } from '@platform/client/kits';
import { defineLooks } from './client/looks';
import { defineSounds } from './client/sounds';
import { shared } from './shared';

/**
 * The Arena on each player's screen: the platform's kits it uses, in the order they run (bombs,
 * thrown and flying, the standard voices, the first-person view, the fighters' and monsters'
 * figures, the bomb count and warning markers, the bombs' flight), then its own look:
 * each weapon's icon and model (`client/looks.ts`), and the creatures' voices (`client/sounds.ts`).
 */
export default defineClient(shared, {
  kits: [items.throwables(), ...sounds.standard(), ...firstPerson.standard(), figures.humanoid(), hud.throwables(), effects.throwables()],
  setup(client) {
    defineLooks(client);
    defineSounds(client);
  },
});
