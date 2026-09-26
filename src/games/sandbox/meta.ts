import { defineMeta } from '@platform';
import cover from './cover.webp?url';

/** Creative building in an endless procedural world: the platform with no rules on top. */
export default defineMeta({
  id: 'sandbox',
  title: 'Sandbox',
  tagline: 'Build anything in an endless world',
  accent: '#7fd46b',
  cover,
  controls: [
    ['Space ×2', 'fly'],
    ['LMB', 'break'],
    ['RMB', 'place'],
    ['E', 'blocks'],
    ['MMB', 'pick the block you look at'],
  ],
  achievements: {
    first_block: { title: 'Groundbreaker', description: 'Place your first block' },
    picker: { title: 'Fresh from the Picker', description: 'Place one of Sandbox’s own blocks: a crate, marble, a paper lantern… (E opens the picker)' },
    flight: { title: 'Take Flight', description: 'Fly 30 blocks above the ground (double-tap Space)' },
    sky_high: { title: 'Cloud Builder', description: 'Place a block high in the sky (height 200 or more)' },
    master_builder: { title: 'Master Builder', description: 'Place 1,000 blocks' },
    wanderer: { title: 'Far and Away', description: 'Travel 1,000 blocks from the spawn', hidden: true },
  },
});
