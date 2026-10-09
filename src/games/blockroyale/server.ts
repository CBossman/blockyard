import { defineServer, type Bot, type GameContext, type Player, type Vec3, type WidgetHandle } from '@platform';
import { consumables, guns, melee, throwables } from '@platform/kits';
import { Bots } from './bots';
import { Bus, pickRoute, prepareBus } from './bus';
import { Chests } from './chests';
import { Chutes, prepareChutes } from './chutes';
import { prepareSupply, Supply } from './supply';
import { clock, defineHud } from './hud';
import { CENTER, SITES } from './island';
import { defineItems, dropLoadout, equip, lying, MAX_HEALTH, SLOT } from './loot';
import { alive, fighterOf, match, people, type Fighter } from './match';
import { shared } from './shared';
import type { BusWire } from './wire';
import { Zone } from './zone';

/**
 * Block Royale: a dozen fighters drop onto an island from a flying bus, find guns in chests and on the floor,
 * and fight while a storm closes in on them. The last one standing wins.
 *
 * A match goes: **lobby** (everyone's on the parked bus, bots fill the empty places, a countdown),
 * **bus** (it crosses the island: step off the side when you like, and dive, and open your
 * parachute), **playing** (everyone's down or the bus has gone: the storm's calm, then it closes in,
 * circle by circle), **over** (the winner, the results, and a new match).
 *
 * Bots (`bots.ts`) fill the places nobody has taken, so it plays with one person too. Someone who
 * arrives while a match is on watches it, and plays the next.
 */

/** Fighters in a match, bots included (people take places from the bots, up to this many). */
const FIGHTERS = 12;
/** Seconds on the parked bus before it leaves, and seconds of results before the next match. */
const LOBBY = 24;
const RESULTS = 14;
const BOT_NAMES = ['Biscuit', 'Maple', 'Gadget', 'Pip', 'Juno', 'Rocket', 'Tango', 'Marlow', 'Fizz', 'Bruno', 'Clover', 'Dash', 'Ember', 'Nova', 'Otis', 'Pepper'];
const SCOUT = '​Scout';

let bus: Bus | null = null;
let zone: Zone | null = null;
let bots: Bots;
let chests: Chests;
let chutes: Chutes;
let supply: Supply;
let lobbyLeft = LOBBY;
let startedAt = 0;
/** A hidden bot that flies over the island at the start, so the server has the whole of it loaded (the bots' walking grid needs it). */
let scout: Bot | null = null;
let scoutAt = 0;
/** People who played this match (so it can end when they're all out). */
let humansBegan = 0;
let humansOutAt = 0;
let boardAt = 0;
let busSentAt = -9;
/** A cheat to keep the bus parked, for looking at things. */
let hold = false;
/** The altitude each person's HUD shows (only changes go out). */
const altShown = new Map<string, string>();
/** The how-to-drop card, for each person who has it up. */
const tipsUp = new Map<string, WidgetHandle>();
/** Out of it and watching: the fighter each one last jumped to with F (their place in the list). */
const watched = new Map<string, number>();
/** How many are left when everyone still in it hears so. */
const MILESTONES = [10, 5, 3, 2];

const SCOUT_WAYPOINTS: Vec3[] = [
  { x: CENTER.x - 85, y: 90, z: CENTER.z - 85 },
  { x: CENTER.x + 85, y: 90, z: CENTER.z - 85 },
  { x: CENTER.x + 85, y: 90, z: CENTER.z + 85 },
  { x: CENTER.x - 85, y: 90, z: CENTER.z + 85 },
  { x: CENTER.x, y: 90, z: CENTER.z },
];

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

const isScout = (p: Player) => p.name === SCOUT;

// -------------------------------------------------------------------------------------------------
// Fighters
// -------------------------------------------------------------------------------------------------

