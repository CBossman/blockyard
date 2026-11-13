import { ABILITIES, AGE_NEEDS, BUILDINGS, CARRY, SIGHT, UNITS, ageOf, type BuildingKind, type ResKind, type UnitKind } from './defs';
import { BASES, CAMPS, HALF, LAKES, inHill, inLake, inMesa, inside, lakeOf, wallLine, wallPlan } from './map';
import type { Building, Slot, Unit, World } from './server';

/**
 * A bot commander. About once a second it looks over what its own units can see (it plays in the fog
 * like anyone else, and remembers what it has seen; only the hardest bots see the whole map) and runs its side:
 *
 * - the economy: enough engineers, spread over the deposits nearest home that aren't under fire,
 *   running from raiders, finishing what's half built, mending what's damaged;
 * - the base: depots as it fills, barracks and factories, up the eras, its style's towers and bunkers;
 * - the army: trained to answer what it has seen of the enemy;
 * - the war: it picks the enemy it has the best chance against, gathers its army short of that base,
 *   goes in together, sends reinforcements in groups, and falls back from a fight it's losing. An
 *   attack on its own base gets as many defenders as it takes, not the whole army.
 *
 * `skill` (0..1) is how much of that it does: under 0.5 it marches straight in and never retreats;
 * from 0.5 it gathers first, retreats, runs and repairs; from 0.6 it picks its targets in a fight;
 * from 0.8 it raids with helicopters and bombs what's worth bombing.
 */

/**
 * Each bot's way of playing, so no two matches go alike: how big an army it waits for (and how much
 * bigger each wave), how many towers and bunkers it digs in behind, when it goes up an era, how many
 * barracks it keeps, and whether it goes for the air or the lakes.
 */
export const STYLES = {
  balanced: { name: 'Balanced', army: 15, grow: 5, towers: 1, bunkers: 0, age2: 300, age3: 780, barracks: 1, air: false, navy: false, tanks: 1, walls: true },
  rusher: { name: 'Rusher', army: 11, grow: 4, towers: 0, bunkers: 0, age2: 420, age3: 960, barracks: 2, air: false, navy: false, tanks: 0.6, walls: false },
  turtle: { name: 'Turtle', army: 20, grow: 6, towers: 3, bunkers: 2, age2: 330, age3: 840, barracks: 1, air: false, navy: false, tanks: 1.4, walls: true },
  air: { name: 'Air Force', army: 15, grow: 5, towers: 1, bunkers: 0, age2: 270, age3: 660, barracks: 1, air: true, navy: false, tanks: 0.8, walls: true },
  navy: { name: 'Navy', army: 15, grow: 5, towers: 1, bunkers: 1, age2: 330, age3: 840, barracks: 1, air: false, navy: true, tanks: 1, walls: true },
};
export type Style = keyof typeof STYLES;

/**
 * Who each style is: its commanders' names, and what they say to the table when they go in, when
 * they pull out, and when an attack on their base is beaten off (`{foe}` is the one it's about).
 */
const PERSONAS: Record<Style, { names: string[]; attack: string[]; retreat: string[]; hold: string[] }> = {
  balanced: {
    names: ['Hale', 'Mercer', 'Quinn'],
    attack: ['Advancing on {foe}. Steady now.', 'All units forward. {foe} is first.', 'By the book, {foe}. Here we come.'],
    retreat: ['Pull back and regroup.', 'Fall back. We\u2019ll be back.'],
    hold: ['Base secure. Good try, {foe}.', 'Line held. Back to work.'],
  },
  rusher: {
    names: ['Blitz', 'Dash', 'Rook'],
    attack: ['Too slow, {foe}!', 'Ready or not, {foe}.', 'Why wait? Go, go, go!'],
    retreat: ['Tactical retreat. Totally planned.', 'Fine. Round two in a minute.'],
    hold: ['Cute. My turn, {foe}.', 'That\u2019s it? Really?'],
  },
  turtle: {
    names: ['Holt', 'Granite', 'Moss'],
    attack: ['The walls are done. Now, {foe}.', 'Slowly, surely. We\u2019re coming, {foe}.'],
    retreat: ['Back behind the walls.', 'Home. The walls will hold.'],
    hold: ['Nothing gets through these walls.', 'Did you think it would be that easy, {foe}?'],
  },
  air: {
    names: ['Falcon', 'Skye', 'Talon'],
    attack: ['Wheels up. Target: {foe}.', 'Look up, {foe}.'],
    retreat: ['Break off, back to base.', 'Pulling out. Refuel and rearm.'],
    hold: ['Radar\u2019s clear. Nice try, {foe}.'],
  },
  navy: {
    names: ['Marlow', 'Drake', 'Tide'],
    attack: ['All ahead full, {foe}.', 'Weigh anchor. {foe} is in range.'],
    retreat: ['Come about. Back to port.', 'Withdraw. The tide will turn.'],
    hold: ['The harbour holds, {foe}.'],
  },
};
/** A bot's rank says how good it is. */
const rankName = (skill: number, adaptive: boolean) => (adaptive ? 'Col.' : skill < 0.5 ? 'Lt.' : skill < 0.8 ? 'Maj.' : 'Gen.');
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const STYLE_IDS = Object.keys(STYLES) as Style[];

/** The wild's seat: the camps' guards. It's in the way, but it's no one to go to war with. */
const WILD = 6;
const hyp = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
/** What a unit is worth in a fight: what it cost (the camps' guards cost nothing, so their worth is set). */
const worth = (k: UnitKind) => (k === 'guard' ? 90 : k === 'brute' ? 210 : UNITS[k].cost.steel + UNITS[k].cost.oil);
const power = (list: Unit[]) => list.reduce((n, u) => n + (worth(u.kind) * u.hp) / u.max, 0);
/** What goes with the army: whatever fights, and the medics who keep it going. */
const fights = (u: Unit) => u.kind !== 'engineer' && (UNITS[u.kind].damage > 0 || u.kind === 'medic');
const ARMOUR: UnitKind[] = ['tank', 'artillery', 'aa', 'brute', 'gunboat'];
/** What's worth shooting first, by what's shooting: rockets for armour, cannon for the rocket teams. */
const PREFERS: Partial<Record<UnitKind, UnitKind[]>> = { at: ARMOUR, heli: ARMOUR, tank: ['at'], rifle: ['at', 'artillery'] };
/** How much a tower or a bunker counts for in a fight. */
const FORT = 300;

type Mode = 'build' | 'muster' | 'push' | 'fallback';

export class BotBrain {
  private clock = Math.random();
  private wave = 0;
  private mode: Mode = 'build';
  private until = 0;
  /** Not another attack before this: an army that's been beaten back takes time to rebuild. */
  private nextPush = 0;
  private foeSeat = -1;
  /** A camp it's off to clear and hold, or -1. */
  private camp = -1;
  /** What it has seen of the enemy, and still believes: units by id (forgotten after two minutes), buildings until it sees them gone. */
  private seenUnits = new Map<number, { kind: UnitKind; seat: number; t: number }>();
  private seenBuildings = new Map<number, { kind: BuildingKind; seat: number; x: number; z: number }>();
  private scoutStop = 0;
  private scoutedAt = -99;
  /** When it next looks over its walls. */
  private wallAt = 0;
  /** The flankers of the attack being got ready (unit ids), and where they gather. */
  private flank = new Set<number>();
  private flankAt: { x: number; z: number } | null = null;
  /** A raiding party out after the enemy's engineers (unit ids), where it's going, and when it gives up. */
  private raid = new Set<number>();
  private raidTo: { x: number; z: number } | null = null;
  private raidUntil = 0;
  private raidAt = 0;
  /** Where it last saw the enemy's engineers at work. */
  private seenWork = new Map<number, { seat: number; x: number; z: number; t: number }>();
  /** The badly hurt, sent home to mend before they go back in. */
  private wounded = new Set<number>();
  /** When it last said anything; and how big the attack on its base was (to know when it's been beaten off). */
  private saidAt = -99;
  private siege = 0;
  private siegeBy = -1;
  /** An adaptive bot: when it next sizes up the match. */
  private tuneAt = 150;

