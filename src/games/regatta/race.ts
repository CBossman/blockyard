import { math, type GameContext, type Player, type Prop, type PropModel, type Vehicle } from '@platform';
import { BotBrain, type BotView } from './bots';
import { COMMITTEE, GATE, LEGS, LINE_HALF, PIN, WINDWARD, ZONE } from './course';
import { FOILS, HULLS, RIGS, WAKE } from './models';
import { DOWNWIND_VMG, IRONS, KNOTS, boatVehicle, forward, freshBoat, sail, wrapAngle, type BoatState } from './sailing';
import { WATER_TOP } from './islands';
import { Wind } from './wind';

/**
 * One race: a fleet of six foiling monohulls (people, and bots in the empty places), a 30-second start sequence,
 * then windward mark, leeward gate, windward mark again and the finish. The server keeps the wind,
 * writes it into every boat (less any wind shadow from boats upwind), sails the bots, judges the
 * line and the marks, and keeps everyone's HUD.
 */

export const PRESTART = 30;
export const FLEET = 6;
/** Seconds after a race ends before the next one starts by itself. */
export const NEXT_RACE = 20;
const BOAT_R = 7;

/** The fleet's colours, in the order the models are made (`tools/models.mjs`). */
export const COLORS = ['#ffd23f', '#e8443a', '#3a7be8', '#2fbf71', '#9b5de5', '#f28c28', '#f2f2f2'];
const BOT_NAMES = ['Mistral', 'Sirocco', 'Bora', 'Levante', 'Zephyr', 'Tramontana', 'Southerly', 'Meltemi'];
/** Where the mast steps, in the hull's own space. */
const MAST_AT = { x: 0, y: 1.3, z: -2 };

/**
 * The boats' models (once, in `setup`): a hull in each colour, its rig with the sails cambered
 * either way, and its foil arms canted for either tack (the leeward one down, the windward one up).
 */
export interface FleetModels {
  hulls: PropModel[];
  rigs: { s: PropModel; p: PropModel }[];
  foils: { s: PropModel; p: PropModel };
  wake: PropModel;
}

export function fleetModels(game: GameContext): FleetModels {
  return {
    hulls: HULLS.map((url) => game.props.gltf(url, { radius: 11 })),
    rigs: RIGS.map(({ s, p }) => ({ s: game.props.gltf(s, { radius: 28 }), p: game.props.gltf(p, { radius: 28 }) })),
    foils: { s: game.props.gltf(FOILS.s, { radius: 8 }), p: game.props.gltf(FOILS.p, { radius: 8 }) },
    wake: game.props.gltf(WAKE, { radius: 60 }),
  };
}

export class Racer {
  leg = 0;
  started = false;
  ocs = false;
  wasOcs = false;
  finished = false;
  time = 0;
  startTime = -1;
  rank = 0;
  /** Its place as it rounded each mark. */
  markRanks: number[] = [];
  bumps = 0;
  lastBump = -99;
  /** Seconds this boat has held each rival in its wind shadow. */
  shading = new Map<Racer, number>();
  shadow = 0;
  /** The tips this skipper has had this race, and how long they've been in irons or luffing. */
  tips = new Set<string>();
  stuck = 0;
  flapping = 0;
  wet = 0;
  /** Whether their screen has been told they're sailing upwind (and so to lay out the laylines). */
  upwindSent: boolean | null = null;
  /** Their best time before this race, and whether this one beat it. */
  best: number | null = null;
  newBest = false;
  /** Which way its sails' model cambers and its foils cant: + the boom out to starboard (and that foil down). */
  rigSide = 1;
  /** Its wake on the water (`trail` keeps it under the boat). */
  wake: Prop | null = null;
  px: number;
  pz: number;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly color: number,
    readonly hull: Prop,
    public rig: Prop,
    public foils: Prop,
    readonly player: Player | null,
    private readonly vehicle: Vehicle<BoatState> | null,
    private readonly own: BoatState | null,
    readonly brain: BotBrain | null,
  ) {
    this.px = this.state.x;
    this.pz = this.state.z;
  }

  /** The boat: the vehicle's live state for a person, the server's own for a bot. */
  get state(): BoatState {
    return this.vehicle ? this.vehicle.state : this.own!;
  }

  get css(): string {
    return COLORS[this.color];
  }
}

