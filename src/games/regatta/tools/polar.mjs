/**
 * The foiling boat's polar, from its physics (`physics.ts`): the speed it settles at on each
 * angle to the wind, and what a tack and a gybe cost. For tuning:
 *
 *   node src/games/regatta/tools/polar.mjs [wind m/s]
 */
import { DEG, KNOTS, step } from '../physics.ts';

const ws = Number(process.argv[2] ?? 8);
const boat = (twa, speed, ride) => ({ heading: -twa, speed, rudder: 0, sheet: 0.3, boom: 0, ride, heel: 0, wd: 0, ws, twa: 0, awa: 0, aws: 0, eff: 0, luff: 0, auto: true });
const run = (s, secs, helm = () => ({ steer: 0, sheet: 0 })) => {
  for (let t = 0; t < secs; t += 1 / 30) step(s, helm(s), 1 / 30);
  return s;
};
const kn = (v) => (v * KNOTS).toFixed(1).padStart(5);

console.log(`Wind ${kn(ws)} kn\n TWA   flying-start   from-rest      AWA   VMG`);
let best = { up: [0, 0], down: [0, 0] };
for (let twa = 34; twa <= 180; twa += 6) {
  const a = run(boat(twa * DEG, 14, 1), 60);
  const b = run(boat(twa * DEG, 1, 0), 60);
  const vmg = a.speed * Math.cos(twa * DEG);
  if (vmg > best.up[1]) best.up = [twa, vmg];
  if (-vmg > best.down[1]) best.down = [twa, -vmg];
  console.log(`${String(twa).padStart(4)}  ${kn(a.speed)} ${a.ride > 0.5 ? 'fly' : 'wet'}     ${kn(b.speed)} ${b.ride > 0.5 ? 'fly' : 'wet'}   ${(Math.abs(a.awa) / DEG).toFixed(0).padStart(4)}  ${kn(vmg)}`);
}
console.log(`best upwind VMG at ${best.up[0]}° (${kn(best.up[1])} kn), downwind at ${best.down[0]}° (${kn(best.down[1])} kn)`);

// A tack: close-hauled on starboard, hard over until close-hauled on port.
const turn = (from, to, label, dir) => {
  const s = run(boat(from * DEG, 14, 1), 40);
  const v0 = s.speed;
  let min = v0, wet = false, t = 0;
  while (Math.abs(s.twa / DEG - to) > 3 && t < 20) {
    step(s, { steer: dir, sheet: 0 }, 1 / 30);
    t += 1 / 30;
    min = Math.min(min, s.speed);
    wet ||= s.ride < 0.5;
  }
  console.log(`${label}: ${kn(v0)} kn → ${kn(min)} kn at slowest, ${t.toFixed(1)} s to turn${wet ? ', OFF THE FOILS' : ''}`);
};
turn(44, -44, 'tack', 1);
turn(140, -140, 'gybe', -1);
