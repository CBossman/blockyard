import type { ClientKit, ClientLoop } from '@platform/client';
import { MAPS, type TrapSpec } from '../../maps';
import { TRAP_MSG, type TrapMessage } from '../../maps/messages';

/**
 * The traps at work on this screen, from the server's word that one's gone off (`TRAP_MSG`):
 * the lions' fire and the frost vents roaring out along the floor (and heard), lava bubbling down
 * a sluice, frost sifting off the vault as the icicles come down. (What moves, the spikes, blades,
 * the hammer and the bell, are the server's props; its own effects mark their blows.)
 */

function linear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
}
const FIRE = ['#fff1b8', '#ffd27a', '#ffa035', '#ff7418', '#e8460c'].map(linear);
const FROST = ['#ffffff', '#dff6ff', '#a8e6ff', '#7cd0f5'].map(linear);
const LAVA = ['#ffd25a', '#ff8a1e', '#ff5a10'].map(linear);
const SMOKE = linear('#3a3430');

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

const SPECS = new Map<string, TrapSpec>(MAPS.flatMap((m) => (m.traps ?? []).map((t) => [t.id, t] as const)));

/** How long the warning runs before a trap bites (as the server's `traps.ts`). */
const WARN = 0.35;

interface Going {
  spec: TrapSpec;
  from: number;
  until: number;
  owed: number;
  loops: ClientLoop[];
}

export function trapFx(): ClientKit {
  const going = new Map<string, Going>();

  const end = (g: Going) => {
    for (const l of g.loops) l.stop();
    going.delete(g.spec.id);
  };

  return {
    name: 'arena.traps',
    setup(client) {
      client.on(TRAP_MSG, (data) => {
        const m = data as TrapMessage;
        const spec = SPECS.get(m?.id);
        if (!spec || typeof m.time !== 'number') return;
        const old = going.get(spec.id);
        if (old) end(old);
        const g: Going = { spec, from: client.time + WARN, until: client.time + m.time, owed: 0, loops: [] };
        if (spec.kind === 'jets') for (const j of spec.jets) g.loops.push(client.audio.loop(spec.element === 'frost' ? 'trap_frost_loop' : 'trap_fire_loop', { at: j.at, volume: 0 }));
        going.set(spec.id, g);
      });
    },
    frame(client, dt) {
      const t = client.time;
      for (const g of going.values()) {
        if (t >= g.until) {
          end(g);
          continue;
        }
        if (t < g.from) continue;
        const spec = g.spec;
        // Fading in at the start and out at the end.
        const k = Math.min(1, (t - g.from) / 0.25, (g.until - t) / 0.4);
        if (spec.kind === 'jets') {
          for (const l of g.loops) l.set({ volume: 0.9 * k });
          const colours = spec.element === 'frost' ? FROST : FIRE;
          g.owed += dt * 70 * spec.jets.length * k;
          while (g.owed >= 1) {
            g.owed -= 1;
            const j = pick(spec.jets);
            const speed = j.length * rand(1.6, 2.2);
            const at = { x: j.at.x + rand(-0.12, 0.12), y: j.at.y + rand(-0.1, 0.1), z: j.at.z + rand(-0.12, 0.12) };
            const spread = 0.18;
            const v = { x: (j.dir.x + rand(-spread, spread)) * speed, y: (j.dir.y + rand(-spread, spread) * 0.6) * speed, z: (j.dir.z + rand(-spread, spread)) * speed };
            client.fx.particles(at, pick(colours), { count: 1, speed: 0.3, size: rand(0.16, 0.34), gravity: spec.element === 'frost' ? 1 : -2.5, glow: spec.element === 'frost' ? 0.6 : 1, life: rand(0.38, 0.55), spread: 0.05, up: 0, drag: 1.1, velocity: v, collide: true });
            if (spec.element !== 'frost' && Math.random() < 0.12) client.fx.particles({ x: at.x + v.x * 0.4, y: at.y + 0.6, z: at.z + v.z * 0.4 }, SMOKE, { count: 1, speed: 0.2, size: rand(0.3, 0.5), gravity: -0.6, glow: 0, life: rand(1, 1.5), spread: 0.2, up: 0.8, drag: 0.9, collide: false });
          }
        } else if (spec.kind === 'sluice') {
          g.owed += dt * 30 * k;
          while (g.owed >= 1) {
            g.owed -= 1;
            const c = pick(spec.channel);
            client.fx.particles({ x: c.x + rand(0.1, 0.9), y: c.y + 0.95, z: c.z + rand(0.1, 0.9) }, pick(LAVA), { count: 1, speed: 1.2, size: rand(0.06, 0.12), gravity: 9, glow: 1, life: rand(0.4, 0.8), spread: 0, up: 2, collide: false });
          }
        } else if (spec.kind === 'icicles') {
          g.owed += dt * 40 * k;
          while (g.owed >= 1) {
            g.owed -= 1;
            const b = pick(spec.zone);
            client.fx.particles({ x: rand(b.min.x, b.max.x + 1), y: spec.vault - 0.2, z: rand(b.min.z, b.max.z + 1) }, pick(FROST), { count: 1, speed: 0.2, size: rand(0.04, 0.07), gravity: 2, glow: 0.4, life: rand(1, 1.6), spread: 0.2, up: 0, collide: true });
          }
        } else if (spec.kind === 'crusher') {
          g.owed += dt * 10 * k;
          while (g.owed >= 1) {
            g.owed -= 1;
            const h = spec.head;
            client.fx.particles({ x: rand(h.min.x, h.max.x + 1), y: h.max.y + 0.5, z: rand(h.min.z, h.max.z + 1) }, linear('#d8d2cc'), { count: 1, speed: 0.6, size: rand(0.25, 0.4), gravity: -1.2, glow: 0, life: rand(0.8, 1.3), spread: 0.3, up: 1.2, drag: 1, collide: false });
          }
        }
      }
    },
    dispose() {
      for (const g of [...going.values()]) end(g);
    },
  };
}
