import { defineServer, math, type GameContext, type Player, type Prop, type PropModel } from '@platform';
import { BotBrain, STYLES, type Style } from './bots';
import { ABILITIES, DROP, DROP_KINDS, HEAL, MAX_WALLS, MINE, RETREAT, SALVAGE, SPACE, BODY, STAND, WAVE_UNITS, wavePay, waveWorth, type Ability, type DropKind, TRADE, tradeGet, UPLINK, MEDIC, ALARM } from './defs';
import { DIFFICULTIES, BOARDS, COVER_RANGE, FLANK, fromBehind, HIGH, VET, rankOf, AGE_NEEDS, ARMOR, VERSUS, BUILDABLE, BUILDINGS, ageOf, CARRY, DOCTRINES, DOCTRINE_IDS, GATHER_RATE, HERO, MAX_POP, NEEDS, RELIC, SIGHT, START, TECHS, TECH_IDS, UNITS, type BuildingKind, type DoctrineId, type Mode, type ResKind, type TechId, type UnitKind, type DifficultyId } from './defs';
import { DRESSING } from './dressing';
import { BASES, CAMPS, FLOOR, HALF, LAKES, MESAS, TREES, deposits, heightAt, inHill, inLake, inMesa, hashYaw, inside, lakeOf, shore, wallLine, wallSnap, gateCells, gateAxis, SHUT, type Deposit } from './map';
import { DEPOSIT_MODELS, DRESSING as DRESS_MODELS, FLAGS, PORTRAITS, SCALE, modelFor, variantOf } from './models';
import { BUILDING_ORDER, UNIT_ORDER, type Seat, type Shot, type State, type Summary, type Lobby, type LobbySeat } from './protocol';
import { shared } from './shared';
import { TEAM_COLORS } from './defs';

/**
 * Block Command's rules. In the lobby anyone picks the mode (free for all, two against two, or all
 * together against bots), and the match starts: each seat gets a base in its corner (the bots take
 * the empty seats), engineers gather steel and oil from the deposits and put up buildings, the
 * buildings train units, and units fight. Everything is the server's own reckoning, sent to the
 * screens ten times a second (`protocol.ts`); the units and buildings are props it moves.
 */

/** Where an order sends a unit. */
type Order =
  | { t: 'idle' }
  | { t: 'move'; x: number; z: number; attack: boolean; /** Which way to face on arriving. */ face?: number; /** The column's marching speed, kept to until near the end. */ pace?: number; /** Getting away: it doesn't turn to fight even when it's shot at. */ flee?: boolean }
  | { t: 'attack'; id: number; building: boolean }
  | { t: 'gather'; node: number; phase: 'to' | 'work' | 'back'; slot?: number; held?: number }
  | { t: 'build'; id: number }
  | { t: 'repair'; id: number; /** A vehicle, not a building. */ unit?: boolean }
  /** Into a bunker (a building) or a transport (a boat). */
  | { t: 'enter'; id: number; boat: boolean }
  /** Into reach of a spot, then its special ability on it. */
  | { t: 'cast'; x: number; z: number }
  /** Back and forth between two points, fighting what it meets. */
  | { t: 'patrol'; ax: number; az: number; bx: number; bz: number; to: 0 | 1 };

export interface Unit {
  id: number;
  seat: number;
  kind: UnitKind;
  x: number;
  z: number;
  hp: number;
  max: number;
  yaw: number;
  /** (Units are drawn by each screen from the `u` message, `client/units.ts`: no prop.) */
  prop: null;
  /** When it last worked (gathered, built, repaired): the screens show it at work. */
  busy: number;
  /** Where it was last tick, and the phase of its walking bob. */
  px: number;
  pz: number;
  bob: number;
  /** The way round whatever's in the way to where it's going, and what that was for. */
  path: { x: number; z: number }[] | null;
  pathFor: { x: number; z: number; ver: number } | null;
  /** The wall it's shooting its way through (there being no way round), from where, and for which order. */
  breach: { id: number; x: number; z: number; ver: number; order: Order } | null;
  order: Order;
  /** What it's to do after that (Shift-queued orders). */
  next: Order[];
  cool: number;
  carry: number;
  carryRes: ResKind | null;
  /** Seconds this has been working at a deposit (a fraction of a load's). */
  work: number;
  /** Until when the commander's Rally has it firing faster. */
  boostUntil: number;
  /** A wild unit's camp, and the spot it keeps to. */
  camp: number;
  home: { x: number; z: number } | null;
  /** Experience from kills (its stars: `rankOf`), its stance (0 aggressive, 1 hold ground, 2 hold fire). */
  xp: number;
  stance: number;
  /** The bunker or transport it's in (not on the field: it can't be hit, and goes where that goes). */
  inside: { id: number; boat: boolean } | null;
  /** A boat's lake (-1 on land). */
  lake: number;
  /** When its special ability is ready again; until when it has its smoke, its flak burst or its brace; until when it's running for home. */
  abilityAt: number;
  smokeUntil: number;
  flakUntil: number;
  braceUntil: number;
  sprintUntil: number;
  /** When it was last hit (it heals only out of the fighting). */
  hitAt: number;
  /** Where it was when it last got anywhere, and how many times it has looked again since; a sidestep it's taking to get unstuck. */
  prog?: { x: number; z: number; t: number; n: number };
  dodge?: { a: number; until: number };
}

export interface Building {
  id: number;
  seat: number;
  kind: BuildingKind;
  x: number;
  z: number;
  hp: number;
  /** 0..1: how much is built. */
  built: number;
  prop: Prop;
  queue: { kind: UnitKind; t: number }[];
  rally: { x: number; z: number } | null;
  /** What a lab is researching, and how far; a tower's time to its next shot. */
  research: { id: TechId; t: number } | null;
  cool: number;
  /** Keep training `lastKind` (the last unit asked for) whenever the queue runs out. */
  loop: boolean;
  lastKind: UnitKind | null;
  /** An uplink: when it was finished (its clock runs from then). */
  doneAt?: number;
  /** A gate: which way it runs (`gateCells`), how far open its doors are (0..1), whether it's locked, and its doors. */
  gate?: { axis: number; open: number; locked: boolean; doors: Prop[] };
}

export interface Slot {
  seat: number;
  name: string;
  team: number;
  player: Player | null;
  bot: BotBrain | null;
  steel: number;
  oil: number;
  pop: number;
  cap: number;
  alive: boolean;
  lost: number;
  doctrine: DoctrineId;
  /** When its special power is ready again (match time), and until when it sees the whole map. */
  powerAt: number;
  revealUntil: number;
  /** What it has researched; and when its commander's Rally is ready again. */
  techs: Set<TechId>;
  rallyAt: number;
  /** Its trade post's prices (a share of full price, steel then oil) as of `at`. */
  trade: { steel: number; oil: number; at: number };
  /** The match in numbers (the summary at the end), and its army's worth every few seconds. */
  stats: { trained: number; killed: number; lost: number; built: number; razed: number; steel: number; oil: number };
  army: number[];
  /** All it has gathered so far, at each sample (for its income over the last minute). */
  banked: number[];
}

/** A match as the rules (and the bots) see it. */
export interface World {
  /** (A gate's `axis`: which way it runs; found from the wall it's set in when not given.) */
  slots: (Slot | null)[];
  units: Map<number, Unit>;
  buildings: Map<number, Building>;
  deposits: Deposit[];
  time: number;
  enemies(seat: number): Slot[];
  trainable(b: Building, kind: UnitKind): boolean;
  train(b: Building, kind: UnitKind): boolean;
  place(seat: number, kind: BuildingKind, x: number, z: number, builders: number[], axis?: number): boolean;
  command(ids: number[], seat: number, o: Order): void;
  power(seat: number, x: number, z: number): boolean;
  research(b: Building, tech: TechId): boolean;
  relics: { x: number; z: number; owner: number; progress: number }[];
  /** Match time until which no side can attack another. */
  peaceUntil: number;
  rally(seat: number): boolean;
  unload(id: number, boat: boolean): boolean;
  /** The HQ's alarm: its engineers near run into it (how many went). */
  alarm(seat: number): number;
  canDock(x: number, z: number): boolean;
  /** Last Stand: no one to march on, so it holds its ground. */
  stand: boolean;
  /** Whether an uplink can be built (and win) this match. */
  uplinkOn: boolean;
  /** Supply drops on their way down or on the ground; `at`: when it lands. */
  drops: { id: number; x: number; z: number; at: number }[];
  /** How many mines a seat has down. */
  minesOf(seat: number): number;
  /** A unit's special ability (`ids`' ready ones of a kind), on a spot if it wants one. */
  ability(seat: number, ids: number[], kind: UnitKind, x: number, z: number): boolean;
  /** A bot commander's word to the table, in the feed. */
  say(seat: number, text: string): void;
}

/** The wild's seat: the camps' guards. Its team is no one's. */
const NEUTRAL = 6;
let relics: { x: number; z: number; owner: number; progress: number }[] = [];
let drops: { id: number; x: number; z: number; at: number; kind: DropKind }[] = [];
let dropIn = 0;
/** Last Stand: the wave reached, seconds to the next, whether this one's been cleared, how hard it is. */
let wave = 0;
let waveIn = 0;
let waveClear = true;
let waveScale = 1;
let waveLook = 0;
/** Where each raider was when it last got anywhere or fired, and when: one that's stuck deserts. */
const waveStuck = new Map<number, { x: number; z: number; t: number }>();

let phase: State['phase'] = 'lobby';
let mode: Mode = 'ffa';
let slots: (Slot | null)[] = [];
let units = new Map<number, Unit>();
let buildings = new Map<number, Building>();
let nodes: Deposit[] = [];
let nodeProps = new Map<number, Prop>();
let time = 0;
let nextId = 1;
let shots: Shot[] = [];
let booms: number[] = [];
let winners: number[] = [];
/** How the match was won, if not by force of arms. */
let wonBy: State['wonBy'];
let summary: Summary | undefined;
let stateIn = 0;
let sendIn = 0;
let dirty = true;
/** What each player picked in the lobby (their doctrine), by player id. */
const picked = new Map<string, DoctrineId>();
/** Things that happen a moment from now (a bomb falling): when, and what. */
let later: { t: number; run: () => void }[] = [];
/** Patches of the map a side has lit up for a while. */
let flares: { team: number; x: number; z: number; r: number; until: number }[] = [];
let healIn = 0;
/** Mines in the ground. */
let mines: { seat: number; team: number; x: number; z: number }[] = [];
let mineIn = 0;

// The match being set up, which stays as it was for a rematch.
const makeSeat = (seat: number): LobbySeat => ({ seat, kind: seat < 4 ? 'bot' : 'closed', name: '', id: '', team: seat % 4, style: 'random', difficulty: 'normal', ready: false });
const lobby: Lobby = { seats: [0, 1, 2, 3, 4, 5].map(makeSeat), host: '', preset: 'ffa', resources: 'normal', fog: true, uplink: true, peace: 0, watchers: [] };
const BRIEFING = 7;
const START_RES = { low: 0.5, normal: 1, high: 2.5 };
let briefingLeft = 0;
let rematchIn = 0;
let peaceUntil = 0;
let startScale = 1;
/** This match: whether an uplink can win it (the lobby's choice; never in Last Stand). */
let uplinkOn = true;
/** Those who left a match under way, by id and by name, and their seat: back in, it's theirs again. */
const gone = new Map<string, number>();
/** When each player last spoke or pinged (so no one can flood). */
const spokeAt = new Map<string, number>();
const pingedAt = new Map<string, number>();
const DRESS_KINDS: string[] = [...DRESS_MODELS].filter((k) => !(UNIT_ORDER as string[]).includes(k) && !(BUILDING_ORDER as string[]).includes(k));
let models: { kinds: Record<string, PropModel[]>; door: PropModel[]; steel: PropModel; oil: PropModel };

const euler = new math.Euler();

const slotOf = (p: Player) => slots.find((s) => s?.player === p) ?? null;
const teamOf = (seat: number) => slots[seat]?.team ?? -1;

export default defineServer(shared, {
  setup(game) {
    const kinds: Record<string, PropModel[]> = {};
    // Each building in each army's colours (and the wild's); the scenery once.
    for (const k of BUILDING_ORDER) kinds[k] = [0, 1, 2, 3, 4, 5, 6].map((v) => game.props.gltf(modelFor(k, v), { radius: 9 }));
    for (const k of DRESS_KINDS) {
      const model = game.props.gltf(modelFor(k), { radius: 9 });
      kinds[k] = [model];
    }
    models = { kinds, door: [0, 1, 2, 3, 4, 5, 6].map((v) => game.props.gltf(modelFor('gate_door', v), { radius: 4 })), steel: game.props.gltf(DEPOSIT_MODELS.steel, { radius: 5 }), oil: game.props.gltf(DEPOSIT_MODELS.oil, { radius: 5 }) };

    // (The interface's pictures of them are items no one carries; each screen draws their looks.)
    for (const id of [...Object.keys(PORTRAITS), ...Object.keys(FLAGS)]) game.items.define(id, { kind: 'misc', name: id });

    // The board: a modal widget that frees the mouse for the field and the panels (`client/`).
    game.hud.define('board', {
      at: 'center',
      modal: true,
      html: '<div class="board"></div>',
      css: '.board { width: 1px; height: 1px; }',
      onClose: (p) => game.clock.after(0.05, () => p.hud.widget('board', {})),
    });
    game.events.on('playerReady', ({ player }) => {
      player.hud.widget('board', {});
      dirty = true;
    });
    // Someone coming back to a match they left has their seat again; anyone else joining one under way watches it.
    game.events.on('playerJoin', ({ player }) => {
      if (phase === 'lobby') {
        syncLobby(game);
        dirty = true;
        return;
      }
      if (slotOf(player)) return;
      const seat = gone.get(player.id) ?? gone.get(player.name);
      const s = seat === undefined ? null : slots[seat];
      if (s?.alive && !s.player) {
        s.player = player;
        s.bot = null;
        s.name = player.name;
        gone.delete(player.id);
        gone.delete(player.name);
        player.hud.toast('Welcome back: this is your army');
      } else player.hud.toast('A match is under way: you are watching');
      dirty = true;
    });
    // Someone leaving hands their army to a bot, until they come back.
    game.events.on('playerLeave', ({ player }) => {
      if (phase === 'lobby') {
        syncLobby(game, player.id);
        dirty = true;
        return;
      }
      const s = slotOf(player);
      if (s) {
        gone.set(player.id, s.seat);
        gone.set(player.name, s.seat);
        s.player = null;
        s.bot = new BotBrain(0.6);
        dirty = true;
      }
    });
    game.events.on('clientMessage', ({ player, name, data }) => order(game, player, name, data));
    // Developer tools (not in a published game): an army on the spot, and the coffers filled.
    game.commands.register('army', {
      usage: '<kind> [count] [seat] [x] [z] [attack x z]',
      help: 'Puts units of a kind down for a seat (at its HQ, or at x z), and sends them to attack-move',
      cheat: true,
      run: ([kind, count, seat, x, z, ax, az]) => {
        if (phase !== 'play' || !(kind in UNITS)) return `Kinds: ${Object.keys(UNITS).join(', ')} (during a match)`;
        const s = Number(seat ?? 0);
        if (!slots[s]) return 'No such seat';
        const hq = [...buildings.values()].find((b) => b.seat === s && b.kind === 'hq');
        const cx = x === undefined ? (hq?.x ?? 0) : Number(x);
        const cz = z === undefined ? (hq?.z ?? 0) : Number(z);
        const n = Math.max(1, Math.min(60, Number(count) || 1));
        const side = Math.ceil(Math.sqrt(n));
        const made: number[] = [];
        for (let i = 0; i < n; i++) made.push(addUnit(game, s, kind as UnitKind, cx + ((i % side) - side / 2) * 3.4, cz + (Math.floor(i / side) - side / 2) * 3.4).id);
        if (ax !== undefined) formation(made.map((id) => units.get(id)!), Number(ax), Number(az), true);
        dirty = true;
        return `${n} ${kind} for seat ${s}`;
      },
    });
    game.commands.register('raise', {
      usage: '<kind> [seat] [x] [z] [built share]',
      help: 'Puts a building down for a seat (finished, or that much built)',
      cheat: true,
      run: ([kind, seat, x, z, share]) => {
        if (phase !== 'play' || !(kind in BUILDINGS)) return `Kinds: ${Object.keys(BUILDINGS).join(', ')} (during a match)`;
        const s = Number(seat ?? 0);
        if (!slots[s]) return 'No such seat';
        const part = share === undefined ? 1 : Math.max(0, Math.min(1, Number(share)));
        const b = addBuilding(game, s, kind as BuildingKind, Number(x ?? 0), Number(z ?? 0), part >= 1);
        if (part < 1) {
          b.built = part;
          grow(b);
        } else if (b.kind === 'uplink') uplinkUp(game, b);
        recap(s);
        dirty = true;
        return `${kind} for seat ${s}`;
      },
    });
    game.commands.register('vet', {
      usage: '<seat> <xp>',
      help: 'Every unit of a seat given that much experience (16 makes an Elite)',
      cheat: true,
      run: ([seat, xp]) => {
        let n = 0;
        for (const u of units.values()) if (u.seat === Number(seat) && u.kind !== 'engineer') {
          promote(u, Math.max(0, Number(xp ?? 16)) - u.xp);
          n++;
        }
        return `${n} promoted`;
      },
    });
    game.commands.register('hurt', {
      usage: '<seat> [share]',
      help: 'Every unit of a seat down to a share of its health (default a third)',
      cheat: true,
      run: ([seat, share]) => {
        const k = Math.max(0.01, Math.min(1, Number(share ?? 0.33)));
        let n = 0;
        for (const u of units.values()) if (u.seat === Number(seat)) {
          u.hp = Math.max(1, u.max * k);
          n++;
        }
        dirty = true;
        return `${n} hurt`;
      },
    });
    game.commands.register('rich', {
      help: 'Every commander gets 9999 steel and oil, and every era',
      cheat: true,
      run: () => {
        for (const s of slots) if (s) { s.steel = 9999; s.oil = 9999; s.techs.add('age2'); s.techs.add('age3'); }
        dirty = true;
        return 'rich';
      },
    });
  },

  start(game) {
    phase = 'lobby';
    reset(game);
    gone.clear();
    syncLobby(game);
    dirty = true;
    game.hud.crosshair(false);
  },

  update(game, rawDt) {
    const dt = Math.min(rawDt, 0.1);
    if (rematchIn > 0) {
      rematchIn -= rawDt;
      if (rematchIn <= 0 && phase === 'lobby') startFromLobby(game);
    }
    if (phase === 'briefing') {
      briefingLeft -= rawDt;
      if (briefingLeft <= 0) {
        phase = 'play';
        announce(game);
        dirty = true;
      } else if (Math.ceil(briefingLeft) !== Math.ceil(briefingLeft + rawDt)) dirty = true;
    }
    if (phase === 'play') {
      time += dt;
      simulate(game, dt);
    }
    tell(game, rawDt);
  },
});

function reset(game: GameContext): void {
  for (const b of buildings.values()) unprop(b);
  for (const p of nodeProps.values()) p.remove();
  units = new Map();
  buildings = new Map();
  nodeProps = new Map();
  nodes = [];
  slots = [];
  shots = [];
  booms = [];
  winners = [];
  wonBy = undefined;
  summary = undefined;
  later = [];
  flares = [];
  mines = [];
  relics = [];
  drops = [];
  dropIn = DROP.first;
  wave = 0;
  waveIn = STAND.first;
  waveClear = true;
  waveLook = 0;
  waveStuck.clear();
  sampleIn = 0;
  alertedAt.clear();
  time = 0;
  void game;
}

