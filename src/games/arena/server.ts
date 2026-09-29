import { defineServer, type Entity, type GameContext, type Player } from '@platform';
import { bows, consumables, melee, throwables } from '@platform/kits';
import { FLOOR, GATES, GATE_SPAWN_RADIUS } from './structure';
import { defineArt, defineItems, defineMonsters } from './content';
import { Sprite } from './art';
import { CENTER, shared } from './shared';
import { kegBlast } from './ai';
import { ROLL } from './abilities';
import { BLESSINGS, grant, listen, offer, plainBody, reopen, resetBlessings, settle, wave as blessingsWave, type BlessingId } from './blessings';

interface Wave {
  name: string;
  spawns: Record<string, number>;
  /** Reward dropped on the dais once the wave is cleared. */
  reward?: { item: string; count?: number }[];
}

const WAVES: Wave[] = [
  { name: 'The Dead Rise', spawns: { zombie: 5 }, reward: [{ item: 'bow' }, { item: 'arrow_bundle', count: 3 }] },
  { name: 'Bone Archers', spawns: { zombie: 4, skeleton: 2, sapper: 1 }, reward: [{ item: 'stone_sword' }, { item: 'health_potion' }, { item: 'bomb_bundle', count: 2 }] },
  { name: 'Crawlers', spawns: { spider: 5, zombie: 3, sapper: 2 }, reward: [{ item: 'iron_sword' }, { item: 'pike' }, { item: 'arrow_bundle', count: 2 }] },
  { name: 'Dark Rites', spawns: { necromancer: 2, zombie: 3, skeleton: 2, sapper: 1 }, reward: [{ item: 'health_potion' }, { item: 'bomb_bundle', count: 3 }, { item: 'arrow_bundle' }] },
  { name: 'The Brute', spawns: { brute: 1, skeleton: 3, zombie: 3, sapper: 2 }, reward: [{ item: 'battle_axe' }, { item: 'health_potion' }] },
  {
    name: 'The Horde',
    spawns: { zombie: 6, spider: 4, skeleton: 3, sapper: 2, necromancer: 1, brute: 1 },
    reward: [{ item: 'diamond_sword' }, { item: 'health_potion', count: 2 }, { item: 'arrow_bundle', count: 2 }, { item: 'bomb_bundle', count: 2 }],
  },
  { name: 'The Warden', spawns: { warden: 1, zombie: 2 } },
];

/**
 * A wave's twist: from the second wave on, most waves (never the Warden's) roll one, never the
 * same twice running, so no two fights go alike.
 */
const TWISTS = {
  blood_moon: { name: 'Blood Moon', text: 'They’re quicker tonight, and drop more hearts', color: '#ff5a5a' },
  powder: { name: 'Powder Keg', text: 'Sappers everywhere: stand back', color: '#ffb03a' },
  swarm: { name: 'The Swarm', text: 'Here come the spiders', color: '#a6e36a' },
  treasure: { name: 'Treasure Hunt', text: 'Goblins in the arena: catch them!', color: '#ffd23a' },
} as const;
type Twist = keyof typeof TWISTS;
const TWIST_CHANCE = 0.6;
/** Otherwise, a lone Treasure Goblin turns up this often in a wave. */
const GOBLIN_CHANCE = 0.35;

const MAX_ALIVE = 12;
const INTERMISSION = 15;
/** Where someone who's fallen watches from until the wave is over: high over the south stands. */
const LOOKOUT = { x: 0.5, y: FLOOR + 20, z: 31 };

/** `intro`: not begun. `waiting`: everyone left, and the next to arrive begins it afresh. */
type Phase = 'intro' | 'waiting' | 'countdown' | 'fighting' | 'intermission' | 'victory' | 'defeat';

const fresh = () => ({
  phase: 'intro' as Phase,
  wave: 0,
  queue: [] as string[],
  spawnTimer: 0,
  nextWaveAt: 0,
  kills: 0,
  damageDealt: 0,
  damageTaken: 0,
  startedAt: 0,
  lastBeep: 0,
  twist: null as Twist | null,
  lastTwist: null as Twist | null,
});
const state = fresh();

/**
 * Each fighter's own fight, for their achievements (by player id, from when they're armed): the
 * wave they joined in (0: from the start), whether they've fallen, whether they've been hurt this
 * wave, and the weapons they've slain with.
 */
interface Run {
  from: number;
  fell: boolean;
  hurt: boolean;
  arms: Set<string>;
}
const runs = new Map<string, Run>();

