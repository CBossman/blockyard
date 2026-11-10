import type { Client } from '@platform/client';
import { AGE_NAMES, DIFFICULTIES, DOCTRINES, DOCTRINE_IDS, MODES, STYLE_CHOICES, TEAM_COLORS, type DoctrineId } from '../defs';
import type { Lobby, LobbySeat, State } from '../protocol';
import { draw, el, esc, meSeat, mySeat, ui } from './ui';

/**
 * Everything round a match: the main menu; the table where a match is set up (who sits where, on
 * which team, the bots and the rules, ready-up and an invite link); and the briefing before it starts.
 * The table is drawn from the server's word (`Lobby`), and only the host's controls are live.
 */

export const FRONT_CSS = `
.cm-lobby { position: absolute; inset: 0; display: none; place-items: center; pointer-events: auto; background: radial-gradient(ellipse at center, rgba(14,21,29,0.7), rgba(6,9,13,0.96)); }
.cm-front { width: min(1220px, 97vw); max-height: 94vh; overflow: auto; padding: 22px 26px; text-align: left; background: linear-gradient(#18232f, #0e151d); border: 3px solid #3a526b; border-radius: 6px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
.cm-lobby.title { place-items: center start; background: linear-gradient(90deg, rgba(6,9,13,0.93) 0%, rgba(6,9,13,0.78) 30%, rgba(6,9,13,0.12) 58%, rgba(6,9,13,0) 100%); }
.cm-lobby.title .cm-front { width: min(520px, 94vw); margin-left: clamp(16px, 6vw, 110px); padding: 0; background: none; border: 0; box-shadow: none; overflow: visible; }
.cm-lobby.title .cm-menu { text-align: left; padding: 0; }
.cm-lobby.title .cm-menu h1 { font-size: clamp(54px, 7vw, 92px); line-height: 0.92; letter-spacing: 4px; text-shadow: 0 4px 0 rgba(0,0,0,0.45); }
.cm-lobby.title .cm-menu h1 em { display: block; font-style: normal; color: var(--hi); }
.cm-lobby.title .cm-menu .tag { margin: 16px 0 26px; max-width: 430px; color: #c6d2de; }
.cm-lobby.title .cm-menu button { width: min(400px, 100%); margin: 9px 0; text-align: left; padding: 12px 18px; background: rgba(16,24,34,0.86); border-left-width: 5px; transition: transform 0.12s, background 0.12s; }
.cm-lobby.title .cm-menu button:hover { transform: translateX(8px); background: rgba(34,48,63,0.95); }
.cm-lobby.title .cm-menu button.go { background: rgba(70,48,18,0.94); }
.cm-menu { text-align: center; padding: 26px 0 30px; }
.cm-menu h1 { margin: 0; font-size: 62px; letter-spacing: 6px; text-transform: uppercase; color: #fff; }
.cm-menu .tag { color: var(--dim); font-size: 18px; margin: 4px 0 30px; }
.cm-menu button { display: block; width: 340px; margin: 10px auto; padding: 14px; font: inherit; font-size: 21px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #e8eef5; background: #172231; border: 2px solid #3a526b; border-radius: 4px; cursor: pointer; }
.cm-menu button:hover { border-color: var(--hi); background: #22303f; }
.cm-menu button.go { background: #3a2a12; border-color: var(--hi); color: #ffe0a8; }
.cm-menu small { display: block; font-size: 13px; font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--dim); margin-top: 2px; }
.cm-setup h1 { margin: 0 0 12px; font-size: 30px; letter-spacing: 2px; text-transform: uppercase; color: #fff; display: flex; align-items: center; gap: 14px; }
.cm-setup h1 button { margin-left: auto; font: inherit; font-size: 14px; padding: 5px 12px; color: #c9d6e3; background: #172231; border: 2px solid #3a526b; border-radius: 4px; cursor: pointer; }
.cm-setup h2 { text-align: left; margin: 10px 0 5px; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: var(--dim); }
.cm-cols { display: grid; grid-template-columns: 1.9fr 1fr; gap: 20px; }
.cm-seat { display: grid; grid-template-columns: 14px minmax(90px, 1fr) 84px 104px 84px 112px; gap: 7px; align-items: center; padding: 6px 8px; margin-bottom: 4px; background: #172231; border: 2px solid #26374a; border-radius: 4px; }
.cm-seat.me { border-color: var(--hi); }
.cm-seat.closed { opacity: 0.5; }
.cm-seat > i { width: 14px; height: 30px; border-radius: 2px; }
.cm-act { display: flex; gap: 3px; justify-content: flex-end; }
.cm-seat b { font-size: 15px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cm-seat b em { font-style: normal; color: #9fe08a; font-size: 12px; margin-left: 6px; }
.cm-front select, .cm-seat button, .cm-opts button { font: inherit; font-size: 13px; padding: 4px; color: #e8eef5; background: #0e151d; border: 1px solid #3a526b; border-radius: 3px; cursor: pointer; }
.cm-front select:disabled { opacity: 0.55; cursor: default; }
.cm-opts { display: flex; flex-wrap: wrap; gap: 5px; }
.cm-opts button { padding: 5px 10px; }
.cm-opts button.on { background: #3a2a12; border-color: var(--hi); color: #ffe0a8; }
.cm-opts button:disabled { cursor: default; opacity: 0.6; }
.cm-doc { display: block; width: 100%; text-align: left; font: inherit; padding: 6px 9px; margin-bottom: 4px; color: #e8eef5; background: #172231; border: 2px solid #26374a; border-radius: 4px; cursor: pointer; }
.cm-doc.on { border-color: var(--hi); background: #2a2218; }
.cm-doc b { font-size: 15px; }
.cm-doc span { display: block; font-size: 12px; color: var(--dim); line-height: 1.25; }
.cm-go { display: flex; gap: 8px; margin-top: 12px; }
.cm-go button { flex: 1; font: inherit; font-size: 18px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 11px; color: #e8eef5; background: #172231; border: 2px solid #3a526b; border-radius: 4px; cursor: pointer; }
.cm-go button.go { background: #3a2a12; border-color: var(--hi); color: #ffe0a8; }
.cm-go button:disabled { opacity: 0.5; cursor: default; }
.cm-lchat { margin-top: 10px; }
.cm-lchat .log { height: 44px; overflow: auto; padding: 5px 8px; font-size: 13px; background: #0b1118; border: 1px solid #26374a; border-radius: 3px; user-select: text; }
.cm-lchat input { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px 8px; font: inherit; font-size: 14px; color: #e8eef5; background: #0e151d; border: 1px solid #3a526b; border-radius: 3px; }
.cm-brief { position: absolute; inset: 0; display: none; place-items: center; pointer-events: auto; background: rgba(6,9,13,0.8); }
.cm-brief > div { width: min(760px, 94vw); padding: 24px 30px; background: linear-gradient(#18232f, #0e151d); border: 3px solid #3a526b; border-radius: 6px; }
.cm-brief h1 { margin: 0; font-size: 36px; letter-spacing: 3px; text-transform: uppercase; color: #fff; display: flex; justify-content: space-between; }
.cm-brief h1 span { color: var(--hi); }
.cm-brief h2 { margin: 14px 0 4px; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: var(--dim); }
.cm-brief p { margin: 3px 0; font-size: 16px; line-height: 1.35; }
.cm-brief .sides { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.cm-brief i { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 7px; vertical-align: -1px; }
`;

