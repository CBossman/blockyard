import type { Bot, GameContext, Player, Vec3 } from '@platform';
import { navGrid, shooterBots, throwables, type BotMind, type NavCell, type NavGrid, type ShooterBots } from '@platform/kits';
import type { Bus } from './bus';
import type { Chests } from './chests';
import { CENTER, LOOT, RADIUS, SITES } from './island';
import { BANDAGE, carried, lying, MAX_SHIELD } from './loot';
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
  /** How far along the bus's route (0..1) it heads for the gangway: a little before the bus passes closest to its landing. */
  jumpAt: number;
  /** When it landed (`game.clock.now`): for a while after, it loots before it looks for a fight. */
  landedAt: number;
  /** Running for the circle straight, with no way found on the grid (out of a pit, the water). */
  escaping: boolean;
  /** Escaping: where it was a moment ago (to tell when it's stuck on something), and a way round it until `veerUntil`. */
  escapeCheck: { x: number; z: number; t: number };
  veer: number;
  veerUntil: number;
  /** The whole way to a far goal, planned by the bot itself (see `via`), and when to plan it again. */
  route: { to: Vec3; cells: NavCell[]; until: number } | null;
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

/** The search budget (cells looked at) for a far goal's whole way: the kit's own is a few thousand. */
const FAR = 120000;

/** Where the bot's walking grid reaches: the island, from the sea floor to the hilltops. */
const BOUNDS = { min: { x: CENTER.x - RADIUS - 12, y: 58, z: CENTER.z - RADIUS - 12 }, max: { x: CENTER.x + RADIUS + 12, y: 108, z: CENTER.z + RADIUS + 12 } };

