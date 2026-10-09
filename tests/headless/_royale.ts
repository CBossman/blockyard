import { alive, match } from '../../src/games/blockroyale/match';
import { SITES } from '../../src/games/blockroyale/island';
import { launch } from './_harness';

/**
 * Probe: how Block Royale plays out with bots alone (the one person watches from the sky). Per match:
 * where the bots landed, when each one went out and how far from whoever got them, with what, the
 * storm's phase at the end, how long it all took, and how often bots stood still.
 *
 *   MATCHES=3 node scripts/headless.mjs tests/headless/_royale.ts
 */
export default function probe() {
  const h = launch('blockroyale', { seed: Number(process.env.SEED ?? 3), radius: 8 });
  const game = h.ctx;
  const br = (globalThis as unknown as { __br: { zone(): any; chests: any; bots: any } }).__br;
  const traced = new Map<string, { n: number; t: number }>();
  const matches = Number(process.env.MATCHES ?? 2);
  const t0 = performance.now();
  type Death = { t: number; name: string; by: string; with: string; dist: number };
  let deaths: Death[] = [];
  const landed = new Map<string, string>();
  const seen = new Map<string, { x: number; z: number; t: number }>();
  let stuck = 0;
  let samples = 0;
  game.events.on('playerDeath', ({ player, source, weapon }) => {
    const by = source && source !== 'world' && source.kind === 'player' ? source : null;
    deaths.push({
      t: game.clock.now - match.busAt,
      name: player.name,
      by: by?.name ?? 'storm/world',
      with: weapon ?? '',
      dist: by ? Math.hypot(by.position.x - player.position.x, by.position.z - player.position.z) : -1,
    });
  });
  const site = (x: number, z: number) => {
    let best = SITES[0];
    for (const s of SITES) if (Math.hypot(s.cx - x, s.cz - z) < Math.hypot(best.cx - x, best.cz - z)) best = s;
    return Math.hypot(best.cx - x, best.cz - z) < best.radius + 15 ? best.label : 'open ground';
  };

  for (let m = 0; m < matches; m++) {
    deaths = [];
    landed.clear();
    seen.clear();
    // The person sits this one out, so the bots play it to the end.
    h.run(5, { until: () => match.phase === 'lobby' && match.fighters.has(game.player.id) });
    match.fighters.delete(game.player.id);
    game.player.spectate(true);
    game.player.teleport({ x: 312, y: 200, z: 632 });
    let bus = 0;
    let end = 0;
    h.run(900, {
      until: () => {
        if (match.phase === 'bus' && !bus) bus = game.clock.now;
        for (const f of alive()) {
          if (f.drop === 'down' && !landed.has(f.player.name)) landed.set(f.player.name, site(f.player.position.x, f.player.position.z));
          if (match.phase !== 'playing' || f.drop !== 'down') continue;
          const q = f.player.position;
          const was = seen.get(f.player.id);
          if (!was || game.clock.now - was.t > 15) {
            if (was) {
              samples++;
              if (Math.hypot(q.x - was.x, q.z - was.z) < 3) stuck++;
            }
            seen.set(f.player.id, { x: q.x, z: q.z, t: game.clock.now });
          }
        }
        // A bot outside the circle for a while: what's it doing?
        const zz = br.zone();
        if (zz && process.env.WHY)
          for (const f of alive()) {
            // Every two seconds outside (from four on, eight lines at most a bot): where, how far out, what it stands in, what it's doing.
            const tr = traced.get(f.player.id) ?? { n: 0, t: -9 };
            if (f.stormFor < 4 || tr.n >= 8 || game.clock.now - tr.t < 2) continue;
            traced.set(f.player.id, { n: tr.n + 1, t: game.clock.now });
            const mind = br.bots.kit.mind(f.player);
            const brain = br.bots.brains.get(f.player.id);
            const p = f.player.position;
            const c = zz.storm.now;
            const w = game.world;
            const at = (dy: number) => w.blockName(w.getBlock(Math.floor(p.x), Math.floor(p.y) + dy, Math.floor(p.z)));
            const keys = ['KeyW', 'ShiftLeft', 'Space'].filter((k) => f.player.input.isDown(k)).join('+');
            const out = (Math.hypot(p.x - c.x, p.z - c.z) - c.r).toFixed(1);
            const veer = brain && brain.veerUntil > game.clock.now ? brain.veer : 0;
            console.log(
              `  [storm ${game.clock.now.toFixed(0)}] ${f.player.name} ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} ${out} out (r ${c.r.toFixed(0)}, sea ${w.seaLevel}); in ${at(0)}/${at(-1)}; ground ${f.player.onGround}; goal ${mind?.goal ? 'y' : '-'} path ${mind?.path?.length ?? '-'} target ${mind?.target?.name ?? '-'}; escaping ${brain?.escaping} veer ${veer}; keys ${keys}; hp ${f.player.health.toFixed(0)}`,
            );
          }
        if (match.phase === 'over' && !end) end = game.clock.now;
        return match.phase === 'over';
      },
    });
    const z = br.zone();
    const bySite = new Map<string, number>();
    for (const s of landed.values()) bySite.set(s, (bySite.get(s) ?? 0) + 1);
    console.log(
      `\n== match ${m + 1}: ${(end - bus).toFixed(0)} s from the bus leaving; storm phase ${z?.storm.phase ?? '-'} (${z?.storm.step ?? '-'}); winner ${match.winner?.name ?? '-'}`,
    );
    console.log(`landed: ${[...bySite].map(([s, n]) => `${s} ${n}`).join(', ')}`);
    console.log(`chests opened: ${br.chests.opened.size}`);
    for (const d of deaths)
      console.log(`  ${d.t.toFixed(0).padStart(4)} s  ${d.name.padEnd(8)} by ${d.by.padEnd(10)} ${d.with.padEnd(22)} ${d.dist >= 0 ? `${d.dist.toFixed(0)} blocks` : ''}`);
    // To the next match.
    h.run(20, { until: () => match.phase === 'lobby' });
  }
  console.log(`\nstood still (under 3 blocks in 15 s): ${stuck} of ${samples} samples; ${((performance.now() - t0) / 1000).toFixed(0)} s real`);
}
