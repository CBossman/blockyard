import { defineMeta } from '@platform';
import cover from './cover.webp?url';

/**
 * Block Royale: a dozen drop onto an island from a flying bus, find guns, and fight while a storm
 * closes in. The last one standing wins. Bots fill the places nobody has taken, so it's a match
 * with one player too.
 */
export default defineMeta({
  id: 'blockroyale',
  title: 'Block Royale',
  tagline: 'Drop in. Loot up. Be the last one standing.',
  accent: '#ff8a2a',
  cover,
  controls: [
    ['LMB / RMB', 'fire / aim'],
    ['R', 'reload'],
    ['Shift', 'sprint'],
    ['C', 'crouch'],
    ['E', 'open a chest'],
    ['1 - 5', 'rifle, shotgun, SMG, sniper, pistol'],
    ['6 - 9', 'bandage, med kit, shield, frag (hold RMB to use)'],
    ['G', 'throw a frag cube (hold to cook)'],
    ['Space', 'jump · open or close the parachute'],
    ['M', 'the map'],
    ['Tab', 'scores'],
    ['F', 'out of it: watch the next fighter'],
  ],
  // Controllers: the platform's shooter layout, with the map on the D-pad's down and watching the next fighter on its right.
  gamepad: { Down: ['KeyM', 'map'], Right: ['KeyF', 'watch next'] },
  instances: true,
  achievements: {
    played: { title: 'Dropped In', description: 'Play a match through to the end' },
    first_elim: { title: 'First Blood', description: 'Eliminate another player' },
    five_elims: { title: 'Squad Wiper', description: 'Eliminate five fighters in one match' },
    treasure_hunter: { title: 'Treasure Hunter', description: 'Open eight chests in one match' },
    last_standing: { title: 'Last One Standing', description: 'Win a match' },
  },
});
