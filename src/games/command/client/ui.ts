import type { Client } from '@platform/client';
import { ABILITIES, RETREAT, SIGHT, AGE_NAMES, AGE_NEEDS, BOARDS, BUILDABLE, BUILDINGS, BUILD_KEYS, DOCTRINES, HIGH, MODES, NEEDS, STANCES, TEAM_COLORS, TECHS, TECH_IDS, VET, ageOf, versusText, UNITS, type BuildingKind, type DoctrineId, type UnitKind } from '../defs';
import { BASES, CAMPS, FLOOR, HALF, HILLS, LAKES, MESAS, SHUT, TREES, WALL_CELL, deposits, inHill, inLake, inMesa, lakeOf, landShut, wallLine, wallSnap } from '../map';
import { DRESSING } from '../dressing';
import { UNIT_ORDER, cargoBits, rankBits, stanceBits, type State } from '../protocol';
import { cam, drag, lookAt, setDrift, toGround, toScreen, view, zoom } from './camera';
import { iconHtml, iconPath, withIcons } from './icons';
import { drawFog, mountFog } from './fog';
import { say, voices } from './sounds';
import { activity, drawnAt, frameGhost } from './units';
import { FRONT_CSS, drawFront, setupFront, showSetup } from './front';
import { PANEL_CSS, drawPanels, openSay, setupPanels, toggleTech } from './panels';
import { variantOf } from '../models';

/**
 * Each commander's interface, in the manner of a strategy game's: a slim bar along the top (steel,
 * oil, people, the clock and the mode, the players), and a command bar along the bottom made of the
 * minimap, what's selected (portraits of the units, or the building's status and queue) and a grid
 * of command buttons (build, train, the special power) with their hotkeys. On the field: a ring in
 * its team's colour under each unit and building, health bars, the box being dragged, the building
 * being placed.
 *
 * Controls: left click and drag select (double click: every one of that kind on screen; shift adds);
 * right click orders (move, attack, gather, or a rally point for a building); Q then a click, or Q
 * held with a right click, attack-moves; H halts; Z X C V and the grid's other keys are the commands
 * shown; P calls the special power; the minimap takes a click to look there and a right click to send
 * the selection; WASD, the arrows or the screen's edge move the view, the wheel zooms.
 */

export interface U {
  id: number;
  kind: UnitKind;
  seat: number;
  x: number;
  z: number;
  hp: number;
  /** Which way it faces (radians), and what it's at: 1 working, 2 carrying steel, 4 carrying oil. */
  yaw: number;
  flags: number;
}
export interface B {
  id: number;
  kind: BuildingKind;
  seat: number;
  x: number;
  z: number;
  hp: number;
  built: number;
  queue: number;
  /** How many are inside it (a bunker). */
  held: number;
}

export const ui = {
  state: null as State | null,
  units: [] as U[],
  buildings: [] as B[],
  eyes: { all: false, eyes: [] as number[] },
  sel: new Set<number>(),
  selB: null as number | null,
  placing: null as BuildingKind | null,
  /** The next left click attack-moves (Q), or aims the special power (P). */
  aim: null as 'attack' | 'power' | 'patrol' | 'ability' | null,
  /** Whose ability is being aimed; how many seconds each of ours has left to recharge its own. */
  abKind: null as UnitKind | null,
  cd: new Map<number, number>(),
  /** The mines this screen may know of: [x, z, ours] in a row. */
  mines: [] as number[],
  mouse: null as { x: number; z: number } | null,
  groups: new Map<string, number[]>(),
  centred: false,
  /** Where something of ours was hit, and when: a ring on the minimap. */
  pings: [] as { x: number; z: number; at: number }[],
  /** The latest alerts, to jump to; and each building's queue and each unit's orders, from the server. */
  alerts: [] as { x: number; z: number; what: string; clock: string }[],
  prod: new Map<number, number[]>(),
  orders: new Map<number, number[]>(),
  /** Marks on the ground: where an order went, where someone pinged. */
  /** This side's buildings set to keep training. */
  loops: new Set<number>(),
  marks: [] as { x: number; z: number; at: number; color: string; life: number; big?: boolean }[],
  /** What the minimap shows: all, armies, economy, territory. */
  miniMode: 0,
  doctrine: 'industrial' as DoctrineId,
};

let client: Client;
let root: HTMLElement;
let svg: SVGSVGElement;
let boxEl: HTMLElement;
let mini: HTMLCanvasElement;
export const el = <T extends Element = HTMLElement>(q: string) => root.querySelector<T>(q)!;
/** Text that came from a person, safe to put in the page. */
export const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const DEPOSITS = deposits();
const MAP_DEPOSITS = DEPOSITS.length;
/** The wrecks and ruins the fighting has left, as deposits like the map's own. */
export function mergeSalvage(s: State): void {
  if (s.phase === 'lobby') DEPOSITS.length = MAP_DEPOSITS;
  for (const n of s.salvage) if (!DEPOSITS[n.id]) DEPOSITS[n.id] = { ...n, amount: s.deposits[n.id] ?? 0, salvage: true };
}
const MINI = 168;

export const mySeat = (): number => {
  const id = client.me.id;
  return id && ui.state ? (ui.state.mine[id] ?? -1) : -1;
};
/** A unit's or building's picture, in a seat's colours (ours, unless it's someone else's). */
export const pic = (kind: string, seat = mySeat()) => `ic_${kind}_${variantOf(seat < 0 ? 1 : seat)}`;
export const color = (seat: number) => (seat >= 6 ? '#aab4c2' : seat < 0 ? '#cfd8e6' : TEAM_COLORS[seat % TEAM_COLORS.length]);
export const mine = () => ui.units.filter((u) => u.seat === mySeat());
export const meSeat = () => ui.state?.seats.find((s) => s.seat === mySeat());