  readonly kind: Style;
  /** How much of the job it does (an adaptive bot's moves as the match goes). */
  skill: number;
  constructor(skill: number, kind?: Style, readonly adaptive = false) {
    this.skill = skill;
    this.kind = kind ?? STYLE_IDS[Math.floor(Math.random() * STYLE_IDS.length)];
  }
  /** Its name at the table: its rank (how good it is) and a name of its style's. */
  callsign(seat: number): string {
    const names = PERSONAS[this.kind].names;
    return `${rankName(this.skill, this.adaptive)} ${names[seat % names.length]}`;
  }
  /** Its style's name, for the scoreboard. */
  get style(): string {
    return STYLES[this.kind].name;
  }

  /** A word to the table, now and then (not more than once a minute). */
  private say(w: World, s: Slot, what: 'attack' | 'retreat' | 'hold', foe = this.foeSeat): void {
    // (Not a player's own seat, played for them while they're away: it's their name.)
    if (s.player || w.time - this.saidAt < 60 || w.stand || Math.random() > 0.75) return;
    this.saidAt = w.time;
    const name = w.slots[foe]?.name ?? 'you';
    w.say(s.seat, pick(PERSONAS[this.kind][what]).replace('{foe}', name));
  }

  /**
   * An adaptive bot, once a minute: how it's doing against the people it's up against (their armies
   * and their incomes, or the bots' if there are no people), and a little sharper if it's behind, a
   * little easier if it's well ahead.
   */
  private tune(w: World, s: Slot): void {
    if (!this.adaptive || w.time < this.tuneAt) return;
    this.tuneAt = w.time + 60;
    const strength = (x: Slot) => (x.army[x.army.length - 1] ?? 0) + 6 * Math.max(0, (x.banked[x.banked.length - 1] ?? 0) - (x.banked[x.banked.length - 7] ?? 0));
    const foes = w.enemies(s.seat).filter((e) => e.seat !== WILD);
    const people = foes.filter((e) => e.player);
    const them = Math.max(1, ...(people.length ? people : foes).map(strength));
    const ratio = strength(s) / them;
    if (ratio < 0.75) this.skill = Math.min(0.95, this.skill + 0.06);
    else if (ratio > 1.5) {
      this.skill = Math.max(0.3, this.skill - 0.06);
      // (Well ahead: a breather before the next attack.)
      this.nextPush = Math.max(this.nextPush, w.time + 45);
    }
  }

