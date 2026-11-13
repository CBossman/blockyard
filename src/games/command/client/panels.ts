import type { Client } from '@platform/client';
import { AGE_NAMES, AGE_NEEDS, BUILDINGS, DOCTRINES, NEEDS, TECHS, TECH_IDS, TEAM_COLORS, UNITS, ageOf, type BuildingKind, type TechId, type UnitKind } from '../defs';
import { lookAt } from './camera';
import { iconHtml } from './icons';
import { UNIT_ORDER } from '../protocol';
import { color, el, esc, meSeat, mine, mySeat, pic, select, ui } from './ui';

/**
 * The panels beside the field: what to do next, every building's production, the army at a glance,
 * how the commanders stand, the latest alerts; the control groups along the bottom; chat; and the
 * tech tree. Each acts on the press of the button, as they're redrawn a few times a second.
 */

export const PANEL_CSS = `
.cm-dock { position: absolute; right: 8px; top: 50px; width: 214px; max-height: calc(100vh - 262px); overflow: hidden; display: flex; flex-direction: column; gap: 6px; }
.cm-sec { background: rgba(14,21,29,0.86); border: 1px solid #2c3e52; border-radius: 4px; padding: 5px 7px; }
.cm-sec h5 { margin: 0 0 3px; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dim); }
.cm-adv { cursor: pointer; font-size: 14px; font-weight: 600; line-height: 1.25; color: #ffe08a; border-color: #8a6a22; }
.cm-adv:hover { background: rgba(58,42,18,0.9); }
.cm-adv small { display: block; color: #c9b98a; font-weight: 500; font-size: 12px; }
.cm-prod { display: flex; align-items: center; gap: 4px; padding: 2px; cursor: pointer; border-radius: 3px; }
.cm-prod:hover { background: rgba(255,255,255,0.08); }
.cm-prod img { width: 26px; height: 26px; object-fit: contain; flex: none; }
.cm-prod .q { display: flex; gap: 1px; flex: 1; min-width: 0; }
.cm-prod .q img { width: 20px; height: 20px; }
.cm-prod .q img:first-child { background: rgba(255,157,46,0.25); border-radius: 2px; }
.cm-prod .bar { height: 3px; background: #0a0f15; margin-top: 2px; }
.cm-prod .bar i { display: block; height: 100%; background: var(--hi); }
.cm-prod .idle { font-size: 11px; color: #ff8a6a; }
.cm-chips { display: flex; flex-wrap: wrap; gap: 3px; }
.cm-chip { position: relative; width: 36px; height: 36px; cursor: pointer; background: radial-gradient(#2a3b4e, #121b25); border: 1px solid #2c3e52; border-radius: 3px; }
.cm-chip:hover { border-color: var(--hi); }
.cm-chip img { width: 100%; height: 100%; object-fit: contain; }
.cm-chip span { position: absolute; right: 1px; bottom: -1px; font-size: 13px; font-weight: 700; text-shadow: 0 0 3px #000, 0 0 3px #000; }
.cm-str { display: grid; grid-template-columns: 8px 1fr 38px; gap: 4px; align-items: center; font-size: 12px; }
.cm-str i { width: 8px; height: 8px; border-radius: 2px; }
.cm-str .b { height: 7px; background: #0a0f15; }
.cm-str .b u { display: block; height: 100%; }
.cm-str em { font-style: normal; text-align: right; color: var(--dim); }
.cm-al { font-size: 12px; padding: 2px 3px; cursor: pointer; color: #ffb09a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-al:hover { background: rgba(255,255,255,0.08); }
.cm-al small { color: var(--dim); margin-right: 4px; }
.cm-groups { position: absolute; left: 170px; bottom: 199px; display: flex; gap: 4px; }
.cm-gr { position: relative; width: 44px; height: 40px; cursor: pointer; background: linear-gradient(#233246, #172231); border: 2px solid #3a526b; border-radius: 3px; }
.cm-gr.on { border-color: var(--hi); }
.cm-gr b { position: absolute; left: 3px; top: -1px; font-size: 12px; color: var(--hi); }
.cm-gr img { position: absolute; right: 1px; top: 1px; width: 28px; height: 28px; object-fit: contain; }
.cm-gr span { position: absolute; right: 3px; bottom: -1px; font-size: 13px; font-weight: 700; text-shadow: 0 0 3px #000; }
.cm-chat { position: absolute; left: 14px; bottom: 256px; width: 420px; font-size: 15px; font-weight: 600; text-shadow: 0 1px 3px #000, 0 0 4px #000; pointer-events: none; }
.cm-chat div { margin-top: 2px; }
.cm-say { position: absolute; left: 14px; bottom: 244px; width: 420px; display: none; padding: 4px; background: rgba(11,17,24,0.92); border: 2px solid var(--hi); border-radius: 3px; }
.cm-say input { width: 100%; box-sizing: border-box; background: transparent; border: 0; outline: 0; color: #fff; font: inherit; font-size: 15px; }
.cm-tech { position: absolute; inset: 42px 0 192px; display: none; place-items: center; pointer-events: auto; background: rgba(6,9,13,0.72); }
.cm-tech > div { width: min(960px, 96vw); max-height: 96%; overflow: auto; padding: 14px 20px; background: linear-gradient(#18232f, #0e151d); border: 3px solid #3a526b; border-radius: 6px; }
.cm-tech h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; color: #fff; display: flex; justify-content: space-between; }
.cm-tech h1 small { font-size: 13px; letter-spacing: 0; text-transform: none; color: var(--dim); }
.cm-tree { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.cm-tree h2 { margin: 0 0 5px; font-size: 16px; color: var(--hi); text-transform: uppercase; letter-spacing: 1px; }
.cm-tree h2.locked { color: var(--dim); }
.cm-tn { display: flex; align-items: center; gap: 6px; padding: 2px 4px; font-size: 13px; line-height: 1.15; border-radius: 3px; }
.cm-tn img { width: 26px; height: 26px; object-fit: contain; flex: none; }
.cm-tn .g { width: 26px; text-align: center; font-size: 16px; flex: none; }
.cm-tn small { display: block; color: var(--dim); font-size: 11px; }
.cm-tn.have { background: rgba(76,208,74,0.14); }
.cm-tn.locked { opacity: 0.5; }
.cm-tn.now small { color: #9fe08a; }
.cm-top { gap: 12px !important; }
.cm-mid, .cm-pl { white-space: nowrap; }
.cm-peace { position: absolute; top: 50px; left: 50%; transform: translateX(-50%); padding: 4px 14px; font-size: 14px; font-weight: 700; color: #bfe6ff; background: rgba(11,17,24,0.85); border: 1px solid #4a6684; border-radius: 3px; display: none; }
`;