const CSS = `
/* (Order cursors.) */
html.cm-c-attack body *:not(.ui):not(.ui *) { cursor: crosshair !important; }
html.cm-c-gather body *:not(.ui):not(.ui *) { cursor: grab !important; }
html.cm-c-place body *:not(.ui):not(.ui *) { cursor: cell !important; }
html.cm-c-move body *:not(.ui):not(.ui *) { cursor: move !important; }
html.cm-c-own body *:not(.ui):not(.ui *) { cursor: pointer !important; }
.cm-mm { position: absolute; left: 15px; bottom: 11px; display: flex; gap: 1px; }
.cm-mm button { font: inherit; font-size: 10px; font-weight: 700; padding: 0 5px; line-height: 14px; color: #c9d6e3; background: rgba(11,17,24,0.85); border: 1px solid #3a526b; cursor: pointer; }
.cm-mm button.on { color: #ffe0a8; border-color: var(--hi); }
.cm-alt { position: absolute; top: 76px; left: 50%; transform: translateX(-50%); padding: 3px 12px; font-size: 13px; background: rgba(11,17,24,0.85); border: 1px solid #4a6684; border-radius: 3px; display: none; }
.cm-tech-btn { font: inherit; font-size: 14px; height: 30px; padding: 0 10px; border-radius: 4px; border: 2px solid var(--edge); background: rgba(255,255,255,0.06); color: #e8eef5; cursor: pointer; margin-right: 6px; }
.cm { position: absolute; inset: 0; pointer-events: none; font-family: 'Chakra Petch', 'Rajdhani', system-ui, sans-serif; color: #e8eef5; user-select: none; --bg: #0e151d; --panel: #141f2b; --edge: #2c3e52; --hi: #ff9d2e; --dim: #8497ad; }
.cm .ui { pointer-events: auto; }
.cm-top { position: absolute; top: 0; left: 0; right: 0; height: 42px; display: flex; align-items: center; gap: clamp(8px, 1.4vw, 22px); padding: 0 16px; background: linear-gradient(#0b1118, rgba(11,17,24,0.82)); border-bottom: 2px solid var(--edge); font-weight: 600; }
.cm-res { display: flex; align-items: center; gap: 7px; white-space: nowrap; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
.cm-res img { width: 30px; height: 30px; object-fit: contain; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.6)); }
.cm-res small { font-size: 14px; color: var(--dim); font-weight: 600; }
.cm-res.warn { color: #ff6a5a; }
.cm-mid { margin: 0 auto; display: flex; gap: clamp(8px, 1.2vw, 18px); white-space: nowrap; font-size: 15px; color: var(--dim); letter-spacing: 1px; text-transform: uppercase; }
.cm-mid b { color: #e8eef5; }
.cm-players { display: flex; gap: 6px; font-size: 13px; margin-right: 96px; }
.cm-pl { display: flex; align-items: center; gap: 5px; padding: 2px 8px 2px 5px; border-radius: 4px; background: rgba(255,255,255,0.05); }
.cm-pl i { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }
.cm-pl.dead { opacity: 0.35; text-decoration: line-through; }
.cm-pl small { color: var(--dim); }
.cm-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 192px; display: grid; grid-template-columns: 196px 1fr 292px; background: linear-gradient(#18232f, #0c1219); border-top: 3px solid #3a526b; box-shadow: 0 -8px 24px rgba(0,0,0,0.45); }
.cm-bar > div { padding: 8px 10px; border-right: 2px solid #0a0f15; }
.cm-bar > div:last-child { border-right: 0; }
.cm-mini { padding: 8px 14px 8px 12px !important; display: grid; place-items: center; }
.cm-mini canvas { display: block; border: 3px solid #3a526b; border-radius: 3px; background: #1d4a2e; cursor: crosshair; box-shadow: inset 0 0 12px rgba(0,0,0,0.5); }
.cm-info { position: relative; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
.cm-info h3 { margin: 0; font-size: 21px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--hi); }
.cm-info .sub { font-size: 14px; color: var(--dim); line-height: 1.3; font-weight: 500; }
.cm-info .row { display: flex; gap: 12px; align-items: flex-start; }
.cm-info img.big { width: 92px; height: 92px; object-fit: contain; background: radial-gradient(#2a3b4e, #121b25); border: 2px solid var(--edge); border-radius: 4px; flex: none; }
.cm-hpbar { height: 9px; background: #0a0f15; border: 1px solid #2c3e52; border-radius: 2px; overflow: hidden; margin-top: 3px; }
.cm-hpbar > i { display: block; height: 100%; background: #4cd04a; }
.cm-qbar > i { background: var(--hi); }
.cm-portraits { display: grid; grid-template-columns: repeat(auto-fill, 46px); gap: 4px; align-content: start; overflow: hidden; max-height: 100px; }
.cm-pt { position: relative; width: 46px; height: 46px; background: radial-gradient(#2a3b4e, #121b25); border: 2px solid var(--edge); border-radius: 3px; }
.cm-pt img { width: 100%; height: 100%; object-fit: contain; }
.cm-pt .hp { position: absolute; left: 3px; right: 3px; bottom: 2px; height: 4px; background: #0a0f15; } .cm-pt .hp i { display: block; height: 100%; background: #4cd04a; }
.cm-grid { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 1fr; gap: 6px; padding: 8px !important; }
.cb { position: relative; cursor: pointer; background: linear-gradient(#233246, #172231); border: 2px solid #3a526b; border-radius: 4px; padding: 0; color: #e8eef5; font-family: inherit; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; overflow: hidden; }
.cb:hover { border-color: var(--hi); background: linear-gradient(#2c3f56, #1b2a3b); }
.cb img { position: absolute; top: 2px; left: 50%; transform: translateX(-50%); width: 34px; height: 34px; object-fit: contain; }
.cb .g { position: absolute; top: 3px; left: 0; right: 0; font-size: 21px; text-align: center; line-height: 28px; }
.cb .n { position: relative; z-index: 1; font-size: 10px; font-weight: 700; letter-spacing: 0; padding: 0 2px 2px; text-transform: uppercase; text-shadow: 0 1px 2px #000; line-height: 1.05; text-align: center; }
.cb .k { position: absolute; top: 2px; left: 4px; font-size: 11px; font-weight: 700; color: var(--hi); }
.cb .c { position: absolute; top: 2px; right: 4px; font-size: 10px; font-weight: 700; color: #d8e4f0; text-align: right; line-height: 1.1; text-shadow: 0 1px 2px #000; }
.cb.on { border-color: var(--hi); box-shadow: 0 0 10px rgba(255,157,46,0.6); }
.cb.no { opacity: 0.42; cursor: default; }
.cb.empty { visibility: hidden; }
.cb .cd { position: absolute; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; font-size: 17px; font-weight: 700; }
.cm-hint { position: absolute; bottom: 204px; left: 50%; transform: translateX(-50%); padding: 7px 16px; font-size: 15px; font-weight: 600; background: rgba(11,17,24,0.88); border: 2px solid var(--edge); border-radius: 4px; white-space: nowrap; pointer-events: none; }
.cm-hint:empty { display: none; }
.cm-lobby { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(6,10,15,0.7); pointer-events: auto; }
.cm-lobby .ui { padding: 22px 26px; width: min(860px, 94vw); text-align: center; background: linear-gradient(#18232f, #0e151d); border: 3px solid #3a526b; border-radius: 6px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
.cm-lobby h1 { margin: 0; font-size: 40px; letter-spacing: 4px; text-transform: uppercase; color: var(--hi); }
.cm-lobby h2 { margin: 16px 0 8px; font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: var(--dim); }
.cm-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.cm-pick { cursor: pointer; border: 2px solid #2c3e52; font-family: inherit; border-radius: 4px; background: #172231; padding: 12px 10px; color: #e8eef5; text-align: center; }
.cm-pick:hover { border-color: #5d7a99; } .cm-pick.on { border-color: var(--hi); background: #2a2218; }
.cm-pick b { display: block; font-size: 19px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
.cm-pick span { font-size: 13px; color: var(--dim); display: block; line-height: 1.3; } .cm-pick em { font-style: normal; font-size: 12px; font-weight: 700; color: #6ad06a; display: block; margin-top: 5px; }
.cm-box { position: absolute; border: 1px solid #7dff7d; background: rgba(125,255,125,0.1); display: none; pointer-events: none; }
.cm svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.cm-tip { display: none; position: absolute; right: 8px; bottom: 202px; width: 300px; padding: 10px 12px; background: linear-gradient(#1b2836, #0f1720); border: 2px solid #4a6684; border-radius: 5px; box-shadow: 0 8px 24px rgba(0,0,0,0.55); font-size: 13px; line-height: 1.35; pointer-events: none; }
.cm-hover { display: none; position: absolute; z-index: 5; max-width: 280px; padding: 7px 10px; background: rgba(11,17,24,0.92); border: 2px solid #4a6684; border-radius: 4px; font-size: 13px; line-height: 1.35; pointer-events: none; box-shadow: 0 6px 18px rgba(0,0,0,0.5); }
.cm-hover h4 { margin: 0; font-size: 15px; color: #fff; display: flex; align-items: center; gap: 6px; }
.cm-hover h4 i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; flex: none; }
.cm-hover .who { color: var(--dim); font-size: 12px; }
.cm-hover .doing { margin-top: 3px; font-weight: 700; }
.cm-hover p { margin: 3px 0 0; color: #b9c7d6; font-size: 12px; }
.cm-tip b { display: block; font-size: 17px; color: var(--hi); letter-spacing: 0.5px; text-transform: uppercase; }
.cm-tip p { margin: 6px 0; color: #c9d6e3; }
.cm-tip em { font-style: normal; color: #ff8a6a; font-weight: 700; }
.tcost { display: flex; gap: 12px; margin-top: 3px; font-weight: 700; font-size: 14px; }
.tc { display: inline-flex; align-items: center; gap: 4px; } .tc img { width: 18px; height: 18px; object-fit: contain; }
.tstats { display: flex; flex-wrap: wrap; gap: 6px; } .tstats span { background: rgba(255,255,255,0.07); border-radius: 3px; padding: 1px 6px; font-weight: 600; }
.tsub { margin-top: 6px; color: var(--dim); } .tkey { margin-top: 6px; color: var(--dim); font-size: 12px; }
.tkey kbd { font-family: inherit; color: var(--hi); border: 1px solid #4a6684; border-radius: 3px; padding: 0 5px; }
.cm-idle { position: absolute; left: 12px; bottom: 202px; display: none; align-items: center; gap: 6px; padding: 5px 10px 5px 6px; font-family: inherit; font-size: 14px; font-weight: 700; color: #ffe08a; background: linear-gradient(#3a2e14, #221a0b); border: 2px solid #c8962e; border-radius: 4px; cursor: pointer; box-shadow: 0 0 12px rgba(255,180,40,0.35); animation: cm-pulse 1.6s ease-in-out infinite; }
.cm-idle img { width: 26px; height: 26px; object-fit: contain; }
@keyframes cm-pulse { 50% { box-shadow: 0 0 18px rgba(255,180,40,0.7); } }
.cm-group { display: flex; flex-wrap: wrap; gap: 6px; }
.cm-gc { position: relative; width: 62px; height: 62px; background: radial-gradient(#2a3b4e, #121b25); border: 2px solid var(--edge); border-radius: 4px; cursor: pointer; }
.cm-gc:hover { border-color: var(--hi); }
.cm-gc img { width: 100%; height: 100%; object-fit: contain; }
.cm-gc .n { position: absolute; top: 1px; right: 4px; font-size: 15px; font-weight: 700; text-shadow: 0 1px 2px #000; }
.cm-gc .hp { position: absolute; left: 4px; right: 4px; bottom: 3px; height: 5px; background: #0a0f15; } .cm-gc .hp i { display: block; height: 100%; }
.cm-stats { display: flex; gap: 6px; flex-wrap: wrap; font-size: 13px; font-weight: 600; } .cm-stats span { background: rgba(255,255,255,0.06); border-radius: 3px; padding: 1px 7px; }
.cm-stars { color: #ffd23a; letter-spacing: 1px; font-size: 16px; margin-left: 6px; text-shadow: 0 1px 2px #000; }
.cm-voice { font-family: inherit; font-size: 15px; width: 34px; height: 30px; border-radius: 4px; border: 2px solid var(--edge); background: rgba(255,255,255,0.06); color: #e8eef5; cursor: pointer; margin-right: 6px; }
.cm-voice.off { opacity: 0.45; }
.cm-pl em { font-style: normal; font-size: 11px; color: #ffc83a; }
.cm-ask { position: absolute; inset: 0; display: none; place-items: center; background: rgba(6,10,15,0.55); pointer-events: auto; z-index: 30; }
.cm-ask .box { width: min(340px, 92vw); padding: 20px 22px 16px; text-align: center; background: linear-gradient(#18232f, #0e151d); border: 3px solid #3a526b; border-radius: 6px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
.cm-ask h2 { margin: 0; font-size: 22px; letter-spacing: 2px; text-transform: uppercase; color: #fff; }
.cm-ask p { margin: 6px 0 14px; color: var(--dim); font-size: 14px; }
.cm-ask button { display: block; width: 100%; margin: 8px 0; padding: 10px; font: inherit; font-size: 16px; font-weight: 700; color: #e8eef5; background: #172231; border: 2px solid #3a526b; border-radius: 4px; cursor: pointer; }
.cm-ask button:hover { border-color: var(--hi); background: #22303f; }
.cm-ask button.go { background: #3a2a12; border-color: var(--hi); color: #ffe0a8; }
.cm-ask button.warn { background: #4a1712; border-color: #f04438; color: #ffd6cf; }
.cm-sum { position: absolute; inset: 0; display: none; place-items: center; background: rgba(6,10,15,0.72); pointer-events: auto; z-index: 25; }
.cm-sum .ui { width: min(900px, 95vw); max-height: 92vh; overflow: auto; padding: 20px 24px; background: linear-gradient(#18232f, #0e151d); border: 3px solid #3a526b; border-radius: 6px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
.cm-sum h1 { margin: 0; text-align: center; font-size: 34px; letter-spacing: 3px; text-transform: uppercase; color: var(--hi); }
.cm-sum .when { text-align: center; color: var(--dim); font-size: 15px; margin: 2px 0 14px; }
.cm-sum table { width: 100%; border-collapse: collapse; font-size: 15px; }
.cm-sum th { text-align: right; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); padding: 4px 8px; border-bottom: 2px solid #2c3e52; }
.cm-sum th:first-child, .cm-sum td:first-child { text-align: left; }
.cm-sum td { text-align: right; padding: 6px 8px; font-weight: 600; border-bottom: 1px solid #1d2a38; }
.cm-sum td i { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 7px; vertical-align: -1px; }
.cm-sum tr.won td:first-child::after { content: ' ★'; color: #ffd23a; }
.cm-sum h2 { margin: 16px 0 6px; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: var(--dim); }
.cm-sum svg.chart { position: static; width: 100%; height: 190px; background: #0b1118; border: 1px solid #2c3e52; border-radius: 4px; }
.cm-sum .btns { display: flex; justify-content: center; gap: 12px; margin-top: 16px; }
.cm-sum button { font-family: inherit; font-size: 17px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 9px 22px; border-radius: 4px; cursor: pointer; border: 2px solid #3a526b; background: #172231; color: #e8eef5; }
.cm-sum button.go { border-color: var(--hi); background: #3a2a12; color: #ffe0a8; }
`;

export function setupUi(c: Client): void {
  client = c;
  c.hud.style(CSS + FRONT_CSS + PANEL_CSS);
  root = c.hud.layer('command');
  root.className = 'cm';
  root.innerHTML = `
    <svg></svg><div class="cm-box"></div>
    <div class="cm-top ui"><div class="cm-res steel"></div><div class="cm-res oil"></div><div class="cm-res pop"></div><div class="cm-mid"></div><button class="cm-tech-btn" title="The tech tree (K)">Tech</button><button class="cm-tech-btn cm-menu-btn" title="Menu (F10)">Menu</button><button class="cm-voice" title="Unit voices on / off"></button><div class="cm-players"></div></div>
    <div class="cm-sum"><div class="ui"></div></div>
    <div class="cm-hint"></div><div class="cm-tip"></div><div class="cm-hover"></div><button class="cm-idle ui" title="Select idle engineers (.)"></button>
    <div class="cm-bar ui"><div class="cm-mini"><canvas width="${MINI}" height="${MINI}"></canvas><div class="cm-mm">${['All', 'Army', 'Eco', 'Land'].map((n, k) => `<button data-mm="${k}">${n}</button>`).join('')}</div></div><div class="cm-info"></div><div class="cm-grid"></div></div>
    <div class="cm-ask ui"><div class="box"><h2>Battle menu</h2><p>The fight goes on while this is open.</p><button class="go" data-ask="back">Back to the battle</button><button data-ask="quit">Surrender</button></div></div><div class="cm-lobby"></div><div class="cm-brief"></div><div class="cm-dock ui"></div><div class="cm-groups ui"></div><div class="cm-chat"></div><div class="cm-say ui"><input maxlength="160"></div><div class="cm-tech"></div><div class="cm-peace"></div><div class="cm-alt">Ranges · sight · health · territory. Alt + click to ping.</div>`;
  svg = el<SVGSVGElement>('svg');
  boxEl = el('.cm-box');
  mini = el<HTMLCanvasElement>('.cm-mini canvas');
  setupFront(c);
  setupPanels(c);
  el('.cm-tech-btn').addEventListener('click', toggleTech);
  el('.cm-menu-btn').addEventListener('click', () => askMenu(true));
  el('.cm-ask').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ask]');
    if (!b) return;
    if (b.dataset.ask === 'back') return askMenu(false);
    // (Twice, so a slip of the mouse doesn't end the match.)
    if (!b.classList.contains('warn')) {
      b.classList.add('warn');
      b.textContent = 'Really surrender?';
      return;
    }
    client.send('resign', {});
    askMenu(false);
  });
  el('.cm-mm').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mm]');
    if (b) ui.miniMode = Number(b.dataset.mm);
  });
  el('.cm-grid').addEventListener('mouseover', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
    const c = b ? commands()[Number(b.dataset.cmd)] : undefined;
    const tip = el('.cm-tip');
    if (!c?.tip) return void (tip.style.display = 'none');
    tip.innerHTML = withIcons(c.tip) + `<div class="tkey">Hotkey <kbd>${c.key}</kbd></div>`;
    tip.style.display = 'block';
  });
  el('.cm-grid').addEventListener('mouseleave', () => (el('.cm-tip').style.display = 'none'));
  el('.cm-idle').addEventListener('click', selectIdle);
  mountFog(root);
  el('.cm-voice').addEventListener('click', () => {
    voices.toggle();
    draw();
  });
  el('.cm-sum').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sum]');
    if (b?.dataset.sum === 'rematch') client.send('rematch', {});
    else if (b?.dataset.sum === 'again') {
      showSetup();
      client.send('again', {});
    }
    else if (b?.dataset.sum === 'close') el('.cm-sum').dataset.closed = '1';
    draw();
  });
  el('.cm-info').addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]');
    if (card) select(ui.units.filter((u) => ui.sel.has(u.id) && u.kind === card.dataset.kind).map((u) => u.id), null);
  });
  el('.cm-grid').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
    if (b) runCommand(Number(b.dataset.cmd));
  });
  listenMini();
  listen();
  draw();
}

// ---------------------------------------------------------------------------------------------
// Commands: the grid's buttons, which depend on what's selected, and their hotkeys.

interface Cmd {
  key: string;
  code: string;
  name: string;
  icon?: string;
  glyph?: string;
  cost?: string;
  ok: boolean;
  on?: boolean;
  cooldown?: number;
  /** What the button's tooltip says (HTML): what it is, its cost and what it does. */
  tip?: string;
  run: () => void;
}