// ---------------------------------------------------------------------------------------------
// Starting a match

/** Who sits where in a match set up in the lobby. */
interface SeatPlan {
  seat: number;
  team: number;
  player: Player | null;
  name: string;
  skill: number;
  style?: Style;
  /** A bot that sizes up its enemies and gets sharper or easier to match. */
  adaptive?: boolean;
  /** A bot standing in for someone, which keeps their name (not one of its own). */
  keep?: boolean;
}

function startFromLobby(game: GameContext): void {
  const plan: SeatPlan[] = [];
  for (const x of lobby.seats) {
    if (x.kind === 'closed') continue;
    const player = x.kind === 'human' ? game.players.find((p) => p.id === x.id) ?? null : null;
    plan.push({ seat: x.seat, team: x.team, player, name: player?.name ?? (x.kind === 'human' ? x.name : ''), skill: DIFFICULTIES.find((d) => d.id === x.difficulty)!.skill, adaptive: !!DIFFICULTIES.find((d) => d.id === x.difficulty)!.adaptive, keep: x.kind === 'human', style: x.style in STYLES ? (x.style as Style) : undefined });
  }
  startScale = START_RES[lobby.resources];
  startMatch(game, lobby.preset, 0.65, plan);
  peaceUntil = lobby.peace * 60;
  if (!lobby.fog) for (const x of slots) if (x) x.revealUntil = 1e9;
}

function startMatch(game: GameContext, chosen: Mode, skill: number, plan?: SeatPlan[]): void {
  reset(game);
  mode = chosen;
  gone.clear();
  peaceUntil = 0;
  if (!plan) startScale = 1;
  uplinkOn = chosen !== 'stand' && (!plan || lobby.uplink);
  const humans = game.players.slice(0, 4);
  const seat = (n: number, team: number, player: Player | null, name: string, skill: number, style?: Style, adaptive = false, keep = false): void => {
    const doctrine = (player && picked.get(player.id)) || DOCTRINE_IDS[Math.floor(Math.random() * DOCTRINE_IDS.length)];
    const bot = player ? null : new BotBrain(skill, style, adaptive);
    // (A bot goes by its own name, which says how good it is and how it plays.)
    if (bot && !keep) name = bot.callsign(n);
    slots[n] = { seat: n, name, team, player, bot, steel: Math.round(START.steel * startScale), oil: Math.round(START.oil * startScale), pop: 0, cap: 0, alive: true, lost: 0, doctrine, powerAt: DOCTRINES[doctrine].power.first, revealUntil: 0, techs: new Set(), rallyAt: 30, trade: { steel: 1, oil: 1, at: 0 }, stats: newStats(), army: [], banked: [] };
  };
  if (plan) for (const x of plan) seat(x.seat, x.team, x.player, x.name, x.skill, x.style, x.adaptive, x.keep);
  else if (mode === 'stand') {
    for (let i = 0; i < Math.max(1, humans.length); i++) seat(i, 0, humans[i] ?? null, humans[i]?.name ?? 'Commander', skill);
    seat(STAND.seat, 1, null, 'The Raiders', skill);
  } else if (mode === 'coop') {
    // Everyone on one side (a bot ally if there's only one of them), against two bot commanders.
    const allies = Math.max(2, humans.length);
    for (let i = 0; i < allies; i++) seat(i, 0, humans[i] ?? null, humans[i]?.name ?? `Ally ${i + 1}`, skill);
    seat(4, 1, null, 'General Voss', skill);
    seat(5, 1, null, 'Marshal Kade', skill);
  } else {
    for (let i = 0; i < 4; i++) seat(i, mode === 'teams' ? i % 2 : i, humans[i] ?? null, humans[i]?.name ?? ['Cmdr Ash', 'Cmdr Vega', 'Cmdr Ryker', 'Cmdr Sol'][i], skill);
  }
  if (mode === 'stand') {
    // The raiders have no base and no bot: they're the waves.
    const r = slots[STAND.seat]!;
    const k = r.bot?.skill ?? 0.65;
    waveScale = (k < 0.5 ? 0.7 : k < 0.8 ? 1 : 1.35) * (1 + 0.6 * (slots.filter((x) => x && x.seat !== STAND.seat).length - 1));
    Object.assign(r, { name: 'The Raiders', bot: null, doctrine: 'industrial', powerAt: 1e9, rallyAt: 1e9, cap: 9999 });
  }
  nodes = deposits().map((d) => ({ ...d }));
  gridDirty = true;
  DRESSING.forEach((d, i) => {
    const p = game.props.spawn(models.kinds[d.model][0], { position: { x: d.x, y: FLOOR, z: d.z }, scale: SCALE[d.model] * d.scale });
    p.quaternion.setFromEuler(euler.set(0, d.yaw, 0));
    nodeProps.set(-1 - i, p);
  });
  for (const d of nodes) {
    const p = game.props.spawn(d.scrap ? models.kinds[d.scrap][0] : d.kind === 'steel' ? models.steel : models.oil, { position: { x: d.x, y: FLOOR, z: d.z }, scale: SCALE[d.scrap ?? d.kind] });
    p.quaternion.setFromEuler(euler.set(0, hashYaw(d.id), 0));
    nodeProps.set(d.id, p);
  }
  for (const s of slots) {
    if (!s || (mode === 'stand' && s.seat === STAND.seat)) continue;
    const b = BASES[s.seat];
    addBuilding(game, s.seat, 'hq', b.x, b.z, true);
    // The engineers start on the nearest steel: no one should have to tell them to.
    const firstSteel = nodes.filter((n) => n.kind === 'steel').sort((p, q) => dist(p.x, p.z, b.x, b.z) - dist(q.x, q.z, b.x, b.z))[0];
    for (let k = 0; k < 4; k++) addUnit(game, s.seat, 'engineer', b.x + Math.cos(k * 1.57 + 0.8) * 7, b.z + Math.sin(k * 1.57 + 0.8) * 7).order = { t: 'gather', node: firstSteel.id, phase: 'to' };
    for (let k = 0; k < 2; k++) addUnit(game, s.seat, 'rifle', b.x + (k ? 9 : -9) * Math.sign(-b.x || 1), b.z + 3 * (k ? 1 : -1));
  }
  // The wild: guards round each camp's relic.
  slots[NEUTRAL] = { seat: NEUTRAL, name: 'The wild', team: 99, player: null, bot: null, steel: 0, oil: 0, pop: 0, cap: 99, alive: true, lost: 0, doctrine: 'industrial', powerAt: 1e9, revealUntil: 0, techs: new Set(), rallyAt: 1e9, trade: { steel: 1, oil: 1, at: 0 }, stats: newStats(), army: [], banked: [] };
  CAMPS.forEach((c, i) => {
    relics.push({ x: c.x, z: c.z, owner: -1, progress: 0 });
    const guards: [UnitKind, number, number][] = [['brute', 0, 3], ['guard', -4, -2], ['guard', 4, -2], ['guard', 0, -5]];
    for (const [kind, dx, dz] of guards) {
      const g = addUnit(game, NEUTRAL, kind, c.x + dx, c.z + dz);
      g.camp = i;
      g.home = { x: c.x + dx, z: c.z + dz };
    }
  });
  phase = plan ? 'briefing' : 'play';
  briefingLeft = BRIEFING;
  dirty = true;
  if (!plan) announce(game);
}

function announce(game: GameContext): void {
  game.hud.banner('Block Command', mode === 'ffa' ? 'Free for all: destroy every enemy headquarters' : mode === 'teams' ? 'Two against two: destroy their headquarters' : mode === 'stand' ? `Last Stand: hold out against ${STAND.total} waves` : 'Co-op: destroy both enemy headquarters', { duration: 3 });
}

/** Bring the table up to date with who's here: those gone give their place to a bot, those new take a free place, or watch. */
function syncLobby(game: GameContext, leaving = ''): void {
  const here = game.players.filter((p) => p.id !== leaving);
  const ids = new Set(here.map((p) => p.id));
  for (const x of lobby.seats) {
    if (x.kind !== 'human' || ids.has(x.id)) continue;
    x.kind = 'bot';
    x.id = '';
    x.name = '';
    x.ready = false;
  }
  lobby.watchers = lobby.watchers.filter((w) => ids.has(w.id));
  for (const p of here) {
    const sat = lobby.seats.find((x) => x.kind === 'human' && x.id === p.id);
    if (sat) {
      sat.name = p.name;
      continue;
    }
    if (lobby.watchers.some((w) => w.id === p.id)) continue;
    const free = lobby.seats.find((x) => x.kind === 'bot' && x.seat < 4) ?? lobby.seats.find((x) => x.kind === 'closed');
    if (free) Object.assign(free, { kind: 'human', id: p.id, name: p.name, ready: false });
    else lobby.watchers.push({ id: p.id, name: p.name });
  }
  if (!ids.has(lobby.host)) lobby.host = here[0]?.id ?? '';
}

/** A change to the table, from a player's screen. Anyone may move seat, watch or ready up; the rules are the host's. */
function lobbyOrder(game: GameContext, player: Player, d: Record<string, unknown>): void {
  const host = lobby.host === player.id;
  const target = lobby.seats[Number(d.seat)];
  const mine = lobby.seats.find((x) => x.kind === 'human' && x.id === player.id);
  const op = d.op;
  if (op === 'ready' && mine) mine.ready = !mine.ready;
  else if (op === 'sit' && target && target.kind !== 'human' && !(lobby.preset === 'stand' && target.seat >= STAND.seat)) {
    if (mine) Object.assign(mine, { kind: 'bot', id: '', name: '', ready: false });
    lobby.watchers = lobby.watchers.filter((w) => w.id !== player.id);
    Object.assign(target, { kind: 'human', id: player.id, name: player.name, ready: false });
  } else if (op === 'watch') {
    if (mine) Object.assign(mine, { kind: 'bot', id: '', name: '', ready: false });
    if (!lobby.watchers.some((w) => w.id === player.id)) lobby.watchers.push({ id: player.id, name: player.name });
  } else if (!host) return;
  else if (op === 'kind' && target && target.kind !== 'human' && (d.kind === 'bot' || d.kind === 'closed')) target.kind = d.kind;
  else if (op === 'team' && target && [0, 1, 2, 3].includes(Number(d.team))) target.team = Number(d.team);
  else if (op === 'style' && target && (d.style === 'random' || (typeof d.style === 'string' && d.style in STYLES))) target.style = d.style;
  else if (op === 'difficulty' && target && DIFFICULTIES.some((x) => x.id === d.difficulty)) target.difficulty = d.difficulty as DifficultyId;
  else if (op === 'preset' && (d.preset === 'ffa' || d.preset === 'teams' || d.preset === 'coop' || d.preset === 'stand')) {
    lobby.preset = d.preset;
    for (const x of lobby.seats) {
      if (d.preset === 'ffa') x.team = x.seat % 4;
      else if (d.preset === 'teams') x.team = x.seat % 2;
      else x.team = x.seat < 4 ? 0 : 1;
      if (x.kind === 'human') continue;
      // (Last Stand's one bot seat is the raiders: its difficulty is how hard the waves come.)
      x.kind = (d.preset === 'stand' ? x.seat === STAND.seat : d.preset === 'coop' ? x.seat >= 4 || game.players.length > x.seat : x.seat < 4) ? 'bot' : 'closed';
    }
  } else if (op === 'resources' && (d.resources === 'low' || d.resources === 'normal' || d.resources === 'high')) lobby.resources = d.resources;
  else if (op === 'fog') lobby.fog = !lobby.fog;
  else if (op === 'uplink') lobby.uplink = !lobby.uplink;
  else if (op === 'peace' && [0, 3, 5, 10].includes(Number(d.peace))) lobby.peace = Number(d.peace);
  else if (op === 'start') {
    const on = lobby.seats.filter((x) => x.kind !== 'closed');
    if (new Set(on.map((x) => x.team)).size < 2) return player.hud.toast('At least two teams are needed');
    if (on.some((x) => x.kind === 'human' && x.id !== lobby.host && !x.ready)) return player.hud.toast('Not everyone is ready');
    startFromLobby(game);
  }
  dirty = true;
}

const newStats = () => ({ trained: 0, killed: 0, lost: 0, built: 0, razed: 0, steel: 0, oil: 0 });
/** Seconds between the samples of each army's worth (the summary's chart). */
const SAMPLE = 10;
let sampleIn = 0;

/** How much of a vehicle's health an engineer mends a second. */
const REPAIR_UNIT = 0.035;

/** How high a unit's model floats over the ground: helicopters well above it. */
const lift = (kind: UnitKind) => FLOOR + (UNITS[kind].air ? 5 : 0);


function addUnit(game: GameContext, seat: number, kind: UnitKind, x: number, z: number): Unit {
  const prop = null;
  void game;
  const hp = Math.round(UNITS[kind].hp * (kind === 'tank' && slots[seat]!.doctrine === 'armored' ? 1.15 : 1));
  const lake = UNITS[kind].naval ? lakeOf(x, z) : -1;
  if (lake >= 0) ({ x, z } = inside(lake, x, z, 2.5));
  const u: Unit = { id: nextId++, seat, kind, x, z, hp, max: hp, yaw: 0, prop, busy: -9, px: x, pz: z, bob: 0, path: null, pathFor: null, breach: null, order: { t: 'idle' }, next: [], cool: 0, carry: 0, carryRes: null, work: 0, boostUntil: 0, camp: -1, home: null, xp: 0, stance: 0, inside: null, lake, abilityAt: 0, smokeUntil: 0, flakUntil: 0, braceUntil: 0, sprintUntil: 0, hitAt: -99 };
  units.set(u.id, u);
  slots[seat]!.pop += UNITS[kind].pop;
  return u;
}

/**
 * How big a building stands, so much of it built: it grows up inside its scaffolding from a third of
 * its size. (Not sunk into the ground and rising out of it: a model lit by the light where its
 * middle is would be lit by the dark under the ground, and come up black.)
 */
const growth = (built: number) => 0.35 + 0.65 * Math.min(1, Math.max(0, built));
/** A building's model to the size its building has got to. */
const grow = (b: Building) => {
  b.prop.position.set(b.x, FLOOR + rise(b.kind, b.x, b.z), b.z);
  b.prop.scale = SCALE[b.kind] * growth(b.built);
};
/** A wall goes over a hill, standing on it (other buildings only go on the flat). */
const rise = (kind: BuildingKind, x: number, z: number) => (BUILDINGS[kind].wall ? heightAt(x, z) : 0);

/** The grass and flowers under a new building are gone (they'd stand up through its floor). */
function mowFor(game: GameContext, kind: BuildingKind, x: number, z: number): void {
  const r = Math.ceil(BUILDINGS[kind].radius + 1);
  for (let i = Math.floor(x) - r; i <= x + r; i++) for (let k = Math.floor(z) - r; k <= z + r; k++) {
    if (/^cm_(tuft|bloom)/.test(game.world.blockName(game.world.getBlock(i, FLOOR, k)))) game.world.setBlock(i, FLOOR, k, 'air');
  }
}

/** A building off the field: its model, and a gate's doors. */
function unprop(b: Building): void {
  b.prop.remove();
  for (const d of b.gate?.doors ?? []) d.remove();
}

/** Where a gate's doors in the gatehouse model hang: their hinges this far either side of the middle (blocks, at the model's scale). */
const HINGE = (17 / 16) * 3;
/** A gate's doors, swung as far open as it is (both swing the same way, out of the gatehouse), and hidden until it's built. */
function hang(b: Building): void {
  const g = b.gate;
  if (!g) return;
  const yaw = g.axis ? Math.PI / 2 : 0;
  // (Along the wall: x for axis 0, and turned a quarter for axis 1.)
  const ux = Math.cos(yaw);
  const uz = -Math.sin(yaw);
  const swing = (Math.PI / 2) * g.open * 0.92;
  g.doors.forEach((d, i) => {
    const side = i ? 1 : -1;
    d.visible = b.built >= 1;
    d.position.set(b.x + ux * HINGE * side, b.prop.position.y, b.z + uz * HINGE * side);
    // The left one runs from its hinge towards the middle (+x), the right one (turned round) the other way.
    d.quaternion.setFromEuler(euler.set(0, yaw + (i ? Math.PI : 0) + (i ? swing : -swing), 0));
  });
}

function addBuilding(game: GameContext, seat: number, kind: BuildingKind, x: number, z: number, built: boolean, axis = 0): Building {
  const prop = game.props.spawn(models.kinds[kind][variantOf(seat)], { position: { x, y: FLOOR + rise(kind, x, z), z }, scale: SCALE[kind] * growth(built ? 1 : 0) });
  const b: Building = { id: nextId++, seat, kind, x, z, hp: built ? BUILDINGS[kind].hp : BUILDINGS[kind].hp * 0.2, built: built ? 1 : 0, loop: false, lastKind: null, prop, queue: [], rally: null, research: null, cool: 0 };
  if (kind === 'gate') {
    prop.quaternion.setFromEuler(euler.set(0, axis ? Math.PI / 2 : 0, 0));
    // (Its two doors, hung on the gatehouse's towers: shown once it's built.)
    const doors = [0, 1].map(() => game.props.spawn(models.door[variantOf(seat)], { position: { x, y: FLOOR, z }, scale: SCALE.gate_door }));
    b.gate = { axis, open: 0, locked: false, doors };
    hang(b);
  }
  buildings.set(b.id, b);
  gridDirty = true;
  recap(seat);
  if (!built) mowFor(game, kind, x, z);
  return b;
}

function recap(seat: number): void {
  const s = slots[seat];
  if (!s) return;
  let cap = 0;
  for (const b of buildings.values()) if (b.seat === seat && b.built >= 1) cap += BUILDINGS[b.kind].pop;
  s.cap = Math.min(MAX_POP, cap);
}

// ---------------------------------------------------------------------------------------------
// The simulation

const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

const has = (seat: number, t: TechId) => !!slots[seat]?.techs.has(t);
/** A unit's reach (optics adds a fifth), and how fast it fires: its own rate, the intelligence doctrine's infantry, a commander's aura nearby, its Rally. */
const rangeOf = (u: Unit) => UNITS[u.kind].range * (has(u.seat, 'optics') ? 1.2 : 1) * (heightAt(u.x, u.z) >= 1 ? 1 + HIGH.range : 1) * (u.braceUntil > time ? 1.4 : 1) + (u.inside && !u.inside.boat ? COVER_RANGE : 0);
/** What's inside a bunker or a transport. */
const cargo = (id: number, boat: boolean) => [...units.values()].filter((u) => u.inside?.id === id && u.inside.boat === boat);
function fireRate(u: Unit): number {
  let r = UNITS[u.kind].rate;
  if (u.kind === 'rifle' && slots[u.seat]!.doctrine === 'intel') r *= 1.15;
  if (u.kind !== 'hero') for (const h of units.values()) if (h.kind === 'hero' && h.seat === u.seat && dist(h.x, h.z, u.x, u.z) < HERO.aura) { r *= 1 + HERO.auraRate; break; }
  if (u.boostUntil > time) r *= 1 + HERO.rally.rate;
  if (u.flakUntil > time) r *= 2;
  return r * (1 + rankOf(u.xp) * VET.rate);
}
/** How many of a kind a seat has, built or in a queue (for the commander's one-at-a-time limit). */
const countOf = (seat: number, kind: UnitKind) => [...units.values()].filter((u) => u.seat === seat && u.kind === kind).length + [...buildings.values()].filter((b) => b.seat === seat).reduce((n, b) => n + b.queue.filter((q) => q.kind === kind).length, 0);

