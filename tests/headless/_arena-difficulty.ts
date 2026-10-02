import type { Pilot } from '../../src/platform/host/headless';
import { launch, lastScreen } from './_harness';

/**
 * Probe: how far a plain bot gets in the Arena with three times the health (it walks at the nearest monster,
 * swings its best blade, and never dodges, blocks or throws), over a few seeds.
 * `node scripts/headless.mjs tests/headless/_arena-difficulty.ts`
 */
export default function arenaDifficulty() {
  const rows: string[] = [];
  for (const seed of [11, 22, 33, 44, 55, 66]) {
    const h = launch('arena', { seed });
    const game = h.ctx;
    const me = game.player;
    // Three times the health: a stand-in for a player who dodges and blocks.
    me.maxHealth = 60;
    me.health = 60;
    let taken = 0;
    const by: Record<string, number> = {};
    game.events.on('playerDamage', ({ amount, source }) => {
      taken += amount;
      const k = source && source !== 'world' && source.kind === 'entity' ? source.type : 'other';
      by[k] = (by[k] ?? 0) + amount;
    });
    let hop = 0;
    let think = 0;
    let last: ReturnType<Pilot> = {};
    const pilot: Pilot = () => {
      // Decide every 80 ms, like a person's reactions; hold the controls in between.
      if ((think += 1 / 60) < 0.08) return { ...last, clicked: 0, pressed: [] };
      think = 0;
      const eye = me.eye;
      let target: { x: number; y: number; z: number } | null = null;
      let best = Infinity;
      let height = 1.3;
      for (const e of game.entities.all()) {
        if (e.data.scenery) continue;
        const d = Math.hypot(e.position.x - eye.x, e.position.z - eye.z);
        if (d < best) {
          best = d;
          target = e.position;
          height = e.type === 'spider' ? 0.5 : e.type === 'warden' ? 2.6 : e.type === 'brute' ? 1.6 : 1.3;
        }
      }
      const fighting = !!target;
      if (!target) {
        for (const p of h.sim.items.frame()) {
          const d = Math.hypot(p.x - eye.x, p.z - eye.z);
          if (d < best) {
            best = d;
            target = { x: p.x, y: p.y - 1.3, z: p.z };
            height = 0.5;
          }
        }
      }
      if (!target) return (last = {});
      const dx = target.x - eye.x;
      const dy = target.y + height - eye.y;
      const dz = target.z - eye.z;
      const down = best > 2.4 ? ['KeyW'] : [];
      if (down.length && Math.hypot(me.velocity.x, me.velocity.z) < 0.5) hop = 2;
      if (hop > 0 && hop--) down.push('Space');
      // Hold the best melee weapon.
      const inv = me.inventory;
      let slot = inv.selected;
      let rank = -1;
      inv.slots.forEach((s, i) => {
        const d = s && game.items.get(s.item);
        if (d && d.kind === 'melee' && (d.rank ?? 0) > rank) {
          rank = d.rank ?? 0;
          slot = i;
        }
      });
      if (slot !== inv.selected) inv.select(slot);
      last = { down, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
      return { ...last, clicked: fighting ? 1 : 0 };
    };

    const t = h.run(3600, { pilot, until: () => lastScreen(h) !== undefined });
    const wave = h.find('hud', 'banner').filter((c) => /^(Wave \d|Final|Endless)/.test(String(c.args[0]))).length;
    const left = game.entities.all().map((e) => `${e.type}@${Math.hypot(e.position.x, e.position.z).toFixed(0)}/${e.position.y.toFixed(0)}`).join(' ');
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
    rows.push(`seed ${seed}: ${lastScreen(h) ?? 'no result'} at wave ${wave} after ${t.toFixed(0)} s; took ${taken.toFixed(0)} (${top})${left ? `; left: ${left}` : ''}`);
  }
  console.log(rows.map((r) => `  ${r}`).join('\n'));
}