let client: Client;
const icon = (id: string) => client.hud.icon({ item: id }).outerHTML;
type Do = () => void;
let adviceDo: Do | null = null;
let renderedAt = 0;

export function setupPanels(c: Client): void {
  client = c;
  // (Acting on the press: these are redrawn while the mouse is over them.)
  el('.cm-dock').addEventListener('pointerdown', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!t) return;
    e.preventDefault();
    const [a, v] = t.dataset.a!.split(':');
    if (a === 'adv') adviceDo?.();
    else if (a === 'bld') {
      const b = ui.buildings.find((x) => x.id === Number(v));
      if (b) {
        select([], b.id);
        if ((e as PointerEvent).button === 2 || e.ctrlKey) lookAt(b.x, b.z);
      }
    } else if (a === 'kind') {
      select(mine().filter((u) => u.kind === v).map((u) => u.id), null);
    } else if (a === 'alert') {
      const p = ui.alerts[Number(v)];
      if (p) lookAt(p.x, p.z);
    }
  });
  el('.cm-groups').addEventListener('pointerdown', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-g]');
    if (!t) return;
    const ids = (ui.groups.get(t.dataset.g!) ?? []).filter((id) => ui.units.some((u) => u.id === id));
    if (!ids.length) return;
    select(ids, null);
    const u = ui.units.find((x) => x.id === ids[0]);
    if (u && e.detail > 1) lookAt(u.x, u.z);
  });
  el('.cm-tech').addEventListener('pointerdown', (e) => {
    if (e.target === e.currentTarget) toggleTech();
  });
  const input = el<HTMLInputElement>('.cm-say input');
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.code === 'Escape') closeSay();
    if (e.code !== 'Enter') return;
    if (input.value.trim()) client.send('chat', { text: input.value, team: input.dataset.team === '1' });
    closeSay();
  });
}