/** The weapons Master of Arms asks for, by the item a monster was slain with. */
const ARMS: Record<string, string> = { bow: 'bow', wooden_sword: 'sword', stone_sword: 'sword', iron_sword: 'sword', diamond_sword: 'sword', pike: 'pike', battle_axe: 'axe' };
const ALL_ARMS = new Set(Object.values(ARMS)).size;
/** Monsters slain, all time, for Arena Veteran. */
const VETERAN_KILLS = 250;
/** What counts as a blast for Kaboom, and each fighter's run of blast kills (when the last was, how many). */
const BLASTS = new Set(['bomb', 'powder_keg', 'volatile', 'lightning']);
const blastKills = new Map<string, { at: number; n: number }>();

/** Monsters per wave grow with the party: half as many again for each extra fighter. */
const crowd = (game: GameContext) => 1 + 0.5 * Math.max(0, game.players.length - 1);

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** This wave's twist, if it rolls one (never the first wave's, nor the Warden's, nor last wave's again). */
function rollTwist(game: GameContext, n: number): Twist | null {
  if (n === 1 || n === WAVES.length || !game.rng.chance(TWIST_CHANCE)) return null;
  const pool = (Object.keys(TWISTS) as Twist[]).filter((t) => t !== state.lastTwist);
  return game.rng.pick(pool);
}

function startWave(game: GameContext, n: number) {
  const w = WAVES[n - 1];
  state.wave = n;
  state.phase = 'fighting';
  state.queue = [];
  const twist = rollTwist(game, n);
  state.twist = twist;
  if (twist) state.lastTwist = twist;
  const spawns: Record<string, number> = { ...w.spawns };
  if (twist === 'powder') {
    // Half the dead are Sappers now, and one more besides.
    const turned = Math.ceil((spawns.zombie ?? 0) / 2);
    spawns.zombie = (spawns.zombie ?? 0) - turned;
    spawns.sapper = (spawns.sapper ?? 0) + turned + 1;
  }
  if (twist === 'swarm') spawns.spider = (spawns.spider ?? 0) + 4;
  const one = new Set(['warden', 'brute', 'goblin']);
  for (const [type, count] of Object.entries(spawns)) {
    const k = one.has(type) ? count : Math.round(count * crowd(game));
    for (let i = 0; i < k; i++) state.queue.push(type);
  }
  // Bosses make their entrance first; everything else arrives shuffled.
  const boss = state.queue.filter((t) => t === 'warden');
  const rest = state.queue.filter((t) => t !== 'warden').sort(() => game.rng.next() - 0.5);
  // Goblins turn up partway through, when the pit's busy.
  const goblins = twist === 'treasure' ? 2 : n > 1 && n < WAVES.length && game.rng.chance(GOBLIN_CHANCE) ? 1 : 0;
  for (let i = 0; i < goblins; i++) rest.splice(Math.floor(rest.length * (0.3 + 0.4 * game.rng.next())), 0, 'goblin');
  state.queue = [...boss, ...rest];
  state.spawnTimer = 1.2;
  for (const r of runs.values()) r.hurt = false;
  // Anyone who didn't choose a blessing is given one; Second Wind's back, the Bombardier's bombs.
  settle(game);
  blessingsWave(game);
  const t = twist && TWISTS[twist];
  game.hud.banner(n === WAVES.length ? 'Final Wave' : `Wave ${n}`, t ? `${w.name} · ${t.name}!` : w.name, { duration: 2.6, color: n === WAVES.length ? '#c9a2ff' : t?.color });
  if (t) game.clock.after(2.8, () => state.wave === n && state.phase === 'fighting' && game.hud.banner(t.name, t.text, { duration: 2.4, color: t.color }));
  game.audio.play('wave');
  // Dusk falls as the fight goes on; a Blood Moon brings the night.
  game.env.time = twist === 'blood_moon' ? 0.82 : 0.66 + (n - 1) * 0.011;
}

/** The banner and countdown to the first wave. */
function begin(game: GameContext) {
  state.phase = 'countdown';
  state.startedAt = game.clock.now;
  game.hud.banner('ARENA', `Survive ${WAVES.length} waves`, { duration: 2.8, color: '#ffb36b' });
  let n = 3;
  const tick = () => {
    if (n > 0) {
      game.hud.objective(`First wave in ${n}…`);
      game.audio.play('countdown');
      n--;
      game.clock.after(1, tick);
    } else {
      startWave(game, 1);
    }
  };
  game.clock.after(1.5, tick);
}

