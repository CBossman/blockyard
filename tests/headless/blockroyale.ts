import { alive, match } from '../../src/games/blockroyale/match';
import { check, launch, lastScreen } from './_harness';

/**
 * Block Royale. A scripted person rides the bus, steps off the side, dives, opens the parachute,
 * lands, and opens a chest with E; then they're taken out, and watch, jumping to a fighter with F; the
 * bots play on (looting, fighting, the storm closing in) until one is left; and the next match starts. `__br` is the game's development hook.
 */
export default function blockRoyale() {
  const h = launch('blockroyale', { seed: 7, radius: 8 });
  const game = h.ctx;
  const me = game.player;
  const br = (globalThis as unknown as { __br: { bus(): any; zone(): any; chests: any; bots: any } }).__br;
  const seen = new Set<string>();
  let chute = false;
  let opened = 0;
  let teleported = false;
  /** The most different things they carried at once (their pack is dropped where they fall). */
  let carried = 0;
  /** The starting pistol was in its place (the fifth slot). */
  let armed = false;
  /** When they were taken out, when they pressed F, and how far that put them from the nearest fighter. */
  let outAt = 0;
  let watchAt = 0;
  let watchGap = -1;

  // Where to aim: the middle of the village (the dive's target), and out of the bus's side door.
  const target = { x: 296.5, z: 606.5 };
  const yawTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

  // The bus waits for the scout (the island has to load for the bots' walking grid), then leaves with the countdown.
  game.commands.run('/br start');

  h.run(420, {
    pilot: () => {
      const f = match.fighters.get(me.id);
      const p = me.position;
      const now = game.clock.now;
      // Out, and watching: F jumps to a fighter still in it.
      if (outAt && me.spectating) {
        if (!watchAt) {
          watchAt = now;
          return { pressed: ['KeyF'] };
        }
        if (watchGap < 0 && now - watchAt > 0.3) watchGap = Math.min(...alive().map((x) => Math.hypot(x.player.position.x - p.x, x.player.position.z - p.z)));
        return {};
      }
      if (match.phase === 'bus' && me.inventory.slots[4]?.item === 'plinker_common') armed = true;
      if (match.phase === 'bus' && f?.drop === 'bus') {
        // Walk out of the starboard gangway.
        const door = br.bus().gangway(1);
        return { down: ['KeyW'], yaw: yawTo(p, door), pitch: 0 };
      }
      if (f?.drop === 'air') {
        seen.add('air');
        if ((me.abilities.dive as { mode: number }).mode === 2) chute = true;
        // Down toward the village, nose down.
        return { down: ['KeyW'], yaw: yawTo(p, target), pitch: -0.5 };
      }
      if (f?.drop === 'down' && f.alive) {
        seen.add('down');
        // Opened a chest: the first one near the village, from beside it.
        const i = br.chests.nearest({ x: target.x, y: 70, z: target.z }, 60, () => true);
        const s = br.chests.spots[i];
        if (!teleported && s) {
          teleported = true;
          me.teleport({ x: s.x + 0.5, y: s.y, z: s.z + 2.2 }, yawTo({ x: s.x + 0.5, z: s.z + 2.2 }, { x: s.x + 0.5, z: s.z + 0.5 }), -0.2);
          me.protect(60);
        }
        if (br.chests.opened.size > opened) opened = br.chests.opened.size;
        // Out, a moment after the chest's loot is theirs.
        if (opened > 0 && carried > 1 && !outAt) {
          outAt = now;
          me.protect(0);
          me.damage(500, { source: 'world', cause: 'test', knockback: 0 });
          return {};
        }
        return { pressed: ['KeyE'], yaw: me.yaw, pitch: -0.2 };
      }
      return {};
    },
    until: () => {
      seen.add(match.phase);
      carried = Math.max(carried, new Set(me.inventory.slots.filter(Boolean).map((s) => s!.item)).size);
      return match.phase === 'over' && h.find('hud', 'screen').length > 0 && lastScreen(h) !== undefined;
    },
  });

  check(
    ['lobby', 'bus', 'air', 'down', 'playing', 'over'].every((s) => seen.has(s)),
    `the match went through ${[...seen].join(', ')}`,
  );
  check(armed, 'the starting pistol was not in the fifth slot');
  check(
    h.find('hud', 'widget').some((c) => JSON.stringify(c.args).includes('tips')),
    'no how-to-drop card on the bus',
  );
  check(chute, 'the person never got their parachute open');
  check(opened > 0, 'no chest was opened');
  check(carried > 1, 'the person picked nothing up from the chest');
  check(
    h.calls.some((c) => String(c.args[0]) === 'chest_open'),
    'no chest sound',
  );
  check(outAt > 0 && watchAt > 0, 'the person was never out and watching');
  check(watchGap >= 0 && watchGap < 12, `F didn't take them to a fighter (${watchGap.toFixed(0)} blocks from the nearest)`);
  // (It ends when one is left, or a few seconds after the last person is out: someone's named the winner either way.)
  check(match.winner, 'nobody won');

  // The next match is on the bus again, with everyone aboard.
  h.run(30, { until: () => match.phase === 'lobby' });
  check(match.phase === 'lobby', `the next match didn't start (${match.phase})`);
  check(alive().length >= 8, `only ${alive().length} on the bus`);
}
