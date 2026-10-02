import type { GameContext, Player } from '@platform';
import type { ArenaPart } from '../part';
import { BLESSINGS, blessingsOf } from '../blessings';
import { bossKind } from '../bosses';
import { monsterKind } from '../monsters';
import { bus } from '../run/bus';
import { finalWave, TWISTS, WAVES, type Twist } from '../run/director';
import { addGold, gold } from '../run/gold';
import { map, state } from '../run/state';
import { END, endActions, endScreen, resetEnd, type EndRun } from './end';
import { MSG, type CallMsg, type CrowdMsg, type FighterState, type GoreMsg, type HitMsg, type MeMsg, type PartyMsg, type RunMsg, type WaveCard } from './messages';
import { Tallies } from './tally';

/**
 * The HUD's server part: it listens to the bus and the damage events and tells each screen what
 * its HUD shows (`messages.ts`; the screens draw it, `client/hud/`), only what's changed and no
 * more often than it needs: the fight (the wave, its twist or boss, the enemies left, the time to
 * the next), the crowd's hype, the party, each fighter's own (gold, blessings, down or out), and
 * the moments: callouts (the announcer), hits landed (hit markers, hit-stop), deaths (gore, the
 * crowd), a wave's card, and the end-of-run screen (`end.ts`), whose buttons play again or leave.
 * It keeps each fighter's tallies for those (`tally.ts`).
 */

const tallies = new Tallies();
/** What each screen was last sent, by message and screen (`all` or a player's id): only changes go. */
const sent = new Map<string, string>();
/** The fight's moments: when this wave began, the most monsters it's had at once. */
let waveAt = 0;
let waveTotal = 0;
/** The crowd's hype as the run's part last told it, and when the favour runs out. */
let hype = 0;
let favourUntil = 0;
/** When the next periodic sends are due, and when the crowd last cheered a boss hit. */
let partyAt = 0;
let meAt = 0;
let bossCheer = 0;
/** Deaths whose gore has gone out this second (a blast can fell a dozen). */
let goreBudget = { at: 0, n: 0 };
/** The run's over: how it went, for the end screen (and anyone who arrives to see it). */
let ended: EndRun | null = null;
/** Each kind of monster's blood and height (`MonsterKind`/`BossKind` definitions), looked up once. */
const kinds = new Map<string, { blood: string; height: number }>();

/** The Crowd's Favour lasts this long when the run's part doesn't say (seconds). */
const FAVOUR = 10;
/** At most this many deaths' gore a second (the rest are quiet: the platform's own burst still shows). */
const GORE_PER_SECOND = 10;

function send(game: GameContext, to: Player | 'all', name: string, data: unknown, force = false) {
  const key = `${name}@${to === 'all' ? 'all' : to.id}`;
  const json = JSON.stringify(data);
  if (!force && sent.get(key) === json) return;
  sent.set(key, json);
  game.clients.send(to, name, data);
}

/** A moment, not a state: sent every time. */
function tell(game: GameContext, to: Player | 'all', name: string, data: unknown) {
  if (to !== 'all' && to.bot) return;
  game.clients.send(to, name, data);
}

const call = (game: GameContext, to: Player | 'all', c: CallMsg) => tell(game, to, MSG.call, c);
const crowd = (game: GameContext, c: CrowdMsg) => tell(game, 'all', MSG.crowd, c);

function kindOf(game: GameContext, type: string) {
  let k = kinds.get(type);
  if (!k) {
    const def = (monsterKind(type) ?? bossKind(type))?.define(game);
    k = { blood: def?.bloodColor ?? '#b3261e', height: def?.hitbox.height ?? 1.9 };
    kinds.set(type, k);
  }
  return k;
}

/** Monsters still to beat this wave: those in the arena and those still to come. */
const leftNow = (game: GameContext) => (state.phase === 'fighting' ? game.entities.count() + state.queue.length : 0);