function spawnNext(game: GameContext) {
  const type = state.queue.shift();
  if (!type) return;
  const gate = game.rng.pick(GATES);
  const r = type === 'warden' ? GATE_SPAWN_RADIUS - 5 : GATE_SPAWN_RADIUS + game.rng.range(-1.5, 1.5);
  const side = game.rng.range(-1.5, 1.5);
  const pos = { x: Math.cos(gate) * r - Math.sin(gate) * side, y: FLOOR + 1.05, z: Math.sin(gate) * r + Math.cos(gate) * side };
  const e = game.entities.spawn(type, pos, { yaw: gate + Math.PI });
  if (state.twist === 'blood_moon' && type !== 'goblin') {
    e.data.speed = 1.25;
    e.setSpeed(1.25);
  }
  game.fx.burst({ x: pos.x, y: pos.y + 1, z: pos.z }, { color: type === 'warden' ? '#a26bff' : type === 'goblin' ? '#ffd23a' : '#8fd6ff', count: 24, speed: 2.5, gravity: -1 });
  game.audio.play(type === 'warden' ? 'boss' : 'spawn', { at: pos, volume: type === 'warden' ? 1.4 : 0.8 });
  if (type === 'warden') game.fx.shake(0.2, 1.2);
  if (type === 'goblin') {
    game.hud.pop('Treasure Goblin!', { color: '#ffd23a', sub: 'Catch it before it gets away' });
    game.hud.marker(`goblin:${e.id}`, e, { color: '#ffd23a', shape: 'diamond', label: 'Treasure', edge: true, offset: { x: 0, y: 1.5, z: 0 } });
    game.audio.play('goblin', { at: pos, volume: 1.2 });
  }
}

/** A Treasure Goblin reached its gate: gone, and its loot with it. */
function goblinEscaped(game: GameContext, e: Entity) {
  const q = e.position;
  game.fx.burst({ x: q.x, y: q.y + 0.8, z: q.z }, { color: '#ffd23a', count: 30, speed: 3, gravity: -1, glow: 1 });
  game.audio.play('goblin', { at: q, pitch: 1.2 });
  game.hud.marker(`goblin:${e.id}`, null);
  game.hud.feed('The Treasure Goblin got away!', { color: '#ffd23a' });
  e.remove();
}

function waveCleared(game: GameContext) {
  const w = WAVES[state.wave - 1];
  const last = state.wave >= WAVES.length;
  for (const p of game.players) {
    if (p.alive && runs.get(p.id)?.hurt === false) p.achieve('untouched');
    if (state.wave === 1) p.achieve('first_wave');
  }
  for (const p of game.players) if (!p.alive) rejoin(game, p, !last);
  if (last) return victory(game);
  state.phase = 'intermission';
  state.nextWaveAt = game.clock.now + INTERMISSION;
  game.hud.banner('Wave cleared!', w.reward ? 'A reward awaits on the dais' : undefined, { duration: 2.4, color: '#9dff8a' });
  game.audio.play('victory', { volume: 0.5 });
  for (const p of game.players) p.heal(6);
  // A blessing each, chosen from three.
  for (const p of game.players) offer(game, p);
  state.twist = null;
  game.env.time = 0.66 + (state.wave - 1) * 0.011;
  // A reward for each fighter, in a ring on the dais: each can take only their own.
  const rewards = game.players.flatMap((p) => (w.reward ?? []).map((r) => ({ ...r, p })));
  const radius = 1.2 + 0.4 * (game.players.length - 1);
  rewards.forEach((r, i) => {
    const a = (i / rewards.length) * Math.PI * 2;
    const at = { x: CENTER.x + Math.cos(a) * radius, y: CENTER.y + 0.5, z: CENTER.z + Math.sin(a) * radius };
    game.items.spawnPickup(r.item, at, { count: r.count ?? 1, beam: '#ffd36b', despawn: 600, for: game.players.length > 1 ? r.p : undefined });
  });
}

/** A starting sword, and (arriving late) the weapons and arrows the waves so far gave out. */
function arm(p: Player) {
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
  p.hud.banner('YOU FELL', "You'll be back when this wave is cleared", { duration: 3, color: '#ff6b6b' });
  game.hud.feed(`${p.name} is down`, { color: '#ff8a4c' });
  game.clock.after(1.5, () => {
    if (p.alive || !game.players.includes(p)) return;
    p.teleport(LOOKOUT, 0, -0.62);
    p.freeze(true);
  });
}

