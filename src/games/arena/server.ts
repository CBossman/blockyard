import { defineServer, type GameContext, type Player } from '@platform';
import { bows, consumables, melee, throwables } from '@platform/kits';
import { defineArt, defineItems } from './items';
import { defineMonsters } from './monsters';
import { defineBosses } from './bosses';
import { shared } from './shared';
import { ROLL } from './abilities';
import { BLESSINGS, grant, listen as blessingsListen, offer, plainBody, reopen, resetBlessings, settle, wave as blessingsWave, type BlessingId } from './blessings';
import { bus } from './run/bus';
import { directorListen, dusk, finalWave, startWave, tick, WAVES } from './run/director';
import { kindHooks } from './run/spawn';
import { inFight, map, resetState, runs, state } from './run/state';
import { PARTS } from './parts';
import { resetGold } from './run/gold';
import { resetUsables } from './run/use';

const INTERMISSION = 15;

/** The weapons Master of Arms asks for, by the item a monster was slain with. */
const ARMS: Record<string, string> = { bow: 'bow', wooden_sword: 'sword', stone_sword: 'sword', iron_sword: 'sword', diamond_sword: 'sword', pike: 'pike', battle_axe: 'axe' };
const ALL_ARMS = new Set(Object.values(ARMS)).size;
/** Monsters slain, all time, for Arena Veteran. */
const VETERAN_KILLS = 250;
/** What counts as a blast for Kaboom, and each fighter's run of blast kills (when the last was, how many). */
const BLASTS = new Set(['bomb', 'powder_keg', 'volatile', 'lightning']);
const blastKills = new Map<string, { at: number; n: number }>();

/** The countdown to the first wave. */
function begin(game: GameContext) {
  state.phase = 'countdown';
  state.startedAt = game.clock.now;
  bus.emit('runStart', { map: map() });
  let n = 3;
  const tickDown = () => {
    if (state.phase !== 'countdown') return;
    // (The HUD counts it down: `hud/part.ts`.)
    if (n > 0) {
      n--;
      game.clock.after(1, tickDown);
    } else {
      startWave(game, 1);
    }
  };
  game.clock.after(1.5, tickDown);
}

function waveCleared(game: GameContext) {
  const w = WAVES[state.wave - 1];
  const last = state.wave >= finalWave();
  for (const p of game.players) {
    if (p.alive && runs.get(p.id)?.hurt === false) p.achieve('untouched');
    if (state.wave === 1) p.achieve('first_wave');
  }
  for (const p of game.players) if (!p.alive) rejoin(game, p, !last);
  bus.emit('waveCleared', { wave: state.wave, final: last, endless: false, bonus: 0 });
  if (last) return victory(game);
  state.phase = 'intermission';
  state.nextWaveAt = game.clock.now + INTERMISSION;
  for (const p of game.players) p.heal(6);
  // A blessing each, chosen from three.
  for (const p of game.players) offer(game, p);
  state.twist = null;
  state.boss = null;
  game.env.time = dusk(state.wave);
  // A reward for each fighter, in a ring on the dais: each can take only their own.
  const c = map().center;
  const rewards = game.players.flatMap((p) => (w.reward ?? []).map((r) => ({ ...r, p })));
  const radius = 1.2 + 0.4 * (game.players.length - 1);
  rewards.forEach((r, i) => {
    const a = (i / rewards.length) * Math.PI * 2;
    const at = { x: c.x + Math.cos(a) * radius, y: c.y + 0.5, z: c.z + Math.sin(a) * radius };
    game.items.spawnPickup(r.item, at, { count: r.count ?? 1, beam: '#ffd36b', despawn: 600, for: game.players.length > 1 ? r.p : undefined });
  });
}

