import { defineShared } from '@platform';
import { BLOCKS } from './blocks';
import { dive } from './dive';
import { SEED, STRUCTURES, TERRAFORMS } from './island';
import meta from './meta';

/**
 * The island, how everyone moves on it, and how the HUD looks: what the server and every screen
 * read. The island is a stretch of the natural world (`island/`) with the landmarks stamped on it.
 */
export const shared = defineShared({
  ...meta,
  blocks: BLOCKS,
  world: {
    seed: SEED,
    structures: STRUCTURES,
    terraform: TERRAFORMS,
    // Looking at the village's roofs from the south until a match starts.
    spawn: { x: 296.5, y: 71, z: 646.5 },
    spawnYaw: 0,
    // A golden morning that never moves on: the island always looks its best.
    time: 0.34,
    freezeTime: true,
  },
  player: {
    health: 100,
    hurtCooldown: 0,
    pvp: true,
    fallDamage: false,
    hotbar: 'items',
    movement: {
      walk: 5.6,
      sprint: 8,
      crouch: 2.8,
      jump: 1.25,
      gravity: 30,
      acceleration: 16,
      airControl: 3,
      sprintKeys: ['ShiftLeft', 'ShiftRight'],
      crouchKeys: ['KeyC'],
      doubleTapSprint: false,
      mantle: 1.1,
      // Off the bus, a dive and a parachute (dive.ts).
      abilities: { dive },
    },
  },
  hud: {
    health: 'bar',
    healthBars: true,
    nameTags: 'sight',
    theme: {
      // Squared-off, condensed, a little military: orange on charcoal.
      display: "'Barlow Condensed', 'Arial Narrow', Impact, sans-serif",
      text: "'Barlow', 'Helvetica Neue', system-ui, sans-serif",
      fonts: ['Barlow Condensed:600;700', 'Barlow:500;700'],
      // (Panels in charcoal, like the game's own widgets: the text on them is white.)
      colors: { accent: '#ff8a2a', ink: '#12141a', paper: '#1b1e27', text: '#ffffff', danger: '#ff4a5a', good: '#5fd35f' },
    },
  },
});
