import { defineMeta } from '@platform';
import cover from './cover.webp?url';

/** Tutorial game from docs/PLATFORM.md: find ten glowing hearts scattered around a pedestal. */
export default defineMeta({
  id: 'heart-hunt',
  title: 'Heart Hunt',
  tagline: 'A gentle hunt for ten hidden hearts',
  accent: '#ff5a7a',
  cover,
  controls: [['Walk', 'into hearts to collect']],
  achievements: {
    first_heart: { title: 'Sweetheart', description: 'Find your first heart' },
    all_hearts: { title: 'Heart of Gold', description: 'Find all ten hearts' },
    speedy: { title: 'Cupid', description: 'Find all ten in under two minutes', hidden: true },
  },
});
