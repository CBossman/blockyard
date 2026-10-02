import { Blueprint } from '@platform';
import { gateAt } from './kit';
import { FLOOR, type ArenaMap } from './registry';

/** The Necropolis (a stand-in floor until it's built). */

const C = { x: 512 + 0.5, z: 0 + 0.5 };
const R = 20;
const GATES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function build(): Blueprint {
  const bp = Blueprint.centered(512, 0, R + 6, FLOOR, FLOOR);
  bp.columns(512, 0, R + 6, (x, z) => bp.set(x, FLOOR, z, 'grave_soil'));
  return bp;
}

export const NECROPOLIS: ArenaMap = {
  id: 'necropolis',
  name: 'The Necropolis',
  line: "Where the dead don't stay buried",
  color: '#7dffb0',
  icon: 'crypt_bricks',
  origin: C,
  build: () => [build()],
  center: { x: C.x, y: FLOOR + 1, z: C.z },
  radius: R,
  gates: GATES.map((a) => gateAt(C, a, R)),
  lookout: { x: C.x, y: FLOOR + 1, z: C.z + R },
  time: 0.88,
  intro: [{ at: { x: C.x + 30, y: FLOOR + 20, z: C.z + 30 }, look: { x: C.x, y: FLOOR, z: C.z } }],
  air: { kind: 'mist', heading: 0.6, wind: 1.2, gust: 3.5, loop: 'amb_crypt_wind', calls: ['amb_crow', 'amb_owl', 'amb_bell'] },
};