const closeSay = () => {
  const input = el<HTMLInputElement>('.cm-say input');
  input.value = '';
  input.blur();
  el('.cm-say').style.display = 'none';
};
/** Open the line to type on: to everyone, or (Shift + Enter) to the team. */
export function openSay(team: boolean): void {
  el('.cm-say').style.display = 'block';
  const input = el<HTMLInputElement>('.cm-say input');
  input.dataset.team = team ? '1' : '0';
  input.placeholder = team ? 'To your team (Enter to send, Esc to cancel)' : 'To everyone (Enter to send, Esc to cancel)';
  input.focus();
}

/** Lines of chat over the field, each for twelve seconds. */
const lines: { html: string; at: number }[] = [];
export function chatLine(html: string): void {
  lines.push({ html, at: performance.now() });
  if (lines.length > 40) lines.shift();
}

/** What's most worth doing now, in a line, and a press to get on with it. */
function advice(): { text: string; sub: string; run: Do } | null {
  const me = meSeat();
  if (!me || ui.state?.phase !== 'play') return null;
  const mineU = mine();
  const blds = ui.buildings.filter((b) => b.seat === me.seat);
  const done = (k: BuildingKind) => blds.some((b) => b.kind === k && b.built >= 100);
  const started = (k: BuildingKind) => blds.some((b) => b.kind === k);
  const hq = blds.find((b) => b.kind === 'hq');
  const eng = mineU.filter((u) => u.kind === 'engineer');
  const engIds = eng.map((u) => u.id);
  const fighters = mineU.filter((u) => u.kind !== 'engineer');
  const age = ageOf(me.techs);
  const pickHq: Do = () => hq && select([], hq.id);
  const pickEng: Do = () => select(engIds.slice(0, 2), null);
  const idle = eng.filter((u) => u.flags & 8).length;
  const foes = ui.units.filter((u) => ui.state?.seats.find((s) => s.seat === u.seat)?.team !== me.team && u.seat < 6);
  if (idle) return { text: `${idle} engineer${idle > 1 ? 's' : ''} idle`, sub: 'Select them and right click a deposit.', run: () => select(eng.filter((u) => u.flags & 8).map((u) => u.id), null) };
  if (eng.length < 7 && hq && !hq.queue) return { text: 'Train more engineers', sub: 'More engineers, more steel. Open your HQ.', run: pickHq };
  if (me.pop + 2 >= me.cap && !blds.some((b) => b.kind === 'depot' && b.built < 100)) return { text: 'Build a Supply Depot', sub: 'You are nearly out of room for people.', run: pickEng };
  if (!started('barracks')) return { text: 'Build a Barracks', sub: 'Select an engineer, then press X.', run: pickEng };
  if (done('barracks') && fighters.length < 5 && !blds.some((b) => b.kind === 'barracks' && b.queue >= 0)) return { text: 'Train infantry', sub: 'You need an army. Open your Barracks.', run: () => select([], blds.find((b) => b.kind === 'barracks')!.id) };
  if (age === 1 && hq && hq.queue < 1000) return { text: 'Advance to Era II', sub: 'Tanks, the factory and your commander. Open your HQ.', run: pickHq };
  if (age >= 2 && !started('factory')) return { text: 'Build a Factory', sub: 'Tanks win open ground.', run: pickEng };
  const armour = foes.filter((u) => u.kind === 'tank' || u.kind === 'artillery').length;
  if (armour >= 2 && mineU.filter((u) => u.kind === 'at').length < armour) return { text: 'Train AT Teams', sub: `You can see ${armour} enemy vehicles. Rockets beat armour.`, run: () => { const b = blds.find((x) => x.kind === 'barracks'); if (b) select([], b.id); } };
  if (foes.some((u) => u.kind === 'heli') && !mineU.some((u) => u.kind === 'aa')) return { text: 'Build Anti-Air', sub: 'Enemy helicopters are about. Open your Factory.', run: () => { const b = blds.find((x) => x.kind === 'factory'); if (b) select([], b.id); } };
  if (fighters.length >= 8 && ui.state.relics.some((r) => r.owner < 0 || ui.state?.seats.find((s) => s.seat === r.owner)?.team !== me.team)) return { text: 'Take a supply cache', sub: 'Clear a camp and hold its cache for steel.', run: () => select(fighters.map((u) => u.id), null) };
  if (fighters.length >= 12) return { text: 'Attack!', sub: 'Select your army, press Q, click their base.', run: () => select(fighters.map((u) => u.id), null) };
  return { text: 'Build up your army', sub: 'Keep your buildings training.', run: () => select(fighters.map((u) => u.id), null) };
}

