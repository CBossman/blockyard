/**
 * What there is in Block Command, as numbers both the server (which plays by them) and each screen
 * (which shows them) read: the two resources, the units and the buildings that train them.
 */

export type ResKind = 'steel' | 'oil';
export interface Cost {
  steel: number;
  oil: number;
}

export type UnitKind = 'engineer' | 'rifle' | 'scout' | 'at' | 'tank' | 'artillery' | 'aa' | 'heli' | 'hero' | 'guard' | 'brute' | 'gunboat' | 'transport' | 'medic';
export type BuildingKind = 'hq' | 'depot' | 'barracks' | 'factory' | 'airfield' | 'lab' | 'tower' | 'bunker' | 'dock' | 'rampart' | 'gate' | 'market' | 'uplink';
export type TechId = 'armor' | 'ordnance' | 'optics' | 'logistics' | 'age2' | 'age3' | 'medicine' | 'engines';

export interface UnitDef {
  name: string;
  hp: number;
  /** Blocks a second. */
  speed: number;
  /** Damage a shot, shots a second, and reach (blocks); engineers hit weakly. */
  damage: number;
  rate: number;
  range: number;
  cost: Cost;
  /** Seconds to train. */
  time: number;
  pop: number;
  /** Where it's trained. */
  from: BuildingKind;
  /** How big it is (for crowding and picking), in blocks across. */
  size: number;
  /** It flies: over buildings and deposits, and out of reach of what can't shoot up. */
  air?: boolean;
  /** What it can hit: the ground, the air, or both (default: the ground). */
  hits?: 'ground' | 'air' | 'both';
  /** How far it sees, if more than a unit's usual; and the radius of the blast it makes (0: a single target). */
  sight?: number;
  splash?: number;
  /** Only this many at once (the commander). */
  limit?: number;
  /** It sails: kept to the lake its dock is on. */
  naval?: boolean;
  /** How many infantry it carries (a transport). */
  holds?: number;
  blurb: string;
}

