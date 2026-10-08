import type { Client, ClientKit, ClientLoop } from '@platform/client';

/**
 * Wind in your ears while you fall: a loop that rises with your speed, loudest in a dive and
 * gentler under the parachute. (The fall itself is the movement ability, `dive.ts`, which this
 * screen predicts.)
 */
export function diveKit(): ClientKit {
  let wind: ClientLoop | null = null;
  return {
    name: 'dive',
    frame(client: Client) {
      const mode = Number(client.me.abilities.dive?.mode ?? 0);
      if (!mode || client.me.dead) {
        wind?.stop();
        wind = null;
        return;
      }
      wind ??= client.audio.loop('freefall');
      const fall = Math.min(1, Math.abs(client.me.velocity.y) / 34);
      wind.set({ volume: 0.1 + fall * 0.55, pitch: 0.7 + fall * 0.7 });
    },
    dispose() {
      wind?.stop();
    },
  };
}
