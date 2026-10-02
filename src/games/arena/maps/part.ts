import type { GameContext, Player } from '@platform';
import type { ArenaPart } from '../part';
import { bus } from '../run/bus';
import { inFight, map } from '../run/state';
import { chooseMap, runEnded, setupChoice, updateChoice } from './choice';
import { opened, startGates, updateGates } from './gates';
import { startHazards, updateHazards } from './hazards';
import { MAPS } from './index';
import { INTRO_MSG, type IntroMessage } from './messages';
import { place, resetModels } from './props';
import { setupTraps, startTraps, updateTraps } from './traps';


/** Which map's fly-over each fighter was last shown, and when (by id): not twice for one arrival. */
const introduced = new Map<string, { map: string; at: number }>();

function introduce(game: GameContext, p: Player, full: boolean) {
  const last = introduced.get(p.id);
  if (p.bot || (last && last.map === map().id && last.at > game.clock.total - 3)) return;
  introduced.set(p.id, { map: map().id, at: game.clock.total });
  game.clients.send(p, INTRO_MSG, { map: map().id, full } satisfies IntroMessage);
}

/**
 * The maps' own business in a fight: which map it's on (`choice.ts`: the rotation, the vote, the
 * pick), its set pieces, portcullises (`gates.ts`), traps (`traps.ts`) and hazards
 * (`hazards.ts`), and the fly-over each screen's shown as a fight begins or as someone joins one.
 */
export const mapsPart: ArenaPart = {
  name: 'maps',
  setup(game) {
    resetModels();
    introduced.clear();
    setupTraps(game, MAPS);
    setupChoice(game);
    bus.on('spawned', ({ entity }) => opened(game, entity.position));
    bus.on('runStart', () => {
      for (const p of game.players) introduce(game, p, true);
    });
    bus.on('runEnd', () => runEnded(game));
    game.events.on('playerReady', ({ player }) => {
      if (inFight()) introduce(game, player, false);
    });
  },
  start(game) {
    chooseMap(game);
    for (const d of map().decor ?? []) place(game, d.model, d.at, d.face);
    startGates(game);
    startTraps(game);
    startHazards();
  },
  update(game, dt) {
    updateChoice(game);
    updateGates(game, dt);
    updateTraps(game, dt);
    updateHazards(game, dt);
  },
};
