import { defineClient } from '@platform/client';
import { effects, figures, firstPerson, hud, items, sounds } from '@platform/client/kits';
import { diveKit } from './client/dive';
import { defineLooks } from './client/looks';
import { mapKit } from './client/map';
import { defineSounds } from './client/sounds';
import { stormKit } from './client/storm';
import { shared } from './shared';

/**
 * Block Royale on each player's screen: the platform's kits it uses, in the order they run (the
 * guns, grenades and healing items, fired, thrown and used here at once; the standard voices, the
 * first-person view, the fighters' figures, the ammo counter, gunfire and grenades in the world),
 * then its own: the storm's wall and tint (`client/storm.ts`) and the map (`client/map.ts`). Then
 * what the items look and sound like (`client/looks.ts`, `client/sounds.ts`).
 */
export default defineClient(shared, {
  kits: [
    items.throwables(),
    items.guns(),
    items.consumables(),
    ...sounds.standard(),
    ...firstPerson.standard(),
    figures.humanoid(),
    hud.gunner(),
    hud.throwables(),
    effects.gunfire(),
    effects.throwables(),
    diveKit(),
    stormKit(),
    mapKit(),
  ],
  setup(client) {
    defineLooks(client);
    defineSounds(client);
  },
});