function newFighter(p: Player): Fighter {
  const f: Fighter = {
    player: p,
    alive: true,
    kills: 0,
    damage: 0,
    placed: 0,
    shield: 0,
    drop: 'bus',
    diedAt: -1,
    by: '',
    with: '',
    stormFor: 0,
    chestsOpened: 0,
    hudKey: '',
    airAt: 0,
  };
  match.fighters.set(p.id, f);
  return f;
}

/** Everyone who's playing this match (people and bots, not the scout, not someone just watching). */
const fighters = () => [...match.fighters.values()];
const humans = (game: GameContext) => game.players.filter((p) => !p.bot && !isScout(p));

/** Fill the places nobody has taken with bots; if people have come, send bots away. */
function balanceBots(game: GameContext) {
  const names = new Set(game.players.map((p) => p.name));
  const mine = game.bots.all.filter((b) => !isScout(b));
  const want = Math.max(0, FIGHTERS - humans(game).length);
  for (let i = mine.length; i < want; i++) {
    const name = BOT_NAMES.find((n) => !names.has(n)) ?? `Bot ${i + 1}`;
    names.add(name);
    game.bots.add(name);
  }
  for (const b of mine.slice(want)) game.bots.remove(b);
}

/** Any bot without a seat yet (just added to fill a place) boards. */
function seatNewcomers(game: GameContext) {
  for (const b of game.bots.all) if (!isScout(b) && !fighterOf(b)) board(game, b, match.fighters.size);
}

/**
 * Whether someone in the air has landed: on the ground, or in the water (where the dive ends without
 * their feet touching anything: it has been over for a moment and they're no longer falling).
 */
function landed(game: GameContext, f: Fighter): boolean {
  const p = f.player;
  if (p.onGround) return true;
  const mode = (p.abilities.dive as { mode?: number } | undefined)?.mode ?? 0;
  return mode === 0 && game.clock.now - f.airAt > 1.5 && Math.abs(p.velocity.y) < 6;
}

/** Armed for the start: a basic Plinker, so nobody's fighting with fists. */
function arm(p: Player) {
  p.inventory.clear();
  equip(p, 'plinker_common');
  p.inventory.select(SLOT.plinker);
}

/** On the bus, fit and armed. */
function board(game: GameContext, p: Player, seat: number) {
  const f = fighterOf(p) ?? newFighter(p);
  Object.assign(f, { alive: true, kills: 0, damage: 0, placed: 0, shield: 0, drop: 'bus', diedAt: -1, by: '', with: '', stormFor: 0, chestsOpened: 0, hudKey: '', airAt: 0 });
  p.spectate(false);
  p.revive();
  p.freeze(false);
  p.health = MAX_HEALTH;
  p.color = null;
  arm(p);
  bus?.seat(p, seat);
  if (p.bot) bots.add(p as Bot);
  if (!p.bot) game.hud.feed(`${p.name} boards the bus`);
}

/**
 * F, for someone watching: to just behind the next fighter still in it (in name order, round and
 * round), looking the way they look. They fly free from there.
 */
function watchNext(p: Player) {
  const list = alive()
    .filter((f) => f.drop !== 'bus')
    .sort((a, b) => a.player.name.localeCompare(b.player.name));
  if (!list.length) return;
  const i = ((watched.get(p.id) ?? -1) + 1) % list.length;
  watched.set(p.id, i);
  const f = list[i];
  const t = f.player;
  p.teleport({ x: t.position.x + Math.sin(t.yaw) * 6, y: t.position.y + 3.5, z: t.position.z + Math.cos(t.yaw) * 6 }, t.yaw, -0.3);
  p.hud.toast(`Watching ${t.name} · ${f.kills} elim${f.kills === 1 ? '' : 's'} · F for the next`);
}

/** Watch, flying free: from where someone fell (or from above the island, for someone who came in late). */
function spectate(p: Player, from?: Vec3) {
  p.spectate(true);
  p.freeze(false);
  if (from) p.teleport({ x: from.x, y: from.y + 4, z: from.z + 7 }, 0, -0.35);
  else p.teleport({ x: CENTER.x, y: 110, z: CENTER.z + 90 }, 0, -0.5);
}

