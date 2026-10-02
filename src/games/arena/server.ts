import { defineServer, type GameContext, type Player } from '@platform';
import { bows, consumables, melee, throwables } from '@platform/kits';
import { defineArt, defineItems } from './items';
import { defineMonsters } from './monsters';
import { defineBosses } from './bosses';
import { Sprite } from './art';
import { shared } from './shared';
import { ROLL } from './abilities';
import { BLESSINGS, grant, listen as blessingsListen, offer, plainBody, reopen, resetBlessings, settle, wave as blessingsWave, type BlessingId } from './blessings';
import { bus, type RunResult } from './run/bus';
import { directorListen, dusk, finalWave, resetDirector, startWave, tick, TWISTS, waveName, waveSpec, type Twist } from './run/director';
import { kindHooks } from './run/spawn';
import { inFight, map, newRun, resetState, runs, state } from './run/state';
import { PARTS } from './parts';
import { resetGold } from './run/gold';
import { resetUsables } from './run/use';
import { catchUp, payWave } from './run/coins';
import { bledOut, standAll, standing } from './run/downed';
import { closeShop, openShop } from './run/shop';
import { CLASSES, classOf, closeClassMenus, hasChosen, showClassMenu } from './run/classes';
import { record, results } from './run/progression';
import { feat } from './run/hype';

/** Seconds between waves (the shop open, a blessing to choose). */
const INTERMISSION = 20;
/** Seconds to choose a class before the first wave; once everyone has, it's down to the last few. */
const CHOOSING = 14;
const LAST_SECONDS = 3.5;

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Each fighter's place round the middle of the map as a fight begins (or they arrive), facing in. */
function stand(p: Player, i: number, n: number) {
  const c = map().center;
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  const r = n > 1 ? 2 : 0;
  const at = { x: c.x + Math.cos(a) * r, y: c.y, z: c.z + Math.sin(a) * r };
  p.teleport(at, n > 1 ? Math.atan2(Math.cos(a), Math.sin(a)) : 0, 0);
}

/** The countdown to the first wave, everyone choosing a class meanwhile. */
function begin(game: GameContext) {
  state.phase = 'countdown';
  state.startedAt = game.clock.now;
  state.nextWaveAt = game.clock.now + CHOOSING;
  game.hud.banner('ARENA', `${map().name} · survive ${finalWave()} waves`, { duration: 2.8, color: '#ffb36b' });
  bus.emit('runStart', { map: map() });
  for (const p of game.players) showClassMenu(game, p);
}

/** The countdown's ticking: down to the last seconds once everyone's chosen, then the first wave. */
function countdown(game: GameContext) {
  const now = game.clock.now;
  if (game.players.every(hasChosen) && state.nextWaveAt - now > LAST_SECONDS) state.nextWaveAt = now + LAST_SECONDS;
  const t = Math.ceil(state.nextWaveAt - now);
  game.hud.objective(t > LAST_SECONDS ? `Choose your class · the first wave in ${t}s` : `The first wave in ${t}…`);
  beep(game, t);
  if (now >= state.nextWaveAt) {
    closeClassMenus();
    startWave(game, 1);
  }
}

function beep(game: GameContext, t: number) {
  if (t <= 3 && t > 0 && t !== state.lastBeep) {
    state.lastBeep = t;
    game.audio.play('countdown');
  }
}

function waveCleared(game: GameContext) {
  const n = state.wave;
  const final = n === finalWave() && !state.endless;
  const up = game.players.filter(standing);
  for (const p of game.players) {
    if (standing(p) && runs.get(p.id)?.hurt === false) {
      p.achieve('untouched');
      feat(p, 'untouched', `${p.name}: not a scratch`);
    }
    if (n === 1) p.achieve('first_wave');
  }
  // The rest of the party down, and one left standing to win it.
  if (game.players.length > 1 && up.length === 1) {
    feat(up[0], 'last_stand', `${up[0].name} won it alone!`);
    up[0].achieve('last_stand');
  }
  const bonus = payWave(game, n);
  bus.emit('waveCleared', { wave: n, final, endless: state.endless, bonus });
  standAll(game);
  for (const p of game.players) if (!p.alive) rejoin(game, p, !final);
  state.twist = null;
  state.boss = null;
  if (final) return victory(game);
  game.hud.banner('Wave cleared!', `+${bonus} gold each · the merchant is open`, { duration: 2.4, color: '#9dff8a' });
  game.audio.play('victory', { volume: 0.5 });
  intermission(game);
}

