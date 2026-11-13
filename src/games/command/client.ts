import { HeldModels } from '@platform';
import { defineClient, type Client } from '@platform/client';
import { FLAGS, PORTRAITS, SCALE } from './models';
import { clearUnits, frameUnits, updateScaffolds, updateUnits } from './client/units';
import { booms, clearCombat, frameCombat, shoot } from './client/combat';
import { clearLife, frameLife, lifeState, updateLife } from './client/life';
import { sounds } from '@platform/client/kits';
import { FLOOR, heightAt } from './map';
import { BUILDING_ORDER, UNIT_ORDER, type Shot, type State } from './protocol';
import { shared } from './shared';
import { frameCamera } from './client/camera';
import { draw, esc, frameUi, mergeSalvage, mySeat, setupUi, ui, type B, type U } from './client/ui';
import { chatLine } from './client/panels';
import { lobbyChat } from './client/front';
import { resetFog, seeFog } from './client/fog';
import { clearBattle, fall, flyover, frameBattle, plume, puff, showMines, showDrops, tread } from './client/battle';
import { inView } from './client/camera';
import { jetSound, say, setupSounds, shotSounds } from './client/sounds';
import { BUILDINGS, TEAM_COLORS, UNITS } from './defs';

/**
 * Each commander's screen: the strategy camera over the field (`client/camera.ts`), the interface
 * and orders (`client/ui.ts`), and what the server tells of the fighting: shots from the infantry
 * and tanks, and shells and wrecks bursting.
 */

/** Where each unit was a moment ago, to see which are moving (for the dust they kick up). */
const last = new Map<number, { x: number; z: number }>();
const lastTread = new Map<number, { x: number; z: number }>();
let dust: { x: number; z: number; big: boolean; air: boolean }[] = [];
let clock = 0;
// A model's file is only sent for when it's first asked for, and that first asking comes back
// empty: so the first rocket, puff of smoke or jet of a session would never show. All of them are
// asked for from the start, and again until each has come.
let toWarm = Object.keys(PORTRAITS);
let warmIn = 0;
function warmUp(client: Client, dt: number): void {
  if (!toWarm.length) return;
  warmIn -= dt;
  if (warmIn > 0) return;
  warmIn = 0.3;
  toWarm = toWarm.filter((id) => !client.scene.item(id));
}

/** Our units and buildings already seen (so a new one is news). */
const known = new Set<number>();
const done = new Set<number>();
/** Each gate's doors as last heard (open or shut), to hear them swing. */
const gates = new Map<number, boolean>();
let puffAt = 0;
let beamAt = 0;
const clockText = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