/** Seconds a base stands once its headquarters is gone. */
const HQ_FALL = 60;

function simulate(game: GameContext, dt: number): void {
  for (let i = later.length - 1; i >= 0; i--) {
    if (later[i].t > time) continue;
    const l = later.splice(i, 1)[0];
    l.run();
  }
  for (const b of [...buildings.values()]) {
    trainTick(game, b, dt);
    researchTick(b, dt);
    towerTick(game, b, dt);
  }
  for (const u of [...units.values()]) if (units.has(u.id)) unitTick(game, u, dt);
  crowd();
  for (const u of units.values()) {
    const mv = dist(u.x, u.z, u.px, u.pz);
    u.px = u.x;
    u.pz = u.z;
    if (mv > 0.01) u.bob += mv * 1.15;
  }
  relicTick(game, dt);
  healTick(dt);
  gateTick(dt);
  medicTick(dt);
  mineTick(game, dt);
  dropTick(game, dt);
  if (mode === 'stand') standTick(game, dt);
  // An uplink that has stood its time: its side wins.
  for (const b of buildings.values()) {
    if (!uplinkOn || b.kind !== 'uplink' || b.doneAt === undefined || time - b.doneAt < UPLINK.hold || !slots[b.seat]?.alive) continue;
    wonBy = 'uplink';
    game.hud.banner('Uplink online', `${slots[b.seat]!.name}’s side wins by the Satellite Uplink`, { duration: 4 });
    checkEnd(game, true, teamOf(b.seat));
    return;
  }
  flares = flares.filter((f) => f.until > time);
  sampleIn -= dt;
  if (sampleIn <= 0) {
    sampleIn = SAMPLE;
    for (const sl of slots) if (sl && sl.seat !== NEUTRAL) sl.banked.push(sl.stats.steel + sl.stats.oil);
    for (const sl of slots) if (sl && sl.seat !== NEUTRAL) sl.army.push([...units.values()].filter((u) => u.seat === sl.seat && u.kind !== 'engineer').reduce((a, u) => a + UNITS[u.kind].cost.steel + UNITS[u.kind].cost.oil, 0));
  }
  // A side that's lost its headquarters comes apart: its buildings fall within half a minute, and it's out.
  for (const s of slots) {
    if (!s || !s.alive || s.seat === NEUTRAL) continue;
    const own = [...buildings.values()].filter((b) => b.seat === s.seat);
    if (!own.some((b) => b.kind === 'hq')) for (const b of own) damageBuilding(game, b.id, (BUILDINGS[b.kind].hp * dt) / HQ_FALL, s.seat);
  }
  for (const s of slots) if (s?.bot && s.alive) s.bot.think(world(game), s, dt);
  checkEnd(game);
}

/** A mine goes off under the first thing of the others' on the ground to cross it; a scout that reaches one defuses it. */
function mineTick(game: GameContext, dt: number): void {
  mineIn -= dt;
  if (mineIn > 0 || !mines.length || time < peaceUntil) return;
  mineIn = 0.15;
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    let boom = false;
    for (const u of units.values()) {
      if (teamOf(u.seat) === m.team || u.inside || UNITS[u.kind].air || u.lake >= 0) continue;
      const d = dist(u.x, u.z, m.x, m.z);
      if (u.kind === 'scout') {
        if (d < MINE.defuse) {
          mines.splice(i, 1);
          break;
        }
        continue;
      }
      if (d < MINE.trigger) {
        boom = true;
        break;
      }
    }
    if (!boom) continue;
    mines.splice(i, 1);
    shellLands(game, m.seat, undefined, 'mine', m.x, m.z, ABILITIES.engineer!.radius, ABILITIES.engineer!.damage);
  }
}

/** Open ground for a pallet: away from every base, the lakes, the hills and the camps. Null if it can't find any. */
function openGround(): { x: number; z: number } | null {
  const hqs = [...buildings.values()].filter((b) => b.kind === 'hq');
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * (HALF - 20) * 2;
    const z = (Math.random() - 0.5) * (HALF - 20) * 2;
    if (inLake(x, z, 4) || inHill(x, z, 3) || inMesa(x, z, 3)) continue;
    if (hqs.some((b) => dist(b.x, b.z, x, z) < DROP.from) || [...buildings.values()].some((b) => dist(b.x, b.z, x, z) < 14)) continue;
    if (relics.some((r) => dist(r.x, r.z, x, z) < 14) || drops.some((d) => dist(d.x, d.z, x, z) < 30)) continue;
    if (DRESSING.some((d) => d.block && dist(x, z, d.x, d.z) < d.block + 3) || nodes.some((n) => dist(n.x, n.z, x, z) < 6)) continue;
    return { x: round1(x), z: round1(z) };
  }
  return null;
}

/** Supply drops: one comes down every so often; the first side standing on it alone takes it. */
function dropTick(game: GameContext, dt: number): void {
  dropIn -= dt;
  if (dropIn <= 0 && time >= peaceUntil) {
    dropIn = DROP.every + Math.random() * DROP.spread;
    const at = drops.length < DROP.most ? openGround() : null;
    if (at) {
      const roll = Math.random();
      drops.push({ id: nextId++, ...at, at: time + DROP.fall, kind: roll < 0.6 ? 'supplies' : roll < 0.8 ? 'medics' : 'intel' });
      game.clients.send('all', 'dropin', at);
      dirty = true;
    }
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.at > time) continue;
    if (time > d.at + DROP.lasts) {
      drops.splice(i, 1);
      dirty = true;
      continue;
    }
    const near = [...units.values()].filter((u) => !u.inside && u.seat !== NEUTRAL && !(mode === 'stand' && u.seat === STAND.seat) && !UNITS[u.kind].naval && dist(u.x, u.z, d.x, d.z) < DROP.reach);
    if (!near.length || new Set(near.map((u) => teamOf(u.seat))).size > 1) continue;
    const by = [...near].sort((a, b) => dist(a.x, a.z, d.x, d.z) - dist(b.x, b.z, d.x, d.z))[0];
    const s = slots[by.seat]!;
    const what = DROP_KINDS[d.kind];
    s.steel += what.steel;
    s.oil += what.oil;
    if (d.kind === 'medics') for (const u of units.values()) if (u.seat === by.seat && dist(u.x, u.z, d.x, d.z) < 18) u.hp = u.max;
    if (d.kind === 'intel') s.revealUntil = Math.max(s.revealUntil, time + 14);
    drops.splice(i, 1);
    s.player?.hud.pop(what.name, { sub: [what.blurb, what.steel ? `+${what.steel} steel` : '', what.oil ? `+${what.oil} oil` : ''].filter(Boolean).join(' · '), color: '#ffd23a' });
    game.hud.feed(`${s.name} took a supply drop`, { color: TEAM_COLORS[by.seat % TEAM_COLORS.length] });
    game.clients.send('all', 'dropgot', { x: d.x, z: d.z, seat: by.seat });
    dirty = true;
  }
}

/** Where a wave comes in: on the map's edge, on open ground, well away from anything of the defenders'. */
function waveSpots(n: number): { x: number; z: number }[] {
  const ours = [...buildings.values()].filter((b) => b.seat !== STAND.seat);
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < 200 && out.length < n; i++) {
    const a = (Math.random() - 0.5) * 2 * (HALF - 8);
    const e = (Math.random() < 0.5 ? -1 : 1) * (HALF - 6);
    const [x, z] = Math.random() < 0.5 ? [a, e] : [e, a];
    if (inLake(x, z, 6) || inHill(x, z, 4) || inMesa(x, z, 6) || ours.some((b) => dist(b.x, b.z, x, z) < 62) || out.some((p) => dist(p.x, p.z, x, z) < 45)) continue;
    out.push({ x, z });
  }
  return out.length ? out : [{ x: 0, z: HALF - 6 }];
}

/** Send the raiders still standing about at the nearest thing the defenders have. */
function waveAttack(list: Unit[]): void {
  const ours = [...buildings.values()].filter((b) => b.seat !== STAND.seat && !BUILDINGS[b.kind].wall);
  for (const group of list.length ? [list] : []) {
    const cx = group.reduce((a, u) => a + u.x, 0) / group.length;
    const cz = group.reduce((a, u) => a + u.z, 0) / group.length;
    const t = [...ours].sort((a, b) => dist(a.x, a.z, cx, cz) - dist(b.x, b.z, cx, cz))[0];
    if (t) formation(group, t.x, t.z, true);
  }
}

/** Last Stand: the next wave when it's due, the pay for clearing one, and the end of it. */
function standTick(game: GameContext, dt: number): void {
  const r = slots[STAND.seat];
  if (!r || !r.alive || phase !== 'play' || time < peaceUntil) return;
  const raiders = [...units.values()].filter((u) => u.seat === STAND.seat);
  if (wave > 0 && !waveClear && !raiders.length) {
    waveClear = true;
    const pay = wavePay(wave);
    for (const s of slots) if (s && s.alive && s.team === 0) {
      s.steel += pay.steel;
      s.oil += pay.oil;
      s.player?.hud.pop(`Wave ${wave} cleared`, { sub: `+${pay.steel} steel, +${pay.oil} oil`, color: '#9fe08a' });
    }
    if (wave >= STAND.total) {
      r.alive = false;
      game.hud.feed('The last of the raiders is gone', { color: '#9fe08a' });
      dirty = true;
      return;
    }
  }
  if (wave < STAND.total) {
    waveIn -= dt;
    if (waveIn <= 0) {
      waveIn = STAND.every;
      wave++;
      waveClear = false;
      const spots = waveSpots(wave >= 10 ? 3 : wave >= 5 ? 2 : 1);
      let left = waveWorth(wave) * waveScale;
      const open = WAVE_UNITS.filter((w) => wave >= w.from);
      const army: UnitKind[] = [];
      while (left >= 55 && army.length < 44) {
        let roll = Math.random() * open.reduce((a, w) => a + w.weight, 0);
        const pick = open.find((w) => (roll -= w.weight) <= 0) ?? open[0];
        const worth = UNITS[pick.kind].cost.steel + UNITS[pick.kind].cost.oil;
        if (worth > left) {
          left -= 30;
          continue;
        }
        left -= worth;
        army.push(pick.kind);
      }
      const made: Unit[][] = spots.map(() => []);
      army.forEach((k, i) => {
        const at = i % spots.length;
        const a = Math.random() * Math.PI * 2;
        const d = 2 + Math.random() * 7;
        made[at].push(addUnit(game, STAND.seat, k, Math.max(-HALF + 1, Math.min(HALF - 1, spots[at].x + Math.cos(a) * d)), Math.max(-HALF + 1, Math.min(HALF - 1, spots[at].z + Math.sin(a) * d))));
      });
      // Every fifth wave, a warlord: a commander tougher each time.
      if (wave % 5 === 0) {
        const lord = addUnit(game, STAND.seat, 'hero', spots[0].x, spots[0].z);
        lord.hp = lord.max = Math.round(lord.max * (1 + wave / 8) * Math.sqrt(waveScale));
        made[0].push(lord);
      }
      r.pop = 0;
      for (const g of made) waveAttack(g);
      game.hud.banner(`Wave ${wave}`, wave % 5 === 0 ? 'A warlord leads them' : `of ${STAND.total}`, { duration: 2.5 });
      game.clients.send('all', 'wave', { wave, spots: spots.map((p) => [round1(p.x), round1(p.z)]).flat() });
      dirty = true;
    }
  } else {
    // After the last wave, a stray or two out in the fog doesn't keep the match going: they run for it.
    waveIn -= dt;
    if (waveIn < -150 && raiders.length && raiders.length <= 3) for (const u of raiders) units.delete(u.id);
  }
  // Those with nothing to do go for the next thing.
  waveLook -= dt;
  if (waveLook <= 0) {
    waveLook = 2;
    waveAttack(raiders.filter((u) => u.order.t === 'idle'));
    // Stuck somewhere, going nowhere and shooting at nothing: it deserts, so it can't hold up the wave.
    for (const u of raiders) {
      const k = waveStuck.get(u.id);
      if (!k || dist(k.x, k.z, u.x, u.z) > 1.5 || time - u.busy < 3) waveStuck.set(u.id, { x: u.x, z: u.z, t: time });
      else if (time - k.t > 25) {
        units.delete(u.id);
        waveStuck.delete(u.id);
      }
    }
  }
}

/** Depots and headquarters patch up those resting near them. */
/**
 * Gates: the doors swing open as one of its own side's on the ground comes near (and isn't locked out),
 * and shut again once they're through.
 */
function gateTick(dt: number): void {
  for (const b of buildings.values()) {
    const g = b.gate;
    if (!g) continue;
    const team = teamOf(b.seat);
    const want = !g.locked && b.built >= 1 && [...units.values()].some((u) => !u.inside && u.lake < 0 && !UNITS[u.kind].air && teamOf(u.seat) === team && Math.abs(u.x - b.x) < 9 && Math.abs(u.z - b.z) < 9 && dist(u.x, u.z, b.x, b.z) < 8.5);
    const was = g.open;
    g.open = Math.max(0, Math.min(1, g.open + (want ? 1.6 : -1.1) * dt));
    if (g.open !== was || (b.built >= 1) !== g.doors[0].visible) {
      hang(b);
    }
  }
}

function healTick(dt: number): void {
  healIn -= dt;
  if (healIn > 0) return;
  healIn = 0.5;
  const posts = [...buildings.values()].filter((b) => b.built >= 1 && (b.kind === 'depot' || b.kind === 'hq'));
  for (const u of units.values()) {
    if (u.hp >= u.max || u.inside || u.seat === NEUTRAL || time - u.hitAt < HEAL.calm) continue;
    if (posts.some((b) => teamOf(b.seat) === teamOf(u.seat) && dist(b.x, b.z, u.x, u.z) < BUILDINGS[b.kind].radius + HEAL.radius)) u.hp = Math.min(u.max, u.hp + u.max * HEAL.rate * 0.5);
    // (Field Medicine: anywhere, at a third of the rate.)
    else if (has(u.seat, 'medicine')) u.hp = Math.min(u.max, u.hp + u.max * HEAL.rate * 0.5 * 0.34);
    // (Elites see to themselves.)
    else if (rankOf(u.xp) >= 3) u.hp = Math.min(u.max, u.hp + u.max * VET.regen * 0.5);
  }
}

/**
 * Medics: each heals the most hurt of its side's people on foot in reach (not itself), as it goes;
 * one standing about with no one to see to walks to the nearest hurt one not far off (unless holding its ground).
 */
function medicTick(dt: number): void {
  for (const m of units.values()) {
    if (m.kind !== 'medic' || m.inside) continue;
    let best: Unit | null = null;
    let worst = 1;
    let near: Unit | null = null;
    let nd = MEDIC.seek;
    for (const v of units.values()) {
      if (v === m || v.inside || v.hp >= v.max || ARMOR[v.kind] !== 'infantry' || teamOf(v.seat) !== teamOf(m.seat)) continue;
      const d = dist(m.x, m.z, v.x, v.z);
      if (d <= MEDIC.reach && v.hp / v.max < worst) {
        worst = v.hp / v.max;
        best = v;
      }
      if (d < nd) {
        nd = d;
        near = v;
      }
    }
    if (best) {
      best.hp = Math.min(best.max, best.hp + MEDIC.rate * dt);
      m.busy = time;
      if (m.order.t === 'idle') m.yaw = Math.atan2(best.x - m.x, best.z - m.z);
    } else if (near && m.order.t === 'idle' && m.stance === 0) step(m, near.x, near.z, dt, MEDIC.reach - 2);
  }
}

/** An order to gather from the nearest deposit (oil if the bank is short of it), for an engineer with nothing to do; null if none's near. */
function gatherOrder(u: Unit): Order | null {
  const s = slots[u.seat];
  if (!s) return null;
  const want: ResKind = s.oil < s.steel * 0.35 && s.oil < 250 ? 'oil' : 'steel';
  const pick = (kind: ResKind) => nodes.filter((n) => n.amount > 0 && n.kind === kind && dist(u.x, u.z, n.x, n.z) < 70).sort((a, b) => dist(u.x, u.z, a.x, a.z) - dist(u.x, u.z, b.x, b.z))[0];
  const n = pick(want) ?? pick(want === 'oil' ? 'steel' : 'oil');
  return n ? { t: 'gather', node: n.id, phase: u.carry >= CARRY ? 'back' : 'to' } : null;
}

/** A building's queue: its first order counts down, and when it's done the unit steps out (to the rally point, if there is one). */
function trainTick(game: GameContext, b: Building, dt: number): void {
  if (b.built < 1) return;
  if (b.loop && b.lastKind && !b.queue.length) train(b, b.lastKind);
  if (!b.queue.length) return;
  const q = b.queue[0];
  q.t += dt * (slots[b.seat]!.doctrine === 'industrial' ? 1.12 : 1);
  if (q.t < UNITS[q.kind].time) return;
  b.queue.shift();
  const def = BUILDINGS[b.kind];
  const base = BASES[b.seat];
  const out = Math.atan2(base.x - b.x || 0.01, base.z - b.z || 0.01) + Math.PI;
  const u = UNITS[q.kind].naval ? addUnit(game, b.seat, q.kind, b.x, b.z) : addUnit(game, b.seat, q.kind, b.x + Math.sin(out) * (def.radius + 1.6) + (Math.random() - 0.5), b.z + Math.cos(out) * (def.radius + 1.6) + (Math.random() - 0.5));
  slots[b.seat]!.stats.trained++;
  // (Its pop was counted when it was queued.)
  slots[b.seat]!.pop -= UNITS[q.kind].pop;
  if (b.rally) {
    let at = rallySpot(b.seat, b.rally.x, b.rally.z, SPACE[q.kind]);
    if (u.lake >= 0) at = inside(u.lake, at.x, at.z);
    u.order = { t: 'move', x: at.x, z: at.z, attack: q.kind !== 'engineer' };
  }
  else if (q.kind === 'engineer') u.order = gatherOrder(u) ?? u.order;
  dirty = true;
}

/**
 * Relics: a side with units at a relic and no one else there (and the camp's guards dead) takes it
 * after a few seconds, and while it holds it the relic pays steel.
 */
function relicTick(game: GameContext, dt: number): void {
  for (const r of relics) {
    const teams = new Set<number>();
    const count = new Map<number, number>();
    let wild = false;
    for (const u of units.values()) {
      if (u.inside) continue;
      const d = dist(u.x, u.z, r.x, r.z);
      if (u.seat === NEUTRAL) wild ||= d < RELIC.radius + 5;
      else if (d < RELIC.radius) {
        teams.add(teamOf(u.seat));
        count.set(u.seat, (count.get(u.seat) ?? 0) + 1);
      }
    }
    const ownerTeam = r.owner >= 0 ? teamOf(r.owner) : -1;
    if (wild) r.progress = 0;
    else if (teams.size === 1 && !teams.has(ownerTeam)) {
      r.progress += dt;
      if (r.progress >= RELIC.hold) {
        const seat = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
        r.owner = seat;
        r.progress = 0;
        game.hud.feed(slots[seat]!.name + ' took a relic', { color: TEAM_COLORS[seat % TEAM_COLORS.length] });
        dirty = true;
      }
    } else r.progress = Math.max(0, r.progress - dt);
    if (r.owner >= 0 && slots[r.owner]?.alive) {
      slots[r.owner]!.steel += RELIC.income * dt;
      slots[r.owner]!.stats.steel += RELIC.income * dt;
    }
  }
}