function runMsg(game: GameContext): RunMsg {
  const n = state.wave;
  const w = WAVES[Math.max(0, n - 1)];
  const twist = state.twist ? TWISTS[state.twist as Twist] : null;
  const boss = state.boss ? bossKind(state.boss) : undefined;
  const left = leftNow(game);
  waveTotal = Math.max(waveTotal, left);
  const now = game.clock.now;
  // The countdown to the first wave (three beats after a moment), or the break between waves.
  const next = state.phase === 'intermission' ? Math.max(0, Math.ceil(state.nextWaveAt - now)) : state.phase === 'countdown' ? Math.max(0, Math.ceil(state.startedAt + 4.5 - now)) : 0;
  return {
    phase: state.phase,
    wave: n,
    of: finalWave(),
    name: w?.name ?? '',
    left,
    total: Math.max(waveTotal, left),
    next,
    twist: twist ? { name: twist.name, text: twist.text, color: twist.color } : null,
    boss: boss ? { name: boss.name, title: boss.title, color: boss.color } : null,
    upcoming: upcoming(),
    map: map().id,
    mapName: map().name,
  };
}

/** The wave coming next, between waves and in the countdown to the first. */
function upcoming(): RunMsg['upcoming'] {
  if (state.phase !== 'intermission' && state.phase !== 'countdown') return null;
  const n = state.phase === 'countdown' ? 1 : state.wave + 1;
  const w = WAVES[n - 1];
  return w ? { wave: n, name: w.name, boss: !!w.boss } : null;
}

function fighterState(p: Player): FighterState {
  return p.alive ? 'up' : 'out';
}

function meMsg(p: Player): MeMsg {
  return {
    gold: gold(p),
    bless: blessingsOf(p).map((id) => {
      const b = BLESSINGS[id];
      return { name: b.name, text: b.text, icon: b.icon, color: '#f0c060' };
    }),
    state: fighterState(p),
    bleed: 0,
  };
}

function partyMsg(game: GameContext): PartyMsg {
  return {
    list: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      hp: p.maxHealth > 0 ? Math.round((Math.max(0, p.health) / p.maxHealth) * 40) / 40 : 0,
      max: p.maxHealth,
      state: fighterState(p),
      bleed: 0,
      cls: '',
      gold: gold(p),
    })),
  };
}

/** Everything a screen shows now, sent whole (a screen that's just come in, a fresh fight). */
function catchUp(game: GameContext, p: Player) {
  if (p.bot) return;
  for (const key of [...sent.keys()]) if (key.endsWith(`@${p.id}`)) sent.delete(key);
  game.clients.send(p, MSG.run, runMsg(game));
  game.clients.send(p, MSG.hype, hypeMsg(game));
  if (game.players.length > 1) game.clients.send(p, MSG.party, partyMsg(game));
  send(game, p, MSG.me, meMsg(p), true);
  if (ended) endScreen(p, ended, tallies);
}

const hypeMsg = (game: GameContext) => ({ v: Math.round(hype * 100) / 100, f: Math.max(0, Math.ceil(favourUntil - game.clock.now)) });

/** A wave won: each fighter's card (their part in it, the party's best, what's next). */
function waveCards(game: GameContext, wave: number) {
  const best = game.players.length > 1 ? tallies.waveBest() : null;
  const w = WAVES[wave];
  for (const p of game.players) {
    const t = tallies.waveOf(p.id);
    const card: WaveCard = {
      wave,
      name: WAVES[wave - 1]?.name ?? '',
      time: Math.round(game.clock.now - waveAt),
      kills: t.kills,
      gold: t.gold,
      damage: Math.round(t.damage),
      mvp: best ? { name: tallies.names.get(best.id) ?? '', kills: best.kills, you: best.id === p.id } : null,
      next: w ? { wave: wave + 1, name: w.name, boss: !!w.boss } : null,
    };
    tell(game, p, MSG.wave, card);
  }
}