const res = (id: string, n: number) => (n ? `<span class="tc">${client.hud.icon({ item: id }).outerHTML}${n}</span>` : '');
const tipCost = (c: { steel: number; oil: number }, seconds?: number) => `<div class="tcost">${res('ic_steel', c.steel)}${res('ic_oil', c.oil)}${seconds ? `<span class="tc">⏱ ${seconds}s</span>` : ''}</div>`;
const unitTip = (k: UnitKind, cost: { steel: number; oil: number }, locked: string) => {
  const d = UNITS[k];
  const hits = d.hits === 'air' ? 'air only' : d.hits === 'both' ? 'ground and air' : 'ground';
  return `<b>${d.name}</b>${tipCost(cost, d.time)}<p>${d.blurb}</p><div class="tstats"><span>♥ ${d.hp}</span><span>⚔ ${d.damage}${d.splash ? ' splash' : ''}</span><span>⌖ ${d.range}</span><span>» ${d.speed}</span><span>☻ ${d.pop}</span></div><div class="tsub"><b style="display:inline;font-size:13px;color:#9fe08a;text-transform:none">${versusText(k)}</b><br>Hits ${hits}.${locked ? ` <em>Needs ${locked}.</em>` : ''}</div>`;
};
const costText = (c: { steel: number; oil: number }) => [c.steel ? `${c.steel}` : '', c.oil ? `${c.oil}●` : ''].filter(Boolean).join(' ');

function commands(): Cmd[] {
  const s = ui.state;
  const me = meSeat();
  if (!s || !me || s.phase !== 'play') return [];
  const can = (c: { steel: number; oil: number }) => me.steel >= c.steel && me.oil >= c.oil;
  const has = (k: BuildingKind) => ui.buildings.some((x) => x.seat === me.seat && x.kind === k && x.built >= 100);
  const age = ageOf(me.techs);
  const out: Cmd[] = [];
  const b = ui.selB !== null ? ui.buildings.find((x) => x.id === ui.selB) : undefined;
  const us = ui.units.filter((u) => ui.sel.has(u.id));
  if (b && b.built >= 100) {
    const def = BUILDINGS[b.kind];
    def.trains.forEach((t, i) => {
      const k = me.doctrine === 'intel' && t === 'rifle' ? 0.75 : 1;
      const cost = { steel: Math.round(UNITS[t].cost.steel * k), oil: Math.round(UNITS[t].cost.oil * k) };
      const locked = age < (AGE_NEEDS[t] ?? 1);
      const heroHave = UNITS[t].limit !== undefined && (me.hero || ui.units.some((x) => x.seat === me.seat && x.kind === t));
      out.push({ key: 'ZXC'[i], code: `Key${'ZXC'[i]}`, name: UNITS[t].name, icon: pic(t), cost: heroHave ? 'have one' : locked ? AGE_NAMES[AGE_NEEDS[t] ?? 1] : costText(cost), tip: unitTip(t, cost, locked ? AGE_NAMES[AGE_NEEDS[t] ?? 1] : ''), ok: !heroHave && !locked && can(cost) && me.pop + UNITS[t].pop <= me.cap, run: () => client.send('train', { id: b.id, kind: t }) });
    });
    if (def.trains.length) out.push({ key: 'V', code: 'KeyV', name: 'Cancel', glyph: '✕', ok: b.queue >= 0 && b.queue < 1000, run: () => client.send('cancel', { id: b.id }) });
    if (def.trains.length) out.push({ key: 'N', code: 'KeyN', name: 'Repeat', glyph: '⟳', ok: true, on: ui.loops.has(b.id), cost: ui.loops.has(b.id) ? 'on' : 'off', tip: '<b>Repeat</b><p>Keeps training the last unit you ordered here, as long as you can pay for it and have the room. Cancel stops it.</p>', run: () => client.send('repeat', { id: b.id }) });
    (def.research ?? []).forEach((tech, i) => {
      const t = TECHS[tech];
      const done = me.techs.includes(tech);
      const rk = (def.trains.length ? 'CB' : 'ZXCV')[i];
      const era = tech === 'age2' || tech === 'age3';
      const gated = tech === 'age3' && !me.techs.includes('age2');
      out.push({ key: rk, code: `Key${rk}`, name: t.name, glyph: era ? '▲' : '⚙', cost: done ? 'done' : gated ? 'needs Era II' : costText(t.cost), tip: `<b>${t.name}</b>${tipCost(t.cost, t.time)}<p>${t.blurb}</p>${done ? '<div class="tsub">Researched.</div>' : gated ? '<div class="tsub"><em>Needs Era II.</em></div>' : ''}`, ok: !done && !gated && b.queue < 1000 && can(t.cost), on: b.queue >= 1000 && TECH_IDS[Math.floor(b.queue / 1000) - 1] === tech, run: () => client.send('research', { id: b.id, tech }) });
    });
    if (b.kind === 'market') {
      const [forSteel, forOil] = me.trade ?? [0, 0];
      out.push({ key: 'Z', code: 'KeyZ', name: 'Sell steel', glyph: '⇄', cost: `+${forSteel}●`, ok: me.steel >= 100, tip: `<b>Sell 100 steel</b><p>For ${forSteel} oil now. Each sale gets less for the next; the price climbs back slowly.</p>`, run: () => client.send('trade', { id: b.id, sell: 'steel' }) });
      out.push({ key: 'X', code: 'KeyX', name: 'Sell oil', glyph: '⇄', cost: `+${forOil}`, ok: me.oil >= 100, tip: `<b>Sell 100 oil</b><p>For ${forOil} steel now. Each sale gets less for the next; the price climbs back slowly.</p>`, run: () => client.send('trade', { id: b.id, sell: 'oil' }) });
    }
    if (def.holds) out.push({ key: 'U', code: 'KeyU', name: 'Unload', glyph: '⇪', cost: `${b.held}/${def.holds}`, ok: b.held > 0, tip: `<b>Unload</b><p>Everyone out of the ${def.name}, round it.</p><div class="tsub">Right click it with infantry to send them in.</div>`, run: () => client.send('unload', { id: b.id, boat: false }) });
  } else if (us.length) {
    if (us.some((u) => u.kind === 'engineer')) {
      BUILDABLE.forEach((k) => {
        const need = NEEDS[k];
        const key = BUILD_KEYS[k];
        out.push({
          key,
          code: `Key${key}`,
          name: BUILDINGS[k].name,
          icon: pic(k),
          cost: age < (AGE_NEEDS[k] ?? 1) ? AGE_NAMES[AGE_NEEDS[k] ?? 1] : need && !has(need) ? `needs ${BUILDINGS[need].name}` : costText(BUILDINGS[k].cost),
          ok: age >= (AGE_NEEDS[k] ?? 1) && can(BUILDINGS[k].cost) && (!need || has(need)),
          tip: `<b>${BUILDINGS[k].name}</b>${tipCost(BUILDINGS[k].cost, BUILDINGS[k].time)}<p>${BUILDINGS[k].blurb}</p><div class="tstats"><span>♥ ${BUILDINGS[k].hp}</span>${BUILDINGS[k].pop ? `<span>☻ +${BUILDINGS[k].pop}</span>` : ''}</div>${age < (AGE_NEEDS[k] ?? 1) ? `<div class="tsub"><em>Needs ${AGE_NAMES[AGE_NEEDS[k] ?? 1]}.</em></div>` : need && !has(need) ? `<div class="tsub"><em>Needs a ${BUILDINGS[need].name}.</em></div>` : ''}`,
          on: ui.placing === k,
          run: () => {
            ui.placing = ui.placing === k ? null : k;
            ui.aim = null;
            draw();
          },
        });
      });
    }
    if (us.some((u) => u.kind !== 'engineer')) {
      out.push({
        key: 'Q',
        code: 'KeyQ',
        name: 'Attack',
        tip: '<b>Attack-move</b><p>Click where to go: they fight whatever they meet on the way.</p>',
        glyph: '⌖',
        ok: true,
        on: ui.aim === 'attack',
        run: () => {
          ui.aim = ui.aim === 'attack' ? null : 'attack';
          ui.placing = null;
          draw();
        },
      });
    }
    if (us.some((u) => u.kind !== 'engineer' && !UNITS[u.kind].naval)) {
      out.push({ key: 'Y', code: 'KeyY', name: 'Patrol', glyph: '⇄', ok: true, on: ui.aim === 'patrol', tip: '<b>Patrol</b><p>Click a point: they walk between here and there, fighting what they meet.</p>', run: () => { ui.aim = ui.aim === 'patrol' ? null : 'patrol'; ui.placing = null; draw(); } });
    }
    // Each kind's own trick, and falling back. (Not with engineers in the group: their grid is full of buildings.)
    const allEngineers = us.every((u) => u.kind === 'engineer');
    if (allEngineers || !us.some((u) => u.kind === 'engineer')) {
      UNIT_ORDER.filter((k) => ABILITIES[k] && us.some((u) => u.kind === k && u.seat === me.seat)).slice(0, 3).forEach((k, i) => {
        const a = ABILITIES[k]!;
        const of = us.filter((u) => u.kind === k && u.seat === me.seat);
        const ready = of.filter((u) => !ui.cd.has(u.id)).length;
        const key = 'REG'[i];
        out.push({ key, code: `Key${key}`, name: a.name, glyph: a.glyph, cost: a.cost ? String(a.cost) : of.length > 1 ? `${ready}/${of.length}` : '', ok: ready > 0 && me.steel >= (a.cost ?? 0), on: ui.aim === 'ability' && ui.abKind === k, cooldown: ready ? 0 : Math.min(...of.map((u) => ui.cd.get(u.id) ?? 0)), tip: `<b>${a.name}</b><p>${a.blurb}</p><div class="tsub">${UNITS[k].name}. Recharges in ${a.cooldown}s.${a.aimed ? ` Click the map to aim it (or the minimap); reach ${a.range}.` : ''}</div>`, run: () => useAbility(k) });
      });
      if (!allEngineers && us.some((u) => u.seat === me.seat && !UNITS[u.kind].naval)) out.push({ key: 'X', code: 'KeyX', name: 'Fall back', glyph: '↩', ok: true, tip: `<b>Fall back</b><p>Everyone selected runs for the nearest depot or headquarters, ${Math.round((RETREAT.speed - 1) * 100)}% faster, not stopping to shoot. Near one, out of the fighting, they heal.</p>`, run: () => client.send('retreat', { ids: [...ui.sel] }) });
    }
    if (us.some((x) => x.kind === 'hero')) out.push({ key: 'F', code: 'KeyF', name: 'Rally', glyph: '★', ok: me.rallyIn <= 0, cooldown: me.rallyIn, run: () => client.send('hero', {}) });
    // Stance: one button, round the three.
    const fighters = us.filter((u) => u.kind !== 'engineer' && u.kind !== 'transport' && u.seat === me.seat);
    if (fighters.length) {
      const st = stanceBits(fighters[0].flags);
      const next = (st + 1) % 3;
      out.push({ key: 'T', code: 'KeyT', name: STANCES[st].name, glyph: STANCES[st].glyph, ok: true, tip: `<b>Stance: ${STANCES[st].name}</b><p>${STANCES[st].blurb}</p><div class="tsub">${STANCES.map((x, i) => `${i === st ? '<b style="display:inline;font-size:13px">' : ''}${x.glyph} ${x.name}${i === st ? '</b>' : ''}: ${x.blurb}`).join('<br>')}</div><div class="tsub">Press to change to ${STANCES[next].name}.</div>`, run: () => client.send('stance', { ids: fighters.map((u) => u.id), stance: next }) });
    }
    const boat = us.find((u) => u.kind === 'transport' && u.seat === me.seat);
    if (boat) out.push({ key: 'U', code: 'KeyU', name: 'Unload', glyph: '⇪', cost: `${cargoBits(boat.flags)}/${UNITS.transport.holds}`, ok: cargoBits(boat.flags) > 0, tip: '<b>Unload</b><p>Land everyone aboard on the nearest shore. The transport must be near it.</p><div class="tsub">Right click the transport with infantry to board.</div>', run: () => client.send('unload', { id: boat.id, boat: true }) });
    out.push({
      key: 'H',
      code: 'KeyH',
      name: 'Halt',
      glyph: '■',
      ok: true,
      run: () => {
        const m = mine().filter((u) => ui.sel.has(u.id));
        if (m.length) client.send('move', { ids: m.map((u) => u.id), x: m[0].x, z: m[0].z });
      },
    });
  }
  // With nothing selected: quick ways to pick things.
  if (!out.length) {
    const sel = (kinds: UnitKind[]) => () => select(mine().filter((u) => kinds.includes(u.kind)).map((u) => u.id), null);
    out.push({ key: 'E', code: 'KeyE', name: 'Engineers', icon: pic('engineer'), ok: true, run: sel(['engineer']) });
    out.push({ key: 'R', code: 'KeyR', name: 'Army', icon: pic('tank'), ok: true, run: sel(['rifle', 'scout', 'at', 'tank', 'artillery', 'aa', 'heli', 'hero']) });
    out.push({ key: 'B', code: 'KeyB', name: 'Base', icon: pic('hq'), ok: true, run: () => { const h = ui.buildings.find((x) => x.seat === me.seat && x.kind === 'hq'); if (h) lookAt(h.x, h.z); } });
  }
  // The special power is always the grid's last button.
  const p = DOCTRINES[me.doctrine].power;
  while (out.length < 11) out.push({ key: '', code: '', name: '', ok: false, run: () => {} });
  out.push({ key: 'P', code: 'KeyP', name: p.name, glyph: p.kind === 'airstrike' ? '✈' : p.kind === 'reinforce' ? '⛨' : '◉', ok: me.powerIn <= 0, on: ui.aim === 'power', cooldown: me.powerIn, tip: `<b>${p.name}</b><p>${p.blurb}</p><div class="tsub">Recharges in ${p.cooldown}s.${p.aimed ? ' Click the map to aim it.' : ''}</div>`, run: usePower });
  return out;
}