/** A starting sword, and (arriving late) the weapons and arrows the waves so far gave out; then the parts'. */
function arm(game: GameContext, p: Player) {
  plainBody(p);
  p.inventory.give('wooden_sword');
  runs.set(p.id, { from: state.wave, fell: false, hurt: state.phase === 'fighting', arms: new Set() });
  const cleared = state.phase === 'fighting' ? state.wave - 1 : state.phase === 'intermission' || state.phase === 'victory' ? state.wave : 0;
  for (const w of WAVES.slice(0, cleared)) {
    for (const r of w.reward ?? []) {
      if (r.item === 'arrow_bundle') p.inventory.give('arrow', 6 * (r.count ?? 1));
      else if (r.item === 'bomb_bundle') p.inventory.give('bomb', r.count ?? 1);
      else if (r.item !== 'health_potion') p.inventory.give(r.item);
    }
  }
  p.inventory.select(0);
  for (const part of PARTS) part.arm?.(game, p);
}

/** A monster slain by a fighter: what it earns them. */
function slain(game: GameContext, p: Player, type: string, weapon?: string) {
  p.achieve('first_blood');
  const all = (p.store.get<number>('kills') ?? 0) + 1;
  p.store.set('kills', all);
  if (all >= VETERAN_KILLS) p.achieve('veteran');
  const r = runs.get(p.id);
  const kind = weapon && ARMS[weapon];
  if (r && kind) {
    r.arms.add(kind);
    if (r.arms.size === ALL_ARMS) p.achieve('master_of_arms');
  }
  if (type === 'warden' && weapon === 'wooden_sword') p.achieve('splinters');
  if (type === 'goblin') p.achieve('pickpocket');
  // One blast (and what it sets off) felling four.
  if (weapon && BLASTS.has(weapon)) {
    const now = game.clock.now;
    const b = blastKills.get(p.id);
    const n = b && now - b.at < 0.4 ? b.n + 1 : 1;
    blastKills.set(p.id, { at: now, n });
    if (n >= 4) p.achieve('kaboom');
  }
}

/** Someone fell with others still fighting: they watch from the stands until the wave's won. */
function fall(game: GameContext, p: Player) {
  game.hud.feed(`${p.name} is down`, { color: '#ff8a4c' });
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
  p.audio.play('heal');
}

/** Everyone's down: the arena wins. */
function checkWipe(game: GameContext) {
  if (game.players.length && game.players.every((p) => !p.alive)) defeat();
}

function victory(game: GameContext) {
  state.phase = 'victory';
  bus.emit('runEnd', { won: true, wave: state.wave, endless: false, map: map(), time: game.clock.now - state.startedAt, results: [] });
  for (const p of game.players) {
    p.achieve('champion');
    const r = runs.get(p.id);
    if (r && r.from === 0 && !r.fell) p.achieve('unbroken');
  }
  // (The HUD announces it and puts up the end screen: `hud/part.ts`.)
  const c = map().center;
  const burst = () => game.fx.fireworks({ x: c.x, y: c.y, z: c.z }, 6);
  burst();
  game.clock.every(1.1, burst);
}

function defeat() {
  if (state.phase === 'defeat' || state.phase === 'victory') return;
  state.phase = 'defeat';
  bus.emit('runEnd', { won: false, wave: state.wave, endless: false, map: map(), time: 0, results: [] });
}

/**
 * Arena: survive the waves in a colosseum, collect better weapons and choose a blessing between
 * waves, and defeat the bosses. Alone or together: more fighters bring more monsters, anyone who
 * falls sits out the rest of the wave, and the fight is lost when everyone's down. Built entirely
 * on the public platform API.
 *
 * Its parts: `maps/` (where), `monsters/` and `bosses/` (who), `run/director.ts` (the waves),
 * `run/state.ts` (the fight as it stands), `run/bus.ts` (the Arena's own events, which the parts
 * listen to rather than calling each other), `items/`, `blessings.ts`, and the screens' `client/`.
 */