/** Between waves: a breather, a blessing to choose, the reward on the dais, the shop open. */
function intermission(game: GameContext) {
  state.phase = 'intermission';
  state.nextWaveAt = game.clock.now + INTERMISSION;
  for (const p of game.players) p.heal(6);
  // A blessing each, chosen from three.
  for (const p of game.players) offer(game, p);
  game.env.time = dusk(state.wave);
  openShop(game);
  // A reward for each fighter, in a ring on the dais: each can take only their own.
  const w = waveSpec(state.wave);
  const c = map().center;
  const rewards = game.players.flatMap((p) => (w.reward ?? []).map((r) => ({ ...r, p })));
  const radius = 1.2 + 0.4 * (game.players.length - 1);
  rewards.forEach((r, i) => {
    const a = (i / rewards.length) * Math.PI * 2;
    const at = { x: c.x + Math.cos(a) * radius, y: c.y + 0.5, z: c.z + Math.sin(a) * radius };
    game.items.spawnPickup(r.item, at, { count: r.count ?? 1, beam: '#ffd36b', despawn: 600, for: game.players.length > 1 ? r.p : undefined });
  });
}

/** Armed for the fight: their class's kit (`run/`), and gold to catch up if they're late; then the parts'. */
function arm(game: GameContext, p: Player) {
  plainBody(p);
  p.inventory.clear();
  runs.set(p.id, newRun(state.wave, game.clock.now, ''));
  const cleared = state.phase === 'fighting' ? state.wave - 1 : state.phase === 'intermission' || state.phase === 'victory' ? state.wave : 0;
  catchUp(game, p, cleared);
  for (const part of PARTS) part.arm?.(game, p);
  p.inventory.select(0);
}

/** Someone's out of the wave (bled out, or the last on their feet fell): they watch from the stands until it's won. */
function fall(game: GameContext, p: Player) {
  p.hud.banner('YOU FELL', "You'll be back when this wave is cleared", { duration: 3, color: '#ff6b6b' });
  game.hud.feed(`${p.name} has fallen`, { color: '#ff8a4c' });
  bus.emit('fell', { player: p });
  game.clock.after(1.5, () => {
    if (p.alive || !game.players.includes(p)) return;
    const { lookout: l, center: c } = map();
    const dx = c.x - l.x;
    const dz = c.z - l.z;
    p.teleport(l, Math.atan2(-dx, -dz), Math.atan2(c.y - l.y - 1.6, Math.hypot(dx, dz)));
    p.freeze(true);
  });
}

/** Back on the arena floor after sitting a wave out. */
function rejoin(game: GameContext, p: Player, announce: boolean) {
  p.revive();
  p.freeze(false);
  p.teleport(map().center, game.rng.range(0, Math.PI * 2), 0);
  bus.emit('rejoined', { player: p });
  if (!announce) return;
  p.hud.banner('BACK IN THE FIGHT', undefined, { duration: 1.6, color: '#9dff8a' });
  p.audio.play('heal');
}

/** Nobody's left on their feet: the arena wins. */
function checkWipe(game: GameContext) {
  if (game.players.length && !game.players.some(standing)) defeat(game);
}