export default defineClient(shared, {
  kits: [...sounds.standard()],
  setup(client) {
    for (const [id, url] of Object.entries(FLAGS)) client.items.look(id, { icon: { gltf: url }, hold: { model: HeldModels.gltf(url) } });
    for (const [id, url] of Object.entries(PORTRAITS)) client.items.look(id, { icon: { gltf: url }, hold: { model: HeldModels.gltf(url) } });
    setupSounds(client);
    setupUi(client);
    client.on('state', (d) => {
      ui.state = d as State;
      mergeSalvage(ui.state);
      showDrops(client, ui.state.drops ?? []);
      lifeState(ui.state);
      if (ui.state.phase === 'lobby') {
        clearUnits(client);
        clearBattle(client);
        clearCombat();
        clearLife(client);
        resetFog();
        known.clear();
        done.clear();
        lastTread.clear();
      }
      draw();
    });
    client.on('u', (d) => {
      const a = d as number[];
      const list: U[] = [];
      for (let i = 0; i < a.length; i += 8) list.push({ id: a[i], kind: UNIT_ORDER[a[i + 1]], seat: a[i + 2], x: a[i + 3], z: a[i + 4], hp: a[i + 5], yaw: a[i + 6] / 10, flags: a[i + 7] });
      ui.units = list;
      updateUnits(client, list);
      // A unit of ours we haven't seen before, after the start: one just trained (or out of a bunker).
      const me = mySeat();
      for (const u of list) {
        if (u.seat !== me || known.has(u.id)) continue;
        if (known.size && ui.state?.phase === 'play' && (ui.state.time ?? 0) > 2) {
          client.audio.play('cm_ready', { volume: 0.7 });
          if (u.kind !== 'engineer') say(u.kind, 'text', `${UNITS[u.kind].name} ready.`);
        }
        known.add(u.id);
      }
      for (const u of list) {
        const p = last.get(u.id);
        if (p && Math.hypot(u.x - p.x, u.z - p.z) > 0.35 && (u.kind === 'tank' || u.kind === 'heli' || u.kind === 'artillery') && dust.length < 40) dust.push({ x: u.x, z: u.z, big: u.kind !== 'heli', air: u.kind === 'heli' });
        else if (u.kind === 'heli' && dust.length < 40 && Math.random() < 0.3) dust.push({ x: u.x, z: u.z, big: false, air: true });
        last.set(u.id, { x: u.x, z: u.z });
        // Tread marks, every couple of blocks a vehicle on tracks drives.
        if (u.kind === 'tank' || u.kind === 'artillery' || u.kind === 'aa') {
          const t = lastTread.get(u.id);
          if (!t) lastTread.set(u.id, { x: u.x, z: u.z });
          else if (Math.hypot(u.x - t.x, u.z - t.z) >= 3.4) {
            tread(client, u.x, u.z, Math.atan2(u.x - t.x, u.z - t.z));
            lastTread.set(u.id, { x: u.x, z: u.z });
          }
        }
      }
      if (last.size > list.length + 60) for (const id of [...last.keys()]) if (!list.some((u) => u.id === id)) last.delete(id);
      for (const id of ui.sel) if (!list.some((u) => u.id === id)) ui.sel.delete(id);
    });
    client.on('b', (d) => {
      const a = d as number[];
      const list: B[] = [];
      for (let i = 0; i < a.length; i += 9) list.push({ id: a[i], kind: BUILDING_ORDER[a[i + 1]], seat: a[i + 2], x: a[i + 3], z: a[i + 4], hp: a[i + 5], built: a[i + 6], queue: a[i + 7], held: a[i + 8] });
      // One of ours finished going up.
      for (const b of list) {
        if (b.seat !== mySeat() || b.built < 100 || done.has(b.id)) continue;
        if (done.size && b.kind !== 'hq') {
          client.audio.play('cm_built', { volume: 0.8 });
          client.hud.toast(`${BUILDINGS[b.kind].name} complete`);
        }
        done.add(b.id);
      }
      // A gate's doors swinging open or shut, where it can be seen.
      for (const b of list) {
        if (b.kind !== 'gate') continue;
        const open = (b.held & 4) !== 0;
        const was = gates.get(b.id);
        if (was !== undefined && was !== open) client.audio.play('cm_gate', { at: { x: b.x, y: FLOOR + 2, z: b.z }, volume: 0.7 });
        gates.set(b.id, open);
      }
      ui.buildings = list;
      updateScaffolds(client, list);
      updateLife(client, list);
      if (ui.selB !== null && !list.some((b) => b.id === ui.selB)) ui.selB = null;
      draw();
    });
    client.on('eyes', (d) => {
      const e = d as { all: boolean; eyes: number[] };
      ui.eyes = { all: e.all, eyes: e.eyes };
      seeFog(e.all, e.eyes);
    });
    client.on('rallyfx', (d) => {
      const a = d as { x: number; z: number };
      client.fx.shockwave({ x: a.x, y: FLOOR + 0.5, z: a.z }, 20, '#ffd27a');
      client.fx.burst({ x: a.x, y: FLOOR + 3, z: a.z }, { color: '#ffd27a', count: 30, speed: 8, size: 0.35, glow: 1, life: 0.6, gravity: 1 });
    });
    client.on('alert', (d) => {
      const a = d as { x: number; z: number; what: string };
      ui.pings.push({ x: a.x, z: a.z, at: performance.now() });
      const t = ui.state?.time ?? 0;
      ui.alerts.push({ x: a.x, z: a.z, what: a.what, clock: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` });
      if (ui.alerts.length > 20) ui.alerts.shift();
      client.hud.toast(a.what);
      client.audio.play('alarm', { volume: 0.5 });
      say(null, 'text', a.what.startsWith('Your units') ? 'We are under attack!' : 'Our base is under attack!');
    });
    client.on('prod', (d) => {
      const a = d as number[];
      const m = new Map<number, number[]>();
      for (let i = 0; i < a.length; ) {
        m.set(a[i], a.slice(i + 2, i + 2 + a[i + 1]));
        i += 2 + a[i + 1];
      }
      ui.prod = m;
    });
    client.on('orders', (d) => {
      const a = d as number[];
      const m = new Map<number, number[]>();
      for (let i = 0; i < a.length; ) {
        m.set(a[i], a.slice(i + 2, i + 2 + a[i + 1] * 3));
        i += 2 + a[i + 1] * 3;
      }
      ui.orders = m;
    });
    client.on('loops', (d) => {
      ui.loops = new Set(d as number[]);
    });
    client.on('dropin', (d) => {
      const a = d as { x: number; z: number };
      ui.pings.push({ x: a.x, z: a.z, at: performance.now() });
      ui.marks.push({ x: a.x, z: a.z, at: performance.now(), color: '#ffd23a', life: 5000, big: true });
      ui.alerts.push({ x: a.x, z: a.z, what: 'Supply drop', clock: clockText(ui.state?.time ?? 0) });
      if (ui.alerts.length > 20) ui.alerts.shift();
      client.hud.toast('Supply drop coming down: first there takes it');
      client.audio.play('cm_ready', { volume: 0.8 });
    });
    client.on('dropgot', (d) => {
      const a = d as { x: number; z: number; seat: number };
      const c = TEAM_COLORS[a.seat % TEAM_COLORS.length];
      client.fx.shockwave({ x: a.x, y: FLOOR + 0.5, z: a.z }, 7, c);
      client.fx.burst({ x: a.x, y: FLOOR + 1.5, z: a.z }, { color: '#ffd23a', count: 30, speed: 7, size: 0.32, glow: 1, life: 0.7, gravity: 3 });
    });
    client.on('wave', (d) => {
      const a = d as { wave: number; spots: number[] };
      client.audio.play('alarm', { volume: 0.7 });
      for (let i = 0; i + 1 < a.spots.length; i += 2) {
        ui.pings.push({ x: a.spots[i], z: a.spots[i + 1], at: performance.now() });
        ui.marks.push({ x: a.spots[i], z: a.spots[i + 1], at: performance.now(), color: '#ff5a3a', life: 6000, big: true });
        ui.alerts.push({ x: a.spots[i], z: a.spots[i + 1], what: `Wave ${a.wave}`, clock: clockText(ui.state?.time ?? 0) });
      }
      while (ui.alerts.length > 20) ui.alerts.shift();
    });
    client.on('cd', (d) => {
      const a = d as number[];
      const m = new Map<number, number>();
      for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]);
      ui.cd = m;
    });
    client.on('mines', (d) => {
      ui.mines = d as number[];
      showMines(client, ui.mines);
    });
    client.on('fell', (d) => {
      const a = d as { kind: number; seat: number; x: number; z: number; built: number };
      if (a.built >= 1) fall(client, a.kind, a.seat, a.x, a.z);
    });
    client.on('abfx', (d) => {
      const a = d as { kind: string; x: number; z: number; tx: number; tz: number; seconds: number };
      const at = { x: a.x, y: FLOOR + heightAt(a.x, a.z) + 1.4, z: a.z };
      if (a.kind === 'tank') plume(client, at.x, at.y, at.z, 22, 'l', 2.1, a.seconds, 5, 0.25);
      else if (a.kind === 'scout') {
        const sky = { x: a.tx, y: FLOOR + 16, z: a.tz };
        client.fx.flare(sky, 8);
        client.fx.burst(sky, { color: '#ffe28a', count: 40, speed: 2.4, size: 0.34, glow: 1, life: a.seconds * 0.6, drag: 0.8, gravity: 0.5 });
      } else if (a.kind === 'at') client.fx.shockwave({ x: a.x, y: FLOOR + 0.3, z: a.z }, 2.4, '#9fd0ff');
      else if (a.kind === 'aa') client.fx.burst(at, { color: '#ffd27a', count: 12, speed: 4, size: 0.2, glow: 1, life: 0.4, gravity: 6 });
    });
    client.on('jets', (d) => {
      const a = d as { x: number; z: number };
      flyover(client, a.x, a.z);
      jetSound(a.x, FLOOR + 21, a.z);
    });
    client.on('chat', (d) => {
      const a = d as { name: string; seat: number; team: boolean; text: string };
      const who = a.seat >= 0 ? TEAM_COLORS[a.seat % TEAM_COLORS.length] : '#cfd8e6';
      const html = `<b style="color:${who}">${esc(a.name)}${a.team ? ' (team)' : ''}:</b> ${esc(a.text)}`;
      chatLine(html);
      lobbyChat(html);
      client.audio.play('cm_ready', { volume: 0.3 });
    });
    client.on('ping', (d) => {
      const a = d as { x: number; z: number; seat: number; name: string };
      const col = TEAM_COLORS[a.seat % TEAM_COLORS.length];
      ui.pings.push({ x: a.x, z: a.z, at: performance.now() });
      ui.marks.push({ x: a.x, z: a.z, at: performance.now(), color: col, life: 3000, big: true });
      chatLine(`<b style="color:${col}">${esc(a.name)}</b> pinged the map`);
      client.audio.play('cm_ready', { volume: 0.6 });
    });
    client.on('shots', (d) => {
      for (const s of d as Shot[]) shoot(client, s);
      shotSounds(d as Shot[]);
    });
    client.on('boom', (d) => {
      booms(client, d as number[]);
    });
  },
  frame(client, dt) {
    clock += dt;
    warmUp(client, dt);
    frameCamera(client, dt);
    frameUnits(client, dt);
    frameBattle(client, dt);
    frameCombat(dt);
    frameLife(client, dt);
    frameUi(client);
    // Dust under what's driving or hovering, smoke from the works, sparks where something is going up.
    for (const d of dust.splice(0, 12)) {
      if (!inView(d.x, d.z, 8)) continue;
      if (d.air) client.fx.burst({ x: d.x, y: FLOOR + 0.4, z: d.z }, { color: '#d8cdaa', count: 2, speed: 5, size: 0.18, life: 0.8, drag: 2, gravity: -0.2 });
      else puff(client, d.x + (Math.random() - 0.5) * 1.6, FLOOR + 0.4, d.z + (Math.random() - 0.5) * 1.6, 's', 0.55, 0.85, 0, 0.8, 0);
    }
    // A live uplink: pulses of light up its beam into the sky, in its side's colour, and a glow at the dish's feed.
    if (clock > beamAt) {
      beamAt = clock + 0.15;
      for (const u of ui.state?.uplinks ?? []) {
        if (u.left < 0 || !inView(u.x, u.z, 60)) continue;
        const k = SCALE.uplink / 16;
        const feed = { x: u.x, y: FLOOR + 23.3 * k, z: u.z + 0.7 * k };
        const c = TEAM_COLORS[u.seat % TEAM_COLORS.length];
        client.fx.tracer(feed, { x: feed.x, y: feed.y + 140, z: feed.z }, c, { speed: 70, length: 12, width: 0.45, glow: 4 });
        client.fx.flare(feed, 2.2);
        // (The last minute: faster, and sparks.)
        if (u.left <= 60) client.fx.burst(feed, { color: c, count: 6, speed: 4, size: 0.18, glow: 1.5, life: 0.5, gravity: -2 });
      }
    }
    if (clock > puffAt) {
      puffAt = clock + 0.45;
      // A medic at work: green sparks rising off it.
      for (const u of ui.units) {
        if (u.kind !== 'medic' || !(u.flags & 1) || !inView(u.x, u.z, 6)) continue;
        client.fx.burst({ x: u.x, y: FLOOR + heightAt(u.x, u.z) + 1.6, z: u.z }, { color: '#7dff7d', count: 5, speed: 1.4, size: 0.16, glow: 1.2, life: 0.8, gravity: -2.5 });
      }
      for (const b of ui.buildings) {
        if (!inView(b.x, b.z, 12)) continue;
        if (b.built < 100) client.fx.burst({ x: b.x + (Math.random() - 0.5) * 4, y: FLOOR + 1 + Math.random() * 3, z: b.z + (Math.random() - 0.5) * 4 }, { color: '#ffd27a', count: 3, speed: 3, size: 0.2, glow: 0.8, life: 0.3, gravity: 4 });
        else if (b.kind === 'factory') {
          // Its two chimneys (their tops on the model), thick while it's building something.
          const k = SCALE.factory / 16;
          for (const [cx, cz, h] of [[-11, -10, 34], [-4, -10, 30]]) puff(client, b.x + cx * k, FLOOR + h * k, b.z + cz * k, b.queue ? 'm' : 'l', b.queue ? 0.85 : 0.6, 2.4, 0, 2.4, 0);
        }
        // Hurt: smoke from it; badly hurt, fire too.
        if (b.built >= 100 && b.hp < 55) {
          const r = BUILDINGS[b.kind].radius * 0.6;
          const at = { x: b.x + (Math.random() - 0.5) * r, y: FLOOR + 2 + Math.random() * 2, z: b.z + (Math.random() - 0.5) * r };
          puff(client, at.x, at.y, at.z, 'd', 1, 2.6, 0, 2.2, 0);
          if (b.hp < 30) for (let n = 0; n < 2; n++) puff(client, at.x + (Math.random() - 0.5), at.y - 0.4, at.z + (Math.random() - 0.5), 'f', 0.62, 0.5, 0, 2.6, 0);
        }
      }
    }
  },
});

