import type { Bot, GameContext, Player, Vec3 } from '@platform';
import { navGrid, shooterBots, throwables, type BotMind, type NavGrid, type ShooterBots } from '@platform/kits';
import type { Bus } from './bus';
import type { Chests } from './chests';
import { CENTER, RADIUS, SITES } from './island';
import { BANDAGE, carried, lying, MAX_GUNS, MAX_SHIELD } from './loot';
import { fighterOf, match } from './match';
import { BOT_WEAPONS, FAMILIES, parseGun } from './weapons';
import type { Zone } from './zone';

/**
 * Bot players. Each rides the bus, picks a landmark to drop on, steps off when the bus is near
 * it, dives and steers its parachute onto the spot, and from there it's a fighter: it looks for
 * chests and loot, heals when nobody's shooting, keeps ahead of the storm and fights whoever it
 * meets. The fighting, the walking (`navGrid`) and the aim are the platform's `shooterBots` kit,
 * told what's fair game and where to go.
 */

/** What the bots' parts need from the match. */
export interface BotWorld {
  bus(): Bus | null;
  zone(): Zone | null;
  chests: Chests;
  /** The scout (a hidden bot that loads the island): never a target. */
  scout(): Player | null;
}

interface Brain {
  bot: Bot;
  skill: number;
  /** Where it means to land. */
  landing: Vec3;
  /** How far from `landing` (blocks, along the ground) the bus is when it steps off. */
  jumpAt: number;
  side: 1 | -1;
  state: 'deck' | 'air' | 'ground';
  /** The chest it's after (an index into the chests), and when it gave up on it. */
  chest: number;
  chestUntil: number;
  /** Chests it couldn't find a way to, and until when it leaves them alone. */
  skip: Map<number, number>;
  /** What it's using to heal, and until when. */
  healing: { slot: number; until: number } | null;
  /** When it last looked at what's around it for loot. */
  pickup: Vec3 | null;
}

/** Where the bot's walking grid reaches: the island, from the sea floor to the hilltops. */
const BOUNDS = { min: { x: CENTER.x - RADIUS - 12, y: 58, z: CENTER.z - RADIUS - 12 }, max: { x: CENTER.x + RADIUS + 12, y: 108, z: CENTER.z + RADIUS + 12 } };

export class Bots {
  readonly nav: NavGrid;
  readonly kit: ShooterBots;
  private brains = new Map<string, Brain>();
  /** Which chests a bot can walk to (not the ones up a ladder): worked out once the walking grid is built. */
  private reach: boolean[] | null = null;
  /** The hotspots the kit drifts between (filled once the reachable chests are known). */
  private readonly hot: Vec3[] = [];
  /** Pickups no bot could find a way to (up a ladder, behind glass): left alone. */
  private readonly unreachable = new Set<number>();
  /** Landmarks taken so far this match, so the bots spread out. */
  private taken = new Map<number, number>();

  constructor(
    private game: GameContext,
    private w: BotWorld,
  ) {
    this.nav = navGrid(game, { bounds: BOUNDS });
    this.kit = shooterBots(game, {
      nav: this.nav,
      // Fights happen where the loot is: the landmarks, and the middle.
      hotspots: this.hot,
      weapons: BOT_WEAPONS,
      // A bot that's out looting stays with what it carries: it picks the gun for the fight (`weapon`), and heals with the rest.
      moves: { homeSlot: null, hotspot: 1 },
      hostile: (bot, other) => this.fair(bot, other),
      goal: (bot, mind) => this.goal(bot, mind),
      weapon: (bot, _mind, distance) => this.bestGun(bot, distance),
      throw: (bot, at, mind) => this.lob(bot, at, mind),
    });
  }

  /**
   * Once the walking grid is built: which chests can be walked to from the middle of the village (a
   * chest up a ladder can't: the grid doesn't climb), and where the bots drift between: the reachable chests.
   */
  prepare() {
    if (this.reach || !this.nav.ready) return;
    // From a spot on the village's road (the well in the middle isn't somewhere to stand).
    const from = SITES[0].at(8, 1, 0);
    const spots = this.w.chests.spots;
    this.reach = spots.map((s) => s.kind === 'chest' && !!this.nav.path(from, { x: s.x + 0.5, y: s.y, z: s.z + 0.5 }, 160000));
    this.hot.length = 0;
    spots.forEach((s, i) => {
      if (this.reach![i]) this.hot.push({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 });
    });
    this.hot.push({ x: CENTER.x, y: this.game.world.surfaceY(CENTER.x, CENTER.z) + 1, z: CENTER.z });
    if (import.meta.env.DEV) console.log(`[blockroyale] chests a bot can reach: ${this.reach.filter(Boolean).length} of ${spots.filter((s) => s.kind === 'chest').length}`);
  }