/** A lab's research counts down, and when it's done the whole army has it. */
function researchTick(b: Building, dt: number): void {
  if (!b.research || b.built < 1) return;
  b.research.t += dt * (slots[b.seat]!.doctrine === 'industrial' ? 1.12 : 1);
  if (b.research.t < TECHS[b.research.id].time) return;
  slots[b.seat]!.techs.add(b.research.id);
  slots[b.seat]!.player?.hud.toast(TECHS[b.research.id].name + ' researched');
  b.research = null;
  dirty = true;
}

/** What `sell` fetches at a slot's trade post now (a share of full price): where it was, climbing back since. */
function priceNow(s: Slot, sell: ResKind): number {
  return Math.min(1, s.trade[sell] + (time - s.trade.at) * TRADE.recover);
}

function research(b: Building, tech: TechId): boolean {
  const s = slots[b.seat]!;
  const cost = TECHS[tech].cost;
  if (b.built < 1 || b.research || s.techs.has(tech) || (tech === 'age3' && !s.techs.has('age2')) || !BUILDINGS[b.kind].research?.includes(tech) || !canAfford(s, cost)) return false;
  // (One lab per upgrade: not the same one in two labs at once.)
  if ([...buildings.values()].some((x) => x.seat === b.seat && x.research?.id === tech)) return false;
  s.steel -= cost.steel;
  s.oil -= cost.oil;
  b.research = { id: tech, t: 0 };
  dirty = true;
  return true;
}

/** A guard tower shoots the nearest thing in reach, air or ground. */
function towerTick(game: GameContext, b: Building, dt: number): void {
  const g = BUILDINGS[b.kind].guns;
  if (!g || b.built < 1) return;
  b.cool -= dt;
  if (b.cool > 0) return;
  const e = nearestEnemy(b.seat, b.x, b.z, g.range * (has(b.seat, 'optics') ? 1.2 : 1), g.hits);
  if (!e) return;
  // (The HQ fires faster for the engineers sheltering in it.)
  const crew = b.kind === 'hq' ? cargo(b.id, false).filter((u) => u.kind === 'engineer').length : 0;
  b.cool = 1 / (g.rate * (1 + ALARM.boost * crew));
  const dmg = g.damage * (has(b.seat, 'ordnance') ? 1.2 : 1);
  shots.push({ x: round1(b.x), y: FLOOR + 7, z: round1(b.z), tx: round1(e.x), ty: FLOOR + heightAt(e.x, e.z) + 1.5, tz: round1(e.z), big: false, k: -1 });
  if (e.building) damageBuilding(game, e.id, dmg, b.seat);
  else damageUnit(game, e.id, dmg, b.seat);
}

/** The commander's Rally: every unit of its side near it is healed and fires faster for a while. */
function useRally(game: GameContext, seat: number): boolean {
  const s = slots[seat];
  const h = [...units.values()].find((u) => u.seat === seat && u.kind === 'hero');
  if (!s || !h || s.rallyAt > time) return false;
  s.rallyAt = time + HERO.rally.cooldown;
  for (const u of units.values()) {
    if (u.seat !== seat || dist(u.x, u.z, h.x, h.z) > HERO.rally.radius) continue;
    u.hp = Math.min(u.max, u.hp + u.max * HERO.rally.heal);
    u.boostUntil = time + HERO.rally.seconds;
  }
  game.clients.send('all', 'rallyfx', { x: round1(h.x), z: round1(h.z) });
  dirty = true;
  return true;
}

/** The nearest enemy unit or building to a point, within `range` (a building counts from its edge). */
function nearestEnemy(seat: number, x: number, z: number, range: number, hits: 'ground' | 'air' | 'both' = 'ground'): { id: number; building: boolean; x: number; z: number; d: number } | null {
  const team = teamOf(seat);
  let best: { id: number; building: boolean; x: number; z: number; d: number } | null = null;
  const peace = time < peaceUntil && seat !== NEUTRAL;
  for (const u of units.values()) {
    if (teamOf(u.seat) === team || u.inside || (peace && u.seat !== NEUTRAL)) continue;
    const air = !!UNITS[u.kind].air;
    if ((air && hits === 'ground') || (!air && hits === 'air')) continue;
    const d = dist(x, z, u.x, u.z);
    if (d <= range && (!best || d < best.d)) best = { id: u.id, building: false, x: u.x, z: u.z, d };
  }
  if (best) return best;
  if (hits === 'air') return null;
  if (peace) return null;
  for (const b of buildings.values()) {
    // (A wall isn't shot at for being near: only when told to, or when it's in the way.)
    if (teamOf(b.seat) === team || BUILDINGS[b.kind].wall) continue;
    const d = dist(x, z, b.x, b.z) - BUILDINGS[b.kind].radius;
    if (d <= range && (!best || d < best.d)) best = { id: b.id, building: true, x: b.x, z: b.z, d };
  }
  return best;
}

function targetOf(o: { id: number; building: boolean }): { x: number; z: number; radius: number; hp: number; air: boolean } | null {
  if (o.building) {
    const b = buildings.get(o.id);
    return b ? { x: b.x, z: b.z, radius: BUILDINGS[b.kind].radius, hp: b.hp, air: false } : null;
  }
  const u = units.get(o.id);
  return u && !u.inside ? { x: u.x, z: u.z, radius: UNITS[u.kind].size * 0.4, hp: u.hp, air: !!UNITS[u.kind].air } : null;
}

// ---------------------------------------------------------------------------------------------
// Pathfinding: a coarse grid of the field (3 blocks a cell) with the buildings, deposits and trees
// blocked out, searched with A*; a unit follows the path's corners, straight on wherever it can see
// its goal. The grid is made again when a building goes up or comes down or a deposit runs dry.

const CELL = 3;
const GN = Math.ceil((HALF * 2) / CELL);
let grid = new Uint8Array(GN * GN);
let gridDirty = true;
let gridVer = 0;
const gcell = (v: number) => Math.max(0, Math.min(GN - 1, Math.floor((v + HALF) / CELL)));
/** In the grid: 0 open, 1 shut (a building, a tree, water), `WALL` a length of wall, `GATE` + a team that team's gate (open to it alone). */
const WALL = 2;
const GATE = 4;
const passOf = (team: number) => (team >= 0 ? GATE + team : 255);
/** The wall or gate on each cell that has one (by the cell's index), and the last way that wasn't found: the wall to break to make one. */
const wallAt = new Map<number, number>();
let lastBreach: { id: number; x: number; z: number } | null = null;

function rebuildGrid(): void {
  grid = new Uint8Array(GN * GN);
  const block = (cx: number, cz: number, r: number) => {
    for (let i = gcell(cx - r); i <= gcell(cx + r); i++) for (let j = gcell(cz - r); j <= gcell(cz + r); j++) if (Math.hypot(i * CELL - HALF + CELL / 2 - cx, j * CELL - HALF + CELL / 2 - cz) <= r + CELL * 0.5) grid[j * GN + i] = 1;
  };
  // (The same reaches as `landShut` and the screen's wall ghost, so a wall's drawn where it'll go.)
  for (const bl of buildings.values()) if (!BUILDINGS[bl.kind].wall) block(bl.x, bl.z, BUILDINGS[bl.kind].radius + SHUT.building);
  for (const n of nodes) if (n.amount > 0 && !n.salvage) block(n.x, n.z, SHUT.deposit);
  for (const l of LAKES) block(l.x, l.z, l.r + SHUT.lake);
  for (const m of MESAS) block(m.x, m.z, m.r + SHUT.mesa);
  for (const d of DRESSING) if (d.block) block(d.x, d.z, d.block);
  for (const t of TREES) block(t.x, t.z, SHUT.tree);
  wallAt.clear();
  for (const bl of buildings.values()) {
    if (!BUILDINGS[bl.kind].wall) continue;
    for (const p of bl.gate ? gateCells(bl.x, bl.z, bl.gate.axis) : [bl]) {
      const c = gcell(p.z) * GN + gcell(p.x);
      // (A locked gate is a wall to everyone.)
      grid[c] = bl.gate && !bl.gate.locked ? GATE + Math.max(0, teamOf(bl.seat)) : WALL;
      wallAt.set(c, bl.id);
    }
  }
  gridDirty = false;
  gridVer++;
}

/** Whether a point is in something a unit of this team can't walk through (no team: a gate is shut too). */
const isBlocked = (x: number, z: number, team = -1) => {
  const v = grid[gcell(z) * GN + gcell(x)];
  return v !== 0 && v !== passOf(team);
};

/** Whether the straight line between two points crosses nothing blocked. */
function clear(x0: number, z0: number, x1: number, z1: number, team = -1): boolean {
  const d = dist(x0, z0, x1, z1);
  for (let k = 1.5; k < d; k += 1.5) if (isBlocked(x0 + ((x1 - x0) * k) / d, z0 + ((z1 - z0) * k) / d, team)) return false;
  return true;
}

/** The corners of a way from one point to another (nothing if they're joined by a straight line, or no way is found). */
function findPath(x0: number, z0: number, x1: number, z1: number, team = -1): { x: number; z: number }[] {
  if (gridDirty) rebuildGrid();
  lastBreach = null;
  const pass = passOf(team);
  const shut = (n: number) => grid[n] !== 0 && grid[n] !== pass;
  let start = gcell(z0) * GN + gcell(x0);
  // Starting in a shut cell (pressed up against a building, or squeezed into the edge of a wall): the way
  // begins at the nearest free one to where it really is, so it isn't penned in by its own corner of the grid.
  let out0: { x: number; z: number } | null = null;
  if (shut(start)) {
    const si = start % GN;
    const sj = Math.floor(start / GN);
    let best = 1e9;
    for (let r = 1; r <= 3 && !out0; r++) {
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = si + di;
        const j = sj + dj;
        if (i < 0 || j < 0 || i >= GN || j >= GN || shut(j * GN + i)) continue;
        const cx = i * CELL - HALF + CELL / 2;
        const cz = j * CELL - HALF + CELL / 2;
        // (The nearest of them, a little towards where it's going.)
        const sc = dist(cx, cz, x0, z0) + 0.25 * dist(cx, cz, x1, z1);
        if (sc < best) {
          best = sc;
          out0 = { x: cx, z: cz };
        }
      }
    }
    if (out0) start = gcell(out0.z) * GN + gcell(out0.x);
  }
  let goalI = gcell(x1);
  let goalJ = gcell(z1);
  // A goal inside something is moved to the nearest free cell.
  // A goal inside something (a deposit, a building): any free cell round it will do, the first one the
  // search comes to: the near side of it, not one picked blind that may be round the far side of a wall.
  let ends: Set<number> | null = null;
  if (shut(goalJ * GN + goalI)) {
    ends = new Set();
    let first = -1;
    for (let r = 1; r < 8 && (first < 0 || r <= first + 1); r++) {
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = goalI + di;
          const j = goalJ + dj;
          if (i >= 0 && j >= 0 && i < GN && j < GN && !shut(j * GN + i)) {
            ends.add(j * GN + i);
            if (first < 0) first = r;
          }
        }
      }
    }
    if (!ends.size) ends = null;
  }
  let goal = ends ? [...ends][0] : goalJ * GN + goalI;
  const g = new Float32Array(GN * GN).fill(1e9);
  const from = new Int32Array(GN * GN).fill(-1);
  const closed = new Uint8Array(GN * GN);
  const heap: number[] = [start];
  const f = new Float32Array(GN * GN);
  const hh = (i: number) => {
    const dx = Math.abs((i % GN) - goalI);
    const dz = Math.abs(Math.floor(i / GN) - goalJ);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  g[start] = 0;
  f[start] = hh(start);
  const push = (n: number) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[heap[p]] <= f[heap[i]]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  heap.length = 0;
  push(start);
  while (heap.length) {
    const cur = pop();
    if (cur === goal || ends?.has(cur)) {
      goal = cur;
      break;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % GN;
    const cj = Math.floor(cur / GN);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= GN || j >= GN) continue;
        const n = j * GN + i;
        if (shut(n) || closed[n]) continue;
        // (No cutting a corner between two blocked cells.)
        if (di && dj && (shut(cj * GN + i) || shut(j * GN + ci))) continue;
        const cost = g[cur] + (di && dj ? 1.414 : 1);
        if (cost < g[n]) {
          g[n] = cost;
          from[n] = cur;
          f[n] = cost + hh(n);
          push(n);
        }
      }
    }
  }
  if (from[goal] < 0 && goal !== start) {
    // No way: if a wall of another side's stands between (one with open ground this side of it), that's the one to break:
    // the nearest to where this was going, of those not far out of its way.
    let best = 1e9;
    for (const [c, id] of wallAt) {
      const w = buildings.get(id);
      if (!w || teamOf(w.seat) === team) continue;
      const ci = c % GN;
      const cj = Math.floor(c / GN);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= GN || j >= GN || !closed[j * GN + i]) continue;
        const ax = i * CELL - HALF + CELL / 2;
        const az = j * CELL - HALF + CELL / 2;
        const score = dist(w.x, w.z, x1, z1) + 0.5 * dist(ax, az, x0, z0);
        if (score < best) {
          best = score;
          lastBreach = { id, x: ax, z: az };
        }
      }
    }
    return [];
  }
  const cells: { x: number; z: number }[] = [];
  for (let c = goal; c !== start && c >= 0; c = from[c]) cells.push({ x: (c % GN) * CELL - HALF + CELL / 2, z: Math.floor(c / GN) * CELL - HALF + CELL / 2 });
  cells.reverse();
  if (out0) cells.unshift(out0);
  // Pulled tight: from each corner, the furthest one that can be seen.
  const out: { x: number; z: number }[] = [];
  let px = x0;
  let pz = z0;
  let i = 0;
  while (i < cells.length) {
    let far = i;
    for (let k = cells.length - 1; k > i; k--) {
      if (clear(px, pz, cells[k].x, cells[k].z, team)) {
        far = k;
        break;
      }
    }
    out.push(cells[far]);
    px = cells[far].x;
    pz = cells[far].z;
    i = far + 1;
  }
  return out;
}

/** A move straight at a point. */
function move(u: Unit, tx: number, tz: number, dt: number, stop: number): boolean {
  const d = dist(u.x, u.z, tx, tz);
  if (d <= stop) return true;
  const o = u.order;
  const own = o.t === 'move' && o.pace !== undefined && dist(u.x, u.z, o.x, o.z) > 6 ? Math.min(UNITS[u.kind].speed, o.pace) : UNITS[u.kind].speed;
  const k = Math.min(own * (u.sprintUntil > time ? RETREAT.speed : 1) * (ARMOR[u.kind] !== 'infantry' && has(u.seat, 'engines') ? 1.15 : 1) * dt, d - stop) / d;
  u.x += (tx - u.x) * k;
  u.z += (tz - u.z) * k;
  u.yaw = Math.atan2(tx - u.x, tz - u.z);
  return false;
}

/** A move towards a point, round whatever's in the way (flyers go straight): true when within `stop` of it. */
function step(u: Unit, tx: number, tz: number, dt: number, stop: number): boolean {
  if (dist(u.x, u.z, tx, tz) <= stop) return true;
  if (UNITS[u.kind].air) return move(u, tx, tz, dt, stop);
  if (u.lake >= 0) {
    const p = inside(u.lake, tx, tz, 2);
    return move(u, p.x, p.z, dt, p.x === tx && p.z === tz ? stop : 0.3) || dist(u.x, u.z, p.x, p.z) <= 0.31;
  }
  if (gridDirty) rebuildGrid();
  const team = teamOf(u.seat);
  if (clear(u.x, u.z, tx, tz, team)) {
    u.path = null;
    return move(u, tx, tz, dt, stop);
  }
  const pf = u.pathFor;
  if (!u.path || !pf || pf.ver !== gridVer || dist(pf.x, pf.z, tx, tz) > 4) {
    u.path = findPath(u.x, u.z, tx, tz, team);
    u.pathFor = { x: tx, z: tz, ver: gridVer };
    if (!u.path.length && lastBreach) breachAt(u, lastBreach);
  }
  while (u.path.length && dist(u.x, u.z, u.path[0].x, u.path[0].z) < 1.4) u.path.shift();
  // Stuck (pressed against a corner by the crowd, say): it looks for its way again, and if that's no
  // better, sidesteps for a moment.
  const pr = u.prog;
  if (!pr || dist(pr.x, pr.z, u.x, u.z) > 1.2) u.prog = { x: u.x, z: u.z, t: time, n: 0 };
  else if (time - pr.t > 1.6) {
    pr.t = time;
    pr.n++;
    u.pathFor = null;
    if (pr.n >= 2) u.dodge = { a: Math.atan2(tz - u.z, tx - u.x) + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * 0.6), until: time + 0.7 };
  }
  if (u.dodge && u.dodge.until > time) {
    const nx = u.x + Math.cos(u.dodge.a) * 2;
    const nz = u.z + Math.sin(u.dodge.a) * 2;
    if (!isBlocked(nx, nz, team) || grid[gcell(nz) * GN + gcell(nx)] === 1) {
      move(u, nx, nz, dt, 0);
      return false;
    }
  }
  const next = u.path[0];
  if (!next) {
    // Straight at it, there being no better way: but never through a wall. One of theirs in the way is to be broken down.
    const d = dist(u.x, u.z, tx, tz);
    const k = Math.min(1.6, d) / d;
    const c = gcell(u.z + (tz - u.z) * k) * GN + gcell(u.x + (tx - u.x) * k);
    if (grid[c] >= WALL && grid[c] !== passOf(team) && c !== gcell(u.z) * GN + gcell(u.x)) {
      const id = wallAt.get(c);
      if (id !== undefined && !u.breach) breachAt(u, { id, x: u.x, z: u.z });
      return false;
    }
    return move(u, tx, tz, dt, stop);
  }
  move(u, next.x, next.z, dt, 0);
  return false;
}

/**
 * A fighting unit with no way to where it's been sent to fight takes on the wall that's in the way
 * (attacking, attack-moving or on patrol; a commander's plain move just stops at the wall, though a
 * bot's or a raider's doesn't).
 */
function breachAt(u: Unit, at: { id: number; x: number; z: number }): void {
  const w = buildings.get(at.id);
  const o = u.order;
  const def = UNITS[u.kind];
  if (!w || teamOf(w.seat) === teamOf(u.seat) || time < peaceUntil || u.kind === 'engineer' || !(def.damage > 0) || def.hits === 'air') return;
  if (!(o.t === 'attack' || o.t === 'patrol' || (o.t === 'move' && (o.attack || !slots[u.seat]?.player)))) return;
  u.breach = { id: at.id, x: at.x, z: at.z, ver: gridVer, order: o };
}

