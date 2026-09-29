import { math, type Entity, type GameContext, type IconRef, type MenuHandle, type Player, type Vec3 } from '@platform';

/**
 * Blessings: after each wave cleared, every fighter picks one of three, and keeps it for the rest
 * of the fight, so no two runs play alike. They're all written here against the damage and death
 * events; the server calls `offer` when a wave is won, `settle` when the next begins (anyone who
 * didn't choose is given one of theirs), and `wave` to refresh what lasts a wave.
 */
interface Blessing {
  name: string;
  text: string;
  icon: IconRef;
  /** What it does the moment it's chosen (the lasting ones are in the listeners below). */
  apply?(game: GameContext, p: Player): void;
}

export const BLESSINGS = {
  vampire: { name: 'Vampiric', text: 'Every monster you slay heals you a heart', icon: 'heart' },
  berserk: { name: 'Berserker', text: 'Your blades hit 40% harder', icon: 'iron_sword' },
  hawkeye: {
    name: 'Hawkeye',
    text: 'Arrows hit 60% harder, and a bow kill gives two back',
    icon: 'bow',
    apply: (_g, p) => void p.inventory.give('arrow', 12),
  },
  fleet: { name: 'Fleet-footed', text: 'Run 20% faster, and roll twice as often', icon: { block: 'ice' }, apply: (_g, p) => boost(p) },
  ironskin: { name: 'Iron Skin', text: 'Take a quarter less damage', icon: { block: 'iron_block' }, apply: (_g, p) => void (p.armor += 6) },
  stout: {
    name: 'Stout Heart',
    text: 'Three more hearts, and fully healed',
    icon: 'health_potion',
    apply: (_g, p) => {
      p.maxHealth += 6;
      p.health = p.maxHealth;
    },
  },
  thorns: { name: 'Thorns', text: 'Whatever strikes you in melee takes 4 damage', icon: { block: 'cactus' } },
  volatile: { name: 'Volatile', text: 'Monsters you slay burst, hurting those around them', icon: { block: 'redstone_ore' } },
  secondwind: { name: 'Second Wind', text: 'Once a wave, a killing blow leaves you on two hearts instead', icon: { block: 'glowstone' } },
  storm: { name: 'Stormcaller', text: 'Every fourth blade hit calls down lightning', icon: { block: 'neon_yellow' } },
  frost: { name: 'Frostbite', text: 'Your blades chill monsters to half speed', icon: { block: 'snow_block' } },
  executioner: { name: 'Executioner', text: 'Double damage to monsters under a third of their health', icon: { item: 'battle_axe' } },
  bombardier: {
    name: 'Bombardier',
    text: 'Three bombs now, and two more every wave',
    icon: { item: 'bomb' },
    apply: (_g, p) => void p.inventory.give('bomb', 3),
  },
} satisfies Record<string, Blessing>;

export type BlessingId = keyof typeof BLESSINGS;
const ALL = Object.keys(BLESSINGS) as BlessingId[];

/** The weapons that are blades (the blessings for blades count them). */
const BLADES = new Set(['wooden_sword', 'stone_sword', 'iron_sword', 'diamond_sword', 'pike', 'battle_axe']);

/** Each fighter's blessings, the three they're offered (and its menu), and their counts. */
const owned = new Map<string, Set<BlessingId>>();
const offers = new Map<string, Offer>();
const bladeHits = new Map<string, number>();
const windUsed = new Set<string>();
/** Monsters chilled (by id): the speed to go back to, and when. */
const chilled = new Map<number, { until: number; speed: number }>();

export const has = (p: Player, id: BlessingId) => owned.get(p.id)?.has(id) ?? false;
export const blessingsOf = (p: Player): BlessingId[] => [...(owned.get(p.id) ?? [])];

/** Fleet-footed's speed and quick rolls (roll's state: `abilities.ts`). */
function boost(p: Player) {
  p.speed = 1.2;
  const roll = p.abilities.roll as { quick?: boolean } | undefined;
  if (roll) roll.quick = true;
}

/** A fresh fight: nobody blessed; their bodies back to plain. */
export function resetBlessings() {
  const open = [...offers.values()];
  offers.clear();
  for (const o of open) o.menu?.close();
  owned.clear();
  bladeHits.clear();
  windUsed.clear();
  chilled.clear();
}

