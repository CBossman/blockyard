import { readFileSync } from 'node:fs';
import type { Entity, GameContext, Player, Vec3 } from '@platform';
import { GameHost } from '../../src/platform/host/game';
import type { HostEvent, PlayerInput } from '../../src/platform/net/protocol';
import { BLESSINGS, blessingsOf, type BlessingId } from '../../src/games/arena/blessings';
import { ARMOR, armorOf, type ArmorId } from '../../src/games/arena/items';
import { WARES } from '../../src/games/arena/items/catalog';
import { forgeNext } from '../../src/games/arena/items/forge';
import { baseOf } from '../../src/games/arena/items/rarity';
import { bus } from '../../src/games/arena/run/bus';
import { choose, type ClassId } from '../../src/games/arena/run/classes';
import { isDowned } from '../../src/games/arena/run/downed';
import { bossKind } from '../../src/games/arena/bosses';
import { finalWave } from '../../src/games/arena/run/director';
import { gold } from '../../src/games/arena/run/gold';
import { FEATHER_PRICE, purchase, shopOpen } from '../../src/games/arena/run/shop';
import { map, state } from '../../src/games/arena/run/state';
import { games } from './_harness';

/**
 * Probe: how far the run goes for a player who plays it properly. A bot per fighter that picks a
 * class, fights with its kit (blades held, a bow drawn and loosed at range, the staff kept at a
 * distance, the gladius's guard raised against a blow it sees coming), drinks a potion when low,
 * throws bombs into knots of monsters, dodge-rolls (or jumps, or steps out) what it can read
 * coming (wind-ups and fuses in the monsters' own state, warning rings, charge lines, storm
 * marks) a beat after it shows (a person's reaction), revives a friend, and between waves takes a
 * blessing, picks up its reward and shops (potions, armour, the forge, bombs, a feather). At normal
 * health. Solo and two together, over seeds, per class. Prints each run's wave reached, where and
 * to what it died, damage by source per wave, gold earned and spent, each wave's time.
 * `RUNS=solo|duo|all SEEDS=3 CLASSES=gladiator,hunter node scripts/headless.mjs tests/headless/_arena-sim.ts`
 */

const CLASS_LIST: ClassId[] = ['gladiator', 'hunter', 'berserker', 'pyromancer'];
/**
 * How well the bot plays (`SKILL`): `skilled` (the default) is held to a good player's limits:
 * it reacts to a tell a beat after it shows (`react`, seconds), turns at most `turn` radians a
 * second, its aim wanders up to `aim` off, it notices most tells in front of it and fewer behind
 * (`notice`), times its rolls give or take `roll` seconds, raises the gladius's guard for some
 * blows (`guard`), throws a bomb at some knots (`bombs`), drinks at `drink` of its health.
 * `average` is a fair player's; `expert` has no limits at all.
 */
const SKILLS = {
  expert: { react: [0, 0], turn: Infinity, aim: 0, notice: { front: 1, behind: 1 }, roll: 0, guard: 1, bombs: 1, drink: 0.4 },
  skilled: { react: [0.18, 0.32], turn: 8, aim: 0.05, notice: { front: 0.92, behind: 0.45 }, roll: 0.08, guard: 0.9, bombs: 1, drink: 0.4 },
  average: { react: [0.3, 0.5], turn: 5, aim: 0.09, notice: { front: 0.75, behind: 0.25 }, roll: 0.2, guard: 0.6, bombs: 0.5, drink: 0.3 },
  novice: { react: [0.5, 0.8], turn: 3.5, aim: 0.14, notice: { front: 0.5, behind: 0.1 }, roll: 0.35, guard: 0.3, bombs: 0.25, drink: 0.25 },
};
const SKILL = SKILLS[(process.env.SKILL ?? 'skilled') as keyof typeof SKILLS] ?? SKILLS.skilled;
const REACT = SKILL.react;
const MAX_TIME = 3600;
/** A ranking of the blessings for the bot (higher first), by class. */
const PREFER: Partial<Record<BlessingId, number>> = { ironskin: 10, stout: 9.5, vampire: 9, secondwind: 8.5, bloodlust: 7.5, executioner: 7, berserk: 7, giant: 6, volatile: 6, embers: 6, storm: 5.5, thorns: 5, fleet: 4, momentum: 3 };
const PREFER_CLASS: Record<ClassId, Partial<Record<BlessingId, number>>> = {
  gladiator: { riposte: 8.8, bulwark: 8 },
  hunter: { hawkeye: 8, assassin: 8 },
  berserker: { tremor: 7, berserk: 8.5 },
  pyromancer: { arcane: 9.2, wildfire: 8.6, bombardier: 8, berserk: 1, giant: 1 },
};
/** Each class's main weapon (the forge's), and what it holds at range. */
const MAIN: Record<ClassId, string> = { gladiator: 'gladius', hunter: 'daggers', berserker: 'battle_axe', pyromancer: 'fire_staff' };

