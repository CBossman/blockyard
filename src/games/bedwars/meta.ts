import { defineMeta } from '@platform';
import cover from './cover.webp?url';

/** Bed Wars: four teams on sky islands, each guarding its bed. Bridge out, break theirs; last team standing wins. */
export default defineMeta({
  id: 'bedwars',
  title: 'Bed Wars',
  tagline: 'Guard your bed, bridge out, break theirs. Last team standing wins.',
  accent: '#ff5b5b',
  cover,
  instances: true,
  controls: [
    ['LMB', 'attack · hold to mine'],
    ['RMB', 'place block · use item'],
    ['RMB', 'talk to the shopkeeper'],
  ],
  achievements: {
    first_blood: { title: 'First Blood', description: 'Take down an enemy' },
    retail_therapy: { title: 'Retail Therapy', description: 'Buy something from the Item Shop' },
    rude_awakening: { title: 'Rude Awakening', description: "Break an enemy team's bed" },
    final_kill: { title: 'Lights Out', description: 'Get a final kill: take down an enemy whose bed is gone' },
    into_the_void: { title: 'Into the Void', description: 'Knock an enemy off the islands into the void' },
    first_win: { title: 'Last Team Standing', description: 'Win a match' },
    sweet_dreams: { title: 'Sweet Dreams', description: 'Win a match with your own bed still standing' },
    veteran: { title: 'Bed Wars Veteran', description: 'Win 10 matches, all time' },
    early_riser: { title: 'Early Riser', description: 'Break a bed in the first two minutes of a match', hidden: true },
  },
});