/** The idle engineers: all selected, and the view on one (the next, each time). */
let idleTurn = 0;
let spaced: unknown = null;
function selectIdle(): void {
  const idle = mine().filter((u) => u.kind === 'engineer' && u.flags & 8);
  if (!idle.length) return;
  select(idle.map((u) => u.id), null);
  const u = idle[idleTurn++ % idle.length];
  lookAt(u.x, u.z);
}

function runCommand(i: number): void {
  const c = commands()[i];
  if (c && c.ok && c.key) c.run();
}

/** A unit's own ability: at once, or (one that wants a spot) on the next click. */
function useAbility(k: UnitKind): void {
  if (ABILITIES[k]!.aimed) {
    const same = ui.aim === 'ability' && ui.abKind === k;
    ui.aim = same ? null : 'ability';
    ui.abKind = same ? null : k;
    ui.placing = null;
    draw();
  } else client.send('ability', { ids: [...ui.sel], kind: k });
}

/** The special power: at once, or (an airstrike) on the next click. */
function usePower(): void {
  const me = meSeat();
  if (!me || me.powerIn > 0 || ui.state?.phase !== 'play') return;
  if (DOCTRINES[me.doctrine].power.aimed) {
    ui.aim = ui.aim === 'power' ? null : 'power';
    ui.placing = null;
    draw();
  } else client.send('power', {});
}

/** How high over the floor a unit's middle is on screen (for picking): a helicopter's well up, and a hill lifts what's on it. */
const liftOf = (u: U) => (UNITS[u.kind].air ? 8.5 : 1.8) + (UNITS[u.kind].naval ? -0.6 : (drawnAt.get(u.id)?.y ?? FLOOR) - FLOOR - (UNITS[u.kind].air ? 5 : 0));

/** What's under a screen point: an enemy unit or building, a deposit, or just ground. */
function under(sx: number, sy: number, g: { x: number; z: number } | null) {
  const team = meSeat()?.team;
  const enemy = (seat: number) => ui.state?.seats.find((s) => s.seat === seat)?.team !== team;
  const eu = ui.units.filter((u) => enemy(u.seat));
  let best = -1;
  let bd = 30;
  eu.forEach((u, i) => {
    const p = toScreen(u.x, FLOOR + liftOf(u), u.z);
    const d = p ? Math.hypot(p.x - sx, p.y - sy) : 1e9;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  if (best >= 0) return { t: 'unit' as const, id: eu[best].id };
  if (g) {
    const b = ui.buildings.find((x) => enemy(x.seat) && Math.hypot(x.x - g.x, x.z - g.z) < BUILDINGS[x.kind].radius + 1);
    if (b) return { t: 'building' as const, id: b.id };
    const d = DEPOSITS.find((n) => (ui.state?.deposits[n.id] ?? 1) > 0 && Math.hypot(n.x - g.x, n.z - g.z) < 3.2);
    if (d) return { t: 'deposit' as const, id: d.id };
  }
  return { t: 'ground' as const, id: -1 };
}

export function select(ids: number[], building: number | null): void {
  // A voice from what's picked out (the biggest of them answers).
  const picked = ui.units.filter((u) => ids.includes(u.id) && u.seat === mySeat()).sort((a, b) => UNITS[b.kind].size - UNITS[a.kind].size)[0];
  if (picked && ids.length && (ids.length !== ui.sel.size || !ids.every((id) => ui.sel.has(id)))) say(picked.kind, 'select');
  ui.sel = new Set(ids);
  ui.selB = building;
  ui.placing = null;
  ui.aim = null;
  draw();
}

let lastClick = { t: 0, id: -1 };
/** The right drag under way: where the group is going, and which way it will face. */
let facing: { from: { x: number; z: number }; to: { x: number; z: number } } | null = null;
const mark = (g: { x: number; z: number }, col: string) => ui.marks.push({ x: g.x, z: g.z, at: performance.now(), color: col, life: 650 });
let cursor = '';
function setCursor(c: string): void {
  if (c === cursor) return;
  if (cursor) document.documentElement.classList.remove(`cm-c-${cursor}`);
  if (c) document.documentElement.classList.add(`cm-c-${c}`);
  cursor = c;
}

/** Where a line of wall being dragged out began (null: none is). */
let wallFrom: { x: number; z: number } | null = null;

function listen(): void {
  let down: { x: number; y: number; button: number; moved: boolean } | null = null;
  const onUi = (e: Event) => !!(e.target as HTMLElement).closest?.('.ui, .cm-lobby');
  window.addEventListener('pointerdown', (e) => {
    if (onUi(e) || client.hud.paused || ui.state?.phase !== 'play') return;
    down = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
    wallFrom = e.button === 0 && ui.placing === 'rampart' ? toGround(e.clientX, e.clientY) : null;
  });
  window.addEventListener('pointermove', (e) => {
    cam.mouse = onUi(e) ? null : { x: e.clientX, y: e.clientY };
    ui.mouse = toGround(e.clientX, e.clientY);
    if (!down) return;
    if (down.button === 1) {
      drag(e.movementX, e.movementY);
      return;
    }
    if (down.button === 2 && ui.sel.size && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 24) {
      down.moved = true;
      const from = toGround(down.x, down.y);
      facing = from && ui.mouse ? { from, to: ui.mouse } : null;
    }
    if (down.button === 0 && !wallFrom && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) {
      down.moved = true;
      Object.assign(boxEl.style, { display: 'block', left: `${Math.min(down.x, e.clientX)}px`, top: `${Math.min(down.y, e.clientY)}px`, width: `${Math.abs(e.clientX - down.x)}px`, height: `${Math.abs(e.clientY - down.y)}px` });
    }
  });
  document.documentElement.addEventListener('mouseleave', () => (cam.mouse = null));
  window.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    const wallStart = wallFrom;
    wallFrom = null;
    boxEl.style.display = 'none';
    const faced = facing;
    facing = null;
    if (!d || onUi(e)) return;
    const me = mySeat();
    const g = toGround(e.clientX, e.clientY);
    const queue = e.shiftKey;
    // Right dragged: there, facing the way it was dragged.
    if (d.button === 2 && d.moved && faced && ui.sel.size) {
      client.send('move', { ids: [...ui.sel], x: faced.from.x, z: faced.from.z, attack: cam.keys.has('KeyQ'), queue, face: Math.atan2(faced.to.x - faced.from.x, faced.to.z - faced.from.z) });
      mark(faced.from, '#7dff7d');
      return;
    }
    if (d.button === 0) {
      // Alt + click: point something out to your team.
      if (e.altKey && g) return void client.send('ping', { x: g.x, z: g.z });
      if (ui.aim === 'ability' && g && ui.abKind) {
        client.send('ability', { ids: [...ui.sel], kind: ui.abKind, x: g.x, z: g.z, queue });
        mark(g, '#ffb347');
        if (!queue) ui.aim = null;
        return draw();
      }
      if (ui.aim === 'patrol' && g && ui.sel.size) {
        client.send('patrol', { ids: [...ui.sel], x: g.x, z: g.z, queue });
        mark(g, '#9fd0ff');
        if (!queue) ui.aim = null;
        return draw();
      }
      if (ui.aim === 'power' && g) {
        client.send('power', { x: g.x, z: g.z });
        ui.aim = null;
        return draw();
      }
      if (ui.aim === 'attack' && g && ui.sel.size) {
        client.send('move', { ids: [...ui.sel], x: g.x, z: g.z, attack: true, queue });
        say(ui.units.find((u) => ui.sel.has(u.id))?.kind ?? null, 'attack');
        mark(g, '#ff7a5a');
        if (!queue) ui.aim = null;
        return draw();
      }
      if (ui.placing) {
        if (g) {
          const r1 = (v: number) => Math.round(v * 10) / 10;
          if (ui.placing === 'rampart' && wallStart) client.send('wall', { x: r1(wallStart.x), z: r1(wallStart.z), x1: r1(g.x), z1: r1(g.z), ids: [...ui.sel], queue });
          else client.send('build', { kind: ui.placing, x: r1(g.x), z: r1(g.z), ids: [...ui.sel], queue });
          if (!e.shiftKey) ui.placing = null;
        }
        return draw();
      }
      if (d.moved) {
        const x0 = Math.min(d.x, e.clientX);
        const x1 = Math.max(d.x, e.clientX);
        const y0 = Math.min(d.y, e.clientY);
        const y1 = Math.max(d.y, e.clientY);
        const ids = mine()
          .filter((u) => {
            const p = toScreen(u.x, FLOOR + liftOf(u), u.z);
            return p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
          })
          .map((u) => u.id);
        return select(e.shiftKey ? [...new Set([...ui.sel, ...ids])] : ids, null);
      }
      const own = mine();
      let best = -1;
      let bd = 30;
      own.forEach((u, i) => {
        const p = toScreen(u.x, FLOOR + liftOf(u), u.z);
        const dd = p ? Math.hypot(p.x - e.clientX, p.y - e.clientY) : 1e9;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      });
      if (best >= 0) {
        const u = own[best];
        const now = performance.now();
        // A double click takes every one of that kind that's on the screen.
        if (lastClick.id === u.id && now - lastClick.t < 380) {
          const onScreen = (o: U) => {
            const p = toScreen(o.x, FLOOR + 1.8, o.z);
            return !!p && p.x >= 0 && p.x <= window.innerWidth && p.y >= 0 && p.y <= window.innerHeight;
          };
          lastClick = { t: 0, id: -1 };
          return select(own.filter((o) => o.kind === u.kind && onScreen(o)).map((o) => o.id), null);
        }
        lastClick = { t: now, id: u.id };
        return select(e.shiftKey ? [...new Set([...ui.sel, u.id])] : [u.id], null);
      }
      const b = g && ui.buildings.find((x) => x.seat === me && Math.hypot(x.x - g.x, x.z - g.z) < BUILDINGS[x.kind].radius + 0.8);
      return select([], b ? b.id : null);
    }
    if (d.button === 2 && !d.moved) {
      if (ui.placing || ui.aim) {
        ui.placing = null;
        ui.aim = null;
        return draw();
      }
      const ids = [...ui.sel];
      const what = under(e.clientX, e.clientY, g);
      // Infantry sent at one of our bunkers, or one of our transports, go in.
      const boarders = ui.units.filter((u) => ui.sel.has(u.id) && u.seat === me && BOARDS.includes(u.kind));
      if (boarders.length && g) {
        const bunker = ui.buildings.find((x) => x.seat === me && BUILDINGS[x.kind].holds && x.built >= 100 && Math.hypot(x.x - g.x, x.z - g.z) < BUILDINGS[x.kind].radius + 1.2);
        const boat = ui.units.find((x) => {
          if (x.seat !== me || x.kind !== 'transport') return false;
          const p = toScreen(x.x, FLOOR + 1, x.z);
          return !!p && Math.hypot(p.x - e.clientX, p.y - e.clientY) < 34;
        });
        if (bunker || boat) {
          client.send('enter', { ids: boarders.map((u) => u.id), id: (bunker ?? boat)!.id, boat: !bunker, queue });
          say(boarders[0].kind, 'move');
          return;
        }
      }
      const lead = ui.units.find((u) => ui.sel.has(u.id))?.kind ?? null;
      if (ids.length && lead) say(lead, what.t === 'unit' || what.t === 'building' || cam.keys.has('KeyQ') ? 'attack' : 'move');
      // Engineers sent at one of our own damaged buildings repair it.
      const myTeam = meSeat()?.team;
      const hurt = g && ui.sel.size && ui.units.some((x) => ui.sel.has(x.id) && x.kind === 'engineer') ? ui.buildings.find((x) => ui.state?.seats.find((s) => s.seat === x.seat)?.team === myTeam && x.hp < 100 && Math.hypot(x.x - g.x, x.z - g.z) < BUILDINGS[x.kind].radius + 1) : undefined;
      if (hurt && ids.length) return void client.send('repair', { ids, id: hurt.id, queue });
      if (ids.length) {
        if (what.t === 'unit' || what.t === 'building') {
          client.send('attack', { ids, id: what.id, building: what.t === 'building', queue });
          if (g) mark(g, '#ff7a5a');
        } else if (what.t === 'deposit') {
          client.send('gather', { ids, id: what.id, queue });
          if (g) mark(g, '#ffd27a');
        } else if (g) {
          client.send('move', { ids, x: g.x, z: g.z, attack: cam.keys.has('KeyQ'), queue });
          mark(g, cam.keys.has('KeyQ') ? '#ff7a5a' : '#7dff7d');
        }
      } else if (ui.selB !== null && g) client.send('rally', { id: ui.selB, x: g.x, z: g.z });
    }
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => !client.hud.paused && zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1), { passive: true });
  window.addEventListener('keydown', (e) => {
    if (client.hud.paused || (e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
    cam.keys.add(e.code);
    if (e.code === 'Enter' && ui.state?.phase !== 'lobby') return openSay(e.shiftKey);
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit) {
      const k = digit[1];
      if (e.ctrlKey) {
        e.preventDefault();
        ui.groups.set(k, [...ui.sel]);
      } else {
        const ids = (ui.groups.get(k) ?? []).filter((id) => ui.units.some((u) => u.id === id));
        if (ids.length) {
          select(ids, null);
          const u = ui.units.find((x) => x.id === ids[0]);
          if (u) lookAt(u.x, u.z);
        }
      }
      return;
    }
    if (e.code === 'Escape' && (ui.placing || ui.aim || ui.sel.size || ui.selB !== null)) {
      ui.placing = null;
      ui.aim = null;
      select([], null);
    } else if (e.code === 'F10' && ui.state?.phase === 'play') {
      e.preventDefault();
      askMenu(el('.cm-ask').style.display !== 'grid');
    } else if (e.code === 'KeyK' && ui.state?.phase === 'play') {
      toggleTech();
    } else if (e.code === 'Period') {
      selectIdle();
    } else if (e.code === 'F8') {
      e.preventDefault();
      client.send('autoplay', {});
    } else if (e.code === 'Space') {
      e.preventDefault();
      // The latest alert; pressed again, home.
      const alert = ui.alerts[ui.alerts.length - 1];
      if (alert && alert !== spaced) {
        spaced = alert;
        return lookAt(alert.x, alert.z);
      }
      spaced = null;
      const h = ui.buildings.find((x) => x.seat === mySeat() && x.kind === 'hq');
      if (h) lookAt(h.x, h.z);
    } else {
      // The grid's hotkeys.
      const i = commands().findIndex((c) => c.code === e.code && c.key);
      if (i >= 0) runCommand(i);
    }
  });
  window.addEventListener('keyup', (e) => cam.keys.delete(e.code));
  window.addEventListener('blur', () => cam.keys.clear());
}

/** The minimap: a click looks there, dragging it follows, a right click sends the selection. */
function listenMini(): void {
  const at = (e: MouseEvent) => {
    const r = mini.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width - 0.5) * 2 * HALF, z: ((e.clientY - r.top) / r.height - 0.5) * 2 * HALF };
  };
  let dragging = false;
  mini.addEventListener('pointerdown', (e) => {
    const p = at(e);
    if (e.button === 2) {
      if (ui.sel.size) client.send('move', { ids: [...ui.sel], x: p.x, z: p.z, attack: cam.keys.has('KeyQ'), queue: e.shiftKey });
      return;
    }
    if (e.altKey) return void client.send('ping', { x: p.x, z: p.z });
    if (ui.aim === 'ability' && ui.abKind) {
      client.send('ability', { ids: [...ui.sel], kind: ui.abKind, x: p.x, z: p.z, queue: e.shiftKey });
      ui.aim = null;
      return draw();
    }
    if (ui.aim === 'power') {
      client.send('power', { x: p.x, z: p.z });
      ui.aim = null;
      return draw();
    }
    dragging = true;
    mini.setPointerCapture(e.pointerId);
    lookAt(p.x, p.z);
  });
  mini.addEventListener('pointermove', (e) => {
    if (dragging) {
      const p = at(e);
      lookAt(p.x, p.z);
    }
  });
  mini.addEventListener('pointerup', () => (dragging = false));
}