function unitTick(game: GameContext, u: Unit, dt: number): void {
  const def = UNITS[u.kind];
  const range = rangeOf(u);
  u.cool -= dt;
  const o = u.order;
  const fighter = u.kind !== 'engineer' && def.damage > 0;
  if (u.inside) {
    const c = u.inside.boat ? units.get(u.inside.id) : buildings.get(u.inside.id);
    if (!c) {
      u.inside = null;
      return;
    }
    u.x = c.x;
    u.z = c.z;
    // From a bunker, soldiers fire from cover (unless holding fire); from a boat, not at all.
    if (!u.inside.boat && fighter && u.stance !== 2) {
      const e = nearestEnemy(u.seat, u.x, u.z, range + BUILDINGS[(c as Building).kind].radius, def.hits);
      if (e) fire(game, u, e);
    }
    return;
  }
  if (o.t === 'idle' && u.next.length) {
    u.order = u.next.shift()!;
    return;
  }
  if (o.t === 'enter') return enterTick(u, o, dt);
  // Braced: it stays where it is and shoots what's in its longer reach, and goes on with its orders after.
  if (u.braceUntil > time) {
    const e = nearestEnemy(u.seat, u.x, u.z, range, def.hits);
    if (e && u.stance !== 2) {
      u.yaw = Math.atan2(e.x - u.x, e.z - u.z);
      fire(game, u, e);
    }
    return;
  }
  if (o.t === 'cast') {
    const a = ABILITIES[u.kind];
    if (!a || u.abilityAt > time) u.order = u.next.shift() ?? { t: 'idle' };
    else if (dist(u.x, u.z, o.x, o.z) > a.range) step(u, o.x, o.z, dt, a.range - 0.5);
    else {
      cast(game, u, a, o.x, o.z);
      u.order = u.next.shift() ?? ((u.kind === 'engineer' && gatherOrder(u)) || { t: 'idle' });
    }
    return;
  }
  // A wild unit doesn't wander: past its leash it goes back to its spot.
  if (u.home && o.t !== 'move' && dist(u.x, u.z, u.home.x, u.home.z) > 14) {
    u.order = { t: 'move', x: u.home.x, z: u.home.z, attack: false, flee: true };
    return;
  }

  if (u.breach) {
    if (gridDirty) rebuildGrid();
    const w = buildings.get(u.breach.id);
    const aim = o.t === 'attack' ? targetOf(o) : null;
    if (!w || u.breach.order !== o || u.breach.ver !== gridVer || (aim && dist(u.x, u.z, aim.x, aim.z) - aim.radius <= range)) {
      // (The wall's down, or the field has changed, or there are new orders: look for a way again.)
      u.breach = null;
      u.pathFor = null;
    } else {
      // Whoever's in reach first, then the wall.
      const e = nearestEnemy(u.seat, u.x, u.z, range, def.hits);
      if (e) {
        u.yaw = Math.atan2(e.x - u.x, e.z - u.z);
        fire(game, u, e);
        return;
      }
      const at = { x: u.breach.x, z: u.breach.z };
      if (dist(u.x, u.z, w.x, w.z) - BUILDINGS[w.kind].radius > range && !step(u, at.x, at.z, dt, 0.8)) return;
      u.yaw = Math.atan2(w.x - u.x, w.z - u.z);
      fire(game, u, { id: w.id, building: true });
      return;
    }
  }
  if (o.t === 'attack') {
    const t = targetOf(o);
    if (!t) u.order = { t: 'idle' };
    else {
      const hits = def.hits ?? 'ground';
      if ((t.air && hits === 'ground') || (!t.air && hits === 'air')) u.order = { t: 'idle' };
      else {
        const d = dist(u.x, u.z, t.x, t.z) - t.radius;
        // (A boat that's as near as its lake lets it get, and still out of reach, gives up.)
        if (d > range) {
          // Shot at on the way to it (its target run off behind its friends, say): it fights back
          // first, and goes on after the target once nothing's in reach.
          const back = fighter && u.stance !== 2 && u.hitAt > time - 2.5 ? nearestEnemy(u.seat, u.x, u.z, range, hits) : null;
          if (back) {
            u.yaw = Math.atan2(back.x - u.x, back.z - u.z);
            fire(game, u, back);
          } else if (step(u, t.x, t.z, dt, range + t.radius - 0.5) && u.lake >= 0) u.order = { t: 'idle' };
        } else fire(game, u, o);
      }
    }
    return;
  }
  if (o.t === 'move') {
    // Shot at on its way, a fighter turns to fight (then goes on to where it was going): unless it's getting
    // away on purpose (running, holding its fire, or told to fall back).
    if (!o.attack && fighter && !o.flee && u.stance !== 2 && u.sprintUntil <= time && time - u.hitAt < 2 && !u.home && nearestEnemy(u.seat, u.x, u.z, range + 4, def.hits)) {
      u.order = { ...o, attack: true };
      return;
    }
    // Attack-moving, a fighter shoots whatever is in reach as it goes (and stops to).
    const e = o.attack && fighter ? nearestEnemy(u.seat, u.x, u.z, range, def.hits) : null;
    if (e) {
      u.yaw = Math.atan2(e.x - u.x, e.z - u.z);
      fire(game, u, e);
      return;
    }
    if (step(u, o.x, o.z, dt, 0.4)) {
      if (o.face !== undefined) u.yaw = o.face;
      u.order = { t: 'idle' };
    }
    return;
  }
  if (o.t === 'patrol') {
    const e = fighter ? nearestEnemy(u.seat, u.x, u.z, range, def.hits) : null;
    if (e) {
      u.yaw = Math.atan2(e.x - u.x, e.z - u.z);
      fire(game, u, e);
      return;
    }
    if (step(u, o.to ? o.bx : o.ax, o.to ? o.bz : o.az, dt, 0.8)) o.to = o.to ? 0 : 1;
    return;
  }
  if (o.t === 'gather') return gatherTick(game, u, o, dt);
  if (o.t === 'repair' && o.unit) {
    // A vehicle: up to it, and mended, as long as it stays put long enough (it's followed if it moves).
    const v = units.get(o.id);
    if (!v || v.hp >= v.max || teamOf(v.seat) !== teamOf(u.seat) || v.inside) {
      u.order = u.next.shift() ?? { t: 'idle' };
      return;
    }
    // (From as near as the crowding lets it get: they keep their distance from a tank.)
    const r = (SPACE[v.kind] + SPACE[u.kind]) / 2 + 1;
    if (dist(u.x, u.z, v.x, v.z) > r) step(u, v.x, v.z, dt, r - 0.4);
    else {
      u.yaw = Math.atan2(v.x - u.x, v.z - u.z);
      u.busy = time;
      v.hp = Math.min(v.max, v.hp + v.max * REPAIR_UNIT * dt * (has(u.seat, 'logistics') ? 1.3 : 1));
    }
    return;
  }
  if (o.t === 'repair') {
    const b = buildings.get(o.id);
    if (!b || b.built < 1 || b.hp >= BUILDINGS[b.kind].hp) {
      u.order = u.next.shift() ?? ((u.kind === 'engineer' && gatherOrder(u)) || { t: 'idle' });
      return;
    }
    // (A length of wall is built or mended from a little further off: from inside a corner, it's cornerwise.)
    const r = BUILDINGS[b.kind].radius + (BUILDINGS[b.kind].wall ? 3.5 : 1.6);
    if (dist(u.x, u.z, b.x, b.z) > r) step(u, b.x, b.z, dt, r - 0.4);
    else {
      u.yaw = Math.atan2(b.x - u.x, b.z - u.z);
      u.busy = time;
      b.hp = Math.min(BUILDINGS[b.kind].hp, b.hp + BUILDINGS[b.kind].hp * 0.045 * dt * (has(u.seat, 'logistics') ? 1.3 : 1));
    }
    return;
  }
  if (o.t === 'build') {
    const b = buildings.get(o.id);
    if (!b || b.built >= 1) {
      // Done: back to work. (A length of wall done, the nearest of the line still to build is next: a long line is more than can be queued.)
      let more: Building | null = null;
      if (!u.next.length && b && BUILDINGS[b.kind].wall) for (const w of buildings.values()) if (w.seat === u.seat && w.built < 1 && BUILDINGS[w.kind].wall && dist(w.x, w.z, u.x, u.z) < 40 && (!more || dist(w.x, w.z, u.x, u.z) < dist(more.x, more.z, u.x, u.z))) more = w;
      u.order = (more && { t: 'build', id: more.id }) ?? u.next.shift() ?? ((u.kind === 'engineer' && gatherOrder(u)) || { t: 'idle' });
      return;
    }
    // (A length of wall is built or mended from a little further off: from inside a corner, it's cornerwise.)
    const r = BUILDINGS[b.kind].radius + (BUILDINGS[b.kind].wall ? 3.5 : 1.6);
    if (dist(u.x, u.z, b.x, b.z) > r) step(u, b.x, b.z, dt, r - 0.4);
    else {
      u.yaw = Math.atan2(b.x - u.x, b.z - u.z);
      u.busy = time;
      const before = b.built;
      b.built = Math.min(1, b.built + (dt * (has(u.seat, 'logistics') ? 1.3 : 1)) / BUILDINGS[b.kind].time);
      b.hp = Math.min(BUILDINGS[b.kind].hp, b.hp + (BUILDINGS[b.kind].hp * 0.8 * dt) / BUILDINGS[b.kind].time);
      grow(b);
      if (before < 1 && b.built >= 1) {
        if (!BUILDINGS[b.kind].wall) slots[b.seat]!.stats.built++;
        if (b.kind === 'uplink') uplinkUp(game, b);
        recap(b.seat);
        dirty = true;
      }
    }
    return;
  }
  // Idle: a fighter shoots what's in reach, and (aggressive) goes after what's a little past it;
  // holding its ground it only shoots, holding fire it doesn't.
  if (fighter && u.stance !== 2) {
    const e = nearestEnemy(u.seat, u.x, u.z, range + (u.stance === 0 ? 5 : 0), def.hits);
    if (e) {
      if (e.d <= range) {
        u.yaw = Math.atan2(e.x - u.x, e.z - u.z);
        fire(game, u, e);
      } else if (u.stance === 0) u.order = { t: 'attack', id: e.id, building: e.building };
    }
  }
}

/** A place round a deposit to work from: six in a ring by it, then twelve in a ring behind them. */
function slotAt(node: Deposit, slot: number): { x: number; z: number } {
  const inner = slot < 6;
  const a = node.id * 1.3 + (inner ? (slot * Math.PI) / 3 : ((slot - 6) * Math.PI) / 6 + 0.26);
  const r = inner ? 3.7 : 6.2;
  return { x: node.x + Math.cos(a) * r, z: node.z + Math.sin(a) * r };
}

