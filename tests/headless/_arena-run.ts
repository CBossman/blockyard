import type { Bot, GameContext, Player } from '../../src/platform';
import type { Headless } from '../../src/platform/host/headless';
import { bus } from '../../src/games/arena/run/bus';
import { addGold, gold } from '../../src/games/arena/run/gold';
import { GOLD_PER_COST, waveBonus } from '../../src/games/arena/run/coins';
import { ARMOR, armorTier, FEATHER_PRICE, purchase, shopOpen } from '../../src/games/arena/run/shop';
import { PRICE, ROLL_TIME, rollChest } from '../../src/games/arena/run/chest';
import { BLEED, FEATHER, isDowned, REVIVE } from '../../src/games/arena/run/downed';
import { hypeValue } from '../../src/games/arena/run/hype';
import { choose, classOf } from '../../src/games/arena/run/classes';
import { award, levelOf, progressOf, savedXp, xpForLevel } from '../../src/games/arena/run/progression';
import { map, state } from '../../src/games/arena/run/state';
import { finalWave, waveSpec } from '../../src/games/arena/run/director';
import { check, launch, lastScreen } from './_harness';

/**
 * Probe: the run's pieces one at a time. Gold (coins spilled and picked up, champions and goblins
 * worth more, Gold Rush, the wave's bonus and the rake), the shop (the merchant between waves,
 * armour, locks, the feather), the mystery chest (a weapon from a roll, and the chest flying off),
 * going down and being revived, bleeding out, the last one standing, the Phoenix Feather, the
 * crowd's hype and its Favour, classes and their locks, XP and levels, and on past the last wave
 * into the endless ones for a best.
 * `node scripts/headless.mjs tests/headless/_arena-run.ts`
 */
const log = (r: string) => console.log(`  ${r}`);

function scene(seed: number) {
  const h = launch('arena', { seed });
  const game = h.ctx as GameContext;
  const me = game.player as Player;
  me.maxHealth = 400;
  me.health = 400;
  return { h, game, me };
}

/** Into wave `n` now (the countdown and the class menu skipped), the arena cleared, and a monster held back so it lasts. */
function wave(game: GameContext, n: number) {
  game.commands.run(`/wave ${n}`);
  for (const e of game.entities.all()) if (!e.data.scenery) e.remove();
  state.queue = ['zombie'];
  state.spawnTimer = 1e9;
}

/** The wave's last monster let go: it's won once the arena's empty. */
function win(game: GameContext, by: Player) {
  state.queue = [];
  for (const e of game.entities.all()) if (!e.data.scenery) e.damage(9999, { source: by });
}

/** Monsters slain by someone at a spot (their coins spill there). */
function slay(game: GameContext, by: Player, type: string, at: { x: number; z: number }, data?: Record<string, unknown>) {
  const e = game.entities.spawn(type, { x: at.x, y: map().center.y - 1 + 0.05, z: at.z }, { data });
  e.damage(9999, { source: by });
  return e;
}

/** Stand still somewhere for a while (pickups come to you). */
const idle = (h: Headless, seconds: number) => h.run(seconds, { pilot: () => ({}) });

function coins() {
  const { h, game, me } = scene(1);
  wave(game, 1);
  const c = map().center;
  me.teleport({ x: c.x, y: c.y - 1, z: c.z + 6 });
  const at = { x: c.x, z: c.z + 7 };
  const start = gold(me);
  slay(game, me, 'zombie', at);
  idle(h, 2);
  const zombie = gold(me) - start;
  slay(game, me, 'zombie', at, { elite: true });
  idle(h, 2);
  const elite = gold(me) - start - zombie;
  state.twist = 'gold_rush';
  slay(game, me, 'zombie', at);
  idle(h, 2);
  const rush = gold(me) - start - zombie - elite;
  state.twist = null;
  const before = gold(me);
  slay(game, me, 'goblin', at);
  idle(h, 3);
  const goblin = gold(me) - before;
  log(`coins: a zombie ${zombie}, a champion ${elite}, in a Gold Rush ${rush}, a goblin's shower ${goblin}`);
  check(zombie === GOLD_PER_COST && elite === 3 * GOLD_PER_COST && rush === 2 * GOLD_PER_COST && goblin >= 90, 'what monsters are worth');
  // Coins left lying when the wave's won are raked up; and the wave's bonus.
  slay(game, me, 'brute', { x: c.x + 12, z: c.z - 12 });
  idle(h, 0.5);
  const lying = h.sim.items.frame().filter((p) => p.item.startsWith('coin')).length;
  const was = gold(me);
  win(game, me);
  h.run(2, { pilot: () => ({}) });
  const paid = gold(me) - was;
  log(`wave won: ${lying} piles lying raked up, +${paid} (bonus ${waveBonus(1)})`);
  check(lying > 0 && paid >= waveBonus(1) + 6 * GOLD_PER_COST - 6 && h.sim.items.frame().every((p) => !p.item.startsWith('coin')), 'the wave pays its bonus and rakes up the coins');
}

