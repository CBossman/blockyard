import type { GameContext, MenuHandle, Player } from '@platform';
import { map, setMap } from '../run/state';
import { MAPS, mapById, type ArenaMap } from './index';

/**
 * Which map a fight's on. The public room goes round the maps (`MAPS`, in order), a run on each;
 * as a run ends, everyone in it is asked where the next is fought (a menu over their results, as
 * Call of Blocky's vote on the next match; voting closes it, and M brings it back), the most votes
 * winning and a tie (or no votes) going to the rotation's next. In a room of one's own it's a
 * pick: the same at the end of a run (the same map again if nobody picks), and M picks a map to
 * start over on at any time. The change happens as the next fight starts (`chooseMap`, from the
 * maps' part's `start`).
 */

export const PICK_KEY = 'KeyM';
/** Seconds after a run ends that the vote's put up (over the results, once they're in). */
const AFTER = 3.6;
/** How long a vote shows as made before its menu closes. */
const SEEN = 1.1;

/** The next fight's map, once a run's ended (null: the same again, as after a reset). */
let planned: ArenaMap | null = null;
/** Each fighter's vote (player id → map id), and their menus while they're up. */
const votes = new Map<string, string>();
const menus = new Map<string, MenuHandle>();
/** The vote's on (a run's ended, the next not yet begun). */
let voting = false;

const own = (game: GameContext) => game.room !== 'public';
const next = (m: ArenaMap) => MAPS[(MAPS.indexOf(m) + 1) % MAPS.length];

export function setupChoice(game: GameContext) {
  planned = null;
  votes.clear();
  menus.clear();
  voting = false;
  game.commands.register('map', {
    usage: '<map>',
    help: 'Start the fight over on another map',
    cheat: true,
    complete: () => MAPS.map((m) => m.id),
    run: ([id], g) => {
      const m = mapById(id);
      if (!m) return `Maps: ${MAPS.map((x) => x.id).join(', ')}`;
      voting = false;
      planned = m;
      g.restart();
    },
  });
  game.events.on('playerLeave', ({ player }) => {
    votes.delete(player.id);
    menus.delete(player.id);
    if (voting) refresh(game);
  });
}

/** A run's over: the vote on the next opens, for everyone in it. */
export function runEnded(game: GameContext) {
  planned = own(game) ? map() : next(map());
  votes.clear();
  voting = true;
  // A moment for the results to land before the vote's put up over them.
  game.clock.after(AFTER, () => {
    if (!voting) return;
    for (const p of game.players) if (!p.bot) offer(game, p);
  });
}

/** What wins as the votes stand: the most votes; a tie (or none) to what was coming anyway. */
function winner(): ArenaMap {
  const fallback = planned ?? map();
  const count = new Map<string, number>();
  for (const id of votes.values()) count.set(id, (count.get(id) ?? 0) + 1);
  const top = Math.max(0, ...count.values());
  if (!top) return fallback;
  const tied = MAPS.filter((m) => count.get(m.id) === top);
  return tied.includes(fallback) ? fallback : tied[0];
}

function vote(game: GameContext, p: Player, id: string) {
  if (!voting || !mapById(id)) return;
  votes.set(p.id, id);
  p.audio.play('click');
  refresh(game);
  // Seen as made a moment, then out of the way of their results.
  const menu = menus.get(p.id);
  game.clock.after(SEEN, () => {
    if (menus.get(p.id) === menu && menu?.open) menu.close();
  });
}

/** Everyone's menu that's up, as the votes stand. */
function refresh(game: GameContext) {
  for (const p of game.players) {
    const menu = menus.get(p.id);
    if (menu?.open) menu.update({ subtitle: subtitle(game), sections: sections(game, p) });
  }
}

/** What the vote's menu says under its title. */
const subtitle = (game: GameContext) => (own(game) ? 'Where do you fight next?' : `Most votes wins · up next: ${winner().name}`);

/** The vote (or, in a room of one's own, the pick) as a menu: M. */
function offer(game: GameContext, p: Player) {
  menus.get(p.id)?.close();
  const menu = p.hud.menu({
    title: voting ? 'Next arena' : 'Choose the arena',
    subtitle: voting ? subtitle(game) : 'Start the fight over on another map',
    sections: sections(game, p),
    onClose: () => {
      if (menus.get(p.id) === menu) menus.delete(p.id);
    },
  });
  menus.set(p.id, menu);
}

function sections(game: GameContext, p: Player) {
  const mine = votes.get(p.id);
  const win = winner();
  const count = new Map<string, number>();
  for (const id of votes.values()) count.set(id, (count.get(id) ?? 0) + 1);
  // The votes for each and which is next (in a room of one's own, the pick shows as theirs).
  const tally = (m: ArenaMap) => {
    if (own(game)) return '';
    const n = count.get(m.id) ?? 0;
    return win === m ? (n ? `${n} · next` : 'next') : n ? `${n} vote${n === 1 ? '' : 's'}` : '';
  };
  return [
    {
      entries: MAPS.map((m) => ({
        icon: { block: m.icon },
        label: m.name,
        note: m.line,
        detail: voting ? tally(m) : m === map() ? 'now' : '',
        active: voting ? mine === m.id : m === map(),
        onSelect: () => {
          if (voting) return vote(game, p, m.id);
          // A pick in one's own room: the fight starts over there.
          planned = m;
          menus.get(p.id)?.close();
          game.hud.feed([{ text: p.name, color: '#ffd36b' }, ` takes the fight to ${m.name}`]);
          game.restart();
        },
      })),
    },
  ];
}

/** Every tick: M brings up the vote (or the pick); in the public room between votes, it says what's next. */
export function updateChoice(game: GameContext) {
  for (const p of game.players) {
    if (p.bot || !p.input.pressed(PICK_KEY, { dead: true })) continue;
    if (voting || own(game)) offer(game, p);
    else p.hud.toast(`The arena moves on each run · next: ${next(map()).name} · vote when this run ends`);
  }
}

/**
 * A fight begins: on the vote's winner if a run just ended (the same map after a reset or a pick
 * made); newcomers come in at its middle, and the fighters are moved there.
 */
export function chooseMap(game: GameContext) {
  const m = voting ? winner() : (planned ?? map());
  for (const menu of menus.values()) menu.close();
  menus.clear();
  votes.clear();
  voting = false;
  planned = null;
  const moved = m !== map();
  setMap(m);
  game.env.time = m.time;
  const c = m.center;
  game.world.spawn = { x: c.x, y: c.y + 0.05, z: c.z, yaw: 0 };
  if (!moved) return;
  // Everyone to the new map's middle, spread out a little.
  game.players.forEach((p, i) => {
    const a = (i / Math.max(1, game.players.length)) * Math.PI * 2;
    const r = game.players.length > 1 ? 1.5 : 0;
    p.teleport({ x: c.x + Math.cos(a) * r, y: c.y + 0.05, z: c.z + Math.sin(a) * r }, game.rng.range(0, Math.PI * 2), 0);
  });
}

