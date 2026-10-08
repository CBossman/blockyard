import { match } from '../../src/games/blockroyale/match';
import { check, launch } from './_harness';

/** The storm: it closes in when told to, and hurts whoever stays outside the circle. */
export default function storm() {
  const h = launch('blockroyale', { seed: 11, radius: 8 });
  const game = h.ctx;
  const me = game.player;
  const br = (globalThis as unknown as { __br: { zone(): any } }).__br;
  game.commands.run('/br land pinecrest');
  h.run(120, { until: () => match.phase === 'playing' });
  check(match.phase === 'playing', `the bus never emptied (${match.phase})`);
  const zone = br.zone();
  check(zone, 'no storm');
  // Calm, then the next circle shown, then closing.
  zone.storm.left = 0.01;
  h.run(1);
  check(zone.storm.step === 'wait' && zone.storm.next, 'the next circle was not shown');
  zone.storm.left = 0.01;
  h.run(1);
  check(zone.storm.step === 'shrink', 'the storm did not start closing');
  const before = zone.storm.now.r;
  h.run(10);
  check(zone.storm.now.r < before, 'the circle did not shrink');
  check(
    h.find('hud', 'banner').some((c) => String(c.args[0]).includes('STORM')),
    'no storm banner',
  );
  // Out in the open sea, past the circle: it hurts.
  me.revive();
  me.teleport({ x: zone.storm.now.x + zone.storm.now.r + 40, y: 80, z: zone.storm.now.z }, 0, 0);
  me.health = 100;
  const hp = me.health;
  h.run(8);
  check(me.health < hp - 3, `the storm did not hurt (${me.health})`);
}