let client: Client;
/** Which screen of the front a player is on (the server only knows about the table). */
let screen: 'menu' | 'setup' = 'menu';
export const showSetup = () => {
  screen = 'setup';
};

export function setupFront(c: Client): void {
  client = c;
  el('.cm-lobby').innerHTML = '<div class="ui cm-front"><div class="cm-menu"></div><div class="cm-setup" style="display:none"><div class="cm-table"></div><div class="cm-lchat"><div class="log"></div><input maxlength="160" placeholder="Say something to the table (Enter)"></div></div></div>';
  el('.cm-menu').innerHTML = `<h1>Block<em>Command</em></h1><div class="tag">Build a base, gather steel and oil, and march armour on your rivals.</div>
    <button class="go" data-f="quick">Quick match<small>You against three bots, right now</small></button>
    <button data-f="stand">Last Stand<small>Hold your base against fifteen waves</small></button>
    <button data-f="setup">Set up a match<small>Teams, bots, rules, and friends</small></button>
    <button data-f="how">How to play</button>`;
  const lobby = el('.cm-lobby');
  lobby.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-f],[data-l],[data-doc]');
    if (!t) return;
    if (t.dataset.doc) {
      ui.doctrine = t.dataset.doc as DoctrineId;
      client.send('doctrine', { doctrine: ui.doctrine });
    } else if (t.dataset.f === 'quick') client.send('mode', { mode: 'ffa', doctrine: ui.doctrine, difficulty: 'normal' });
    else if (t.dataset.f === 'stand') client.send('mode', { mode: 'stand', doctrine: ui.doctrine, difficulty: 'normal' });
    else if (t.dataset.f === 'setup') screen = 'setup';
    else if (t.dataset.f === 'menu') screen = 'menu';
    else if (t.dataset.f === 'how') client.hud.pause();
    else if (t.dataset.f === 'invite') {
      void navigator.clipboard?.writeText(window.location.href);
      client.hud.toast('Invite link copied');
    } else if (t.dataset.l) client.send('lobby', { op: t.dataset.l, ...t.dataset });
    draw();
  });
  lobby.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.dataset.op) client.send('lobby', { op: t.dataset.op, seat: Number(t.dataset.seat), [t.dataset.op]: t.value });
  });
  const input = el<HTMLInputElement>('.cm-lchat input');
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.code !== 'Enter' || !input.value.trim()) return;
    client.send('chat', { text: input.value });
    input.value = '';
  });
}