export default defineServer(shared, {
  // Its kinds of item: bows, swords and axes (and the bare fist), potions, bombs.
  items: [bows(), melee(), consumables(), throwables()],
  setup(game) {
    bus.clear();
    resetUsables();
    resetGold();
    resetState();
    runs.clear();
    blastKills.clear();
    resetBlessings();
    // (Its voices and its items' looks are each screen's, `client/`: played and named here.)
    defineArt(game);
    defineItems(game);
    defineMonsters(game);
    defineBosses(game);
    directorListen(game);
    blessingsListen(game);
    for (const part of PARTS) part.setup?.(game);
    // Fighters never hurt each other (nor themselves): a bomb at your feet only throws monsters about.
    game.events.on('damage', (hit) => {
      if (hit.target.kind === 'player' && hit.source && hit.source !== 'world' && hit.source.kind === 'player') hit.cancel();
    });
    // The dodge roll: untouchable for most of it, and a puff of sand.
    game.events.on('ability', ({ player, name }) => {
      if (name !== 'roll') return;
      player.protect(ROLL.safe);
      const q = player.position;
      game.fx.burst({ x: q.x, y: q.y + 0.2, z: q.z }, { color: '#d8c08a', count: 16, speed: 2.2, size: 0.18, gravity: -0.5, life: 0.6, drag: 2 });
      game.audio.play('whoosh', { at: q, volume: 0.6 });
    });
    game.events.on('entityDeath', ({ entity, killer, weapon }) => {
      const by = killer && killer !== 'world' && killer.kind === 'player' ? killer : null;
      kindHooks(entity.type)?.slain?.(game, entity, by);
      bus.emit('slain', { entity, type: entity.type, by, weapon, at: { ...entity.position } });
      if (!by) return;
      state.kills++;
      slain(game, by, entity.type, weapon);
    });
    game.events.on('entityDamage', ({ amount, source }) => {
      if (source !== 'world' && source?.kind === 'player') state.damageDealt += amount;
    });
    game.events.on('playerDamage', ({ player, amount }) => {
      state.damageTaken += amount;
      const r = runs.get(player.id);
      if (r) r.hurt = true;
    });
    game.events.on('playerDeath', ({ player }) => {
      if (!inFight()) return;
      const r = runs.get(player.id);
      if (r) r.fell = true;
      if (game.players.some((p) => p.alive)) fall(game, player);
      else defeat();
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
      usage: '<n>',
      help: 'Skip to wave n (clears the arena)',
      cheat: true,
      run: ([n], g) => {
        const w = Math.max(1, Math.min(finalWave(), Number(n) || 1));
        for (const e of g.entities.all()) e.remove();
        state.queue = [];
        startWave(g, w);
        return `Wave ${w}: ${WAVES[w - 1].name}`;
      },
    });
    game.events.on('playerJoin', ({ player }) => {
      // Before the fight, `start` arms everyone; after everyone left, the next one starts it.
      if (state.phase === 'intro') return;
      arm(game, player);
      if (state.phase === 'waiting') return begin(game);
      player.hud.banner('ARENA', state.phase === 'fighting' ? `Joining wave ${state.wave}` : `Survive ${finalWave()} waves`, { duration: 2.4, color: '#ffb36b' });
      game.hud.feed(`${player.name} joins the fight`, { color: '#ffb36b' });
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
    state.startedAt = game.clock.now;
    runs.clear();
    blastKills.clear();
    resetBlessings();
    game.env.time = map().time;
    for (const part of PARTS) part.start?.(game);
    if (!game.players.length) {
      state.phase = 'waiting';
      return;
    }
    for (const p of game.players) arm(game, p);
    begin(game);
  },

  update(game, dt) {
    for (const part of PARTS) part.update?.(game, dt);
    // (The HUD shows the wave, the enemies left and the time to the next: `hud/part.ts`.)
    if (state.phase === 'fighting') {
      if (tick(game, dt).cleared) waveCleared(game);
    } else if (state.phase === 'intermission') {
      reopen(game);
      if (game.clock.now >= state.nextWaveAt) {
        // Anyone who didn't choose a blessing is given one; Second Wind's back, the Bombardier's bombs.
        settle(game);
        blessingsWave(game);
        startWave(game, state.wave + 1);
      }
    }
  },
});
