import { defineMeta } from '@platform';
import cover from './cover.webp?url';

/** Skyship: crew an airship across the sky islands and light the five beacons. */
export default defineMeta({
  id: 'skyship',
  title: 'Skyship',
  tagline: 'Crew an airship across the sky islands and light the five beacons.',
  accent: '#e0663a',
  cover,
  instances: true,
  controls: [
    ['E', 'take or leave the helm'],
    ['W / S', 'ahead / astern'],
    ['A / D', 'turn'],
    ['Space / Shift', 'climb / sink'],
    ['Wheel', 'zoom out from the helm'],
  ],
  achievements: {
    helmsman: { title: 'Captain', description: 'Take the helm of the airship' },
    first_beacon: { title: 'Firelighter', description: 'Light a beacon' },
    crew: { title: 'All Hands on Deck', description: 'Light a beacon while a crewmate steers (or steer while they light it)' },
    all_beacons: { title: 'Voyage Complete', description: 'Finish a voyage: all five beacons lit' },
    swift_voyage: { title: 'Fair Winds', description: 'Finish a voyage in under six minutes' },
    cloud_nine: { title: 'Cloud Nine', description: 'Take the airship as high as she goes' },
    overboard: { title: 'Man Overboard', description: 'Fall off into the sky' },
    aground: { title: 'Mind the Rocks', description: 'Run the airship into an island', hidden: true },
  },
});