// -------------------------------------------------------------------------------------------------
// The match
// -------------------------------------------------------------------------------------------------

function begin(game: GameContext) {
  match.phase = 'lobby';
  match.winner = null;
  match.busAt = 0;
  match.playingAt = 0;
  match.fighters.clear();
  lobbyLeft = LOBBY;
  humansBegan = 0;
  humansOutAt = 0;
  lying.length = 0;
  watched.clear();
  chests.reset();
  chutes.clear();
  supply.clear();
  bots.reset();
  zone = null;
  startedAt = game.clock.now;
  bus = new Bus(game, pickRoute(game));
  // People, then bots to fill the places.
  balanceBots(game);
  let seat = 0;
  for (const p of game.players) if (!isScout(p)) board(game, p, seat++);
  humansBegan = people(fighters()).length;
  // Anyone looking in from the home page sees the deck, the way the bus is facing: the island ahead.
  game.world.spawn = { ...bus.deckSpot(0), yaw: Math.atan2(-bus.route.dir[0], -bus.route.dir[1]) };
  game.hud.banner('BLOCK ROYALE', 'The bus leaves soon · bots fill the empty places', { color: '#ff8a2a', duration: 3 });
}

/** The bus leaves. */
function depart(game: GameContext) {
  if (!bus) return;
  match.phase = 'bus';
  match.busAt = game.clock.now;
  bus.sailing = true;
  game.hud.banner('DROP!', 'Step off the side of the bus · Space opens your parachute', { color: '#ff8a2a', duration: 4 });
  game.audio.play('wave');
  for (const p of humans(game)) {
    p.hud.toast('Walk off either side of the bus. Dive with W, Space for the parachute.');
    p.hud.marker('bus', null);
  }
}

/** Everyone's down, or the bus is over: the storm's calm starts. */
function startPlaying(game: GameContext) {
  if (match.phase !== 'bus') return;
  match.phase = 'playing';
  match.playingAt = game.clock.now;
  zone = new Zone(game);
  bus?.retire();
  sendBus(game, true);
  game.hud.banner('LOOT UP', 'Chests glow · press E to open one', { color: '#ffd23a', duration: 3 });
}

function finish(game: GameContext, winner: Fighter | null) {
  if (match.phase === 'over') return;
  match.phase = 'over';
  if (winner) {
    winner.placed = 1;
    match.winner = winner.player;
    winner.player.achieve('last_standing');
    if (winner.kills >= 5) winner.player.achieve('five_elims');
    game.fx.fireworks(winner.player.position, 6);
  }
  const total = fighters().length;
  game.hud.banner(winner ? `${winner.player.name.toUpperCase()} WINS` : 'NO WINNER', 'Back to the bus shortly', { color: '#ffd23a', duration: 5 });
  for (const f of fighters()) {
    const p = f.player;
    if (p.bot) continue;
    const won = f === winner;
    p.audio.play(won ? 'victory' : 'defeat');
    p.achieve('played');
    const secs = (f.diedAt >= 0 ? f.diedAt : game.clock.now) - startedAt;
    p.hud.screen({
      title: won ? 'LAST ONE STANDING!' : `#${f.placed || '–'}`,
      subtitle: won ? 'You won the match' : winner ? `${winner.player.name} won the match` : 'Nobody won',
      tone: won ? 'victory' : 'defeat',
      stats: [
        ['Placed', f.placed ? `${ordinal(f.placed)} of ${total}` : '–'],
        ['Eliminations', String(f.kills)],
        ['Damage', String(Math.round(f.damage))],
        ['Survived', clock(secs)],
      ],
      buttons: [
        { label: 'OK', primary: true, onClick: () => {} },
        { label: 'Exit', onClick: () => game.exit() },
      ],
    });
  }
  game.clock.after(RESULTS, () => game.restart());
}