const opt = (value: string | number, label: string, on: boolean) => `<option value="${value}"${on ? ' selected' : ''}>${label}</option>`;

function seatRow(x: LobbySeat, l: Lobby, me: string): string {
  const host = l.host === me;
  const off = host ? '' : ' disabled';
  const mine = x.kind === 'human' && x.id === me;
  const name = x.kind === 'human' ? `${esc(x.name)}${x.id === l.host ? '<em>host</em>' : x.ready ? '<em>ready</em>' : ''}` : x.kind === 'closed' ? 'Closed' : 'Bot';
  const team = `<select data-op="team" data-seat="${x.seat}"${off}>${[0, 1, 2, 3].map((t) => opt(t, `Team ${'ABCD'[t]}`, x.team === t)).join('')}</select>`;
  const bot = x.kind === 'bot';
  const style = bot ? `<select data-op="style" data-seat="${x.seat}"${off}>${STYLE_CHOICES.map(([id, label]) => opt(id, label, x.style === id)).join('')}</select>` : '<span></span>';
  const diff = bot ? `<select data-op="difficulty" data-seat="${x.seat}"${off}>${DIFFICULTIES.map((d) => opt(d.id, d.name, x.difficulty === d.id)).join('')}</select>` : '<span></span>';
  const action = x.kind === 'human' ? (mine ? '<span></span>' : '<span></span>') : host && bot ? `<button data-l="kind" data-kind="closed" data-seat="${x.seat}">Close</button>` : host ? `<button data-l="kind" data-kind="bot" data-seat="${x.seat}">Add bot</button>` : '<span></span>';
  const sit = x.kind !== 'human' ? `<button data-l="sit" data-seat="${x.seat}" title="Play as this colour">Sit</button>` : '';
  return `<div class="cm-seat ${mine ? 'me' : ''} ${x.kind === 'closed' ? 'closed' : ''}"><i style="background:${TEAM_COLORS[x.seat % TEAM_COLORS.length]}"></i><b>${name}</b>${x.kind === 'closed' ? '<span></span>' : team}${style}${diff}<div class="cm-act">${sit}${action}</div></div>`;
}

