import { advance, arc, launch, shotTime, type BallEvent } from '../../src/games/blockjam/ball';
import { FLOOR, rim } from '../../src/games/blockjam/court';

export default function ball() {
  const c = rim(1);
  const spots = [[c.x - 2, 0], [c.x - 4, 2], [c.x - 6.8, 0], [c.x - 5, 5], [c.x - 1.2, -6.5], [0, 0], [c.x - 9, 3]];
  for (const [x, z] of spots) {
    for (const err of [0, 0.12, 0.25, 0.4, -0.3]) {
      const from = { x, y: FLOOR + 2.6, z };
      const d = Math.hypot(c.x - x, c.z - z);
      // Aim a little past the middle along the line of flight, plus `err` along it.
      const ux = (c.x - x) / d, uz = (c.z - z) / d;
      const to = { x: c.x + ux * (0.04 + err), y: c.y, z: c.z + uz * (0.04 + err) };
      const v = arc(from, to, shotTime(d));
      const s = launch(from.x, from.y, from.z, v.vx, v.vy, v.vz);
      const ev: BallEvent[] = [];
      advance(s, 4, ev);
      console.log(`  d=${d.toFixed(1)} err=${err}: ${s.through ? 'IN ' : 'out'} ${ev.filter((e) => e.kind !== 'floor').map((e) => e.kind).join(',')}`);
    }
  }
}