export const UNITS: Record<UnitKind, UnitDef> = {
  engineer: { name: 'Engineer', hp: 45, speed: 6, damage: 3, rate: 1, range: 1.8, cost: { steel: 50, oil: 0 }, time: 7, pop: 1, from: 'hq', size: 1.6, blurb: 'Gathers steel and oil, and builds.' },
  rifle: { name: 'Infantry', hp: 75, speed: 6.5, damage: 7, rate: 1.4, range: 9, cost: { steel: 60, oil: 10 }, time: 8, pop: 1, from: 'barracks', size: 2.4, hits: 'both', blurb: 'Cheap riflemen. Good in a crowd, and they can shoot helicopters.' },
  scout: { name: 'Scout', hp: 60, speed: 11, damage: 3, rate: 1.2, range: 6, cost: { steel: 45, oil: 10 }, time: 7, pop: 1, from: 'barracks', size: 1.7, hits: 'both', sight: 40, blurb: 'Fast and fragile: sees far, spots for the army.' },
  at: { name: 'AT Team', hp: 70, speed: 5.8, damage: 38, rate: 0.5, range: 12, cost: { steel: 80, oil: 35 }, time: 11, pop: 1, from: 'barracks', size: 2.2, hits: 'both', blurb: 'Rocket launchers: wreck tanks and anything with armour, but slow to reload and weak against infantry.' },
  tank: { name: 'Tank', hp: 360, speed: 5, damage: 32, rate: 0.6, range: 14, cost: { steel: 170, oil: 90 }, time: 20, pop: 3, from: 'factory', size: 3, blurb: 'Heavy armour and a big gun.' },
  artillery: { name: 'Artillery', hp: 150, speed: 3.6, damage: 58, rate: 0.28, range: 32, cost: { steel: 210, oil: 120 }, time: 22, pop: 3, from: 'factory', size: 3, splash: 3.6, blurb: 'Long-range shells that blast a whole group. Fragile up close.' },
  aa: { name: 'Anti-Air', hp: 140, speed: 5.5, damage: 9, rate: 2.6, range: 17, cost: { steel: 110, oil: 40 }, time: 14, pop: 2, from: 'factory', size: 2.6, hits: 'air', blurb: 'A flak gun on tracks. Only shoots helicopters.' },
  heli: { name: 'Helicopter', hp: 190, speed: 9, damage: 10, rate: 2, range: 12, cost: { steel: 120, oil: 100 }, time: 16, pop: 2, from: 'airfield', size: 2.4, air: true, hits: 'both', blurb: 'Fast, flies over everything, hits air and ground.' },
  guard: { name: 'Camp Guard', hp: 110, speed: 6, damage: 8, rate: 1.1, range: 9, cost: { steel: 0, oil: 0 }, time: 1, pop: 0, from: 'hq', size: 2.1, hits: 'both', blurb: 'A wild guard.' },
  brute: { name: 'Camp Brute', hp: 420, speed: 4.6, damage: 24, rate: 0.7, range: 6, cost: { steel: 0, oil: 0 }, time: 1, pop: 0, from: 'hq', size: 2.6, blurb: 'A wild brute. Hits hard up close.' },
  gunboat: { name: 'Gunboat', hp: 320, speed: 7, damage: 16, rate: 1.3, range: 15, cost: { steel: 130, oil: 60 }, time: 16, pop: 2, from: 'dock', size: 3.4, hits: 'both', naval: true, blurb: 'Rules its lake: a deck gun and a machine gun that reach the shore, and helicopters overhead.' },
  transport: { name: 'Transport', hp: 260, speed: 8.5, damage: 0, rate: 0, range: 0, cost: { steel: 90, oil: 30 }, time: 12, pop: 1, from: 'dock', size: 3.6, naval: true, holds: 6, blurb: 'Ferries up to six infantry across its lake. Right click it with infantry to board; U lands them on the nearest shore.' },
  medic: { name: 'Medic', hp: 80, speed: 6.4, damage: 0, rate: 0, range: 0, cost: { steel: 60, oil: 30 }, time: 9, pop: 1, from: 'barracks', size: 2.2, blurb: 'Patches up the soldiers and engineers round them, the most hurt first, and goes to those nearby who need it. Unarmed: keep them behind the line.' },
  hero: { name: 'Commander', hp: 700, speed: 6, damage: 22, rate: 1.6, range: 11, cost: { steel: 300, oil: 150 }, time: 26, pop: 3, from: 'hq', size: 2.2, hits: 'both', limit: 1, blurb: 'One per army. Its aura speeds the fire of units near it, and Rally (F) heals and inspires them.' },
};

/**
 * The pace of a match, aimed at about half an hour: how much longer everything takes to train, build
 * and research than its figure above, and how much more punishment units and buildings stand (so a
 * fight has time to be fought, and a base isn't gone in one push). The headquarters stands more still.
 */
export const PACE = { train: 1.7, build: 1.6, research: 1.7, unitHp: 1.4, buildingHp: 2.3, hqHp: 3.6 };
for (const u of Object.values(UNITS)) {
  u.time = Math.round(u.time * PACE.train);
  u.hp = Math.round(u.hp * PACE.unitHp);
}

/** What each unit is, for what hits it hard: soldiers, armour, aircraft. */
export type ArmorClass = 'infantry' | 'vehicle' | 'air';
export const ARMOR: Record<UnitKind, ArmorClass> = { engineer: 'infantry', medic: 'infantry', rifle: 'infantry', scout: 'infantry', at: 'infantry', hero: 'infantry', guard: 'infantry', tank: 'vehicle', artillery: 'vehicle', aa: 'vehicle', brute: 'vehicle', heli: 'air', gunboat: 'vehicle', transport: 'vehicle' };
/**
 * The counters: how much of its damage each unit does to each kind of target (1 when not listed).
 * Rifles beat AT teams, AT teams beat tanks, tanks beat rifles; artillery breaks buildings and
 * crowds, anti-air and rifles bring down helicopters, helicopters hunt armour.
 */