// ---------------------------------------------------------------------------------------------
// The panels, again: when the state comes or the selection changes.

const PLURAL: Record<UnitKind, string> = { at: 'AT Teams', gunboat: 'Gunboats', transport: 'Transports', guard: 'Camp Guards', brute: 'Camp Brutes', engineer: 'Engineers', rifle: 'Infantry', scout: 'Scouts', tank: 'Tanks', artillery: 'Artillery', aa: 'Anti-Air', heli: 'Helicopters', hero: 'Commander' };
const pct = (v: number) => Math.max(0, Math.min(100, v));
const hpColor = (p: number) => (p > 55 ? '#4cd04a' : p > 25 ? '#ffc83a' : '#f04438');

/** What a unit is at, in a word or two, with a glyph and a colour (for the mark over it and the card on hover). */
function doing(u: U): { text: string; glyph: string; color: string } {
  const a = activity(u.id);
  if (u.flags & 2) return { text: 'Carrying steel home', glyph: '▣', color: '#cfd8e6' };
  if (u.flags & 4) return { text: 'Carrying oil home', glyph: '●', color: '#cfd8e6' };
  if (u.flags & 1) {
    if (u.kind !== 'engineer') return { text: 'At work', glyph: '⚒', color: '#ffd27a' };
    const site = ui.buildings.find((b) => b.built < 100 && Math.hypot(b.x - u.x, b.z - u.z) < BUILDINGS[b.kind].radius + 3);
    if (site) return { text: `Building a ${BUILDINGS[site.kind].name}`, glyph: '⚒', color: '#ffd27a' };
    const d = DEPOSITS.filter((n) => (ui.state?.deposits[n.id] ?? 1) > 0).sort((p, q) => Math.hypot(p.x - u.x, p.z - u.z) - Math.hypot(q.x - u.x, q.z - u.z))[0];
    return d?.kind === 'oil' ? { text: 'Pumping oil', glyph: '⛏', color: '#ffd27a' } : { text: d?.scrap ? 'Stripping scrap for steel' : 'Mining steel', glyph: '⛏', color: '#ffd27a' };
  }
  if (a.fighting) return { text: 'Fighting', glyph: '⚔', color: '#ff7a5a' };
  if (a.moving) return { text: 'On the move', glyph: '', color: '#9fd0ff' };
  if (u.flags & 8 && u.kind === 'engineer') return { text: 'Idle: waiting for orders', glyph: 'zz', color: '#ffe08a' };
  return { text: UNITS[u.kind].damage ? 'On guard' : 'Standing by', glyph: '', color: '#9fe08a' };
}

/** What a building is up to. */
function buildingDoing(b: B): string {
  const def = BUILDINGS[b.kind];
  if (b.built < 100) return `Under construction: ${b.built}%`;
  if (b.queue >= 1000) return `Researching ${TECHS[TECH_IDS[Math.floor(b.queue / 1000) - 1]].name}: ${b.queue % 1000}%`;
  if (b.queue >= 0 && def.trains.length) return `Training: ${b.queue}%`;
  if (def.holds) return `${b.held} of ${def.holds} inside`;
  if (def.trains.length) return 'Not training anything';
  if (def.guns) return 'Guarding';
  return '';
}

const owner = (seat: number) => (seat === mySeat() ? 'Yours' : seat >= 6 ? 'The wild' : ui.state?.seats.find((s) => s.seat === seat)?.name ?? '');

