import { defineShared } from '@platform';
import meta from './meta';
import { boatVehicle } from './sailing';

/**
 * An empty world but for the sea: a single sheet of the engine's water (its reflections and
 * swell), nothing under it. The islands, the marks and everything else are the game's own models,
 * drawn by each screen (`client.ts`), and felt by the boats from their shapes (`islands.ts`). The
 * skippers have no walking body: each sails a foiling monohull, a vehicle every screen predicts.
 */
export const shared = defineShared({
  ...meta,
  world: {
    terrain: 'void',
    // The sea: the engine's own water (reflections, moving swell), a single sheet with nothing
    // under it, so each chunk is just its water surface.
    ground: { y: 62, top: 'water', depth: 1 },
    maxViewDistance: 10,
    spawn: { x: 0, y: 70, z: 150 },
    spawnYaw: 0,
    time: 0.4,
    freezeTime: true,
  },
  player: { controller: 'none', health: false },
  hud: {
    theme: {
      display: "'Lilita One', 'Trebuchet MS', sans-serif",
      text: "'Nunito', system-ui, sans-serif",
      fonts: ['Lilita One', 'Nunito:600;800'],
      colors: { accent: '#ffd23f', good: '#7ee787', danger: '#ff6b5a' },
    },
  },
  vehicles: { boat: boatVehicle },
});
