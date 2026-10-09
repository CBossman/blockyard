import type { GameContext, Pickup, Player, Vec3 } from '@platform';
import type { ConsumableItem, ThrowableItem } from '@platform/items';
import { guns, type Guns } from '@platform/kits';
import { fighterOf } from './match';
import { RARITIES } from './rarity';
import { FAMILIES, FAMILY_IDS, GUNS, gunId, parseGun, type FamilyId } from './weapons';
import type { LootSpot } from './island/kit';

/**
 * Everything you can pick up. Guns come in five rarities (`weapons.ts`), and the rest is what keeps
 * you alive: bandages and med kits for health, a shield potion for the shield on top of it, frag
 * cubes to throw, and ammo for what you carry.
 *
 * A chest holds a gun and something useful, better the better the place it stands in (its `tier`,
 * 0..4). Floor loot is one item, rolled the same way.
 */

export const MAX_HEALTH = 100;
export const MAX_SHIELD = 100;
/** A bandage heals this much, but not past this health: a med kit is for the rest. */
export const BANDAGE = { heal: 15, to: 75 };
export const SHIELD_POTION = 50;

export interface Drop {
  item: string;
  count: number;
  /** The colour of its beam. */
  beam: string;
}

export const BEAMS = { frag: '#ff7a3a', bandage: '#f2f2f2', medkit: '#ff4a5a', shield: '#4aa8ff', ammo: '#ffd23a' };

/** What each tier of place puts in its chests: the weight of each rarity. */
const RARITY_BY_TIER: number[][] = [
  [60, 30, 10, 0, 0],
  [35, 35, 22, 8, 0],
  [15, 30, 33, 18, 4],
  [5, 15, 32, 33, 15],
  [0, 5, 20, 40, 35],
];

/** How often each family turns up (the Longshot only in the better places). */
const FAMILY_WEIGHT = (f: FamilyId, tier: number): number => ({ plinker: 16, zipper: 22, trailblazer: 28, boomstick: 20, longshot: tier >= 2 ? 14 : 5 })[f];

/** What else a chest has, as weights: [item, share, fewest, most]. */
const EXTRAS: [string, number, number, number][] = [
  ['bandage', 30, 2, 5],
  ['shield', 24, 1, 2],
  ['frag', 18, 1, 3],
  ['medkit', 10, 1, 1],
  ['ammo', 18, 1, 1],
];

function weighted<T>(game: GameContext, list: readonly T[], weight: (t: T, i: number) => number): T {
  const total = list.reduce((s, t, i) => s + weight(t, i), 0);
  let r = game.rng.next() * total;
  for (let i = 0; i < list.length; i++) if ((r -= weight(list[i], i)) < 0) return list[i];
  return list[list.length - 1];
}

/** A gun for a place of this tier. */
export function rollGun(game: GameContext, tier: number): Drop {
  const t = Math.max(0, Math.min(RARITY_BY_TIER.length - 1, Math.round(tier)));
  const rarity = weighted(game, RARITIES, (_, i) => RARITY_BY_TIER[t][i]);
  const family = weighted(game, FAMILY_IDS, (f) => FAMILY_WEIGHT(f, t));
  return { item: gunId(family, RARITIES.indexOf(rarity)), count: 1, beam: rarity.color };
}

/** Something to keep you going. */
export function rollExtra(game: GameContext): Drop {
  const [item, , lo, hi] = weighted(game, EXTRAS, (e) => e[1]);
  return { item, count: game.rng.int(lo, hi), beam: BEAMS[item as keyof typeof BEAMS] };
}

/** What's in a chest of this tier. */
export function rollChest(game: GameContext, tier: number): Drop[] {
  const drops = [rollGun(game, tier), rollExtra(game)];
  if (tier >= 2 || game.rng.chance(0.35)) drops.push(rollExtra(game));
  return drops;
}

/** One thing lying on the floor. */
export function rollFloor(game: GameContext, tier: number): Drop {
  return game.rng.chance(0.55) ? rollGun(game, tier) : rollExtra(game);
}

/** Every pickup lying about, so bots can look for them (dead ones are dropped from the list as they're found). */
export const lying: Pickup[] = [];

/** Put drops on the ground at `at`, popping out of a chest (or falling from a body). */
export function spawn(game: GameContext, drops: Drop[], at: Vec3, opts: { burst?: number; from?: Player; despawn?: number } = {}) {
  drops.forEach((d, i) => {
    const a = (i / Math.max(1, drops.length)) * Math.PI * 2 + game.rng.range(-0.4, 0.4);
    const speed = opts.burst ?? 2.2;
    const p = game.items.spawnPickup(d.item, at, {
      count: d.count,
      beam: d.beam,
      velocity: { x: Math.cos(a) * speed, y: 4 + game.rng.range(0, 1.5), z: Math.sin(a) * speed },
      delay: 0.6,
      from: opts.from,
      despawn: opts.despawn ?? 1e9,
    });
    lying.push(p);
  });
  // (Keep the list from growing: the ones that have gone are dropped now and then.)
  if (lying.length > 160) lying.splice(0, lying.length, ...lying.filter((p) => p.alive));
}