/** The nearest place at a deposit that no one else has taken and that can be stood on: engineers work round it, not on top of each other. */
function gatherSlot(u: Unit, id: number, node: Deposit): number {
  if (gridDirty) rebuildGrid();
  const taken = new Set<number>();
  for (const v of units.values()) if (v !== u && v.order.t === 'gather' && v.order.node === id && v.order.slot !== undefined) taken.add(v.order.slot);
  let best = u.id % 18;
  let bd = Infinity;
  for (let k = 0; k < 18; k++) {
    if (taken.has(k)) continue;
    const p = slotAt(node, k);
    if (isBlocked(p.x, p.z)) continue;
    // (The ring by the deposit first.)
    const d = dist(u.x, u.z, p.x, p.z) + (k < 6 ? 0 : 40);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

function gatherTick(game: GameContext, u: Unit, o: Extract<Order, { t: 'gather' }>, dt: number): void {
  const node = nodes[o.node];
  if (!node || node.amount <= 0) {
    // Dry: on to the nearest one of the same kind, else stop.
    const next = nodes.filter((n) => n.amount > 0 && n.kind === node?.kind).sort((a, b) => dist(u.x, u.z, a.x, a.z) - dist(u.x, u.z, b.x, b.z))[0];
    u.order = next ? { t: 'gather', node: next.id, phase: u.carry >= CARRY ? 'back' : 'to' } : { t: 'idle' };
    return;
  }
  // (What it's gathered goes to the nearest headquarters or depot.)
  const post = [...buildings.values()].filter((b) => b.seat === u.seat && (b.kind === 'hq' || b.kind === 'depot') && b.built >= 1).sort((a, b) => dist(u.x, u.z, a.x, a.z) - dist(u.x, u.z, b.x, b.z))[0];
  if (o.phase === 'to') {
    o.slot ??= gatherSlot(u, o.node, node);
    const at = slotAt(node, o.slot);
    // (Someone or something in the way, and it's close enough: it works from where it stands.)
    if (dist(u.x, u.z, node.x, node.z) < 8) o.held = (o.held ?? 0) + dt;
    if (step(u, at.x, at.z, dt, 0.5) || (o.held ?? 0) > 3) {
      o.phase = 'work';
      o.held = 0;
    }
  } else if (o.phase === 'work') {
    u.yaw = Math.atan2(node.x - u.x, node.z - u.z);
    const take = Math.min(GATHER_RATE * (slots[u.seat]!.doctrine === 'industrial' ? 1.15 : 1) * (has(u.seat, 'logistics') ? 1.3 : 1) * dt, node.amount, CARRY - u.carry);
    u.carry += take;
    u.busy = time;
    u.carryRes = node.kind;
    node.amount -= take;
    if (node.amount <= 0) {
      nodeProps.get(node.id)?.remove();
      gridDirty = true;
    }
    if (u.carry >= CARRY - 0.001) {
      o.phase = 'back';
      o.slot = undefined;
    }
    dirty = true;
  } else if (post) {
    const r = BUILDINGS[post.kind].radius + 1.4;
    if (dist(u.x, u.z, post.x, post.z) <= r) {
      const s = slots[u.seat]!;
      if (u.carryRes === 'steel') {
        s.steel += u.carry;
        s.stats.steel += u.carry;
      } else {
        s.oil += u.carry;
        s.stats.oil += u.carry;
      }
      u.carry = 0;
      u.carryRes = null;
      o.phase = 'to';
      dirty = true;
    } else step(u, post.x, post.z, dt, r - 0.4);
  } else u.order = { t: 'idle' };
  void game;
}

/** An attack on a target (a unit or a building): damage, a shot to see, and what the kill does. */
function fire(game: GameContext, u: Unit, tgt: { id: number; building: boolean }): void {
  if (u.cool > 0) return;
  if (time < peaceUntil && u.seat !== NEUTRAL && (tgt.building || units.get(tgt.id)?.seat !== NEUTRAL)) {
    u.order = { t: 'idle' };
    return;
  }
  const def = UNITS[u.kind];
  u.cool = 1 / fireRate(u);
  const t = targetOf(tgt);
  if (!t) return;
  u.yaw = Math.atan2(t.x - u.x, t.z - u.z);
  const blast = def.splash ?? (u.kind === 'tank' ? 3 : 0);
  const hu = heightAt(u.x, u.z);
  const ht = t.air ? 0 : heightAt(t.x, t.z);
  // A howitzer's shell is a while in the air, and lands where the target was when it fired.
  if (u.kind === 'artillery') {
    const at = { x: t.x, z: t.z };
    const flight = Math.max(0.8, dist(u.x, u.z, at.x, at.z) / 26);
    const power = def.damage * (has(u.seat, 'ordnance') ? 1.2 : 1) * (1 + rankOf(u.xp) * VET.damage);
    const seat = u.seat;
    shots.push({ x: round1(u.x), y: lift(u.kind) + hu + 2.6, z: round1(u.z), tx: round1(at.x), ty: FLOOR + ht, tz: round1(at.z), big: true, k: UNIT_ORDER.indexOf(u.kind), arc: Math.round(flight * 10) / 10 });
    later.push({ t: time + flight, run: () => shellLands(game, seat, u, 'artillery', at.x, at.z, blast, power) });
    return;
  }
  shots.push({ x: round1(u.x), y: lift(u.kind) + hu + (u.kind === 'tank' ? 2.6 : u.lake >= 0 ? 2.4 : 2), z: round1(u.z), tx: round1(t.x), ty: (t.air ? lift('heli') : FLOOR + ht) + 1.5, tz: round1(t.z), big: blast > 0, k: UNIT_ORDER.indexOf(u.kind) });
  // Buildings shrug off bullets a little, and are softer to shells; the armored doctrine and ordnance hit harder.
  const dmg =
    def.damage *
    (VERSUS[u.kind]?.[tgt.building ? 'building' : ARMOR[units.get(tgt.id)?.kind ?? 'rifle']] ?? 1) *
    (u.kind === 'tank' && slots[u.seat]!.doctrine === 'armored' ? 1.1 : 1) *
    (has(u.seat, 'ordnance') ? 1.2 : 1) *
    (1 + rankOf(u.xp) * VET.damage) *
    // (Shooting up a hill: the ones on top are harder to hit.)
    (ht > hu ? 1 - HIGH.cover : 1);
  const v = tgt.building ? undefined : units.get(tgt.id);
  // (A ground vehicle caught from behind, where its armour's thin.)
  const rear = !!v && ARMOR[v.kind] === 'vehicle' && !UNITS[v.kind].air && !UNITS[v.kind].naval && fromBehind(v.yaw, v.x, v.z, u.x, u.z);
  if (tgt.building) damageBuilding(game, tgt.id, dmg, u.seat);
  else damageUnit(game, tgt.id, dmg * (rear ? FLANK : 1), u.seat, u);
  if (blast) {
    booms.push(round1(t.x), round1(t.z), 1);
    // The shell blasts the units round it.
    for (const v of [...units.values()]) if (v.id !== tgt.id && !v.inside && !UNITS[v.kind].air && teamOf(v.seat) !== teamOf(u.seat) && dist(v.x, v.z, t.x, t.z) < blast) damageUnit(game, v.id, dmg * 0.4, u.seat, u);
  }
}

/** A shell or a grenade landing: everything of the others' near it is hurt, the most in the middle. */
function shellLands(game: GameContext, seat: number, src: Unit | undefined, kind: UnitKind | 'mine', x: number, z: number, radius: number, damage: number): void {
  booms.push(round1(x), round1(z), 1);
  const versus: Partial<Record<'infantry' | 'vehicle' | 'air' | 'building', number>> = kind === 'mine' ? { vehicle: 1.5, infantry: 0.9, building: 0 } : (VERSUS[kind] ?? {});
  const team = teamOf(seat);
  for (const v of [...units.values()]) {
    if (teamOf(v.seat) === team || v.inside || UNITS[v.kind].air) continue;
    const d = dist(v.x, v.z, x, z);
    if (d < radius) damageUnit(game, v.id, damage * (versus[ARMOR[v.kind]] ?? 1) * (1 - (0.6 * d) / radius), seat, src && units.has(src.id) ? src : undefined);
  }
  if (versus.building !== 0) for (const b of [...buildings.values()]) if (teamOf(b.seat) !== team && dist(b.x, b.z, x, z) < BUILDINGS[b.kind].radius + radius) damageBuilding(game, b.id, damage * (versus.building ?? 1), seat);
}

/** A unit's special ability, now. */
function cast(game: GameContext, u: Unit, a: Ability, x: number, z: number): void {
  // (A mine it can't pay for isn't laid, and doesn't start the recharge.)
  if (u.kind === 'engineer' && slots[u.seat]!.steel < (a.cost ?? 0)) return;
  u.abilityAt = time + a.cooldown;
  const spot = { x: round1(u.x), z: round1(u.z) };
  if (u.kind === 'engineer') {
    const sl = slots[u.seat]!;
    sl.steel -= a.cost ?? 0;
    const own = mines.filter((m) => m.seat === u.seat);
    if (own.length >= MINE.most) mines.splice(mines.indexOf(own[0]), 1);
    mines.push({ seat: u.seat, team: teamOf(u.seat), x: round1(x), z: round1(z) });
  } else if (u.kind === 'tank') u.smokeUntil = time + a.seconds;
  else if (u.kind === 'aa') u.flakUntil = time + a.seconds;
  else if (u.kind === 'at') u.braceUntil = time + a.seconds;
  else if (u.kind === 'scout') flares.push({ team: teamOf(u.seat), x, z, r: a.radius, until: time + a.seconds });
  else {
    // Grenades, shells and rockets: each lobbed from here and landing a moment later, spread over the spot.
    u.yaw = Math.atan2(x - u.x, z - u.z);
    const k = UNIT_ORDER.indexOf(u.kind);
    const power = a.damage * (has(u.seat, 'ordnance') ? 1.2 : 1) * (1 + rankOf(u.xp) * VET.damage);
    const seat = u.seat;
    for (let i = 0; i < a.shells; i++) {
      const sx = x + (a.spread ? (Math.random() - 0.5) * a.spread * 2 : 0);
      const sz = z + (a.spread ? (Math.random() - 0.5) * a.spread * 2 : 0);
      const d = dist(u.x, u.z, sx, sz);
      const air = UNITS[u.kind].air ? 5 : 0;
      const launch = i * (u.kind === 'artillery' ? 0.55 : 0.14);
      const flight = u.kind === 'heli' ? 0.45 : u.kind === 'rifle' ? 1.1 : Math.max(0.9, d / 26);
      const from = { x: round1(u.x), z: round1(u.z) };
      later.push({
        t: time + launch,
        run: () => shots.push({ x: from.x, y: FLOOR + heightAt(from.x, from.z) + air + 2.2, z: from.z, tx: round1(sx), ty: FLOOR + heightAt(sx, sz), tz: round1(sz), big: u.kind !== 'rifle', k, arc: flight }),
      });
      later.push({ t: time + launch + flight, run: () => shellLands(game, seat, u, u.kind, sx, sz, a.radius, power) });
    }
  }
  game.clients.send('all', 'abfx', { kind: u.kind, x: spot.x, z: spot.z, tx: round1(x), tz: round1(z), seconds: a.seconds });
  dirty = true;
}

/** Use a kind's ability: the ready ones of those given, the nearest first and as many as go at a time. */
function useAbility(game: GameContext, slot: Slot, list: Unit[], kind: UnitKind, x: number, z: number, queue: boolean): boolean {
  const a = ABILITIES[kind];
  if (!a) return false;
  if (time < peaceUntil && a.damage > 0) {
    slot.player?.hud.toast('No attacks until the peace is over');
    return false;
  }
  if (a.aimed && (!Number.isFinite(x) || !Number.isFinite(z))) return false;
  if (kind === 'engineer' && (inLake(x, z, 1) || inMesa(x, z, 1) || slot.steel < (a.cost ?? 0))) return false;
  const px = Math.max(-HALF, Math.min(HALF, x));
  const pz = Math.max(-HALF, Math.min(HALF, z));
  const ready = list.filter((u) => u.kind === kind && u.abilityAt <= time && !u.inside);
  if (a.aimed) ready.sort((p, q) => dist(p.x, p.z, px, pz) - dist(q.x, q.z, px, pz));
  const go = ready.slice(0, a.perClick);
  for (const u of go) {
    if (a.aimed) give(u, { t: 'cast', x: px, z: pz }, queue);
    else cast(game, u, a, 0, 0);
  }
  return go.length > 0;
}

/** What's left of something the fighting destroyed: engineers can strip it for steel. */
function addSalvage(game: GameContext, x: number, z: number, amount: number, scrap: 'rubble' | 'henge', scale = 1): void {
  if (amount < 10 || inLake(x, z, 1) || Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) return;
  const live = nodes.filter((n) => n.salvage && n.amount > 0);
  if (live.length >= SALVAGE.most) {
    live[0].amount = 0;
    nodeProps.get(live[0].id)?.remove();
  }
  const id = nodes.length;
  nodes.push({ id, x: round1(x), z: round1(z), kind: 'steel', amount, scrap, salvage: true });
  const p = game.props.spawn(models.kinds[scrap][0], { position: { x, y: FLOOR + heightAt(x, z), z }, scale: SCALE[scrap] * scale });
  p.quaternion.setFromEuler(euler.set(0, hashYaw(id), 0));
  nodeProps.set(id, p);
  dirty = true;
}

/** An uplink finished: its clock starts, and everyone on the map is told (and sees it from now on). */
function uplinkUp(game: GameContext, b: Building): void {
  b.doneAt = time;
  const s = slots[b.seat]!;
  const m = Math.floor(UPLINK.hold / 60);
  game.hud.banner('Satellite Uplink', `${s.name} has finished an uplink. Destroy it within ${m} minutes, or their side wins`, { duration: 4 });
  game.hud.feed(`${s.name} has finished a Satellite Uplink`, { color: TEAM_COLORS[b.seat % TEAM_COLORS.length] });
  for (const o of slots) if (o?.player && o.team !== s.team) game.clients.send(o.player, 'alert', { x: round1(b.x), z: round1(b.z), what: 'An enemy uplink is online: destroy it!' });
}

/** Tell a human their things are under attack (at most every eight seconds), with where. */
const alertedAt = new Map<number, number>();
function alert(game: GameContext, seat: number, x: number, z: number, what: string): void {
  const p = slots[seat]?.player;
  if (!p || time - (alertedAt.get(seat) ?? -99) < 8) return;
  alertedAt.set(seat, time);
  game.clients.send(p, 'alert', { x: round1(x), z: round1(z), what });
}

function damageUnit(game: GameContext, id: number, amount: number, by: number, src?: Unit): void {
  const u = units.get(id);
  if (!u || u.inside) return;
  if (teamOf(by) !== teamOf(u.seat)) alert(game, u.seat, u.x, u.z, 'Your units are under attack!');
  u.hitAt = time;
  const dealt = Math.min(u.hp, amount * (has(u.seat, 'armor') ? 0.8 : 1) * (u.smokeUntil > time ? 0.5 : 1));
  u.hp -= dealt;
  // (Experience for landing hits, a little: the guns at the back and the rocket teams earn stars too.)
  if (u.hp > 0 && src && units.has(src.id) && teamOf(src.seat) !== teamOf(u.seat) && u.seat !== NEUTRAL) promote(src, (dealt / 75) * VET.hit);
  // A unit hit by something it can shoot at turns on it.
  if (u.hp > 0) {
    if (u.kind !== 'engineer' && u.stance === 0 && UNITS[u.kind].damage > 0 && (u.order.t === 'idle' || (u.order.t === 'move' && u.order.attack))) {
      const e = nearestEnemy(u.seat, u.x, u.z, 30, UNITS[u.kind].hits);
      if (e) u.order = { t: 'attack', id: e.id, building: e.building };
    }
    return;
  }
  units.delete(id);
  slots[u.seat]!.pop -= UNITS[u.kind].pop;
  slots[u.seat]!.stats.lost++;
  if (teamOf(by) !== teamOf(u.seat) && slots[by]) slots[by]!.stats.killed++;
  // Experience for the one that fired.
  if (src && units.has(src.id) && teamOf(src.seat) !== teamOf(u.seat)) promote(src, u.max / 75);
  // A transport that goes down takes its passengers with it.
  for (const v of cargo(u.id, true)) {
    units.delete(v.id);
    slots[v.seat]!.pop -= UNITS[v.kind].pop;
    slots[v.seat]!.stats.lost++;
  }
  // A wild unit's kill pays the one who took it, and clearing a camp pays more.
  if (u.seat === NEUTRAL && by !== NEUTRAL && slots[by]) {
    const k = slots[by]!;
    k.steel += u.kind === 'brute' ? 90 : 35;
    k.oil += u.kind === 'brute' ? 40 : 10;
    if (u.camp >= 0 && ![...units.values()].some((v) => v.camp === u.camp)) {
      k.steel += 200;
      k.oil += 120;
      k.player?.hud.pop('Camp cleared!', { sub: '+200 steel, +120 oil. Hold the relic for income.', color: '#ffd23a' });
    }
  }
  booms.push(round1(u.x), round1(u.z), UNITS[u.kind].size >= 2 ? 3 : 0);
  // A knocked-out vehicle stays where it stopped, for whoever gets engineers to it first.
  if (ARMOR[u.kind] === 'vehicle' && !UNITS[u.kind].naval && u.seat !== NEUTRAL) addSalvage(game, u.x, u.z, Math.round(UNITS[u.kind].cost.steel * SALVAGE.share), 'henge', 0.9);
  const killer = slots[by]?.player;
  if (killer && teamOf(by) !== teamOf(u.seat)) killer.achieve('first_blood');
  if (killer && [...units.values()].filter((v) => v.seat === by && v.kind === 'tank').length >= 5) killer.achieve('tank_column');
  dirty = true;
  void game;
}

function damageBuilding(game: GameContext, id: number, amount: number, by: number): void {
  const b = buildings.get(id);
  if (!b) return;
  if (teamOf(by) !== teamOf(b.seat)) alert(game, b.seat, b.x, b.z, `Your ${BUILDINGS[b.kind].name} is under attack!`);
  b.hp -= amount;
  if (b.hp > 0) return;
  // Those in a bunker that falls tumble out, hurt.
  const held = cargo(b.id, false);
  if (held.length) {
    unload(b.id, false);
    for (const v of held) v.hp = Math.max(1, v.hp - v.max * 0.3);
  }
  unprop(b);
  buildings.delete(id);
  gridDirty = true;
  if (b.kind === 'uplink' && b.doneAt !== undefined) {
    game.hud.banner('Uplink destroyed', `${slots[b.seat]!.name}’s Satellite Uplink is down`, { duration: 3 });
    game.hud.feed(`${slots[b.seat]!.name}’s uplink has been destroyed`, { color: TEAM_COLORS[b.seat % TEAM_COLORS.length] });
  }
  if (b.kind === 'hq') {
    game.hud.feed(`${slots[b.seat]!.name}’s headquarters has fallen`, { color: TEAM_COLORS[b.seat % TEAM_COLORS.length] });
    slots[b.seat]!.player?.hud.pop('Headquarters lost', { sub: `Your base falls in ${HQ_FALL} seconds`, color: '#f04438' });
  }
  const wall = !!BUILDINGS[b.kind].wall;
  if (!wall && teamOf(by) !== teamOf(b.seat) && slots[by]) slots[by]!.stats.razed++;
  for (const q of b.queue) slots[b.seat]!.pop -= UNITS[q.kind].pop;
  if (!wall) slots[b.seat]!.lost++;
  booms.push(round1(b.x), round1(b.z), 2);
  game.clients.send('all', 'fell', { kind: BUILDING_ORDER.indexOf(b.kind), seat: b.seat, x: round1(b.x), z: round1(b.z), built: b.built });
  // A building that was up leaves rubble worth stripping.
  if (b.built >= 1 && !wall) addSalvage(game, b.x, b.z, Math.round(Math.max(120, BUILDINGS[b.kind].cost.steel) * SALVAGE.share), 'rubble', BUILDINGS[b.kind].radius / 3.1);
  recap(b.seat);
  dirty = true;
  // (A commander with nothing left but walls is out.)
  if (![...buildings.values()].some((x) => x.seat === b.seat && !BUILDINGS[x.kind].wall)) eliminate(game, b.seat);
}

/** Experience for a kill: a star at each threshold, with more health (and a little healed). */
function promote(v: Unit, xp: number): void {
  const before = rankOf(v.xp);
  v.xp += xp;
  const after = rankOf(v.xp);
  if (after <= before) return;
  const k = (1 + after * VET.hp) / (1 + before * VET.hp);
  v.max *= k;
  v.hp = Math.min(v.max, v.hp * k + v.max * 0.15);
  if (after >= 3) slots[v.seat]?.player?.achieve('veteran');
  dirty = true;
}

/** Going to a bunker or a transport, and in when there: a transport is boarded from its lake's shore, when it's near. */
function enterTick(u: Unit, o: Extract<Order, { t: 'enter' }>, dt: number): void {
  if (o.boat) {
    const t = units.get(o.id);
    if (!t || t.seat !== u.seat || cargo(t.id, true).length >= (UNITS[t.kind].holds ?? 0)) {
      u.order = { t: 'idle' };
      return;
    }
    if (dist(u.x, u.z, t.x, t.z) < 8) return board(u, o);
    const p = shore(t.lake, t.x, t.z, 1.6);
    step(u, p.x, p.z, dt, 1);
    return;
  }
  const b = buildings.get(o.id);
  if (!b || b.seat !== u.seat || b.built < 1 || cargo(b.id, false).length >= (BUILDINGS[b.kind].holds ?? 0)) {
    u.order = { t: 'idle' };
    return;
  }
  const r = BUILDINGS[b.kind].radius + 1.6;
  if (dist(u.x, u.z, b.x, b.z) <= r) board(u, o);
  else step(u, b.x, b.z, dt, r - 0.4);
}

function board(u: Unit, o: { id: number; boat: boolean }): void {
  u.inside = { id: o.id, boat: o.boat };
  u.order = { t: 'idle' };
  u.path = null;
  dirty = true;
}

/** The alarm: a side's engineers near its HQ run into it, nearest first, as many as there's room for. How many went. */
function ringAlarm(seat: number): number {
  const b = [...buildings.values()].find((x) => x.seat === seat && x.kind === 'hq' && x.built >= 1);
  if (!b) return 0;
  const room = (BUILDINGS.hq.holds ?? 0) - cargo(b.id, false).length - [...units.values()].filter((u) => u.order.t === 'enter' && !u.order.boat && u.order.id === b.id).length;
  const go = [...units.values()].filter((u) => u.seat === seat && u.kind === 'engineer' && !u.inside && u.order.t !== 'enter' && dist(u.x, u.z, b.x, b.z) < ALARM.reach).sort((p, q) => dist(p.x, p.z, b.x, b.z) - dist(q.x, q.z, b.x, b.z)).slice(0, Math.max(0, room));
  for (const u of go) give(u, { t: 'enter', id: b.id, boat: false }, false);
  return go.length;
}

/** Everyone out of a bunker (round it) or a transport (onto the shore nearest it, which it must be near). */
function unload(id: number, boat: boolean): boolean {
  const held = cargo(id, boat);
  if (!held.length) return false;
  let spots: { x: number; z: number }[];
  if (boat) {
    const t = units.get(id);
    if (!t) return false;
    const l = LAKES[t.lake];
    if (l.r - dist(t.x, t.z, l.x, l.z) > 7) return false;
    const p = shore(t.lake, t.x, t.z, 3);
    const d = dist(p.x, p.z, l.x, l.z) || 1;
    // Along the shore, and further up it where that's blocked.
    const tx = -(p.z - l.z) / d;
    const tz = (p.x - l.x) / d;
    spots = held.map((_, i) => {
      const along = (i - (held.length - 1) / 2) * 2.2;
      for (let out = 0; out < 8; out += 1.5) {
        const x = p.x + tx * along + ((p.x - l.x) / d) * out;
        const z = p.z + tz * along + ((p.z - l.z) / d) * out;
        if (!isBlocked(x, z)) return { x, z };
      }
      return p;
    });
  } else {
    const b = buildings.get(id);
    if (!b) return false;
    const r = BUILDINGS[b.kind].radius + 1.8;
    spots = held.map((_, i) => ({ x: b.x + Math.cos((i / held.length) * Math.PI * 2) * r, z: b.z + Math.sin((i / held.length) * Math.PI * 2) * r }));
  }
  held.forEach((u, i) => {
    u.inside = null;
    u.x = u.px = Math.max(-HALF, Math.min(HALF, spots[i].x));
    u.z = u.pz = Math.max(-HALF, Math.min(HALF, spots[i].z));
    // (Engineers let out go back to work.)
    u.order = (!boat && u.kind === 'engineer' && gatherOrder(u)) || { t: 'idle' };
  });
  dirty = true;
  return true;
}

/** Whether a dock may stand here: on dry land at a lake's edge. */
function canDock(x: number, z: number): boolean {
  const l = LAKES[lakeOf(x, z)];
  const d = dist(x, z, l.x, l.z);
  return d >= l.r + 0.5 && d <= l.r + BUILDINGS.dock.radius + 2.5;
}

function eliminate(game: GameContext, seat: number): void {
  const s = slots[seat];
  if (!s) return;
  s.alive = false;
  for (const u of [...units.values()]) if (u.seat === seat) {
    units.delete(u.id);
  }
  game.hud.feed(`${s.name} has been defeated`, { color: TEAM_COLORS[seat % TEAM_COLORS.length] });
  dirty = true;
}

/** Units and buildings push each other apart, so a crowd spreads out and nothing stands in a wall. */
/**
 * Send a group to a spot in formation, not all to the one point (where they'd pile up): ranks across
 * the way they're marching, wider than deep, spaced by the biggest among them; the nearest to the
 * spot take the front rank. One unit goes to the spot itself.
 */
/** An order for a unit: now, or (Shift held, and it's busy) when it's done what it's at. */
function give(u: Unit, o: Order, queue: boolean): void {
  if (queue && (u.order.t !== 'idle' || u.next.length)) {
    if (u.next.length < 12) u.next.push(o);
    return;
  }
  u.next = [];
  u.order = o;
}

function formation(list: Unit[], x: number, z: number, attack: boolean, queue = false, face?: number, flee?: boolean): void {
  const n = list.length;
  if (!n) return;
  if (n === 1) {
    give(list[0], { t: 'move', x, z, attack, face, flee }, queue);
    return;
  }
  const cols = Math.ceil(Math.sqrt(n * 1.8));
  const cx = list.reduce((a, u) => a + u.x, 0) / n;
  const cz = list.reduce((a, u) => a + u.z, 0) / n;
  const len = Math.hypot(x - cx, z - cz) || 1;
  // (Facing the way it was dragged, if it was; else the way it's marching.)
  const fx = face === undefined ? (x - cx) / len : Math.sin(face);
  const fz = face === undefined ? (z - cz) / len : Math.cos(face);
  const ground = list.filter((u) => !UNITS[u.kind].air);
  const kinds = new Set(ground.map((u) => u.kind));
  const spots: { u: Unit; x: number; z: number }[] = [];
  // Helicopters keep their own ranks over the ground troops' (they don't bump into them).
  for (const group of [ground, list.filter((u) => UNITS[u.kind].air)]) {
    // Armour in front, then the infantry, then those who keep behind the line: medics, flak, and the guns at the back.
    const sorted = [...group].sort((a, b) => RANK[a.kind] - RANK[b.kind] || dist(a.x, a.z, x, z) - dist(b.x, b.z, x, z));
    const c = Math.min(cols, sorted.length);
    let back = 0;
    let lastHalf = 0;
    for (let r = 0; r * c < sorted.length; r++) {
      const row = sorted.slice(r * c, r * c + c);
      const gap = Math.max(...row.map((u) => SPACE[u.kind])) + 0.9;
      if (r) back += lastHalf + gap / 2;
      lastHalf = gap / 2;
      // Each takes the place across the line nearest the side it's on, so the ranks don't cross each other getting there.
      row.sort((p, q) => (fz * p.x - fx * p.z) - (fz * q.x - fx * q.z));
      row.forEach((u, i) => {
        const across = (i - (row.length - 1) / 2) * gap;
        const gx = x - fz * across - fx * back;
        const gz = z + fx * across - fz * back;
        spots.push({ u, x: Math.max(-HALF + 2, Math.min(HALF - 2, gx)), z: Math.max(-HALF + 2, Math.min(HALF - 2, gz)) });
      });
    }
  }
  // A long march keeps a mixed column together: each on the ground goes at the pace that brings it in when the
  // slowest to get there does (and closes up at its own speed for the last stretch).
  const march = kinds.size > 1 && len > 20 && !queue;
  const takes = march ? Math.max(...spots.filter((p) => !UNITS[p.u.kind].air).map((p) => dist(p.u.x, p.u.z, p.x, p.z) / UNITS[p.u.kind].speed)) : 0;
  for (const p of spots) give(p.u, { t: 'move', x: p.x, z: p.z, attack, face, flee, pace: march && !UNITS[p.u.kind].air ? Math.max(1, dist(p.u.x, p.u.z, p.x, p.z) / takes) : undefined }, queue);
}

/** Where each kind takes its place in a formation: low numbers at the front. */
const RANK: Record<UnitKind, number> = { brute: 0, tank: 0, hero: 1, guard: 2, rifle: 2, at: 2, scout: 2, engineer: 3, medic: 4, aa: 4, artillery: 5, heli: 0, gunboat: 0, transport: 1 };

/** Where the next unit out of a building takes its place at the rally point: round it in a spiral, not on top of the last. */
function rallySpot(seat: number, x: number, z: number, room = 3.4): { x: number; z: number } {
  const k = [...units.values()].filter((u) => u.seat === seat && u.order.t === 'idle' && dist(u.x, u.z, x, z) < 14 + room).length;
  if (!k) return { x, z };
  const a = k * 2.4;
  const r = Math.max(3.4, room) * Math.sqrt(k);
  return { x: Math.max(-HALF + 2, Math.min(HALF - 2, x + Math.cos(a) * r)), z: Math.max(-HALF + 2, Math.min(HALF - 2, z + Math.sin(a) * r)) };
}

function crowd(): void {
  const list = [...units.values()].filter((u) => !u.inside);
  const layer = (u: Unit) => (UNITS[u.kind].air ? 2 : u.lake >= 0 ? 1 : 0);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const ra = UNITS[a.kind].size * 0.5;
    const sa = BODY[a.kind] * 0.5;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (layer(a) !== layer(b)) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const min = sa + BODY[b.kind] * 0.5;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz) || 0.001;
      if (d >= min) continue;
      // (Eased over a few moments: a crowd opens out rather than jittering.)
      const push = ((min - d) / 2) * 0.35;
      a.x -= (dx / d) * push;
      a.z -= (dz / d) * push;
      b.x += (dx / d) * push;
      b.z += (dz / d) * push;
    }
    if (a.lake >= 0) {
      ({ x: a.x, z: a.z } = inside(a.lake, a.x, a.z, 1.5));
      continue;
    }
    for (const bl of UNITS[a.kind].air ? [] : buildings.values()) {
      if (bl.gate) {
        // A gate: its own side goes through (unless it's locked); to anyone else it's a slab three lengths long.
        if (!bl.gate.locked && teamOf(bl.seat) === teamOf(a.seat)) continue;
        const along = bl.gate.axis ? a.z - bl.z : a.x - bl.x;
        const across = bl.gate.axis ? a.x - bl.x : a.z - bl.z;
        const hx = 4.5 + ra * 0.6;
        const hz = 1.5 + ra * 0.6;
        if (Math.abs(along) < hx && Math.abs(across) < hz) {
          // (Out by the nearer side.)
          if (hx - Math.abs(along) < hz - Math.abs(across)) {
            const v = Math.sign(along || 1) * hx;
            if (bl.gate.axis) a.z = bl.z + v;
            else a.x = bl.x + v;
          } else {
            const v = Math.sign(across || 1) * hz;
            if (bl.gate.axis) a.x = bl.x + v;
            else a.z = bl.z + v;
          }
        }
        continue;
      }
      if (BUILDINGS[bl.kind].wall) {
        // A length of wall is a square block of its cell: out by the nearer side, so whatever's pressed
        // against a wall slides along it (round, it'd catch every unit at the joins between lengths).
        const dx = a.x - bl.x;
        const dz = a.z - bl.z;
        const h = 1.5 + ra * 0.8;
        if (Math.abs(dx) < h && Math.abs(dz) < h) {
          // (Never out through a side joined to the next length of the line: that's only into it.)
          if (gridDirty) rebuildGrid();
          const sx = Math.sign(dx || 1);
          const sz = Math.sign(dz || 1);
          const joinX = grid[gcell(bl.z) * GN + gcell(bl.x + sx * CELL)] >= WALL;
          const joinZ = grid[gcell(bl.z + sz * CELL) * GN + gcell(bl.x)] >= WALL;
          const byX = joinZ && !joinX ? true : joinX && !joinZ ? false : h - Math.abs(dx) < h - Math.abs(dz);
          if (byX) a.x = bl.x + sx * h;
          else a.z = bl.z + sz * h;
        }
        continue;
      }
      const r = BUILDINGS[bl.kind].radius + ra;
      const d = dist(a.x, a.z, bl.x, bl.z);
      if (d < r && d > 0.001) {
        a.x = bl.x + ((a.x - bl.x) / d) * r;
        a.z = bl.z + ((a.z - bl.z) / d) * r;
      }
    }
    a.x = Math.max(-HALF, Math.min(HALF, a.x));
    a.z = Math.max(-HALF, Math.min(HALF, a.z));
  }
}

