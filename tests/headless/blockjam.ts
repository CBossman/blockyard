import { readFileSync } from 'node:fs';
import { advance, arc, launch, shotTime, type BallEvent } from '../../src/games/blockjam/ball';
import { FLOOR, isThree, rim } from '../../src/games/blockjam/court';
import { dunkPath, dunkTarget, JAM_STATE, SHOT_APEX } from '../../src/games/blockjam/moves';
import blockjam, { matchNow } from '../../src/games/blockjam/server';
import { GameHost } from '../../src/platform/host/game';
import { check } from './_harness';

const wasm = readFileSync('engine/pkg/voxel_engine_bg.wasm');

/**
 * Block Jam: the ball (a shot through the middle drops from anywhere, one at the back of the rim
 * clanks out, the flight is the same played in one go or in pieces), the court (threes), a dunk's
 * path (it ends at the rim), and a whole game of bots played out headless: tip-off, four quarters,
 * the final buzzer, a winner, and box scores that add up to the score.
 */
export default function blockjamTest() {
  // Shots through the middle, from close in, the elbow, the arc and deep.
  const c = rim(1);
  let made = 0;
  for (const [x, z] of [[c.x - 2, 0], [c.x - 4, 2], [c.x - 6.8, 0], [c.x - 5, 5], [c.x - 9, 3]]) {
    const from = { x, y: FLOOR + 2.6, z };
    const d = Math.hypot(c.x - x, c.z - z);
    const ux = (c.x - x) / d;
    const uz = (c.z - z) / d;
    const v = arc(from, { x: c.x + ux * 0.04, y: c.y, z: c.z + uz * 0.04 }, shotTime(d));
    const s = launch(from.x, from.y, from.z, v.vx, v.vy, v.vz);
    advance(s, 4);
    if (s.through === 1) made++;
  }
  check(made === 5, `shots through the middle drop: ${made} of 5`);
  // At the back of the rim: off the iron and out.
  {
    const from = { x: c.x - 6, y: FLOOR + 2.6, z: 0 };
    const v = arc(from, { x: c.x + 0.48, y: c.y, z: 0 }, shotTime(6));
    const s = launch(from.x, from.y, from.z, v.vx, v.vy, v.vz);
    const ev: BallEvent[] = [];
    advance(s, 4, ev);
    check(!s.through && ev.some((e) => e.kind === 'rim'), `the back iron: out (${ev.map((e) => e.kind).join(',')})`);
  }
  // The same flight played in one go and frame by frame.
  {
    const a = launch(0, FLOOR + 2, 0, 5, 7, 1);
    const b = launch(0, FLOOR + 2, 0, 5, 7, 1);
    advance(a, 2.5);
    for (let t = 0; t <= 2.5; t += 1 / 60) advance(b, t);
    advance(b, 2.5);
    check(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-9, 'a flight is the same however it is played');
  }
  // Threes: behind the arc and in the corners, not inside.
  check(isThree(1, c.x - 7, 0) && isThree(1, c.x + 0.5, 7) && !isThree(1, c.x - 4, 1), 'threes');
  // A dunk's path ends at the rim, and its top is above the rim.
  {
    const s = { ...JAM_STATE, fx: c.x - 5, fy: FLOOR, fz: 2, ...(() => { const t = dunkTarget(1, c.x - 5, 2); return { tx: t.x, ty: t.y, tz: t.z }; })(), lift: 1.3 };
    const end = dunkPath(s, 1);
    const mid = dunkPath(s, 0.6);
    check(Math.hypot(end.x - c.x, end.z - c.z) < 0.7 && end.y > FLOOR + 1, `a dunk ends at the rim: ${JSON.stringify(end)}`);
    check(mid.y + 1.7 > c.y, 'and flies above it');
  }
  check(SHOT_APEX > 0.2 && SHOT_APEX < 0.35, `a jump shot's top: ${SHOT_APEX.toFixed(3)} s`);

  // A whole game of bots.
  const host = new GameHost(blockjam, { engine: wasm, seed: 7, remote: true, radius: 3, budget: Infinity });
  (host as unknown as { sim: { start(): void } }).sim.start();
  let tipped = false;
  let maxQuarter = 0;
  let over = false;
  for (let i = 0; i < 30 * 60 * 11 && !over; i++) {
    host.step(1 / 30);
    const m = matchNow();
    if (m.phase === 'live') tipped = true;
    maxQuarter = Math.max(maxQuarter, m.quarter);
    if (m.phase === 'over') over = true;
  }
  const m = matchNow();
  check(tipped, 'tip-off');
  check(over && maxQuarter >= 4, `the final buzzer, after ${maxQuarter} quarters`);
  const [a, b] = m.teams;
  check(a.score !== b.score, `a winner: ${a.def.abbr} ${a.score} ${b.def.abbr} ${b.score}`);
  check(a.score >= 12 && b.score >= 12, 'both sides score');
  for (const t of m.teams) {
    const pts = t.ballers.reduce((n, x) => n + x.pts, 0);
    // (A tip-in off the other side's miss scores without a scorer.)
    check(pts <= t.score && pts >= t.score * 0.7, `${t.def.abbr}'s box score adds up: ${pts} of ${t.score}`);
  }
  const all = [...a.ballers, ...b.ballers];
  check(all.reduce((n, x) => n + x.dunks, 0) > 0 && all.reduce((n, x) => n + x.reb, 0) > 0 && all.reduce((n, x) => n + x.stl, 0) > 0, 'dunks, rebounds and steals');
  console.log(`  blockjam: shots drop and clank, threes, dunk paths; a bots' game ${a.def.abbr} ${a.score}-${b.score} ${b.def.abbr} (${all.reduce((n, x) => n + x.dunks, 0)} dunks, ${all.reduce((n, x) => n + x.threes, 0)} threes)`);
}