/** The lines of a fighter's end screen. */
function statsFor(game: GameContext, r: RunResult | undefined): [string, string][] {
  const stats: [string, string][] = [
    ['Wave reached', state.wave > finalWave() ? `${state.wave} (endless)` : `${state.wave} of ${finalWave()}`],
    ['Time', fmtTime(game.clock.now - state.startedAt)],
  ];
  if (!r) return stats;
  const best = record(game);
  const party = game.players.length > 1;
  stats.push(
    ['Class', CLASSES[r.cls as keyof typeof CLASSES]?.name ?? r.cls],
    ['Monsters slain', party ? `${r.kills} of ${state.kills}` : String(r.kills)],
    ['Gold earned', String(r.gold)],
    ['XP', r.xp.level > r.xp.from ? `+${r.xp.earned} · level ${r.xp.from} → ${r.xp.level}` : `+${r.xp.earned} · level ${r.xp.level}`],
    ['Best wave here', r.newBest ? `${r.best} · new best!` : String(r.best)],
  );
  if (r.revives) stats.push(['Friends revived', String(r.revives)]);
  if (best) stats.push(['Arena record', `${best.wave} · ${best.names.slice(0, 3).join(', ')}`]);
  return stats;
}

/** Each fighter's own result screen (their own stats); closing any of them closes them all. */
const screens: (() => void)[] = [];
const closeScreens = () => {
  for (const close of screens.splice(0)) close();
};
let fireworks: (() => void) | null = null;

function victory(game: GameContext) {
  state.phase = 'victory';
  const done = results(game, true);
  bus.emit('runEnd', { won: true, wave: state.wave, endless: false, map: map(), time: game.clock.now - state.startedAt, results: done });
  for (const p of game.players) {
    p.achieve('champion');
    const r = runs.get(p.id);
    if (r && r.from === 0 && !r.fell) p.achieve('unbroken');
    if (!p.bot) {
      const won = new Set(p.store.get<string[]>('classWins') ?? []);
      won.add(classOf(p));
      p.store.set('classWins', [...won]);
      if (won.size >= Object.keys(CLASSES).length) p.achieve('class_act');
    }
  }
  game.hud.banner('VICTORY', 'The arena is yours', { duration: 3.5, color: '#ffd36b' });
  game.audio.play('victory');
  const c = map().center;
  const burst = () => game.fx.fireworks({ x: c.x, y: c.y, z: c.z }, 6);
  burst();
  fireworks = game.clock.every(1.1, burst);
  game.clock.after(3.2, () => {
    if (state.phase !== 'victory') return;
    for (const p of game.players) {
      screens.push(
        p.hud.screen({
          title: 'Victory!',
          subtitle: `You survived all ${finalWave()} waves and slew ${waveName(finalWave())}. Keep fighting for a best, or start again.`,
          tone: 'victory',
          icon: Sprite.golden_trophy,
          stats: statsFor(game, done.find((r) => r.player === p)),
          buttons: [
            { label: 'Keep fighting', primary: true, onClick: () => endless(game) },
            { label: 'Play again', onClick: () => game.restart() },
            { label: 'Switch game', onClick: () => game.exit() },
          ],
        }),
      );
    }
  });
}

/** On past the run's last wave: the endless waves, for a best. */
function endless(game: GameContext) {
  if (state.phase !== 'victory') return;
  closeScreens();
  fireworks?.();
  fireworks = null;
  state.endless = true;
  game.hud.banner('ENDLESS', 'How far can you go?', { duration: 2.6, color: '#c9a2ff' });
  intermission(game);
}

function defeat(game: GameContext) {
  if (state.phase === 'defeat' || state.phase === 'victory') return;
  state.phase = 'defeat';
  closeShop(game);
  const done = results(game, false);
  bus.emit('runEnd', { won: false, wave: state.wave, endless: state.endless, map: map(), time: game.clock.now - state.startedAt, results: done });
  game.audio.play('defeat');
  const who = game.players.length > 1 ? 'Your party' : 'You';
  game.clock.after(1.6, () => {
    for (const p of game.players) {
      screens.push(
        p.hud.screen({
          title: state.endless ? 'The Arena Claims You' : 'Defeated',
          subtitle: state.endless ? `${who} fell on endless wave ${state.wave}: ${waveName(state.wave)}.` : `${who} fell on wave ${state.wave}: ${waveName(state.wave)}.`,
          tone: state.endless ? 'neutral' : 'defeat',
          stats: statsFor(game, done.find((r) => r.player === p)),
          buttons: [
            { label: 'Try again', primary: true, onClick: () => game.restart() },
            { label: 'Switch game', onClick: () => game.exit() },
          ],
        }),
      );
    }
  });
}

