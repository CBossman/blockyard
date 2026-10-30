import { defineMeta } from '@platform';
import cover from './cover.webp?url';

/** Block Regatta: foiling monohulls racing round the marks at 40 knots, reading the wind. */
export default defineMeta({
  id: 'regatta',
  title: 'Block Regatta',
  tagline: 'Foiling monohulls at 40 knots. Read the wind, stay on the foils, beat the fleet.',
  accent: '#2fa4e7',
  cover,
  controls: [
    ['A D', 'steer'],
    ['W S', 'sheet in · ease out the sails (with auto-trim off)'],
    ['T', 'auto-trim on or off'],
    ['Off the foils?', 'bear away to a reach to take off'],
    ['C', 'high camera, to read the wind ahead'],
    ['Dark water', 'a gust: more wind, more speed'],
  ],
  achievements: {
    finished: { title: 'Fair Winds', description: 'Finish a race' },
    won: { title: 'Bullet', description: 'Win a race' },
    on_the_gun: { title: 'On the Gun', description: 'Cross the start line within three seconds of the gun' },
    wire_to_wire: { title: 'Wire to Wire', description: 'Lead at every mark and win' },
    comeback: { title: 'Comeback Kid', description: 'Win after rounding the first mark in last place' },
    bad_air: { title: 'Bad Air', description: 'Hold a rival in your wind shadow for five seconds' },
    gust_rider: { title: 'Gust Rider', description: 'Hit 45 knots' },
    clean: { title: 'Clean Sheet', description: 'Finish without starting early or touching anything', hidden: true },
  },
});
