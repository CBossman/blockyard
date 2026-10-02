import type { GameContext } from '@platform';
import { along } from '../maps';
import { MONSTERS, monsterKind } from '../monsters';
import { bossKind } from '../bosses';
import { bus } from './bus';
import { spawnMonster } from './spawn';
import { map, runs, state } from './state';

/**
 * The director: what each wave brings, its twist, and bringing it in. A wave is a scripted roster
 * (always these), plus a budget it fills from whatever kinds may come by then (`MonsterKind.cost`,
 * `from`, `weight`), plus maybe a boss (`bosses/`) with its escort. The server starts waves and
 * calls `tick`; everything else hears of it on the bus.
 */
export interface WaveSpec {
  name: string;
  /** Always brings these (types and counts, before party size). */
  roster?: Record<string, number>;
  /** And this much more, filled from the kinds that may come by now (a zombie costs 1). */
  budget?: number;
  /** A boss wave's boss (a `BossKind` id); it comes in first. */
  boss?: string;
  /** Dropped on the dais once it's cleared, one set for each fighter. */
  reward?: { item: string; count?: number }[];
  /** No twist this wave (boss waves never have one). */
  calm?: boolean;
}

export const WAVES: WaveSpec[] = [
  { name: 'The Dead Rise', roster: { zombie: 5 }, calm: true, reward: [{ item: 'bow' }, { item: 'arrow_bundle', count: 3 }] },
  { name: 'Bone Archers', roster: { zombie: 4, skeleton: 2, sapper: 1 }, reward: [{ item: 'stone_sword' }, { item: 'health_potion' }, { item: 'bomb_bundle', count: 2 }] },
  { name: 'Crawlers', roster: { spider: 5, zombie: 3, sapper: 2 }, reward: [{ item: 'iron_sword' }, { item: 'pike' }, { item: 'arrow_bundle', count: 2 }] },
  { name: 'Dark Rites', roster: { necromancer: 2, zombie: 3, skeleton: 2, sapper: 1 }, reward: [{ item: 'health_potion' }, { item: 'bomb_bundle', count: 3 }, { item: 'arrow_bundle' }] },
  { name: 'The Brute', roster: { brute: 1, skeleton: 3, zombie: 3, sapper: 2 }, reward: [{ item: 'battle_axe' }, { item: 'health_potion' }] },
  {
    name: 'The Horde',
    roster: { zombie: 6, spider: 4, skeleton: 3, sapper: 2, necromancer: 1, brute: 1 },
    reward: [{ item: 'diamond_sword' }, { item: 'health_potion', count: 2 }, { item: 'arrow_bundle', count: 2 }, { item: 'bomb_bundle', count: 2 }],
  },
  { name: 'The Warden', boss: 'warden' },
];

export const finalWave = () => WAVES.length;

/** A wave's twist: from the second wave on, most waves roll one, never the same twice running. */
export const TWISTS = {
  blood_moon: { name: 'Blood Moon', text: 'They’re quicker tonight, and drop more hearts', color: '#ff5a5a' },
  powder: { name: 'Powder Keg', text: 'Sappers everywhere: stand back', color: '#ffb03a' },
  swarm: { name: 'The Swarm', text: 'Here come the spiders', color: '#a6e36a' },
  treasure: { name: 'Treasure Hunt', text: 'Goblins in the arena: catch them!', color: '#ffd23a' },
} as const;
export type Twist = keyof typeof TWISTS;
const TWIST_CHANCE = 0.6;
/** Otherwise, a lone Treasure Goblin turns up this often in a wave. */
const GOBLIN_CHANCE = 0.35;

/** At most this many monsters in the arena at once; the rest wait their turn. */
export const MAX_ALIVE = 12;

/** Monsters per wave grow with the party: half as many again for each extra fighter. */
export const crowd = (game: GameContext) => 1 + 0.5 * Math.max(0, game.players.length - 1);

function rollTwist(game: GameContext, n: number, w: WaveSpec): Twist | null {
  if (w.calm || w.boss || n === finalWave() || !game.rng.chance(TWIST_CHANCE)) return null;
  const pool = (Object.keys(TWISTS) as Twist[]).filter((t) => t !== state.lastTwist);
  return game.rng.pick(pool);
}

/** Fill `budget` from the kinds that may come by wave `n`, weighted, keeping to each kind's `max`. */
function fill(game: GameContext, n: number, budget: number, counts: Record<string, number>) {
  const pool = MONSTERS.filter((m) => (m.weight ?? 1) > 0 && m.cost > 0 && m.from <= n);
  let left = budget;
  for (let guard = 0; guard < 200 && left > 0; guard++) {
    const can = pool.filter((m) => m.cost <= left + 0.5 && (m.max === undefined || (counts[m.id] ?? 0) < m.max));
    if (!can.length) break;
    const total = can.reduce((a, m) => a + (m.weight ?? 1), 0);
    let r = game.rng.next() * total;
    const pick = can.find((m) => (r -= m.weight ?? 1) <= 0) ?? can[can.length - 1];
    counts[pick.id] = (counts[pick.id] ?? 0) + 1;
    left -= pick.cost;
  }
}