/** A wave begins: the announcer says so (the final one, a boss's), and its twist after. */
function announceWave(game: GameContext, e: { wave: number; name: string; twist: string | null; boss: string | null; final: boolean }) {
  const boss = e.boss ? bossKind(e.boss) : undefined;
  const twist = e.twist ? TWISTS[e.twist as Twist] : null;
  if (e.final) call(game, 'all', { k: 'final', q: 'Final wave', t: `Wave ${e.wave}`, s: e.name, c: boss?.color ?? '#c9a2ff' });
  else if (boss) call(game, 'all', { k: 'boss', q: 'Boss wave', t: `Wave ${e.wave}`, s: e.name, c: boss.color });
  else call(game, 'all', { k: 'wave', q: e.wave > finalWave() ? 'Endless' : `Wave ${e.wave} of ${finalWave()}`, t: `Wave ${e.wave}`, s: e.name });
  if (twist) {
    const n = e.wave;
    game.clock.after(2.7, () => {
      if (state.wave === n && state.phase === 'fighting') call(game, 'all', { k: 'twist', q: 'Twist', t: twist.name, s: twist.text, c: twist.color });
    });
  }
}

export const hudPart: ArenaPart = {
  name: 'hudPart',

  setup(game) {
    // The end screen: its buttons play again or leave; closed, it comes back (there's nothing else to do).
    game.hud.define(END.name, {
      ...END.def,
      actions: endActions(game, () => {}),
      onClose: (p) => {
        if (ended) endScreen(p, ended, tallies);
      },
    });

    bus.on('runStart', () => {
      tallies.reset();
      for (const p of game.players) tallies.join(p);
      ended = null;
      waveTotal = 0;
    });

    bus.on('waveStart', (e) => {
      tallies.newWave();
      waveAt = game.clock.now;
      waveTotal = 0;
      announceWave(game, e);
    });

    bus.on('waveCleared', ({ wave }) => {
      crowd(game, { v: 0.8, r: 'cheer' });
      waveCards(game, wave);
    });

    bus.on('slain', ({ type, by, at }) => {
      const boss = !!bossKind(type);
      if (by) tallies.kill(by, game.clock.now, boss);
      // Gore for everyone (a few a second at most), and the crowd roars at a boss's fall.
      const now = game.clock.now;
      if (now - goreBudget.at >= 1) goreBudget = { at: now, n: 0 };
      if (boss || goreBudget.n++ < GORE_PER_SECOND) {
        const k = kindOf(game, type);
        const gore: GoreMsg = { at: [at.x, at.y, at.z], c: k.blood, s: k.height, ...(boss && { b: 1 as const }) };
        tell(game, 'all', MSG.gore, gore);
      }
      if (boss) crowd(game, { v: 1, r: 'roar' });
    });

    bus.on('gold', ({ player, delta, at }) => {
      tallies.gold(player, delta);
      tell(game, player, MSG.gold, { d: delta, ...(at && { at: [at.x, at.y, at.z] }) });
    });

    bus.on('hype', ({ value, favour }) => {
      hype = value;
      if (!favour) return;
      favourUntil = game.clock.now + FAVOUR;
      call(game, 'all', { k: 'favour', q: 'The crowd roars', t: "Crowd's Favour", s: 'Double gold · gifts from the emperor' });
      crowd(game, { v: 1, r: 'roar' });
    });

    bus.on('feat', ({ player, name, text }) => {
      const c: CallMsg = { k: 'feat', t: text, name };
      if (player) {
        call(game, player, c);
        for (const p of game.players) if (p !== player) p.hud.feed([{ text: player.name, color: '#f0c060' }, ` ${text.toLowerCase()}`]);
      } else call(game, 'all', c);
      crowd(game, { v: 0.6, r: 'cheer' });
    });

    bus.on('fell', ({ player }) => {
      call(game, player, { k: 'out', t: 'You fell', s: "You'll be back when this wave is cleared" });
      crowd(game, { v: 0.5, r: 'gasp' });
    });

    bus.on('rejoined', ({ player }) => {
      if (state.phase !== 'victory' && state.phase !== 'defeat') call(game, player, { k: 'back', t: 'Back in the fight' });
    });

    bus.on('runEnd', ({ won, wave }) => {
      ended = { won, wave, time: game.clock.now - state.startedAt, map: map().name, of: finalWave(), name: WAVES[Math.max(0, wave - 1)]?.name ?? '' };
      const run = ended;
      tell(game, 'all', MSG.end, { won, wave });
      crowd(game, { v: 1, r: won ? 'roar' : 'groan' });
      call(game, 'all', won ? { k: 'victory', q: map().name, t: 'Victory', s: 'The arena is yours' } : { k: 'defeat', q: `Wave ${wave}`, t: 'Defeated', s: 'The arena claims you' });
      game.clock.after(won ? 3.4 : 2.2, () => {
        if (ended !== run) return;
        for (const p of game.players) endScreen(p, run, tallies);
      });
    });

    game.events.on('entityDamage', ({ entity, amount, source }) => {
      if (!source || source === 'world' || source.kind !== 'player') return;
      tallies.damage(source, amount);
      const boss = !!bossKind(entity.type);
      if (!source.bot) {
        const hit: HitMsg = { e: entity.id, n: Math.round(amount * 10) / 10, h: Math.round(Math.min(1, amount / Math.max(6, entity.maxHealth * 0.4)) * 100) / 100 };
        if (!entity.alive || entity.health <= 0) hit.k = 1;
        if (boss) hit.b = 1;
        tell(game, source, MSG.hit, hit);
      }
      // The crowd cheers the blows on a boss, now and then.
      if (boss && game.clock.now - bossCheer > 2.5) {
        bossCheer = game.clock.now;
        crowd(game, { v: 0.35, r: 'cheer' });
      }
    });

    game.events.on('playerDamage', ({ player, amount }) => {
      tallies.taken(player, amount);
      // A big blow draws a gasp from the stands.
      if (player.maxHealth > 0 && amount >= player.maxHealth * 0.3) crowd(game, { v: 0.5, r: 'gasp' });
    });

    game.events.on('playerJoin', ({ player }) => tallies.join(player));
    game.events.on('playerReady', ({ player }) => catchUp(game, player));

    game.commands.register('hud', {
      usage: '<callout|card|end|gold|favour> [...]',
      help: 'Show a piece of the HUD (testing its look)',
      cheat: true,
      complete: () => ['callout', 'card', 'end', 'gold', 'favour', 'feat'],
      run: ([what, arg], g, p) => {
        if (what === 'card') return void waveCards(g, Math.max(1, state.wave));
        if (what === 'end') {
          const run: EndRun = { won: arg !== 'lose', wave: Math.max(1, state.wave), time: g.clock.now - state.startedAt, map: map().name, of: finalWave(), name: WAVES[Math.max(0, state.wave - 1)]?.name ?? '' };
          ended = run;
          return void endScreen(p, run, tallies);
        }
        if (what === 'gold') return void addGold(g, p, Number(arg) || 25, p.position);
        if (what === 'favour') return void bus.emit('hype', { value: 1, favour: true });
        if (what === 'feat') return void bus.emit('feat', { player: p, name: arg ?? 'triple_kill', text: (arg ?? 'triple_kill').replace(/_/g, ' ').toUpperCase() });
        return void call(g, p, { k: 'wave', q: 'Wave 7 of 20', t: 'Wave 7', s: 'The Swarm' });
      },
    });
  },

  start(game) {
    sent.clear();
    ended = null;
    resetEnd();
    hype = 0;
    favourUntil = 0;
    waveTotal = 0;
    tallies.reset();
    for (const p of game.players) {
      tallies.join(p);
      catchUp(game, p);
    }
  },

  update(game) {
    const now = game.clock.now;
    send(game, 'all', MSG.run, runMsg(game));
    if (now >= meAt) {
      meAt = now + 0.2;
      send(game, 'all', MSG.hype, hypeMsg(game));
      for (const p of game.players) if (!p.bot) send(game, p, MSG.me, meMsg(p));
    }
    if (now >= partyAt && game.players.length > 1) {
      partyAt = now + 0.25;
      send(game, 'all', MSG.party, partyMsg(game));
    }
  },
};
