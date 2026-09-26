import { defineMeta } from '@platform';
import cover from './cover.webp?url';

/**
 * Blockfront II: the Rebels against the Empire, troopers and heroes, fighting over the command
 * posts of a desert spaceport. Blasters that overheat, sabers that deflect them, and the Force.
 */
export default defineMeta({
  id: 'blockfront',
  title: 'Blockfront II',
  tagline: 'Rebels against the Empire: blasters, sabers and the Force, for the command posts of a desert spaceport.',
  accent: '#ffe81f',
  cover,
  controls: [
    ['LMB', 'fire · saber'],
    ['RMB', 'aim · block'],
    ['R', 'vent the heat'],
    ['Shift', 'sprint'],
    ['C', 'crouch · slide'],
    ['1 2', 'weapons'],
    ['G', 'thermal detonator'],
    ['Q E F', 'hero powers'],
    ['H', 'class · hero · where to spawn'],
    ['Tab', 'scores'],
  ],
  // Controllers: the platform's shooter layout (RT fire, LT aim, X vent, B crouch, L3 sprint), the
  // detonator on RB, the heroes' powers on the D-pad, and the spawn menu on its down.
  gamepad: {
    RB: ['KeyG', 'detonator'],
    Left: ['KeyQ', 'power 1'],
    Up: ['KeyE', 'power 2'],
    Right: ['KeyF', 'power 3'],
    Down: ['KeyH', 'spawn menu'],
  },
  // Awarded by the server (`player.achieve`, server.ts).
  achievements: {
    dont_get_cocky: { title: "Don't Get Cocky", description: 'Get your first kill' },
    reporting_for_duty: { title: 'Reporting for Duty', description: 'Play a match through to the end' },
    medal_ceremony: { title: 'Medal Ceremony', description: 'Win a match with your side' },
    high_ground: { title: 'The High Ground', description: 'Capture a command post in Conquest' },
    chosen_one: { title: 'Chosen One', description: 'Spend your battle points on a hero and take the field as one' },
    giant_killer: { title: 'Giant Killer', description: 'As a trooper, take down an enemy hero' },
    elegant_weapon: { title: 'An Elegant Weapon', description: 'Cut someone down with a saber' },
    use_the_force: { title: 'Use the Force', description: 'Take someone down with a Force power' },
    galactic_veteran: { title: 'Galactic Veteran', description: 'Take down 100 fighters, over all your matches' },
    return_to_sender: { title: 'Return to Sender', description: 'Take someone down with their own bolt, turned back by your saber', hidden: true },
  },
  instances: true,
});