/** The card that follows the mouse over the field: what's under it, whose, and what it's at. */
function hoverCard(sx: number, sy: number): string {
  let best: U | null = null;
  let bd = 26;
  for (const u of ui.units) {
    const p = toScreen(u.x, FLOOR + liftOf(u), u.z);
    const d = p ? Math.hypot(p.x - sx, p.y - sy) : 1e9;
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  const head = (name: string, seat: number) => `<h4><i style="background:${color(seat)}"></i>${name}</h4><div class="who">${owner(seat)}</div>`;
  if (best) {
    const d = UNITS[best.kind];
    const w = doing(best);
    const rank = rankBits(best.flags);
    return `${head(d.name + (rank ? ' ' + '★'.repeat(rank) : ''), best.seat)}<div class="doing" style="color:${w.color}">${w.text}</div><p>${d.blurb}</p>`;
  }
  const g = toGround(sx, sy);
  if (!g) return '';
  const b = ui.buildings.find((x) => Math.hypot(x.x - g.x, x.z - g.z) < BUILDINGS[x.kind].radius + 0.5);
  if (b) {
    const what = buildingDoing(b);
    return `${head(BUILDINGS[b.kind].name, b.seat)}${what ? `<div class="doing" style="color:#ffd27a">${what}</div>` : ''}<p>${BUILDINGS[b.kind].blurb}</p>`;
  }
  const dep = DEPOSITS.find((n) => (ui.state?.deposits[n.id] ?? 1) > 0 && Math.hypot(n.x - g.x, n.z - g.z) < 3.2);
  if (dep) {
    const left = ui.state?.deposits[dep.id] ?? dep.amount;
    const name = dep.salvage ? (dep.scrap === 'henge' ? 'Wreck (salvage)' : 'Rubble (salvage)') : dep.scrap === 'henge' ? 'Wrecked tank (scrap)' : dep.scrap === 'ruin' ? 'Bombed house (scrap)' : dep.kind === 'oil' ? 'Oil well' : 'Steel deposit';
    return `<h4>${name}</h4><div class="doing" style="color:#cfd8e6">${left} ${dep.kind} left</div><p>Select engineers and right click it to gather ${dep.kind}.</p>`;
  }
  const ci = CAMPS.findIndex((c) => Math.hypot(c.x - g.x, c.z - g.z) < 6);
  if (ci >= 0) {
    const r = ui.state?.relics?.[ci];
    const held = r && r.owner >= 0 ? `Held by ${owner(r.owner)}` : 'Held by no one';
    return `<h4>Supply cache</h4><div class="doing" style="color:#ffd27a">${held}</div><p>Clear its guards and keep troops by it to take it. It pays its holder steel.</p>`;
  }
  return '';
}

export function draw(): void {
  const s = ui.state;
  if (!s) return;
  drawFront(s);
  el('.cm-top').style.display = s.phase === 'lobby' || s.phase === 'briefing' ? 'none' : 'flex';
  el('.cm-bar').style.display = s.phase === 'lobby' || s.phase === 'briefing' ? 'none' : 'grid';
  const me = meSeat();
  setDrift(s.phase === 'lobby');
  if (s.phase === 'lobby') ui.centred = false;
  if (me && !ui.centred && s.phase !== 'lobby') {
    ui.centred = true;
    lookAt(BASES[me.seat].x, BASES[me.seat].z);
  }
  const icon = (id: string) => client.hud.icon({ item: id }).outerHTML;
  el('.steel').innerHTML = `${icon('ic_steel')}${me?.steel ?? 0}`;
  el('.oil').innerHTML = `${icon('ic_oil')}${me?.oil ?? 0}`;
  const idle = mine().filter((u) => u.kind === 'engineer' && u.flags & 8).length;
  const idleEl = el('.cm-idle');
  idleEl.style.display = s.phase === 'play' && idle ? 'flex' : 'none';
  idleEl.innerHTML = `${icon(pic('engineer'))}${idle} idle <small style="color:#c9a85a">(.)</small>`;
  const full = me && me.pop >= me.cap;
  el('.pop').className = `cm-res pop${full ? ' warn' : ''}`;
  el('.pop').title = AGE_NAMES[ageOf(me?.techs ?? [])];
  el('.pop').innerHTML = `<span style="font-size:22px">☻</span>${me?.pop ?? 0}<small>/ ${me?.cap ?? 0}</small>`;
  const mode = MODES.find((m) => m.id === s.mode)?.name ?? '';
  el('.cm-mid').innerHTML = `<span>${mode}</span><span style="color:#ffc83a">${AGE_NAMES[ageOf(me?.techs ?? [])]}</span><b>${Math.floor(s.time / 60)}:${String(s.time % 60).padStart(2, '0')}</b>${s.stand ? `<span style="color:#ff9a5a">Wave ${s.stand.wave}/${s.stand.total}${s.stand.nextIn ? ` · next ${Math.floor(s.stand.nextIn / 60)}:${String(s.stand.nextIn % 60).padStart(2, '0')}` : ''}${s.stand.left ? ` · ${s.stand.left} left` : ''}</span>` : ''}${me ? '' : '<span style="color:#9fd0ff">Watching</span>'}`;
  el('.cm-players').innerHTML = s.seats.map((x) => `<div class="cm-pl ${x.alive ? '' : 'dead'}" title="${x.human ? 'Player' : `Bot: ${x.style}`}"><i style="background:${color(x.seat)}"></i>${esc(x.name)}${x.human ? '' : x.style ? `<em>${x.style}</em>` : '<small>bot</small>'}</div>`).join('');
  const vb = el('.cm-voice');
  vb.textContent = voices.on ? '🔊' : '🔇';
  vb.classList.toggle('off', !voices.on);
  drawSummary(s);

  const hint = el('.cm-hint');
  hint.textContent = ui.placing
    ? ui.placing === 'dock'
      ? 'Place the Dock on a lake’s shore (green when it fits). Right click cancels.'
      : ui.placing === 'rampart'
        ? 'Wall: press and drag to lay a line of it (10 steel a length), or click for one. Trees, rocks and buildings in its way are left standing as part of it. Right click cancels.'
        : ui.placing === 'gate'
          ? 'Gate: click a gap in a wall, or a length of your own wall to replace it. Right click cancels.'
      : `Place the ${BUILDINGS[ui.placing].name}: click the ground (not on a hill). Right click cancels.`
    : ui.aim === 'ability' && ui.abKind
      ? `${ABILITIES[ui.abKind]!.name}: click where (or on the minimap). Those out of reach walk into it first.`
    : ui.aim === 'power'
      ? 'Click where the bombers should go (or on the minimap).'
      : ui.aim === 'attack'
        ? 'Attack-move: click where to go. They fight whatever they meet.'
        : ui.aim === 'patrol'
          ? 'Patrol: click the far end of the route.'
        : s.phase === 'play' && !ui.sel.size && ui.selB === null && s.time < 90
          ? 'Your engineers are mining. Click one and build a Barracks. Hover over anything to see what it is.'
          : '';

  // What's selected.
  const info = el('.cm-info');
  const b = ui.selB !== null ? ui.buildings.find((x) => x.id === ui.selB) : undefined;
  const us = ui.units.filter((u) => ui.sel.has(u.id));
  if (b) {
    const def = BUILDINGS[b.kind];
    const status = b.built < 100 ? `Under construction: ${b.built}%` : def.holds ? `Inside: ${b.held} of ${def.holds}${b.held ? ' (U lets them out)' : ' (right click it with infantry)'}` : def.pop ? `Room for ${def.pop} people` : def.trains.length ? `Trains ${def.trains.map((t) => PLURAL[t]).join(', ')}` : def.research ? 'Researches upgrades for the whole army' : def.guns ? 'Shoots anything in reach' : '';
    const trains = def.trains.length > 0 && b.built >= 100;
    const rq = b.queue >= 1000 ? { tech: TECH_IDS[Math.floor(b.queue / 1000) - 1], pct: b.queue % 1000 } : null;
    info.innerHTML = `<div class="row">${client.hud.icon({ item: pic(b.kind, b.seat) }).outerHTML.replace('<img', '<img class="big"')}<div style="flex:1"><h3>${def.name}</h3><div class="sub">${def.blurb}</div><div class="sub">${status}</div>
      <div class="cm-hpbar"><i style="width:${pct(b.hp)}%;background:${hpColor(b.hp)}"></i></div>${rq ? `<div class="sub" style="margin-top:6px">Researching ${TECHS[rq.tech].name}…</div><div class="cm-hpbar cm-qbar"><i style="width:${pct(rq.pct)}%"></i></div>` : ''}${def.research && !rq ? `<div class="sub" style="margin-top:6px">${me?.techs.some((t) => def.research?.includes(t)) ? `Done: ${me.techs.filter((t) => def.research?.includes(t)).map((t) => TECHS[t].name).join(', ')}` : 'Pick an upgrade from the grid.'}</div>` : ''}${trains && b.queue >= 0 && b.queue < 1000 ? `<div class="sub" style="margin-top:6px">Training…</div><div class="cm-hpbar cm-qbar"><i style="width:${pct(b.queue)}%"></i></div>` : ''}${trains ? '<div class="sub" style="margin-top:6px">Right click the ground to set a rally point.</div>' : ''}</div></div>`;
  } else if (us.length) {
    const counts = UNIT_ORDER.map((k) => [k, us.filter((u) => u.kind === k).length] as const).filter(([, n]) => n);
    if (us.length === 1) {
      const one = us[0];
      const d = UNITS[one.kind];
      const job = one.flags & 2 ? 'Carrying steel home' : one.flags & 4 ? 'Carrying oil home' : one.flags & 1 ? 'At work' : one.flags & 8 ? 'Idle' : 'Under orders';
      const rank = rankBits(one.flags);
      const hpMax = Math.round(d.hp * (1 + rank * VET.hp));
      const extra = [
        rank ? `${'★'.repeat(rank)} veteran: +${Math.round(rank * VET.damage * 100)}% damage, +${Math.round(rank * VET.hp * 100)}% health` : one.kind !== 'engineer' && d.damage ? 'No stars yet: kills earn them' : '',
        one.flags & 64 ? `On high ground: +${HIGH.range * 100}% reach, +${HIGH.sight * 100}% sight` : '',
        d.damage && one.kind !== 'engineer' ? `Stance: ${STANCES[stanceBits(one.flags)].name} (T)` : '',
        d.holds ? `Aboard: ${cargoBits(one.flags)} of ${d.holds}` : '',
      ].filter(Boolean);
      info.innerHTML = `<div class="row">${client.hud.icon({ item: pic(one.kind, one.seat) }).outerHTML.replace('<img', '<img class="big"')}<div style="flex:1"><h3>${d.name}${rank ? `<span class="cm-stars">${'★'.repeat(rank)}</span>` : ''}</h3><div class="sub">${d.blurb}</div>
        <div class="cm-hpbar"><i style="width:${pct(one.hp)}%;background:${hpColor(one.hp)}"></i></div>
        <div class="cm-stats" style="margin-top:6px"><span>♥ ${Math.round((hpMax * one.hp) / 100)} / ${hpMax}</span>${d.damage ? `<span>⚔ ${Math.round(d.damage * (1 + rank * VET.damage))}</span><span>⌖ ${d.range}</span>` : ''}<span>» ${d.speed}</span></div><div class="sub" style="margin-top:4px">${job}${extra.length ? ' · ' + extra.join(' · ') : ''}</div></div></div>`;
    } else {
      info.innerHTML = `<h3>${us.length} selected</h3><div class="cm-group">${counts.map(([k, n]) => {
        const of = us.filter((x) => x.kind === k);
        const hp = of.reduce((a, x) => a + x.hp, 0) / of.length;
        return `<div class="cm-gc" data-kind="${k}" title="${PLURAL[k]}: click to keep only these">${client.hud.icon({ item: pic(k) }).outerHTML}<span class="n">${n}</span><div class="hp"><i style="width:${pct(hp)}%;background:${hpColor(hp)}"></i></div></div>`;
      }).join('')}</div><div class="sub">Right click: move, attack or gather. Q: attack-move. Click a card to keep only that kind.</div>`;
    }
  } else if (me) {
    const d = DOCTRINES[me.doctrine];
    info.innerHTML = `<h3>${d.name} doctrine</h3><div class="sub">${d.passive}.</div><div class="sub" style="margin-top:4px"><b style="color:#e8eef5">${d.power.name} (P)</b>: ${d.power.blurb}</div><div class="sub" style="margin-top:8px">Select your engineers or a building. Drag to box-select, double click for all of a kind.</div>`;
  }

  // The commands.
  const cmds = commands();
  el('.cm-grid').innerHTML = cmds
    .map((c, i) => {
      if (!c.key) return '<button class="cb empty" disabled></button>';
      const pic = c.icon ? client.hud.icon({ item: c.icon }).outerHTML : `<div class="g">${iconHtml(c.glyph ?? '')}</div>`;
      return `<button class="cb ${c.ok ? '' : 'no'} ${c.on ? 'on' : ''}" data-cmd="${i}">${pic}<span class="k">${c.key}</span>${c.cost ? `<span class="c">${c.cost}</span>` : ''}<span class="n">${c.name}</span>${c.cooldown ? `<div class="cd">${c.cooldown}s</div>` : ''}</button>`;
    })
    .join('');
}

/**
 * The match's end: who won, each commander's tallies (trained, killed, lost, built, razed, gathered),
 * and a chart of every army's worth over the match; play again, or close it and look at the field.
 */
function drawSummary(s: State): void {
  const box = el('.cm-sum');
  const sum = s.summary;
  if (s.phase !== 'over' || !sum) {
    box.style.display = 'none';
    delete box.dataset.closed;
    return;
  }
  if (box.dataset.closed) return void (box.style.display = 'none');
  box.style.display = 'grid';
  if (box.dataset.shown === String(s.time)) return;
  box.dataset.shown = String(s.time);
  const me = mySeat();
  const won = s.winners.includes(me);
  const names = s.seats.filter((x) => s.winners.includes(x.seat)).map((x) => x.name);
  const title = s.stand ? (s.winners.length && !s.winners.includes(4) ? 'You held' : `Overrun on wave ${s.stand.wave}`) : me < 0 ? (names.length ? `${names.join(' and ')} win${names.length === 1 ? 's' : ''}` : 'Everyone is out') : won ? 'Victory' : 'Defeat';
  const rows = sum.seats
    .map((x) => {
      const seat = s.seats.find((y) => y.seat === x.seat);
      return `<tr class="${s.winners.includes(x.seat) ? 'won' : ''}"><td><i style="background:${color(x.seat)}"></i>${esc(x.name)}${seat && !seat.human && seat.style ? ` <small style="color:var(--dim)">${seat.style}</small>` : ''}</td><td>${x.trained}</td><td>${x.killed}</td><td>${x.lost}</td><td>${x.built}</td><td>${x.razed}</td><td>${x.steel}</td><td>${x.oil}</td></tr>`;
    })
    .join('');
  // The chart: each army's worth (steel and oil in its fighting units) over the match.
  const W = 840;
  const H = 190;
  const n = Math.max(2, ...sum.seats.map((x) => x.army.length));
  const top = Math.max(200, ...sum.seats.flatMap((x) => x.army));
  const X = (i: number) => 34 + (i / (n - 1)) * (W - 44);
  const Y = (v: number) => H - 22 - (v / top) * (H - 36);
  const grid = [0, 0.5, 1].map((f) => `<line x1="34" x2="${W - 10}" y1="${Y(top * f)}" y2="${Y(top * f)}" stroke="#1d2a38"/><text x="30" y="${Y(top * f) + 4}" fill="#8497ad" font-size="11" text-anchor="end">${Math.round(top * f)}</text>`).join('');
  const minutes = Array.from({ length: Math.floor(((n - 1) * sum.every) / 60) + 1 }, (_, m) => m).filter((m) => m % Math.max(1, Math.ceil(((n - 1) * sum.every) / 60 / 8)) === 0).map((m) => `<text x="${X((m * 60) / sum.every)}" y="${H - 6}" fill="#8497ad" font-size="11" text-anchor="middle">${m}m</text>`).join('');
  const lines = sum.seats.map((x) => `<polyline fill="none" stroke="${color(x.seat)}" stroke-width="${x.seat === me ? 3.5 : 2}" stroke-linejoin="round" points="${x.army.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}"/>`).join('');
  box.querySelector('.ui')!.innerHTML = `<h1>${title}</h1><div class="when">${names.length ? `${names.join(' and ')} won` : 'No one is left'} after ${Math.floor(s.time / 60)}:${String(s.time % 60).padStart(2, '0')}</div>
    <table><tr><th>Commander</th><th>Trained</th><th>Killed</th><th>Lost</th><th>Built</th><th>Razed</th><th>Steel</th><th>Oil</th></tr>${rows}</table>
    <h2>Army strength</h2><svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${minutes}${lines}</svg>
    <div class="btns"><button class="go" data-sum="rematch">Rematch</button><button data-sum="again">Back to setup</button><button data-sum="close">Look at the field</button></div>`;
}

/** Whether a building may go here, as the server will judge it (near enough: not the other buildings). */
/** Whether a wall's cell is shut already (the server's grid: the land, a building, a deposit): a wall skips it, as it's wall enough. */
function cellShut(x: number, z: number): boolean {
  const near = (cx: number, cz: number, r: number) => Math.hypot(x - cx, z - cz) <= r + WALL_CELL * 0.5;
  return (
    landShut(x, z) ||
    ui.buildings.some((b) => !BUILDINGS[b.kind].wall && near(b.x, b.z, BUILDINGS[b.kind].radius + SHUT.building)) ||
    DEPOSITS.some((n) => !n.salvage && (ui.state?.deposits[n.id] ?? 1) > 0 && near(n.x, n.z, SHUT.deposit)) ||
    DRESSING.some((d) => d.block && near(d.x, d.z, d.block))
  );
}

function fits(kind: BuildingKind, x: number, z: number): boolean {
  const r = BUILDINGS[kind].radius;
  if (BUILDINGS[kind].wall) {
    if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1 || cellShut(x, z)) return false;
    const me = mySeat();
    return !ui.buildings.some((b) => {
      const d = Math.hypot(b.x - x, b.z - z);
      return BUILDINGS[b.kind].wall ? d < 2.9 && !(kind === 'gate' && b.kind === 'rampart' && b.seat === me) : d < r + BUILDINGS[b.kind].radius;
    });
  }
  if (inMesa(x, z, r + 1) || inHill(x, z, r)) return false;
  if (kind === 'dock') {
    const l = LAKES[lakeOf(x, z)];
    const d = Math.hypot(x - l.x, z - l.z);
    return d >= l.r + 0.5 && d <= l.r + r + 2.5;
  }
  return !inLake(x, z, r + 1) && !ui.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < r + BUILDINGS[b.kind].radius + (BUILDINGS[b.kind].wall ? 0 : 1));
}