  think(w: World, s: Slot, dt: number): void {
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = 1.2 - this.skill * 0.5;
    this.tune(w, s);
    const smart = this.skill >= 0.5;
    const sharp = this.skill >= 0.8;
    const base = BASES[s.seat];
    const st = STYLES[this.kind];
    const mine = [...w.units.values()].filter((u) => u.seat === s.seat);
    // (Its walls apart from the rest: they're not what it counts, builds or guards like a building.)
    const all = [...w.buildings.values()].filter((b) => b.seat === s.seat);
    const bld = all.filter((b) => !BUILDINGS[b.kind].wall);
    const walls = all.filter((b) => BUILDINGS[b.kind].wall);
    const kinds = (k: UnitKind) => mine.filter((u) => u.kind === k);
    const count = (k: BuildingKind) => bld.filter((b) => b.kind === k).length;
    const engineers = kinds('engineer');
    const hq = bld.find((b) => b.kind === 'hq');
    const foes = this.look(w, s, mine, bld);
    const raiding = (x: number, z: number, r: number) => foes.some((f) => fights(f) && hyp(f.x, f.z, x, z) < r);
    const age = ageOf(s.techs);

    // What's at the door: enemy fighters in the base.
    const home = foes.filter((f) => f.seat !== WILD && fights(f) && (hyp(f.x, f.z, base.x, base.z) < 34 || bld.some((b) => hyp(f.x, f.z, b.x, b.z) < 16) || walls.some((b) => hyp(f.x, f.z, b.x, b.z) < 9)));
    // A real attack on the base, beaten off: it says so.
    if (home.length) {
      const p = power(home);
      if (p > this.siege) {
        this.siege = p;
        this.siegeBy = home[0].seat;
      }
    } else {
      if (this.siege >= 600 && hq) this.say(w, s, 'hold', this.siegeBy);
      this.siege = 0;
    }

    // --- Engineers ---------------------------------------------------------------------------
    const queued = (b: Building, k: UnitKind) => b.queue.filter((q) => q.kind === k).length;
    // (More as the match goes on: a bigger economy for the later eras.)
    const wantEngineers = Math.min(14 + Math.round(this.skill * 4), 6 + Math.floor(this.skill * 3) + Math.floor(w.time / 75));
    if (hq && engineers.length + queued(hq, 'engineer') < wantEngineers && hq.queue.length < 2) w.train(hq, 'engineer');
    // Run from raiders. (Against a real assault there's nowhere to run to: better to keep the money coming.)
    if (smart && home.length <= 3) {
      for (const e of engineers) {
        if (e.order.t === 'move') continue;
        const f = foes.find((x) => fights(x) && hyp(x.x, x.z, e.x, e.z) < 9);
        if (!f) continue;
        const d = hyp(e.x, e.z, f.x, f.z) || 1;
        const clamp = (v: number) => Math.max(-HALF + 6, Math.min(HALF - 6, v));
        w.command([e.id], s.seat, { t: 'move', x: clamp(e.x + ((e.x - f.x) / d) * 16), z: clamp(e.z + ((e.z - f.z) / d) * 16), attack: false });
      }
    }
    // A real assault on the HQ, more than the army at home can hold: the alarm, and the engineers shelter (and man its guns).
    // It's over: out they come, back to work.
    if (smart && hq && hq.built >= 1) {
      const atDoor = home.filter((f) => hyp(f.x, f.z, hq.x, hq.z) < 30);
      const guards = mine.filter((u) => fights(u) && hyp(u.x, u.z, hq.x, hq.z) < 30);
      const sheltered = engineers.filter((e) => e.inside?.id === hq.id && !e.inside.boat).length;
      if (atDoor.length >= 3 && power(atDoor) > power(guards) * 1.2) w.alarm(s.seat);
      else if (sheltered && !home.length) w.unload(hq.id, false);
    }
    const nodeOf = (u: Unit) => (u.order.t === 'gather' ? w.deposits[u.order.node] : undefined);
    const load = new Map<number, number>();
    for (const e of engineers) {
      const n = nodeOf(e);
      if (n) load.set(n.id, (load.get(n.id) ?? 0) + 1);
    }
    const posts = bld.filter((b) => b.built >= 1 && (b.kind === 'hq' || b.kind === 'depot'));
    /** The best deposit of a kind: near home, not swamped, and not under fire. */
    const pickNode = (want: ResKind) => {
      let best = -1;
      let score = 1e9;
      for (const d of w.deposits) {
        if (d.amount <= 0 || d.kind !== want || (smart && raiding(d.x, d.z, 16))) continue;
        // (Measured from the nearest place to bring it: a forward depot counts as home.)
        const home2 = posts.length ? Math.min(...posts.map((b) => hyp(d.x, d.z, b.x, b.z))) : hyp(d.x, d.z, base.x, base.z);
        const sc = home2 + Math.max(0, (load.get(d.id) ?? 0) - 3) * 8;
        if (sc < score) {
          score = sc;
          best = d.id;
        }
      }
      return best;
    };
    // Too much oil in the bank: the oil gatherers go over to steel, which is what runs out.
    const toSteel = s.oil > 260 && s.steel < 130 ? engineers.filter((u) => nodeOf(u)?.kind === 'oil') : [];
    // And the other way: a bank full of steel and no oil, and a third of the steel gatherers switch.
    const toOil = s.steel > 400 && s.oil < 120 ? engineers.filter((u) => nodeOf(u)?.kind === 'steel').slice(0, Math.ceil(engineers.length / 3)) : [];
    for (const u of [...engineers.filter((e) => e.order.t === 'idle'), ...toSteel, ...toOil]) {
      // (Oil matters more from the second era: tanks, gunboats and the eras themselves run on it.)
      const oilShare = age >= 2 ? 0.42 : 0.28;
      const onOil = engineers.filter((e) => nodeOf(e)?.kind === 'oil').length;
      const want: ResKind = toOil.includes(u) || (s.oil < 400 && onOil < Math.ceil(engineers.length * oilShare)) ? 'oil' : 'steel';
      const node = pickNode(want);
      if (node < 0) continue;
      if (nodeOf(u)) load.set(nodeOf(u)!.id, (load.get(nodeOf(u)!.id) ?? 1) - 1);
      w.command([u.id], s.seat, { t: 'gather', node, phase: u.carry >= CARRY ? 'back' : 'to' });
      load.set(node, (load.get(node) ?? 0) + 1);
    }
    /** Engineers that can be spared, nearest home first (not ones carrying a load home, or already building). */
    const spare = engineers.filter((e) => !e.inside && (e.order.t === 'idle' || (e.order.t === 'gather' && e.carry < 8))).sort((a, b) => hyp(a.x, a.z, base.x, base.z) - hyp(b.x, b.z, base.x, base.z));
    // Whatever's half built with no one on it gets someone (its builder was killed, say).
    for (const b of bld) {
      if (b.built >= 1 || raiding(b.x, b.z, 14) || engineers.some((e) => e.order.t === 'build' && e.order.id === b.id)) continue;
      const e = spare.shift();
      if (e) w.command([e.id], s.seat, { t: 'build', id: b.id });
    }
    // Its walls: two engineers at a time on what's still to build of them (each goes on to the next when it's done).
    const toWall = walls.filter((b) => b.built < 1 && !raiding(b.x, b.z, 14));
    let onWalls = engineers.filter((e) => e.order.t === 'build' && walls.some((b) => b.id === (e.order as { id: number }).id)).length;
    while (toWall.length && onWalls < 2) {
      const e = spare.shift();
      if (!e) break;
      const b = toWall.sort((p, q) => hyp(p.x, p.z, e.x, e.z) - hyp(q.x, q.z, e.x, e.z))[0];
      w.command([e.id], s.seat, { t: 'build', id: b.id });
      onWalls++;
    }
    // And what's damaged gets mended, once the fighting's over.
    if (smart && !home.length) {
      const hurt = bld.filter((b) => b.built >= 1 && b.hp < BUILDINGS[b.kind].hp * 0.7 && !engineers.some((e) => e.order.t === 'repair' && e.order.id === b.id))[0];
      const e = hurt && spare.shift();
      if (e) w.command([e.id], s.seat, { t: 'repair', id: hurt.id });
    }
    // And the armour back at the base, badly knocked about.
    if (smart && !home.length) {
      const dented = mine.find((u) => ARMOUR.includes(u.kind) && !UNITS[u.kind].naval && u.hp < u.max * 0.6 && hyp(u.x, u.z, base.x, base.z) < 40 && !engineers.some((e) => e.order.t === 'repair' && e.order.id === u.id));
      const e = dented && spare.shift();
      if (e) w.command([e.id], s.seat, { t: 'repair', id: dented.id, unit: true });
    }

    // --- The eras and the base ------------------------------------------------------------------
    const armyNow = mine.filter((u) => fights(u) && u.lake < 0).length;
    const poor = engineers.length < 4 && s.steel < 110;
    // When an era is due and it can't pay, it saves for it (no new buildings or units meanwhile, unless attacked).
    let eraSaving = false;
    if (hq && hq.built >= 1 && !hq.research && !poor && home.length < 3) {
      const era = age === 1 && (w.time > st.age2 || (s.steel > 650 && w.time > st.age2 * 0.7)) ? 'age2' : age === 2 && w.time > st.age3 && (this.skill > 0.4 || st.air) ? 'age3' : null;
      if (era && !w.research(hq, era)) eraSaving = engineers.length >= 6 && armyNow >= 4;
    }
    const sites = bld.filter((b) => b.built < 1).length;
    let saving = false;
    if (hq && !poor && !eraSaving && home.length < 3 && sites < (s.steel > 450 ? 2 : 1)) {
      const wantBarracks = st.barracks + (this.skill > 0.7 && w.time > 600 ? 1 : 0);
      const wantFactory = 1 + (this.skill > 0.6 && w.time > 900 ? 1 : 0);
      let next: BuildingKind | null = null;
      if (s.pop + 3 >= s.cap && count('depot') < 6) next = 'depot';
      else if (count('barracks') < wantBarracks) next = 'barracks';
      else if (age >= 2 && count('factory') < wantFactory) next = 'factory';
      // (The lakes are a sideshow: no dock until there's an army to hold the land.)
      else if (st.navy && age >= 2 && armyNow >= 8 && count('dock') < 1) next = 'dock';
      else if (age >= 3 && (st.air || (this.skill > 0.6 && w.time > 900)) && count('airfield') < (st.air ? 2 : 1) && bld.some((b) => b.kind === 'factory' && b.built >= 1)) next = 'airfield';
      else if (w.time > 360 && count('bunker') < st.bunkers && count('barracks') > 0) next = 'bunker';
      else if (age >= 2 && this.skill > 0.5 && w.time > 660 && count('lab') < 1 && bld.some((b) => b.kind === 'barracks' && b.built >= 1)) next = 'lab';
      else if (w.time > (st.towers > 1 ? 300 : 480) && count('tower') < st.towers + Math.floor(this.skill * 2)) next = 'tower';
      else if (s.pop + 6 >= s.cap && count('depot') < 6) next = 'depot';
      // Late and rich, a smart bot goes for the uplink (a turtle sooner): a way to win without marching on anyone.
      else if (smart && w.uplinkOn && age >= 3 && count('uplink') < 1 && count('lab') > 0 && w.time > (this.kind === 'turtle' ? 1200 : 1680) && s.steel >= BUILDINGS.uplink.cost.steel + 150 && s.oil >= BUILDINGS.uplink.cost.oil + 50) next = 'uplink';
      const afford = !!next && s.steel >= BUILDINGS[next].cost.steel && s.oil >= BUILDINGS[next].cost.oil;
      saving = !!next && !afford && armyNow >= 4 && next !== 'dock';
      const builder = spare.shift();
      if (next && afford && builder) this.raise(w, s, next, bld.length, count, builder, spare[0]);
      else if (builder && smart && !next && s.steel >= 120 && !home.length && count('depot') < 8) {
        // The steel round the base is running out: a depot by the next good deposit.
        const left = w.deposits.filter((d) => d.kind === 'steel' && d.amount > 200 && hyp(d.x, d.z, base.x, base.z) < 34).length;
        if (left < 2) {
          const d = w.deposits.filter((n) => n.kind === 'steel' && n.amount > 700 && !n.salvage && !raiding(n.x, n.z, 20) && !posts.some((b) => hyp(n.x, n.z, b.x, b.z) < 16)).sort((p, q) => hyp(p.x, p.z, base.x, base.z) - hyp(q.x, q.z, base.x, base.z))[0];
          if (d) for (let a = 0; a < 8; a++) {
            const x = d.x + Math.cos(a * 0.785) * 7;
            const z = d.z + Math.sin(a * 0.785) * 7;
            if (!inHill(x, z, 3) && w.place(s.seat, 'depot', x, z, [builder.id])) break;
          }
        }
      }
    }

    // --- Walls: once it has a barracks and steel to spare, its base walled in, gates first; looked over
    // every few seconds, a length at a time as steel comes in, so what's knocked down goes back up. Not by a camp still guarded.
    if (smart && st.walls && hq && !home.length && !poor && w.time >= this.wallAt && w.time > (this.kind === 'turtle' ? 300 : 480) && count('barracks') > 0 && s.steel >= 100) {
      this.wallAt = w.time + 6;
      const guarded = CAMPS.filter((_, i) => [...w.units.values()].some((u) => u.camp === i));
      const free = (x: number, z: number) => !guarded.some((c) => hyp(c.x, c.z, x, z) < 15);
      const plan = wallPlan(base.x, base.z);
      for (const g of plan.gates) {
        if (!free(g.x, g.z) || walls.some((b) => b.kind === 'gate' && hyp(b.x, b.z, g.x, g.z) < 8)) continue;
        // (Its spot taken by a tree, say: the next along the wall.)
        const along = plan.lines.find((l) => (l[0] === l[2] && l[0] === g.x) || (l[1] === l[3] && l[1] === g.z));
        const ax = along && along[1] === along[3] ? 3 : 0;
        const az = ax ? 0 : 3;
        for (const k of [0, 1, -1, 2, -2]) if (w.place(s.seat, 'gate', g.x + ax * k, g.z + az * k, [])) break;
      }
      for (const l of plan.lines) for (const c of wallLine(l[0], l[1], l[2], l[3])) {
        if (s.steel < 60) break;
        if (free(c.x, c.z)) w.place(s.seat, 'rampart', c.x, c.z, []);
      }
    }

    // --- Training: answering what it has seen ---------------------------------------------------
    const seen = (...list: UnitKind[]) => [...this.seenUnits.values()].filter((m) => list.includes(m.kind)).length;
    const enemyHelis = seen('heli');
    const enemyArmour = seen(...ARMOUR);
    const forts = [...this.seenBuildings.values()].filter((b) => b.kind === 'tower' || b.kind === 'bunker').length;
    for (const b of bld) {
      if (b.built < 1 || b.queue.length >= 2 || poor || ((saving || eraSaving) && !home.length && b.kind !== 'hq')) continue;
      let kind: UnitKind | null = null;
      if (b.kind === 'barracks') {
        const wantScout = kinds('scout').length < 1 && w.time > 180 && w.time - this.scoutedAt > 120;
        if (wantScout) this.scoutedAt = w.time;
        // Anti-tank teams when the enemy fields armour: about one for each, up to half its infantry and two.
        // (From Era II, a medic for every six riflemen.)
        const wantMedic = age >= 2 && kinds('medic').length < Math.floor(kinds('rifle').length / 6);
        kind = wantScout ? 'scout' : wantMedic ? 'medic' : enemyArmour > kinds('at').length * 0.85 && kinds('at').length < 2 + kinds('rifle').length / 2 ? 'at' : 'rifle';
      } else if (b.kind === 'factory') {
        // Flak for helicopters; artillery to crack what's dug in; otherwise tanks.
        const shells = age >= 3 && w.time > 900 && kinds('artillery').length < 2 + forts && (forts >= 2 || Math.random() < (this.kind === 'turtle' ? 0.5 : 0.3));
        kind = enemyHelis >= 2 && kinds('aa').length < 2 + Math.floor(enemyHelis / 2) ? 'aa' : shells ? 'artillery' : Math.random() < st.tanks ? 'tank' : null;
      } else if (b.kind === 'dock') kind = kinds('gunboat').length < 2 ? 'gunboat' : null;
      else if (b.kind === 'airfield') kind = 'heli';
      else if (b.kind === 'hq' && w.time > 720 && s.steel > 450 && s.oil > 180) kind = 'hero';
      if (kind && age >= (AGE_NEEDS[kind] ?? 1)) w.train(b, kind);
    }
    // Research: the lab takes the upgrades in turn as it can pay.
    for (const b of bld) {
      if (b.kind !== 'lab' || b.built < 1 || b.research) continue;
      for (const tech of ['ordnance', 'armor', 'logistics', 'optics', 'engines', 'medicine'] as const) if (w.research(b, tech)) break;
    }

    // --- The war --------------------------------------------------------------------------------
    const scout = smart ? kinds('scout')[0] : undefined;
    const raiders = sharp && st.air && kinds('heli').length >= 3 ? kinds('heli') : [];
    const enemies = w.enemies(s.seat).filter((e) => e.seat !== WILD);
    const sx = Math.sign(-base.x || 1);
    const sz = Math.sign(-base.z || 1);
    const front = { x: base.x + sx * 22, z: base.z + sz * 22 };
    // The badly hurt, far from home and in a fight, go back to mend (at the HQ or a depot) and rejoin
    // when they're fit; not when the base itself is under attack, or an enemy uplink is counting down.
    const careful = this.skill >= 0.6;
    if (careful) {
      for (const id of this.wounded) {
        const u = w.units.get(id);
        if (!u || u.hp >= u.max * 0.8 || home.length) this.wounded.delete(id);
      }
      if (posts.length && !home.length && !this.uplinkAgainst(w, enemies)) {
        for (const u of mine) {
          if (!fights(u) || u.kind === 'medic' || u.lake >= 0 || u.inside || this.wounded.has(u.id) || u.hp > u.max * 0.3 || w.time - u.hitAt > 4) continue;
          const post = [...posts].sort((a, b) => hyp(a.x, a.z, u.x, u.z) - hyp(b.x, b.z, u.x, u.z))[0];
          if (hyp(post.x, post.z, u.x, u.z) < 30) continue;
          this.wounded.add(u.id);
          this.raid.delete(u.id);
          this.flank.delete(u.id);
          w.command([u.id], s.seat, { t: 'move', x: post.x + (Math.random() - 0.5) * 6, z: post.z + (Math.random() - 0.5) * 6, attack: false });
        }
      }
    } else this.wounded.clear();
    // Raids: a few quick units off after the enemy's engineers at their work, while the main army waits.
    for (const id of this.raid) if (!w.units.has(id)) this.raid.delete(id);
    if (this.raid.size && (w.time > this.raidUntil || this.raid.size < 2 || home.length)) this.endRaid(w, s, front);
    const army = mine.filter((u) => fights(u) && u.lake < 0 && !u.inside && u !== scout && !raiders.includes(u) && !this.wounded.has(u.id) && !this.raid.has(u.id));

    // The scout goes round the enemy's bases and the camps, and reports.
    if (scout && scout.order.t === 'idle') {
      const stops = [...enemies.map((e) => BASES[e.seat]), ...w.relics];
      const p = stops[this.scoutStop++ % stops.length];
      if (p) w.command([scout.id], s.seat, { t: 'move', x: p.x, z: p.z, attack: false });
    }
    // Bunkers: infantry go in, four to each.
    for (const b of bld) {
      if (b.kind !== 'bunker' || b.built < 1) continue;
      const room = 4 - mine.filter((u) => u.inside?.id === b.id || (u.order.t === 'enter' && u.order.id === b.id)).length;
      const go = army.filter((u) => u.kind === 'rifle' && u.order.t === 'idle' && hyp(u.x, u.z, base.x, base.z) < 45).slice(0, Math.max(0, room));
      if (go.length) w.command(go.map((u) => u.id), s.seat, { t: 'enter', id: b.id, boat: false });
    }
    // Gunboats: out across the lake towards the nearest enemy it knows of, fighting what they meet.
    const boats = mine.filter((u) => u.kind === 'gunboat' && u.order.t === 'idle');
    if (boats.length >= 2) {
      const t = this.target(w, s, enemies);
      if (t) {
        const p = inside(boats[0].lake, t.x, t.z, 3);
        w.command(boats.map((u) => u.id), s.seat, { t: 'move', x: p.x, z: p.z, attack: true });
      }
    }
    // Rally: the commander calls it when a fight is on round him and he has company.
    const hero = mine.find((u) => u.kind === 'hero');
    if (hero && s.rallyAt <= w.time) {
      const near = mine.filter((u) => u !== hero && hyp(u.x, u.z, hero.x, hero.z) < 18).length;
      if (near >= 3 && foes.some((f) => hyp(f.x, f.z, hero.x, hero.z) < 22)) w.rally(s.seat);
    }
    // Helicopter raids: the enemy's engineers, wherever it last saw them; else its base.
    if (raiders.length) {
      const t = this.target(w, s, enemies);
      const prey = foes.filter((f) => f.kind === 'engineer' && f.seat !== WILD).sort((a, b) => hyp(a.x, a.z, raiders[0].x, raiders[0].z) - hyp(b.x, b.z, raiders[0].x, raiders[0].z))[0];
      const at = home.length ? home[0] : prey ?? t;
      if (at) this.go(w, s, raiders, at.x, at.z, true);
    }

    // Defence: as many as it takes, nearest first. Not the whole army for one scout.
    const armyPower = power(army);
    const homePower = power(home);
    let defenders: Unit[] = [];
    if (home.length) {
      const at = home[0];
      const small = home.length <= 2 && homePower < 150;
      if (!smart || homePower > armyPower * 0.6 || (!small && this.mode !== 'push')) {
        // Serious: everyone home. (What it can see of an attack is only the front of it.)
        defenders = army;
        if (this.mode !== 'build') this.mode = 'build';
      } else {
        const near = [...army].sort((a, b) => hyp(a.x, a.z, at.x, at.z) - hyp(b.x, b.z, at.x, at.z));
        let got = 0;
        for (const u of near) {
          if (got >= homePower * 1.6 + 60) break;
          // (An attack well under way doesn't turn round for a raid: what's near home handles it.)
          if (this.mode === 'push' && hyp(u.x, u.z, base.x, base.z) > 60) break;
          defenders.push(u);
          got += worth(u.kind);
        }
      }
      this.go(w, s, defenders, at.x, at.z, true);
    }
    // A supply drop near enough: the three nearest go and get it (not out of an attack).
    let runners: Unit[] = [];
    if (smart && !home.length && (this.mode === 'build' || this.mode === 'muster')) {
      const d = w.drops.filter((p) => p.at - w.time < 9 && hyp(p.x, p.z, base.x, base.z) < 120 && !raiding(p.x, p.z, 14)).sort((p, q) => hyp(p.x, p.z, base.x, base.z) - hyp(q.x, q.z, base.x, base.z))[0];
      if (d) {
        runners = army.filter((u) => !defenders.includes(u)).sort((a, b) => hyp(a.x, a.z, d.x, d.z) - hyp(b.x, b.z, d.x, d.z)).slice(0, 3);
        this.go(w, s, runners, d.x, d.z, true);
      }
    }
    const rest = army.filter((u) => !defenders.includes(u) && !runners.includes(u));

    // Camps: once the army's up to it and nothing threatens the base, it goes and takes the nearest
    // relic that isn't its side's, clears the wild guards, and holds it.
    const ours = (i: number) => w.relics[i].owner >= 0 && w.slots[w.relics[i].owner]?.team === s.team;
    const campWorth = 3 * worth('guard') + worth('brute');
    if (this.camp >= 0 && (ours(this.camp) || rest.length < 4 || home.length)) this.camp = -1;
    if (this.camp < 0 && this.mode === 'build' && !home.length && w.time > 360 && (smart ? power(rest) >= campWorth * 0.9 : rest.length >= 7)) {
      let best = -1;
      let bd = 1e9;
      w.relics.forEach((r, i) => {
        if (ours(i)) return;
        const d = hyp(r.x, r.z, base.x, base.z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0 && bd < 150 && Math.random() < 0.5 + this.skill * 0.4) this.camp = best;
    }

    if (careful && !w.stand) this.raiding(w, s, rest, foes, enemies, front);

    const need = st.army + this.wave * st.grow + Math.round((1 - this.skill) * 8);
    // An enemy uplink running: everything goes at it now, and keeps going.
    const urgent = !!this.uplinkAgainst(w, enemies) && w.time >= w.peaceUntil;
    const full = s.pop >= Math.min(s.cap, 60) - 2;
    // (No one comes for you early: time to build a base before the first fight.)
    const firstAttack = this.skill < 0.4 ? 900 : this.skill < 0.8 ? 660 : 540;

    if (this.mode === 'fallback') {
      if (w.time >= this.until) this.mode = 'build';
    } else if (this.camp >= 0) {
      const r = w.relics[this.camp];
      this.go(w, s, rest, r.x, r.z, true);
    } else if (this.mode === 'build') {
      this.go(w, s, rest.filter((u) => u.order.t === 'idle' && hyp(u.x, u.z, base.x, base.z) > 30), front.x, front.z, true);
      if (urgent && rest.length >= 3) {
        this.chooseFoe(w, s, enemies);
        this.wave++;
        this.mode = 'push';
      } else if (!w.stand && !home.length && w.time >= Math.max(firstAttack, w.peaceUntil - 20, this.nextPush) && (rest.length >= need || (full && rest.length >= 6))) {
        const t = this.chooseFoe(w, s, enemies);
        // Not against what it knows it can't beat, unless it can't get any bigger.
        if (t && (!smart || full || rest.length >= need * 1.5 || power(rest) >= this.strengthOf(this.foeSeat) * 0.7)) {
          this.wave++;
          this.mode = smart ? 'muster' : 'push';
          this.until = w.time + 35;
          this.planFlank(rest, t, base);
          this.say(w, s, 'attack');
        }
      }
    } else if (this.mode === 'muster') {
      const t = this.target(w, s, enemies);
      if (!t) this.mode = 'build';
      else {
        const stage = this.stage(t, base);
        // (The flankers gather off to one side, to come in on the enemy's flank.)
        const flankers = this.flankAt ? rest.filter((u) => this.flank.has(u.id)) : [];
        const fa = this.flankAt;
        this.go(w, s, rest.filter((u) => !flankers.includes(u)), stage.x, stage.z, true);
        if (fa) this.go(w, s, flankers, fa.x, fa.z, true);
        const there = rest.filter((u) => (fa && flankers.includes(u) ? hyp(u.x, u.z, fa.x, fa.z) : hyp(u.x, u.z, stage.x, stage.z)) < 18).length;
        if (there >= rest.length * 0.7 || w.time >= this.until) this.mode = 'push';
      }
    } else {
      const t = this.target(w, s, enemies);
      const spent = rest.length < (urgent ? 1 : Math.max(3, need / 3));
      if (!t || spent) this.fallBack(w, s, rest, front, smart ? 14 : 0);
      else {
        // The ones at the front of the attack: if what's round them is too much, get out.
        const lead = [...rest].sort((a, b) => hyp(a.x, a.z, t.x, t.z) - hyp(b.x, b.z, t.x, t.z)).slice(0, Math.ceil(rest.length / 2));
        const cx = lead.reduce((n, u) => n + u.x, 0) / lead.length;
        const cz = lead.reduce((n, u) => n + u.z, 0) / lead.length;
        const facing = foes.filter((f) => fights(f) && hyp(f.x, f.z, cx, cz) < 26);
        const dug = [...this.seenBuildings.values()].filter((b) => (b.kind === 'tower' || b.kind === 'bunker') && hyp(b.x, b.z, cx, cz) < 22).length;
        const theirs = power(facing) + dug * FORT;
        const ourLocal = power(rest.filter((u) => hyp(u.x, u.z, cx, cz) < 26));
        if (smart && !urgent && theirs > ourLocal * 1.35 && hyp(cx, cz, base.x, base.z) > 40) {
          this.fallBack(w, s, rest, front, 20);
          this.say(w, s, 'retreat');
        }
        else {
          // On with the attack: those at the front at once, those coming from home in groups of three or more.
          const far = rest.filter((u) => hyp(u.x, u.z, cx, cz) > 40);
          const forward = rest.filter((u) => !far.includes(u));
          this.go(w, s, forward, t.x, t.z, true);
          if (far.length >= 3) this.go(w, s, far, t.x, t.z, true);
        }
      }
    }
    if (this.skill >= 0.6) this.focus(w, s, rest, foes);
    if (smart && w.time >= w.peaceUntil) this.useAbilities(w, s, mine, foes);

    // --- The special power ----------------------------------------------------------------------
    if (s.powerAt <= w.time) {
      if (s.doctrine === 'industrial') {
        const spot = sharp || home.length ? this.bestBombing(foes, home.length ? 300 : 500) : null;
        const t = spot ?? (this.mode === 'push' ? this.target(w, s, enemies) : null);
        if (t) w.power(s.seat, t.x, t.z);
      } else if (s.doctrine === 'armored') {
        if (home.length || this.mode !== 'build' || w.time > 600) w.power(s.seat, 0, 0);
      } else if (this.mode === 'muster' || (!this.seenBuildings.size && w.time > 300)) w.power(s.seat, 0, 0);
    }
  }

  /** What its side can see this moment (the enemy's units, and the wild's), and what it remembers. */
  private look(w: World, s: Slot, mine: Unit[], bld: Building[]): Unit[] {
    const eyes: number[] = [];
    for (const u of mine) if (!u.inside) eyes.push(u.x, u.z, UNITS[u.kind].sight ?? (UNITS[u.kind].air ? SIGHT.air : SIGHT.unit));
    for (const b of bld) if (b.built >= 1) eyes.push(b.x, b.z, SIGHT.building);
    // (From 0.8 it sees the whole map: Hard says so. Every other bot plays in the fog.)
    const all = s.revealUntil > w.time || (this.skill >= 0.8 && !this.adaptive);
    const sees = (x: number, z: number) => {
      if (all) return true;
      for (let i = 0; i < eyes.length; i += 3) if (hyp(eyes[i], eyes[i + 1], x, z) <= eyes[i + 2]) return true;
      return false;
    };
    const against = new Set(w.enemies(s.seat).map((e) => e.seat));
    const foes: Unit[] = [];
    for (const u of w.units.values()) {
      if (!against.has(u.seat) || u.inside || !sees(u.x, u.z)) continue;
      foes.push(u);
      if (u.seat !== WILD) this.seenUnits.set(u.id, { kind: u.kind, seat: u.seat, t: w.time });
      if (u.kind === 'engineer' && u.order.t === 'gather') this.seenWork.set(u.id, { seat: u.seat, x: u.x, z: u.z, t: w.time });
    }
    for (const [id, m] of this.seenUnits) if (!w.units.has(id) || w.time - m.t > 120) this.seenUnits.delete(id);
    for (const b of w.buildings.values()) if (against.has(b.seat) && !BUILDINGS[b.kind].wall && (b.kind === 'uplink' || sees(b.x, b.z))) this.seenBuildings.set(b.id, { kind: b.kind, seat: b.seat, x: b.x, z: b.z });
    for (const [id, b] of this.seenBuildings) if ((!w.buildings.has(id) && sees(b.x, b.z)) || !against.has(b.seat)) this.seenBuildings.delete(id);
    return foes;
  }

  /** How much it believes an enemy has: the army it has seen, and the forts. */
  private strengthOf(seat: number): number {
    let n = 0;
    for (const m of this.seenUnits.values()) if (m.seat === seat && m.kind !== 'engineer') n += worth(m.kind);
    for (const b of this.seenBuildings.values()) if (b.seat === seat && (b.kind === 'tower' || b.kind === 'bunker')) n += FORT;
    return n;
  }

  /** Which enemy to go after: near, and weak by what it has seen. It sticks with one until that one's out. */
  private chooseFoe(w: World, s: Slot, enemies: Slot[]): { x: number; z: number } | null {
    const base = BASES[s.seat];
    let best: Slot | null = null;
    let score = 1e9;
    for (const e of enemies) {
      const sc = hyp(BASES[e.seat].x, BASES[e.seat].z, base.x, base.z) * 3 + this.strengthOf(e.seat) * 0.5;
      if (sc < score) {
        score = sc;
        best = e;
      }
    }
    this.foeSeat = best ? best.seat : -1;
    return this.target(w, s, enemies);
  }

  /** Where to strike: the chosen enemy's HQ if it has seen it, else the nearest of its buildings it knows, else where its base must be. */
  private target(w: World, s: Slot, enemies: Slot[]): { x: number; z: number } | null {
    // (An enemy uplink comes before everything: it wins them the match.)
    const up = this.uplinkAgainst(w, enemies);
    if (up) {
      this.foeSeat = up.seat;
      return up;
    }
    if (!enemies.some((e) => e.seat === this.foeSeat)) {
      if (!enemies.length) return null;
      return this.chooseFoe(w, s, enemies);
    }
    const base = BASES[s.seat];
    const known = [...this.seenBuildings.values()].filter((b) => b.seat === this.foeSeat);
    const hq = known.find((b) => b.kind === 'hq');
    if (hq) return hq;
    const near = known.sort((a, b) => hyp(a.x, a.z, base.x, base.z) - hyp(b.x, b.z, base.x, base.z))[0];
    return near ?? BASES[this.foeSeat];
  }

  /** An enemy uplink, if there is one (everyone sees them): the nearest to its clock running out. */
  private uplinkAgainst(w: World, enemies: Slot[]): Building | null {
    const seats = new Set(enemies.map((e) => e.seat));
    return [...w.buildings.values()].filter((b) => b.kind === 'uplink' && seats.has(b.seat)).sort((a, b) => (a.doneAt ?? 1e9) - (b.doneAt ?? 1e9))[0] ?? null;
  }

  /** Where to gather before going in: on the way, well short of the army it's going to meet, on open ground. */
  private stage(t: { x: number; z: number }, base: { x: number; z: number }): { x: number; z: number } {
    const d = hyp(t.x, t.z, base.x, base.z) || 1;
    for (let back = 62; back < d; back += 4) {
      const x = t.x + ((base.x - t.x) / d) * back;
      const z = t.z + ((base.z - t.z) / d) * back;
      if (!inLake(x, z, 3) && !inMesa(x, z, 3)) return { x, z };
    }
    return base;
  }

  /** Out of a fight it's losing: everyone back to the front of the base, not stopping to shoot. */
  private fallBack(w: World, s: Slot, army: Unit[], front: { x: number; z: number }, seconds: number): void {
    this.mode = seconds ? 'fallback' : 'build';
    this.flank.clear();
    this.flankAt = null;
    this.nextPush = w.time + 240;
    this.until = w.time + seconds;
    if (army.length) w.command(army.map((u) => u.id), s.seat, { t: 'move', x: front.x, z: front.z, attack: seconds === 0 });
  }

  /** Order a group somewhere, leaving alone those already on their way there or in a fight. */
  private go(w: World, s: Slot, list: Unit[], x: number, z: number, attack: boolean): void {
    const send = list.filter((u) => u.order.t !== 'attack' && !(u.order.t === 'move' && u.order.attack === attack && hyp(u.order.x, u.order.z, x, z) < 14));
    if (send.length) w.command(send.map((u) => u.id), s.seat, { t: 'move', x, z, attack });
  }

  /**
   * In a fight, each picks its target: what it's best against first, then what's worth most for the
   * health it has left (the wounded, finished off), and not one already as good as dead to the fire on it.
   */
  private focus(w: World, s: Slot, army: Unit[], foes: Unit[]): void {
    /** The fire already on each target (damage a second). */
    const fire = new Map<number, number>();
    for (const u of army) if (u.order.t === 'attack' && !u.order.building) fire.set(u.order.id, (fire.get(u.order.id) ?? 0) + UNITS[u.kind].damage * UNITS[u.kind].rate);
    for (const u of army) {
      const d = UNITS[u.kind];
      if (d.damage <= 0 || u.kind === 'artillery' || (u.order.t !== 'idle' && !(u.order.t === 'move' && u.order.attack))) continue;
      const want = PREFERS[u.kind];
      const hits = d.hits ?? 'ground';
      const reach = d.range + 2;
      let best: Unit | null = null;
      let score = 0;
      for (const f of foes) {
        const air = !!UNITS[f.kind].air;
        if ((air && hits === 'ground') || (!air && hits === 'air') || hyp(f.x, f.z, u.x, u.z) > reach) continue;
        // (Enough on it already: it'll be dead in a couple of seconds.)
        if ((fire.get(f.id) ?? 0) * 2 >= f.hp) continue;
        const sc = ((want?.includes(f.kind) ? 2.5 : 1) * (worth(f.kind) + 40)) / (f.hp + 25);
        if (sc > score) {
          score = sc;
          best = f;
        }
      }
      if (!best) continue;
      // (Only worth an order when it isn't what it'd shoot anyway: a clear choice, or what it's best against.)
      if (!want?.includes(best.kind) && best.hp > best.max * 0.5) continue;
      fire.set(best.id, (fire.get(best.id) ?? 0) + d.damage * d.rate);
      w.command([u.id], s.seat, { t: 'attack', id: best.id, building: false });
    }
  }

  /** Who goes round the side: from a big enough army, the quickest third (not the guns or the commander), and where they gather. */
  private planFlank(army: Unit[], t: { x: number; z: number }, base: { x: number; z: number }): void {
    this.flank.clear();
    this.flankAt = null;
    if (this.skill < 0.7 || army.length < 10) return;
    const quick = army.filter((u) => u.kind !== 'artillery' && u.kind !== 'hero' && u.kind !== 'medic' && !UNITS[u.kind].air).sort((a, b) => UNITS[b.kind].speed - UNITS[a.kind].speed);
    const n = Math.floor(army.length / 3);
    if (quick.length < n) return;
    const stage = this.stage(t, base);
    // Off to one side of the line in, as far round as the ground allows.
    const d = hyp(t.x, t.z, stage.x, stage.z) || 1;
    const px = -(t.z - stage.z) / d;
    const pz = (t.x - stage.x) / d;
    const side = Math.random() < 0.5 ? 1 : -1;
    for (const off of [36, 30, 24, -36, -30, -24]) {
      const x = stage.x + px * off * side + ((t.x - stage.x) / d) * 14;
      const z = stage.z + pz * off * side + ((t.z - stage.z) / d) * 14;
      if (Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8 || inLake(x, z, 4) || inMesa(x, z, 4)) continue;
      this.flankAt = { x, z };
      for (const u of quick.slice(0, n)) this.flank.add(u.id);
      return;
    }
  }

  /**
   * A raid on the enemy's engineers: from the middle game, every few minutes (a rusher more often),
   * when the army at home is big enough to spare them, three or four of its quickest go for the
   * engineers it last saw at work away from the enemy's towers. They give up when they're beaten, or when
   * there's no one there.
   */
  private raiding(w: World, s: Slot, rest: Unit[], foes: Unit[], enemies: Slot[], front: { x: number; z: number }): void {
    for (const [id, m] of this.seenWork) if (!w.units.has(id) || w.time - m.t > 150) this.seenWork.delete(id);
    const party = [...this.raid].map((id) => w.units.get(id)).filter((u): u is Unit => !!u);
    if (party.length && this.raidTo) {
      const cx = party.reduce((n, u) => n + u.x, 0) / party.length;
      const cz = party.reduce((n, u) => n + u.z, 0) / party.length;
      const facing = foes.filter((f) => fights(f) && hyp(f.x, f.z, cx, cz) < 22);
      const dug = [...this.seenBuildings.values()].filter((b) => (b.kind === 'tower' || b.kind === 'bunker') && hyp(b.x, b.z, cx, cz) < 20).length;
      // Outgunned: home. There, and no one to shoot: home.
      const there = hyp(cx, cz, this.raidTo.x, this.raidTo.z) < 10;
      const prey = foes.filter((f) => f.kind === 'engineer' && f.seat !== WILD && hyp(f.x, f.z, cx, cz) < 24);
      if (power(facing) + dug * FORT > power(party) * 1.1 || (there && !prey.length)) {
        this.endRaid(w, s, front);
        return;
      }
      if (prey.length) {
        // Go for the engineers themselves.
        const free = party.filter((u) => u.order.t !== 'attack');
        for (const u of free) {
          const e = prey.sort((a, b) => hyp(a.x, a.z, u.x, u.z) - hyp(b.x, b.z, u.x, u.z))[0];
          w.command([u.id], s.seat, { t: 'attack', id: e.id, building: false });
        }
      } else this.go(w, s, party, this.raidTo.x, this.raidTo.z, false);
      return;
    }
    if (this.mode !== 'build' || this.camp >= 0 || w.time < Math.max(420, w.peaceUntil + 30) || w.time < this.raidAt || rest.length < 9) return;
    // Where: engineers seen at work lately, not under the enemy's towers.
    const forts = [...this.seenBuildings.values()].filter((b) => b.kind === 'tower' || b.kind === 'bunker' || b.kind === 'hq');
    const enemySeats = new Set(enemies.map((e) => e.seat));
    const spots = [...this.seenWork.values()].filter((m) => enemySeats.has(m.seat) && !forts.some((b) => hyp(b.x, b.z, m.x, m.z) < 22));
    const base = BASES[s.seat];
    const to = spots.sort((a, b) => hyp(a.x, a.z, base.x, base.z) - hyp(b.x, b.z, base.x, base.z))[0];
    if (!to) return;
    const quick = rest.filter((u) => (u.kind === 'scout' || u.kind === 'rifle' || u.kind === 'tank') && u.hp > u.max * 0.7).sort((a, b) => UNITS[b.kind].speed - UNITS[a.kind].speed).slice(0, this.kind === 'rusher' ? 5 : 4);
    if (quick.length < 3) return;
    this.raidAt = w.time + (this.kind === 'rusher' ? 120 : 200) + Math.random() * 60;
    this.raidUntil = w.time + 100;
    this.raidTo = { x: to.x, z: to.z };
    for (const u of quick) this.raid.add(u.id);
    w.command(quick.map((u) => u.id), s.seat, { t: 'move', x: to.x, z: to.z, attack: false });
  }

  /** The raiders come home. */
  private endRaid(w: World, s: Slot, front: { x: number; z: number }): void {
    const ids = [...this.raid].filter((id) => w.units.has(id));
    this.raid.clear();
    this.raidTo = null;
    if (ids.length) w.command(ids, s.seat, { t: 'move', x: front.x, z: front.z, attack: false });
  }

  /** Its units' special abilities, where they'd earn their keep. */
  private useAbilities(w: World, s: Slot, mine: Unit[], foes: Unit[]): void {
    const ready = (k: UnitKind) => mine.filter((u) => u.kind === k && u.abilityAt <= w.time && !u.inside);
    const ground = foes.filter((f) => f.seat !== WILD && !UNITS[f.kind].air);
    const worthAt = (x: number, z: number, r: number) => ground.reduce((n, o) => n + (hyp(o.x, o.z, x, z) < r ? worth(o.kind) : 0), 0);
    // A few mines on the way into the base, once it can spare the steel.
    const base = BASES[s.seat];
    const sapper = mine.find((u) => u.kind === 'engineer' && u.abilityAt <= w.time && u.order.t === 'gather' && u.carry < 8);
    if (sapper && w.time > 480 && s.steel > 320 && w.minesOf(s.seat) < (this.kind === 'turtle' ? 8 : 4)) {
      const a = Math.atan2(-Math.sign(base.z || 1), -Math.sign(base.x || 1)) + (Math.random() - 0.5) * 1.6;
      const r = 30 + Math.random() * 12;
      const x = Math.max(-HALF + 6, Math.min(HALF - 6, base.x + Math.cos(a) * r));
      const z = Math.max(-HALF + 6, Math.min(HALF - 6, base.z + Math.sin(a) * r));
      if (!inLake(x, z, 3) && !inMesa(x, z, 3)) w.ability(s.seat, [sapper.id], 'engineer', x, z);
    }
    // A barrage on the thickest knot in long reach.
    const guns = ready('artillery');
    if (guns.length) {
      const reach = ABILITIES.artillery!.range;
      const spot = this.bestBombing(ground.filter((f) => hyp(f.x, f.z, guns[0].x, guns[0].z) < reach), 200);
      if (spot) w.ability(s.seat, guns.map((u) => u.id), 'artillery', spot.x, spot.z);
    }
    // Grenades on infantry bunched up within a throw (those stopped to fight: moving ones would get away).
    const throwers = ready('rifle');
    if (throwers.length) {
      const reach = ABILITIES.rifle!.range - 1;
      const knot = ground.find((f) => f.order.t !== 'move' && throwers.some((u) => hyp(u.x, u.z, f.x, f.z) < reach) && worthAt(f.x, f.z, 4) >= 200);
      if (knot) w.ability(s.seat, throwers.filter((u) => hyp(u.x, u.z, knot.x, knot.z) < reach).map((u) => u.id), 'rifle', knot.x, knot.z);
    }
    // Rockets on armour in reach.
    for (const h of ready('heli')) {
      const t = ground.find((f) => ARMOUR.includes(f.kind) && hyp(f.x, f.z, h.x, h.z) < ABILITIES.heli!.range);
      if (t) w.ability(s.seat, [h.id], 'heli', t.x, t.z);
    }
    // Smoke when a tank's in trouble; flak when there's something to shoot; a braced launcher on armour just out of reach.
    for (const t of ready('tank')) if (t.hp < t.max * 0.7 && t.hitAt > w.time - 2) w.ability(s.seat, [t.id], 'tank', 0, 0);
    for (const a of ready('aa')) if (foes.some((f) => UNITS[f.kind].air && hyp(f.x, f.z, a.x, a.z) < UNITS.aa.range)) w.ability(s.seat, [a.id], 'aa', 0, 0);
    for (const a of ready('at')) if (ground.some((f) => ARMOUR.includes(f.kind) && hyp(f.x, f.z, a.x, a.z) < UNITS.at.range * 1.3)) w.ability(s.seat, [a.id], 'at', 0, 0);
  }

  /** The thickest knot of the enemy it can see, if it's worth a bombing. */
  private bestBombing(foes: Unit[], least: number): { x: number; z: number } | null {
    const targets = foes.filter((f) => f.seat !== WILD && !UNITS[f.kind].air);
    let best: Unit | null = null;
    let most = least;
    for (const f of targets) {
      const v = targets.reduce((n, o) => n + (hyp(o.x, o.z, f.x, f.z) < 8 ? worth(o.kind) : 0), 0);
      if (v > most) {
        most = v;
        best = f;
      }
    }
    return best;
  }

  /** Put up a building: on a lake's shore, out in front of the base, or in a free spot round it. */
  private raise(w: World, s: Slot, next: BuildingKind, n: number, count: (k: BuildingKind) => number, builder: Unit, second: Unit | undefined): void {
    const base = BASES[s.seat];
    if (next === 'dock') {
      const l = LAKES[lakeOf(base.x, base.z)];
      const to = Math.atan2(base.z - l.z, base.x - l.x);
      for (let attempt = 0; attempt < 12; attempt++) {
        const a = to + (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * 0.35;
        if (w.place(s.seat, 'dock', l.x + Math.cos(a) * (l.r + 3), l.z + Math.sin(a) * (l.r + 3), [builder.id])) return;
      }
      return;
    }
    if (next === 'bunker') {
      const sx = Math.sign(-base.x || 1);
      const sz = Math.sign(-base.z || 1);
      for (let attempt = 0; attempt < 10; attempt++) {
        const x = base.x + sx * (17 + attempt) + (count('bunker') ? -sz * 8 : sz * 8);
        const z = base.z + sz * (17 + attempt) + (count('bunker') ? sx * 8 : -sx * 8);
        if (w.place(s.seat, 'bunker', x, z, [builder.id])) return;
      }
      return;
    }
    for (let attempt = 0; attempt < 16; attempt++) {
      const ang = n * 1.05 + attempt * 0.8;
      const r = 12 + (attempt % 4) * 3.5;
      const x = Math.max(-HALF + 8, Math.min(HALF - 8, base.x + Math.cos(ang) * r));
      const z = Math.max(-HALF + 8, Math.min(HALF - 8, base.z + Math.sin(ang) * r));
      if (w.place(s.seat, next, x, z, [builder.id, ...(second ? [second.id] : [])])) return;
    }
  }
}