function renderTable(l: Lobby): void {
  const me = client.me.id ?? '';
  const host = l.host === me;
  const dis = host ? '' : ' disabled';
  const seat = l.seats.find((x) => x.kind === 'human' && x.id === me);
  const choice = (op: string, field: string, value: string | number, label: string, on: boolean) => `<button data-l="${op}" data-${field}="${value}" class="${on ? 'on' : ''}"${dis}>${label}</button>`;
  const others = l.seats.filter((x) => x.kind === 'human' && x.id !== l.host);
  const waiting = others.filter((x) => !x.ready).length;
  const teams = new Set(l.seats.filter((x) => x.kind !== 'closed').map((x) => x.team)).size;
  const go = host ? `<button class="go" data-l="start"${waiting || teams < 2 ? ' disabled' : ''}>${teams < 2 ? 'Need two teams' : waiting ? `Waiting for ${waiting}` : 'Start match'}</button>` : seat ? `<button class="${seat.ready ? '' : 'go'}" data-l="ready">${seat.ready ? 'Not ready' : 'Ready'}</button>` : '<button disabled>Watching</button>';
  const html = `<h1>Set up a match<button data-f="menu">Back</button></h1><div class="cm-cols"><div>
    <h2>Commanders</h2>${l.seats.map((x) => seatRow(x, l, me)).join('')}
    <div class="cm-go">${go}<button data-f="invite" style="flex:0 0 150px;font-size:14px">Copy invite link</button><button data-l="watch" style="flex:0 0 90px;font-size:14px">Watch</button></div>
    ${l.watchers.length ? `<h2>Watching</h2><div style="font-size:14px">${l.watchers.map((w) => esc(w.name)).join(', ')}</div>` : ''}
  </div><div>
    <h2>Teams</h2><div class="cm-opts">${MODES.map((m) => choice('preset', 'preset', m.id, m.name, l.preset === m.id)).join('')}</div>
    <h2>Starting resources</h2><div class="cm-opts">${choice('resources', 'resources', 'low', 'Low', l.resources === 'low')}${choice('resources', 'resources', 'normal', 'Normal', l.resources === 'normal')}${choice('resources', 'resources', 'high', 'High', l.resources === 'high')}</div>
    <h2>Peace at the start</h2><div class="cm-opts">${[0, 3, 5, 10].map((m) => choice('peace', 'peace', m, m ? `${m} min` : 'None', l.peace === m)).join('')}</div>
    <h2>Fog of war</h2><div class="cm-opts">${`<button data-l="fog" class="${l.fog ? 'on' : ''}"${dis}>${l.fog ? 'On' : 'Off: everyone sees everything'}</button>`}</div>
    <h2>Your doctrine</h2>${DOCTRINE_IDS.map((id) => `<button class="cm-doc ${ui.doctrine === id ? 'on' : ''}" data-doc="${id}"><b>${DOCTRINES[id].name}</b><span>${DOCTRINES[id].passive}. Power: ${DOCTRINES[id].power.name}.</span></button>`).join('')}
  </div></div>`;
  const table = el('.cm-table');
  // (Only when it's changed: redrawing would close a list someone has open.)
  if (table.dataset.html !== html) {
    table.dataset.html = html;
    table.innerHTML = html;
  }
}

/** The front's screens, for the state as it stands. */
export function drawFront(s: State): void {
  const inLobby = s.phase === 'lobby';
  el('.cm-lobby').style.display = inLobby ? 'grid' : 'none';
  el('.cm-lobby').classList.toggle('title', inLobby && screen === 'menu');
  if (inLobby) {
    el('.cm-menu').style.display = screen === 'menu' ? 'block' : 'none';
    el('.cm-setup').style.display = screen === 'setup' ? 'block' : 'none';
    if (screen === 'setup' && s.lobby) renderTable(s.lobby);
  }
  const brief = el('.cm-brief');
  brief.style.display = s.phase === 'briefing' ? 'grid' : 'none';
  if (s.phase === 'briefing') {
    const me = meSeat();
    const row = (x: State['seats'][number]) => `<p><i style="background:${TEAM_COLORS[x.seat % TEAM_COLORS.length]}"></i>${esc(x.name)}${x.human ? '' : ` <span style="color:var(--dim)">${x.style}</span>`}</p>`;
    const friends = s.seats.filter((x) => me && x.team === me.team);
    const foes = s.seats.filter((x) => !me || x.team !== me.team);
    const doc = me && DOCTRINES[me.doctrine];
    const html = `<div class="ui"><h1>${MODES.find((m) => m.id === s.mode)?.name ?? 'Match'}<span>${s.briefing ?? ''}</span></h1>
      <h2>Your orders</h2><p>${s.mode === 'stand' ? 'Hold out against fifteen waves of raiders, the first in five minutes. Clearing a wave pays.' : 'Destroy every enemy headquarters.'} Lose your own and the rest of your base falls within a minute.</p>
      ${s.peaceUntil ? `<p style="color:#ffd27a">No side can attack another for the first ${Math.round(s.peaceUntil / 60)} minutes.</p>` : ''}
      ${doc ? `<h2>${doc.name} doctrine</h2><p>${doc.passive}.</p><p><b>${doc.power.name} (P):</b> ${doc.power.blurb}</p>` : '<h2>You are watching</h2><p>You can see the whole battlefield.</p>'}
      <div class="sides"><div><h2>${me ? 'Your side' : ''}</h2>${friends.map(row).join('')}</div><div><h2>${me ? 'Against you' : 'Commanders'}</h2>${foes.map(row).join('')}</div></div>
      <p style="margin-top:12px;color:var(--dim)">You start in ${AGE_NAMES[1]}. Your engineers are already mining.</p></div>`;
    if (brief.dataset.html !== html) {
      brief.dataset.html = html;
      brief.innerHTML = html;
    }
  }
  void mySeat;
}

/** A line in the table's chat. */
export function lobbyChat(html: string): void {
  const log = el('.cm-lchat .log');
  const line = document.createElement('div');
  line.innerHTML = html;
  log.append(line);
  log.scrollTop = log.scrollHeight;
}