/** The menu in a match: back to it, or give up. */
function askMenu(open: boolean): void {
  const box = el('.cm-ask');
  box.style.display = open ? 'grid' : 'none';
  const quit = box.querySelector<HTMLElement>('[data-ask="quit"]')!;
  quit.classList.remove('warn');
  quit.textContent = 'Surrender';
}

const NS = 'http://www.w3.org/2000/svg';

/** Each frame: rings, health bars, the building being placed, and the minimap. */
export function frameUi(c: Client): void {
  drawFog(ui.state?.phase === 'play' && !ui.eyes.all);
  drawPanels();
  const snap = (v: number) => (ui.placing && BUILDINGS[ui.placing].wall ? wallSnap(v) : v);
  frameGhost(c, ui.placing, Math.max(0, mySeat()), snap(ui.mouse?.x ?? 0), snap(ui.mouse?.z ?? 0));
  if (ui.state?.phase === 'lobby') {
    setCursor('');
    return svg.replaceChildren();
  }
  const out: SVGElement[] = [];
  const add = (tag: string, attrs: Record<string, string | number>) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    out.push(n);
  };
  const bar = (x: number, y: number, w: number, p: number) => {
    add('rect', { x: x - w / 2 - 1, y: y - 1, width: w + 2, height: 7, fill: '#0a0f15' });
    add('rect', { x: x - w / 2, y, width: (w * Math.max(0, p)) / 100, height: 5, fill: hpColor(p) });
  };
  const ring = (cx: number, cz: number, r: number, attrs: Record<string, string | number>) => {
    const pts: string[] = [];
    for (let i = 0; i < 40; i++) {
      const p = toScreen(cx + Math.cos((i / 40) * Math.PI * 2) * r, FLOOR + 0.05, cz + Math.sin((i / 40) * Math.PI * 2) * r);
      if (p) pts.push(`${p.x},${p.y}`);
    }
    add('polygon', { points: pts.join(' '), ...attrs });
  };
  // A team shows in a thin ring under each unit and building (the models are all one colour).
  // (A side's flag flies over each of its buildings and units: `client/units.ts`.)
  // The ground under a unit: the hill's height where it stands (helicopters' shadows fall on it too).
  const groundOf = (u: U, at: { x: number; z: number; y?: number }) => (UNITS[u.kind].naval ? FLOOR : UNITS[u.kind].air ? FLOOR + (at.y ?? FLOOR + 5) - FLOOR - 5 : at.y ?? FLOOR);
  for (const u of ui.units) {
    if (UNITS[u.kind].naval) continue;
    const at = drawnAt.get(u.id) ?? u;
    const p = toScreen(at.x, UNITS[u.kind].air ? FLOOR : groundOf(u, at), at.z);
    if (!p) continue;
    const r = UNITS[u.kind].size * 0.5;
    // (The team shows in each unit's flag; under it only a soft shadow to sit it on the ground.)
    add('ellipse', { cx: p.x, cy: p.y + 1, rx: 6 + r * 7, ry: 2.5 + r * 2.6, fill: '#000', 'fill-opacity': 0.18 });
  }
  for (const u of ui.units) {
    const sel = ui.sel.has(u.id);
    const rank = rankBits(u.flags);
    if (!sel && u.hp >= 100 && !rank) continue;
    const air = !!UNITS[u.kind].air;
    const at = drawnAt.get(u.id) ?? u;
    const g = groundOf(u, at);
    const p = toScreen(at.x, g + (air ? 5 : 0), at.z);
    const top = toScreen(at.x, g + (air ? 10.5 : UNITS[u.kind].naval ? 4.6 : u.kind === 'tank' ? 4 : 4.6), at.z);
    if (!p || !top) continue;
    if (sel) add('ellipse', { cx: p.x, cy: p.y, rx: air ? 16 : UNITS[u.kind].naval ? 26 : 20, ry: air ? 7 : UNITS[u.kind].naval ? 11 : 9, fill: 'none', stroke: '#eaffea', 'stroke-width': 2.5 });
    if (sel || u.hp < 100) bar(top.x, top.y - 6, 32, u.hp);
    // A veteran's stars: gold chevrons over it.
    for (let k = 0; k < rank; k++) {
      const cx = top.x + (k - (rank - 1) / 2) * 9;
      const cy = top.y - (sel || u.hp < 100 ? 16 : 6);
      add('polygon', { points: `${cx - 4},${cy - 1} ${cx},${cy - 5} ${cx + 4},${cy - 1} ${cx + 4},${cy + 2} ${cx},${cy - 2} ${cx - 4},${cy + 2}`, fill: '#ffd23a', stroke: '#4a3200', 'stroke-width': 1 });
    }
  }
  for (const b of ui.buildings) {
    const sel = ui.selB === b.id;
    if (!sel && b.hp >= 100 && b.built >= 100) continue;
    const low = !!BUILDINGS[b.kind].wall;
    const top = toScreen(b.x, FLOOR + (low ? 5.5 : 10), b.z);
    if (top) bar(top.x, top.y, low ? 22 : 52, b.built < 100 ? b.built : b.hp);
    if (sel) ring(b.x, b.z, BUILDINGS[b.kind].radius + 0.8, { fill: 'none', stroke: '#7dff7d', 'stroke-width': 3 });
  }
  // The relics: a dashed ring in the holder's colour, and the share a side has taken.
  CAMPS.forEach((c, i) => {
    const r = ui.state?.relics?.[i];
    ring(c.x, c.z, 6, { fill: 'none', stroke: color(r?.owner ?? -1), 'stroke-width': 3, 'stroke-dasharray': '7 6', 'stroke-opacity': 0.9 });
    const lab = toScreen(c.x, FLOOR + 6, c.z);
    if (lab && r && r.pct > 0) bar(lab.x, lab.y, 40, r.pct);
  });
  // A mine of theirs that a scout has found: a warning round it.
  for (let i = 0; i < ui.mines.length; i += 3) if (!ui.mines[i + 2]) ring(ui.mines[i], ui.mines[i + 1], 2.2, { fill: 'rgba(240,68,56,0.25)', stroke: '#f04438', 'stroke-width': 2 });
  if (ui.placing && ui.mouse) {
    // (A wall: each cell of the line being dragged, or the one under the mouse.)
    const kind = ui.placing;
    const spots = !BUILDINGS[kind].wall ? [ui.mouse] : kind === 'rampart' && wallFrom ? wallLine(wallFrom.x, wallFrom.z, ui.mouse.x, ui.mouse.z) : [{ x: wallSnap(ui.mouse.x), z: wallSnap(ui.mouse.z) }];
    for (const p of spots) {
      // (A cell a tree or a rock has already: left as it is, faintly.)
      if (BUILDINGS[kind].wall && cellShut(p.x, p.z)) {
        ring(p.x, p.z, 0.8, { fill: 'rgba(200,200,200,0.25)', stroke: '#c8c8c8', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' });
        continue;
      }
      const ok = fits(kind, p.x, p.z);
      ring(p.x, p.z, BUILDINGS[kind].radius, ok ? { fill: 'rgba(76,208,74,0.35)', stroke: '#7dff7d', 'stroke-width': 3 } : { fill: 'rgba(240,68,56,0.3)', stroke: '#f04438', 'stroke-width': 3 });
    }
  }
  if (ui.aim === 'power' && ui.mouse) ring(ui.mouse.x, ui.mouse.z, 9, { fill: 'rgba(240,68,56,0.3)', stroke: '#f04438', 'stroke-width': 3 });
  if (ui.aim === 'ability' && ui.abKind && ui.mouse) {
    const a = ABILITIES[ui.abKind]!;
    ring(ui.mouse.x, ui.mouse.z, a.radius + a.spread * 0.7, { fill: 'rgba(255,179,71,0.25)', stroke: '#ffb347', 'stroke-width': 3 });
    const of = ui.units.find((u) => ui.sel.has(u.id) && u.kind === ui.abKind);
    if (of) ring(of.x, of.z, a.range, { fill: 'none', stroke: '#ffb347', 'stroke-width': 1.5, 'stroke-dasharray': '7 6', 'stroke-opacity': 0.8 });
  }
  const text = (x: number, y: number, s: string, fill: string, size: number) => {
    const n = document.createElementNS(NS, 'text');
    for (const [k, v] of Object.entries({ x, y, fill, 'font-size': size, 'font-weight': 700, 'text-anchor': 'middle', stroke: '#0a0f15', 'stroke-width': 3, 'paint-order': 'stroke', 'font-family': 'inherit' })) n.setAttribute(k, String(v));
    n.textContent = s;
    out.push(n);
  };
  // Each building's name on a plate at its foot, in its side's colour, and what it's at.
  for (const b of ui.buildings) {
    if (BUILDINGS[b.kind].wall) continue;
    const p = toScreen(b.x, FLOOR, b.z + BUILDINGS[b.kind].radius * 0.75);
    if (!p) continue;
    // (On a dark plate with its side's colour at the end: legible on anything. Zoomed well out, there are too many to read.)
    if (cam.dist < 105) {
      const label = BUILDINGS[b.kind].name;
      const w = label.length * 7.2 + 16;
      add('rect', { x: p.x - w / 2, y: p.y + 2, width: w, height: 17, rx: 3, fill: '#0b1118', 'fill-opacity': 0.8 });
      add('rect', { x: p.x - w / 2, y: p.y + 2, width: 4, height: 17, rx: 1.5, fill: color(b.seat) });
      text(p.x + 2, p.y + 15, label, '#eef3f8', 12);
    }
    const busy = b.built < 100 || b.queue >= 1000 || (b.queue >= 0 && BUILDINGS[b.kind].trains.length > 0);
    if (busy) text(p.x, p.y + 28, buildingDoing(b), '#ffd27a', 11);
  }
  // Over each of ours, a mark for what it's at (mining, building, carrying, fighting, idle).
  const me = mySeat();
  for (const u of ui.units) {
    if (u.seat !== me) continue;
    const w = doing(u);
    if (!w.glyph) continue;
    const at = drawnAt.get(u.id) ?? u;
    const air = !!UNITS[u.kind].air;
    const top = toScreen(at.x, groundOf(u, at) + (air ? 10.5 : UNITS[u.kind].naval ? 4.6 : u.kind === 'tank' ? 4 : 4.6), at.z);
    if (!top) continue;
    const lift = (ui.sel.has(u.id) || u.hp < 100 ? 12 : 0) + (rankBits(u.flags) ? 10 : 0);
    {
      // (Drawn, on a dark disc: legible on grass or rock, and the same on every machine.)
      const iy = top.y - 8 - lift;
      add('circle', { cx: top.x, cy: iy, r: 9.5, fill: '#0b1118', 'fill-opacity': 0.78, stroke: w.color, 'stroke-width': 1.2, 'stroke-opacity': 0.8 });
      const d = iconPath(w.glyph);
      if (d) add('path', { d, fill: w.color, 'fill-rule': 'evenodd', transform: `translate(${top.x - 6.4} ${iy - 6.4}) scale(0.8)` });
    }
  }
  // Where the selection is bound: a line from each, through its queued orders.
  const LINE = ['#7dff7d', '#ff7a5a', '#ff7a5a', '#ffd27a', '#ffd27a', '#9fd0ff'];
  let drawn = 0;
  for (const id of ui.sel) {
    const plan = ui.orders.get(id);
    const at = drawnAt.get(id);
    if (!plan || !at || drawn++ > 40) continue;
    let from = toScreen(at.x, at.y, at.z);
    for (let k = 0; k < plan.length && from; k += 3) {
      const to = toScreen(plan[k + 1], FLOOR + 0.1, plan[k + 2]);
      if (!to) break;
      add('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: LINE[plan[k]], 'stroke-width': 1.5, 'stroke-opacity': 0.75, 'stroke-dasharray': '5 4' });
      add('circle', { cx: to.x, cy: to.y, r: 3.5, fill: LINE[plan[k]], 'fill-opacity': 0.85 });
      from = to;
    }
  }
  // Marks on the ground: rings that close on where an order went; a ping's are bigger, and pulse.
  const nowMs = performance.now();
  ui.marks = ui.marks.filter((m) => nowMs - m.at < m.life);
  for (const m of ui.marks) {
    const f = (nowMs - m.at) / m.life;
    const r = m.big ? 2 + (f * 6) % 2 * 3 : 3.2 * (1 - f) + 0.4;
    ring(m.x, m.z, r, { fill: 'none', stroke: m.color, 'stroke-width': m.big ? 3 : 2.5, 'stroke-opacity': 1 - f * 0.7 });
  }
  // The arrow of a right drag: which way the group will face.
  if (facing) {
    const a = toScreen(facing.from.x, FLOOR + 0.1, facing.from.z);
    const b = toScreen(facing.to.x, FLOOR + 0.1, facing.to.z);
    if (a && b) {
      add('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#7dff7d', 'stroke-width': 4, 'stroke-linecap': 'round' });
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      add('polygon', { points: [[b.x + Math.cos(ang) * 12, b.y + Math.sin(ang) * 12], [b.x + Math.cos(ang + 2.4) * 11, b.y + Math.sin(ang + 2.4) * 11], [b.x + Math.cos(ang - 2.4) * 11, b.y + Math.sin(ang - 2.4) * 11]].map((p) => p.join(',')).join(' '), fill: '#7dff7d' });
    }
  }
  // Holding Alt: the field read out.
  const reading = cam.keys.has('AltLeft') || cam.keys.has('AltRight');
  el('.cm-alt').style.display = reading && ui.state?.phase === 'play' ? 'block' : 'none';
  if (reading) {
    const myTeam = meSeat()?.team;
    const teamOf = (seat: number) => ui.state?.seats.find((x) => x.seat === seat)?.team;
    // Territory: who holds each patch, by the nearest building in reach.
    const STEP = 10;
    for (let gx = -HALF; gx < HALF; gx += STEP) for (let gz = -HALF; gz < HALF; gz += STEP) {
      let best: B | null = null;
      let bd = 32;
      for (const b of ui.buildings) {
        const d = Math.hypot(b.x - gx - STEP / 2, b.z - gz - STEP / 2);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (!best) continue;
      const pts = [[gx, gz], [gx + STEP, gz], [gx + STEP, gz + STEP], [gx, gz + STEP]].map(([x, z]) => toScreen(x, FLOOR, z));
      if (pts.every(Boolean)) add('polygon', { points: pts.map((p) => `${p!.x},${p!.y}`).join(' '), fill: color(best.seat), 'fill-opacity': 0.3 });
    }
    // The enemy's reach, in red; what's selected: its reach and sight.
    for (const b of ui.buildings) if (BUILDINGS[b.kind].guns && teamOf(b.seat) !== myTeam) ring(b.x, b.z, BUILDINGS[b.kind].guns!.range, { fill: 'rgba(240,68,56,0.08)', stroke: '#f04438', 'stroke-width': 1.5 });
    let n = 0;
    for (const u of ui.units) {
      if (teamOf(u.seat) === myTeam || UNITS[u.kind].damage <= 0 || n++ > 24) continue;
      ring(u.x, u.z, UNITS[u.kind].range, { fill: 'none', stroke: '#f04438', 'stroke-width': 1, 'stroke-opacity': 0.55 });
    }
    for (const id of ui.sel) {
      const u = ui.units.find((x) => x.id === id);
      if (!u) continue;
      if (UNITS[u.kind].damage > 0) ring(u.x, u.z, UNITS[u.kind].range, { fill: 'none', stroke: '#7dff7d', 'stroke-width': 1.5 });
      if (ui.sel.size <= 3) ring(u.x, u.z, UNITS[u.kind].sight ?? (UNITS[u.kind].air ? SIGHT.air : SIGHT.unit), { fill: 'none', stroke: '#9fd0ff', 'stroke-width': 1, 'stroke-dasharray': '6 6' });
    }
    // Everyone's health.
    for (const u of ui.units) {
      if (u.hp >= 100 && ui.sel.has(u.id)) continue;
      const at = drawnAt.get(u.id) ?? u;
      const top = toScreen(at.x, FLOOR + (UNITS[u.kind].air ? 10.5 : 4.6), at.z);
      if (top) bar(top.x, top.y - 6, 26, u.hp);
    }
    for (const b of ui.buildings) {
      const top = toScreen(b.x, FLOOR + 10, b.z);
      if (top && b.hp >= 100) bar(top.x, top.y, 46, b.hp);
    }
  }
  // The cursor says what a right click would do.
  {
    const mm = cam.mouse;
    let cur = '';
    if (mm && ui.state?.phase === 'play') {
      const g2 = toGround(mm.x, mm.y);
      const what = under(mm.x, mm.y, g2);
      const hasEng = ui.units.some((u) => ui.sel.has(u.id) && u.kind === 'engineer');
      const ownUnder = mine().some((u) => {
        const p = toScreen(u.x, FLOOR + liftOf(u), u.z);
        return !!p && Math.hypot(p.x - mm.x, p.y - mm.y) < 26;
      });
      if (ui.placing) cur = 'place';
      else if (ui.aim) cur = 'attack';
      else if (ownUnder) cur = 'own';
      else if (ui.sel.size && (what.t === 'unit' || what.t === 'building')) cur = 'attack';
      else if (hasEng && what.t === 'deposit') cur = 'gather';
      else if (ui.sel.size) cur = 'move';
    }
    setCursor(cur);
  }
  // The card under the mouse.
  const hover = el('.cm-hover');
  const card = cam.mouse && !ui.placing && ui.state?.phase === 'play' ? hoverCard(cam.mouse.x, cam.mouse.y) : '';
  if (!card) hover.style.display = 'none';
  else {
    if (hover.dataset.card !== card) {
      hover.innerHTML = card;
      hover.dataset.card = card;
    }
    hover.style.display = 'block';
    const w = hover.offsetWidth;
    const h = hover.offsetHeight;
    hover.style.left = `${Math.min(window.innerWidth - w - 8, cam.mouse!.x + 18)}px`;
    hover.style.top = `${Math.max(48, Math.min(window.innerHeight - 200 - h, cam.mouse!.y + 18))}px`;
  }
  svg.replaceChildren(...out);
  drawMini();
}

let groundPic: HTMLCanvasElement | null = null;
/** The minimap's ground, which never changes: meadow, roads, base pads, woods, hills and rock. */
function miniGround(): HTMLCanvasElement {
  if (groundPic) return groundPic;
  groundPic = document.createElement('canvas');
  groundPic.width = groundPic.height = MINI;
  const g = groundPic.getContext('2d')!;
  const k = MINI / (2 * HALF);
  const X = (x: number) => (x + HALF) * k;
  g.fillStyle = '#4a8e38';
  g.fillRect(0, 0, MINI, MINI);
  g.fillStyle = '#7e6749';
  g.fillRect(X(-69), X(-69), 138 * k, 3 * k + 1);
  g.fillRect(X(-69), X(67), 138 * k, 3 * k + 1);
  g.fillRect(X(-69), X(-69), 3 * k + 1, 138 * k);
  g.fillRect(X(67), X(-69), 3 * k + 1, 138 * k);
  g.fillStyle = '#918d84';
  for (const b of BASES) {
    g.beginPath();
    g.arc(X(b.x), X(b.z), 13 * k, 0, Math.PI * 2);
    g.fill();
  }
  for (const hl of HILLS) for (let t = 0; t < hl.h; t++) {
    g.fillStyle = t % 2 ? '#74b85a' : '#61a64c';
    g.beginPath();
    g.arc(X(hl.x), X(hl.z), (hl.r - t * 2.4) * k, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#8a857b';
  for (const m of MESAS) {
    g.beginPath();
    g.arc(X(m.x), X(m.z), m.r * k, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#2c6a2c';
  for (const t of TREES) g.fillRect(X(t.x) - 1.1, X(t.z) - 1.1, 2.2, 2.2);
  return groundPic;
}

function drawMini(): void {
  const g = mini.getContext('2d')!;
  const k = MINI / (2 * HALF);
  const X = (x: number) => (x + HALF) * k;
  g.clearRect(0, 0, MINI, MINI);
  g.drawImage(miniGround(), 0, 0);
  // Fog: dark everywhere but where the team sees.
  if (!ui.eyes.all) {
    g.fillStyle = 'rgba(10,16,24,0.66)';
    g.fillRect(0, 0, MINI, MINI);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < ui.eyes.eyes.length; i += 3) {
      g.beginPath();
      g.arc(X(ui.eyes.eyes[i]), X(ui.eyes.eyes[i + 1]), ui.eyes.eyes[i + 2] * k, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  g.fillStyle = '#3a8ad0';
  for (const l of LAKES) {
    g.beginPath();
    g.arc(X(l.x), X(l.z), l.r * k, 0, Math.PI * 2);
    g.fill();
  }
  // Supply drops: a pulsing gold square.
  for (const d of ui.state?.drops ?? []) {
    const r = 3.5 + Math.sin(performance.now() / 180) * 1;
    g.fillStyle = '#ffd23a';
    g.fillRect(X(d.x) - r, X(d.z) - r, r * 2, r * 2);
    g.strokeStyle = '#0b1118';
    g.strokeRect(X(d.x) - r, X(d.z) - r, r * 2, r * 2);
  }
  CAMPS.forEach((c, i) => {
    g.fillStyle = color(ui.state?.relics?.[i]?.owner ?? -1);
    g.beginPath();
    g.moveTo(X(c.x), X(c.z) - 5);
    g.lineTo(X(c.x) + 5, X(c.z));
    g.lineTo(X(c.x), X(c.z) + 5);
    g.lineTo(X(c.x) - 5, X(c.z));
    g.fill();
    g.strokeStyle = '#0b1118';
    g.stroke();
  });
  // Land: who holds each patch, by the nearest building in reach.
  if (ui.miniMode === 3) {
    const STEP = 8;
    for (let gx = -HALF; gx < HALF; gx += STEP) for (let gz = -HALF; gz < HALF; gz += STEP) {
      let best: B | null = null;
      let bd = 32;
      for (const b of ui.buildings) {
        const d = Math.hypot(b.x - gx - STEP / 2, b.z - gz - STEP / 2);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (!best) continue;
      g.fillStyle = color(best.seat);
      g.globalAlpha = 0.55;
      g.fillRect(X(gx), X(gz), STEP * k + 0.5, STEP * k + 0.5);
      g.globalAlpha = 1;
    }
  }
  if (ui.miniMode !== 1) for (const n of DEPOSITS) {
    const left = ui.state?.deposits[n.id] ?? 1;
    if (left <= 0) continue;
    g.fillStyle = n.kind === 'steel' ? '#b8c4d8' : '#111';
    // (Economy: sized by what's left.)
    const size = ui.miniMode === 2 ? 2 + Math.min(6, left / 400) : 4;
    g.fillRect(X(n.x) - size / 2, X(n.z) - size / 2, size, size);
  }
  for (const b of ui.buildings) {
    g.fillStyle = color(b.seat);
    if (BUILDINGS[b.kind].wall) {
      g.fillRect(X(b.x) - 1.5, X(b.z) - 1.5, 3, 3);
      continue;
    }
    g.fillRect(X(b.x) - 4, X(b.z) - 4, 8, 8);
    g.strokeStyle = '#0b1118';
    g.strokeRect(X(b.x) - 4, X(b.z) - 4, 8, 8);
  }
  for (const u of ui.units) {
    // (Armies: fighters only, and bigger; economy: engineers only.)
    if ((ui.miniMode === 1 && u.kind === 'engineer') || (ui.miniMode === 2 && u.kind !== 'engineer')) continue;
    g.fillStyle = color(u.seat);
    if (ui.miniMode === 1) g.fillRect(X(u.x) - 2.5, X(u.z) - 2.5, 5, 5);
    else g.fillRect(X(u.x) - 1.5, X(u.z) - 1.5, 3, 3);
  }
  // Alerts: a red ring that grows and fades over six seconds.
  const now = performance.now();
  ui.pings = ui.pings.filter((p) => now - p.at < 6000);
  for (const p of ui.pings) {
    const f = (now - p.at) / 6000;
    g.strokeStyle = `rgba(255,80,60,${1 - f})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(X(p.x), X(p.z), 5 + f * 18, 0, Math.PI * 2);
    g.stroke();
  }
  // Where the camera looks.
  const v = view();
  if (v) {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.strokeRect(X(v.x - v.w / 2), X(v.z - v.h / 2), v.w * k, v.h * k);
  }
}