  /** A chest that turned up during the match (a supply drop): whether a bot can walk to it. */
  consider(i: number) {
    if (!this.reach) return;
    const s = this.w.chests.spots[i];
    this.reach[i] = !!this.nav.path(SITES[0].at(8, 1, 0), { x: s.x + 0.5, y: s.y, z: s.z + 0.5 }, 160000);
  }

  /** Anyone still in the fight, down on the ground or in the air, is fair game: not the scout, not the dead, not someone on the bus. */
  private fair(bot: Bot, other: Player): boolean {
    if (other === bot || other === this.w.scout() || other.spectating || !other.alive) return false;
    const f = fighterOf(other);
    return !!f && f.alive && f.drop !== 'bus';
  }

  /** A new bot: it picks its landmark and when to jump. */
  add(bot: Bot) {
    // Landmarks are chosen by how good their loot is and how many have chosen them already.
    const weights = SITES.map((s, i) => Math.max(0.2, s.loot.reduce((a, l) => a + 1 + l.tier * 0.8, 0) / 8 - (this.taken.get(i) ?? 0) * 2));
    const pick = (() => {
      let r = this.game.rng.next() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
      return weights.length - 1;
    })();
    this.taken.set(pick, (this.taken.get(pick) ?? 0) + 1);
    const site = SITES[pick];
    const a = this.game.rng.range(0, Math.PI * 2);
    const r = this.game.rng.range(2, Math.min(14, site.radius * 0.5));
    this.brains.set(bot.id, {
      bot,
      skill: 0.15 + this.game.rng.next() * 0.6,
      landing: { x: site.cx + Math.cos(a) * r, y: site.ground + 1, z: site.cz + Math.sin(a) * r },
      jumpAt: this.game.rng.range(28, 62),
      side: 1,
      state: 'deck',
      chest: -1,
      chestUntil: 0,
      skip: new Map(),
      healing: null,
      pickup: null,
    });
  }

  remove(p: Player) {
    this.brains.delete(p.id);
    this.kit.remove(p);
  }

  /** A new match: everyone's back on the bus with a new plan. */
  reset() {
    this.taken.clear();
    this.unreachable.clear();
    for (const b of this.brains.values()) this.kit.remove(b.bot);
    this.brains.clear();
  }

  /** Whether this nav grid's world is loaded and built. */
  get ready() {
    return this.nav.ready;
  }

  update(game: GameContext, dt: number) {
    const now = game.clock.now;
    const bus = this.w.bus();
    for (const b of this.brains.values()) {
      const bot = b.bot;
      const f = fighterOf(bot);
      if (!f || !f.alive) continue;
      if (match.phase === 'lobby' || match.phase === 'over') {
        if (b.state === 'deck') bot.controls.release();
        continue;
      }
      if (b.state === 'deck') this.onDeck(b, bus);
      else if (b.state === 'air') this.inAir(b, f.drop);
      else this.onGround(b, now);
    }
    // The ones on the ground fight, walk and look for loot (the kit drives them).
    this.kit.update(dt, match.phase === 'lobby');
    for (const b of this.brains.values()) if (b.state === 'ground') this.chores(game, b, now);
  }

  // -------------------------------------------------------------------------------------------
  // Ride, jump, dive
  // -------------------------------------------------------------------------------------------

  private onDeck(b: Brain, bus: Bus | null) {
    const bot = b.bot;
    const f = fighterOf(bot)!;
    if (!bus) return;
    if (f.drop !== 'bus') {
      b.state = 'air';
      return;
    }
    const p = bus.position;
    const far = Math.hypot(p.x - b.landing.x, p.z - b.landing.z);
    // Which side is the landing on? The gangway on that side is the way out.
    const local = bus.prop.toLocal(b.landing);
    b.side = local.x >= 0 ? 1 : -1;
    const go = far < b.jumpAt || bus.progress > 0.88;
    if (!go) {
      // Wander about the deck a little, looking out.
      bot.controls.release();
      return;
    }
    const door = bus.gangway(b.side);
    bot.controls.lookAt({ x: door.x, y: bot.eye.y, z: door.z });
    bot.controls.hold('KeyW');
    bot.controls.hold('ShiftLeft');
  }

