import { Blueprint } from '@platform';
import { gateAt } from './kit';
import { FLOOR, type ArenaMap } from './registry';

/** The Frozen Sanctum (a stand-in floor until it's built). */

const C = { x: 512 + 0.5, z: 512 + 0.5 };
const R = 20;
const GATES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function build(): Blueprint {
  const bp = Blueprint.centered(512, 512, R + 6, FLOOR, FLOOR);
  bp.columns(512, 512, R + 6, (x, z) => bp.set(x, FLOOR, z, 'snow_block'));
  return bp;
}

export const SANCTUM: ArenaMap = {
  id: 'sanctum',
  name: 'The Frozen Sanctum',
  line: "Cold light over a temple of ice",
  color: '#8fd8ff',
  icon: 'ice_bricks',
  origin: C,
  build: () => [build()],
  center: { x: C.x, y: FLOOR + 1, z: C.z },
  radius: R,
  gates: GATES.map((a) => gateAt(C, a, R)),
  lookout: { x: C.x, y: FLOOR + 1, z: C.z + R },
  time: 0.8,
  intro: [{ at: { x: C.x + 30, y: FLOOR + 20, z: C.z + 30 }, look: { x: C.x, y: FLOOR, z: C.z } }],
  air: { kind: 'snow', heading: 0.6, wind: 1.2, gust: 3.5, loop: 'amb_ice_wind', calls: ['amb_creak', 'amb_chime'], aurora: true },
};
