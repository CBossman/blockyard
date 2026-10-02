import { Blueprint } from '@platform';
import { gateAt } from './kit';
import { FLOOR, type ArenaMap } from './registry';

/** The Forge (a stand-in floor until it's built). */

const C = { x: 0 + 0.5, z: 512 + 0.5 };
const R = 20;
const GATES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function build(): Blueprint {
  const bp = Blueprint.centered(0, 512, R + 6, FLOOR, FLOOR);
  bp.columns(0, 512, R + 6, (x, z) => bp.set(x, FLOOR, z, 'cinder'));
  return bp;
}

export const FORGE: ArenaMap = {
  id: 'forge',
  name: 'The Forge',
  line: "Iron, fire and rivers of lava",
  color: '#ff7a1a',
  icon: 'basalt_bricks',
  origin: C,
  build: () => [build()],
  center: { x: C.x, y: FLOOR + 1, z: C.z },
  radius: R,
  gates: GATES.map((a) => gateAt(C, a, R)),
  lookout: { x: C.x, y: FLOOR + 1, z: C.z + R },
  time: 0.74,
  intro: [{ at: { x: C.x + 30, y: FLOOR + 20, z: C.z + 30 }, look: { x: C.x, y: FLOOR, z: C.z } }],
  air: { kind: 'embers', heading: 0.6, wind: 1.2, gust: 3.5, loop: 'amb_forge', calls: ['amb_hammer', 'amb_rumble', 'amb_steam'] },
};