/** Back on the arena floor after sitting a wave out. */
function rejoin(game: GameContext, p: Player, announce: boolean) {
  p.revive();
  p.freeze(false);
  p.teleport(CENTER, game.rng.range(0, Math.PI * 2), 0);
  if (!announce) return;
  p.hud.banner('BACK IN THE FIGHT', undefined, { duration: 1.6, color: '#9dff8a' });
  p.audio.play('heal');
}

/** Everyone's down: the arena wins. */
function checkWipe(game: GameContext) {
  if (game.players.length && game.players.every((p) => !p.alive)) defeat(game);
}

function victory(game: GameContext) {
  state.phase = 'victory';
  for (const p of game.players) {
    p.achieve('champion');
    const r = runs.get(p.id);
    if (r && r.from === 0 && !r.fell) p.achieve('unbroken');
  }
  const time = game.clock.now - state.startedAt;
  game.hud.banner('VICTORY', 'The arena is yours', { duration: 3.5, color: '#ffd36b' });
  game.audio.play('victory');
  const burst = () => game.fx.fireworks({ x: 0, y: FLOOR + 2, z: 0 }, 6);
  burst();
  game.clock.every(1.1, burst);
  game.clock.after(3.2, () =>
    game.hud.screen({
      title: 'Victory!',
      subtitle: 'You defeated the Warden and conquered the arena.',
      tone: 'victory',
      icon: Sprite.golden_trophy,
      stats: [
        ['Time', fmtTime(time)],
        ['Monsters slain', String(state.kills)],
        ['Damage dealt', String(Math.round(state.damageDealt))],
        ['Damage taken', String(Math.round(state.damageTaken))],
      ],
      buttons: [
        { label: 'Play again', primary: true, onClick: () => game.restart() },
        { label: 'Switch game', onClick: () => game.exit() },
      ],
    }),
  );
}

function defeat(game: GameContext) {
  if (state.phase === 'defeat' || state.phase === 'victory') return;
  state.phase = 'defeat';
  game.audio.play('defeat');
  const who = game.players.length > 1 ? 'Your party' : 'You';
  game.clock.after(1.6, () =>
    game.hud.screen({
      title: 'Defeated',
      subtitle: `${who} fell on wave ${state.wave}: ${WAVES[Math.max(0, state.wave - 1)].name}.`,
      tone: 'defeat',
      stats: [
        ['Wave reached', `${state.wave} / ${WAVES.length}`],
        ['Monsters slain', String(state.kills)],
        ['Time survived', fmtTime(game.clock.now - state.startedAt)],
      ],
      buttons: [
        { label: 'Try again', primary: true, onClick: () => game.restart() },
        { label: 'Switch game', onClick: () => game.exit() },
      ],
    }),
  );
}

/**
 * Arena: survive seven waves of monsters in a colosseum, collect better weapons and choose a
 * blessing between waves, and defeat the Warden. Most waves roll a twist (a Blood Moon, a swarm,
 * Sappers everywhere, Treasure Goblins to catch). Alone or together: more fighters bring more
 * monsters, anyone who falls sits out the rest of the wave, and the fight is lost when everyone's
 * down. Built entirely on the public platform API.
 */
