import { defineShared } from '@platform';
import meta from './meta';
import { FLOOR, MAPS } from './maps';
import { roll } from './abilities';
import { HUD } from './hud/theme';

const first = MAPS[0];

/** Every map's blocks (every screen builds them too), the player, who can dodge-roll (Q), and the HUD's look (`hud/theme.ts`). */
export const shared = defineShared({
  ...meta,
  world: {
    // No landscape to make: the maps stand on a plain ground over the void (below their rims, so
    // from inside it's all sky), each far from the others, and nothing past the haze is loaded.
    terrain: 'void',
    ground: { y: FLOOR, top: 'grass_block', fill: 'dirt', depth: 4 },
    maxViewDistance: 8,
    structures: MAPS.map((m) => m.build()),
    spawn: { x: first.center.x, y: first.center.y + 0.05, z: first.center.z },
    spawnYaw: 0,
    time: first.time,
    freezeTime: true,
  },
  player: { health: 20, regen: { delay: 4, perSecond: 0.6 }, fallDamage: true, hotbar: 'items', movement: { abilities: { roll } } },
  hud: HUD,
});