/** Someone's out: their place, the feed, their loot on the ground; and the match may be over. */
function eliminate(game: GameContext, f: Fighter, by: Player | null, weapon: string, why: string) {
  if (!f.alive) return;
  const p = f.player;
  const before = alive().length;
  f.alive = false;
  f.placed = before;
  f.diedAt = game.clock.now;
  f.by = by?.name ?? why;
  f.with = weapon;
  const killer = by && by !== p ? fighterOf(by) : undefined;
  if (killer) {
    killer.kills++;
    if (!by!.bot) {
      by!.hud.pop(`ELIMINATED ${p.name.toUpperCase()}`, { color: '#ffd23a', big: true });
      by!.achieve('first_elim');
    }
  }
  if (killer)
    game.hud.feed([{ text: by!.name, color: '#ffd23a' }, weapon ? { icon: { item: weapon, view: 'side' as const } } : ' eliminated ', { text: p.name, color: '#ff8a7a' }]);
  else game.hud.feed([{ text: p.name, color: '#ff8a7a' }, ` ${why}`]);
  dropLoadout(game, p);
  f.shield = 0;
  // Where a person will watch from: beside whoever got them, if they're still about; else where they fell.
  const watchAt = by && !by.spectating && fighterOf(by)?.alive ? { ...by.position } : { ...p.position };
  if (p.bot) {
    bots.remove(p);
    game.clock.after(1.5, () => game.bots.remove(p));
  } else {
    humansOutAt = alive().some((x) => !x.player.bot) ? 0 : game.clock.now;
    // (Someone who's left the game has no screen to put results on.)
    if (why !== 'left the match')
      game.clock.after(1.8, () => {
        spectate(p, watchAt);
        if (match.phase === 'over') return;
        p.hud.screen({
          title: `#${f.placed}`,
          subtitle: killer ? `Eliminated by ${f.by}` : f.by,
          tone: 'defeat',
          stats: [
            ['Eliminations', String(f.kills)],
            ['Damage', String(Math.round(f.damage))],
            ['Survived', clock(f.diedAt - startedAt)],
          ],
          buttons: [
            { label: 'Keep watching', primary: true, onClick: () => p.hud.toast('F: watch the next fighter') },
            { label: 'Exit', onClick: () => game.exit() },
          ],
        });
      });
  }
  const left = alive();
  if (left.length <= 1 && match.phase !== 'lobby') finish(game, left[0] ?? null);
  // The field thinning: everyone still in it hears it (a moment later, so it doesn't cover an elimination's own pop).
  const n = left.length;
  if (MILESTONES.includes(n) && match.phase !== 'lobby' && match.phase !== 'over')
    game.clock.after(1.2, () => {
      if (alive().length !== n || match.phase === 'over') return;
      for (const f of alive()) if (!f.player.bot) f.player.hud.pop(n === 2 ? 'FINAL TWO' : `TOP ${n}`, { color: '#ffd23a', big: n <= 3, sub: `${n} fighters left` });
    });
}

// -------------------------------------------------------------------------------------------------
// Scout: loads the island before the bots need to walk it
// -------------------------------------------------------------------------------------------------

function startScout(game: GameContext) {
  if (bots.ready || scout) return;
  scout = game.bots.add(SCOUT);
  scout.spectate(true);
  scout.teleport(SCOUT_WAYPOINTS[0]);
  scoutAt = game.clock.now;
}

function scoutStep(game: GameContext) {
  if (!scout) return;
  const k = Math.floor((game.clock.now - scoutAt) / 2.2);
  if (k < SCOUT_WAYPOINTS.length) {
    const at = SCOUT_WAYPOINTS[k];
    if (Math.hypot(scout.position.x - at.x, scout.position.z - at.z) > 4) scout.teleport(at);
    return;
  }
  // Everything's loaded: build the walking grid now (it takes a moment), then the scout's work is done.
  const t = performance.now();
  bots.nav.build();
  if (import.meta.env.DEV) console.log(`[blockroyale] walking grid: ${bots.nav.size} cells in ${Math.round(performance.now() - t)} ms`);
  game.bots.remove(scout);
  scout = null;
}

