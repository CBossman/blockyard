import { math, Models, type CharacterLook, type Entity, type GameContext, type IconRef, type MenuEntry, type MenuHandle, type Player, type Prop, type PropModel } from '@platform';
import { RUN_MODELS } from '../models/run';
import { WARES, type Ware } from '../items/catalog';
import { bus } from './bus';
import { FEATHER } from './downed';
import { addGold, gold, spend } from './gold';
import { deliver, forgeNext, forgeWeapon, RARITY, rarityOf } from './loot';
import { map, runs, state } from './state';
import { addUsable } from './use';
import { ARMOR_ICON } from './models';

/**
 * The shop: between waves a merchant sets up his stall at the map's `shop` spot, and E at it opens
 * his wares (a menu on that fighter's screen, paid from their own purse, `gold.ts`): the armory's
 * catalog (`items/catalog.ts`, each on sale from its wave), armour by the tier, a Phoenix Feather,
 * and the forge (a weapon carried, to its next rarity). He packs up when the next wave begins.
 */

/** The run's own armour, tier by tier, each replacing the last (points: 4% of every blow each), while the catalog sells none. */
export const ARMOR = [
  { name: 'Leather Armour', points: 4, price: 90 },
  { name: 'Bronze Cuirass', points: 8, price: 200 },
  { name: 'Iron Lorica', points: 12, price: 360 },
  { name: "Champion's Plate", points: 16, price: 560 },
];
export const FEATHER_PRICE = 350;
/** Big Spender: this much spent in one run. */
const BIG_SPENDER = 1000;
/** Midas: this much held at once. */
const MIDAS = 1000;

const MERCHANT: CharacterLook = { build: 'heavy', skin: '#c28a5c', hair: 'long', hairColor: '#2a1c14', facialHair: 'beard', eyes: '#3a2a1c', top: 'tunic', topColor: '#7a2f8a', accent: '#e8b923', bottom: 'trousers', bottomColor: '#3a2a4a', shoes: 'boots', shoeColor: '#2a1c14', hat: 'fedora' };

/** Each fighter's armour tier bought this run (0: none), by player id. */
const tiers = new Map<string, number>();
/** Each fighter's open shop, and what it showed (only changes go out). */
const open = new Map<string, { menu: MenuHandle; key: string; subtitle: string }>();
let merchant: Entity | null = null;
let stall: { model: PropModel; prop: Prop | null } | null = null;
/** How far behind his counter's front the merchant stands (blocks). */
const BEHIND = 0.6;
const UP = new math.Vector3(0, 1, 0);

export const armorTier = (p: Player) => tiers.get(p.id) ?? 0;

interface Offer {
  icon: IconRef;
  label: string;
  note?: string;
  price: number;
  /** Already theirs (highlighted, not for sale again). */
  owned?: boolean;
  /** Not yet: why. */
  locked?: string;
  /** Hand it over: false if it couldn't be (a full hotbar). */
  buy(): boolean;
  /** What the bus is told was bought. */
  id: string;
}

/** Kinds of item that aren't weapons (what's left is: blades, bows, staves). */
const NOT_WEAPONS = new Set(['misc', 'consumable', 'throwable']);
const weaponsHeld = (game: GameContext, p: Player) =>
  p.inventory.slots.flatMap((s) => {
    const kind = s && game.items.get(s.item)?.kind;
    return s && kind && !NOT_WEAPONS.has(kind) ? [s.item] : [];
  });

/** Waves won so far: what's on sale. */
const cleared = () => (state.phase === 'fighting' ? state.wave - 1 : state.wave);

function give(p: Player, item: string, count: number): boolean {
  const left = p.inventory.give(item, count);
  return left < count;
}

function wareOffer(game: GameContext, p: Player, w: Ware): Offer {
  const def = game.items.get(w.item);
  const count = w.count ?? 1;
  const name = def?.name ?? w.item;
  const weapon = w.kind === 'weapon';
  return {
    id: w.item,
    icon: { item: w.item },
    label: count > 1 ? `${name} ×${count}` : name,
    note: weapon ? weaponNote(game, w.item) : undefined,
    price: w.price,
    owned: weapon && p.inventory.count(w.item) > 0,
    locked: (w.from ?? 0) > cleared() ? `After wave ${w.from}` : undefined,
    buy: () => deliver(game, p, w),
  };
}

/** A line about a weapon (damage, its kind), from its definition. */
function weaponNote(game: GameContext, item: string): string | undefined {
  const d = game.items.get(item) as { kind?: string; damage?: number | [number, number]; cooldown?: number } | undefined;
  if (!d) return undefined;
  const dmg = Array.isArray(d.damage) ? `${d.damage[0]}-${d.damage[1]}` : d.damage;
  if (d.kind === 'bow') return `Ranged · ${dmg} damage drawn · needs arrows`;
  return dmg !== undefined ? `${dmg} damage${d.cooldown ? ` · ${(1 / d.cooldown).toFixed(1)} swings a second` : ''}` : undefined;
}