function checkEnd(game: GameContext, force = false, team?: number): void {
  const alive = slots.filter((s): s is Slot => !!s && s.alive && s.seat !== NEUTRAL && (team === undefined || s.team === team));
  const teams = new Set(alive.map((s) => s.team));
  if (teams.size > 1 && !force) return;
  phase = 'over';
  winners = alive.map((s) => s.seat);
  const mineWon = (p: Player) => alive.some((s) => s.player === p);
  for (const p of game.players) {
    if (!mineWon(p)) continue;
    p.achieve('victory');
    const s = slotOf(p);
    if (s && s.lost === 0) p.achieve('flawless');
  }
  game.audio.play('victory');
  // One last sample, so the chart runs to the end.
  for (const sl of slots) if (sl && sl.seat !== NEUTRAL) sl.army.push([...units.values()].filter((u) => u.seat === sl.seat && u.kind !== 'engineer').reduce((a, u) => a + UNITS[u.kind].cost.steel + UNITS[u.kind].cost.oil, 0));
  summary = {
    every: SAMPLE,
    seats: slots.filter((x): x is Slot => !!x && x.seat !== NEUTRAL).map((x) => ({ seat: x.seat, name: x.name, ...x.stats, steel: Math.round(x.stats.steel), oil: Math.round(x.stats.oil), army: x.army })),
  };
  dirty = true;
}

// ---------------------------------------------------------------------------------------------
// Orders: from a player's screen (checked, as anyone can send anything) and from the bots

function owned(slot: Slot, ids: unknown): Unit[] {
  if (!Array.isArray(ids)) return [];
  return ids
    .slice(0, 200)
    .map((id) => units.get(Number(id)))
    .filter((u): u is Unit => !!u && u.seat === slot.seat);
}

function canAfford(s: Slot, c: { steel: number; oil: number }): boolean {
  return s.steel >= c.steel && s.oil >= c.oil;
}

/** What a unit costs this seat: the intelligence doctrine's infantry are a quarter cheaper. */
export function costFor(doctrine: DoctrineId, kind: UnitKind): { steel: number; oil: number } {
  const c = UNITS[kind].cost;
  const k = doctrine === 'intel' && kind === 'rifle' ? 0.75 : 1;
  return { steel: Math.round(c.steel * k), oil: Math.round(c.oil * k) };
}

function train(b: Building, kind: UnitKind): boolean {
  const s = slots[b.seat]!;
  const def = UNITS[kind];
  const cost = costFor(s.doctrine, kind);
  if (b.built < 1 || !BUILDINGS[b.kind].trains.includes(kind) || ageOf(s.techs) < (AGE_NEEDS[kind] ?? 1) || b.queue.length >= 5 || (def.limit !== undefined && countOf(b.seat, kind) >= def.limit) || !canAfford(s, cost) || s.pop + def.pop > s.cap) return false;
  s.steel -= cost.steel;
  s.oil -= cost.oil;
  s.pop += def.pop;
  b.queue.push({ kind, t: 0 });
  b.lastKind = kind;
  dirty = true;
  return true;
}

function place(game: GameContext, seat: number, kind: BuildingKind, x: number, z: number, builders: number[], queue = false, axisIn?: number): boolean {
  const s = slots[seat];
  const def = BUILDINGS[kind];
  if (!s || !BUILDABLE.includes(kind) || ageOf(s.techs) < (AGE_NEEDS[kind] ?? 1) || !canAfford(s, def.cost) || Math.abs(x) > HALF - (def.wall ? 1 : 6) || Math.abs(z) > HALF - (def.wall ? 1 : 6)) return false;
  const needs = NEEDS[kind];
  if (needs && ![...buildings.values()].some((b) => b.seat === seat && b.kind === needs && b.built >= 1)) return false;
  // (One uplink each, and none in Last Stand: there's no one to win against there.)
  if (kind === 'uplink' && (!uplinkOn || [...buildings.values()].some((b) => b.seat === seat && b.kind === 'uplink'))) return false;
  // A length of wall or a gate: on its cell of the grid, hard up against whatever's beside it, and over
  // hills. Not on a cell that's shut already (a tree, a rock, a building, the water): that's wall enough.
  const wall = !!def.wall;
  // (A gate: three cells along the wall it's set in.)
  const ownWall = (cx: number, cz: number) => [...buildings.values()].some((b) => b.seat === seat && BUILDINGS[b.kind].wall && dist(b.x, b.z, cx, cz) < 1);
  const axis = kind === 'gate' ? (axisIn === 0 || axisIn === 1 ? axisIn : gateAxis(x, z, ownWall)) : 0;
  const cells = kind === 'gate' ? gateCells(x, z, axis) : [{ x, z }];
  if (wall) {
    x = wallSnap(x);
    z = wallSnap(z);
    let n = 0;
    for (const b of buildings.values()) if (b.seat === seat && BUILDINGS[b.kind].wall) n++;
    if (n >= MAX_WALLS) return false;
    if (gridDirty) rebuildGrid();
    for (const c of cells) if (Math.abs(c.x) > HALF - 1 || Math.abs(c.z) > HALF - 1 || grid[gcell(c.z) * GN + gcell(c.x)] === 1) return false;
  }
  const over: Building[] = [];
  for (const b of buildings.values()) {
    const other = !!BUILDINGS[b.kind].wall;
    for (const c of cells) {
      const d = dist(c.x, c.z, b.x, b.z);
      if (wall && other) {
        // (Another gate's cells are its own.)
        const hit = b.gate ? gateCells(b.x, b.z, b.gate.axis).some((q) => dist(q.x, q.z, c.x, c.z) < 2.9) : d < 2.9;
        if (!hit) continue;
        // (A gate goes onto lengths of one's own wall, in their place.)
        if (kind === 'gate' && b.kind === 'rampart' && b.seat === seat) {
          if (!over.includes(b)) over.push(b);
        } else return false;
      } else if (b.gate && !wall ? gateCells(b.x, b.z, b.gate.axis).some((q) => dist(q.x, q.z, x, z) < def.radius + 1.5) : d < def.radius + BUILDINGS[b.kind].radius + (wall || other ? 0 : 1)) return false;
    }
  }
  for (const n of nodes) if (n.amount > 0 && cells.some((c) => dist(c.x, c.z, n.x, n.z) < (wall ? 1.5 : def.radius + 3))) return false;
  if (!wall) {
    if (kind === 'dock' ? !canDock(x, z) : inLake(x, z, def.radius + 1)) return false;
    if (inMesa(x, z, def.radius + 1) || inHill(x, z, def.radius)) return false;
    if (DRESSING.some((d) => d.block && dist(x, z, d.x, d.z) < def.radius + d.block + 0.5)) return false;
  }
  s.steel -= def.cost.steel;
  s.oil -= def.cost.oil;
  for (const o of over) {
    unprop(o);
    buildings.delete(o.id);
  }
  const b = addBuilding(game, seat, kind, x, z, false, axis);
  for (const id of builders) {
    const u = units.get(id);
    if (u && u.seat === seat && u.kind === 'engineer') give(u, { t: 'build', id: b.id }, queue);
  }
  dirty = true;
  return true;
}

/** A special power: an airstrike on a spot, tanks at the HQ, or the whole map for a while. False if it isn't ready. */
function usePower(game: GameContext, seat: number, x: number, z: number): boolean {
  const s = slots[seat];
  if (!s || !s.alive || s.powerAt > time) return false;
  const p = DOCTRINES[s.doctrine].power;
  if (p.kind === 'airstrike') {
    if (time < peaceUntil) {
      s.player?.hud.toast('No attacks until the peace is over');
      return false;
    }
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    x = Math.max(-HALF, Math.min(HALF, x));
    z = Math.max(-HALF, Math.min(HALF, z));
    // The jets are on their way: each screen sees them come in, over the spot as the first bomb goes.
    game.clients.send('all', 'jets', { x: round1(x), z: round1(z) });
    // Bombs, a moment after the call: each run of the bombers falls on a spread of the target.
    for (let k = 0; k < 7; k++) {
      const bx = x + (Math.random() - 0.5) * 14;
      const bz = z + (Math.random() - 0.5) * 14;
      later.push({
        t: time + 1.4 + k * 0.22,
        run: () => {
          shots.push({ x: round1(bx), y: FLOOR + 70, z: round1(bz), tx: round1(bx), ty: FLOOR + heightAt(bx, bz), tz: round1(bz), big: true, k: -2 });
          booms.push(round1(bx), round1(bz), 1);
          for (const u of [...units.values()]) if (teamOf(u.seat) !== s.team && !u.inside && dist(u.x, u.z, bx, bz) < 6) damageUnit(game, u.id, 110, seat);
          for (const b of [...buildings.values()]) if (teamOf(b.seat) !== s.team && dist(b.x, b.z, bx, bz) < 6 + BUILDINGS[b.kind].radius) damageBuilding(game, b.id, 160, seat);
        },
      });
    }
    game.hud.feed(s.name + ' called an airstrike', { color: TEAM_COLORS[seat % TEAM_COLORS.length] });
  } else if (p.kind === 'reinforce') {
    const hq = [...buildings.values()].find((b) => b.seat === seat && b.kind === 'hq');
    if (!hq) return false;
    for (let k = 0; k < 3; k++) {
      s.pop += UNITS.tank.pop;
      const u = addUnit(game, seat, 'tank', hq.x + (k - 1) * 4, hq.z + BUILDINGS.hq.radius + 5);
      s.pop -= UNITS.tank.pop;
      s.stats.trained++;
      void u;
    }
    game.hud.feed(s.name + ' called reinforcements', { color: TEAM_COLORS[seat % TEAM_COLORS.length] });
  } else {
    s.revealUntil = time + 15;
    s.player?.hud.toast('Satellite scan: the whole map is visible');
  }
  s.powerAt = time + p.cooldown;
  dirty = true;
  return true;
}

function world(game: GameContext): World {
  return {
    slots,
    units,
    buildings,
    deposits: nodes,
    time,
    enemies: (seat) => slots.filter((s): s is Slot => !!s && s.alive && s.team !== teamOf(seat)),
    trainable: (b, kind) => b.built >= 1 && BUILDINGS[b.kind].trains.includes(kind),
    research: (b, tech) => research(b, tech),
    relics,
    peaceUntil,
    rally: (seat) => useRally(game, seat),
    alarm: (seat) => ringAlarm(seat),
    unload,
    canDock,
    train,
    stand: mode === 'stand',
    uplinkOn,
    drops,
    minesOf: (seat) => mines.filter((m) => m.seat === seat).length,
    ability: (seat, ids, kind, x, z) => {
      const sl = slots[seat];
      return !!sl && useAbility(game, sl, ids.map((id) => units.get(id)).filter((u): u is Unit => !!u && u.seat === seat), kind, x, z, false);
    },
    place: (seat, kind, x, z, builders, axis) => place(game, seat, kind, x, z, builders, false, axis),
    say: (seat, text) => {
      const sl = slots[seat];
      if (sl && mode !== 'stand') game.hud.feed(`${sl.name}: “${text}”`, { color: TEAM_COLORS[seat % TEAM_COLORS.length] });
    },
    power: (seat, x, z) => usePower(game, seat, x, z),
    command: (ids, seat, o) => {
      if (o.t === 'move' && ids.length > 1) {
        formation(ids.map((id) => units.get(id)).filter((u): u is Unit => !!u && u.seat === seat), o.x, o.z, o.attack, false, undefined, o.flee);
        return;
      }
      for (const id of ids) {
        const u = units.get(id);
        if (u && u.seat === seat) u.order = o;
      }
    },
  };
}

