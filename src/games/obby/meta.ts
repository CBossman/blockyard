import { defineMeta } from '@platform';
import cover from './cover.webp?url';

/**
 * Sky Obby: a parkour course of ten stages floating in the sky, from stepping stones to lava,
 * crumbling sand, launch pads, blinking platforms, a spiral tower and a cannon-swept walkway.
 */
export default defineMeta({
  id: 'obby',
  title: 'Sky Obby',
  tagline: 'Ten stages of parkour in the sky. Race the clock, or your friends.',
  accent: '#ffd36b',
  cover,
  controls: [
    ['Ctrl', 'sprint'],
    ['Shift', 'sneak: don’t fall off edges'],
    ['R', 'back to your checkpoint'],
  ],
  achievements: {
    lava_lake: { title: 'Lava Walker', description: 'Get across the lava lake (stage 4)' },
    crumble: { title: 'Light on Your Feet', description: 'Get across the crumbling sand (stage 5)' },
    blink: { title: 'Blink and Miss It', description: 'Get across the blinking platforms (stage 7)' },
    spiral: { title: 'Top of the Tower', description: 'Climb the spiral tower (stage 8)' },
    crossfire: { title: 'Under Fire', description: 'Get past the cannons (stage 9)' },
    finish: { title: 'Head in the Clouds', description: 'Finish the course' },
    speedrun: { title: 'Speedrunner', description: 'Finish the course in under two minutes' },
    flawless: { title: 'Sure-Footed', description: 'Finish the course without a single fall' },
    hot_feet: { title: 'Hot Feet', description: 'Step in the lava', hidden: true },
  },
});
