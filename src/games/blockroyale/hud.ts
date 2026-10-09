import type { GameContext } from '@platform';

/**
 * The game's own HUD, as widgets (HTML and CSS filled in from data: the platform sends only what
 * changes): the status pill at the top (how many are left, your kills, the storm's timer), your
 * shield, which stands on top of your health, and how to drop, while you're on the bus.
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

  // How to drop: up while you're on the bus (parked, and crossing), gone once you're off it.
  game.hud.define('tips', {
    at: 'left',
    html: `
      <div class="card">
        <h4>How to drop</h4>
        <ul>
          <li><kbd>WASD</kbd><span>walk off either side of the bus</span></li>
          <li><kbd>W</kbd><span>dive: steeper and faster</span></li>
          <li><kbd>Space</kbd><span>open or close your parachute</span></li>
          <li><kbd>E</kbd><span>open a chest</span></li>
          <li><kbd>1-5</kbd><span>rifle, shotgun, SMG, sniper, pistol</span></li>
          <li><kbd>6-9</kbd><span>bandage, med kit, shield, frag</span></li>
          <li><kbd>M</kbd><span>the map: the orange line is the bus's way</span></li>
        </ul>
      </div>`,
    css: `
      :scope { margin-left: 14px; }
      .card { width: 252px; padding: 10px 12px 8px; background: ${INK}d9; border: 2px solid #000; border-radius: 10px; box-shadow: 0 3px 0 #0008; }
      h4 { margin: 0 0 6px; font: 700 15px/1 var(--pixel); letter-spacing: 0.08em; text-transform: uppercase; color: ${ORANGE}; }
      ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 5px; }
      li { display: flex; align-items: center; gap: 8px; font: 500 12px/1.2 var(--sans); color: #e9e9ee; }
      kbd { flex: none; min-width: 42px; padding: 3px 5px; text-align: center; font: 700 11px/1 var(--sans); color: #fff; background: #ffffff1f; border: 1px solid #ffffff38; border-bottom-width: 2px; border-radius: 5px; }
      @media (max-width: 720px), (max-height: 520px) { .card { display: none; } }`,
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