/** What a fighter's body is without blessings (their armour, health, speed), for arming them afresh. */
export function plainBody(p: Player) {
  owned.delete(p.id);
  const o = offers.get(p.id);
  offers.delete(p.id);
  o?.menu?.close();
  for (const id of ALL) p.hud.stat(`bless:${id}`, 'Blessing', null);
  p.armor = 0;
  p.maxHealth = 20;
  p.health = 20;
  p.speed = 1;
  const roll = p.abilities.roll as { quick?: boolean } | undefined;
  if (roll) roll.quick = false;
}

/** Give them a blessing (chosen from their three, or by the arena for them). */
export function grant(game: GameContext, p: Player, id: BlessingId, chosen: boolean) {
  const set = owned.get(p.id) ?? new Set();
  owned.set(p.id, set);
  if (set.has(id)) return;
  set.add(id);
  const b: Blessing = BLESSINGS[id];
  b.apply?.(game, p);
  // (Off the offers first, so its menu closing isn't taken for putting the choice off.)
  const o = offers.get(p.id);
  offers.delete(p.id);
  o?.menu?.close();
  p.hud.banner(b.name, b.text, { duration: 2.4, color: '#ffd36b' });
  p.audio.play('heal', { pitch: 1.3 });
  if (!chosen) p.hud.toast(`The arena chose for you: ${b.name}`);
  const q = p.position;
  game.fx.burst({ x: q.x, y: q.y + 1, z: q.z }, { color: '#ffd36b', count: 30, speed: 3, gravity: -2, glow: 1 });
  // One line each on their HUD, under the kills and the time.
  p.hud.stat(`bless:${id}`, 'Blessing', b.name);
}

/** The key that brings the blessings back up, closed without choosing. */
export const BLESS_KEY = 'KeyB';

/** Three blessings they don't have yet to choose from (in a menu, until the next wave). */
export function offer(game: GameContext, p: Player) {
  const mine = owned.get(p.id) ?? new Set();
  const pool = ALL.filter((id) => !mine.has(id));
  const choices: BlessingId[] = [];
  while (choices.length < 3 && pool.length) choices.push(pool.splice(Math.floor(game.rng.next() * pool.length), 1)[0]);
  if (!choices.length) return;
  const o: Offer = { choices, menu: null };
  offers.set(p.id, o);
  if (!p.bot) show(game, p, o);
}

interface Offer {
  choices: BlessingId[];
  menu: MenuHandle | null;
}

function show(game: GameContext, p: Player, o: Offer) {
  o.menu = p.hud.menu({
    title: 'Choose a blessing',
    subtitle: 'Yours for the rest of the fight',
    sections: [
      {
        entries: o.choices.map((id) => {
          const b: Blessing = BLESSINGS[id];
          return { icon: b.icon, label: b.name, note: b.text, onSelect: () => grant(game, p, id, true) };
        }),
      },
    ],
    // Closed without choosing: B brings it back, and when the wave begins one is chosen for them.
    onClose: () => {
      if (offers.get(p.id) !== o) return;
      o.menu = null;
      p.hud.toast('Press B to choose your blessing');
    },
  });
}

/** Between waves: B brings back the blessings of anyone who closed them without choosing. */
export function reopen(game: GameContext) {
  for (const p of game.players) {
    const o = offers.get(p.id);
    if (o && !o.menu && !p.bot && p.input.pressed(BLESS_KEY)) show(game, p, o);
  }
}

/** The next wave begins: anyone who didn't choose is given one of the three. */
export function settle(game: GameContext) {
  for (const p of game.players) {
    const o = offers.get(p.id);
    if (o) grant(game, p, o.choices[Math.floor(game.rng.next() * o.choices.length)], false);
  }
}

/** A new wave: Second Wind's back, and the Bombardier's bombs. */
export function wave(game: GameContext) {
  windUsed.clear();
  for (const p of game.players) if (has(p, 'bombardier')) p.inventory.give('bomb', 2);
}

const FWD = new math.Vector3(0, 0, -1);
const DOWN = new math.Vector3(0, -1, 0);