interface WaveLog {
  wave: number;
  name: string;
  boss: string | null;
  twist: string | null;
  start: number;
  end?: number;
  taken: Record<string, number>;
  /** Before armour; the lowest any fighter's health got (a share of their most); what the fighters dealt. */
  raw: number;
  low: number;
  dealt: number;
  /** A boss's: how long it lasted. */
  bossLife?: number;
  downs: number;
  falls: number;
  goldStart: number;
  earned: number;
  spent: number;
  potions: number;
  rolls: number;
  bombs: number;
}

/** One fighter: a client of the host, its player, its bot's memory. */
interface Fighter {
  id: string;
  name: string;
  cls: ClassId;
  p: Player;
  seq: number;
  blessMenu: { id: number; entries: { label: string; cb: number }[] } | null;
  shopped: boolean;
  bought: string[];
  react: number;
  seen: Map<string, number>;
  bowDraw: number;
  bombCd: number;
  potionCd: number;
  stuck: number;
  lastPos: Vec3;
  strafe: number;
  strafeFlip: number;
  readyAt: number;
  diedTo: string | null;
  diedWave: number;
  /** Drinking until then (hands off the hotbar). */
  quaff: number;
  /** The reward it's walking to, since when, and those it gave up on. */
  lootKey: string;
  lootSince: number;
  skip: Set<string>;
  /** Where it's actually looking, and its aim's wander; which tells it noticed. */
  aimYaw: number;
  aimPitch: number;
  aimErr: [number, number];
  noticed: Map<string, boolean>;
  /** When (seconds before it lands) it'll roll from each tell; whether it guards each blow. */
  when: Map<string, number>;
  guardRoll: Map<string, boolean>;
}

const flat = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A threat the bot can read: where it'll land, how far it reaches, how long till it does. */
interface Threat {
  key: string;
  at: Vec3;
  reach: number;
  left: number;
  /** A line (a charge): its heading and length. */
  line?: { dir: number; length: number; width: number };
  /** How to get out: roll (any), jump (a ground slam), or just move. */
  jump?: boolean;
  /** It's after this fighter in particular (a wind-up at them), or everyone in reach. */
  only?: Player;
}