export const VERSUS: Partial<Record<UnitKind, Partial<Record<ArmorClass | 'building', number>>>> = {
  engineer: { vehicle: 0.3, building: 0.5 },
  rifle: { vehicle: 0.3, building: 0.45, infantry: 1.15 },
  scout: { vehicle: 0.25, building: 0.4 },
  at: { vehicle: 2.4, infantry: 0.35, air: 0.6, building: 1.3 },
  tank: { infantry: 1.35, vehicle: 0.9 },
  artillery: { building: 1.6, infantry: 1.2, vehicle: 0.7 },
  heli: { vehicle: 1.5, infantry: 0.9, building: 0.6 },
  guard: { vehicle: 0.5 },
  gunboat: { infantry: 1.15, building: 1.1 },
};
/** In words, for the tooltips: what a unit is good and bad against. */
export function versusText(k: UnitKind): string {
  const v = VERSUS[k] ?? {};
  const name = { infantry: 'infantry', vehicle: 'armour', air: 'aircraft', building: 'buildings' } as const;
  const strong = (Object.keys(v) as (keyof typeof name)[]).filter((c) => (v[c] ?? 1) >= 1.2).map((c) => name[c]);
  const weak = (Object.keys(v) as (keyof typeof name)[]).filter((c) => (v[c] ?? 1) <= 0.6).map((c) => name[c]);
  if (UNITS[k].hits === 'air') strong.push('aircraft');
  return [strong.length ? `Strong vs ${strong.join(', ')}` : '', weak.length ? `weak vs ${weak.join(', ')}` : ''].filter(Boolean).join('; ');
}

export interface BuildingDef {
  name: string;
  hp: number;
  cost: Cost;
  /** Seconds to build. */
  time: number;
  /** Its footprint's radius (blocks). */
  radius: number;
  /** Room for people it gives. */
  pop: number;
  /** What it trains, in the order of its buttons. */
  trains: UnitKind[];
  /** What it researches (the lab). */
  research?: TechId[];
  /** How many infantry it shelters (a bunker): they fire from inside, further, and can't be hit till it falls. */
  holds?: number;
  /** A building that shoots (a tower): how hard, how often, how far, at what. */
  guns?: { damage: number; rate: number; range: number; hits: 'ground' | 'air' | 'both' };
  /** A length of wall, or a gate in one: it stands on one cell of the path grid, nothing on the ground gets past it (a gate lets its own side through), and nothing shoots it unless told to or it's in the way. */
  wall?: boolean;
  blurb: string;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  hq: { name: 'Headquarters', hp: 2600, cost: { steel: 0, oil: 0 }, time: 0, radius: 4.2, pop: 12, trains: ['engineer', 'hero'], research: ['age2', 'age3'], holds: 10, guns: { damage: 20, rate: 1.2, range: 20, hits: 'both' }, blurb: 'Your base. Trains engineers and your commander. Its guns defend it, faster for every engineer sheltering inside (ring the Alarm). Lose it and the rest of your base falls within a minute.' },
  depot: { name: 'Supply Depot', hp: 450, cost: { steel: 100, oil: 0 }, time: 12, radius: 2.4, pop: 10, trains: [], blurb: 'Room for ten more people. Engineers can bring what they gather here, so one by a far deposit is a forward base; and units out of the fighting heal near it.' },
  barracks: { name: 'Barracks', hp: 750, cost: { steel: 150, oil: 0 }, time: 20, radius: 3.4, pop: 0, trains: ['rifle', 'scout', 'at', 'medic'], blurb: 'Trains infantry, scouts, anti-tank teams and (from Era II) medics.' },
  factory: { name: 'Factory', hp: 950, cost: { steel: 250, oil: 60 }, time: 28, radius: 4, pop: 0, trains: ['tank', 'artillery', 'aa'], blurb: 'Builds tanks, artillery and anti-air.' },
  airfield: { name: 'Airfield', hp: 800, cost: { steel: 220, oil: 140 }, time: 30, radius: 4.4, pop: 0, trains: ['heli'], blurb: 'Builds helicopters. Needs a factory.' },
  lab: { name: 'Research Lab', hp: 650, cost: { steel: 200, oil: 80 }, time: 24, radius: 3, pop: 0, trains: [], research: ['armor', 'ordnance', 'optics', 'logistics', 'medicine', 'engines'], blurb: 'Researches upgrades for your whole army. Needs a barracks.' },
  bunker: { name: 'Bunker', hp: 1000, cost: { steel: 140, oil: 0 }, time: 16, radius: 2.4, pop: 0, trains: [], holds: 6, blurb: 'Shelters six infantry: they fire from cover with 3 more reach and can’t be hit until it falls. Right click it with infantry to go in; U lets them out.' },
  dock: { name: 'Dock', hp: 760, cost: { steel: 160, oil: 40 }, time: 22, radius: 3, pop: 0, trains: ['gunboat', 'transport'], blurb: 'Build it on a lake’s shore. Launches gunboats and transports.' },
  rampart: { name: 'Wall', hp: 260, cost: { steel: 10, oil: 0 }, time: 3, radius: 1.5, pop: 0, trains: [], wall: true, blurb: 'Drag to lay a line of it. Nothing on the ground gets past: not theirs, and not yours either, so leave a gap or build a gate. Helicopters fly over, and guns shoot over.' },
  gate: { name: 'Gate', hp: 320, cost: { steel: 40, oil: 0 }, time: 4, radius: 1.5, pop: 0, trains: [], wall: true, blurb: 'A way through a wall for your side only. Put it in a gap, or on a length of your own wall to replace it.' },
  market: { name: 'Trade Post', hp: 600, cost: { steel: 120, oil: 0 }, time: 18, radius: 3, pop: 0, trains: [], blurb: 'Swaps steel for oil and oil for steel, a hundred at a time. Every sale gets you less for the next, and the price comes back slowly.' },
  uplink: { name: 'Satellite Uplink', hp: 2400, cost: { steel: 900, oil: 700 }, time: 80, radius: 4.4, pop: 0, trains: [], blurb: 'A second way to win. Once it is finished, every commander on the map sees it, and a clock starts: if it still stands five minutes later, your side wins. Expect everyone to come for it. One each.' },
  tower: { name: 'Guard Tower', hp: 520, cost: { steel: 130, oil: 30 }, time: 14, radius: 1.9, pop: 0, trains: [], guns: { damage: 13, rate: 1.3, range: 18, hits: 'both' }, blurb: 'Shoots anything that comes near, air and ground.' },
};