/** The run's own armour, tier by tier, while the catalog sells none of its own. */
function armorOffer(p: Player): Offer {
  const tier = armorTier(p);
  const next = ARMOR[tier];
  if (!next) return { id: 'armor', icon: ARMOR_ICON, label: ARMOR[ARMOR.length - 1].name, note: 'The best armour there is', price: 0, owned: true, buy: () => false };
  return {
    id: `armor:${tier + 1}`,
    icon: ARMOR_ICON,
    label: next.name,
    note: `Blocks ${next.points * 4}% of every blow${tier ? ` (up from ${ARMOR[tier - 1].points * 4}%)` : ''} · for the run`,
    price: next.price,
    buy: () => {
      p.armor += next.points - (tier ? ARMOR[tier - 1].points : 0);
      tiers.set(p.id, tier + 1);
      return true;
    },
  };
}

function offers(game: GameContext, p: Player): { title: string; offers: Offer[] }[] {
  const wares = WARES.filter((w) => game.items.get(w.item) || w.kind === 'armor');
  const armor = wares.filter((w) => w.kind === 'armor');
  const feather: Offer = {
    id: FEATHER,
    icon: { item: FEATHER },
    label: 'Phoenix Feather',
    note: 'Carried, it takes a killing blow once and raises you in flame',
    price: FEATHER_PRICE,
    owned: p.inventory.count(FEATHER) > 0,
    buy: () => give(p, FEATHER, 1),
  };
  const forge = weaponsHeld(game, p).flatMap((item): Offer[] => {
    const f = forgeNext(item);
    if (!f) return [];
    return [
      {
        id: `forge:${item}`,
        icon: { item: f.item },
        label: `Forge ${game.items.get(item)?.name ?? item}`,
        note: `Into ${game.items.get(f.item)?.name ?? f.item} (${RARITY[rarityOf(f.item)].name})`,
        price: f.price,
        buy: () => forgeWeapon(game, p, item),
      },
    ];
  });
  return [
    { title: 'Weapons', offers: wares.filter((w) => w.kind === 'weapon').map((w) => wareOffer(game, p, w)) },
    { title: 'Armour', offers: armor.length ? armor.map((w) => wareOffer(game, p, w)) : [armorOffer(p)] },
    { title: 'Supplies', offers: [...wares.filter((w) => w.kind === 'consumable' || w.kind === 'ammo').map((w) => wareOffer(game, p, w)), feather] },
    ...(forge.length ? [{ title: 'The Forge', offers: forge }] : []),
  ].filter((s) => s.offers.length);
}

function contents(game: GameContext, p: Player) {
  const purse = gold(p);
  return {
    title: 'The Merchant',
    subtitle: subtitle(game, p),
    sections: offers(game, p).map(({ title, offers: list }) => ({
      title,
      entries: list.map(
        (o): MenuEntry => ({
          icon: o.icon,
          label: o.label,
          note: o.locked ?? o.note,
          detail: o.owned ? 'Owned' : o.locked ? 'Soon' : `${o.price} gold`,
          active: o.owned,
          disabled: !!o.owned || !!o.locked || purse < o.price,
          onSelect: () => purchase(game, p, o.id),
        }),
      ),
    })),
  };
}

function subtitle(game: GameContext, p: Player) {
  const t = Math.max(0, Math.ceil(state.nextWaveAt - game.clock.now));
  return `You have ${gold(p)} gold · the next wave in ${t}s`;
}

/** What the shop shows them now: their purse, what they carry, their armour (the menu's redrawn when it changes). */
const shownKey = (p: Player) => `${gold(p)}|${armorTier(p)}|${p.inventory.slots.map((s) => (s ? `${s.item}:${s.count}` : '')).join(',')}`;

/** Buy what they chose, by its id (checked again here: a screen can send anything). */
export function purchase(game: GameContext, p: Player, id: string): boolean {
  if (!shopOpen() || !p.alive) return false;
  const o = offers(game, p)
    .flatMap((s) => s.offers)
    .find((x) => x.id === id);
  if (!o || o.owned || o.locked) return false;
  if (gold(p) < o.price) {
    p.hud.toast('Not enough gold');
    return false;
  }
  if (!o.buy()) {
    p.hud.toast('Your hotbar is full');
    return false;
  }
  spend(game, p, o.price);
  p.audio.play('buy');
  p.hud.toast(`Bought ${o.label}`);
  bus.emit('bought', { player: p, item: o.id, price: o.price });
  if ((runs.get(p.id)?.spent ?? 0) >= BIG_SPENDER) p.achieve('big_spender');
  refresh(game, p);
  return true;
}