const _euler = new math.Euler();

export class Race {
  readonly wind: Wind;
  t = -PRESTART;
  racers: Racer[] = [];
  standings: Racer[] = [];
  finishers: Racer[] = [];
  over = false;
  /** When it ended (race time): the next race starts by itself a while after. */
  endedAt = Infinity;
  private overAt: number | null = null;
  private nextId = 0;
  private hudClock = 0;
  private gustClock = 0;
  private usedNames = new Set<string>();

  constructor(
    private readonly game: GameContext,
    private readonly models: FleetModels,
  ) {
    this.wind = new Wind(() => game.rng.range(0, 1));
  }

  /** The start-area spot for the n-th boat: spread along below the line. */
  private slot(n: number) {
    return { x: -90 + (n % FLEET) * 36, z: 150 + (n % 2) * 30 };
  }

  private spawnBoat(color: number): { hull: Prop; rig: Prop; foils: Prop } {
    const hullProp = this.game.props.spawn(this.models.hulls[color]);
    return { hull: hullProp, rig: this.spawnRig(color, hullProp, 1), foils: this.spawnFoils(hullProp, 1) };
  }

  private spawnFoils(hullProp: Prop, side: number): Prop {
    const prop = this.game.props.spawn(this.models.foils[side > 0 ? 's' : 'p']);
    prop.attach(hullProp);
    return prop;
  }

  private spawnRig(color: number, hullProp: Prop, side: number): Prop {
    const rigProp = this.game.props.spawn(this.models.rigs[color][side > 0 ? 's' : 'p']);
    rigProp.attach(hullProp);
    rigProp.position.set(MAST_AT.x, MAST_AT.y, MAST_AT.z);
    return rigProp;
  }

  /**
   * The wake lies flat on the water under the boat, turned with it, longer the faster it goes
   * (in steps: each change of size is sent), and gone when it's barely moving.
   */
  private trail(r: Racer): void {
    const w = r.wake;
    if (!w) return;
    const s = r.state;
    w.visible = s.speed > 2;
    if (!w.visible) return;
    w.position.set(s.x, WATER_TOP, s.z);
    w.quaternion.setFromEuler(_euler.set(0, -s.heading, 0));
    // Ploughing, the whole hull makes a wake; flying, just the foils' struts and the rudder (narrower, as long).
    const scale = Math.round((1.4 + Math.min(1, s.speed / 20) * 2.4) * (1 - s.ride * 0.25) * 5) / 5;
    if (w.scale !== scale) w.scale = scale;
  }

  /** The sails' model cambers to leeward and the leeward foil is down: swap them when the boom has gone well over to the other side. */
  private swing(r: Racer): void {
    const boom = r.state.boom;
    r.rig.quaternion.setFromEuler(_euler.set(0, boom, 0));
    if (Math.abs(boom) < 0.12 || Math.sign(boom) === r.rigSide) return;
    r.rig.remove();
    r.foils.remove();
    r.rigSide = Math.sign(boom);
    r.rig = this.spawnRig(r.color, r.hull, r.rigSide);
    r.foils = this.spawnFoils(r.hull, r.rigSide);
    r.rig.quaternion.setFromEuler(_euler.set(0, boom, 0));
  }

  private freeColor(): number {
    const used = new Set(this.racers.map((r) => r.color));
    for (let i = 0; i < COLORS.length; i++) if (!used.has(i)) return i;
    return this.racers.length % COLORS.length;
  }

