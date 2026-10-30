import type { GameContext } from '@platform';

/**
 * The regatta's own HUD widgets: a wind dial (top right: the wind's arrow round your boat, the
 * no-go zone you can't sail into, your tack) and the standings (top left).
 */
export function defineHud(game: GameContext): void {
  game.hud.define('wind', {
    at: 'top-right',
    html: `
      <div class="wind">
        <div class="dial" style="--a: {{rel}}deg">
          <div class="nogo"></div>
          <div class="arrow"><i></i></div>
          <div class="boat"></div>
        </div>
        <div class="txt">
          <b>{{kn}} kn</b>
          <span class="tag {{tagCls}}" data-if="tag">{{tag}}</span>
          <span class="tack">{{tack}}</span>
        </div>
      </div>`,
    css: `
      .wind { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 14px;
              background: rgba(8, 20, 34, 0.62); color: #eef6ff; font: 600 13px var(--sans) }
      .dial { position: relative; width: 84px; height: 84px; border-radius: 50%;
              border: 2px solid rgba(255, 255, 255, 0.35); background: rgba(47, 164, 231, 0.12) }
      .nogo { position: absolute; inset: 0; border-radius: 50%;
              background: conic-gradient(from calc(var(--a) - 30deg), rgba(255, 107, 90, 0.45) 0deg 60deg, transparent 60deg) }
      .arrow { position: absolute; inset: 0; transform: rotate(var(--a)); transition: transform 0.25s linear }
      .arrow i { position: absolute; left: 50%; top: -2px; width: 0; height: 0; margin-left: -8px;
                 border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 18px solid #ffd23f }
      .boat { position: absolute; left: 50%; top: 50%; width: 12px; height: 30px; margin: -15px 0 0 -6px;
              border-radius: 6px 6px 3px 3px; background: #f4f1ea }
      .txt { display: flex; flex-direction: column; gap: 2px; min-width: 96px }
      .txt b { font: 400 22px var(--pixel) }
      .tag { align-self: flex-start; padding: 1px 7px; border-radius: 99px; font-size: 11px; text-transform: uppercase }
      .tag.up { background: #1b4f8a; color: #bfe3ff }
      .tag.down { background: #5a3a1a; color: #ffd9a8 }
      .tack { opacity: 0.8; font-weight: 500 }`,
  });

  // A sailing tip for new skippers, bottom middle, up long enough to read (race.ts takes it down).
  game.hud.define('tip', {
    at: 'bottom',
    html: `<div class="tip"><span class="icon">⛵</span><span>{{text}}</span></div>`,
    css: `
      :scope { margin-bottom: 120px }
      .tip { display: flex; align-items: center; gap: 10px; max-width: 520px; padding: 10px 18px; border-radius: 14px;
             background: rgba(8, 20, 34, 0.78); color: #eef6ff; font: 600 15px var(--sans); line-height: 1.35;
             box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25); animation: rise 0.3s ease-out }
      .icon { font-size: 20px }
      @keyframes rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }`,
  });

  game.hud.define('standings', {
    at: 'top-left',
    html: `
      <div class="board">
        <div class="row {{cls}}" data-each="rows">
          <span class="pos">{{pos}}</span>
          <span class="chip" style="--c: {{color}}"></span>
          <span class="name">{{name}}</span>
          <span class="st">{{status}}</span>
        </div>
      </div>`,
    css: `
      .board { display: flex; flex-direction: column; gap: 2px; padding: 8px; border-radius: 12px;
               background: rgba(8, 20, 34, 0.55); color: #eef6ff; font: 500 13px var(--sans); min-width: 200px }
      .row { display: flex; align-items: center; gap: 8px; padding: 3px 8px; border-radius: 7px }
      .row.me { background: rgba(255, 210, 63, 0.22); font-weight: 700 }
      .pos { width: 14px; text-align: right; opacity: 0.75 }
      .chip { width: 10px; height: 10px; border-radius: 3px; background: var(--c) }
      .name { flex: 1 }
      .st { opacity: 0.7; font-size: 11px }`,
  });
}