// -------------------------------------------------------------------------------------------------
// HUD
// -------------------------------------------------------------------------------------------------

function refreshHud(game: GameContext) {
  const left = alive().length;
  let storm = '';
  let time = '';
  let tone = '';
  if (match.phase === 'lobby') {
    storm = 'Bus leaves in';
    time = clock(lobbyLeft);
    tone = 'calm';
  } else if (match.phase === 'bus') {
    storm = bus && bus.progress < 1 ? 'Bus over the island' : '';
    time = '';
    tone = 'calm';
  } else if (zone) {
    const d = zone.describe();
    [storm, time, tone] = [d.text, d.time > 0 ? clock(d.time) : '', d.tone];
  }
  for (const f of fighters()) {
    const p = f.player;
    if (p.bot) continue;
    const key = `${left}|${f.kills}|${storm}|${time}|${tone}|${Math.round(f.shield)}`;
    if (key === f.hudKey) continue;
    f.hudKey = key;
    p.hud.widget('status', { alive: left, kills: f.kills, storm, time, tone });
    p.hud.widget('vitals', { shield: Math.round(f.shield) });
  }
  // How to drop, while they're on the bus.
  for (const f of fighters()) {
    const p = f.player;
    if (p.bot) continue;
    const want = f.alive && f.drop === 'bus' && (match.phase === 'lobby' || match.phase === 'bus');
    const up = tipsUp.get(p.id);
    if (want && !up) tipsUp.set(p.id, p.hud.widget('tips', {}));
    else if (!want && up) {
      up.remove();
      tipsUp.delete(p.id);
    }
  }
  // While you're falling: how high you are.
  for (const f of fighters()) {
    if (f.player.bot) continue;
    const p = f.player;
    const air = f.alive && f.drop === 'air';
    const alt = air ? String(Math.max(0, Math.round(p.position.y - (game.world.surfaceY(p.position.x, p.position.z) + 1)))) : null;
    const key = alt ?? '';
    if (key !== altShown.get(p.id)) {
      altShown.set(p.id, key);
      p.hud.stat('alt', 'Altitude', alt);
    }
  }
  // Spectators and late arrivals see the status too.
  for (const p of humans(game)) {
    if (fighterOf(p)) continue;
    p.hud.widget('status', { alive: left, kills: 0, storm, time, tone });
  }
}

/** Where the bus is going and how far along: for each screen's map. */
function sendBus(game: GameContext, over = false) {
  if (!bus) return;
  const r = bus.route;
  const wire: BusWire = { from: [r.from.x, r.from.z], to: [r.to.x, r.to.z], seconds: r.seconds, t: bus.t, sailing: bus.sailing, over };
  game.clients.send('all', 'bus', wire);
  busSentAt = game.clock.now;
}

function scoreboard(game: GameContext) {
  const rows = fighters()
    .sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || a.placed - b.placed || b.kills - a.kills)
    .map((f) => ({ name: f.player.name, values: [f.kills, f.alive ? 'alive' : `#${f.placed}`], player: f.player, color: f.alive ? undefined : '#8a8f98' }));
  for (const p of game.players)
    if (!p.bot && !isScout(p)) p.hud.scoreboard({ title: 'Block Royale', columns: ['Elims', 'Status'], rows, footer: `${alive().length} left`, show: false });
}

// -------------------------------------------------------------------------------------------------
// The server
// -------------------------------------------------------------------------------------------------