function shop() {
  const { h, game, me } = scene(2);
  check(!shopOpen(), 'no merchant before the first wave is won');
  wave(game, 1);
  win(game, me);
  h.run(0.5);
  check(state.phase === 'intermission' && shopOpen(), `the merchant is in between waves (${state.phase})`);
  const merchant = game.entities.all().find((e) => e.type === 'merchant')!;
  const s = map().shop!;
  check(merchant.data.scenery && Math.hypot(merchant.position.x - s.x, merchant.position.z - s.z) < 1, 'behind his stall at the map\'s shop spot, as scenery');
  const g = gold(me);
  addGold(game, me, -g);
  check(!purchase(game, me, 'armor:1'), 'nothing without gold');
  addGold(game, me, 2000);
  const armor = me.armor;
  check(purchase(game, me, 'armor:1') && me.armor === armor + ARMOR[0].points && armorTier(me) === 1, `leather armour: ${me.armor}`);
  check(purchase(game, me, 'armor:2') && me.armor === armor + ARMOR[1].points, `then the cuirass: ${me.armor}`);
  check(!purchase(game, me, 'pike'), 'the pike is on sale from wave 3');
  check(purchase(game, me, 'bow') && me.inventory.count('bow') === 1, 'a bow');
  check(!purchase(game, me, 'bow'), 'not a second');
  check(purchase(game, me, FEATHER) && me.inventory.count(FEATHER) === 1 && !purchase(game, me, FEATHER), 'one Phoenix Feather at a time');
  const spent = 2000 - gold(me);
  check(spent === ARMOR[0].price + ARMOR[1].price + 60 + FEATHER_PRICE, `paid for: ${spent}`);
  // Ready (N): the next wave comes in a few seconds rather than the rest of the break.
  const left = state.nextWaveAt - game.clock.now;
  h.step(1 / 60, { pressed: ['KeyN'], down: ['KeyN'] });
  check(state.nextWaveAt - game.clock.now < 4 && left > 10, `ready: the next wave in ${(state.nextWaveAt - game.clock.now).toFixed(1)} s, not ${left.toFixed(1)}`);
  h.run(5);
  check((state.phase as string) === 'fighting' && !shopOpen() && !game.entities.all().some((e) => e.type === 'merchant'), 'he packs up when the next wave begins');
  log(`shop: armour to ${me.armor} points, a bow and a feather for ${spent} gold; open between waves only; N for ready cuts the break short`);
}

function chest() {
  const { h, game, me } = scene(3);
  wave(game, 1);
  addGold(game, me, -gold(me));
  check(!rollChest(game, me), 'no roll without the gold');
  addGold(game, me, 5000);
  // Stand back from it, so its gift stays to be seen.
  me.teleport({ x: map().center.x, y: map().center.y, z: map().center.z });
  const gifts: (string | null)[] = [];
  bus.on('chest', ({ item }) => gifts.push(item));
  let rolls = 0;
  for (let i = 0; i < 40 && !gifts.includes(null); i++) {
    if (!rollChest(game, me)) {
      h.run(0.5);
      continue;
    }
    rolls++;
    idle(h, ROLL_TIME + 0.2);
    // (Taken or not, it's gone in a while: the next roll waits.)
    h.run(13);
  }
  const weapons = gifts.filter((g): g is string => !!g);
  log(`chest: ${rolls} rolls gave ${weapons.join(', ')}${gifts.includes(null) ? ', then it flew off' : ''}`);
  check(weapons.length >= 3 && weapons.every((w) => game.items.get(w)), 'it gives weapons the game has');
  check(gifts.includes(null), 'after a few rolls it flies off');
  const refunded = gold(me) === 5000 - PRICE * weapons.length;
  check(refunded, `the gold back when it flies: ${gold(me)}`);
  h.run(12);
  check(rollChest(game, me), 'and lands somewhere new to roll again');
}