function order(game: GameContext, player: Player, name: string, data: unknown): void {
  const d = (data ?? {}) as Record<string, unknown>;
  // Talking and pointing, at any time.
  if (name === 'chat') {
    const text = String(d.text ?? '').trim().slice(0, 160);
    const now = performance.now();
    if (!text || now - (spokeAt.get(player.id) ?? -1e9) < 400) return;
    spokeAt.set(player.id, now);
    const from = slotOf(player);
    const toTeam = d.team === true && !!from && phase !== 'lobby';
    for (const p of game.players) if (!toTeam || slotOf(p)?.team === from!.team) game.clients.send(p, 'chat', { name: player.name, seat: from?.seat ?? -1, team: toTeam, text });
    return;
  }
  if (name === 'ping') {
    const from = slotOf(player);
    const now = performance.now();
    if (!from || phase !== 'play' || !Number.isFinite(Number(d.x)) || !Number.isFinite(Number(d.z)) || now - (pingedAt.get(player.id) ?? -1e9) < 700) return;
    pingedAt.set(player.id, now);
    for (const p of game.players) if (slotOf(p)?.team === from.team) game.clients.send(p, 'ping', { x: Number(d.x), z: Number(d.z), seat: from.seat, name: player.name });
    return;
  }
  if (phase === 'lobby') {
    if (name === 'lobby') return lobbyOrder(game, player, d);
    if (name === 'doctrine' && DOCTRINE_IDS.includes(d.doctrine as DoctrineId)) {
      picked.set(player.id, d.doctrine as DoctrineId);
      dirty = true;
    }
    if (name === 'mode' && DOCTRINE_IDS.includes(d.doctrine as DoctrineId)) picked.set(player.id, d.doctrine as DoctrineId);
    if (name === 'mode' && (d.mode === 'ffa' || d.mode === 'teams' || d.mode === 'coop' || d.mode === 'stand')) startMatch(game, d.mode, DIFFICULTIES.find((x) => x.id === d.difficulty)?.skill ?? 0.65);
    return;
  }
  if (phase === 'over' && name === 'again') return void game.restart();
  if (phase === 'over' && name === 'rematch') {
    if (player.id === lobby.host || !game.players.some((p) => p.id === lobby.host)) {
      rematchIn = 0.3;
      game.restart();
    }
    return;
  }
  if (phase !== 'play') return;
  const slot = slotOf(player);
  if (!slot) return;
  const us = owned(slot, d.ids);
  const x = Number(d.x);
  const z = Number(d.z);
  const at = Number.isFinite(x) && Number.isFinite(z);
  const queue = d.queue === true;
  if (name === 'move' && at) {
    const face = Number(d.face);
    formation(us, Math.max(-HALF, Math.min(HALF, x)), Math.max(-HALF, Math.min(HALF, z)), d.attack === true, queue, d.face !== undefined && Number.isFinite(face) ? face : undefined);
  } else if (name === 'patrol' && at) {
    const tx = Math.max(-HALF, Math.min(HALF, x));
    const tz = Math.max(-HALF, Math.min(HALF, z));
    for (const u of us) if (u.kind !== 'engineer' && u.lake < 0) give(u, { t: 'patrol', ax: u.x, az: u.z, bx: tx, bz: tz, to: 1 }, queue);
  }
  else if (name === 'attack') {
    const building = d.building === true;
    const t = targetOf({ id: Number(d.id), building });
    const team = building ? teamOf(buildings.get(Number(d.id))?.seat ?? -1) : teamOf(units.get(Number(d.id))?.seat ?? -1);
    // (The unarmed, a medic or a transport, go along to it instead.)
    if (t && team !== slot.team) for (const u of us) give(u, UNITS[u.kind].damage > 0 ? { t: 'attack', id: Number(d.id), building } : { t: 'move', x: t.x, z: t.z, attack: false }, queue);
  } else if (name === 'gather') {
    const n = nodes[Number(d.id)];
    if (n && n.amount > 0) for (const u of us) if (u.kind === 'engineer') give(u, { t: 'gather', node: n.id, phase: u.carry >= CARRY ? 'back' : 'to' }, queue);
  } else if (name === 'build' && at && BUILDABLE.includes(d.kind as BuildingKind)) place(game, slot.seat, d.kind as BuildingKind, x, z, us.map((u) => u.id), queue, d.axis === 0 || d.axis === 1 ? d.axis : undefined);
  else if (name === 'lock') {
    // A gate locked (shut to everyone, its own side too), or opened again.
    const b = buildings.get(Number(d.id));
    if (b?.gate && b.seat === slot.seat) {
      b.gate.locked = !b.gate.locked;
      gridDirty = true;
      dirty = true;
    }
  }
  else if (name === 'wall' && at) {
    // A line of wall, dragged: a length on each cell from one end to the other, as far as the steel goes; the engineers build them one after another.
    const x1 = Number(d.x1);
    const z1 = Number(d.z1);
    if (Number.isFinite(x1) && Number.isFinite(z1)) {
      const ids = us.map((u) => u.id);
      let q = queue;
      for (const c of wallLine(x, z, x1, z1)) {
        if (!canAfford(slot, BUILDINGS.rampart.cost)) break;
        if (place(game, slot.seat, 'rampart', c.x, c.z, ids, q)) q = true;
      }
    }
  }
  else if (name === 'train') {
    const b = buildings.get(Number(d.id));
    if (b && b.seat === slot.seat && UNIT_ORDER.includes(d.kind as UnitKind)) {
      if (!train(b, d.kind as UnitKind)) player.hud.toast('Can’t train that now');
    }
  } else if (name === 'rally' && at) {
    const b = buildings.get(Number(d.id));
    if (b && b.seat === slot.seat) b.rally = { x: Math.max(-HALF, Math.min(HALF, x)), z: Math.max(-HALF, Math.min(HALF, z)) };
  } else if (name === 'resign') {
    if (phase !== 'play' || !slot.alive) return;
    game.hud.feed(`${slot.name} has surrendered`, { color: TEAM_COLORS[slot.seat % TEAM_COLORS.length] });
    for (const b of [...buildings.values()]) if (b.seat === slot.seat) damageBuilding(game, b.id, 1e9, slot.seat);
    // (No one left to play it: the match is over, whoever's still standing.)
    if (phase === 'play' && !slots.some((x) => x && x.alive && x.player)) checkEnd(game, true);
  } else if (name === 'autoplay') {
    slot.bot = slot.bot ? null : new BotBrain(0.7, typeof d.style === 'string' && d.style in STYLES ? (d.style as Style) : undefined);
    player.hud.toast(slot.bot ? 'A bot is playing for you (press again to take over)' : 'You\u2019re in command');
  } else if (name === 'repair' && d.unit === true) {
    const v = units.get(Number(d.id));
    if (v && teamOf(v.seat) === slot.team && ARMOR[v.kind] === 'vehicle' && !UNITS[v.kind].naval) for (const u of us) if (u.kind === 'engineer') give(u, { t: 'repair', id: v.id, unit: true }, queue);
  } else if (name === 'repair') {
    const b = buildings.get(Number(d.id));
    if (b && teamOf(b.seat) === slot.team) for (const u of us) if (u.kind === 'engineer') give(u, { t: 'repair', id: b.id }, queue);
  } else if (name === 'trade') {
    const b = buildings.get(Number(d.id));
    const sell: ResKind = d.sell === 'oil' ? 'oil' : 'steel';
    if (!b || b.seat !== slot.seat || b.kind !== 'market' || b.built < 1) return;
    if (slot[sell] < TRADE.lot) return player.hud.toast(`Not enough ${sell}`);
    const price = priceNow(slot, sell);
    slot[sell] -= TRADE.lot;
    slot[sell === 'steel' ? 'oil' : 'steel'] += tradeGet(sell, price);
    slot.trade = { ...slot.trade, steel: priceNow(slot, 'steel'), oil: priceNow(slot, 'oil'), at: time };
    slot.trade[sell] = Math.max(TRADE.floor, price - TRADE.drop);
    dirty = true;
  } else if (name === 'research') {
    const b = buildings.get(Number(d.id));
    if (b && b.seat === slot.seat && TECH_IDS.includes(d.tech as TechId)) {
      if (!research(b, d.tech as TechId)) player.hud.toast('Can\u2019t research that now');
    }
  } else if (name === 'alarm') {
    // The alarm: the engineers near the HQ run into it, nearest first, as many as there's room for.
    if (!ringAlarm(slot.seat)) player.hud.toast('No engineers near enough (or no room)');
  } else if (name === 'enter') {
    const boat = d.boat === true;
    const id = Number(d.id);
    const c = boat ? units.get(id) : buildings.get(id);
    const room = c ? (boat ? UNITS[(c as Unit).kind].holds : BUILDINGS[(c as Building).kind].holds) ?? 0 : 0;
    if (!c || c.seat !== slot.seat || !room) return;
    const going = us.filter((u) => BOARDS.includes(u.kind)).slice(0, Math.max(0, room - cargo(id, boat).length));
    for (const u of going) give(u, { t: 'enter', id, boat }, queue);
    if (!going.length) player.hud.toast('No room (or nothing that can go in)');
    // An idle transport comes to the shore nearest them.
    const t = boat ? (c as Unit) : null;
    if (t && going.length && t.order.t === 'idle') {
      const p = shore(t.lake, going[0].x, going[0].z, 0);
      const q = inside(t.lake, p.x, p.z, 2);
      t.order = { t: 'move', x: q.x, z: q.z, attack: false };
    }
  } else if (name === 'unload') {
    if (!unload(Number(d.id), d.boat === true)) player.hud.toast(d.boat === true ? 'Bring the transport to the shore first' : 'No one inside');
  } else if (name === 'stance') {
    const st = Number(d.stance);
    if (st === 0 || st === 1 || st === 2) for (const u of us) u.stance = st;
  } else if (name === 'ability') {
    if (!useAbility(game, slot, us, d.kind as UnitKind, x, z, queue)) player.hud.toast('Not ready yet');
  } else if (name === 'retreat') {
    // Back to the nearest depot or headquarters, not stopping to shoot, and faster than they came.
    if (!us.length) return;
    const cx = us.reduce((n, u) => n + u.x, 0) / us.length;
    const cz = us.reduce((n, u) => n + u.z, 0) / us.length;
    const post = [...buildings.values()].filter((b) => b.seat === slot.seat && b.built >= 1 && (b.kind === 'depot' || b.kind === 'hq')).sort((p, q) => dist(p.x, p.z, cx, cz) - dist(q.x, q.z, cx, cz))[0];
    if (!post) return player.hud.toast('Nowhere to fall back to');
    const land = us.filter((u) => u.lake < 0 && u.kind !== 'engineer');
    for (const u of land) u.sprintUntil = time + RETREAT.seconds;
    const d0 = dist(cx, cz, post.x, post.z) || 1;
    const out = BUILDINGS[post.kind].radius + 6;
    formation(land, post.x + ((cx - post.x) / d0) * out, post.z + ((cz - post.z) / d0) * out, false);
  } else if (name === 'hero') {
    if (!useRally(game, slot.seat)) player.hud.toast('Your commander isn\u2019t ready');
  } else if (name === 'power') {
    if (!usePower(game, slot.seat, x, z)) player.hud.toast('Not ready yet');
  } else if (name === 'repeat') {
    const b = buildings.get(Number(d.id));
    if (b && b.seat === slot.seat && BUILDINGS[b.kind].trains.length) b.loop = !b.loop;
  } else if (name === 'cancel') {
    const b = buildings.get(Number(d.id));
    const q = b && b.seat === slot.seat ? b.queue.pop() : null;
    // (Cancelling stops the repeat too: otherwise the queue would refill at once.)
    if (b && b.seat === slot.seat && !b.queue.length) b.loop = false;
    if (q) {
      const def = UNITS[q.kind];
      const cost = costFor(slot.doctrine, q.kind);
      slot.steel += cost.steel;
      slot.oil += cost.oil;
      slot.pop -= def.pop;
    }
  } else return;
  dirty = true;
}

// ---------------------------------------------------------------------------------------------
// What the screens hear

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Where an order's bound, and what kind it is (0 move, 1 attack-move, 2 attack, 3 gather, 4 build or repair, 5 patrol). */
function orderPoint(o: Order): [number, number, number] | null {
  if (o.t === 'move') return [o.attack ? 1 : 0, round1(o.x), round1(o.z)];
  if (o.t === 'patrol') return [5, round1(o.to ? o.bx : o.ax), round1(o.to ? o.bz : o.az)];
  if (o.t === 'attack') {
    const t = targetOf(o);
    return t ? [2, round1(t.x), round1(t.z)] : null;
  }
  if (o.t === 'gather') {
    const n = nodes[o.node];
    return n ? [3, round1(n.x), round1(n.z)] : null;
  }
  if (o.t === 'repair' && o.unit) {
    const v = units.get(o.id);
    return v ? [4, round1(v.x), round1(v.z)] : null;
  }
  if (o.t === 'build' || o.t === 'repair') {
    const b = buildings.get(o.id);
    return b ? [4, round1(b.x), round1(b.z)] : null;
  }
  if (o.t === 'cast') return [1, round1(o.x), round1(o.z)];
  return null;
}

function tell(game: GameContext, dt: number): void {
  stateIn -= dt;
  if (dirty || stateIn <= 0) {
    dirty = false;
    stateIn = 0.5;
    const seats: Seat[] = slots
      .filter((s): s is Slot => !!s && s.seat !== NEUTRAL)
      .map((s) => ({ seat: s.seat, name: s.name, team: s.team, color: s.seat % TEAM_COLORS.length, human: !!s.player, steel: Math.floor(s.steel), oil: Math.floor(s.oil), pop: s.pop, cap: s.cap, alive: s.alive, doctrine: s.doctrine, units: [...units.values()].filter((u) => u.seat === s.seat).length, buildings: [...buildings.values()].filter((b) => b.seat === s.seat).length, powerIn: Math.max(0, Math.ceil(s.powerAt - time)), rallyIn: Math.max(0, Math.ceil(s.rallyAt - time)), hero: [...units.values()].some((u) => u.seat === s.seat && u.kind === 'hero'), techs: [...s.techs], trade: [tradeGet('steel', priceNow(s, 'steel')), tradeGet('oil', priceNow(s, 'oil'))], style: s.bot?.style ?? '', worth: [...units.values()].filter((u) => u.seat === s.seat && u.kind !== 'engineer').reduce((a, u) => a + UNITS[u.kind].cost.steel + UNITS[u.kind].cost.oil, 0), income: Math.round(s.stats.steel + s.stats.oil - (s.banked[s.banked.length - 6] ?? 0)) }));
    const mine: Record<string, number> = {};
    for (const s of slots) if (s?.player) mine[s.player.id] = s.seat;
    const state: State = { phase, mode, seats, mine, peaceUntil, watchers: phase === 'lobby' ? lobby.watchers.map((w) => w.name) : game.players.filter((p) => !slotOf(p)).map((p) => p.name), deposits: nodes.map((n) => Math.floor(n.amount)), salvage: nodes.filter((n) => n.salvage && n.amount > 0).map((n) => ({ id: n.id, x: n.x, z: n.z, scrap: n.scrap!, kind: 'steel' as const })), relics: relics.map((r) => ({ owner: r.owner, pct: Math.round((r.progress / RELIC.hold) * 100) })), drops: drops.map((x) => ({ id: x.id, x: x.x, z: x.z, landIn: Math.max(0, x.at - time) })), ...(mode === 'stand' && phase !== 'lobby' ? { stand: { wave, total: STAND.total, nextIn: wave < STAND.total ? Math.ceil(waveIn) : 0, left: [...units.values()].filter((u) => u.seat === STAND.seat).length } } : {}), time: Math.floor(time), winners, wonBy, uplinkOn, uplinks: [...buildings.values()].filter((b) => b.kind === 'uplink').map((b) => ({ seat: b.seat, x: round1(b.x), z: round1(b.z), left: b.doneAt === undefined ? -1 : Math.max(0, Math.ceil(UPLINK.hold - (time - b.doneAt))) })), ...(phase === 'lobby' ? { lobby } : {}), ...(phase === 'briefing' ? { briefing: Math.ceil(briefingLeft) } : {}), ...(summary ? { summary } : {}) };
    game.clients.send('all', 'state', state);
  }
  if (phase === 'lobby') return;
  sendIn -= dt;
  if (sendIn <= 0) {
    sendIn = 0.1;
    // Each human sees their own team's units and buildings, and the others' only where their team can see.
    for (const sl of slots) {
      if (!sl?.player) continue;
      const mineTeam = sl.team;
      const mult = sl.doctrine === 'intel' ? 1.4 : 1;
      const eyes: { x: number; z: number; r: number }[] = [];
      let all = false;
      for (const t of slots) if (t && t.team === mineTeam && t.revealUntil > time) all = true;
      for (const v of units.values()) if (teamOf(v.seat) === mineTeam && !v.inside) eyes.push({ x: v.x, z: v.z, r: (UNITS[v.kind].sight ?? (UNITS[v.kind].air ? SIGHT.air : SIGHT.unit)) * (slots[v.seat]?.doctrine === 'intel' ? 1.4 : 1) * (has(v.seat, 'optics') ? 1.2 : 1) * (heightAt(v.x, v.z) >= 1 ? 1 + HIGH.sight : 1) });
      for (const v of buildings.values()) if (teamOf(v.seat) === mineTeam) eyes.push({ x: v.x, z: v.z, r: (BUILDINGS[v.kind].wall ? 8 : SIGHT.building) * (slots[v.seat]?.doctrine === 'intel' ? 1.4 : 1) * (has(v.seat, 'optics') ? 1.2 : 1) });
      for (const fl of flares) if (fl.team === mineTeam) eyes.push({ x: fl.x, z: fl.z, r: fl.r });
      // (A supply drop is announced to everyone, and its smoke shows through the fog: anyone can see the patch it comes down on.)
      for (const d of drops) eyes.push({ x: d.x, z: d.z, r: 10 });
      const seen = (x: number, z: number) => all || eyes.some((e) => dist(e.x, e.z, x, z) < e.r);
      const u: number[] = [];
      for (const v of units.values()) if (!v.inside && (teamOf(v.seat) === mineTeam || seen(v.x, v.z))) u.push(v.id, UNIT_ORDER.indexOf(v.kind), v.seat, round1(v.x), round1(v.z), Math.round((v.hp / v.max) * 100), Math.round(v.yaw * 10), (time - v.busy < 0.3 ? 1 : 0) + (v.carry > 0 ? (v.carryRes === 'oil' ? 4 : 2) : 0) + (v.order.t === 'idle' ? 8 : 0) + rankOf(v.xp) * 16 + (heightAt(v.x, v.z) >= 1 ? 64 : 0) + v.stance * 128 + (UNITS[v.kind].holds ? cargo(v.id, true).length * 512 : 0));
      const b: number[] = [];
      for (const v of buildings.values()) if (teamOf(v.seat) === mineTeam || v.kind === 'uplink' || seen(v.x, v.z)) b.push(v.id, BUILDING_ORDER.indexOf(v.kind), v.seat, round1(v.x), round1(v.z), Math.round((v.hp / BUILDINGS[v.kind].hp) * 100), Math.round(v.built * 100), v.research ? 1000 + Math.round((v.research.t / TECHS[v.research.id].time) * 100) + TECH_IDS.indexOf(v.research.id) * 1000 : v.queue.length ? Math.round((v.queue[0].t / UNITS[v.queue[0].kind].time) * 100) : -1, BUILDINGS[v.kind].holds ? cargo(v.id, false).length : v.gate ? v.gate.axis + (v.gate.locked ? 2 : 0) + (v.gate.open > 0.5 ? 4 : 0) : 0);
      game.clients.send(sl.player, 'u', u);
      game.clients.send(sl.player, 'b', b);
      // What each of this side's buildings has in hand, and where its units are bound.
      const prod: number[] = [];
      for (const v of buildings.values()) if (v.seat === sl.seat && v.queue.length) prod.push(v.id, v.queue.length, ...v.queue.map((q) => UNIT_ORDER.indexOf(q.kind)));
      game.clients.send(sl.player, 'prod', prod);
      const loops: number[] = [];
      for (const v of buildings.values()) if (v.seat === sl.seat && v.loop) loops.push(v.id);
      game.clients.send(sl.player, 'loops', loops);
      const ords: number[] = [];
      for (const v of units.values()) {
        if (v.seat !== sl.seat || v.inside || v.order.t === 'idle') continue;
        const plan = [v.order, ...v.next].map(orderPoint).filter((x): x is [number, number, number] => !!x);
        if (plan.length) ords.push(v.id, plan.length, ...plan.flat());
      }
      game.clients.send(sl.player, 'orders', ords);
      // Whose ability is still recharging, and for how long.
      const cds: number[] = [];
      for (const v of units.values()) if (v.seat === sl.seat && v.abilityAt > time) cds.push(v.id, Math.ceil(v.abilityAt - time));
      game.clients.send(sl.player, 'cd', cds);
      // The mines this side laid, and those its scouts can see.
      const mn: number[] = [];
      for (const m of mines) {
        const ours = m.team === mineTeam;
        if (ours || [...units.values()].some((v) => v.kind === 'scout' && teamOf(v.seat) === mineTeam && dist(v.x, v.z, m.x, m.z) < MINE.spot)) mn.push(m.x, m.z, ours ? 1 : 0);
      }
      game.clients.send(sl.player, 'mines', mn);
      game.clients.send(sl.player, 'eyes', { all, r: [mult, SIGHT.unit, SIGHT.building], eyes: eyes.map((e) => [Math.round(e.x), Math.round(e.z), Math.round(e.r)]).flat() });
    }
  }
  if (sendIn === 0.1) for (const p of game.players) {
    if (slotOf(p)) continue;
    // Those watching see everything.
    const u: number[] = [];
    for (const v of units.values()) if (!v.inside) u.push(v.id, UNIT_ORDER.indexOf(v.kind), v.seat, round1(v.x), round1(v.z), Math.round((v.hp / v.max) * 100), Math.round(v.yaw * 10), (time - v.busy < 0.3 ? 1 : 0) + (v.carry > 0 ? (v.carryRes === 'oil' ? 4 : 2) : 0) + rankOf(v.xp) * 16);
    const b: number[] = [];
    for (const v of buildings.values()) b.push(v.id, BUILDING_ORDER.indexOf(v.kind), v.seat, round1(v.x), round1(v.z), Math.round((v.hp / BUILDINGS[v.kind].hp) * 100), Math.round(v.built * 100), v.queue.length ? 1 : -1, v.gate ? v.gate.axis + (v.gate.locked ? 2 : 0) : 0);
    game.clients.send(p, 'u', u);
    game.clients.send(p, 'b', b);
    game.clients.send(p, 'eyes', { all: true, eyes: [] });
  }
  if (shots.length) {
    game.clients.send('all', 'shots', shots.slice(0, 60));
    shots = [];
  }
  if (booms.length) {
    game.clients.send('all', 'boom', booms.slice(0, 80));
    booms = [];
  }
}
