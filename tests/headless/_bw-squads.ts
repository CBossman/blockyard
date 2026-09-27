import { readFileSync } from 'node:fs';
import { GameHost } from '../../src/platform/host/game';
import { games } from './_harness';

/** Probe (not in the suite): what a Fours match of bots costs a server tick. */
export default function bwSquads() {
  const def = games.find((g) => g.id === 'bedwars')!;
  const host = new GameHost(def, { engine: readFileSync('engine/pkg/voxel_engine_bg.wasm'), seed: 4, remote: true, radius: 7, budget: Infinity, cheats: true, room: 'probe123' });
  const bw = (globalThis as unknown as { __bw: { match: { teams: { members: { body: unknown }[]; bed: boolean }[]; lobby: boolean; over: boolean; now: number }; lobby: { size: number; startNow(): void } } }).__bw;
  const c = host.connect('Ann');
  host.command(c.id, { t: 'start' });
  for (let i = 0; i < 10; i++) host.step(1 / 30);
  bw.lobby.size = 4;
  bw.lobby.startNow();
  host.step(1 / 30);
  const bots = bw.match.teams.reduce((n, t) => n + t.members.filter((m) => m.body).length, 0);
  const ticks: number[] = [];
  for (let i = 0; i < 30 * 300 && !bw.match.over; i++) {
    const t0 = performance.now();
    host.step(1 / 30);
    ticks.push(performance.now() - t0);
    if (i % (30 * 50) === 0) {
      const all = (globalThis as unknown as { __bw: { bots: Map<number, { status: string; e: { position: { x: number; y: number; z: number } } }> } }).__bw.bots;
      const modes = new Map<string, number>();
      for (const b of all.values()) {
        const k = b.status.split(' ')[0].replace(/>.*/, '') + (b.status.includes('path:-') ? '(nopath)' : '');
        modes.set(k, (modes.get(k) ?? 0) + 1);
      }
      const kills = bw.match.teams.reduce((n, t) => n + t.members.reduce((a, m) => a + ((m as unknown as { kills: number }).kills ?? 0), 0), 0);
      console.log(`  t=${(i / 30).toFixed(0)} ${[...modes].map(([k, v]) => `${k}:${v}`).join(' ')} kills ${kills} placed ${(bw.match as unknown as { placed: Set<string> }).placed.size}`);
    }
  }
  ticks.sort((a, b) => a - b);
  const avg = ticks.reduce((a, b) => a + b, 0) / ticks.length;
  const beds = bw.match.teams.filter((t) => !t.bed).length;
  console.log(`  ${bots} bots, ${(ticks.length / 30).toFixed(0)} s: tick avg ${avg.toFixed(2)} ms, p99 ${ticks[Math.floor(ticks.length * 0.99)].toFixed(2)} ms, max ${ticks.at(-1)!.toFixed(1)} ms · ${beds} beds broken · over ${bw.match.over}`);
}