/**
 * Arena: survive twenty waves in an arena, four bosses among them, then on into the endless waves
 * for a best. Earn gold from what you slay and spend it at the merchant's between waves or on the
 * mystery chest, choose a blessing after each wave, pick a class, win the crowd. Alone or together:
 * more fighters bring more monsters, a fighter at the end of their health goes down for a friend
 * to revive, and the fight is lost when nobody's left standing. Built entirely on the public
 * platform API.
 *
 * This file is the flow: the countdown, the waves and the time between them, falling and coming
 * back, victory, the endless waves and defeat. Its parts: `maps/` (where), `monsters/` and
 * `bosses/` (who), `run/` (the waves, `director.ts`; gold, the shop, the chest, the crowd, revives,
 * classes and levels, `part.ts`), `items/` and `blessings.ts`, `hud/`, and the screens' `client/`.
 * They talk on `run/bus.ts`.
 */
export default defineServer(shared, {
  // Its kinds of item: bows, swords and axes (and the bare fist), potions, bombs.
  items: [bows(), melee(), consumables(), throwables()],
  setup(game) {
    bus.clear();
    resetUsables();
    resetGold();
    resetState();
    resetDirector();
    runs.clear();
    resetBlessings();
    // (Its voices and its items' looks are each screen's, `client/`: played and named here.)
    defineArt(game);
    defineItems(game);
    defineMonsters(game);
    defineBosses(game);
    // Fighters never hurt each other (nor themselves): a bomb at your feet only throws monsters
    // about. First, so nothing after it takes a friend's blow for a real one.
    game.events.on('damage', (hit) => {
      if (hit.target.kind === 'player' && hit.source && hit.source !== 'world' && hit.source.kind === 'player') hit.cancel();
    });
    directorListen(game);
    blessingsListen(game);
    for (const part of PARTS) part.setup?.(game);
    // The dodge roll: untouchable for most of it, and a puff of sand.
    game.events.on('ability', ({ player, name }) => {
      if (name !== 'roll') return;
      player.protect(ROLL.safe);
      const q = player.position;
      game.fx.burst({ x: q.x, y: q.y + 0.2, z: q.z }, { color: '#d8c08a', count: 16, speed: 2.2, size: 0.18, gravity: -0.5, life: 0.6, drag: 2 });
      game.audio.play('whoosh', { at: q, volume: 0.6 });
    });
    game.events.on('entityDeath', ({ entity, killer, weapon }) => {
      if (entity.data.scenery) return;
      const by = killer && killer !== 'world' && killer.kind === 'player' ? killer : null;
      kindHooks(entity.type)?.slain?.(game, entity, by);
      bus.emit('slain', { entity, type: entity.type, by, weapon, at: { ...entity.position } });
    });
    game.events.on('entityDamage', ({ amount, source }) => {
      if (source === 'world' || source?.kind !== 'player') return;
      state.damageDealt += amount;
      const r = runs.get(source.id);
      if (r) r.damage += amount;
    });
    game.events.on('playerDamage', ({ player, amount }) => {
      state.damageTaken += amount;
      const r = runs.get(player.id);
      if (r) r.hurt = true;
    });
    game.events.on('playerDeath', ({ player }) => {
      if (!inFight()) return;
      const r = runs.get(player.id);
      if (r) {
        r.fell = true;
        if (!bledOut(player)) r.downs++;
      }
      if (game.players.some(standing)) fall(game, player);
      else defeat(game);
    });
    game.commands.register('bless', {
      usage: '<blessing>',
      help: 'Give yourself a blessing',
      cheat: true,
      complete: () => Object.keys(BLESSINGS),
      run: ([id], g, p) => {
        if (!(id in BLESSINGS)) return `Blessings: ${Object.keys(BLESSINGS).join(', ')}`;
        grant(g, p, id as BlessingId, true);
      },
    });
    game.commands.register('wave', {
      usage: '<n> [twist]',
      help: 'Skip to wave n (clears the arena; past the last, the endless waves), with a twist if named',
      cheat: true,
      complete: () => Object.keys(TWISTS),
      run: ([n, twist], g) => {
        const w = Math.max(1, Number(n) || 1);
        if (twist && !(twist in TWISTS)) return `Twists: ${Object.keys(TWISTS).join(', ')}`;
        for (const e of g.entities.all()) if (!e.data.scenery) e.remove();
        closeClassMenus();
        closeScreens();
        closeShop(g);
        state.queue = [];
        state.endless = w > finalWave();
        startWave(g, w, twist as Twist | undefined);
        return `Wave ${w}: ${waveName(w)}${twist ? ` · ${TWISTS[twist as Twist].name}` : ''}`;
      },
    });
    game.commands.register('win', {
      help: 'Win this wave (every monster in it slain)',
      cheat: true,
      run: (_, g, p) => {
        if (state.phase !== 'fighting') return 'No wave on';
        state.queue = [];
        for (const e of g.entities.all()) if (!e.data.scenery) e.damage(1e6, { source: p });
      },
    });
    game.events.on('playerJoin', ({ player }) => {
      // Before the fight, `start` arms everyone; after everyone left, the next one starts it.
      if (state.phase === 'intro') return;
      arm(game, player);
      stand(player, 0, 1);
      if (state.phase === 'waiting') return begin(game);
      player.hud.banner('ARENA', state.phase === 'fighting' ? `Joining wave ${state.wave}` : `Survive ${finalWave()} waves`, { duration: 2.4, color: '#ffb36b' });
      game.hud.feed(`${player.name} joins the fight`, { color: '#ffb36b' });
      if (inFight()) showClassMenu(game, player);
    });
    game.events.on('playerLeave', () => {
      // The last one out: the arena resets for whoever comes next.
      if (!game.players.length) {
        if (state.phase !== 'waiting' && state.phase !== 'intro') game.restart();
      } else if (inFight()) {
        checkWipe(game);
      }
    });
  },

  start(game) {
    resetState();
    resetGold();
    resetDirector();
    state.startedAt = game.clock.now;
    runs.clear();
    resetBlessings();
    screens.length = 0;
    fireworks = null;
    // The parts first: the maps' choose where this fight is.
    for (const part of PARTS) part.start?.(game);
    const c = map().center;
    game.world.spawn = { x: c.x, y: c.y + 0.05, z: c.z, yaw: 0 };
    game.env.time = map().time;
    if (!game.players.length) {
      state.phase = 'waiting';
      return;
    }
    game.players.forEach((p, i) => {
      arm(game, p);
      stand(p, i, game.players.length);
    });
    begin(game);
  },

  update(game, dt) {
    for (const part of PARTS) part.update?.(game, dt);
    if (state.phase === 'countdown') countdown(game);
    else if (state.phase === 'fighting') {
      const { left, cleared } = tick(game, dt);
      if (cleared) waveCleared(game);
      else game.hud.objective(`${state.endless ? `Endless wave ${state.wave}` : `Wave ${state.wave}/${finalWave()}`} · ${left} ${left === 1 ? 'enemy' : 'enemies'} left`);
    } else if (state.phase === 'intermission') {
      const t = Math.ceil(state.nextWaveAt - game.clock.now);
      game.hud.objective(`Next wave in ${t}s · the merchant's open · B for your blessing`);
      reopen(game);
      beep(game, t);
      if (game.clock.now >= state.nextWaveAt) {
        // Anyone who didn't choose a blessing is given one; Second Wind's back, the Bombardier's bombs.
        settle(game);
        blessingsWave(game);
        closeShop(game);
        startWave(game, state.wave + 1);
      }
    } else if (state.phase === 'victory' || state.phase === 'defeat') {
      game.hud.objective(null);
    }
    game.hud.stat('kills', 'Kills', state.kills);
    game.hud.stat('time', 'Time', fmtTime(Math.max(0, game.clock.now - state.startedAt)));
  },
});