/** Everything a fighter carries, dropped where they fell (their guns with their beams, the rest too). */
export function dropLoadout(game: GameContext, p: Player) {
  const drops: Drop[] = [];
  for (const s of p.inventory.slots) {
    if (!s) continue;
    const g = parseGun(s.item);
    drops.push({ item: s.item, count: s.count, beam: g ? RARITIES[g.tier].color : (BEAMS[s.item as keyof typeof BEAMS] ?? '#ffffff') });
  }
  p.inventory.clear();
  spawn(game, drops, { x: p.position.x, y: p.position.y + 0.8, z: p.position.z }, { burst: 3 });
}

let gunKit: Guns | null = null;
const gunsOf = (game: GameContext): Guns | null => (gunKit ??= guns.of(game));

/** The guns someone carries (slot and id). */
export function carried(p: Player): { slot: number; item: string; family: FamilyId; tier: number }[] {
  const out: { slot: number; item: string; family: FamilyId; tier: number }[] = [];
  p.inventory.slots.forEach((s, slot) => {
    const g = s && parseGun(s.item);
    if (s && g) out.push({ slot, item: s.item, ...g });
  });
  return out;
}

/** A gun's worth, to decide which to hold: its tier first, then its family's. */
const worth = (g: { family: FamilyId; tier: number }) => g.tier * 10 + FAMILIES[g.family].worth;

/**
 * The hotbar has a place for everything, so the keys always mean the same: 1 rifle, 2 shotgun,
 * 3 SMG, 4 sniper, 5 pistol, 6 bandages, 7 med kits, 8 shields, 9 frags. One gun of each family:
 * a better one takes its place.
 */
export const SLOT: Record<string, number> = { trailblazer: 0, boomstick: 1, zipper: 2, longshot: 3, plinker: 4, bandage: 5, medkit: 6, shield: 7, frag: 8 };
const STACK: Record<string, number> = { bandage: 10, medkit: 3, shield: 4, frag: 6 };

/** Where an item goes in the hotbar. */
export const slotOf = (item: string): number => SLOT[parseGun(item)?.family ?? item] ?? -1;

/** Put an item straight into its place (a starting gun, a cheat's kit), replacing what's there. */
export function equip(p: Player, item: string, count = 1) {
  const slot = slotOf(item);
  if (slot >= 0) p.inventory.set(slot, { item, count });
  else p.inventory.give(item, count);
}

/**
 * Someone walks over a gun: it goes in its family's place. A better one than they have there takes
 * it (the old one drops where they stand), the same tier tops up their ammo, a worse one stays where
 * it lies. In hand, if it's better than what they're holding. Returns whether it was taken.
 */
function takeGun(game: GameContext, p: Player, item: string): boolean {
  const incoming = parseGun(item)!;
  const slot = SLOT[incoming.family];
  const cur = p.inventory.slots[slot];
  const had = cur ? parseGun(cur.item) : null;
  if (cur && had) {
    if (incoming.tier < had.tier) return false;
    if (incoming.tier === had.tier) {
      const k = gunsOf(game);
      const a = k?.ammo(p, cur.item);
      const full = GUNS[cur.item].reserve ?? 0;
      if (!k || !a || a.reserve >= full) return false;
      k.setAmmo(p, cur.item, { magazine: a.magazine, reserve: full });
      return true;
    }
    spawn(game, [{ item: cur.item, count: 1, beam: RARITIES[had.tier].color }], { x: p.position.x, y: p.position.y + 0.8, z: p.position.z }, { burst: 1, from: p });
  }
  const held = p.inventory.held;
  const holding = held ? parseGun(held.item) : null;
  p.inventory.set(slot, { item, count: 1 });
  if (!holding || p.inventory.selected === slot || worth(incoming) > worth(holding)) p.inventory.select(slot);
  return true;
}

/** Healing, shields and frags into their places, up to a stack each: how many didn't fit. */
function stow(p: Player, item: string, count: number): number {
  const slot = SLOT[item];
  const cur = p.inventory.slots[slot];
  // (Its place taken by something else: wherever there's room.)
  if (cur && cur.item !== item) return p.inventory.give(item, count);
  const have = cur?.count ?? 0;
  const n = Math.max(0, Math.min(STACK[item] - have, count));
  if (n > 0) p.inventory.set(slot, { item, count: have + n });
  return count - n;
}

