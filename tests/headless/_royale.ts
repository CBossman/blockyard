import { match, alive } from '../../src/games/blockroyale/match';
import { launch } from './_harness';

// Probe: plays a whole Block Royale match with one still person and prints how it goes.
export default function probe() {
  const h = launch('blockroyale', { seed: 3, radius: 8 });
  const game = h.ctx;
  let last = '';
  const seen = new Map<string, { x: number; z: number; t: number }>();
  const stuck = new Map<string, number>();
  let t0 = performance.now();
  const secs = Number(process.env.BR_SECONDS ?? 400);
  h.run(secs, {
    pilot: () => ({}),
    until: () => {
      if (match.phase === 'playing') {
        for (const f of alive()) {
          if (f.player === game.player) continue;
          const q = f.player.position;
          const was = seen.get(f.player.id);
          if (!was || game.clock.now - was.t > 20) {
            if (was && Math.hypot(q.x - was.x, q.z - was.z) < 3) stuck.set(f.player.name, (stuck.get(f.player.name) ?? 0) + 1);
            seen.set(f.player.id, { x: q.x, z: q.z, t: game.clock.now });
          }
        }
      }
      const s = `${match.phase} alive=${alive().length}`;
      if (s !== last) {
        last = s;
        console.log(`t=${game.clock.now.toFixed(1)} ${s}`);
      }
      return match.phase === 'over' && game.clock.now > 0 && alive().length <= 1 && h.find('hud', 'screen').length > 0;
    },
  });
  console.log(
    `real ${(performance.now() - t0) / 1000}s, sim ${game.clock.now.toFixed(1)}s, phase ${match.phase}, alive ${alive()
      .map((f) => f.player.name + ':' + f.kills)
      .join(' ')}`,
  );
  console.log('stuck samples (20 s apart, <3 blocks):', [...stuck].map(([n, c]) => `${n}:${c}`).join(' ') || 'none');
  console.log('chest opens:', h.calls.filter((c) => String(c.args[0]) === 'chest_open').length);
  for (const f of alive())
    console.log(
      f.player.name,
      f.player.health,
      Math.round(f.shield),
      f.player.inventory.slots
        .filter(Boolean)
        .map((x) => `${x!.item}x${x!.count}`)
        .join(' '),
    );
  console.log(
    'banners:',
    h
      .find('hud', 'banner')
      .map((c) => String(c.args[0]))
      .join(' | '),
  );
}
