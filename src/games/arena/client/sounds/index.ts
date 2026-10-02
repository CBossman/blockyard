import type { Client } from '@platform/client';
import { defineCreatureSounds } from './creatures';
import { defineBestiarySounds } from './bestiary';

/**
 * The Arena's voices, synthesised on each screen (`client.audio.define`: nothing is recorded or
 * sent); the server plays them by name. Each part keeps its own in its own file here.
 */
export function defineSounds(client: Client) {
  defineCreatureSounds(client);
  defineBestiarySounds(client);
}
