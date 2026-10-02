import type { Pilot } from '../../src/platform/host/headless';
import { ARMOR, armorTier, purchase } from '../../src/games/arena/run/shop';
import { gold } from '../../src/games/arena/run/gold';
import { WARES } from '../../src/games/arena/items/catalog';
import { progressOf } from '../../src/games/arena/run/progression';
import { check, launch, lastScreen } from './_harness';

/**
 * A bot plays the Arena's whole run, twenty waves and four bosses: it walks at the nearest monster
 * (or reward), attacks, hops over obstacles and holds its best weapon, and between waves it spends
 * its gold at the merchant's (armour first, then the best blade on sale, a potion). It gets extra
 * health, and monsters hanging back (or holding out a long time) take chip damage so the run doesn't
 * depend on chasing archers or getting round a pillar.
 */
export default function arena() {
  const t0 = performance.now();
  const h = launch('arena', { seed: 1337 });
  const game = h.ctx;
  const me = game.player;
  me.maxHealth = 800;
  me.health = 800;
  game.clock.every(0.7, () => {
    for (const e of game.entities.all()) if (!e.data.scenery && e.type !== 'warden' && (e.distanceTo(me) > 4 || e.age > 20)) e.damage(4, { source: me, knockback: 0 });
  });

  // Shopping, between waves: the next armour, the best blade it can afford, potions.
  const bought: string[] = [];
  const shop = () => {
    const buy = (id: string) => purchase(game, me, id) && bought.push(id);
    const tier = armorTier(me);
    if (tier < ARMOR.length && gold(me) >= ARMOR[tier].price) buy(`armor:${tier + 1}`);
    const blades = WARES.filter((w) => w.kind === 'weapon' && game.items.get(w.item)?.kind === 'melee' && !me.inventory.count(w.item)).sort((a, b) => b.price - a.price);
    for (const w of blades) if (gold(me) >= w.price && buy(w.item)) break;
    if (me.inventory.count('health_potion') < 2 && gold(me) >= 40) buy('health_potion');
  };
  let shopped = -1;

  let hop = 0;
  let think = 0;
  let last: ReturnType<Pilot> = {};
  const pilot: Pilot = () => {
    // Decide every 80 ms, like a person's reactions; hold the controls in between.
    if ((think += 1 / 60) < 0.08) return { ...last, clicked: 0, pressed: [] };
    think = 0;
    const wave = h.find('hud', 'banner').filter((c) => /cleared/.test(String(c.args[0]))).length;
    if (wave !== shopped) {
      shopped = wave;
      shop();
    }
    const eye = me.eye;
    let target: { x: number; y: number; z: number } | null = null;
    let best = Infinity;
    let height = 1.3;
    for (const e of game.entities.all()) {
      if (e.data.scenery) continue;
      const d = Math.hypot(e.position.x - eye.x, e.position.z - eye.z);
      if (d < best) {
        best = d;
        target = e.position;
        height = e.type === 'spider' ? 0.5 : e.type === 'warden' ? 2.6 : e.type === 'brute' ? 1.6 : 1.3;
      }
    }
    const fighting = !!target;
    if (!target) {
      for (const p of h.sim.items.frame()) {
        const d = Math.hypot(p.x - eye.x, p.z - eye.z);
        if (d < best) {
          best = d;
          target = { x: p.x, y: p.y - 1.3, z: p.z };
          height = 0.5;
        }
      }
    }
    if (!target) return (last = {});
    const dx = target.x - eye.x;
    const dy = target.y + height - eye.y;
    const dz = target.z - eye.z;
    const down = best > 2.4 ? ['KeyW'] : [];
    if (down.length && Math.hypot(me.velocity.x, me.velocity.z) < 0.5) hop = 2;
    if (hop > 0 && hop--) down.push('Space');
    // Hold the best melee weapon.
    const inv = me.inventory;
    let slot = inv.selected;
    let rank = -1;
    inv.slots.forEach((s, i) => {
      const d = s && game.items.get(s.item);
      if (d && d.kind === 'melee' && (d.rank ?? 0) > rank) {
        rank = d.rank ?? 0;
        slot = i;
      }
    });
    if (slot !== inv.selected) inv.select(slot);
    last = { down, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    return { ...last, clicked: fighting ? 1 : 0 };
  };

  const simulated = h.run(3600, { pilot, until: () => lastScreen(h) !== undefined });
  const result = lastScreen(h);
  const wall = (performance.now() - t0) / 1000;
  console.log(`  ${result ?? 'no result'} after ${simulated.toFixed(0)} s of game time (${(simulated / 60).toFixed(1)} min), ${wall.toFixed(1)} s wall clock (${(simulated / wall).toFixed(0)}× real time)`);
  check(result === 'Victory!', `expected Victory!, got ${result ?? 'nothing'} (${h.find('hud', 'objective').at(-1)?.args[0]}; ${me.inventory.held?.item} ${me.inventory.slots.map((x) => x?.item).join('/')} | ${game.entities.all().map((e) => `${e.type} ${e.health}/${e.maxHealth} ${JSON.stringify(e.data)} at ${e.position.x.toFixed(0)},${e.position.y.toFixed(0)},${e.position.z.toFixed(0)}`).join(', ')}; me at ${JSON.stringify(me.position)})`);
  // Achievements along the way: the first kill, the first wave, the win, and (never down) the win unbroken.
  const missing = ['first_blood', 'first_wave', 'champion', 'unbroken'].filter((a) => !me.achieved(a));
  check(!missing.length, `achievements not earned: ${missing.join(', ')}`);
  const popped = h.find('hud', 'achievement').map((c) => (c.args[0] as { title: string }).title);
  check(popped.includes('Champion') && popped.includes('Warmed Up'), `achievements popped up: ${popped.join(', ')}`);
  const stats = new Map((h.find('hud', 'screen').at(-1)?.args[1] as { stats: [string, string][] }).stats);
  const slain = stats.get('Monsters slain')?.split(' ')[0];
  check(String(me.store.get<number>('kills')) === slain, `kills kept all-time: ${me.store.get('kills')} of ${slain} (${stats.get('Monsters slain')})`);
  // The economy: gold earned and spent at the merchant's, the best armour by the end.
  check(bought.length >= 8 && armorTier(me) === ARMOR.length, `shopping: ${bought.join(', ')} (armour tier ${armorTier(me)})`);
  // Levels: XP earned for the run, the best wave kept.
  const xp = progressOf(me);
  check(xp.level >= 4 && stats.get('Best wave here')?.startsWith('20'), `progression: level ${xp.level} (${xp.total} XP), best ${stats.get('Best wave here')}`);
  console.log(`  bought: ${bought.join(', ')}`);
  console.log(`  ${[...stats].map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
  console.log(`  achievements: ${popped.join(', ')}`);
}
