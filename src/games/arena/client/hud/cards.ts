import type { Client, ClientKit } from '@platform/client';
import { MSG, type WaveCard } from '../../hud/messages';
import { clock, el, hidden, num } from './store';

/** How long a card stays up (seconds), and how long its numbers take to count up. */
const SHOW = 6.5;
const COUNT = 0.9;

/**
 * A wave won, on each fighter's screen (the server's `wave`): a card under the wave's place —
 * WAVE 7 CLEARED, then what they did in it counting up (the time it took, their kills, the gold
 * they earned, their damage), the party's best of it (in co-op, crowned) and what's coming next
 * (a boss's wave in blood). It arrives with the brass and the crowd's cheer, and goes after a few
 * seconds, leaving the break to the shop and the blessings.
 */
export function cards(): ClientKit {
  let unstyle: (() => void) | null = null;
  let layer: HTMLElement;
  let card: { el: HTMLElement; at: number; counts: { el: HTMLElement; to: number; fmt: (n: number) => string }[]; ticked: number } | null = null;

  const show = (client: Client, c: WaveCard) => {
    card?.el.remove();
    const cell = (k: string, cls = '') => {
      const v = el(`span.v${cls}`, '0');
      return { cell: el('div.ar-card-cell', v, el('span.k', k)), v };
    };
    const time = cell('Time');
    const kills = cell('Kills');
    const gold = cell('Gold', '.gold');
    const dmg = cell('Damage');
    const e = el(
      'div.ar-card',
      el('div.ar-card-q', el('i'), `Wave ${c.wave}`, el('i')),
      el('div.ar-card-t', 'Cleared'),
      el('div.ar-card-name', c.name),
      el('div.ar-card-row', time.cell, kills.cell, gold.cell, dmg.cell),
      c.mvp ? el(`div.ar-card-mvp${c.mvp.you ? '.you' : ''}`, el('i.ar-crown'), el('span.l', 'Best of the wave'), el('b', c.mvp.you ? 'You' : c.mvp.name), el('span', `${c.mvp.kills} kills`)) : null,
      c.next ? el(`div.ar-card-next${c.next.boss ? '.boss' : ''}`, el('span.l', c.next.boss ? 'Boss wave next' : 'Next'), el('b', `Wave ${c.next.wave} · ${c.next.name}`)) : null,
    );
    layer.append(e);
    card = {
      el: e,
      at: client.time,
      ticked: 0,
      counts: [
        { el: time.v, to: c.time, fmt: clock },
        { el: kills.v, to: c.kills, fmt: num },
        { el: gold.v, to: c.gold, fmt: (n) => `+${num(n)}` },
        { el: dmg.v, to: c.damage, fmt: num },
      ],
    };
    client.audio.play('ar_sting_cleared', { volume: 0.9 });
  };

  return {
    name: 'arena.hud.cards',
    setup(client) {
      unstyle = client.hud.style(CSS);
      layer = client.hud.layer('arena.cards', 'panels');
      client.on(MSG.wave, (d) => {
        const c = d as WaveCard;
        if (c && typeof c.wave === 'number' && typeof c.kills === 'number') show(client, c);
      });
    },
    frame(client) {
      layer.style.visibility = hidden(client) ? 'hidden' : '';
      if (!card) return;
      if (client.events.some((e) => e.t === 'reset')) {
        card.el.remove();
        card = null;
        return;
      }
      const t = client.time - card.at;
      // The numbers count up, one after another, a tick as each lands.
      card.counts.forEach((c, i) => {
        const u = Math.max(0, Math.min(1, (t - 0.45 - i * 0.18) / COUNT));
        const eased = 1 - Math.pow(1 - u, 3);
        c.el.textContent = c.fmt(c.to * eased);
      });
      const landed = card.counts.filter((_, i) => t - 0.45 - i * 0.18 >= COUNT).length;
      if (landed > card.ticked) {
        card.ticked = landed;
        client.audio.play('ar_tally', { pitch: 1 + landed * 0.08 });
      }
      if (t > SHOW) {
        const going = card.el;
        going.classList.add('out');
        window.setTimeout(() => going.remove(), 500);
        card = null;
      }
    },
    dispose() {
      unstyle?.();
    },
  };
}