function downs() {
  const { h, game, me } = scene(4);
  const bob = game.bots.add('Bob') as Bot;
  h.run(0.2);
  wave(game, 2);
  const c = map().center;
  me.teleport({ x: c.x, y: c.y - 1, z: c.z + 5 }, Math.PI, 0);
  me.damage(1000);
  check(isDowned(me) && me.alive && me.abilities.crawl.on, `with Bob standing, a killing blow puts you down (${isDowned(me)}, crawling ${me.abilities.crawl.on})`);
  idle(h, 2);
  check(me.health < me.maxHealth, `bleeding: ${me.health.toFixed(1)} of ${me.maxHealth}`);
  // Bob comes over and holds E on you.
  bob.teleport({ x: c.x, y: c.y - 1, z: c.z + 3.4 }, 0, -0.5);
  bob.controls.lookAt({ x: me.position.x, y: me.position.y + 0.4, z: me.position.z });
  bob.controls.hold('KeyE');
  h.run(REVIVE + 0.3, { pilot: () => ({}) });
  bob.controls.release();
  check(!isDowned(me) && Math.abs(me.health - Math.round(me.maxHealth / 3)) < 2, `Bob revived you: ${me.health.toFixed(1)} health`);
  check(h.find('hud', 'feed').some((f) => String(f.args[0]) === 'Bob revived Player'), 'and everyone hears');
  // Bob goes down and nobody comes: he bleeds out and falls.
  const fell: string[] = [];
  bus.on('fell', ({ player }) => fell.push(player.name));
  bob.damage(1000);
  check(isDowned(bob), 'Bob down');
  idle(h, BLEED + 1);
  check(!bob.alive && fell.includes('Bob'), `bled out after ${BLEED} s: Bob ${bob.alive ? 'alive' : 'fell'}`);
  // Alone on your feet, a killing blow is the end (no feather): the fight's lost.
  me.damage(10000);
  idle(h, 3);
  check(!me.alive && lastScreen(h) === 'Defeated', `the last one standing falls: ${lastScreen(h)}`);
  log(`downs: down with a friend standing, revived in ${REVIVE} s to a third of your health; bled out after ${BLEED} s; the last one standing can't go down`);

  // Alone, the Phoenix Feather.
  const solo = scene(5);
  wave(solo.game, 1);
  solo.me.inventory.give(FEATHER, 1);
  solo.me.damage(10000);
  check(solo.me.alive && solo.me.inventory.count(FEATHER) === 0 && solo.me.health === solo.me.maxHealth / 2, `the feather raises you: ${solo.me.health}`);
  // (Out of the flames' protection first.)
  idle(solo.h, 3);
  solo.me.damage(10000);
  idle(solo.h, 2);
  check(!solo.me.alive, 'once');
  log('phoenix: a killing blow taken once, and you rise on half your health');
}

function hype() {
  const { h, game, me } = scene(6);
  wave(game, 2);
  const c = map().center;
  me.teleport({ x: c.x, y: c.y - 1, z: c.z + 5 });
  const at = { x: c.x, z: c.z + 6 };
  let favour = false;
  bus.on('hype', (e) => (favour ||= e.favour));
  let kills = 0;
  for (; kills < 80 && !favour; kills++) {
    slay(game, me, 'zombie', at);
    h.run(0.3, { pilot: () => ({}) });
  }
  check(favour && h.find('hud', 'banner').some((b) => b.args[0] === "THE CROWD'S FAVOUR"), `the crowd boils over after ${kills} kills`);
  // The emperor's gifts: whatever's thrown down while it lasts.
  const thrown: string[] = [];
  const spawnPickup = game.items.spawnPickup.bind(game.items);
  (game.items as { spawnPickup: typeof spawnPickup }).spawnPickup = (item, at, o) => (thrown.push(item), spawnPickup(item, at, o));
  const was = gold(me);
  slay(game, me, 'zombie', at);
  idle(h, 2);
  const doubled = gold(me) - was;
  idle(h, 10);
  const gifts = thrown.filter((i) => i !== 'coin' && i !== 'heart');
  log(`hype: the Favour after ${kills} kills in quick succession; a zombie worth ${doubled} under it; ${gifts.length} gifts thrown down (${[...new Set(gifts)].join(', ')}); then the crowd's at ${hypeValue().toFixed(2)}`);
  check(doubled >= 2 * GOLD_PER_COST, `double gold in the Favour: ${doubled}`);
  check(gifts.length >= 8, `gifts thrown: ${gifts.length}`);
  check(hypeValue() < 0.1, 'and it starts again from nothing');
}

