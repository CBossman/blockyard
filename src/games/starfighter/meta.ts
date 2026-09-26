import { defineMeta } from '@platform';
import cover from './cover.webp?url';

/** Starfighter: dogfight Bowtie squadrons in a Vox-wing, then knock out a Star Demolisher's shields and its bridge. */
export default defineMeta({
  id: 'starfighter',
  title: 'Starfighter',
  tagline: 'Dogfight Bowties and take down a Star Demolisher',
  accent: '#ff5a4a',
  cover,
  instances: true,
  controls: [
    ['Mouse', 'steer'],
    ['LMB', 'lasers'],
    ['RMB', 'torpedo'],
    ['W / S', 'boost / brake'],
    ['Q / E', 'barrel roll'],
    ['A / D', 'bank'],
  ],
  achievements: {
    first_kill: { title: 'Scratch One', description: 'Shoot down a Bowtie' },
    barrel_roll: { title: 'Do a Barrel Roll!', description: 'Deflect an enemy laser with a barrel roll (Q or E)' },
    stay_on_target: { title: 'Stay on Target', description: 'Shoot down a Bowtie with a proton torpedo' },
    shields_down: { title: 'Shields Down', description: "Destroy one of the Star Demolisher's shield generators" },
    great_shot: { title: 'Great Shot, Kid', description: 'Win the battle: bring down the Star Demolisher' },
    not_a_scratch: { title: 'Not a Scratch', description: 'Win the battle from the first wave without being shot down' },
    rogue_leader: { title: 'Rogue Leader', description: 'Shoot down 100 Bowties, all time' },
    ramming_speed: { title: 'Ramming Speed', description: 'Finish off a Bowtie by ramming it', hidden: true },
    return_to_sender: { title: 'Return to Sender', description: 'Destroy an enemy with its own laser, turned back by a barrel roll', hidden: true },
  },
});
