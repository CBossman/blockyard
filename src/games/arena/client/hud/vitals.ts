import type { ClientKit } from '@platform/client';
import { el, hud } from './store';

/** Below this much of their health a fighter's screen bleeds at the edges, and below `BEAT` their heart pounds. */
const LOW = 0.4;
const BEAT = 0.25;

/**
 * Hurt, on the fighter's own screen: the edges bleeding red as their health runs low (deeper the
 * lower it goes, pulsing with the heart), and near the end their heartbeat, a little quicker the
 * nearer they are; it eases off as their health comes back. Down and bleeding out (co-op), the
 * world dims and greys toward the middle with how long they have left over it; out for the wave,
 * a quiet grey veil while they watch from the stands.
 */
export function vitals(): ClientKit {
  let unstyle: (() => void) | null = null;
  let edge: HTMLElement;
  let veil: HTMLElement;
  let bleed: HTMLElement;
  let beat = 0;
  let shown = -1;
  let state = '';

  return {
    name: 'arena.hud.vitals',
    setup(client) {
      unstyle = client.hud.style(CSS);
      edge = el('div.ar-hurt');
      bleed = el('div.ar-bleed-n');
      veil = el('div.ar-veil', el('div.ar-veil-msg', el('div.ar-veil-t'), el('div.ar-veil-s'), bleed));
      client.hud.layer('arena.vitals', 'lens').append(edge, veil);
    },
    frame(client) {
      const me = client.me;
      const quiet = client.replay.playing || !me.id;
      const hp = me.maxHealth > 0 ? me.health / me.maxHealth : 1;
      const low = !me.dead && !quiet && hp < LOW ? 1 - hp / LOW : 0;
      const k = Math.round(low * 20) / 20;
      if (k !== shown) {
        shown = k;
        edge.style.setProperty('--low', String(k));
        edge.classList.toggle('on', k > 0);
      }
      const pound = !me.dead && !quiet && hp < BEAT ? 1 - hp / BEAT : 0;
      if (pound > 0 && client.time >= beat) {
        beat = client.time + 1.1 - pound * 0.4;
        client.audio.play('ar_heartbeat', { volume: 0.3 + pound * 0.4 });
        edge.classList.remove('beat');
        void edge.offsetWidth;
        edge.classList.add('beat');
      }
      // Down (bleeding out) or out for the wave: the veil, as the server says.
      const m = hud.me;
      const ended = !!hud.ended;
      const now = quiet || ended || !m || m.state === 'up' ? '' : m.state;
      if (now !== state) {
        state = now;
        veil.className = `ar-veil${now ? ` on ${now}` : ''}`;
        const [t, s] = now === 'down' ? ['Down', 'Hold on: a friend can lift you (E)'] : now === 'out' ? ['Out of the fight', 'Back when this wave is cleared'] : ['', ''];
        (veil.querySelector('.ar-veil-t') as HTMLElement).textContent = t;
        (veil.querySelector('.ar-veil-s') as HTMLElement).textContent = s;
      }
      if (state === 'down' && m) bleed.textContent = `${Math.max(0, Math.ceil(m.bleed))}`;
      else if (bleed.textContent) bleed.textContent = '';
    },
    dispose() {
      unstyle?.();
    },
  };
}

const CSS = `
.ar-hurt {
  position: absolute; inset: 0; pointer-events: none; --low: 0; opacity: 0; transition: opacity 400ms ease;
  background:
    radial-gradient(ellipse 70% 65% at center, transparent 45%, rgba(120, 6, 10, calc(0.22 + var(--low) * 0.35)) 80%, rgba(50, 0, 2, calc(0.5 + var(--low) * 0.4)) 100%);
}
.ar-hurt.on { opacity: 1; }
.ar-hurt.beat { animation: ar-hurt-beat 600ms ease-out; }
@keyframes ar-hurt-beat { 0% { opacity: 1; filter: brightness(1.5) saturate(1.3); } 30% { opacity: 0.75; } 100% { opacity: 1; } }
.ar-veil { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 700ms ease, backdrop-filter 700ms ease; }
.ar-veil.on { opacity: 1; }
.ar-veil.out { backdrop-filter: grayscale(0.85) brightness(0.8); background: radial-gradient(ellipse at center, transparent 40%, rgba(8, 6, 6, 0.55)); }
.ar-veil.down { backdrop-filter: grayscale(0.6) brightness(0.7) blur(1px); background: radial-gradient(ellipse at center, rgba(80, 0, 0, 0.1) 30%, rgba(60, 0, 4, 0.75)); animation: ar-veil-pulse 1.1s ease-in-out infinite; }
@keyframes ar-veil-pulse { 50% { background-color: rgba(90, 0, 6, 0.12); } }
.ar-veil-msg { position: absolute; left: 50%; bottom: 22%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; white-space: nowrap; }
.ar-veil-t { font: 700 30px/1 var(--ar-title, Georgia, serif); letter-spacing: 0.2em; margin-right: -0.2em; text-transform: uppercase; color: var(--ar-fg, #f5efe4); text-shadow: 0 0 20px rgba(0, 0, 0, 0.7); }
.ar-veil.down .ar-veil-t { color: #ff8a80; }
.ar-veil-s { font: 500 13px/1 var(--ar-label, sans-serif); letter-spacing: 0.26em; text-transform: uppercase; color: var(--ar-fg2, rgba(245, 239, 228, 0.7)); text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8); }
.ar-bleed-n { font: 600 44px/1 var(--ar-label, sans-serif); color: #ff6a5e; text-shadow: 0 0 18px rgba(216, 52, 60, 0.8); }
.ar-bleed-n:empty { display: none; }
`;