/** Wave `n` begins: what it brings is queued (the boss first, goblins partway), and everyone told. */
export function startWave(game: GameContext, n: number) {
  const w = WAVES[n - 1];
  state.wave = n;
  state.phase = 'fighting';
  const twist = rollTwist(game, n, w);
  state.twist = twist;
  if (twist) state.lastTwist = twist;
  state.boss = w.boss ?? null;
  const counts: Record<string, number> = { ...w.roster, ...(w.boss ? bossKind(w.boss)?.escort : {}) };
  if (w.budget) fill(game, n, w.budget, counts);
  if (twist === 'powder') {
    // Half the dead are Sappers now, and one more besides.
    const turned = Math.ceil((counts.zombie ?? 0) / 2);
    counts.zombie = (counts.zombie ?? 0) - turned;
    counts.sapper = (counts.sapper ?? 0) + turned + 1;
  }
  if (twist === 'swarm') counts.spider = (counts.spider ?? 0) + 4;
  const queue: string[] = [];
  for (const [type, count] of Object.entries(counts)) {
    // (A roster may name a kind that isn't in the game yet: it's left out.)
    if (!monsterKind(type) && !bossKind(type)) continue;
    const k = monsterKind(type)?.single ? count : Math.round(count * crowd(game));
    for (let i = 0; i < k; i++) queue.push(type);
  }
  // Everything arrives shuffled; goblins turn up partway through, when the pit's busy.
  const rest = queue.sort(() => game.rng.next() - 0.5);
  const goblins = twist === 'treasure' ? 2 : n > 1 && n < finalWave() && !w.boss && game.rng.chance(GOBLIN_CHANCE) ? 1 : 0;
  for (let i = 0; i < goblins; i++) rest.splice(Math.floor(rest.length * (0.3 + 0.4 * game.rng.next())), 0, 'goblin');
  state.queue = w.boss && bossKind(w.boss) ? [w.boss, ...rest] : rest;
  state.spawnTimer = 1.2;
  for (const r of runs.values()) r.hurt = false;

  const final = n === finalWave();
  // (The HUD announces it: `hud/part.ts`.)
  // Dusk falls as the fight goes on; a Blood Moon brings the night.
  game.env.time = twist === 'blood_moon' ? 0.82 : dusk(n);
  bus.emit('waveStart', { wave: n, name: w.name, twist, boss: w.boss ?? null, final, endless: false });
}

/** The map's time of day as the fight goes on (wave `n`). */
export const dusk = (n: number) => map().time + (map().dusk ?? 0) * ((n - 1) / Math.max(1, finalWave() - 1));

/** Bring in the next of the wave's monsters, at a gate (a boss a little way in). */
function spawnNext(game: GameContext) {
  const type = state.queue.shift();
  if (!type) return;
  const m = map();
  const boss = bossKind(type);
  const g = game.rng.pick(boss ? (m.bossGates ?? m.gates) : m.gates);
  const spread = g.spread ?? 1.5;
  const pos = along(g, boss ? 0 : game.rng.range(-1.5, 1.5), game.rng.range(-spread, spread));
  const e = spawnMonster(game, type, pos, { yaw: g.yaw });
  game.fx.burst({ x: pos.x, y: pos.y + 1, z: pos.z }, { color: boss ? boss.color : type === 'goblin' ? '#ffd23a' : '#8fd6ff', count: 24, speed: 2.5, gravity: -1 });
  game.audio.play(boss ? 'boss' : 'spawn', { at: pos, volume: boss ? 1.4 : 0.8 });
  if (boss) game.fx.shake(0.2, 1.2);
  return e;
}

/** Bring them in while there's room, one every so often. Whether the wave's all down. */
export function tick(game: GameContext, dt: number): { left: number; cleared: boolean } {
  const alive = game.entities.count();
  state.spawnTimer -= dt;
  if (state.queue.length > 0 && alive < MAX_ALIVE && state.spawnTimer <= 0) {
    spawnNext(game);
    state.spawnTimer = state.boss ? 2.5 : 0.9;
  }
  const left = alive + state.queue.length;
  return { left, cleared: state.queue.length === 0 && alive === 0 };
}

/** What the twists do once the monsters are in (in `setup`). */
export function directorListen(game: GameContext) {
  bus.on('spawned', ({ entity, type }) => {
    if (state.twist === 'blood_moon' && type !== 'goblin' && !bossKind(type)) {
      entity.data.speed = 1.25;
      entity.setSpeed(1.25);
    }
  });
  bus.on('slain', ({ by, type, at }) => {
    // Under a Blood Moon, hearts fall more often.
    if (state.twist === 'blood_moon' && by && type !== 'goblin' && game.rng.chance(0.15)) {
      game.items.spawnPickup('heart', { x: at.x, y: at.y + 0.5, z: at.z }, { despawn: 30 });
    }
  });
}
