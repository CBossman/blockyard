import { defineServer } from '@platform';
import { defineHud } from './hud';
import { SCENE_MODELS } from './models';
import { FLEET, NEXT_RACE, Race, fleetModels, type FleetModels } from './race';
import { shared } from './shared';

/**
 * Block Regatta's rules: a race for whoever's here, bots in the empty places. The race itself
 * (wind, boats, line, marks, HUD) is `race.ts`; this starts one, and lets people come and go.
 */

let race: Race | null = null;
let models: FleetModels;

export default defineServer(shared, {
  // The bots race even with nobody here, so the home page shows a race under way.
  autoStart: true,
  setup(game) {
    models = fleetModels(game);
    // The sea, the islands, the waves and the gusts' ripples are drawn by each screen, as the looks
    // of items no one carries (client.ts).
    for (const id of Object.keys(SCENE_MODELS)) game.items.define(id, { kind: 'misc', name: id });
    defineHud(game);
    // The first person in starts a fresh race (the bots' one was for show); someone joining a race
    // with people in it gets a boat at the start, and can still cross the line and race.
    game.events.on('playerJoin', ({ player }) => {
      if (race && !race.racers.some((r) => r.player)) game.clock.after(0, () => game.restart());
      else race?.addPlayer(player);
    });
    game.events.on('playerLeave', ({ player }) => race?.remove(player));
  },

  start(game) {
    race = new Race(game, models);
    for (const p of game.players) race.addPlayer(p);
    while (race.racers.length < FLEET) race.addBot();
    game.hud.banner('Block Regatta', 'Start in 30 seconds: be near the line at the gun, not over it');
  },

  update(game, dt) {
    race?.update(dt);
    // A while after the finish (or right away if everyone's gone), the next race starts by itself.
    if (race?.over && (race.t - race.endedAt > NEXT_RACE || !race.racers.some((r) => r.player))) game.restart();
  },
});