/** Open the shop on their screen. */
export function showShop(game: GameContext, p: Player) {
  if (p.bot || !shopOpen()) return;
  open.get(p.id)?.menu.close();
  const menu = p.hud.menu({ ...contents(game, p), onClose: () => open.get(p.id)?.menu === menu && open.delete(p.id) });
  open.set(p.id, { menu, key: shownKey(p), subtitle: subtitle(game, p) });
  game.audio.play('merchant', { at: merchant?.position, volume: 0.8 });
}

function refresh(game: GameContext, p: Player) {
  const o = open.get(p.id);
  if (!o) return;
  o.key = shownKey(p);
  const c = contents(game, p);
  o.subtitle = c.subtitle;
  o.menu.update(c);
}

/** The merchant's here (between waves). */
export const shopOpen = () => merchant !== null && merchant.alive;

/** The merchant sets up at the map's shop spot, facing the middle. */
export function openShop(game: GameContext) {
  if (shopOpen()) return;
  const m = map();
  const at = m.shop ?? m.center;
  // The stall faces the middle; he stands behind its counter.
  const dx = m.center.x - at.x;
  const dz = m.center.z - at.z;
  const d = Math.hypot(dx, dz) || 1;
  if (stall) {
    stall.prop = game.props.spawn(stall.model, { position: { x: at.x, y: at.y, z: at.z } });
    stall.prop.quaternion.setFromAxisAngle(UP, Math.atan2(dx, dz));
  }
  const yaw = Math.atan2(-dx, -dz);
  merchant = game.entities.spawn('merchant', { x: at.x - (dx / d) * BEHIND, y: at.y + 0.05, z: at.z - (dz / d) * BEHIND }, { yaw, data: { scenery: true } });
  game.fx.burst({ x: at.x, y: at.y + 1.5, z: at.z }, { color: '#ffd23a', count: 40, speed: 3, gravity: -1, glow: 1 });
  game.audio.play('merchant', { at });
  game.hud.marker('arena.shop', merchant, { label: 'Shop', color: '#ffd23a', shape: 'diamond', edge: true, offset: { x: 0, y: 2.9, z: 0 } });
}

/** The next wave's begun: he packs up (and every shop closes). */
export function closeShop(game: GameContext) {
  for (const o of open.values()) o.menu.close();
  open.clear();
  game.hud.marker('arena.shop', null);
  stall?.prop?.remove();
  if (stall) stall.prop = null;
  if (!merchant) return;
  const q = merchant.position;
  game.fx.burst({ x: q.x, y: q.y + 1, z: q.z }, { color: '#ffd23a', count: 20, speed: 2, gravity: -1 });
  merchant.remove();
  merchant = null;
}

export function shopSetup(game: GameContext) {
  game.entities.define('merchant', {
    name: 'The Merchant',
    model: Models.character(MERCHANT),
    hitbox: { width: 0.7, height: 1.95 },
    health: 100,
    speed: 0,
    invulnerable: true,
    knockbackResistance: 1,
    // He keeps an eye on whoever's nearest.
    ai: (self) => {
      self.stop();
      const p = self.nearestPlayer();
      if (p && self.distanceTo(p) < 10) self.lookAt(p);
    },
  });
  game.items.define(FEATHER, { kind: 'misc', name: 'Phoenix Feather', stack: 1 });
  stall = { model: game.props.gltf(RUN_MODELS.stall, { radius: 2 }), prop: null };
  addUsable({
    id: 'shop',
    at: () => (merchant?.alive ? { x: merchant.position.x, y: merchant.position.y + 1.2, z: merchant.position.z } : null),
    reach: 3.2,
    label: () => 'Shop',
    use: (g, p) => showShop(g, p),
  });
  // For trying the shop and the chest (development, or a server with cheats).
  game.commands.register('gold', {
    usage: '<amount>',
    help: 'Give yourself gold',
    cheat: true,
    run: ([n], g, p) => {
      const amount = Math.round(Number(n));
      if (!amount) throw new Error('How much?');
      addGold(g, p, amount, undefined, 'gift');
      return `${gold(p)} gold`;
    },
  });
  bus.on('gold', ({ player, total }) => {
    if (total >= MIDAS) player.achieve('midas');
  });
  game.events.on('playerLeave', ({ player }) => {
    open.delete(player.id);
    tiers.delete(player.id);
  });
}

/** Keep each open shop true to its fighter's purse and hotbar, and the time left. */
export function shopUpdate(game: GameContext) {
  for (const [id, o] of open) {
    const p = game.players.find((x) => x.id === id);
    if (!p || !o.menu.open) {
      open.delete(id);
      continue;
    }
    if (o.key !== shownKey(p)) refresh(game, p);
    const sub = subtitle(game, p);
    if (sub !== o.subtitle) {
      o.subtitle = sub;
      o.menu.update({ subtitle: sub });
    }
  }
}

/** A fresh fight: no merchant, nobody's armour bought. */
export function resetShop() {
  for (const o of open.values()) o.menu.close();
  open.clear();
  tiers.clear();
  merchant = null;
  // (The restart took his stall.)
  if (stall) stall.prop = null;
}