for (const [k, b] of Object.entries(BUILDINGS)) {
  b.time = Math.round(b.time * PACE.build);
  b.hp = Math.round(b.hp * (k === 'hq' ? PACE.hqHp : PACE.buildingHp));
}

export interface TechDef {
  name: string;
  cost: Cost;
  /** Seconds to research. */
  time: number;
  blurb: string;
}
/** Upgrades, researched once each at a lab, for the whole army. */
export const TECHS: Record<TechId, TechDef> = {
  armor: { name: 'Armor Plating', cost: { steel: 180, oil: 60 }, time: 40, blurb: 'Your units take 20% less damage.' },
  ordnance: { name: 'Ordnance', cost: { steel: 200, oil: 100 }, time: 45, blurb: 'Your units and towers hit 20% harder.' },
  optics: { name: 'Optics', cost: { steel: 120, oil: 80 }, time: 35, blurb: 'Your guns reach 20% further, and everything sees a fifth further.' },
  age2: { name: 'Mechanized Era', cost: { steel: 250, oil: 100 }, time: 45, blurb: 'Era II: factories (tanks, anti-air), the lab and your commander.' },
  age3: { name: 'Modern Era', cost: { steel: 400, oil: 250 }, time: 65, blurb: 'Era III: airfields (helicopters) and artillery.' },
  medicine: { name: 'Field Medicine', cost: { steel: 160, oil: 80 }, time: 35, blurb: 'Your units heal slowly anywhere once they are out of the fighting, not only by a depot.' },
  engines: { name: 'Turbo Engines', cost: { steel: 180, oil: 140 }, time: 40, blurb: 'Your vehicles, boats and helicopters move 15% faster.' },
  logistics: { name: 'Logistics', cost: { steel: 150, oil: 30 }, time: 35, blurb: 'Engineers gather, build and repair 30% faster.' },
};
for (const t of Object.values(TECHS)) t.time = Math.round(t.time * PACE.research);
export const TECH_IDS = Object.keys(TECHS) as TechId[];