  addPlayer(player: Player): void {
    if (this.racers.some((r) => r.player === player)) return;
    const at = this.slot(this.racers.length);
    const color = this.freeColor();
    const { hull: h, rig: r, foils } = this.spawnBoat(color);
    const vehicle = player.drive<BoatState>('boat', freshBoat(at.x, at.z, Math.PI / 2, this.wind.dir, this.wind.baseSpeed), { prop: h });
    const racer = new Racer(this.nextId++, player.name, color, h, r, foils, player, vehicle, null, null);
    racer.wake = this.game.props.spawn(this.models.wake);
    this.racers.push(racer);
    this.tag(this.racers[this.racers.length - 1]);
    player.hud.crosshair(false);
  }

  addBot(): void {
    const n = this.racers.length;
    const at = this.slot(n);
    const color = this.freeColor();
    const { hull: h, rig: r, foils } = this.spawnBoat(color);
    const name = BOT_NAMES.find((x) => !this.usedNames.has(x)) ?? `Bot ${n}`;
    this.usedNames.add(name);
    const rng = () => this.game.rng.range(0, 1);
    // One sharp skipper in every fleet, the rest a mixed bag.
    const skill = this.racers.filter((x) => x.brain).length === 0 ? 0.97 : 0.78 + rng() * 0.17;
    const state = freshBoat(at.x, at.z, rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2, this.wind.dir, this.wind.baseSpeed);
    const racer = new Racer(this.nextId++, name, color, h, r, foils, null, null, state, new BotBrain(rng, skill, at.x));
    racer.wake = this.game.props.spawn(this.models.wake);
    boatVehicle.pose(state, h.position, h.quaternion);
    this.racers.push(racer);
    this.tag(racer);
  }

  /** A name over each boat, for everyone. */
  private tag(r: Racer): void {
    this.game.hud.marker(`tag${r.id}`, r.hull, { label: r.name, shape: 'dot', size: 5, color: r.css, offset: { x: 0, y: 31, z: 0 } });
  }

  remove(player: Player): void {
    const r = this.racers.find((x) => x.player === player);
    if (!r) return;
    r.rig.remove();
    r.foils.remove();
    r.hull.remove();
    r.wake?.remove();
    this.game.hud.marker(`tag${r.id}`, null);
    this.racers = this.racers.filter((x) => x !== r);
  }

  /** Where a racer's next beacon is. */
  target(r: Racer): { x: number; z: number } {
    const b = r.state;
    if (!r.started) return r.ocs ? { x: b.x, z: 30 } : { x: clamp(b.x, -LINE_HALF + 10, LINE_HALF - 10), z: 0 };
    if (r.finished) return { x: b.x, z: b.z + 200 };
    const type = LEGS[r.leg].type;
    if (type === 'mark') return WINDWARD;
    if (type === 'gate') return { x: clamp(b.x, GATE[0].x + 8, GATE[1].x - 8), z: GATE[0].z };
    return { x: clamp(b.x, -LINE_HALF + 10, LINE_HALF - 10), z: 0 };
  }

  private progressOf(r: Racer): number {
    if (r.finished) return 1e7 - r.time;
    const b = r.state;
    const t = this.target(r);
    const d = Math.hypot(b.x - t.x, b.z - t.z);
    if (!r.started) return -10000 - d - (r.ocs ? 20000 : 0);
    return 100000 * (r.leg + 1) - d;
  }

  update(dt: number): void {
    const game = this.game;
    this.wind.update(dt);
    const prev = this.t;
    this.t += dt;

    for (const n of [10, 5, 4, 3, 2, 1]) {
      if (prev < -n && this.t >= -n) game.audio.play('countdown');
    }

    this.breathe(dt);

    const view: BotView = {
      time: this.t,
      windAt: (x, z) => this.wind.sample(x, z).dir,
      boats: this.racers.map((r) => r.state),
    };
    for (const r of this.racers) {
      if (!r.brain) continue;
      const s = r.state;
      const helm = r.brain.think(s, { started: r.started, ocs: r.ocs, finished: r.finished, leg: r.leg, target: this.target(r) }, view, dt);
      sail(s, helm, dt);
      boatVehicle.pose(s, r.hull.position, r.hull.quaternion);
    }
    for (const r of this.racers) {
      this.swing(r);
      this.trail(r);
      if (r.state.aground) this.bump(r);
    }
    this.collide(dt);

    if (prev < 0 && this.t >= 0) this.gun();
    for (const r of this.racers) this.judge(r);
    this.rank();
    this.feats(dt);

    if (!this.over) {
      const people = this.racers.filter((r) => r.player);
      if (this.overAt === null && people.length > 0 && people.every((r) => r.finished)) this.overAt = this.t + 6;
      if (this.overAt === null && this.racers.every((r) => r.finished)) this.overAt = this.t + 2;
      if ((this.overAt !== null && this.t >= this.overAt) || this.t > 540) this.end();
    }

    this.tell(dt);
  }