/** Lightning on a monster: a bolt from the sky, and whatever's about it hurt too. */
function lightning(game: GameContext, by: Player, on: Entity) {
  const q = on.position;
  const bolt = game.props.bolt({ color: '#cfe9ff', length: 18, width: 0.45, intensity: 7, flicker: 0.6 });
  bolt.position.set(q.x, q.y + 18, q.z);
  bolt.quaternion.setFromUnitVectors(FWD, DOWN);
  game.clock.after(0.22, () => bolt.remove());
  game.fx.burst({ x: q.x, y: q.y + 0.3, z: q.z }, { color: '#cfe9ff', count: 30, speed: 5, glow: 1, life: 0.4 });
  game.fx.shockwave({ x: q.x, y: q.y + 0.1, z: q.z }, 3, '#9fd4ff');
  game.audio.play('thunder', { at: q });
  for (const e of game.entities.near(q, 3)) {
    if (!e.alive) continue;
    e.damage(e === on ? 8 : 4, { source: by, knockback: 0.6, weapon: 'lightning' });
  }
}

/** A slain monster bursting (Volatile). */
function burst(game: GameContext, by: Player, at: Vec3) {
  game.fx.burst({ x: at.x, y: at.y + 1, z: at.z }, { color: '#ff7a3a', count: 26, speed: 4, glow: 1, life: 0.5 });
  game.fx.shockwave({ x: at.x, y: at.y + 0.2, z: at.z }, 3, '#ff7a3a');
  game.audio.play('pop', { at });
  for (const e of game.entities.near(at, 3)) if (e.alive) e.damage(6, { source: by, knockback: 1.2, weapon: 'volatile', cause: 'explosion' });
}

/** The blessings' lasting effects, on the game's damage and death events. */
export function listen(game: GameContext) {
  game.events.on('damage', (hit) => {
    const { target, source } = hit;
    // A fighter hitting a monster.
    if (target.kind === 'entity' && source && source !== 'world' && source.kind === 'player') {
      const p = source;
      const blade = !!hit.weapon && BLADES.has(hit.weapon) && hit.cause === 'melee';
      if (blade && has(p, 'berserk')) hit.amount *= 1.4;
      if (hit.weapon === 'bow' && has(p, 'hawkeye')) hit.amount *= 1.6;
      if (has(p, 'executioner') && target.health < target.maxHealth / 3) hit.amount *= 2;
      if (blade && has(p, 'frost') && target.type !== 'warden') chill(game, target);
      if (blade && has(p, 'storm')) {
        const n = (bladeHits.get(p.id) ?? 0) + 1;
        bladeHits.set(p.id, n % 4);
        if (n % 4 === 0) game.clock.after(0.05, () => target.alive && lightning(game, p, target));
      }
    }
    // A monster hitting a fighter.
    if (target.kind === 'player') {
      const p = target;
      if (source && source !== 'world' && source.kind === 'entity' && hit.cause === 'melee' && has(p, 'thorns') && source.alive) {
        const s = source;
        game.clock.after(0, () => s.alive && s.damage(4, { source: p, knockback: 0.4, weapon: 'thorns' }));
      }
      // Armour takes its share after this: a blow that would still be the last.
      if (has(p, 'secondwind') && !windUsed.has(p.id) && hit.amount * (1 - 0.04 * p.armor) >= p.health) {
        windUsed.add(p.id);
        hit.cancel();
        p.health = 4;
        p.protect(1.5);
        p.hud.banner('SECOND WIND', undefined, { duration: 1.4, color: '#ffe38a' });
        p.audio.play('heal', { pitch: 0.8 });
        const q = p.position;
        game.fx.shockwave({ x: q.x, y: q.y + 0.1, z: q.z }, 4, '#ffe38a');
      }
    }
  });

  game.events.on('entityDeath', ({ entity, killer, weapon }) => {
    if (!killer || killer === 'world' || killer.kind !== 'player') return;
    const p = killer;
    if (has(p, 'vampire') && p.alive) p.heal(2);
    if (weapon === 'bow' && has(p, 'hawkeye')) p.inventory.give('arrow', 2);
    if (has(p, 'volatile') && weapon !== 'volatile') {
      const at = { ...entity.position };
      game.clock.after(0.15, () => burst(game, p, at));
    }
  });
}

/** Frostbite: half speed for two seconds (again from the start if hit again), tinted icy. */
function chill(game: GameContext, e: Entity) {
  const was = chilled.get(e.id);
  const speed = was?.speed ?? ((e.data.speed as number | undefined) ?? 1);
  chilled.set(e.id, { until: game.clock.now + 2, speed });
  e.setSpeed(speed * 0.5);
  e.glow('#9fe6ff');
  game.clock.after(2.05, () => {
    const c = chilled.get(e.id);
    if (!c || game.clock.now < c.until) return;
    chilled.delete(e.id);
    if (!e.alive) return;
    e.setSpeed(c.speed);
    e.glow(null);
  });
}