export default defineServer(shared, {
  items: [throwables(), guns(), melee(), consumables()],

  setup(game) {
    defineItems(game);
    defineHud(game);
    prepareBus(game);
    prepareChutes(game);
    prepareSupply(game);
    chutes = new Chutes();
    supply = new Supply();
    chests = new Chests();
    bots = new Bots(game, { bus: () => bus, zone: () => zone, chests, scout: () => scout });
    // For poking at it from the browser's console (`__game.dev`), in development only.
    if (import.meta.env.DEV) (globalThis as unknown as { __br: unknown }).__br = { match, bots, chests, supply, zone: () => zone, bus: () => bus };

    // What lands: the shield takes it first (the storm goes straight through), and nobody's hurt in the lobby or in the air.
    game.events.on('damage', (hit) => {
      if (hit.target.kind !== 'player') return;
      const f = fighterOf(hit.target);
      if (!f) return;
      if (match.phase === 'lobby' || match.phase === 'over' || !f.alive || f.drop !== 'down') return hit.cancel();
      if (hit.cause === 'storm') return;
      // Your own frag hurts you, but only a quarter as much: a throw that bounces back isn't the end.
      if (hit.cause === 'explosion' && hit.source === hit.target) hit.amount *= 0.25;
      if (f.shield > 0) {
        const taken = Math.min(f.shield, hit.amount);
        f.shield -= taken;
        // (A hit the shield soaks up whole still has to register, so a sliver gets through.)
        hit.amount = Math.max(0.01, hit.amount - taken);
      }
    });
    game.events.on('playerDamage', ({ player, amount, source }) => {
      if (source && source !== 'world' && source.kind === 'player' && source !== player) {
        const s = fighterOf(source);
        if (s) s.damage += amount;
      }
    });
    game.events.on('playerDeath', ({ player, source, weapon }) => {
      const f = fighterOf(player);
      if (!f) return;
      const by = source && source !== 'world' && source.kind === 'player' ? source : null;
      eliminate(game, f, by, weapon ?? '', source === 'world' ? 'was lost to the storm' : 'was eliminated');
    });

    game.events.on('playerJoin', ({ player }) => {
      if (isScout(player)) return;
      // (Bots the roster adds are seated by whoever added them.)
      if (player.bot) return;
      if (match.phase === 'lobby' && bus) {
        humansBegan++;
        balanceBots(game);
        board(game, player, match.fighters.size);
      } else {
        spectate(player);
        player.hud.banner('MATCH IN PROGRESS', 'You play the next one · F to watch a fighter', { duration: 3 });
      }
    });
    game.events.on('playerLeave', ({ player }) => {
      tipsUp.delete(player.id);
      watched.delete(player.id);
      altShown.delete(player.id);
      const f = fighterOf(player);
      if (!f) return;
      if (match.phase === 'lobby') {
        match.fighters.delete(player.id);
        bots.remove(player);
        balanceBots(game);
        seatNewcomers(game);
      } else if (f.alive && match.phase !== 'over') eliminate(game, f, null, '', 'left the match');
    });
    game.events.on('ability', ({ player, name }) => {
      if (name === 'open') game.audio.play('whoosh', { at: player.position, volume: 0.7 });
      else if (name === 'dive') player.audio.play('whoosh', { volume: 0.6 });
    });

    // Cheats for trying things out (the development server and `--cheats`).
    game.commands.register('br', {
      help: 'Block Royale tools',
      cheat: true,
      usage: 'start | hold | land [site] | kit | storm | win | scout',
      complete: (args) => (args.length <= 1 ? ['start', 'hold', 'land', 'kit', 'storm', 'win', 'scout'] : args[0] === 'land' ? SITES.map((s) => s.name) : []),
      run(args, g, player) {
        const [cmd, arg] = args;
        if (cmd === 'start') {
          if (match.phase !== 'lobby') throw new Error('The bus has left');
          lobbyLeft = 0;
          return 'Departing';
        }
        if (cmd === 'hold') {
          hold = !hold;
          return hold ? 'The bus waits' : 'The bus goes on';
        }
        if (cmd === 'land') {
          const site = SITES.find((s) => s.name === arg?.toLowerCase().replace(/\s+/g, '')) ?? SITES[0];
          const f = fighterOf(player);
          if (f) f.drop = 'down';
          if (match.phase === 'lobby') depart(g);
          player.teleport({ x: site.cx + 0.5, y: site.ground + 3, z: site.cz + 6.5 });
          return `At ${site.label}`;
        }
        if (cmd === 'kit') {
          for (const id of ['trailblazer_epic', 'boomstick_rare', 'longshot_epic', 'zipper_legendary']) equip(player, id);
          equip(player, 'bandage', 8);
          equip(player, 'medkit', 2);
          equip(player, 'shield', 3);
          equip(player, 'frag', 4);
          player.inventory.select(SLOT.trailblazer);
          return 'Kitted out';
        }
        if (cmd === 'storm') {
          if (!zone) throw new Error('No storm yet');
          zone.storm.left = 0.01;
          return 'Skipped ahead';
        }
        if (cmd === 'win') {
          for (const f of alive()) if (f.player !== player) eliminate(g, f, player, 'trailblazer_legendary', 'was eliminated');
          return 'Done';
        }
        if (cmd === 'scout') {
          startScout(g);
          return 'Scouting';
        }
        throw new Error('Try: start, hold, land [site], kit, storm, win, scout');
      },
    });
  },

  start(game) {
    scout = null;
    begin(game);
    startScout(game);
  },

  update(game, dt) {
    const now = game.clock.now;
    scoutStep(game);
    // (Which chests the bots can walk to: a few a tick once the walking grid is built.)
    bots.prepare();
    if (!bus) return;
    bus.update(dt);
    const here = humans(game);

    switch (match.phase) {
      case 'lobby': {
        // The bus waits for the countdown (and for the walking grid, if it's still being made).
        if (here.length && !hold) lobbyLeft -= dt;
        if (lobbyLeft <= 0 && !scout) depart(game);
        break;
      }
      case 'bus': {
        // Anyone who's off the deck is in the air, and down once they land; when the last one's off (or the bus is over), the storm's calm starts.
        let aboard = 0;
        for (const f of alive()) {
          const p = f.player;
          if (f.drop === 'bus') {
            if (bus.carries(p) && bus.progress < 1) aboard++;
            else {
              f.drop = 'air';
              f.airAt = game.clock.now;
            }
          }
          if (f.drop === 'air' && !bus.carries(p) && landed(game, f)) {
            f.drop = 'down';
            p.protect(1.5);
          }
        }
        if (bus.progress >= 1 || aboard === 0) startPlaying(game);
        break;
      }
      case 'playing': {
        for (const f of alive()) if (f.drop === 'air' && landed(game, f)) f.drop = 'down';
        zone?.update(game, dt);
        // A supply drop with each new circle, inside it.
        if (zone?.storm.events.includes('announce') && zone.storm.next) supply.call(game, zone.storm.next);
        // A match with no people left in it is wound up.
        if (humansBegan > 0 && humansOutAt && now - humansOutAt > 12) {
          const left = alive().sort((a, b) => b.kills - a.kills);
          finish(game, left[0] ?? null);
        }
        break;
      }
      case 'over':
        break;
    }

    if (match.phase === 'bus' || match.phase === 'playing') {
      // Chests: opened with E; floor loot appears as people get near it.
      chests.update(
        game,
        here.filter((p) => fighterOf(p)?.alive && fighterOf(p)?.drop === 'down'),
      );
      chests.activate(
        game,
        alive().map((f) => f.player.position),
      );
    }
    chutes.update(game, alive());
    supply.update(game, dt, chests, (i) => bots.consider(i));
    if (match.phase !== 'over') bots.update(game, dt);
    // Someone out of it (or who came in late) jumps from fighter to fighter with F.
    if (match.phase !== 'lobby') for (const p of here) if (p.spectating && !fighterOf(p)?.alive && p.input.pressed('KeyF', { dead: true })) watchNext(p);
    if ((match.phase === 'lobby' || match.phase === 'bus') && now - busSentAt > 1) sendBus(game);
    refreshHud(game);
    if (now - boardAt > 1) {
      boardAt = now;
      scoreboard(game);
    }
  },
});