  /** The wind at each boat, less the shadow of any boat close upwind of it. */
  private breathe(dt: number): void {
    for (const r of this.racers) {
      const b = r.state;
      const w = this.wind.sample(b.x, b.z);
      const up = forward(w.dir);
      let shadow = 0;
      let by: Racer | null = null;
      for (const o of this.racers) {
        if (o === r) continue;
        const dx = b.x - o.state.x;
        const dz = b.z - o.state.z;
        const along = -(dx * up.x + dz * up.z); // how far downwind of o
        if (along < 10 || along > 180) continue;
        const lat = Math.abs(dx * up.z - dz * up.x);
        const width = 16 + along * 0.2;
        if (lat > width) continue;
        const s = 0.4 * (1 - along / 180) * (1 - (lat / width) ** 2);
        if (s > shadow) {
          shadow = s;
          by = o;
        }
      }
      r.shadow = shadow;
      b.wd = w.dir;
      b.ws = w.speed * (1 - shadow);
      if (by && shadow > 0.1) by.shading.set(r, (by.shading.get(r) ?? 0) + dt);
    }
  }

  private collide(dt: number): void {
    const R = BOAT_R * 2;
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i].state;
        const b = this.racers[j].state;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= R || d < 1e-6) continue;
        const push = (R - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
        // Rubbing costs way, but over time: a touch shouldn't stop a boat dead.
        a.speed -= a.speed * 1.5 * dt;
        b.speed -= b.speed * 1.5 * dt;
        this.bump(this.racers[i]);
        this.bump(this.racers[j]);
      }
    }
  }

  private bump(r: Racer): void {
    if (this.t - r.lastBump < 1) return;
    r.lastBump = this.t;
    r.bumps++;
    if (r.player) {
      r.player.audio.play('bounce');
      r.player.fx.shake(0.25, 0.3);
    }
  }

  private gun(): void {
    const game = this.game;
    game.hud.banner('Go!', 'Upwind to the windward mark', { duration: 2 });
    game.audio.play('alarm');
    for (const r of this.racers) {
      if (r.state.z >= 0) continue;
      r.ocs = true;
      r.wasOcs = true;
      game.hud.feed(`${r.name} was over the line early`, { color: '#ff6b5a' });
      r.player?.hud.banner('Over early!', 'Sail back below the line, then start', { color: '#ff6b5a' });
    }
  }

  /** The line and the marks: who's started, rounded, finished. */
  private judge(r: Racer): void {
    const b = r.state;
    const pz = r.pz;
    r.px = b.x;
    r.pz = b.z;
    if (r.finished || this.t < 0) return;
    const onLine = Math.abs(b.x) <= LINE_HALF + 3;
    const hud = r.player?.hud;
    if (!r.started) {
      if (r.ocs) {
        if (b.z > 15) {
          r.ocs = false;
          hud?.banner('Clear', 'Now cross the line to start', { duration: 2 });
        }
      } else if (pz >= 0 && b.z < 0 && onLine) {
        r.started = true;
        r.startTime = this.t;
        if (r.player) {
          hud!.pop(this.t < 3 ? 'Great start!' : 'Started', { color: '#7ee787', big: this.t < 3 });
          if (this.t < 3) r.player.achieve('on_the_gun');
        }
      }
      return;
    }
    const leg = LEGS[r.leg];
    const near = (p: { x: number; z: number }) => Math.hypot(b.x - p.x, b.z - p.z) < ZONE;
    const through = Math.abs(b.x) < GATE[1].x && pz < GATE[0].z && b.z >= GATE[0].z;
    if ((leg.type === 'mark' && near(WINDWARD)) || (leg.type === 'gate' && (near(GATE[0]) || near(GATE[1]) || through))) {
      r.markRanks.push(r.rank);
      r.leg++;
      if (r.player) {
        const next = LEGS[r.leg];
        hud!.pop(`${leg.name} · ${ordinal(r.rank)}`, { sub: next.type === 'finish' ? 'Run home to the finish' : `On to the ${next.name.toLowerCase()}` });
        r.player.audio.play('pickup');
      }
    } else if (leg.type === 'finish' && pz < 0 && b.z >= 0 && onLine) {
      r.finished = true;
      r.time = this.t;
      this.finishers.push(r);
      const place = this.finishers.length;
      this.game.hud.feed(`${r.name} finished ${ordinal(place)} · ${clock(this.t)}`, { color: place === 1 ? '#ffd23f' : '#ffffff' });
      if (r.player) {
        const p = r.player;
        hud!.banner(`Finished ${ordinal(place)}`, clock(this.t), { color: place === 1 ? '#ffd23f' : undefined });
        p.audio.play(place === 1 ? 'victory' : 'wave');
        p.achieve('finished');
        if (place === 1) {
          p.achieve('won');
          this.game.fx.fireworks({ x: b.x, y: 75, z: b.z }, 3);
          if (r.markRanks.every((k) => k === 1)) p.achieve('wire_to_wire');
          if (r.markRanks[0] === this.racers.length) p.achieve('comeback');
        }
        if (!r.wasOcs && r.bumps === 0) p.achieve('clean');
        this.record(r);
      }
    }
  }

  private rank(): void {
    this.standings = [...this.racers].sort((a, b) => this.progressOf(b) - this.progressOf(a));
    this.standings.forEach((r, i) => (r.rank = i + 1));
  }

  /** Achievements that come of how someone sails, not where they finish; and tips for new skippers. */
  private feats(dt: number): void {
    for (const r of this.racers) {
      const p = r.player;
      if (!p) continue;
      if (r.state.speed * KNOTS >= 45) p.achieve('gust_rider');
      for (const t of r.shading.values()) if (t >= 5) p.achieve('bad_air');
      this.coach(r, dt);
    }
  }

  /**
   * A few words at the moments a new skipper needs them, once each a race, for their first few
   * races (counted in their store): the start, beating upwind, being in irons, a flapping sail,
   * running downwind.
   */
  private coach(r: Racer, dt: number): void {
    const p = r.player!;
    const b = r.state;
    if ((p.store.get<number>('races') ?? 0) >= 3) return;
    const tip = (id: string, text: string) => {
      if (r.tips.has(id)) return;
      r.tips.add(id);
      p.hud.widget('tip', { text });
      const shown = r.tips.size;
      this.game.clock.after(7, () => {
        // Unless a newer tip has taken its place.
        if (r.tips.size === shown) p.hud.widget('tip').remove();
      });
    };
    r.stuck = Math.abs(b.twa) < IRONS ? r.stuck + dt : 0;
    r.flapping = !b.auto && b.luff > 0.4 && Math.abs(b.twa) >= IRONS ? r.flapping + dt : 0;
    r.wet = b.ride < 0.5 ? r.wet + dt : 0;
    const deep = Math.abs(b.twa) > DOWNWIND_VMG + 12 * (Math.PI / 180);
    if (this.t > -28 && this.t < -21) tip('start', 'Foil to and fro below the line, then cross it at full speed when the gun goes. Keep your speed up: slow down and you drop off the foils.');
    else if (r.stuck > 2) tip('irons', "In irons: the sails can't fill head to wind. Steer away (A or D) to get going.");
    else if (r.wet > 4 && !deep) tip('takeoff', 'Off the foils: bear away to a reach, about 70° off the wind, to build speed. Past 17 knots the foils lift you clear.');
    else if (r.flapping > 3) tip('trim', 'Sails flapping? Sheet in with W until they stop, or press T for auto-trim. The faster you go, the further forward the wind comes: sheet in.');
    else if (r.started && r.leg === 0 && this.t - r.startTime > 6) tip('beat', "You can't sail straight at the wind: zig-zag to the mark, about 40° off it. Tack fast and smoothly, or you'll drop off the foils. The laylines show when you'll make it.");
    else if (r.started && LEGS[r.leg]?.type === 'gate' && deep) tip('run', 'Too deep! Pointing straight downwind the apparent wind dies and you come off the foils. Sail about 135° off the wind and gybe to the gate.');
    else if (r.started && LEGS[r.leg]?.type === 'gate') tip('run', 'Downwind: sail about 135° off the wind and gybe to the gate. Head for the dark water, where the gusts are.');
  }

  /** A finish for the record books: their personal best (kept on their account) and the course record. */
  private record(r: Racer): void {
    const p = r.player!;
    p.store.set('races', (p.store.get<number>('races') ?? 0) + 1);
    r.best = p.store.get<number>('best') ?? null;
    if (r.best === null || r.time < r.best) {
      p.store.set('best', r.time);
      r.newBest = r.best !== null;
      if (r.newBest) p.hud.pop('New personal best!', { big: true, color: '#ffd23f', sub: clock(r.time) });
    }
    // The course record is for signed-in skippers only (a guest's name could be anyone's).
    const rec = this.game.store.get<{ name: string; time: number }>('record');
    if (p.account && (!rec || r.time < rec.time)) {
      this.game.store.set('record', { name: p.name, time: r.time });
      this.game.hud.feed(`${p.name} set a new course record: ${clock(r.time)}`, { color: '#ffd23f' });
    }
  }

  private end(): void {
    this.over = true;
    this.endedAt = this.t;
    const game = this.game;
    const stats = this.standings.map((r, i) => [`${ordinal(i + 1)}  ${r.name}${r.player ? '' : ' (bot)'}`, r.finished ? clock(r.time) : `DNF · leg ${Math.min(r.leg + 1, LEGS.length)}`] as [string, string]);
    const winner = this.standings[0];
    const rec = game.store.get<{ name: string; time: number }>('record');
    // Each skipper's own card: where they came, their best, the course record.
    for (const r of this.racers) {
      const p = r.player;
      if (!p) continue;
      const mine = !r.finished
        ? 'Did not finish'
        : r.newBest
          ? `New personal best · ${clock(r.time)}`
          : r.best !== null
            ? `Your best ${clock(Math.min(r.best, r.time))}`
            : `Your first finish · ${clock(r.time)}`;
      p.hud.screen({
        title: r.finished ? `You came ${ordinal(r.rank)}` : winner?.player ? `${winner.name} wins!` : 'Race over',
        subtitle: `${mine}${rec ? ` · course record ${clock(rec.time)} (${rec.name})` : ''} · next race in ${NEXT_RACE} s`,
        tone: r.finished && r.rank === 1 ? 'victory' : r.finished ? 'neutral' : 'defeat',
        stats,
        buttons: [
          { label: 'Race again', primary: true, onClick: () => game.restart() },
          { label: 'Switch game', onClick: () => game.exit() },
        ],
      });
    }
  }

  /** Everyone's HUD (ten times a second: plenty, and less for each screen to redraw), and where the gusts are. */
  private tell(dt: number): void {
    const game = this.game;
    this.hudClock -= dt;
    const hudDue = this.hudClock <= 0;
    if (hudDue) this.hudClock = 0.1;
    game.hud.objective(this.t < 0 ? `Start in ${Math.ceil(-this.t)}` : this.over ? 'Race over' : `Race ${clock(this.t)}`);

    for (const r of this.racers) {
      const p = r.player;
      if (!p || !hudDue) continue;
      // Upwind, their screen lays the laylines out from the windward mark.
      const upwind = !r.finished && !this.over && (!r.started || LEGS[r.leg].type === 'mark');
      if (upwind !== r.upwindSent) {
        game.clients.send(p, 'upwind', upwind);
        r.upwindSent = upwind;
      }
      const b = r.state;
      const hud = p.hud;
      const kn = b.speed * KNOTS;
      hud.meter('speed', 'Speed', Math.min(1, kn / 50), { color: '#2fa4e7', text: `${kn.toFixed(1)} kn` });
      const flying = b.ride > 0.5;
      hud.meter('ride', 'Foils', b.ride, { color: flying ? '#7ee787' : '#ff6b5a', text: flying ? 'Foiling' : b.ride > 0 ? 'Lifting…' : 'Hull in the water' });
      const irons = Math.abs(b.twa) < IRONS;
      const trimText = irons ? 'In irons: bear away' : b.auto ? 'Auto-trim' : b.luff > 0.2 ? 'Luffing: sheet in (W)' : b.eff < 0.85 ? 'Stalled: ease out (S)' : 'Trimmed';
      hud.meter('trim', 'Sail', irons ? 0 : b.eff, { color: b.eff > 0.9 ? '#7ee787' : b.eff > 0.6 ? '#ffd23f' : '#ff6b5a', text: trimText });

      const t = this.target(r);
      const label = !r.started ? (r.ocs ? 'Over early: back below the line' : this.t < 0 ? 'Start line' : 'Cross the line to start') : LEGS[r.leg].name;
      hud.marker('next', r.finished || this.over ? null : { x: t.x, y: 70, z: t.z }, { label, shape: 'diamond', color: '#ffd23f', edge: true, pulse: !r.started && this.t >= 0 });

      const twa = Math.round(wrapAngle(b.wd - b.heading) / (Math.PI / 90)) * 2;
      const gust = b.ws > this.wind.baseSpeed * 1.12 ? 'Gust' : b.ws < this.wind.baseSpeed * 0.88 ? (r.shadow > 0.1 ? 'Bad air' : 'Lull') : '';
      hud.widget('wind', {
        rel: twa,
        kn: Math.round(b.ws * KNOTS),
        tag: gust,
        tagCls: gust === 'Gust' ? 'up' : gust ? 'down' : '',
        tack: irons ? 'In irons' : Math.abs(twa) > 160 ? 'Dead run' : twa > 0 ? 'Starboard tack' : 'Port tack',
      });

      hud.widget('standings', {
        rows: this.standings.map((s) => ({
          pos: s.rank,
          name: s.name,
          color: s.css,
          cls: s === r ? 'me' : '',
          status: s.finished ? clock(s.time) : !s.started ? (s.ocs ? 'OCS' : this.t < 0 ? '' : 'to start') : `leg ${s.leg + 1}/${LEGS.length}`,
        })),
      });

      hud.radar({
        center: r.hull,
        range: 600,
        blips: [
          ...this.racers.filter((o) => o !== r).map((o) => ({ at: o.hull, color: o.css, size: 5 })),
          { x: WINDWARD.x, z: WINDWARD.z, color: '#ff8a3c', size: 4 },
          { x: GATE[0].x, z: GATE[0].z, color: '#ffd23f', size: 3 },
          { x: GATE[1].x, z: GATE[1].z, color: '#ffd23f', size: 3 },
          { x: PIN.x, z: PIN.z, color: '#ff8a3c', size: 3 },
          { x: COMMITTEE.x, z: COMMITTEE.z, color: '#ffffff', size: 4 },
        ],
      });
    }

    // The screens draw the gusts' ripples themselves, from where the gusts are.
    this.gustClock -= dt;
    if (this.gustClock <= 0) {
      this.gustClock = 1;
      const d = this.wind.drift();
      game.clients.send('all', 'gusts', {
        drift: [round(d.x), round(d.z)],
        gusts: this.wind.gusts.filter((g) => g.env > 0.2).map((g) => [round(g.x), round(g.z), round(g.radius), round(g.strength * g.env, 100)]),
      });
    }
  }
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const round = (v: number, k = 10) => Math.round(v * k) / k;

export function ordinal(n: number): string {
  const t = n % 100;
  return n + (t >= 11 && t <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th');
}

export function clock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