function classes() {
  const { h, game, me } = scene(7);
  h.run(0.5);
  check(h.find('hud', 'menu').some((m) => (m.args[1] as { title: string }).title === 'Choose your class'), 'the classes are offered in the countdown');
  choose(game, me, 'hunter');
  check(classOf(me) === 'hunter' && me.inventory.count('bow') === 1 && me.inventory.count('arrow') >= 32 && me.speed > 1, `a Hunter: ${me.inventory.slots.filter(Boolean).map((s) => `${s!.item}x${s!.count}`).join(' ')}`);
  choose(game, me, 'berserker');
  check(classOf(me) === 'hunter', 'the Berserker is locked at level 1');
  award(game, me, [[xpForLevel(4) - savedXp(me), 'TEST']]);
  h.run(0.1);
  check(levelOf(savedXp(me)) === 4 && h.find('hud', 'pop').some((p) => String(p.args[0]) === 'LEVEL 4'), `level 4: ${progressOf(me).level} (${h.find('hud', 'pop').map((p) => JSON.stringify(p.args)).join(' ')})`);
  const hearts = me.maxHealth;
  choose(game, me, 'berserker');
  check(classOf(me) === 'berserker' && me.inventory.count('battle_axe') === 1 && me.inventory.count('bow') === 0 && me.maxHealth === hearts + 6, `a Berserker now: max health ${me.maxHealth}, ${me.inventory.slots.filter(Boolean).map((s) => s!.item).join(' ')}`);
  h.run(15);
  check(state.phase === 'fighting', 'the first wave begins');
  choose(game, me, 'gladiator');
  check(classOf(me) === 'berserker', 'and the class is set for the run');
  log('classes: offered in the countdown, the Berserker locked until level 4, kits swapped, set once the fight is on');
}

function endless() {
  const { h, game, me } = scene(8);
  wave(game, finalWave());
  for (let i = 0; i < 30 * 60 && state.phase !== 'victory'; i++) {
    win(game, me);
    h.step(1 / 60, {});
  }
  h.run(4);
  check(lastScreen(h) === 'Victory!', `the last wave won: ${lastScreen(h)}`);
  type Screen = { buttons: { label: string; onClick: { $cb: number } }[] };
  const screen = h.find('hud', 'screen').at(-1)!.args[1] as Screen;
  const keep = screen.buttons.find((b) => b.label === 'Keep fighting')!;
  h.send({ t: 'callback', player: me.id, id: keep.onClick.$cb });
  h.run(1);
  check(state.endless && state.phase === 'intermission' && shopOpen(), `on into the endless waves (${state.phase})`);
  h.run(20);
  check(state.wave === finalWave() + 1 && h.find('hud', 'banner').some((b) => String(b.args[0]) === `Endless · Wave ${finalWave() + 1}`), `wave ${state.wave}`);
  const budget = waveSpec(finalWave() + 1).budget ?? 0;
  check(budget > (waveSpec(finalWave() - 1).budget ?? 0), `a bigger budget: ${budget}`);
  me.damage(1e6);
  h.run(3);
  check(lastScreen(h) === 'The Arena Claims You', `lost in the endless waves: ${lastScreen(h)}`);
  const best = (me.store.get<{ best: Record<string, number> }>('arena')?.best ?? {})[map().id];
  check(best === finalWave() + 1, `the best wave kept: ${best}`);
  log(`endless: Keep fighting into wave ${finalWave() + 1} (budget ${budget}); the best wave kept (${best}), XP ${progressOf(me).total}, level ${progressOf(me).level}`);
}

export default function arenaRun() {
  coins();
  shop();
  chest();
  downs();
  hype();
  classes();
  endless();
}
