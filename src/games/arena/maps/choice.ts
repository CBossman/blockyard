import type { GameContext, MenuHandle, Player } from '@platform';
import { map, setMap } from '../run/state';
import { MAPS, mapById, type ArenaMap } from './index';

/**
 * Which map a fight's on. The public room goes round the maps (`MAPS`, in order), a run on each;
 * as a run ends, everyone in it votes on the next (a row of the maps under the end screen, and M
 * brings up the same as a menu), the most votes winning and a tie (or no votes) going to the
 * rotation's next. In a room of one's own it's a pick: the same vote at the end of a run (the
 * same map again if nobody votes), and M picks a map to start over on at any time. The change
 * happens as the next fight starts (`chooseMap`, from the maps' part's `start`).
 */

export const PICK_KEY = 'KeyM';
const VOTE = 'arena-vote';

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
  game.hud.define(VOTE, {
    at: 'bottom',
    html: `<div class="vote">
      <div class="head"><b>Next arena</b><span>{{note}}</span></div>
      <div class="cards"><button data-each="maps" class="card {{state}}" data-action="vote" data-value="{{id}}" style="--c: {{color}}">
        <span class="name">{{name}}</span><span class="line">{{line}}</span>
        <span class="tally"><em data-if="votes > 0">{{votes}}</em><i data-if="state == 'mine'">your vote</i><i data-if="state == 'next'">next</i><i data-if="state == 'mine next'">your vote · next</i></span>
      </button></div>
    </div>`,
    css: VOTE_CSS,
    actions: { vote: (p, id) => vote(game, p, id) },
  });
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
  // A moment for the result to land before the vote's put up under it.
  game.clock.after(2.4, () => voting && refresh(game));
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
}

/** Every fighter's row of maps (and menu, if it's up) as the votes stand. */
function refresh(game: GameContext) {
  const win = winner();
  const count = new Map<string, number>();
  for (const id of votes.values()) count.set(id, (count.get(id) ?? 0) + 1);
  const note = own(game) ? 'Pick where you fight next' : `Most votes wins · up next: ${win.name}`;
  for (const p of game.players) {
    if (p.bot) continue;
    const mine = votes.get(p.id);
    const maps = MAPS.map((m) => ({
      id: m.id,
      name: m.name,
      line: m.line,
      color: m.color,
      votes: count.get(m.id) ?? 0,
      state: [mine === m.id ? 'mine' : '', win === m ? 'next' : ''].filter(Boolean).join(' '),
    }));
    p.hud.widget(VOTE, { note, maps });
    const menu = menus.get(p.id);
    if (menu?.open) menu.update({ subtitle: note, sections: sections(game, p) });
  }
}

/** The vote (or, in a room of one's own, the pick) as a menu: M. */
function offer(game: GameContext, p: Player) {
  menus.get(p.id)?.close();
  const menu = p.hud.menu({
    title: voting ? 'Next arena' : 'Choose the arena',
    subtitle: voting ? (own(game) ? 'Pick where you fight next' : `Most votes wins · up next: ${winner().name}`) : 'Start the fight over on another map',
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
  return [
    {
      entries: MAPS.map((m) => ({
        icon: { block: m.icon },
        label: m.name,
        note: m.line,
        detail: voting ? [mine === m.id ? 'your vote' : '', win === m ? 'next' : ''].filter(Boolean).join(' · ') : m === map() ? 'now' : '',
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
  for (const p of game.players) if (!p.bot) p.hud.widget(VOTE).remove();
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

const VOTE_CSS = `
:scope { margin-bottom: 26px; pointer-events: auto; }
.vote { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.head { display: flex; gap: 14px; align-items: baseline; font: 600 12px/1 var(--sans); letter-spacing: 0.08em; color: #f3e6cf; text-shadow: 0 1px 3px #000c; }
.head b { font: 400 18px/1 var(--pixel); letter-spacing: 0.12em; text-transform: uppercase; color: #ffd36b; }
.cards { display: flex; gap: 8px; }
.card { all: unset; box-sizing: border-box; width: 180px; padding: 10px 12px 9px; display: flex; flex-direction: column; gap: 3px; cursor: pointer;
  background: linear-gradient(180deg, #1c140ee6, #0d0907e6); border: 1px solid #ffffff1f; border-top: 3px solid var(--c); border-radius: 6px;
  box-shadow: 0 6px 18px #0008; transition: transform 120ms ease, border-color 120ms ease; }
.card:hover { transform: translateY(-3px); border-color: #ffffff55; }
.card.mine { border-color: var(--c); box-shadow: 0 0 0 1px var(--c), 0 6px 18px #0008; }
.name { font: 400 15px/1.1 var(--pixel); color: #fff3df; letter-spacing: 0.04em; }
.line { font: 400 11px/1.3 var(--sans); color: #d8c8adcc; min-height: 28px; }
.tally { display: flex; gap: 8px; align-items: center; font: 600 11px/1 var(--sans); color: var(--c); min-height: 14px; }
.tally em { font-style: normal; background: var(--c); color: #140c06; border-radius: 9px; padding: 2px 7px; }
.tally i { font-style: normal; text-transform: uppercase; letter-spacing: 0.08em; }
`;
