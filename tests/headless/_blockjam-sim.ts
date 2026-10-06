import { readFileSync } from 'node:fs';
import { GameHost } from '../../src/platform/host/game';
import blockjam from '../../src/games/blockjam/server';
import { matchNow } from '../../src/games/blockjam/server';

const wasm = readFileSync('engine/pkg/voxel_engine_bg.wasm');

/** Bots only: a whole quarter played out headless, the box score at the end. */
export default function sim() {
  const host = new GameHost(blockjam, { engine: wasm, seed: 1, remote: true, radius: 3, budget: Infinity });
  // Bots only: the match starts with nobody to press Play.
  (host as unknown as { sim: { start(): void } }).sim.start();
  const steps = Number(process.env.STEPS ?? 30 * 150);
  let last = '';
  for (let i = 0; i < steps; i++) {
    host.step(1 / 30);
    const m = matchNow();
    if (!m) continue;
    if (i % 150 === 0) {
      const line = `t=${(i / 30).toFixed(0)}s q${m.quarter} ${m.clock.toFixed(0)}s phase=${m.phase} ball=${m.ball.mode}${m.ball.holder ? ':' + m.ball.holder.player.name : ''} ${m.teams[0].def.abbr} ${m.teams[0].score} - ${m.teams[1].score} ${m.teams[1].def.abbr}`;
      if (line !== last) console.log('  ' + line);
      last = line;
    }
  }
  const m = matchNow();
  for (const t of m.teams) for (const b of t.ballers) console.log(`  ${t.def.abbr} ${b.player.name.padEnd(22)} pts ${b.pts} reb ${b.reb} ast ${b.ast} stl ${b.stl} blk ${b.blk} dnk ${b.dunks} 3s ${b.threes}`);
}