export default defineServer(shared, {
  // Its kinds of item: bows, swords and axes (and the bare fist), potions, bombs.
  items: [bows(), melee(), consumables(), throwables()],
  setup(game) {
    Object.assign(state, fresh());
    runs.clear();
    blastKills.clear();
    resetBlessings();
    // (Its voices and its items' looks are each screen's, `client/`: played and named here.)
    defineArt(game);
    defineItems(game);
    defineMonsters(game, (e) => goblinEscaped(game, e));
    // Fighters never hurt each other (nor themselves): a bomb at your feet only throws monsters about.
    game.events.on('damage', (hit) => {
      if (hit.target.kind === 'player' && hit.source && hit.source !== 'world' && hit.source.kind === 'player') hit.cancel();
    });
    listen(game);
    // The dodge roll: untouchable for most of it, and a puff of sand.
    game.events.on('ability', ({ player, name }) => {
      if (name !== 'roll') return;
      player.protect(ROLL.safe);
      const q = player.position;
      game.fx.burst({ x: q.x, y: q.y + 0.2, z: q.z }, { color: '#d8c08a', count: 16, speed: 2.2, size: 0.18, gravity: -0.5, life: 0.6, drag: 2 });
      game.audio.play('whoosh', { at: q, volume: 0.6 });
    });
    game.events.on('entityDeath', ({ entity, killer }) => {
      const q = { ...entity.position };
      const by = killer && killer !== 'world' && killer.kind === 'player' ? killer : undefined;
      // A slain Sapper drops its keg, and it goes off a moment later where it fell.
      if (entity.type === 'sapper') {
        game.audio.play('fuse', { at: q, pitch: 1.4 });
        game.clock.after(0.45, () => kegBlast(game, q, by ?? 'world', true));
      }
      if (entity.type === 'goblin') {
        game.hud.marker(`goblin:${entity.id}`, null);
        game.audio.play('coins', { at: q, volume: 1.3 });
        game.fx.burst({ x: q.x, y: q.y + 0.8, z: q.z }, { color: '#ffd23a', count: 60, speed: 6, gravity: 10, glow: 1 });
        if (by) game.hud.feed(`${by.name} caught the Treasure Goblin!`, { color: '#ffd23a' });
      }
      // Under a Blood Moon, hearts fall more often.
      if (state.twist === 'blood_moon' && by && entity.type !== 'goblin' && game.rng.chance(0.15)) {
        game.items.spawnPickup('heart', { x: q.x, y: q.y + 0.5, z: q.z }, { despawn: 30 });
      }
    });
    game.events.on('entityDeath', ({ entity, killer, weapon }) => {
      if (killer === 'world' || killer?.kind !== 'player') return;
      state.kills++;
      slain(game, killer, entity.type, weapon);
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
      if (state.phase !== 'countdown' && state.phase !== 'fighting' && state.phase !== 'intermission') return;
      const r = runs.get(player.id);
      if (r) r.fell = true;
      if (game.players.some((p) => p.alive)) fall(game, player);
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
    game.events.on('playerJoin', ({ player }) => {
      // Before the fight, `start` arms everyone; after everyone left, the next one starts it.
      if (state.phase === 'intro') return;
      arm(player);
      if (state.phase === 'waiting') return begin(game);
      player.hud.banner('ARENA', state.phase === 'fighting' ? `Joining wave ${state.wave}` : `Survive ${WAVES.length} waves`, { duration: 2.4, color: '#ffb36b' });
      game.hud.feed(`${player.name} joins the fight`, { color: '#ffb36b' });
    });
    game.events.on('playerLeave', () => {
      // The last one out: the arena resets for whoever comes next.
      if (!game.players.length) {
        if (state.phase !== 'waiting' && state.phase !== 'intro') game.restart();
      } else if (state.phase === 'countdown' || state.phase === 'fighting' || state.phase === 'intermission') {
        checkWipe(game);
      }
    });
  },

  start(game) {
    Object.assign(state, fresh(), { startedAt: game.clock.now });
    runs.clear();
    blastKills.clear();
    resetBlessings();
    game.env.time = 0.66;
    if (!game.players.length) {
      state.phase = 'waiting';
      return;
    }
    for (const p of game.players) arm(p);
    begin(game);
  },

  update(game, dt) {
    const alive = game.entities.count();
    if (state.phase === 'fighting') {
      state.spawnTimer -= dt;
      if (state.queue.length > 0 && alive < MAX_ALIVE && state.spawnTimer <= 0) {
        spawnNext(game);
        state.spawnTimer = state.wave === WAVES.length ? 2.5 : 0.9;
      }
      if (state.queue.length === 0 && alive === 0) waveCleared(game);
      const left = alive + state.queue.length;
      game.hud.objective(`Wave ${state.wave}/${WAVES.length} · ${left} ${left === 1 ? 'enemy' : 'enemies'} left`);
    } else if (state.phase === 'intermission') {
      const t = Math.ceil(state.nextWaveAt - game.clock.now);
      game.hud.objective(`Next wave in ${t}s — choose a blessing, grab the reward on the dais`);
      reopen(game);
      if (t <= 3 && t > 0 && t !== state.lastBeep) {
        state.lastBeep = t;
        game.audio.play('countdown');
      }
      if (game.clock.now >= state.nextWaveAt) startWave(game, state.wave + 1);
    } else if (state.phase === 'victory') {
      game.hud.objective(null);
    }
    game.hud.stat('kills', 'Kills', state.kills);
    game.hud.stat('time', 'Time', fmtTime(Math.max(0, game.clock.now - state.startedAt)));
  },
});