export const UNIT_KINDS = Object.keys(UNITS) as UnitKind[];
export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];
/** The era (1 to 3) each unit or building needs. Researched at the HQ: Mechanized Era, then Modern Era. */
export const AGE_NEEDS: Partial<Record<UnitKind | BuildingKind, number>> = { tank: 2, aa: 2, hero: 2, medic: 2, artillery: 3, heli: 3, factory: 2, lab: 2, airfield: 3, dock: 2, gunboat: 2, uplink: 3 };
export const AGE_NAMES = ['', 'Era I', 'Era II', 'Era III'];
export const ageOf = (techs: Iterable<TechId>): number => {
  const t = new Set(techs);
  return 1 + (t.has('age2') ? 1 : 0) + (t.has('age2') && t.has('age3') ? 1 : 0);
};

/** What an engineer can put up. */
export const BUILDABLE: BuildingKind[] = ['depot', 'barracks', 'factory', 'airfield', 'lab', 'tower', 'bunker', 'dock', 'rampart', 'gate', 'market', 'uplink'];
/** The most lengths of wall and gates one commander can have standing. */
export const MAX_WALLS = 150;
/** Their keys on the command grid. */
export const BUILD_KEYS: Record<string, string> = { depot: 'Z', barracks: 'X', factory: 'C', airfield: 'V', lab: 'B', tower: 'N', bunker: 'M', dock: 'G', rampart: 'J', gate: 'L', market: 'I', uplink: 'O' };

/**
 * The trade post's prices. Each sale is a lot of a hundred; at full price a hundred steel buys
 * `oil` oil and a hundred oil buys `steel` steel (the two together lose a fifth, so trading back and
 * forth never pays). Every sale knocks what that resource fetches down by `drop` (to no less than
 * `floor` of full price), and it climbs back by `recover` of full price a second.
 */
export const TRADE = { lot: 100, oil: 50, steel: 160, drop: 0.1, floor: 0.4, recover: 0.005 };
/** What a lot of `sell` fetches, at `price` (a share of full price). */
export const tradeGet = (sell: ResKind, price: number) => Math.floor(sell === 'steel' ? TRADE.oil * price : TRADE.steel * price);
/** What can go into a bunker or a transport: soldiers on foot. */
export const BOARDS: UnitKind[] = ['engineer', 'rifle', 'scout', 'at', 'hero', 'medic'];
/** How much further a soldier in a bunker reaches. */
export const COVER_RANGE = 3;

/**
 * Stances: aggressive units go after what they see and turn on what hits them; units holding their
 * ground shoot what's in reach but never leave their spot; units holding fire don't shoot unless told.
 */
export const STANCES = [
  { name: 'Aggressive', glyph: '⚔', blurb: 'Chase what comes in sight and turn on whatever hits them.' },
  { name: 'Hold ground', glyph: '⛉', blurb: 'Shoot what comes in reach, but never leave the spot.' },
  { name: 'Hold fire', glyph: '✋', blurb: 'Don’t shoot unless ordered to attack (scouting, sneaking past).' },
];

/**
 * Veterancy: kills earn experience (a kill is worth the victim's health over 75: an infantryman 1,
 * a tank about 5), and at 3, 8 and 16 a unit gains a star: each 12% more damage and 10% more health.
 */
/** Veterancy: experience from hits and kills (a kill counts for most), and at each threshold a star: more damage, health and rate of fire. Elites (three stars) patch themselves up between fights. */
export const VET = { xp: [3, 8, 16], damage: 0.12, hp: 0.1, rate: 0.08, hit: 0.3, regen: 0.012, names: ['Recruit', 'Veteran', 'Hardened', 'Elite'] };
export const rankOf = (xp: number) => VET.xp.filter((t) => xp >= t).length;
/** High ground: how much further a unit on a hill reaches and sees, and how much less it takes from below. */
export const HIGH = { range: 0.2, sight: 0.3, cover: 0.15 };
/**
 * Flanking: a ground vehicle's armour is thin behind. A shot from within 60 degrees of dead astern
 * (of the way the vehicle faces, which is at whatever it's shooting) does this much more.
 */
