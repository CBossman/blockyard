import { COMMITTEE, GATE, PIN, WINDWARD, landAt } from '../../src/games/regatta/course';
import { ISLANDS } from '../../src/games/regatta/islands';
import { KNOTS, type BoatState } from '../../src/games/regatta/sailing';
import { check, launch } from './_harness';

/**
 * Block Regatta: the player gets a foiling boat afloat in the bay, it sails on a beam reach and stalls
 * pointed into the wind; the start gun fires, and the bots in the empty places race the course
 * round to the finish.
 */
export default function regatta() {
  const h = launch('regatta', { seed: 7 });
  const game = h.ctx;
  const boat = () => game.player.vehicle?.state as BoatState | undefined;
  const feed = () => h.find('hud', 'feed').map((c) => JSON.stringify(c));

  check(game.player.vehicle?.name === 'boat', 'the player sails a boat');
  const start = { ...boat()! };
  check(!start.aground, 'the boat starts afloat');
  check(start.ws > 0, 'the server wrote the wind into the boat');

  // The course's shapes (what boats run aground on, and what the models are drawn from): the
  // islands, buoys and committee boat are solid, and the racing water between them is clear.
  for (const isl of ISLANDS) check(landAt(isl.x, isl.z), `the island at ${isl.x}, ${isl.z} is land`);
  for (const b of [PIN, WINDWARD, ...GATE, COMMITTEE]) check(landAt(b.x, b.z), `the mark at ${b.x}, ${b.z} is solid`);
  for (let z = -180; z <= 50; z += 10) {
    for (let x = -60; x <= 60; x += 10) {
      if ([PIN, WINDWARD, ...GATE, COMMITTEE].some((b) => Math.hypot(b.x - x, b.z - z) < 9)) continue;
      check(!landAt(x, z), `open water at ${x}, ${z}`);
    }
  }

  // Hands off: a beam reach on the starting heading, sail half out (before it reaches the fleet).
  h.run(4, { pilot: () => ({}) });
  const b = boat()!;
  check(!b.aground, `the boat stays afloat (at ${b.x.toFixed(1)}, ${b.z.toFixed(1)})`);
  check(b.speed > 2, `it sails on a beam reach (speed ${b.speed.toFixed(2)})`);
  check(Math.hypot(b.x - start.x, b.z - start.z) > 10, 'it covered some water');

  // Held on the reach it builds speed until the foils lift the hull clear, and flies fast (unless
  // it runs into a bot loitering by the line: the best it did).
  let ride = 0;
  let fastest = 0;
  h.run(10, {
    pilot: () => {
      ride = Math.max(ride, boat()!.ride);
      fastest = Math.max(fastest, boat()!.speed * KNOTS);
      return {};
    },
  });
  check(ride > 0.9, `on a reach it takes off onto its foils (ride ${ride.toFixed(2)})`);
  check(fastest > 25, `and foils at over 25 knots (${fastest.toFixed(1)} kn)`);

  // Steer up into the wind and hold it there: it should lose its way (in irons).
  h.run(15, {
    pilot: () => {
      const s = boat()!;
      const off = ((s.wd - s.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      return { down: off > 0.05 ? ['KeyD'] : off < -0.05 ? ['KeyA'] : [] };
    },
  });
  check(boat()!.speed < 1.2, `pointing into the wind stalls it (speed ${boat()!.speed.toFixed(2)})`);
  check(boat()!.luff > 0.9, 'and the sail flaps');

  // Through the gun (30 s after the start), then let the bots race it out.
  h.run(12, { pilot: () => ({}) });
  check(h.find('hud', 'banner').some((c) => JSON.stringify(c).includes('Go!')), 'the start gun fired');
  check(h.calls.some((c) => c.target === 'hud' && JSON.stringify(c.args).includes('to and fro')), 'a new skipper got the start tip');
  check(h.calls.some((c) => c.target === 'message' && c.method === 'upwind' && JSON.stringify(c.args).includes('true')), 'their screen was told to lay out the laylines');
  h.run(480, { pilot: () => ({}), until: () => feed().filter((l) => l.includes('finished')).length >= 4 });
  const finished = feed().filter((l) => l.includes('finished'));
  check(finished.length >= 4, `the bots sail the course and finish (${finished.length} finished by ${game.clock.now.toFixed(0)} s)`);
}
