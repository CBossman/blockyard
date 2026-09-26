import { defineMeta } from '@platform';
import cover from './cover.webp?url';

/** Arena: survive six waves of monsters in a colosseum, collect better weapons between waves, and defeat the Warden. */
export default defineMeta({
  id: 'arena',
  title: 'Arena',
  tagline: 'Survive six waves and slay the Warden',
  accent: '#ff8a4c',
  cover,
  instances: true,
  controls: [
    ['LMB', 'attack · hold to draw bow'],
    ['RMB', 'drink potion'],
    ['1-9', 'weapons'],
  ],
  achievements: {
    first_blood: { title: 'First Blood', description: 'Slay your first monster in the arena' },
    first_wave: { title: 'Warmed Up', description: 'Clear the first wave' },
    untouched: { title: 'Untouched', description: 'Clear a wave without taking any damage' },
    master_of_arms: { title: 'Master of Arms', description: 'In one fight, slay monsters with the bow, a sword, the pike and the battle axe' },
    champion: { title: 'Champion', description: 'Defeat the Warden and win the arena' },
    unbroken: { title: 'Unbroken', description: 'Win the arena from the first wave without falling once' },
    veteran: { title: 'Arena Veteran', description: 'Slay 250 monsters in the arena, all time' },
    slam_dodge: { title: 'Light on Your Feet', description: "Jump over the Warden's ground slam", hidden: true },
    splinters: { title: 'Splinters', description: 'Deal the Warden its final blow with the wooden sword', hidden: true },
  },
});