function simulate(seed: number, classes: ClassId[]) {
  Math.random = mulberry32(seed ^ 0x5bd1e995);
  const def = games.find((g) => g.id === 'arena')!;
  const host = new GameHost(def, { engine: readFileSync('engine/pkg/voxel_engine_bg.wasm'), seed, remote: true, radius: 6, budget: Infinity, player: { id: 'p1', name: 'Player' } });
  const game = host.sim.ctx as GameContext;
  const sim = host.sim as unknown as { players: { api: { id: string }; viewSeq: number }[]; items: { frame(): { x: number; y: number; z: number; item: string }[] } };
  const rand = mulberry32(seed * 7 + 3);

  // What happens, wave by wave.
  const waves: WaveLog[] = [];
  const cur = () => waves.at(-1);
  const deaths: { wave: number; who: string; to: string }[] = [];
  let earnedTotal = 0;
  const earnedBy: Record<number, number> = {};
  bus.on('waveStart', ({ wave, name, boss, twist }) => {
    waves.push({ wave, name, boss, twist, start: game.clock.now, taken: {}, raw: 0, low: 1, dealt: 0, downs: 0, falls: 0, goldStart: fighters.reduce((a, f) => a + gold(f.p), 0), earned: 0, spent: 0, potions: 0, rolls: 0, bombs: 0 });
  });
  bus.on('waveCleared', () => {
    const w = cur();
    if (w) w.end = game.clock.now;
  });
  bus.on('gold', ({ delta, why }) => {
    const w = cur();
    if (delta > 0 && why !== 'start') {
      earnedTotal += delta;
      if (w) w.earned += delta;
      earnedBy[state.wave] = earnedTotal;
    }
    if (delta < 0 && w) w.spent -= delta;
  });
  bus.on('downed', () => void (cur() && cur()!.downs++));
  bus.on('fell', () => void (cur() && cur()!.falls++));
  const lastHit = new Map<string, string>();
  game.events.on('playerDamage', ({ player, amount, source }) => {
    const k = source && source !== 'world' && source.kind === 'entity' ? source.type + (source.data.elite ? `(${source.data.elite})` : '') : source === 'world' ? 'world' : 'other';
    lastHit.set(player.id, k);
    const w = cur();
    if (w && state.phase === 'fighting') w.taken[k] = (w.taken[k] ?? 0) + amount;
  });
  // What came at them before armour (last of the damage listeners, so after the game's own).
  game.events.on('damage', (hit) => {
    const w = cur();
    if (w && hit.target.kind === 'player' && !hit.cancelled && state.phase === 'fighting') w.raw += hit.amount;
  });
  // Each monster's life (by kind): how long it lasted, and what it did to the fighters.
  const born = new Map<number, number>();
  const kinds: Record<string, { n: number; life: number; dealt: number }> = {};
  const kindOf = (type: string) => (kinds[type] ??= { n: 0, life: 0, dealt: 0 });
  bus.on('spawned', ({ entity }) => void born.set(entity.id, game.clock.now));
  game.events.on('entityDamage', ({ amount, source }) => {
    const w = cur();
    if (w && source && source !== 'world' && source.kind === 'player') w.dealt += amount;
  });
  bus.on('slain', ({ entity, type }) => {
    const b = born.get(entity.id);
    if (b === undefined) return;
    if (bossKind(type) && cur()) cur()!.bossLife = game.clock.now - b;
    const k = kindOf(type);
    k.n++;
    k.life += game.clock.now - b;
  });
  game.events.on('playerDamage', ({ amount, source }) => {
    if (source && source !== 'world' && source.kind === 'entity') kindOf(source.type).dealt += amount;
  });
  game.events.on('playerDeath', ({ player }) => {
    const f = fighters.find((x) => x.p === player);
    deaths.push({ wave: state.wave, who: f?.cls ?? player.name, to: lastHit.get(player.id) ?? '?' });
  });
  game.events.on('ability', ({ name }) => void (name === 'roll' && cur() && cur()!.rolls++));

  // The rings and marks the screens are told of (what a person sees coming), from the batches.
  const rings: { at: Vec3; radius: number; until: number; harmless: boolean }[] = [];
  const marks = new Map<string, { at: Vec3; until: number }>();

  const fighters: Fighter[] = [];
  classes.forEach((cls, i) => {
    const name = `${cls}${i}`;
    const c = host.connect(name);
    host.command(c.id, { t: 'start', name });
    const p = game.players.find((q) => q.name === name)!;
    // Every class open to it (as to a seasoned player), whatever its level.
    p.store.set('arena', { xp: 1e7, best: {}, wins: 0 });
    fighters.push({ id: c.id, name, cls, p, seq: 0, blessMenu: null, shopped: false, bought: [], react: REACT[0] + rand() * (REACT[1] - REACT[0]), seen: new Map(), bowDraw: 0, bombCd: 0, potionCd: 0, stuck: 0, lastPos: { ...p.position }, strafe: 1, strafeFlip: 0, readyAt: 0, diedTo: null, diedWave: 0, quaff: 0, lootKey: '', lootSince: 0, skip: new Set(), aimYaw: p.yaw, aimPitch: 0, aimErr: [0, 0], noticed: new Map(), when: new Map(), guardRoll: new Map() });
  });

  const monsters = () => game.entities.all().filter((e) => !e.data.scenery);
  /** What's coming that can be read: each monster's tell in its own state, rings, storm marks. */
  function threats(): Threat[] {
    const out: Threat[] = [];
    const now = game.clock.now;
    for (const e of monsters()) {
      const d = e.data as Record<string, unknown>;
      const q = e.position;
      const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
      // A blow wound up (the platform's melee, the knight's, the golem's fist, the minotaur's axe, the imp's throw).
      const wind = num('_wind') ?? num('_tell');
      if (wind !== undefined && e.type !== 'imp' && e.type !== 'wraith') out.push({ key: `${e.id}:blow`, at: q, reach: e.type === 'golem' ? 4 : e.type === 'brute' || e.type === 'minotaur' ? 3.6 : 3, left: wind });
      if (num('_fuse') !== undefined) out.push({ key: `${e.id}:fuse`, at: q, reach: 4.2, left: num('_fuse')! });
      if (num('_pound') !== undefined) out.push({ key: `${e.id}:pound`, at: q, reach: 5.8, left: num('_pound')!, jump: true });
      if (num('_paw') !== undefined && typeof d._dir === 'number') out.push({ key: `${e.id}:charge`, at: q, reach: 0, left: num('_paw')!, line: { dir: d._dir as number, length: 20, width: 2.2 } });
      if (e.type === 'warden' && d.phase === 'windup') out.push({ key: `${e.id}:slam`, at: q, reach: 8.3, left: num('timer') ?? 0, jump: true });
    }
    for (const r of rings) if (!r.harmless && r.until > now) out.push({ key: `ring:${r.at.x.toFixed(1)}:${r.at.z.toFixed(1)}`, at: r.at, reach: r.radius + 0.6, left: r.until - now });
    for (const [k, m] of marks) if (m.until > now) out.push({ key: k, at: m.at, reach: 3, left: m.until - now });
    return out;
  }
  /** Whether a fighter at `q` is in a threat's way. */
  const inWay = (t: Threat, q: Vec3) => {
    if (t.line) {
      const dx = q.x - t.at.x, dz = q.z - t.at.z;
      const along = dx * Math.sin(t.line.dir) + dz * Math.cos(t.line.dir);
      const across = Math.abs(dx * Math.cos(t.line.dir) - dz * Math.sin(t.line.dir));
      return along > -1 && along < t.line.length && across < t.line.width;
    }
    return flat(q, t.at) < t.reach && Math.abs(q.y - t.at.y) < 2.5;
  };
  /** Which way out of a threat (a unit vector on the ground). */
  const away = (t: Threat, q: Vec3): [number, number] => {
    if (t.line) {
      // Sideways off the line, toward whichever side it's nearer.
      const dx = q.x - t.at.x, dz = q.z - t.at.z;
      const side = dx * Math.cos(t.line.dir) - dz * Math.sin(t.line.dir) >= 0 ? 1 : -1;
      return [Math.cos(t.line.dir) * side, -Math.sin(t.line.dir) * side];
    }
    const dx = q.x - t.at.x, dz = q.z - t.at.z;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };

  /** Keys for moving the way (dx, dz) with the view at `yaw` (yaw 0 looks toward -z). */
  function keysFor(dx: number, dz: number, yaw: number): string[] {
    const l = Math.hypot(dx, dz);
    if (l < 0.01) return [];
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const f = (dx * fx + dz * fz) / l, r = (dx * rx + dz * rz) / l;
    const out: string[] = [];
    if (f > 0.38) out.push('KeyW');
    if (f < -0.38) out.push('KeyS');
    if (r > 0.38) out.push('KeyD');
    if (r < -0.38) out.push('KeyA');
    return out;
  }

  /** The bot's controls for one fighter this step. */
  function pilot(f: Fighter, dt: number): Partial<PlayerInput> {
    const p = f.p;
    const now = game.clock.now;
    const me = p.position;
    const eye = p.eye;
    const inv = p.inventory;
    const has = (item: string) => inv.count(item) > 0;
    const slotOf = (pred: (item: string) => boolean) => inv.slots.findIndex((s) => !!s && pred(s.item));
    const down: string[] = [];
    const pressed: string[] = [];
    let buttons = 0;
    let yaw = p.yaw;
    let pitch = 0;
    const look = (q: Vec3, h = 1.2) => {
      yaw = Math.atan2(-(q.x - eye.x), -(q.z - eye.z));
      pitch = Math.atan2(q.y + h - eye.y, Math.hypot(q.x - eye.x, q.z - eye.z));
    };
    /** The controls as they go out: the view turned toward where it wants to look (as fast as a person can), moving the way it wants. */
    const finish = (mx: number, mz: number): Partial<PlayerInput> => {
      let outYaw = yaw;
      let outPitch = pitch;
      if (SKILL.turn < Infinity) {
        const max = SKILL.turn * dt;
        const dy = Math.atan2(Math.sin(yaw - f.aimYaw), Math.cos(yaw - f.aimYaw));
        f.aimYaw += Math.max(-max, Math.min(max, dy));
        f.aimPitch += Math.max(-max, Math.min(max, pitch - f.aimPitch));
        const AIM = SKILL.aim;
        f.aimErr = [Math.max(-AIM, Math.min(AIM, f.aimErr[0] + (rand() - 0.5) * AIM * 0.4)), Math.max(-AIM, Math.min(AIM, f.aimErr[1] + (rand() - 0.5) * AIM * 0.3))];
        outYaw = f.aimYaw + f.aimErr[0];
        outPitch = f.aimPitch + f.aimErr[1];
      } else [f.aimYaw, f.aimPitch] = [yaw, pitch];
      down.push(...keysFor(mx, mz, outYaw));
      unstick(f, down, pressed, dt);
      return { down, pressed, yaw: outYaw, pitch: outPitch, buttons };
    };
    f.bombCd = Math.max(0, f.bombCd - dt);
    f.potionCd = Math.max(0, f.potionCd - dt);
    if (!p.alive || p.frozen || state.phase === 'countdown') return { yaw: f.aimYaw, pitch: f.aimPitch };

    // Between waves: the blessing, the reward on the dais, the shop, then ready.
    if (state.phase === 'intermission') {
      if (f.blessMenu) {
        const pick = [...f.blessMenu.entries].sort((a, b) => score(f, b.label) - score(f, a.label))[0];
        if (pick) host.command(f.id, { t: 'message', msg: { t: 'callback', player: p.id, id: pick.cb } });
        f.blessMenu = null;
      }
      // The shop first (its time is short), then the reward on the dais (given up on if it can't
      // be reached in a few seconds), then ready.
      const c = map().center;
      const loot = sim.items.frame().filter((x) => flat(x, c) < 4 && x.item !== 'coin' && x.item !== 'coin_pile' && !f.skip.has(`${x.x.toFixed(1)},${x.z.toFixed(1)}`));
      let goal: Vec3 | null = null;
      const m = shopOpen() ? game.entities.all('merchant')[0] : undefined;
      if (!f.shopped && m) {
        if (flat(m.position, me) < 2.8) {
          shop(f);
          f.shopped = true;
        } else goal = m.position;
      } else if (loot.length) {
        const l = loot.sort((a, b) => flat(a, me) - flat(b, me))[0];
        const key = `${l.x.toFixed(1)},${l.z.toFixed(1)}`;
        if (f.lootKey !== key) {
          f.lootKey = key;
          f.lootSince = now;
        }
        if (now - f.lootSince > 4) f.skip.add(key);
        goal = { x: l.x, y: l.y, z: l.z };
      } else if (!f.readyAt) {
        f.readyAt = now;
        pressed.push('KeyN');
      }
      if (process.env.DEBUG && Math.floor(now) !== Math.floor(now - 1 / 30)) console.log(`    [${now.toFixed(0)}] ${f.name} at ${me.x.toFixed(1)},${me.z.toFixed(1)} loot ${loot.map((l) => l.item).join(',')} shop ${shopOpen()} merchants ${game.entities.all('merchant').length} goal ${goal ? `${goal.x.toFixed(1)},${goal.z.toFixed(1)}` : '-'} gold ${gold(p)} bought ${f.bought.join(',')}`);
      if (goal) look(goal, 0);
      return finish(goal ? goal.x - me.x : 0, goal ? goal.z - me.z : 0);
    }
    if (state.phase !== 'fighting') return { yaw: f.aimYaw, pitch: f.aimPitch };
    f.shopped = false;
    f.readyAt = 0;
    f.skip.clear();
    const downedNow = isDowned(p);

    // Hurt: a potion (not while down, nor drinking).
    if (!downedNow && p.health < p.maxHealth * SKILL.drink && has('health_potion') && f.potionCd === 0) {
      pressed.push('KeyR');
      f.potionCd = 1.2;
      f.quaff = now + 0.95;
      const w = cur();
      if (w) w.potions++;
    }

    const all = monsters();
    // A friend down nearby: get them up (if it's not too hot about them).
    const friend = fighters.find((o) => o !== f && o.p.alive && isDowned(o.p));
    if (friend && !downedNow) {
      const q = friend.p.position;
      const hot = all.filter((e) => flat(e.position, q) < 3.5).length;
      if (hot <= 2) {
        look(q, 0.3);
        if (flat(q, me) > 1.6) return finish(q.x - me.x, q.z - me.z);
        down.push('KeyE');
        return finish(0, 0);
      }
    }

    // What's coming that it can see: dodge the first it's in the way of, once it's had time to react.
    let dodge: [number, number] | null = null;
    let dodgeNow = false;
    let jumpNow = false;
    for (const t of threats()) {
      if (!inWay(t, me)) continue;
      const first = f.seen.get(t.key) ?? now;
      f.seen.set(t.key, first);
      if (!noticed(f, t, me)) continue;
      if (now - first < f.react) continue;
      dodge = away(t, me);
      // Roll (or jump a ground slam) as it's about to land: rolling is untouchable for a moment
      // (timed as well as a person times it).
      let when = f.when.get(t.key);
      if (when === undefined) f.when.set(t.key, (when = 0.28 + (rand() * 2 - 1) * SKILL.roll));
      if (t.left < when) {
        if (t.jump && rand() < 0.5) jumpNow = true;
        else dodgeNow = true;
      }
      break;
    }

    // Who to fight: one at its rite or draining, then the nearest (a ranged class prefers those at range).
    const ranged = f.cls === 'pyromancer' || f.cls === 'hunter';
    const priority = (e: Entity) => {
      const d = e.distanceTo(p);
      const da = e.data as Record<string, unknown>;
      let s = d;
      if (da._rite !== undefined) s -= 12;
      if (da._drain !== undefined || da._chant !== undefined) s -= 8;
      if (e.type === 'cultist' || e.type === 'necromancer') s -= 4;
      if (e.type === 'goblin') s -= 3;
      if (e.type === 'sapper' && da._fuse === undefined && !ranged) s += 3;
      return s;
    };
    const target = all.length ? [...all].sort((a, b) => priority(a) - priority(b))[0] : null;

    // Weapons: the class's melee by default, the bow or staff at range.
    const melee = slotOf((it) => game.items.get(it)?.kind === 'melee');
    const bow = slotOf((it) => baseOf(it) === 'bow' || baseOf(it) === 'crossbow');
    const staff = slotOf((it) => game.items.get(it)?.kind === 'staff');
    let want = melee;
    let range = 2.4;
    if (target) {
      const d = target.distanceTo(p);
      if (staff >= 0) {
        want = staff;
        range = 9;
      } else if (bow >= 0 && has('arrow') && d > 6) {
        want = bow;
        range = 14;
      }
    }
    // (Not while it drinks: switching away spills the potion.)
    if (want >= 0 && inv.selected !== want && now > f.quaff) inv.select(want);
    const holding = inv.slots[inv.selected]?.item ?? '';
    const kind = game.items.get(holding)?.kind;

    // A bomb into a knot of them.
    if (target && f.bombCd === 0 && has('bomb') && !downedNow) {
      const knot = all.filter((e) => flat(e.position, target.position) < 3).length;
      const d = flat(target.position, me);
      // (A fair player misses some chances: then it's a while before it thinks of it again.)
      if (knot >= 3 && d > 3.5 && d < 11 && rand() >= SKILL.bombs) f.bombCd = 2;
      else if (knot >= 3 && d > 3.5 && d < 11) {
        look(target.position, 0);
        pitch = Math.min(0.6, 0.05 + (d - 4) * 0.03);
        pressed.push('KeyG');
        f.bombCd = 2.5;
        const w = cur();
        if (w) w.bombs++;
      }
    }

    // Moving: out of what's coming; else to the target, keeping the weapon's distance, strafing.
    let mx = 0;
    let mz = 0;
    f.strafeFlip -= dt;
    if (f.strafeFlip <= 0) {
      f.strafe = rand() < 0.5 ? 1 : -1;
      f.strafeFlip = 1 + rand() * 2;
    }
    if (target) {
      const q = target.position;
      look(q, target.type === 'spider' || target.type.startsWith('slime') ? 0.4 : target.type === 'bat' ? 0.3 : target.type === 'golem' || target.type === 'warden' ? 2 : 1.2);
      const d = flat(q, me);
      const dx = (q.x - me.x) / (d || 1), dz = (q.z - me.z) / (d || 1);
      if (d > range) [mx, mz] = [dx, dz];
      else if (d < range * 0.6 && kind !== 'melee') [mx, mz] = [-dx, -dz];
      // Sideways a little either way, so arrows and fire miss.
      mx += -dz * f.strafe * 0.45;
      mz += dx * f.strafe * 0.45;
      // Attack: blades held; the bow drawn and loosed; the staff held.
      const inReach = kind === 'melee' ? target.distanceTo(p) < 3.3 : d < range + 2;
      if (inReach && !downedNow) {
        if (kind === 'bow' || kind === 'gun') {
          f.bowDraw += dt;
          if (f.bowDraw < 0.95) buttons |= 1;
          else f.bowDraw = 0;
        } else buttons |= 1;
      }
      // The gladius's guard against a blow it sees coming at it from in front.
      if (f.cls === 'gladiator' && kind === 'melee' && game.items.get(holding)?.name?.startsWith('Gladius')) {
        const blow = threats().find((t) => !t.line && !t.jump && t.reach <= 4 && inWay(t, me) && t.left < 0.35 && now - (f.seen.get(t.key) ?? now) >= f.react && noticed(f, t, me));
        if (blow && (f.guardRoll.get(blow.key) ?? (f.guardRoll.set(blow.key, rand() < SKILL.guard), f.guardRoll.get(blow.key)))) {
          buttons = 4;
          dodge = null;
          dodgeNow = false;
        }
      }
    } else {
      // Nothing to fight yet: the middle.
      const c = map().center;
      if (flat(c, me) > 3) [mx, mz] = [c.x - me.x, c.z - me.z];
    }
    if (dodge) [mx, mz] = dodge;
    if (dodgeNow && !downedNow && (p.abilities.roll as { cool?: number } | undefined)?.cool === 0) pressed.push('KeyQ');
    if (jumpNow) pressed.push('Space');
    return finish(mx, mz);
  }

  /** Whether it noticed a tell (decided once, when it first shows): most in front of it, fewer behind. */
  function noticed(f: Fighter, t: Threat, me: Vec3): boolean {
    const NOTICE = SKILL.notice;
    let n = f.noticed.get(t.key);
    if (n === undefined) {
      const toward = Math.atan2(-(t.at.x - me.x), -(t.at.z - me.z));
      const off = Math.abs(Math.atan2(Math.sin(toward - f.aimYaw), Math.cos(toward - f.aimYaw)));
      n = t.line || t.reach > 5 ? rand() < NOTICE.front : rand() < (off < 1.2 ? NOTICE.front : NOTICE.behind);
      f.noticed.set(t.key, n);
    }
    return n;
  }

  /** Walking into a wall: hop. */
  function unstick(f: Fighter, down: string[], pressed: string[], dt: number) {
    const q = f.p.position;
    const moved = flat(q, f.lastPos);
    f.lastPos = { ...q };
    if (down.length && moved < 0.02) f.stuck += dt;
    else f.stuck = 0;
    if (f.stuck > 0.3) {
      pressed.push('Space');
      f.stuck = 0;
    }
  }

  /** A blessing's worth to this bot, by its label in the menu (its name, maybe with a number). */
  function score(f: Fighter, label: string): number {
    const id = (Object.keys(BLESSINGS) as BlessingId[]).find((k) => label.startsWith(BLESSINGS[k].name));
    if (!id) return 0;
    return PREFER_CLASS[f.cls][id] ?? PREFER[id] ?? 4;
  }

  /** At the merchant's: what a sensible fighter buys with what it has, in order. */
  function shop(f: Fighter) {
    const p = f.p;
    const buy = (id: string) => {
      if (purchase(game, p, id)) f.bought.push(id);
    };
    const potions = () => p.inventory.count('health_potion');
    const cleared = state.wave;
    // A potion in hand first.
    if (potions() < 1) buy('health_potion');
    // Armour: the best it can afford that's on sale and better than what it wears.
    for (const a of ['plate_armor', 'mail_armor', 'leather_armor'] as ArmorId[]) {
      const w = WARES.find((x) => x.item === a)!;
      if ((w.from ?? 0) <= cleared && armorOf(p) < ARMOR[a].points && gold(p) >= w.price + 40) {
        buy(a);
        break;
      }
    }
    // The forge: its main weapon up a rarity.
    const main = p.inventory.slots.find((s) => s && baseOf(s.item) === MAIN[f.cls])?.item;
    const next = main && forgeNext(main);
    if (next && gold(p) >= next.price + 20) buy(`forge:${main}`);
    // More potions, up to three; bombs; a feather once it's rich (alone).
    while (potions() < 3 && gold(p) >= 40 + 60) {
      const before = potions();
      buy('health_potion');
      if (potions() === before) break;
    }
    if (p.inventory.count('bomb') < 4 && gold(p) >= 30 + 80) buy('bomb');
    if (f.cls === 'hunter' && p.inventory.count('arrow') < 24 && gold(p) >= 15) buy('arrow');
    if (fighters.length === 1 && p.inventory.count('phoenix_feather') === 0 && gold(p) >= FEATHER_PRICE + 150) buy('phoenix_feather');
  }

  // The run: step by step, each fighter's controls twice a step (as a screen sends them).
  const viewSeq = (p: Player) => sim.players.find((q) => q.api.id === p.id)?.viewSeq ?? -1;
  const dt = 1 / 30;
  let t = 0;
  let chosen = false;
  while (t < MAX_TIME) {
    if (state.phase === 'countdown' && !chosen) {
      chosen = true;
      for (const f of fighters) choose(game, f.p, f.cls);
    }
    for (const f of fighters) {
      const input = pilot(f, dt);
      for (let j = 0; j < 2; j++) {
        f.seq++;
        host.command(f.id, { t: 'input', input: { active: true, down: input.down ?? [], pressed: j === 0 ? (input.pressed ?? []) : [], buttons: input.buttons ?? 0, clicked: j === 0 ? (input.buttons ?? 0) : 0, mouseX: 0, mouseY: 0, wheel: 0, yaw: input.yaw ?? 0, pitch: input.pitch ?? 0, viewSeq: viewSeq(f.p) }, seq: f.seq, dt: dt / 2 });
      }
    }
    const out = host.step(dt);
    t += dt;
    const w = cur();
    if (w && state.phase === 'fighting') for (const f of fighters) if (f.p.alive && !isDowned(f.p)) w.low = Math.min(w.low, f.p.health / f.p.maxHealth);
    for (const [id, batch] of out) {
      const f = fighters.find((x) => x.id === id);
      for (const e of batch.events as HostEvent[]) {
        if (e.t !== 'call') continue;
        const call = e.call;
        if (f && call.target === 'hud' && call.method === 'menu' && (call.args[1] as { title?: string })?.title === 'Choose a blessing') {
          const sections = (call.args[1] as { sections: { entries: { label: string; onSelect?: { $cb: number } }[] }[] }).sections;
          f.blessMenu = { id: call.args[0] as number, entries: sections[0].entries.flatMap((x) => (x.onSelect ? [{ label: x.label, cb: x.onSelect.$cb }] : [])) };
        }
        if (id === fighters[0].id && call.target === 'message' && call.method === 'bestiary.ring') {
          const r = call.args[0] as { x: number; y: number; z: number; radius: number; time: number; color: string };
          // (A cultist's rite ring marks where imps will come, not a blow.)
          rings.push({ at: { x: r.x, y: r.y, z: r.z }, radius: r.radius, until: game.clock.now + r.time, harmless: r.color === '#ff2a3a' });
        }
        if (id === fighters[0].id && call.target === 'hud' && call.method === 'marker' && String(call.args[0]).startsWith('arena.strike:')) {
          const at = call.args[1] as Vec3 | null;
          if (at && typeof at === 'object' && 'x' in at) marks.set(String(call.args[0]), { at: { x: at.x, y: at.y, z: at.z }, until: game.clock.now + 1.4 });
          else marks.delete(String(call.args[0]));
        }
      }
    }
    if (state.phase === 'victory' || state.phase === 'defeat') break;
  }
  const won = state.phase === 'victory';
  const result = { seed, classes, won, wave: state.wave, time: t, waves, deaths, earnedBy, kinds, armour: fighters.map((f) => f.p.armor), bought: fighters.map((f) => f.bought), blessings: fighters.map((f) => blessingsOf(f.p)), final: { gold: fighters.map((f) => gold(f.p)), armor: fighters.map((f) => armorOf(f.p)), weapons: fighters.map((f) => f.p.inventory.slots.flatMap((s) => (s && game.items.get(s.item)?.kind !== 'misc' ? [s.item] : [])).join(' ')) } };
  host.dispose?.();
  return result;
}