  private inAir(b: Brain, drop: string) {
    const bot = b.bot;
    if (drop === 'down' || bot.onGround) {
      // Landed: from here the kit drives it.
      b.state = 'ground';
      bot.controls.release();
      this.kit.add(bot, b.skill);
      return;
    }
    // Steer onto the spot: forward while it's far, and look at it (down a little, so the dive goes steeply).
    const d = Math.hypot(bot.position.x - b.landing.x, bot.position.z - b.landing.z);
    const alt = bot.position.y - b.landing.y;
    bot.controls.lookAt({ x: b.landing.x, y: bot.eye.y - Math.min(30, alt * 0.4), z: b.landing.z });
    // Close enough that the parachute will carry it the rest of the way: let go and drop onto it.
    bot.controls.hold('KeyW', d > Math.max(5, alt * 0.35));
  }

  private onGround(_b: Brain, _now: number) {
    // (The kit moves it.)
  }

  // -------------------------------------------------------------------------------------------
  // On the ground: where to go, what to carry, when to heal
  // -------------------------------------------------------------------------------------------

  /** Somewhere to go when nobody's in sight: out of the storm first, then loot, then the middle. */
  private goal(bot: Bot, _mind: BotMind): Vec3 | null {
    const b = this.brains.get(bot.id);
    if (!b) return null;
    const zone = this.w.zone();
    const p = bot.position;
    if (zone) {
      const s = zone.storm;
      // Inside the circle that's coming too (or the one that's here, if there's nothing coming)? Otherwise, get moving.
      const target = s.next ?? s.now;
      const out = Math.hypot(p.x - target.x, p.z - target.z) - target.r;
      const hurry = s.step === 'shrink' || s.step === 'wait' ? 14 : 2;
      if (out > -hurry || s.outBy(p.x, p.z) > 0) return this.safe(bot, target);
    }
    // A chest, if there's one worth the walk.
    if (b.chest >= 0 && this.w.chests.opened.has(b.chest)) b.chest = -1;
    if (b.chest < 0) {
      const now = this.game.clock.now;
      // The nearest chest it can walk to (a search with the kit's own budget finds a way): the next one if not.
      for (let tries = 0; tries < 4 && b.chest < 0; tries++) {
        const found = this.w.chests.nearest(p, 90, (s) => {
          const i = this.w.chests.spots.indexOf(s);
          return (b.skip.get(i) ?? 0) < now && this.reach?.[i] === true && this.insideSafe(s.x, s.z);
        });
        if (found < 0) break;
        const s = this.w.chests.spots[found];
        if (this.nav.path(p, { x: s.x + 0.5, y: s.y, z: s.z + 0.5 })) {
          b.chest = found;
          b.chestUntil = now + 40;
        } else b.skip.set(found, now + 30);
      }
    }
    if (b.chest >= 0) {
      const s = this.w.chests.spots[b.chest];
      return { x: s.x + 0.5, y: s.y, z: s.z + 0.5 };
    }
    // Loot lying about that it wants.
    const pick = this.pickupFor(bot);
    if (pick) return pick;
    // Otherwise toward the middle of the safe circle, where everyone's going.
    if (zone) return this.safe(bot, zone.storm.next ?? zone.storm.now);
    return null;
  }

  /** A spot inside a circle (not its exact middle, so they don't all stand on one block). */
  private safe(bot: Bot, c: { x: number; z: number; r: number }): Vec3 {
    const a = (parseInt(bot.id.replace(/\D/g, '') || '1', 10) % 12) * 0.52;
    const r = Math.min(c.r * 0.55, 20);
    const x = c.x + Math.cos(a) * r;
    const z = c.z + Math.sin(a) * r;
    return { x, y: this.game.world.surfaceY(x, z) + 1, z };
  }

  private insideSafe(x: number, z: number): boolean {
    const zone = this.w.zone();
    if (!zone) return true;
    const t = zone.storm.next ?? zone.storm.now;
    return Math.hypot(x - t.x, z - t.z) < t.r + 4;
  }

