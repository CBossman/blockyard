import type { GameContext } from '@platform';

/**
 * The game's own HUD, as widgets (HTML and CSS filled in from data: the platform sends only what
 * changes): the status pill at the top (how many are left, your kills, the storm's timer), and your
 * shield, which stands on top of your health.
 */

const INK = '#12141a';
const ORANGE = '#ff8a2a';

export function defineHud(game: GameContext) {
  game.hud.define('status', {
    at: 'top',
    html: `
      <div class="wrap">
        <div class="pill">
          <div class="cell"><b>{{alive}}</b><small>left</small></div>
          <div class="cell"><b>{{kills}}</b><small>elims</small></div>
        </div>
        <div class="storm {{tone}}" data-if="storm">
          <span class="dot"></span><span class="what">{{storm}}</span><b class="time">{{time}}</b>
        </div>
      </div>`,
    css: `
      .wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; }
      .pill { display: flex; gap: 2px; background: ${INK}d9; border: 2px solid #000; border-radius: 10px; overflow: hidden; box-shadow: 0 3px 0 #0008; }
      .cell { display: flex; flex-direction: column; align-items: center; min-width: 62px; padding: 3px 12px 4px; }
      .cell + .cell { border-left: 2px solid #ffffff1f; }
      .cell b { font: 700 24px/1 var(--pixel); color: #fff; letter-spacing: 0.03em; }
      .cell small { font: 600 10px/1 var(--sans); text-transform: uppercase; letter-spacing: 0.12em; color: ${ORANGE}; margin-top: 2px; }
      .storm { display: flex; align-items: center; gap: 8px; padding: 4px 12px; background: ${INK}cc; border: 2px solid #000; border-radius: 999px; font: 600 12px/1 var(--sans); color: #e9e9ee; text-transform: uppercase; letter-spacing: 0.06em; }
      .storm .dot { width: 9px; height: 9px; border-radius: 50%; background: #b86bff; box-shadow: 0 0 8px #b86bff; }
      .storm .time { font: 700 15px/1 var(--pixel); color: #fff; }
      .storm.closing .dot { background: #ff4a5a; box-shadow: 0 0 10px #ff4a5a; animation: blink 0.8s infinite; }
      .storm.calm .dot { background: #5fd35f; box-shadow: 0 0 8px #5fd35f; }
      @keyframes blink { 50% { opacity: 0.25; } }`,
  });

  // The shield bar: sits above the platform's health bar (bottom left).
  game.hud.define('vitals', {
    at: 'bottom-left',
    html: `
      <div class="shield" data-if="shield > 0">
        <div class="bar"><i style="--fill: {{shield}}"></i></div><b>{{shield}}</b>
      </div>`,
    css: `
      :scope { margin-bottom: 42px; }
      .shield { display: flex; align-items: center; gap: 8px; }
      .bar { width: 178px; height: 14px; background: #0009; border: 2px solid #000; border-radius: 4px; overflow: hidden; }
      .bar i { display: block; height: 100%; width: calc(var(--fill) * 1%); background: linear-gradient(#7cc4ff, #3a86e8); transition: width 0.15s; }
      b { font: 700 16px/1 var(--pixel); color: #fff; text-shadow: 0 2px 0 #000; }`,
  });
}

export const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