/** Left (or put back) where it lies: it's not pulled back to them until they've stepped away from it. */
function leave(game: GameContext, p: Player, item: string, count: number, beam: string) {
  lying.push(game.items.spawnPickup(item, { x: p.position.x, y: p.position.y + 0.8, z: p.position.z }, { count, from: p, beam, velocity: { x: 0, y: 3, z: 0 }, despawn: 1e9 }));
}

/** Walking over healing, a shield or frags: into its place, the rest left lying. */
function collect(game: GameContext, p: Player, item: string, count: number, name: string): boolean {
  const left = stow(p, item, count);
  if (left > 0) leave(game, p, item, left, BEAMS[item as keyof typeof BEAMS]);
  if (left < count) {
    game.audio.play('pickup', { at: p.position, volume: 0.6 });
    p.hud.toast(`+${count - left} ${name}`);
  }
  return true;
}

/** Define every item the game has. */
export function defineItems(game: GameContext) {
  for (const [id, gun] of Object.entries(GUNS)) {
    game.items.define(id, {
      ...gun,
      onPickup(g, _n, p) {
        if (takeGun(g, p, id)) {
          g.audio.play('pickup', { at: p.position, volume: 0.6 });
          p.hud.toast(`+${gun.name}`);
        } else leave(g, p, id, 1, RARITIES[parseGun(id)!.tier].color);
        return true;
      },
    });
  }

  game.items.define('bandage', {
    kind: 'consumable',
    name: 'Bandage',
    onPickup: (g, n, p) => collect(g, p, 'bandage', n, 'Bandage'),
    icon: 'heart',
    stack: 10,
    useTime: 3.2,
    canUse: (_g, p) => p.health < BANDAGE.to,
    use: (_g, p) => ((p.health = Math.min(BANDAGE.to, p.health + BANDAGE.heal)), true),
  } satisfies ConsumableItem);

  game.items.define('medkit', {
    kind: 'consumable',
    name: 'Med Kit',
    onPickup: (g, n, p) => collect(g, p, 'medkit', n, 'Med Kit'),
    icon: 'health_potion',
    stack: 3,
    useTime: 6.5,
    canUse: (_g, p) => p.health < MAX_HEALTH,
    use: (_g, p) => ((p.health = MAX_HEALTH), true),
  } satisfies ConsumableItem);

  game.items.define('shield', {
    kind: 'consumable',
    name: 'Shield Potion',
    onPickup: (g, n, p) => collect(g, p, 'shield', n, 'Shield Potion'),
    icon: 'health_potion',
    stack: 4,
    useTime: 4,
    canUse: (_g, p) => (fighterOf(p)?.shield ?? 0) < MAX_SHIELD,
    use: (_g, p) => {
      const f = fighterOf(p);
      if (!f) return false;
      f.shield = Math.min(MAX_SHIELD, f.shield + SHIELD_POTION);
      return true;
    },
  } satisfies ConsumableItem);

  game.items.define('frag', {
    kind: 'throwable',
    name: 'Frag Cube',
    onPickup: (g, n, p) => collect(g, p, 'frag', n, 'Frag Cube'),
    icon: 'heart',
    stack: 6,
    key: 'KeyG',
    fuse: 3,
    cook: true,
    speed: 20,
    lift: 8,
    physics: { gravity: 24, bounce: 0.25, friction: 0.5, radius: 0.12 },
    blast: { radius: 4.6, damage: [95, 10], knockback: 1.1, size: 1.5 },
    cooldown: 0.9,
  } satisfies ThrowableItem);

  // Ammo: a box that tops up the spare rounds of every gun they carry.
  game.items.define('ammo', {
    kind: 'misc',
    name: 'Ammo Box',
    icon: 'arrow',
    onPickup(g, _n, p) {
      const k = gunsOf(g);
      let topped = false;
      for (const c of carried(p)) {
        const a = k?.ammo(p, c.item);
        const full = GUNS[c.item].reserve ?? 0;
        if (k && a && a.reserve < full) {
          k.setAmmo(p, c.item, { magazine: a.magazine, reserve: full });
          topped = true;
        }
      }
      if (!topped) {
        // Nothing to top up: it stays.
        leave(g, p, 'ammo', 1, BEAMS.ammo);
        return true;
      }
      g.audio.play('pickup', { at: p.position, volume: 0.6 });
      p.hud.toast('Ammo');
      return true;
    },
  });
}

/** Where a chest's loot comes out: above it. */
export const above = (s: LootSpot): Vec3 => ({ x: s.x + 0.5, y: s.y + 1.1, z: s.z + 0.5 });