export const FLANK = 1.3;
/** Whether a shot from (fx, fz) at something at (x, z) facing `yaw` comes from behind it. */
export const fromBehind = (yaw: number, x: number, z: number, fx: number, fz: number): boolean => {
  const dx = fx - x;
  const dz = fz - z;
  const d = Math.hypot(dx, dz);
  return d > 0.01 && (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / d < -0.5;
};
/** What a building needs standing first. */
export const NEEDS: Partial<Record<BuildingKind, BuildingKind>> = { airfield: 'factory', lab: 'barracks', bunker: 'barracks', uplink: 'lab' };
/** The alarm: the HQ calls in every engineer of its side this near, and each one inside makes its guns fire this much faster. */
export const ALARM = { reach: 50, boost: 0.15 };
/** The uplink: how long it must stand, finished, for its side to win (seconds). Not in Last Stand. */
export const UPLINK = { hold: 300 };

/** The commander's aura (blocks, and the share of fire rate it adds) and Rally: its radius, how long it lasts, the heal and the fire-rate boost, and its recharge. */
export const HERO = { aura: 14, auraRate: 0.2, rally: { radius: 20, seconds: 9, heal: 0.25, rate: 0.4, cooldown: 50 } };

/**
 * What each kind can do besides shoot, one each, on its own recharge: a lobbed grenade, a flare over
 * a patch of the map, bracing to reach further, a smoke screen, an artillery barrage on any patch of
 * ground (seen or not), a burst of flak, a rocket salvo. `aimed`: it wants a spot on the map, and the
 * unit walks into `range` of it first. `perClick`: how many of those selected go at each use (the
 * rest stay ready). `shells` land over `radius` of the spot.
 */
export interface Ability {
  name: string;
  glyph: string;
  blurb: string;
  cooldown: number;
  aimed: boolean;
  range: number;
  /** Each blast's radius (or, a flare, how far it lights). */
  radius: number;
  damage: number;
  shells: number;
  /** How far apart the shells fall. */
  spread: number;
  /** How long it lasts. */
  seconds: number;
  perClick: number;
  /** Steel each use costs. */
  cost?: number;
}
const ab = (a: Partial<Ability> & Pick<Ability, 'name' | 'glyph' | 'blurb' | 'cooldown'>): Ability => ({ aimed: false, range: 0, radius: 0, damage: 0, shells: 0, spread: 0, seconds: 0, perClick: 99, ...a });
export const ABILITIES: Partial<Record<UnitKind, Ability>> = {
  engineer: ab({ name: 'Lay Mine', glyph: '✸', blurb: 'Buries a mine: your enemies can’t see it, and the first thing on the ground to cross it goes up. Scouts spot mines nearby, and defuse them by driving over them. Up to ten at a time.', cooldown: 5, aimed: true, range: 2.5, radius: 3.2, damage: 110, perClick: 1, cost: 40 }),
  rifle: ab({ name: 'Grenades', glyph: '✹', blurb: 'They lob grenades at a spot: three of those selected at each use. A second and a bit to land, so keep them on something that isn’t moving.', cooldown: 24, aimed: true, range: 14, radius: 3.6, damage: 34, shells: 1, perClick: 3 }),
  scout: ab({ name: 'Flare', glyph: '✦', blurb: 'Lights up a patch of the map for your side for twelve seconds, fog or not.', cooldown: 34, aimed: true, range: 40, radius: 20, seconds: 12, perClick: 1 }),
  at: ab({ name: 'Brace', glyph: '⚓', blurb: 'They kneel and steady the launcher: 40% more reach for ten seconds, but they can’t move.', cooldown: 24, seconds: 10 }),
  tank: ab({ name: 'Smoke', glyph: '☁', blurb: 'A smoke screen: half damage for six seconds.', cooldown: 30, seconds: 6 }),
  artillery: ab({ name: 'Barrage', glyph: '☄', blurb: 'Six shells on any patch of ground in long reach, seen or not. Slow to land.', cooldown: 45, aimed: true, range: 46, radius: 3.6, damage: 50, shells: 6, spread: 6 }),
  aa: ab({ name: 'Flak Burst', glyph: '✺', blurb: 'Fires twice as fast for seven seconds.', cooldown: 28, seconds: 7 }),
  heli: ab({ name: 'Rockets', glyph: '➹', blurb: 'A salvo of four rockets on a spot. Murder on armour.', cooldown: 20, aimed: true, range: 16, radius: 2.2, damage: 32, shells: 4, spread: 1.6 }),
};
/** A depot or the HQ patches up whoever rests near it: how near (from its edge), how much a second, and how long since it was hit. */
/** Mines: how near sets one off, how many a side may have down, and how far off a scout sees them and how near it defuses them. */
export const MINE = { trigger: 1.9, most: 10, spot: 11, defuse: 3 };
/** A medic: how near it heals (blocks), how fast (health a second, one patient at a time), and how far it goes to find one. */
export const MEDIC = { reach: 8, rate: 7, seek: 18 };
export const HEAL = { radius: 11, rate: 0.05, calm: 6 };
/** Falling back to the nearest depot or HQ: how much faster, and for how long. */
export const RETREAT = { speed: 1.35, seconds: 10 };
/** What a wreck or a ruin is worth to the engineers who strip it (a share of what it cost), at most this many lying about at once. */
export const SALVAGE = { share: 0.4, most: 32 };

/**
 * How far apart each kind keeps from its neighbours, centre to centre with another of its own: its
 * model's real footprint and a little room, so tanks don't sit in each other and rotors don't cross.
 * (Two different kinds keep the average of theirs.)
 */
export const SPACE: Record<UnitKind, number> = { engineer: 2, medic: 2.8, rifle: 3.4, at: 3.1, guard: 3, hero: 2.8, scout: 3, tank: 7.6, artillery: 8, aa: 6.8, heli: 8.4, brute: 5.8, gunboat: 6.8, transport: 6.4 };

export const START = { steel: 300, oil: 80 };
export const MAX_POP = 60;
/** How much an engineer carries, and how fast it gathers (a second). */
export const CARRY = 25;
export const GATHER_RATE = 2.1;

export type Mode = 'ffa' | 'teams' | 'coop' | 'stand';
export const MODES: { id: Mode; name: string; blurb: string }[] = [
  { id: 'ffa', name: 'Free for all', blurb: 'Four commanders, every one for themselves. Bots take the empty seats.' },
  { id: 'teams', name: '2 vs 2', blurb: 'West against east, in teams of two. Bots take the empty seats.' },
  { id: 'coop', name: 'Co-op vs bots', blurb: 'Everyone on one side, against two bot commanders.' },
  { id: 'stand', name: 'Last Stand', blurb: 'Hold your base against fifteen waves of raiders, alone or together.' },
];

/**
 * Last Stand: when the first wave comes, how long between them, and how many there are. A wave is
 * worth `waveWorth` (scaled for the difficulty and how many are holding out), bought from what
 * `WAVE_UNITS` says the raiders have by then; every fifth is led by a warlord. Clearing one pays.
 */
export const STAND = { total: 15, first: 300, every: 100, seat: 4 };
export const waveWorth = (n: number) => 150 + 110 * n + 22 * n * n;
export const WAVE_UNITS: { kind: UnitKind; from: number; weight: number }[] = [
  { kind: 'rifle', from: 1, weight: 6 },
  { kind: 'scout', from: 2, weight: 1 },
  { kind: 'at', from: 3, weight: 2 },
  { kind: 'tank', from: 4, weight: 3 },
  { kind: 'heli', from: 7, weight: 1 },
  { kind: 'artillery', from: 9, weight: 1 },
];
export const wavePay = (n: number) => ({ steel: 120 + 25 * n, oil: 60 + 12 * n });

/**
 * Supply drops: a pallet comes down on a parachute somewhere in the open every minute or two, and
 * it's whoever gets there first (with no one of another side standing on it too).
 */
export const DROP = { first: 300, every: 90, spread: 45, fall: 7, reach: 3.6, lasts: 70, most: 2, from: 38 };
export type DropKind = 'supplies' | 'medics' | 'intel';
export const DROP_KINDS: Record<DropKind, { name: string; blurb: string; steel: number; oil: number }> = {
  supplies: { name: 'Supplies', blurb: 'Steel and oil', steel: 220, oil: 110 },
  medics: { name: 'Field hospital', blurb: 'Everyone near it is patched up', steel: 80, oil: 0 },
  intel: { name: 'Intelligence', blurb: 'The whole map for fourteen seconds', steel: 80, oil: 0 },
};

/** How good the bots are (`bots.ts`: `skill` is how much of the job each does). */
export type DifficultyId = 'easy' | 'normal' | 'hard' | 'adaptive';
export const DIFFICULTIES: { id: DifficultyId; name: string; blurb: string; skill: number; adaptive?: boolean }[] = [
  { id: 'easy', name: 'Easy', blurb: 'They leave you alone for fifteen minutes, and never retreat or plan.', skill: 0.3 },
  { id: 'normal', name: 'Normal', blurb: 'No attack before eleven minutes. They gather before they strike, and pull out of losing fights.', skill: 0.65 },
  { id: 'hard', name: 'Hard', blurb: 'They see the whole map, attack from nine minutes, raid your engineers and bomb your armies.', skill: 0.92 },
  { id: 'adaptive', name: 'Adaptive', blurb: 'Starts at Normal and sizes you up every minute: sharper while you’re winning, easier while you’re losing.', skill: 0.6, adaptive: true },
];

/** The bot styles the table offers (`bots.ts`). */
export const STYLE_CHOICES: [string, string][] = [['random', 'Any style'], ['balanced', 'Balanced'], ['rusher', 'Rusher'], ['turtle', 'Turtle'], ['air', 'Air Force'], ['navy', 'Navy']];

export const TEAM_COLORS = ['#e8392e', '#2f86f0', '#ffc83a', '#45c93a', '#9b5de5', '#ff8c2a'];

/** How far a unit sees (blocks), and a building. */
export const SIGHT = { unit: 24, building: 30, air: 34 };
/** How many of each side's hero may live at once is `limit`; a neutral guard's leash and a relic's capture radius (blocks) and income (steel a second). */
export const RELIC = { radius: 6, income: 1.6, hold: 8 };

/**
 * The doctrines: what a commander chooses in the lobby, as a modern power chooses its way of war.
 * Each gives a passive edge and one special power (a call on the map, recharging).
 */
export type DoctrineId = 'industrial' | 'armored' | 'intel';
export type PowerKind = 'airstrike' | 'reinforce' | 'satellite';
export interface Doctrine {
  name: string;
  blurb: string;
  passive: string;
  power: { kind: PowerKind; name: string; blurb: string; cooldown: number; /** It needs a spot on the map. */ aimed: boolean; /** When it's first ready (match seconds). */ first: number };
}
export const DOCTRINES: Record<DoctrineId, Doctrine> = {
  industrial: {
    name: 'Industrial',
    blurb: 'A war economy: faster gathering and faster production.',
    passive: 'Gathers 15% faster; trains and researches 12% faster',
    power: { kind: 'airstrike', name: 'Airstrike', blurb: 'Bombers flatten a patch of the map.', cooldown: 150, aimed: true, first: 480 },
  },
  armored: {
    name: 'Armored',
    blurb: 'Steel first: tougher, harder-hitting tanks.',
    passive: 'Tanks have 15% more health and hit 10% harder',
    power: { kind: 'reinforce', name: 'Reinforcements', blurb: 'Three tanks arrive at your HQ.', cooldown: 240, aimed: false, first: 480 },
  },
  intel: {
    name: 'Intelligence',
    blurb: 'See everything first: longer sight, cheaper infantry.',
    passive: 'Sees 40% further; infantry cost 25% less, and fire 15% faster',
    power: { kind: 'satellite', name: 'Satellite Scan', blurb: 'Reveal the whole map for fifteen seconds.', cooldown: 110, aimed: false, first: 180 },
  },
};
export const DOCTRINE_IDS = Object.keys(DOCTRINES) as DoctrineId[];