/** The panels, a few times a second. */
export function drawPanels(): void {
  const s = ui.state;
  const playing = s?.phase === 'play';
  const peace = el('.cm-peace');
  const left = s && playing ? s.peaceUntil - s.time : 0;
  peace.style.display = left > 0 ? 'block' : 'none';
  if (left > 0) peace.textContent = `Peace: no attacks for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const dock = el('.cm-dock');
  const groups = el('.cm-groups');
  dock.style.display = playing ? 'flex' : 'none';
  groups.style.display = playing ? 'flex' : 'none';
  drawChat();
  if (!playing || !s) return;
  const now = performance.now();
  if (now - renderedAt < 250) return;
  renderedAt = now;
  const me = meSeat();
  let html = '';
  const adv = advice();
  adviceDo = adv?.run ?? null;
  if (adv) html += `<div class="cm-sec cm-adv" data-a="adv">${adv.text}<small>${adv.sub}</small></div>`;
  if (me) {
    // Production: every building that makes things, and what it has in hand.
    const rows = ui.buildings.filter((b) => b.seat === me.seat && b.built >= 100 && (BUILDINGS[b.kind].trains.length || BUILDINGS[b.kind].research)).map((b) => {
      const q = ui.prod.get(b.id) ?? [];
      const research = b.queue >= 1000;
      const pct = research ? b.queue % 1000 : b.queue >= 0 ? b.queue : 0;
      const what = research ? `<span style="font-size:11px">${TECHS[TECH_IDS[Math.floor(b.queue / 1000) - 1]].name}</span>` : q.map((k) => icon(pic(UNIT_ORDER[k]))).join('');
      return `<div class="cm-prod" data-a="bld:${b.id}" title="${BUILDINGS[b.kind].name} (Ctrl + click: go there)">${icon(pic(b.kind))}<div style="flex:1;min-width:0"><div class="q">${what || '<span class="idle">idle</span>'}</div>${q.length || research ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</div></div>`;
    });
    if (rows.length) html += `<div class="cm-sec"><h5>Production</h5>${rows.join('')}</div>`;
    // The army at a glance.
    const counts = UNIT_ORDER.map((k) => [k, mine().filter((u) => u.kind === k).length] as const).filter(([, n]) => n);
    if (counts.length) html += `<div class="cm-sec"><h5>Forces</h5><div class="cm-chips">${counts.map(([k, n]) => `<div class="cm-chip" data-a="kind:${k}" title="Select all: ${UNITS[k].name}">${icon(pic(k))}<span>${n}</span></div>`).join('')}</div></div>`;
  }
  // How the commanders stand.
  const top = Math.max(1, ...s.seats.map((x) => x.worth));
  html += `<div class="cm-sec"><h5>Army strength</h5><div class="cm-str">${s.seats.filter((x) => x.alive).map((x) => `<i style="background:${color(x.seat)}"></i><div class="b"><u style="width:${(x.worth / top) * 100}%;background:${color(x.seat)}"></u></div><em>${x.worth}</em>`).join('')}</div></div>`;
  // The latest alerts.
  if (ui.alerts.length) html += `<div class="cm-sec"><h5>Alerts</h5>${ui.alerts.slice(-4).reverse().map((a) => `<div class="cm-al" data-a="alert:${ui.alerts.indexOf(a)}"><small>${a.clock}</small>${esc(a.what)}</div>`).join('')}</div>`;
  if (dock.dataset.html !== html) {
    dock.dataset.html = html;
    dock.innerHTML = html;
  }
  // The control groups.
  let g = '';
  for (let k = 1; k <= 9; k++) {
    const ids = (ui.groups.get(String(k)) ?? []).filter((id) => ui.units.some((u) => u.id === id));
    if (!ids.length) continue;
    const us = ui.units.filter((u) => ids.includes(u.id));
    const lead = [...us].sort((a, b) => UNITS[b.kind].size - UNITS[a.kind].size)[0];
    g += `<div class="cm-gr ${ids.every((id) => ui.sel.has(id)) ? 'on' : ''}" data-g="${k}" title="Group ${k}: click to select, double click to go there"><b>${k}</b>${icon(pic(lead.kind))}<span>${ids.length}</span></div>`;
  }
  if (groups.dataset.html !== g) {
    groups.dataset.html = g;
    groups.innerHTML = g;
  }
  void mySeat;
}

function drawChat(): void {
  const now = performance.now();
  const box = el('.cm-chat');
  const html = lines.filter((l) => now - l.at < 12000).slice(-7).map((l) => `<div>${l.html}</div>`).join('');
  if (box.dataset.html !== html) {
    box.dataset.html = html;
    box.innerHTML = html;
  }
}

/** The tech tree: what each era opens, what you have and what you still need. */
export function toggleTech(): void {
  const box = el('.cm-tech');
  const open = box.style.display !== 'grid';
  box.style.display = open ? 'grid' : 'none';
  if (open) renderTech();
}

function renderTech(): void {
  const me = meSeat();
  if (!me) return void (el('.cm-tech').style.display = 'none');
  const age = ageOf(me.techs);
  const has = (k: BuildingKind) => ui.buildings.some((b) => b.seat === me.seat && b.kind === k && b.built >= 100);
  const BLD: BuildingKind[] = ['hq', 'depot', 'barracks', 'tower', 'bunker', 'factory', 'lab', 'dock', 'airfield'];
  const UN: UnitKind[] = ['engineer', 'rifle', 'scout', 'at', 'medic', 'tank', 'aa', 'hero', 'gunboat', 'transport', 'artillery', 'heli'];
  const eraOf = (k: UnitKind | BuildingKind) => AGE_NEEDS[k] ?? 1;
  const node = (img: string, name: string, sub: string, cls: string) => `<div class="cm-tn ${cls}">${img}<div>${name}<small>${sub}</small></div></div>`;
  const col = (era: number) => {
    const open = age >= era;
    const blds = BLD.filter((k) => eraOf(k) === era).map((k) => {
      const need = NEEDS[k];
      const got = has(k);
      const blocked = need && !has(need);
      return node(icon(pic(k)), BUILDINGS[k].name, got ? 'Built' : !open ? `Needs ${AGE_NAMES[era]}` : blocked ? `Needs a ${BUILDINGS[need].name}` : `${BUILDINGS[k].cost.steel} steel${BUILDINGS[k].cost.oil ? `, ${BUILDINGS[k].cost.oil} oil` : ''}`, got ? 'have' : open && !blocked ? 'now' : 'locked');
    });
    const units = UN.filter((k) => eraOf(k) === era).map((k) => {
      const from = UNITS[k].from;
      const got = has(from);
      return node(icon(pic(k)), UNITS[k].name, !open ? `Needs ${AGE_NAMES[era]}` : got ? `Train at your ${BUILDINGS[from].name}` : `Needs a ${BUILDINGS[from].name}`, open && got ? 'now' : 'locked');
    });
    const upgrade = (id: TechId, gl: string) => node(`<div class="g">${iconHtml(gl)}</div>`, TECHS[id].name, me.techs.includes(id) ? 'Researched' : `${TECHS[id].cost.steel} steel, ${TECHS[id].cost.oil} oil`, me.techs.includes(id) ? 'have' : open ? 'now' : 'locked');
    const ups = era === 1 ? [upgrade('age2', '▲')] : era === 2 ? [upgrade('age3', '▲'), upgrade('armor', '⚙'), upgrade('ordnance', '⚙'), upgrade('optics', '⚙'), upgrade('logistics', '⚙'), upgrade('medicine', '⚙'), upgrade('engines', '⚙')] : [];
    return `<div><h2 class="${open ? '' : 'locked'}">${AGE_NAMES[era]}${age === era ? ' · you are here' : ''}</h2>${blds.join('')}${units.join('')}${ups.join('')}</div>`;
  };
  el('.cm-tech').innerHTML = `<div class="ui"><h1>Tech tree<small>${DOCTRINES[me.doctrine].name} doctrine. Press K or click outside to close.</small></h1><div class="cm-tree">${col(1)}${col(2)}${col(3)}</div></div>`;
  void TEAM_COLORS;
}