const CSS = `
.ar-card {
  position: absolute; left: 50%; top: 150px; transform: translateX(-50%); width: 520px; padding: 16px 26px 16px;
  display: flex; flex-direction: column; align-items: center; color: var(--ar-fg, #f5efe4);
  background: radial-gradient(ellipse 80% 90% at 50% 0%, rgba(240, 192, 96, 0.12), transparent 70%), var(--ar-glass2, rgba(14, 10, 8, 0.82));
  box-shadow: inset 0 1px 0 rgba(240, 192, 96, 0.7), inset 0 0 0 1px var(--ar-line, rgba(224, 168, 96, 0.2)), 0 20px 50px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  animation: ar-card-in 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  transition: opacity 450ms ease, transform 450ms ease;
}
.ar-card.out { opacity: 0; transform: translate(-50%, -12px); }
.ar-card-q { display: flex; align-items: center; gap: 10px; font: 600 12px/1 var(--ar-label, sans-serif); letter-spacing: 0.4em; margin-right: -0.4em; text-transform: uppercase; color: var(--ar-gold, #f0c060); }
.ar-card-q i { width: 5px; height: 5px; background: var(--ar-gold, #f0c060); transform: rotate(45deg); }
.ar-card-t {
  margin-top: 8px; font: 800 44px/1 var(--ar-title, Georgia, serif); letter-spacing: 0.2em; margin-right: -0.2em; text-transform: uppercase;
  background: linear-gradient(180deg, #fff8e6 20%, var(--ar-gold, #f0c060) 70%, #b9802c); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 18px rgba(240, 192, 96, 0.35));
  animation: ar-card-slam 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both 80ms;
}
.ar-card-name { margin-top: 6px; font: 600 13px/1 var(--ar-title, Georgia, serif); letter-spacing: 0.2em; text-transform: uppercase; color: var(--ar-fg2, rgba(245, 239, 228, 0.7)); }
.ar-card-row { margin-top: 14px; width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--ar-line, rgba(224, 168, 96, 0.2)); padding-top: 12px; }
.ar-card-cell { display: flex; flex-direction: column; align-items: center; gap: 5px; border-left: 1px solid var(--ar-line, rgba(224, 168, 96, 0.2)); }
.ar-card-cell:first-child { border-left: 0; }
.ar-card-cell .v { font: 500 26px/1 var(--ar-label, sans-serif); font-variant-numeric: tabular-nums; color: var(--ar-fg, #f5efe4); }
.ar-card-cell .v.gold { color: var(--ar-gold-hi, #ffe3a1); }
.ar-card-cell .k { font: 500 10px/1 var(--ar-label, sans-serif); letter-spacing: 0.28em; text-transform: uppercase; color: var(--ar-fg3, rgba(245, 239, 228, 0.44)); }
.ar-card-mvp, .ar-card-next { margin-top: 12px; display: flex; align-items: center; gap: 9px; font: 500 12px/1 var(--ar-label, sans-serif); letter-spacing: 0.2em; text-transform: uppercase; color: var(--ar-fg2, rgba(245, 239, 228, 0.7)); animation: ar-card-fade 500ms ease both 1.4s; }
.ar-card-mvp b, .ar-card-next b { font: 700 14px/1 var(--ar-title, Georgia, serif); letter-spacing: 0.1em; color: var(--ar-fg, #f5efe4); }
.ar-card-mvp.you b { color: var(--ar-gold-hi, #ffe3a1); }
.ar-card-mvp .l, .ar-card-next .l { color: var(--ar-fg3, rgba(245, 239, 228, 0.44)); }
.ar-card-next { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.06); width: 100%; justify-content: center; animation-delay: 1.7s; }
.ar-card-next.boss .l, .ar-card-next.boss b { color: #ff6a5e; }
.ar-crown { width: 14px; height: 10px; background: var(--ar-gold, #f0c060); clip-path: polygon(0 100%, 0 20%, 25% 55%, 50% 0, 75% 55%, 100% 20%, 100% 100%); filter: drop-shadow(0 0 4px rgba(240, 192, 96, 0.8)); }
@keyframes ar-card-in { from { opacity: 0; transform: translate(-50%, 16px) scale(0.97); } }
@keyframes ar-card-slam { from { opacity: 0; transform: scale(1.25); letter-spacing: 0.5em; } }
@keyframes ar-card-fade { from { opacity: 0; transform: translateY(4px); } }
@media (max-width: 1100px), (max-height: 760px) { .ar-card { width: 440px; top: 132px; padding: 12px 20px; } .ar-card-t { font-size: 36px; } .ar-card-cell .v { font-size: 22px; } }
`;