export class Bots {
  readonly nav: NavGrid;
  readonly kit: ShooterBots;
  private brains = new Map<string, Brain>();
  /** Which chests a bot can walk to (not the ones up a ladder): worked out once the walking grid is built. */
  private reach: boolean[] | null = null;
  /** How many of the island's chests (`LOOT`) have been checked for a way to them. */
  private checked = 0;
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
      // A little slower to react and a little wider with the first shots than a shooter's bots: a person who's
      // careful should win most fights against them.
      aim: { reaction: [1.05, 0.5], miss: [3.6, 1.4] },
      hostile: (bot, other) => this.fair(bot, other),
      goal: (bot, mind) => this.goal(bot, mind),
      weapon: (bot, _mind, distance) => this.bestGun(bot, distance),
      throw: (bot, at, mind) => this.lob(bot, at, mind),
    });
  }

  /**
   * Once the walking grid is built: which chests can be walked to from the middle of the village (a
   * chest up a ladder can't: the grid doesn't climb), and where the bots drift between: the reachable
   * chests. A few each tick (a chest with no way to it searches the whole grid), so the server never
   * stalls on it; called every tick, it's nothing once they're all done.
   */
  prepare() {
    if (!this.nav.ready) return;
    const spots = this.w.chests.spots;
    if (!this.reach) {
      this.reach = [];
      this.hot.length = 0;
      this.hot.push({ x: CENTER.x, y: this.groundY(CENTER.x, CENTER.z) + 1, z: CENTER.z });
    }
    if (this.checked >= LOOT.length) return;
    // From a spot on the village's road (the well in the middle isn't somewhere to stand).
    const from = SITES[0].at(8, 1, 0);
    const until = performance.now() + 8;
    while (this.checked < LOOT.length && performance.now() < until) {
      const i = this.checked++;
      const s = spots[i];
      this.reach[i] = s.kind === 'chest' && !!this.nav.path(from, { x: s.x + 0.5, y: s.y, z: s.z + 0.5 }, 160000);
      if (this.reach[i]) this.hot.push({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 });
    }
    if (import.meta.env.DEV && this.checked >= LOOT.length)
      console.log(`[blockroyale] chests a bot can reach: ${this.reach.filter(Boolean).length} of ${LOOT.filter((s) => s.kind === 'chest').length}`);
  }

  /** A chest that turned up during the match (a supply drop): whether a bot can walk to it. */
  consider(i: number) {
    if (!this.reach) return;
    const s = this.w.chests.spots[i];
    this.reach[i] = !!this.nav.path(SITES[0].at(8, 1, 0), { x: s.x + 0.5, y: s.y, z: s.z + 0.5 }, 160000);
  }

  /**
   * Who a bot fights: anyone down on the ground and still in it (not the scout, not someone on the
   * bus or in the air, who can't be hurt). Just landed with nothing but the starting pistol, it loots
   * first and only fights someone close or shooting at it; caught in the storm, it runs for the
   * circle rather than turn to fight anyone but the nearest.
   */
  private fair(bot: Bot, other: Player): boolean {
    if (other === bot || other === this.w.scout() || other.spectating || !other.alive) return false;
    const f = fighterOf(other);
    if (!f || !f.alive || f.drop !== 'down') return false;
    const b = this.brains.get(bot.id);
    const now = this.game.clock.now;
    const d = Math.hypot(other.position.x - bot.position.x, other.position.z - bot.position.z);
    const hurt = now - (this.kit.mind(bot)?.hurtAt ?? -99) < 3;
    if (b && now - b.landedAt < 25 && carried(bot).length <= 1 && d > 12 && !hurt) return false;
    const zone = this.w.zone();
    if (zone && zone.storm.outBy(bot.position.x, bot.position.z) > 2 && d > 10 && !hurt) return false;
    return true;
  }

  /**
   * A new bot: it picks a landmark it can glide to from the bus's route (by how good its loot is,
   * and how many have picked it already, so they spread out), a spot in it, and when to make for
   * the gangway: a little before the bus passes closest, so it steps off as it does.
   */
  add(bot: Bot) {
    const route = this.w.bus()?.route;
    // Along the route to the point nearest a spot, and how far off the route that point is.
    const near = (x: number, z: number) => {
      if (!route) return { along: 0, off: 0 };
      const along = Math.max(0, Math.min(route.length, (x - route.from.x) * route.dir[0] + (z - route.from.z) * route.dir[1]));
      return { along, off: Math.hypot(route.from.x + route.dir[0] * along - x, route.from.z + route.dir[1] * along - z) };
    };
    const weights = SITES.map((s, i) => {
      const base = Math.max(0.2, s.loot.reduce((a, l) => a + 1 + l.tier * 0.8, 0) / 8 - (this.taken.get(i) ?? 0) * 2);
      const { off } = near(s.cx, s.cz);
      // Out of a glide's reach from the bus: hardly ever.
      return off > 120 ? 0.02 : off > 80 ? base * 0.5 : base;
    });
    const pick = (() => {
      let r = this.game.rng.next() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
      return weights.length - 1;
    })();
    this.taken.set(pick, (this.taken.get(pick) ?? 0) + 1);
    const site = SITES[pick];
    const a = this.game.rng.range(0, Math.PI * 2);
    const r = this.game.rng.range(2, Math.min(14, site.radius * 0.5));
    const landing = { x: site.cx + Math.cos(a) * r, y: site.ground + 1, z: site.cz + Math.sin(a) * r };
    // Leave the deck this far ahead of the closest point (the walk to the gangway, and the bus's speed carried off it).
    const lead = this.game.rng.range(28, 48);
    const jumpAt = route ? Math.max(0.03, Math.min(0.92, (near(landing.x, landing.z).along - lead) / route.length)) : 0.5;
    this.brains.set(bot.id, {
      bot,
      skill: 0.15 + this.game.rng.next() * 0.6,
      landing,
      jumpAt,
      landedAt: 0,
      escaping: false,
      escapeCheck: { x: 0, z: 0, t: 0 },
      veer: 0,
      veerUntil: 0,
      route: null,
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
    // Which side is the landing on? The gangway on that side is the way out.
    const local = bus.prop.toLocal(b.landing);
    b.side = local.x >= 0 ? 1 : -1;
    const go = bus.progress >= b.jumpAt || bus.progress > 0.9;
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
      b.landedAt = this.game.clock.now;
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
      if (out > -hurry || s.outBy(p.x, p.z) > 0) return this.via(b, this.safe(bot, target));
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
        if (this.nav.path(p, { x: s.x + 0.5, y: s.y, z: s.z + 0.5 }, FAR)) {
          b.chest = found;
          b.chestUntil = now + 40;
        } else b.skip.set(found, now + 30);
      }
    }
    if (b.chest >= 0) {
      const s = this.w.chests.spots[b.chest];
      return this.via(b, { x: s.x + 0.5, y: s.y, z: s.z + 0.5 });
    }
    // Loot lying about that it wants.
    const pick = this.pickupFor(bot);
    if (pick) return pick;
    // Otherwise toward the middle of the safe circle, where everyone's going.
    if (zone) return this.via(b, this.safe(bot, zone.storm.next ?? zone.storm.now));
    return null;
  }

  /**
   * Where to send the kit on the way to `to`. The kit plans with a small budget (a few thousand
   * cells looked at), and a far goal round a detour (a chest indoors across the island, the way out
   * of the quarry) is past it: it finds no way, and the bot stands where it is, in the storm if that's
   * where it is. So for a far goal the bot plans the whole way itself, now and then, with a budget
   * big enough, and gives the kit a waypoint a stretch along it.
   */
  private via(b: Brain, to: Vec3): Vec3 {
    const p = b.bot.position;
    if (Math.hypot(to.x - p.x, to.z - p.z) < 28) return to;
    const now = this.game.clock.now;
    let r = b.route;
    if (!r || now > r.until || Math.hypot(r.to.x - to.x, r.to.z - to.z) > 4) {
      const cells = this.nav.path(p, to, FAR);
      // (No way at all: try again in a while, not every time the kit asks.)
      r = b.route = { to: { ...to }, cells: cells ?? [], until: now + (cells ? 12 : 6) };
    }
    if (!r.cells.length) return to;
    // Where it is on the way (it may have been off fighting), and a stretch on from there.
    let near = 0;
    let best = Infinity;
    r.cells.forEach((c, i) => {
      const d = Math.hypot(c.at.x - p.x, c.y - p.y, c.at.z - p.z);
      if (d < best) [best, near] = [d, i];
    });
    if (best > 6) {
      // Well off it: the whole way again, from here, the next time it's asked.
      b.route = null;
      return to;
    }
    return r.cells[Math.min(r.cells.length - 1, near + 24)].at;
  }

  /**
   * Somewhere well inside a circle that a bot can walk to: one of the few reachable spots (the chests'
   * places) nearest its middle, the bot's own pick of them so they don't all stand on one block; or,
   * with none inside, the ground near its middle (under any tree there, not on top of it).
   */
  private safe(bot: Bot, c: { x: number; z: number; r: number }): Vec3 {
    const mine = parseInt(bot.id.replace(/\D/g, '') || '1', 10);
    const inside = this.hot.filter((h) => Math.hypot(h.x - c.x, h.z - c.z) < c.r * 0.75).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
    if (inside.length) return inside[mine % Math.min(3, inside.length)];
    const a = (mine % 12) * 0.52;
    const r = Math.min(c.r * 0.4, 12);
    const x = c.x + Math.cos(a) * r;
    const z = c.z + Math.sin(a) * r;
    return { x, y: this.groundY(x, z) + 1, z };
  }

  /** The ground's top block at (x, z): below any tree there. */
  private groundY(x: number, z: number): number {
    const w = this.game.world;
    const [bx, bz] = [Math.floor(x), Math.floor(z)];
    let y = w.surfaceY(bx, bz);
    for (let i = 0; i < 32 && y > 0; i++) {
      const name = w.blockName(w.getBlock(bx, y, bz));
      if (!name.endsWith('_leaves') && !name.endsWith('_log')) break;
      y--;
    }
    return y;
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
    let best: (typeof lying)[number] | null = null;
    let bestD = 55;
    for (const pk of lying) {
      if (!pk.alive) continue;
      const item = pk.item;
      const gun = parseGun(item);
      const wants = gun
        ? (have.find((g) => g.family === gun.family)?.tier ?? -1) < gun.tier
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
    if (d < 10 || d > 24) return false;
    // Not from behind cover or indoors, where it bounces back off the wall in front; not when one more hit would finish it.
    if (bot.health < 35 || !this.game.world.lineOfSight(bot.eye, { x: at.x, y: at.y + 1.5, z: at.z })) return false;
    return throwables.of(this.game)?.throw(bot, 'frag', { at, cook: mind.skill * 0.6 }) ?? false;
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
    this.escape(b, mind, now);
    if (!b.escaping) this.heal(b, mind, now);
  }

  /**
   * Out in the storm (or about to be, as it closes) and the walking grid has no way back (down a
   * pit, in the water, behind something): straight for the circle's middle, sprinting and jumping.
   */
  private escape(b: Brain, mind: BotMind | null, now: number) {
    const bot = b.bot;
    const zone = this.w.zone();
    const c = zone?.storm.now;
    const out = c ? Math.hypot(bot.position.x - c.x, bot.position.z - c.z) - c.r : -Infinity;
    const lost = !mind?.goal || !mind.path;
    if (c && !mind?.target && lost && (out > 0 || (zone!.storm.step === 'shrink' && out > -6))) {
      if (b.healing) {
        bot.controls.button(2, false);
        b.healing = null;
      }
      // Stuck on something (a cliff, a wall) for a second and a half: off at an angle for a moment, the other way next time.
      const p = bot.position;
      if (!b.escaping) b.escapeCheck = { x: p.x, z: p.z, t: now };
      else if (now - b.escapeCheck.t > 1.5) {
        if (Math.hypot(p.x - b.escapeCheck.x, p.z - b.escapeCheck.z) < 1.5 && now > b.veerUntil) {
          b.veer = b.veer > 0 ? -1.2 : 1.2;
          b.veerUntil = now + 1.4;
        }
        b.escapeCheck = { x: p.x, z: p.z, t: now };
      }
      const a = Math.atan2(c.z - p.z, c.x - p.x) + (now < b.veerUntil ? b.veer : 0);
      bot.controls.lookAt({ x: p.x + Math.cos(a) * 20, y: bot.eye.y, z: p.z + Math.sin(a) * 20 });
      bot.controls.hold('KeyW');
      bot.controls.hold('ShiftLeft');
      if (Math.floor(now * 3) % 2 === 0) bot.controls.press('Space');
      b.escaping = true;
    } else if (b.escaping) {
      bot.controls.release();
      b.escaping = false;
    }
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