  /** The nearest thing lying about that it wants, if it's close. */
  private pickupFor(bot: Bot): Vec3 | null {
    const have = carried(bot);
    const inv = bot.inventory;
    const worst = have.length ? Math.min(...have.map((g) => g.tier)) : -1;
    let best: (typeof lying)[number] | null = null;
    let bestD = 55;
    for (const pk of lying) {
      if (!pk.alive) continue;
      const item = pk.item;
      const gun = parseGun(item);
      const wants = gun
        ? have.length < MAX_GUNS || gun.tier > worst
        : item === 'bandage'
          ? inv.count('bandage') < 5
          : item === 'shield'
            ? inv.count('shield') < 2
            : item === 'medkit'
              ? inv.count('medkit') < 1
              : item === 'frag'
                ? inv.count('frag') < 3
                : item === 'ammo';
      if (!wants || !this.insideSafe(pk.position.x, pk.position.z)) continue;
      const d = Math.hypot(pk.position.x - bot.position.x, pk.position.z - bot.position.z);
      if (d < bestD && !this.unreachable.has(pk.id)) {
        bestD = d;
        best = pk;
      }
    }
    if (!best) return null;
    const goal = { x: best.position.x, y: best.position.y, z: best.position.z };
    // Worth the walk? (A search with a small budget: one that can't find a way in it is left alone.)
    if (!this.nav.path(bot.position, goal, 6000)) {
      this.unreachable.add(best.id);
      return null;
    }
    return goal;
  }

  /** The gun for this range: the best tier they carry among those suited to it. */
  private bestGun(bot: Bot, distance: number): string | null {
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const g of carried(bot)) {
      const range = BOT_WEAPONS[g.item]?.range ?? 12;
      // Closer to the gun's range scores higher, and a better tier counts for more.
      const score = g.tier * 6 - Math.abs(distance - range) * 0.6 + FAMILIES[g.family].worth * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = g.item;
      }
    }
    return best;
  }

  /** A frag thrown after someone who ducked out of sight not far off. */
  private lob(bot: Bot, at: Vec3, mind: BotMind): boolean {
    if (bot.inventory.count('frag') < 1) return false;
    const d = Math.hypot(at.x - bot.position.x, at.z - bot.position.z);
    if (d < 7 || d > 24) return false;
    return throwables.of(this.game)?.throw(bot, 'frag', { at, cook: mind.skill * 1.2 }) ?? false;
  }

  /** What a bot does besides fight: open the chest it's reached, and heal when nobody's shooting. */
  private chores(game: GameContext, b: Brain, now: number) {
    const bot = b.bot;
    const mind = this.kit.mind(bot);
    // The chest it's reached.
    if (b.chest >= 0) {
      const s = this.w.chests.spots[b.chest];
      const d = Math.hypot(s.x + 0.5 - bot.position.x, s.y + 0.5 - bot.position.y, s.z + 0.5 - bot.position.z);
      if (d < 3 && !mind?.target) {
        this.w.chests.open(game, b.chest, bot);
        b.chest = -1;
      } else if (now > b.chestUntil) {
        b.skip.set(b.chest, now + 60);
        b.chest = -1;
      }
    }
    this.heal(b, mind, now);
  }

  private heal(b: Brain, mind: BotMind | null, now: number) {
    const bot = b.bot;
    const f = fighterOf(bot)!;
    const busy = !!mind?.target || (mind && now - mind.hurtAt < 2.5);
    if (b.healing) {
      // A shot at it, or it's done: back to a gun. (Until then it holds the item up and the button down, every tick: the kit lets go of controls it doesn't use.)
      if (busy || now > b.healing.until) {
        bot.controls.button(2, false);
        b.healing = null;
        const guns = carried(bot);
        if (guns.length) bot.inventory.select(guns[0].slot);
      } else {
        bot.inventory.select(b.healing.slot);
        bot.controls.button(2, true);
      }
      return;
    }
    if (busy) return;
    const inv = bot.inventory;
    let item: string | null = null;
    let time = 0;
    if (bot.health < 60 && inv.count('medkit') > 0 && bot.health < 40) [item, time] = ['medkit', 6.7];
    else if (bot.health < BANDAGE.to - 10 && inv.count('bandage') > 0) [item, time] = ['bandage', 3.4];
    else if (f.shield < MAX_SHIELD - 30 && inv.count('shield') > 0) [item, time] = ['shield', 4.2];
    if (!item) return;
    const slot = inv.slots.findIndex((s) => s?.item === item);
    if (slot < 0) return;
    inv.select(slot);
    bot.controls.button(2, true);
    b.healing = { slot, until: now + time };
  }
}