export default function arenaSim() {
  const which = process.env.RUNS ?? 'all';
  const seeds = Array.from({ length: Number(process.env.SEEDS ?? 3) }, (_, i) => 101 + i * 37);
  const classes = (process.env.CLASSES?.split(',') as ClassId[] | undefined) ?? CLASS_LIST;
  const runs: ReturnType<typeof simulate>[] = [];
  const t0 = performance.now();
  for (const cls of classes) {
    for (const seed of seeds) {
      if (which === 'solo' || which === 'all') runs.push(simulate(seed, [cls]));
      if (which === 'duo' || which === 'all') runs.push(simulate(seed + 1, [cls, cls]));
    }
  }
  const bosses = ['colossus', 'warden', 'broodmother', 'lich'];
  console.log(`  ${process.env.SKILL ?? 'skilled'}: ${runs.length} runs in ${((performance.now() - t0) / 1000).toFixed(0)} s (final wave ${finalWave()}; bosses in the game: ${bosses.filter((b) => bossKind(b)).join(', ') || 'none'}; stand-ins for ${bosses.filter((b) => !bossKind(b)).join(', ')})`);
  // Across the runs: each kind's average life and what it did to fighters (per one slain).
  const all: Record<string, { n: number; life: number; dealt: number }> = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.kinds)) {
    const a = (all[k] ??= { n: 0, life: 0, dealt: 0 });
    a.n += v.n;
    a.life += v.life;
    a.dealt += v.dealt;
  }
  console.log(`  by kind (slain, average seconds alive, damage to fighters per one): ${Object.entries(all).sort((a, b) => b[1].dealt / Math.max(1, b[1].n) - a[1].dealt / Math.max(1, a[1].n)).map(([k, v]) => `${k} ${v.n} ${(v.life / Math.max(1, v.n)).toFixed(1)}s ${(v.dealt / Math.max(1, v.n)).toFixed(1)}`).join('; ')}`);
  const lost = runs.filter((r) => !r.won);
  console.log(`  won ${runs.length - lost.length} of ${runs.length}; lost at ${lost.map((r) => `${r.classes.length > 1 ? 'duo' : 'solo'} ${r.classes[0]} w${r.wave}`).join(', ') || '-'}`);
  for (const r of runs) {
    const party = r.classes.length > 1 ? `duo ${r.classes[0]}` : `solo ${r.classes[0]}`;
    console.log(`\n  == ${party}, seed ${r.seed}: ${r.won ? 'VICTORY' : `fell on wave ${r.wave}`} after ${(r.time / 60).toFixed(1)} min; deaths ${r.deaths.map((d) => `w${d.wave} ${d.to}`).join(', ') || 'none'}`);
    console.log(`     gold earned by wave 5/10/15: ${[5, 10, 15].map((n) => r.earnedBy[n] ?? '-').join(' / ')}; bought: ${r.bought.map((b) => b.join(' ')).join(' | ')}`);
    console.log(`     blessings: ${r.blessings.map((b) => b.join(' ')).join(' | ')}; final: ${r.final.weapons.join(' | ')}, armour worn ${r.final.armor.join('/')} (all told ${r.armour.join('/')} points), gold ${r.final.gold.join('/')}`);
    for (const w of r.waves) {
      const top = Object.entries(w.taken).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
      console.log(`     w${String(w.wave).padStart(2)} ${(w.boss ? `[${w.boss}] ` : '') + w.name}${w.twist ? ` · ${w.twist}` : ''}: ${w.end ? `${(w.end - w.start).toFixed(0)} s` : 'lost'}; took ${Object.values(w.taken).reduce((a, b) => a + b, 0).toFixed(0)} of ${w.raw.toFixed(0)} before armour (${top}), lowest ${(w.low * 100).toFixed(0)}%; dealt ${w.dealt.toFixed(0)}${w.bossLife !== undefined ? `, the boss lasted ${w.bossLife.toFixed(0)} s` : ''}; downs ${w.downs}, falls ${w.falls}; potions ${w.potions}, rolls ${w.rolls}, bombs ${w.bombs}; gold +${w.earned} -${w.spent}`);
    }
  }
}
