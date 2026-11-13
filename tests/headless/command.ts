import { FLANK, TRADE, fromBehind, tradeGet } from '../../src/games/command/defs';
import { BASES, HALF, LAKES, MESAS, TREES, deposits, heightAt, wallLine, wallPlan, wallSnap } from '../../src/games/command/map';
import { BUILDING_ORDER, UNIT_ORDER, rankBits, stanceBits, type State } from '../../src/games/command/protocol';
import { readFileSync } from 'node:fs';
import { GameHost } from '../../src/platform/host/game';
import { devGames } from '../../src/games/server';
import { check, games, launch } from './_harness';

const allGames = [...games, ...(await devGames())];

/**
 * Block Command: in the lobby the player picks a mode; each mode seats four commanders (bots in the
 * empty places, or in a co-op game two bot enemies); the player's HQ trains an engineer; and left
 * alone, the bots gather, build barracks and factories, train armies and go to war.
 */
function play(mode: string, seats: number, minutes: number) {
  const h = launch('command', { seed: 9 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const blds = () => h.find('message', 'b').at(-1)?.args[0] as number[];
  const send = (name: string, data: unknown = {}) => h.send({ t: 'game', player, name, data });

  h.run(1);
  check(state()?.phase === 'lobby', `${mode}: the game opens in a lobby`);
  send('doctrine', { doctrine: 'armored' });
  send('mode', { mode, doctrine: 'armored' });
  h.run(1);
  const s0 = state();
  check(s0.phase === 'play' && s0.seats.length === seats, `${mode}: the match starts with ${seats} commanders (${s0.seats.length})`);
  check(s0.seats.filter((s) => s.human).length === 1, `${mode}: one is the player`);
  const teams = new Set(s0.seats.map((s) => s.team)).size;
  check(mode === 'ffa' ? teams === 4 : teams === 2, `${mode}: the teams are as the mode says (${teams})`);

  // The player's HQ trains an engineer: it costs 50 steel and a place in the pop.
  const me = s0.mine[player];
  const hq = [];
  const b = blds();
  for (let i = 0; i < b.length; i += 9) if (b[i + 2] === me) hq.push(b[i]);
  const before = units().length / 8;
  send('train', { id: hq[0], kind: 'engineer' });
  h.run(9);
  check(units().length / 8 === before + 1 || state().seats.find((s) => s.seat === me)!.steel < s0.seats.find((s) => s.seat === me)!.steel, `${mode}: the HQ trains an engineer`);

  // The armored doctrine's power: three tanks arrive at the HQ (once it's ready, eight minutes in).
  check(s0.seats.find((s) => s.seat === me)!.doctrine === 'armored', `${mode}: the player's doctrine is the one they picked`);
  h.run(475);
  const tanks = () => { let n = 0; const u = units(); for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && u[i + 1] === 2) n++; return n; };
  const before3 = tanks();
  send('power', {});
  h.run(1);
  check(tanks() === before3 + 3, `${mode}: reinforcements bring three tanks (${before3} then ${tanks()})`);
  check(state().seats.find((s) => s.seat === me)!.powerIn > 100, `${mode}: and the power recharges`);
  // Stances: told to hold their ground, the tanks say so.
  const myTanks: number[] = [];
  { const u = units(); for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && u[i + 1] === 2) myTanks.push(u[i]); }
  send('stance', { ids: myTanks, stance: 1 });
  h.run(0.5);
  { const u = units(); let held = 0; for (let i = 0; i < u.length; i += 8) if (myTanks.includes(u[i]) && stanceBits(u[i + 7]) === 1) held++; check(held === myTanks.length, `${mode}: the tanks hold their ground when told (${held}/${myTanks.length})`); }
  check(state().seats.filter((s) => !s.human).every((s) => s.style), `${mode}: every bot has a style (${state().seats.map((s) => s.style || 'player').join(', ')})`);
  // Fog: the player is never sent an enemy unit they can't see (the far corners are well out of sight).
  const seen = units();
  let far = 0;
  for (let i = 0; i < seen.length; i += 8) if (seen[i + 2] !== me && Math.hypot(seen[i + 3] - (s0.seats.length ? 0 : 0), 0) > 0 && Math.abs(seen[i + 3]) > 200) far++;
  check(far === 0, `${mode}: no unit is sent from beyond the map`);

  // Left alone, the bots build and fight.
  h.run(minutes * 60, { until: () => state().phase === 'over' });
  const end = state();
  const nb = end.seats.reduce((n, s) => n + s.buildings, 0);
  check(nb > seats * 2 || end.phase === 'over', `${mode}: the bots build (${nb} buildings by ${end.time} s)`);
  console.log(mode, 'phase', end.phase, 'winners', end.winners, 'seats', JSON.stringify(end.seats.map((s) => [s.seat, s.team, s.alive, s.units, s.buildings, s.techs.join('+')])));
  // Veterans: the most stars seen on any unit, and what the bots built.
  let stars = 0;
  for (const m of h.find('message', 'u')) { const u = m.args[0] as number[]; for (let i = 0; i < u.length; i += 8) stars = Math.max(stars, rankBits(u[i + 7])); }
  const kinds: Record<number, number> = {};
  const bb = blds();
  for (let i = 0; i < bb.length; i += 9) kinds[bb[i + 1]] = (kinds[bb[i + 1]] ?? 0) + 1;
  console.log(`${mode}: most stars seen ${stars}; buildings by kind ${JSON.stringify(kinds)}`);
  if (end.phase === 'over') check(!!end.summary && end.summary.seats.length === seats && end.summary.seats.every((x) => x.army.length > 0), `${mode}: the summary has every commander's tallies`);
  const held = end.relics.filter((r) => r.owner >= 0).length;
  console.log(`${mode}: relics held by end: ${held}/${end.relics.length}`);
  check(end.seats.some((s) => s.techs.includes('age2')), `${mode}: bots reach the Mechanized Era`);
  const army = end.seats.reduce((n, s) => n + s.units, 0);
  check(army > seats * 4 || end.phase === 'over', `${mode}: and train armies (${army} units)`);
  return end;
}

/** The table: the host sets the rules, the match opens with a briefing, and orders can be queued. */
function setup() {
  const h = launch('command', { seed: 11 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const orders = () => h.find('message', 'orders').at(-1)?.args[0] as number[];
  const send = (name: string, data: unknown = {}) => h.send({ t: 'game', player, name, data });
  const lobby = (data: object) => send('lobby', data);
  h.run(1);
  check(state().lobby?.host === player, 'setup: the first player is the host');
  check(state().lobby!.seats.filter((x) => x.kind === 'human').length === 1, 'setup: and has a seat');
  lobby({ op: 'preset', preset: 'teams' });
  lobby({ op: 'peace', peace: 3 });
  lobby({ op: 'resources', resources: 'high' });
  lobby({ op: 'difficulty', seat: 1, difficulty: 'hard' });
  lobby({ op: 'style', seat: 1, style: 'turtle' });
  lobby({ op: 'kind', seat: 3, kind: 'closed' });
  lobby({ op: 'sit', seat: 2 });
  h.run(0.5);
  const l = state().lobby!;
  check(l.preset === 'teams' && l.peace === 3 && l.resources === 'high', 'setup: the rules change');
  check(l.seats[2].id === player && l.seats[0].kind === 'bot', 'setup: the player moves seat');
  lobby({ op: 'team', seat: 1, team: 0 });
  lobby({ op: 'team', seat: 2, team: 0 });
  lobby({ op: 'team', seat: 0, team: 0 });
  lobby({ op: 'start' });
  h.run(0.5);
  check(state().phase === 'lobby', 'setup: one team is no match');
  lobby({ op: 'team', seat: 0, team: 1 });
  lobby({ op: 'start' });
  h.run(0.5);
  check(state().phase === 'briefing' && state().briefing! > 0, 'setup: the match opens with a briefing');
  h.run(8);
  const s = state();
  check(s.phase === 'play', 'setup: and then begins');
  check(s.seats.length === 3 && s.peaceUntil === 180, 'setup: with the seats and the peace it was given');
  const me = s.seats.find((x) => x.seat === s.mine[player])!;
  check(me.seat === 2 && me.steel > 700, 'setup: the player has the seat and the resources they chose');
  check(s.seats.find((x) => x.seat === 1)!.style === 'Turtle', 'setup: the bot has the style it was given');
  // Orders: a second order queued after the first; patrol.
  const rifles: number[] = [];
  { const u = units(); for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me.seat && u[i + 1] === 1) rifles.push(u[i]); }
  const id = rifles[0];
  send('move', { ids: [id], x: -68, z: 40 });
  send('move', { ids: [id], x: -50, z: 40, queue: true });
  h.run(0.3);
  const planOf = () => { const o = orders(); for (let i = 0; i < o.length; ) { if (o[i] === id) return o.slice(i + 2, i + 2 + o[i + 1] * 3); i += 2 + o[i + 1] * 3; } return []; };
  check(planOf().length === 6, `orders: a queued order waits its turn (${planOf().length / 3})`);
  send('patrol', { ids: [id], x: -50, z: 50 });
  h.run(0.3);
  check(planOf()[0] === 5 && planOf().length === 3, 'orders: patrol replaces them');
  send('chat', { text: 'hello' });
  h.run(0.2);
  check((h.find('message', 'chat').at(-1)?.args[0] as { text: string })?.text === 'hello', 'chat: a line goes out');
  // The peace holds: nothing has been hurt after a while, and the bots keep to it.
  h.run(120);
  const hurt = state().seats.reduce((n, x) => n + x.buildings, 0);
  check(hurt >= 3 && state().seats.every((x) => x.alive), 'peace: everyone is still there');
}

/** Several people at the table: seats, ready-up, the host's say, watching, chat, a ping, and coming back to a match. */
function together() {
  const def = allGames.find((g) => g.id === 'command')!;
  const host = new GameHost(def, { engine: readFileSync('engine/pkg/voxel_engine_bg.wasm'), seed: 5, remote: true, radius: 9, budget: Infinity, cheats: true, room: 'probe' });
  /** What each client has been sent, by message. */
  const heard = new Map<string, Map<string, unknown>>();
  const step = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      for (const [id, batch] of host.step(1 / 30)) for (const e of (batch as { events?: { t: string; call?: { target: string; method: string; args: unknown[] } }[] }).events ?? []) if (e.t === 'call' && e.call?.target === 'message') (heard.get(id) ?? heard.set(id, new Map()).get(id)!).set(e.call.method, e.call.args[0]);
    }
  };
  const join = (name: string) => {
    const c = host.connect(name);
    host.command(c.id, { t: 'start', name } as never);
    return c.id;
  };
  const send = (id: string, name: string, data: unknown = {}) => host.command(id, { t: 'message', msg: { t: 'game', name, data } } as never);
  const ann = join('Ann');
  const bob = join('Bob');
  const cat = join('Cat');
  step(1);
  const state = (id = ann) => heard.get(id)?.get('state') as State;
  check(state().phase === 'lobby', 'together: a table to sit at');
  const l = () => state().lobby!;
  check(l().seats.filter((x) => x.kind === 'human').length === 3, `together: everyone has a seat (${l().seats.filter((x) => x.kind === 'human').length})`);
  const annP = l().seats.find((x) => x.name === 'Ann')!.id;
  check(l().host === annP, 'together: the first is the host');
  const bobSeat = l().seats.find((x) => x.name === 'Bob')!.seat;
  // Only the host changes the rules.
  send(bob, 'lobby', { op: 'peace', peace: 5 });
  step(0.2);
  check(l().peace === 0, 'together: the others can\u2019t change the rules');
  // Cat would rather watch.
  send(cat, 'lobby', { op: 'watch' });
  step(0.2);
  check(l().watchers.some((w) => w.name === 'Cat') && !l().seats.some((x) => x.name === 'Cat'), 'together: someone can watch instead');
  // No start until everyone's ready.
  send(ann, 'lobby', { op: 'start' });
  step(0.2);
  check(state().phase === 'lobby', 'together: no start with someone not ready');
  send(bob, 'lobby', { op: 'ready' });
  step(0.2);
  check(l().seats[bobSeat].ready, 'together: ready shows');
  send(ann, 'chat', { text: '<b>hi</b>' });
  step(0.2);
  check((heard.get(bob)?.get('chat') as { text: string; name: string })?.name === 'Ann', 'together: chat reaches the table');
  send(ann, 'lobby', { op: 'start' });
  step(8);
  check(state().phase === 'play', 'together: and off they go');
  const me = state().mine;
  check(me[bob] === bobSeat, 'together: Bob has the seat he took');
  check(me[cat] === undefined && state().watchers.includes('Cat'), 'together: Cat watches');
  check(((heard.get(cat)?.get('eyes') as { all: boolean })?.all) === true && (heard.get(cat)?.get('u') as number[]).length > 0, 'together: and sees the whole field');
  // A ping goes to the team.
  send(ann, 'ping', { x: 3, z: 4 });
  step(0.2);
  check((heard.get(ann)?.get('ping') as { x: number })?.x === 3, 'together: a ping shows');
  // Bob drops, a bot holds his army, and he comes back to it.
  host.disconnect(bob);
  step(1);
  check(state().seats.find((x) => x.seat === bobSeat)!.human === false, 'together: a bot takes over when someone drops');
  const again = join('Bob');
  step(1);
  check(state(again).mine[again] === bobSeat, 'together: and coming back, the army is theirs again');
  // Someone new joining a match under way watches.
  const dan = join('Dan');
  step(1);
  check(state(dan).mine[dan] === undefined && state(dan).watchers.includes('Dan'), 'together: joining late, you watch');
}

/** Each kind's ability, healing at a depot, and what the fighting leaves. */
function tricks() {
  const h = launch('command', { seed: 21 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => {
    const a = h.find('message', 'u').at(-1)?.args[0] as number[];
    const out: { id: number; kind: number; seat: number; x: number; z: number; hp: number }[] = [];
    for (let i = 0; i < a.length; i += 8) out.push({ id: a[i], kind: a[i + 1], seat: a[i + 2], x: a[i + 3], z: a[i + 4], hp: a[i + 5] });
    return out;
  };
  const cds = () => h.find('message', 'cd').at(-1)?.args[0] as number[];
  const send = (name: string, data: unknown = {}) => h.send({ t: 'game', player, name, data });
  h.run(1);
  send('mode', { mode: 'ffa', doctrine: 'industrial', difficulty: 'easy' });
  h.run(0.5);
  const me = state().mine[player];
  const rifle = units().filter((u) => u.seat === me && u.kind === 1);
  check(rifle.length >= 2, 'tricks: the starting riflemen');
  // Thrown at a spot in reach: the grenade's on its way, and the thrower recharges.
  send('ability', { ids: [rifle[0].id], kind: 'rifle', x: rifle[0].x + 3, z: rifle[0].z });
  h.run(0.5);
  check(cds()[0] === rifle[0].id && cds()[1] > 15, `tricks: a grenade starts the recharge (${cds().slice(0, 2)})`);
  check(h.find('message', 'shots').some((m) => (m.args[0] as { arc?: number }[]).some((x) => x.arc)), 'tricks: and goes up in an arc');
  // A second throw while recharging does nothing.
  const before = cds()[1];
  send('ability', { ids: [rifle[0].id], kind: 'rifle', x: rifle[0].x + 2, z: rifle[0].z });
  h.run(0.2);
  check(cds()[1] <= before, 'tricks: not again until it has recharged');
  // Someone else's kind means nothing.
  send('ability', { ids: [rifle[1].id], kind: 'tank' });
  h.run(0.2);
  check(!cds().includes(rifle[1].id), 'tricks: only units of that kind');
  // A mine goes down where it's put, and costs what it costs.
  const eng = units().filter((u) => u.seat === me && u.kind === 0);
  send('ability', { ids: [eng[0].id], kind: 'engineer', x: eng[0].x + 1, z: eng[0].z + 1 });
  h.run(1.5);
  check((h.find('message', 'mines').at(-1)?.args[0] as number[]).length === 3, 'tricks: an engineer lays a mine');
  // Fall back: to the HQ, from wherever.
  send('move', { ids: [rifle[1].id], x: rifle[1].x + (rifle[1].x < 0 ? 26 : -26), z: rifle[1].z });
  h.run(4.5);
  const far = units().find((u) => u.id === rifle[1].id)!;
  send('retreat', { ids: [rifle[1].id] });
  h.run(1);
  const moved = units().find((u) => u.id === rifle[1].id)!;
  check(Math.hypot(moved.x - far.x, moved.z - far.z) > 6.5, `tricks: falling back is faster than walking (${Math.hypot(moved.x - far.x, moved.z - far.z).toFixed(1)} in a second)`);
}

/** A depot by a deposit: engineers bring what they gather there, and don't walk home. */
function forward() {
  const h = launch('command', { seed: 33 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => {
    const a = h.find('message', 'u').at(-1)?.args[0] as number[];
    const out: { id: number; kind: number; seat: number; x: number; z: number }[] = [];
    for (let i = 0; i < a.length; i += 8) out.push({ id: a[i], kind: a[i + 1], seat: a[i + 2], x: a[i + 3], z: a[i + 4] });
    return out;
  };
  const blds = () => (h.find('message', 'b').at(-1)?.args[0] as number[]).length / 9;
  const send = (name: string, data: unknown = {}) => h.send({ t: 'game', player, name, data });
  h.run(1);
  send('mode', { mode: 'ffa', doctrine: 'industrial', difficulty: 'easy' });
  h.run(0.5);
  const me = state().mine[player];
  const hq = BASES[me];
  const mineEng = () => units().filter((u) => u.seat === me && u.kind === 0);
  // The steel furthest from the HQ that's still near it.
  const steel = deposits().map((d, id) => ({ ...d, id })).filter((d) => d.kind === 'steel' && Math.hypot(d.x - hq.x, d.z - hq.z) < 36).sort((a, b) => Math.hypot(b.x - hq.x, b.z - hq.z) - Math.hypot(a.x - hq.x, a.z - hq.z))[0];
  const ids = mineEng().map((u) => u.id);
  const before = blds();
  for (let a = 0; a < 12 && blds() === before; a++) {
    send('build', { kind: 'depot', x: steel.x + Math.cos(a * 0.52) * 7, z: steel.z + Math.sin(a * 0.52) * 7, ids });
    h.run(0.3);
  }
  check(blds() === before + 1, 'forward: a depot goes up by the far deposit');
  h.run(20);
  send('gather', { ids, id: steel.id });
  h.run(16);
  const start = state().seats.find((x) => x.seat === me)!.steel;
  let nearest = 1e9;
  for (let t = 0; t < 30; t++) {
    h.run(1);
    for (const u of mineEng()) nearest = Math.min(nearest, Math.hypot(u.x - hq.x, u.z - hq.z));
  }
  const gained = state().seats.find((x) => x.seat === me)!.steel - start;
  check(gained > 100 && nearest > 12, `forward: they bring it to the depot, not the HQ (+${gained} steel, nearest the HQ ${nearest.toFixed(1)})`);
}

/** Two players in the open: a mine goes off under an enemy and a scout defuses another; a wounded soldier heals at the HQ. */
function field() {
  const def = allGames.find((g) => g.id === 'command')!;
  const host = new GameHost(def, { engine: readFileSync('engine/pkg/voxel_engine_bg.wasm'), seed: 5, remote: true, radius: 9, budget: Infinity, cheats: true, room: 'v' });
  const heard = new Map<string, Map<string, unknown>>();
  const step = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) for (const [id, batch] of host.step(1 / 30)) for (const e of (batch as { events?: { t: string; call?: { target: string; method: string; args: unknown[] } }[] }).events ?? []) if (e.t === 'call' && e.call?.target === 'message') (heard.get(id) ?? heard.set(id, new Map()).get(id)!).set(e.call.method, e.call.args[0]);
  };
  const join = (name: string) => { const c = host.connect(name); host.command(c.id, { t: 'start', name } as never); return c.id; };
  const send = (id: string, name: string, data: unknown = {}) => host.command(id, { t: 'message', msg: { t: 'game', name, data } } as never);
  const ann = join('Ann');
  const bob = join('Bob');
  step(1);
  const state = (id = ann) => heard.get(id)?.get('state') as State;
  send(bob, 'lobby', { op: 'ready' });
  step(0.3);
  send(ann, 'lobby', { op: 'start' });
  step(8);
  check(state().phase === 'play', 'play');
  const annS = state().mine[ann];
  const bobS = state().mine[bob];
  const list = (id: string) => { const a = heard.get(id)!.get('u') as number[]; const o: { id: number; kind: number; seat: number; x: number; z: number; hp: number }[] = []; for (let i = 0; i < a.length; i += 8) o.push({ id: a[i], kind: a[i + 1], seat: a[i + 2], x: a[i + 3], z: a[i + 4], hp: a[i + 5] }); return o; };
  const mines = (id: string) => (heard.get(id)!.get('mines') as number[] | undefined) ?? [];
  const mine = (id: string, seat: number, k: number) => list(id).filter((u) => u.seat === seat && u.kind === k);
  // Meet in the open between the two bases.
  const P = { x: (BASES[annS].x + BASES[bobS].x) / 2 + 4, z: (BASES[annS].z + BASES[bobS].z) / 2 + 6 };
  const e = mine(ann, annS, 0)[0];
  send(ann, 'stance', { ids: mine(ann, annS, 1).map((u) => u.id), stance: 2 });
  send(bob, 'stance', { ids: mine(bob, bobS, 1).map((u) => u.id), stance: 2 });
  send(ann, 'move', { ids: [e.id], x: P.x, z: P.z });
  step(26);
  const e2 = list(ann).find((u) => u.id === e.id)!;
  send(ann, 'ability', { ids: [e.id], kind: 'engineer', x: e2.x + 3, z: e2.z });
  step(3);
  check(mines(ann).length === 3, 'a mine is down');
  check(mines(bob).length === 0, 'the enemy cannot see it');
  const mx = mines(ann)[0];
  const mz = mines(ann)[1];
  send(ann, 'move', { ids: [e.id], x: e2.x - 24, z: e2.z - 8 });
  // Bob's first rifleman walks across it.
  const [walker, wounded] = mine(bob, bobS, 1);
  const hpBefore = walker.hp;
  send(bob, 'move', { ids: [walker.id], x: mx, z: mz });
  let t = 0;
  while (t < 45 && list(ann).length && mines(ann).length) { step(0.5); t += 0.5; }
  check(mines(ann).length === 0, 'the mine went off');
  const w = list(bob).find((u) => u.id === walker.id);
  check(!w || w.hp < hpBefore, 'and hurt whoever trod on it');
  // Wounded by a grenade (one thrower), rests by the HQ, heals.
  const thrower = mine(ann, annS, 1)[0];
  const spot = { x: BASES[bobS].x - 26, z: BASES[bobS].z + 2 };
  send(bob, 'move', { ids: [wounded.id], x: spot.x, z: spot.z });
  send(ann, 'move', { ids: [thrower.id], x: spot.x - 8, z: spot.z });
  step(32);
  const wnow = list(bob).find((u) => u.id === wounded.id)!;
  send(ann, 'ability', { ids: [thrower.id], kind: 'rifle', x: wnow.x, z: wnow.z });
  step(3.5);
  const hit = list(bob).find((u) => u.id === wounded.id)!;
  check(hit.hp < wnow.hp, 'a grenade hurts');
  send(bob, 'retreat', { ids: [wounded.id] });
  step(24);
  step(20);
  const healed = list(bob).find((u) => u.id === wounded.id)!;
  check(healed.hp > hit.hp, 'healing at the HQ');
  // A scout: Bob builds a barracks, trains one, sees a new mine and defuses it.
  const eng = mine(bob, bobS, 0).map((u) => u.id);
  const nB = () => (heard.get(bob)!.get('b') as number[]).length;
  const n0 = nB();
  for (let a = 0; a < 16 && nB() === n0; a++) { send(bob, 'build', { kind: 'barracks', x: BASES[bobS].x + Math.cos(a * 0.8) * (13 + a % 3 * 3), z: BASES[bobS].z + Math.sin(a * 0.8) * (13 + a % 3 * 3), ids: eng }); step(0.3); }
  check(nB() > n0, 'barracks placed');
  step(50);
  const bb = heard.get(bob)!.get('b') as number[];
  let barracks = -1;
  for (let i = 0; i < bb.length; i += 9) if (bb[i + 2] === bobS && bb[i + 1] === BUILDING_ORDER.indexOf('barracks')) barracks = bb[i];
  send(bob, 'train', { id: barracks, kind: 'scout' });
  step(16);
  const scout = mine(bob, bobS, UNIT_ORDER.indexOf('scout'))[0];
  check(scout, 'a scout');
  const e3 = list(ann).find((u) => u.id === e.id)!;
  send(ann, 'ability', { ids: [e.id], kind: 'engineer', x: e3.x + 2, z: e3.z });
  step(8);
  check(mines(ann).length === 3, 'second mine');
  const mx2 = mines(ann)[0];
  const mz2 = mines(ann)[1];
  send(ann, 'move', { ids: [e.id], x: e3.x - 30, z: e3.z });
  send(bob, 'stance', { ids: [scout.id], stance: 2 });
  send(bob, 'move', { ids: [scout.id], x: mx2, z: mz2 });
  let sawIt = false;
  t = 0;
  while (t < 50 && mines(ann).length) { step(0.25); t += 0.25; sawIt ||= mines(bob).length > 0; }
  check(sawIt, 'the scout spots it');
  check(mines(ann).length === 0 && list(bob).some((u) => u.id === scout.id), 'and defuses it unharmed');
}

/** A building told to repeat keeps training; cancel stops it. Last Stand's waves come, and a supply drop goes to whoever reaches it. */
function standing() {
  const h = launch('command', { seed: 41 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => {
    const a = h.find('message', 'u').at(-1)?.args[0] as number[];
    const out: { id: number; kind: number; seat: number; x: number; z: number }[] = [];
    for (let i = 0; i < a.length; i += 8) out.push({ id: a[i], kind: a[i + 1], seat: a[i + 2], x: a[i + 3], z: a[i + 4] });
    return out;
  };
  const send = (name: string, data: unknown = {}) => h.send({ t: 'game', player, name, data });
  h.run(1);
  send('mode', { mode: 'stand', doctrine: 'industrial', difficulty: 'normal' });
  h.run(1);
  const s0 = state();
  const me = s0.mine[player];
  check(s0.mode === 'stand' && s0.stand?.wave === 0 && s0.stand.total === 15, 'stand: fifteen waves to come');
  check(s0.seats.find((x) => x.seat === me)!.team !== s0.seats.find((x) => x.name === 'The Raiders')!.team, 'stand: the raiders are the other side');
  const b = h.find('message', 'b').at(-1)?.args[0] as number[];
  const hq = b[0];
  const engineers = () => units().filter((u) => u.seat === me && u.kind === 0).length;
  const n0 = engineers();
  send('train', { id: hq, kind: 'engineer' });
  send('repeat', { id: hq });
  h.run(0.3);
  check((h.find('message', 'loops').at(-1)?.args[0] as number[]).includes(hq), 'repeat: the building says so');
  h.run(32);
  check(engineers() >= n0 + 2, `repeat: it keeps training (${n0} then ${engineers()})`);
  send('cancel', { id: hq });
  send('cancel', { id: hq });
  h.run(0.3);
  check(!(h.find('message', 'loops').at(-1)?.args[0] as number[]).length, 'repeat: cancelling stops it');
  h.run(280, { until: () => (state().stand?.wave ?? 0) >= 1 });
  check(state().stand!.wave === 1 && state().stand!.left > 0, `stand: the first wave comes (${JSON.stringify(state().stand)} at ${state().time})`);
  check(state().seats.find((x) => x.name === 'The Raiders')!.alive, 'stand: and the raiders stay in the match without a base');
  h.run(40, { until: () => state().drops.length > 0 });
  check(state().drops.length > 0, 'drops: a pallet comes down');
  const d = state().drops[0];
  const rifles = units().filter((u) => u.seat === me && u.kind === UNIT_ORDER.indexOf('rifle')).map((u) => u.id);
  const carriers = rifles.length ? rifles : units().filter((u) => u.seat === me && u.kind === 0).map((u) => u.id);
  send('move', { ids: carriers, x: d.x, z: d.z });
  h.run(60, { until: () => !state().drops.some((x) => x.id === d.id) });
  check(!state().drops.some((x) => x.id === d.id), 'drops: and goes to whoever gets there');
  check(BUILDING_ORDER.length === 13, 'the buildings are as they were, and the wall, its gate, the trade post and the uplink');
}

/** Surrender: alone against bots it ends the match, with the bots standing and the player not. */
function surrender() {
  const h = launch('command', { seed: 51 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const send = (name: string, data: unknown = {}) => h.send({ t: 'game', player, name, data });
  h.run(1);
  send('resign', {});
  h.run(0.5);
  check(state().phase === 'lobby', 'surrender: means nothing before a match');
  send('mode', { mode: 'ffa', doctrine: 'armored', difficulty: 'normal' });
  h.run(1);
  h.run(20, { until: () => state().phase === 'play' });
  check(state().phase === 'play', 'surrender: the match has started');
  send('resign', {});
  h.run(1);
  const s = state();
  const me = s.seats.find((x) => s.mine[player] === x.seat)!;
  check(s.phase === 'over', 'surrender: alone against bots, the match ends');
  check(!me.alive && !s.winners.includes(me.seat), 'surrender: the one who gave up has lost');
  check(s.winners.length === 3 && !!s.summary, 'surrender: the bots still standing are named, and the summary comes');
}

/** Flanking: behind is within 60 degrees of dead astern, wherever the vehicle faces. */
function flanking() {
  check(FLANK > 1, 'flanking: a shot in the rear does more');
  check(fromBehind(0, 0, 0, 0, -10) && !fromBehind(0, 0, 0, 0, 10) && !fromBehind(0, 0, 0, 10, 0), 'flanking: facing +z, behind is -z, and neither the front nor the side');
  check(fromBehind(Math.PI / 2, 5, 5, -5, 5) && !fromBehind(Math.PI / 2, 5, 5, 15, 5), 'flanking: it turns with the vehicle');
  check(fromBehind(0, 0, 0, 5, -10) && !fromBehind(0, 0, 0, 10, -5) && !fromBehind(0, 0, 0, 0, 0), 'flanking: 60 degrees either side of astern, and not from on top of it');
}

/**
 * Walls: a dragged line is a length on every cell with no gaps; a ring of it keeps what's inside in
 * (its own side too) until a gate goes into it; and an enemy sent at what's inside, finding no way,
 * shoots its way through.
 */
function walls() {
  const line = wallLine(-10, 4, 20, 17);
  check(line.every((p, i) => i === 0 || Math.abs(p.x - line[i - 1].x) + Math.abs(p.z - line[i - 1].z) === 3), 'walls: each length of a dragged line is beside the last by a side');
  check(line[0].x === wallSnap(-10) && line.at(-1)!.x === wallSnap(20) && line.at(-1)!.z === wallSnap(17) && wallLine(0, 0, 500, 0).length === 40, 'walls: the line runs end to end, and no further than forty lengths');
  const def = allGames.find((g) => g.id === 'command')!;
  const host = new GameHost(def, { engine: readFileSync('engine/pkg/voxel_engine_bg.wasm'), seed: 5, remote: true, radius: 9, budget: Infinity, cheats: true, room: 'w' });
  const heard = new Map<string, Map<string, unknown>>();
  const step = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) for (const [id, batch] of host.step(1 / 30)) for (const e of (batch as { events?: { t: string; call?: { target: string; method: string; args: unknown[] } }[] }).events ?? []) if (e.t === 'call' && e.call?.target === 'message') (heard.get(id) ?? heard.set(id, new Map()).get(id)!).set(e.call.method, e.call.args[0]);
  };
  const join = (name: string) => { const c = host.connect(name); host.command(c.id, { t: 'start', name } as never); return c.id; };
  const send = (id: string, name: string, data: unknown = {}) => host.command(id, { t: 'message', msg: { t: 'game', name, data } } as never);
  const ann = join('Ann');
  const bob = join('Bob');
  step(1);
  const state = () => heard.get(ann)?.get('state') as State;
  send(bob, 'lobby', { op: 'ready' });
  step(0.3);
  send(ann, 'lobby', { op: 'start' });
  step(8);
  const annS = state().mine[ann];
  const bobS = state().mine[bob];
  const list = (id: string) => { const a = heard.get(id)!.get('u') as number[]; const o: { id: number; kind: number; seat: number; x: number; z: number }[] = []; for (let i = 0; i < a.length; i += 8) o.push({ id: a[i], kind: a[i + 1], seat: a[i + 2], x: a[i + 3], z: a[i + 4] }); return o; };
  const blds = () => { const a = heard.get(ann)!.get('b') as number[]; const o: { id: number; kind: number; seat: number; x: number; z: number; hp: number; built: number; state: number }[] = []; for (let i = 0; i < a.length; i += 9) o.push({ id: a[i], kind: a[i + 1], seat: a[i + 2], x: a[i + 3], z: a[i + 4], hp: a[i + 5], built: a[i + 6], state: a[i + 8] }); return o; };
  const RAMPART = BUILDING_ORDER.indexOf('rampart');
  const GATE = BUILDING_ORDER.indexOf('gate');
  const steel = () => state().seats.find((s) => s.seat === annS)!.steel;
  // In the open between the two bases: a rifleman of Ann's, and her engineers round him.
  const M = { x: wallSnap((BASES[annS].x + BASES[bobS].x) / 2), z: wallSnap((BASES[annS].z + BASES[bobS].z) / 2) };
  const free = (x: number, z: number) => [...TREES, ...deposits()].every((t) => Math.hypot(t.x - x, t.z - z) > 11) && [...LAKES, ...MESAS].every((l) => Math.hypot(l.x - x, l.z - z) > l.r + 12);
  let C = M;
  for (let r = 0; r < 12 && !free(C.x, C.z); r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (!free(C.x, C.z) && free(M.x + i * 3, M.z + j * 3)) C = { x: M.x + i * 3, z: M.z + j * 3 };
  check(free(C.x, C.z), 'walls: there is open ground to wall');
  const man = list(ann).find((u) => u.seat === annS && u.kind === 1)!;
  const engineers = list(ann).filter((u) => u.seat === annS && u.kind === 0).map((u) => u.id);
  send(ann, 'stance', { ids: [man.id], stance: 2 });
  send(ann, 'move', { ids: [man.id, ...engineers], x: C.x, z: C.z });
  step(40);
  send(ann, 'move', { ids: [man.id], x: C.x, z: C.z });
  step(8);
  const at = () => list(ann).find((u) => u.id === man.id)!;
  check(Math.hypot(at().x - C.x, at().z - C.z) < 2, `walls: the rifleman is in place (${Math.hypot(at().x - C.x, at().z - C.z).toFixed(1)} off)`);
  // A ring round him, five cells a side: sixteen lengths, 160 steel.
  const before = steel();
  const k = 6;
  send(ann, 'wall', { x: C.x - k, z: C.z - k, x1: C.x + k, z1: C.z - k, ids: engineers });
  send(ann, 'wall', { x: C.x + k, z: C.z - k, x1: C.x + k, z1: C.z + k, ids: engineers, queue: true });
  send(ann, 'wall', { x: C.x + k, z: C.z + k, x1: C.x - k, z1: C.z + k, ids: engineers, queue: true });
  send(ann, 'wall', { x: C.x - k, z: C.z + k, x1: C.x - k, z1: C.z - k, ids: engineers, queue: true });
  step(1);
  const ring = () => blds().filter((b) => b.seat === annS && (b.kind === RAMPART || b.kind === GATE));
  check(ring().length === 16 && before - steel() === 160, `walls: a ring of sixteen lengths is laid, ten steel each (${ring().length}, ${before - steel()} steel; ${ring().map((b) => `${(b.x - C.x) / 3},${(b.z - C.z) / 3}`).join(" ")}; C ${C.x},${C.z})`);
  for (let t = 0; t < 240 && ring().some((b) => b.built < 100); t += 5) step(5);
  check(ring().every((b) => b.built >= 100), `walls: the engineers build it (${ring().filter((b) => b.built >= 100).length} of ${ring().length})`);
  // Walled in: told to go home, he can't.
  send(ann, 'move', { ids: [man.id], x: BASES[annS].x, z: BASES[annS].z });
  step(15);
  check(Math.abs(at().x - C.x) < 5 && Math.abs(at().z - C.z) < 5, `walls: nothing walks through a wall, not even its own side (${(at().x - C.x).toFixed(1)}, ${(at().z - C.z).toFixed(1)} from the middle)`);
  // A gate in place of a length of it (the middle of one side), and he's out.
  send(ann, 'build', { kind: 'gate', x: C.x, z: C.z - k, ids: engineers });
  step(1);
  check(ring().filter((b) => b.kind === GATE).length === 1 && ring().length === 14, `walls: a gatehouse takes the place of three lengths of wall (${ring().length} pieces)`);
  for (let t = 0; t < 60 && ring().some((b) => b.built < 100); t += 3) step(3);
  check(ring().every((b) => b.built >= 100), 'walls: and is built');
  send(ann, 'move', { ids: [man.id], x: BASES[annS].x, z: BASES[annS].z });
  step(15);
  check(Math.hypot(at().x - C.x, at().z - C.z) > 9, `walls: its own side goes out through the gate (${Math.hypot(at().x - C.x, at().z - C.z).toFixed(1)} from the middle)`);
  // Back in: the doors open for him as he comes near. Locked, they stay shut, and he's walled in; unlocked, he's out again.
  send(ann, 'move', { ids: [man.id], x: C.x, z: C.z });
  step(15);
  const gate = () => ring().find((b) => b.kind === GATE)!;
  check(Math.hypot(at().x - C.x, at().z - C.z) < 3 && (gate().state & 4) !== 0, `gates: he comes back in, and its doors stand open while he's near (state ${gate().state})`);
  send(ann, 'lock', { id: gate().id });
  step(2);
  check((gate().state & 2) !== 0 && (gate().state & 4) === 0, `gates: locked, its doors shut (state ${gate().state})`);
  send(ann, 'move', { ids: [man.id], x: BASES[annS].x, z: BASES[annS].z });
  step(12);
  check(Math.abs(at().x - C.x) < 5 && Math.abs(at().z - C.z) < 5, `gates: and no one gets through a locked gate, not even its own side (${(at().x - C.x).toFixed(1)}, ${(at().z - C.z).toFixed(1)})`);
  send(ann, 'lock', { id: gate().id });
  send(ann, 'move', { ids: [man.id], x: BASES[annS].x, z: BASES[annS].z });
  step(15);
  check(Math.hypot(at().x - C.x, at().z - C.z) > 9, `gates: unlocked, he's out again (${Math.hypot(at().x - C.x, at().z - C.z).toFixed(1)} from the middle)`);
  // Bob's riflemen, sent to fight in the middle of the ring: no way in, so they shoot one.
  const raiders = list(bob).filter((u) => u.seat === bobS && u.kind === 1).map((u) => u.id);
  send(bob, 'move', { ids: raiders, x: C.x, z: C.z, attack: true });
  let hurt = false;
  let early = false;
  let inside = false;
  const within = () => list(bob).some((u) => raiders.includes(u.id) && Math.abs(u.x - C.x) < 4 && Math.abs(u.z - C.z) < 4);
  for (let t = 0; t < 300 && !inside; t += 3) {
    step(3);
    if (ring().length < 14 || ring().some((b) => b.hp < 100)) hurt = true;
    if (ring().length === 14 && within()) early = true;
    inside = ring().length < 14 && within();
  }
  check(raiders.length > 0 && hurt, `walls: an enemy with no way in shoots at the wall (${raiders.length} riflemen)`);
  check(!early && inside, `walls: and comes in through the breach, not before (${ring().length} lengths left, early ${early})`);
}

/**
 * The trade post: a lot of steel sold for oil; the next fetches less; the price climbs back. And
 * selling one way and buying back the other never pays.
 */
function trade() {
  check(tradeGet('steel', 1) * tradeGet('oil', 1) < TRADE.lot * TRADE.lot && tradeGet('steel', 0.5) < tradeGet('steel', 1), 'trade: a round trip loses, and a lower price fetches less');
  const def = allGames.find((g) => g.id === 'command')!;
  const host = new GameHost(def, { engine: readFileSync('engine/pkg/voxel_engine_bg.wasm'), seed: 7, remote: true, radius: 9, budget: Infinity, cheats: true, room: 't' });
  const heard = new Map<string, Map<string, unknown>>();
  const step = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) for (const [id, batch] of host.step(1 / 30)) for (const e of (batch as { events?: { t: string; call?: { target: string; method: string; args: unknown[] } }[] }).events ?? []) if (e.t === 'call' && e.call?.target === 'message') (heard.get(id) ?? heard.set(id, new Map()).get(id)!).set(e.call.method, e.call.args[0]);
  };
  const join = (name: string) => { const c = host.connect(name); host.command(c.id, { t: 'start', name } as never); return c.id; };
  const send = (id: string, name: string, data: unknown = {}) => host.command(id, { t: 'message', msg: { t: 'game', name, data } } as never);
  const ann = join('Ann');
  const bob = join('Bob');
  step(1);
  const state = () => heard.get(ann)?.get('state') as State;
  send(bob, 'lobby', { op: 'ready' });
  step(0.3);
  send(ann, 'lobby', { op: 'start' });
  step(8);
  const seat = state().mine[ann];
  const me = () => state().seats.find((x) => x.seat === seat)!;
  const MARKET = BUILDING_ORDER.indexOf('market');
  const market = () => { const a = heard.get(ann)!.get('b') as number[]; for (let i = 0; i < a.length; i += 9) if (a[i + 1] === MARKET && a[i + 2] === seat) return { id: a[i], built: a[i + 6] }; return null; };
  const u = heard.get(ann)!.get('u') as number[];
  const engineers: number[] = [];
  for (let i = 0; i < u.length; i += 8) if (u[i + 2] === seat && u[i + 1] === 0) engineers.push(u[i]);
  // Gather a while, then put one up beside the HQ (wherever there's room).
  step(50);
  const B = BASES[seat];
  for (const [dx, dz] of [[14, 0], [-14, 0], [0, 14], [0, -14], [14, 14], [-14, 14], [14, -14], [-14, -14]]) {
    send(ann, 'build', { kind: 'market', x: B.x + dx, z: B.z + dz, ids: engineers.slice(0, 2) });
    step(1);
    if (market()) break;
  }
  check(!!market(), 'trade: a trade post is laid');
  for (let t = 0; t < 120 && market()!.built < 100; t += 5) step(5);
  check(market()!.built >= 100, 'trade: and built');
  for (let t = 0; t < 120 && me().steel < 120; t += 5) step(5);
  const [steel0, oil0, fetch0] = [me().steel, me().oil, me().trade[0]];
  send(ann, 'trade', { id: market()!.id, sell: 'steel' });
  step(0.2);
  check(fetch0 === TRADE.oil && me().oil - oil0 === fetch0 && steel0 - me().steel <= TRADE.lot + 5 && steel0 - me().steel >= TRADE.lot - 20, `trade: a hundred steel fetches ${fetch0} oil (${steel0}→${me().steel} steel, ${oil0}→${me().oil} oil)`);
  const fetch1 = me().trade[0];
  check(fetch1 < fetch0, `trade: and the next fetches less (${fetch1})`);
  step(40);
  check(me().trade[0] > fetch1, `trade: the price climbs back (${me().trade[0]})`);
}

/**
 * The uplink: one that stands its time wins its side the match; and the bots, seeing one go up
 * against them, send their army at it.
 */
function uplink() {
  const h = launch('command', { seed: 21 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const lobby = (data: object) => h.send({ t: 'game', player, name: 'lobby', data });
  h.run(1);
  lobby({ op: 'preset', preset: 'ffa' });
  lobby({ op: 'peace', peace: 0 });
  lobby({ op: 'resources', resources: 'normal' });
  for (const seat of [1, 2, 3]) {
    lobby({ op: 'kind', seat, kind: 'bot' });
    lobby({ op: 'difficulty', seat, difficulty: 'hard' });
    lobby({ op: 'style', seat, style: 'balanced' });
  }
  lobby({ op: 'start' });
  h.run(9);
  check(state().phase === 'play', 'uplink: the match begins');
  const me = Object.values(state().mine)[0];
  const B = BASES[me];
  const at = { x: B.x + Math.sign(-B.x) * 22, z: B.z + Math.sign(-B.z) * 10 };
  check(!state().uplinks.length, 'uplink: none at the start');
  // A bot with an army: it goes for the uplink as soon as it's up.
  const foe = me === 1 ? 2 : 1;
  h.ctx.commands.run(`army tank 8 ${foe}`);
  h.run(2);
  h.ctx.commands.run(`raise uplink ${me} ${at.x} ${at.z}`);
  h.run(1);
  const up = state().uplinks[0];
  check(up && up.seat === me && up.left > 290 && up.left <= 300, `uplink: it's up, its clock running (${JSON.stringify(up)})`);
  let near = 0;
  for (let t = 0; t < 150 && !near; t += 3) {
    h.run(3);
    const u = units();
    for (let i = 0; i < u.length; i += 8) if (u[i + 2] === foe && Math.hypot(u[i + 3] - at.x, u[i + 4] - at.z) < 30) near++;
  }
  check(near > 0, `uplink: the bot's tanks come for it (by ${state().time} s)`);
  // Kept standing (they're held off): its side wins when the clock runs out.
  h.ctx.commands.run(`army tank 30 ${me} ${at.x} ${at.z}`);
  h.run(320, { until: () => state().phase === 'over' });
  const s = state();
  check(s.phase === 'over' && s.wonBy === 'uplink' && s.winners.includes(me) && s.winners.length === 1, `uplink: it held, and its side won (${s.phase}, ${s.wonBy}, winners ${s.winners}, uplinks ${JSON.stringify(s.uplinks)})`);
}

/** Medics: hurt soldiers near one are patched up, faster than the HQ's slow mending would. */
function medic() {
  const h = launch('command', { seed: 5 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const lobby = (data: object) => h.send({ t: 'game', player, name: 'lobby', data });
  h.run(1);
  lobby({ op: 'preset', preset: 'ffa' });
  lobby({ op: 'peace', peace: 10 });
  lobby({ op: 'start' });
  h.run(9);
  check(state().phase === 'play', 'medic: the match begins');
  const me = Object.values(state().mine)[0];
  const B = BASES[me];
  // Out in the field, away from any depot: two squads, one with a medic.
  const RIFLE = UNIT_ORDER.indexOf('rifle');
  const MEDIC = UNIT_ORDER.indexOf('medic');
  const far = (dx: number) => ({ x: B.x + Math.sign(-B.x) * 50 + dx, z: B.z + Math.sign(-B.z) * 30 });
  const a = far(0);
  const b = far(30);
  h.ctx.commands.run(`army rifle 3 ${me} ${a.x} ${a.z}`);
  h.ctx.commands.run(`army medic 1 ${me} ${a.x} ${a.z + 4}`);
  h.ctx.commands.run(`army rifle 3 ${me} ${b.x} ${b.z}`);
  h.run(1);
  h.ctx.commands.run(`hurt ${me} 0.3`);
  h.run(1);
  const health = (p: { x: number; z: number }) => {
    const u = units();
    let n = 0;
    let sum = 0;
    for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && u[i + 1] === RIFLE && Math.hypot(u[i + 3] - p.x, u[i + 4] - p.z) < 12) {
      n++;
      sum += u[i + 5];
    }
    return n ? sum / n : -1;
  };
  check(units().some((_, i) => i % 8 === 1 && units()[i] === MEDIC), 'medic: one is on the field');
  const [a0, b0] = [health(a), health(b)];
  h.run(40);
  const [a1, b1] = [health(a), health(b)];
  check(a0 > 0 && b0 > 0 && a1 >= 85 && b1 - b0 < 10, `medic: the squad with a medic is patched up (${a0}% → ${a1}%), the one without isn't (${b0}% → ${b1}%)`);
}

/** Engineers sent at a damaged tank of their side mend it; a tank no one sees to stays as it is. */
function mend() {
  const h = launch('command', { seed: 6 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const lobby = (data: object) => h.send({ t: 'game', player, name: 'lobby', data });
  h.run(1);
  lobby({ op: 'preset', preset: 'ffa' });
  lobby({ op: 'peace', peace: 10 });
  lobby({ op: 'start' });
  h.run(9);
  const me = Object.values(state().mine)[0];
  const B = BASES[me];
  const at = { x: B.x + Math.sign(-B.x) * 50, z: B.z + Math.sign(-B.z) * 30 };
  const TANK = UNIT_ORDER.indexOf('tank');
  const ENGINEER = UNIT_ORDER.indexOf('engineer');
  h.ctx.commands.run(`army tank 2 ${me} ${at.x} ${at.z}`);
  h.ctx.commands.run(`army engineer 2 ${me} ${at.x} ${at.z + 12}`);
  h.run(1);
  h.ctx.commands.run(`hurt ${me} 0.4`);
  h.run(1);
  const find = (kind: number) => {
    const u = units();
    const out: { id: number; hp: number; x: number; z: number }[] = [];
    for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && u[i + 1] === kind && Math.hypot(u[i + 3] - at.x, u[i + 4] - at.z) < 20) out.push({ id: u[i], hp: u[i + 5], x: u[i + 3], z: u[i + 4] });
    return out;
  };
  const tanks = find(TANK);
  const engineers = find(ENGINEER);
  check(tanks.length === 2 && engineers.length === 2, `mend: two tanks and two engineers out in the field (${tanks.length}, ${engineers.length})`);
  h.send({ t: 'game', player, name: 'repair', data: { ids: engineers.map((e) => e.id), id: tanks[0].id, unit: true } });
  h.run(25);
  const hp = (id: number) => {
    const u = units();
    for (let i = 0; i < u.length; i += 8) if (u[i] === id) return u[i + 5];
    return -1;
  };
  check(hp(tanks[0].id) >= 95 && hp(tanks[1].id) <= tanks[1].hp + 2, `mend: the tank seen to is mended (${tanks[0].hp}% → ${hp(tanks[0].id)}%), the other isn't (${tanks[1].hp}% → ${hp(tanks[1].id)}%)`);
}

/** The alarm: the engineers by the HQ shelter in it; let out, they go back to work. */
function alarm() {
  const h = launch('command', { seed: 8 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const blds = () => h.find('message', 'b').at(-1)?.args[0] as number[];
  const lobby = (data: object) => h.send({ t: 'game', player, name: 'lobby', data });
  h.run(1);
  lobby({ op: 'preset', preset: 'ffa' });
  lobby({ op: 'peace', peace: 10 });
  lobby({ op: 'start' });
  h.run(9);
  h.run(10);
  const me = Object.values(state().mine)[0];
  const ENGINEER = UNIT_ORDER.indexOf('engineer');
  const HQ = BUILDING_ORDER.indexOf('hq');
  const out = () => {
    const u = units();
    let n = 0;
    for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && u[i + 1] === ENGINEER) n++;
    return n;
  };
  const hq = () => {
    const b = blds();
    for (let i = 0; i < b.length; i += 9) if (b[i + 2] === me && b[i + 1] === HQ) return { id: b[i], held: b[i + 8] };
    return null;
  };
  const n0 = out();
  check(n0 >= 4 && hq()?.held === 0, `alarm: engineers at work, none in the HQ (${n0}, ${hq()?.held})`);
  h.send({ t: 'game', player, name: 'alarm', data: { id: hq()!.id } });
  h.run(12);
  check(hq()!.held === n0 && out() === 0, `alarm: all of them shelter in the HQ (${hq()!.held} in, ${out()} out)`);
  h.send({ t: 'game', player, name: 'unload', data: { id: hq()!.id, boat: false } });
  h.run(15);
  const u = units();
  let working = 0;
  for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && u[i + 1] === ENGINEER && !(u[i + 7] & 8)) working++;
  check(hq()!.held === 0 && working === n0, `alarm: let out, they're all back at work (${working} of ${n0})`);
}

/**
 * A bot walls its base: every base's plan has gates on its lines and no line too long to drag; a
 * turtle on Hard, given time, puts up its walls and gates, and its army still goes out through them.
 */
function botWalls() {
  for (const b of BASES) {
    const p = wallPlan(b.x, b.z);
    const cells = p.lines.map((l) => wallLine(l[0], l[1], l[2], l[3], 99));
    check(p.lines.length >= 2 && cells.every((c) => c.length <= 40) && p.gates.every((g) => cells.some((c) => c.some((q) => q.x === g.x && q.z === g.z))), `bot walls: a plan for the base at ${b.x}, ${b.z} (${p.lines.length} lines, ${p.gates.length} gates)`);
    check(cells.flat().every((q) => Math.abs(q.x) <= HALF && Math.abs(q.z) <= HALF), 'bot walls: all of it on the map');
  }
  const h = launch('command', { seed: 12 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const blds = () => h.find('message', 'b').at(-1)?.args[0] as number[];
  const lobby = (data: object) => h.send({ t: 'game', player, name: 'lobby', data });
  h.run(1);
  // The player beside a turtle (so what it builds is in sight), against a bot.
  lobby({ op: 'preset', preset: 'teams' });
  // (Every rule set here: the lobby keeps what the matches before this one left it with.)
  lobby({ op: 'peace', peace: 5 });
  lobby({ op: 'resources', resources: 'normal' });
  lobby({ op: 'difficulty', seat: 0, difficulty: 'normal' });
  lobby({ op: 'style', seat: 0, style: 'balanced' });
  lobby({ op: 'difficulty', seat: 1, difficulty: 'hard' });
  lobby({ op: 'style', seat: 1, style: 'turtle' });
  lobby({ op: 'kind', seat: 3, kind: 'closed' });
  lobby({ op: 'sit', seat: 2 });
  lobby({ op: 'team', seat: 1, team: 0 });
  lobby({ op: 'team', seat: 2, team: 0 });
  lobby({ op: 'team', seat: 0, team: 1 });
  lobby({ op: 'start' });
  h.run(9);
  check(state().phase === 'play', 'bot walls: the match begins');
  const RAMPART = BUILDING_ORDER.indexOf('rampart');
  const GATE = BUILDING_ORDER.indexOf('gate');
  const walls = () => { const b = blds(); let r = 0; let g = 0; for (let i = 0; i < b.length; i += 9) if (b[i + 2] === 1 && b[i + 6] >= 100) { if (b[i + 1] === RAMPART) r++; if (b[i + 1] === GATE) g++; } return { r, g }; };
  // (Lengths by a camp still guarded wait for it to be cleared, which takes a while longer.)
  h.run(900, { until: () => walls().r >= 30 && walls().g >= 2 });
  const w1 = walls();
  check(w1.r >= 30 && w1.g >= 2, `bot walls: the turtle walls its base (${w1.r} lengths and ${w1.g} gates built by ${state().time} s)`);
  // And it still goes out: a unit trained since (inside them, where all it trains from is), well outside.
  const B = BASES[1];
  let out = 0;
  const before = new Set<number>();
  { const u = units(); for (let i = 0; i < u.length; i += 8) if (u[i + 2] === 1) before.add(u[i]); }
  for (let t = 0; t < 420 && !out; t += 10) {
    h.run(10);
    const u = units();
    for (let i = 0; i < u.length; i += 8) if (u[i + 2] === 1 && !before.has(u[i]) && Math.hypot(u[i + 3] - B.x, u[i + 4] - B.z) > 55) out++;
  }
  check(out > 0, `bot walls: and its units still go out through the gates (by ${state().time} s)`);
}

/**
 * Told to attack one enemy that runs off behind its friends, soldiers shot at on the way fight back,
 * not walk on through the fire after it.
 */
function chase() {
  const def = allGames.find((g) => g.id === 'command')!;
  const host = new GameHost(def, { engine: readFileSync('engine/pkg/voxel_engine_bg.wasm'), seed: 5, remote: true, radius: 9, budget: Infinity, cheats: true, room: 'c' });
  const heard = new Map<string, Map<string, unknown>>();
  const step = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) for (const [id, batch] of host.step(1 / 30)) for (const e of (batch as { events?: { t: string; call?: { target: string; method: string; args: unknown[] } }[] }).events ?? []) if (e.t === 'call' && e.call?.target === 'message') (heard.get(id) ?? heard.set(id, new Map()).get(id)!).set(e.call.method, e.call.args[0]);
  };
  const join = (name: string) => { const c = host.connect(name); host.command(c.id, { t: 'start', name } as never); return c.id; };
  const send = (id: string, name: string, data: unknown = {}) => host.command(id, { t: 'message', msg: { t: 'game', name, data } } as never);
  const ann = join('Ann');
  const bob = join('Bob');
  step(1);
  const state = () => heard.get(ann)?.get('state') as State;
  send(bob, 'lobby', { op: 'ready' });
  step(0.3);
  send(ann, 'lobby', { op: 'start' });
  step(8);
  const annS = state().mine[ann];
  const bobS = state().mine[bob];
  const list = (id: string) => { const a = heard.get(id)!.get('u') as number[]; const o: { id: number; kind: number; seat: number; x: number; z: number; hp: number }[] = []; for (let i = 0; i < a.length; i += 8) o.push({ id: a[i], kind: a[i + 1], seat: a[i + 2], x: a[i + 3], z: a[i + 4], hp: a[i + 5] }); return o; };
  const P = { x: (BASES[annS].x + BASES[bobS].x) / 2 + 4, z: (BASES[annS].z + BASES[bobS].z) / 2 + 6 };
  const toAnn = { x: BASES[annS].x - P.x, z: BASES[annS].z - P.z };
  const k = 16 / Math.hypot(toAnn.x, toAnn.z);
  // Bob's riflemen hold the spot; Ann's, holding fire, a little way off.
  const all = list(bob).filter((u) => u.seat === bobS && u.kind === 1).map((u) => u.id);
  // (The one sent for: a rifleman, as quick as theirs, so they can't just catch him and be done.)
  const guy = all[0];
  const bobRifles = all.slice(1);
  const annRifles = list(ann).filter((u) => u.seat === annS && u.kind === 1).map((u) => u.id);
  send(bob, 'stance', { ids: all, stance: 1 });
  send(ann, 'stance', { ids: annRifles, stance: 2 });
  send(bob, 'move', { ids: bobRifles, x: P.x, z: P.z });
  send(bob, 'move', { ids: [guy], x: P.x, z: P.z });
  send(ann, 'move', { ids: annRifles, x: P.x + toAnn.x * k, z: P.z + toAnn.z * k });
  step(45);
  // (Their health as Bob sees it: they may go out of Ann's sight.)
  const hp0 = list(bob).filter((u) => bobRifles.includes(u.id)).reduce((n, u) => n + u.hp, 0);
  // Ann goes for one of them; he runs for home, behind the rest.
  send(ann, 'stance', { ids: annRifles, stance: 0 });
  send(ann, 'attack', { ids: annRifles, id: guy });
  send(bob, 'move', { ids: [guy], x: BASES[bobS].x, z: BASES[bobS].z });
  step(15);
  const hp1 = list(bob).filter((u) => bobRifles.includes(u.id)).reduce((n, u) => n + u.hp, 0);
  check(annRifles.length > 0 && bobRifles.length > 0 && hp0 > 0, `chase: the two sides in place (${annRifles.length} against ${bobRifles.length})`);
  check(hp1 < hp0, `chase: shot at on their way after him, they fight back (the rest of Bob's riflemen ${hp0} → ${hp1} health)`);
}

export default function command() {
  flanking();
  chase();
  walls();
  trade();
  surrender();
  field();
  standing();
  forward();
  tricks();
  together();
  setup();
  check(heightAt(-14, -24) === 3 && heightAt(-68, -68) === 0 && heightAt(-14 + 7.6, -24) <= 1, 'hills rise in terraces, and the bases are flat');
  play('ffa', 4, 1);
  play('teams', 4, 1);
  const coop = play('coop', 4, 1);
  check(coop.seats.filter((s) => s.team === 1).length === 2, 'coop: two bot enemies');
  // (Last: it leaves the lobby set for a peace, which would carry over to the matches after it.)
  botWalls();
  uplink();
  medic();
  mend();
  alarm();
  ranks();
  elites();
  botSense();
  routes();
  errands();
}

/** A mixed army sent a long way: it keeps together on the march, and arrives armour in front, guns at the back. */
function ranks() {
  const h = launch('command', { seed: 6 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const lobby = (data: object) => h.send({ t: 'game', player, name: 'lobby', data });
  h.run(1);
  lobby({ op: 'preset', preset: 'ffa' });
  lobby({ op: 'peace', peace: 10 });
  lobby({ op: 'start' });
  h.run(9);
  const me = Object.values(state().mine)[0];
  const B = BASES[me];
  const at = { x: B.x * 0.6, z: B.z * 0.6 };
  const to = { x: B.x * 0.1, z: B.z * 0.1 };
  for (const a of ['tank 3', 'rifle 6', 'artillery 2', 'medic 2']) h.ctx.commands.run(`army ${a} ${me} ${at.x} ${at.z}`);
  h.run(2);
  const mine = () => {
    const u = units();
    const out: { id: number; kind: string; x: number; z: number }[] = [];
    for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && UNIT_ORDER[u[i + 1]] !== 'engineer' && Math.hypot(u[i + 3] - at.x, u[i + 4] - at.z) < 60) out.push({ id: u[i], kind: UNIT_ORDER[u[i + 1]], x: u[i + 3], z: u[i + 4] });
    return out;
  };
  const ids = new Set(mine().filter((u) => Math.hypot(u.x - at.x, u.z - at.z) < 16).map((u) => u.id));
  const army = mine().filter((u) => ids.has(u.id));
  const L = Math.hypot(to.x - at.x, to.z - at.z);
  const along = (u: { x: number; z: number }) => ((u.x - at.x) * (to.x - at.x) + (u.z - at.z) * (to.z - at.z)) / L;
  h.send({ t: 'game', player, name: 'move', data: { ids: army.map((u) => u.id), x: to.x, z: to.z } });
  h.run(5);
  const mid = mine().filter((u) => ids.has(u.id));

  const spread = Math.max(...mid.map(along)) - Math.min(...mid.map(along));
  const was = Math.max(...army.map(along)) - Math.min(...army.map(along));
  check(spread < was + 6, `ranks: on the march the column keeps together (${spread.toFixed(1)} long)`);
  h.run(20);
  const end = mine().filter((u) => ids.has(u.id));
  const avg = (k: string) => { const l = end.filter((u) => u.kind === k); return l.reduce((a, u) => a + along(u), 0) / l.length; };
  console.log('front to back', ['tank', 'rifle', 'medic', 'artillery'].map((k) => `${k} ${avg(k).toFixed(1)}`).join(', '));
  check(avg('tank') > avg('rifle') && avg('rifle') > avg('medic') && avg('medic') > avg('artillery'), 'ranks: tanks in front, then the infantry, the medics, the guns at the back');
}

/** Elites (three stars) mend themselves out in the field, where a recruit doesn't. */
function elites() {
  const h = launch('command', { seed: 6 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const lobby = (data: object) => h.send({ t: 'game', player, name: 'lobby', data });
  h.run(1);
  lobby({ op: 'preset', preset: 'ffa' });
  lobby({ op: 'peace', peace: 10 });
  lobby({ op: 'start' });
  h.run(9);
  const me = Object.values(state().mine)[0];
  const B = BASES[me];
  const at = { x: B.x + Math.sign(-B.x) * 50, z: B.z + Math.sign(-B.z) * 30 };
  const TANK = UNIT_ORDER.indexOf('tank');
  h.ctx.commands.run(`army tank 1 ${me} ${at.x} ${at.z}`);
  h.run(1);
  const tanks = () => {
    const u = units();
    const out: { id: number; hp: number; rank: number }[] = [];
    for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && u[i + 1] === TANK) out.push({ id: u[i], hp: u[i + 5], rank: rankBits(u[i + 7]) });
    return out;
  };
  const [vet] = tanks();
  // (That one made an elite; one more, come after, left a recruit.)
  h.ctx.commands.run(`vet ${me} 16`);
  h.ctx.commands.run(`army tank 1 ${me} ${at.x} ${at.z + 10}`);
  h.run(1);
  const raw = tanks().find((t) => t.id !== vet.id)!;
  h.ctx.commands.run(`hurt ${me} 0.4`);
  h.run(1);
  check(tanks().find((t) => t.id === vet.id)!.rank === 3, 'elites: made an elite (three stars)');
  h.run(30);
  const a = tanks().find((t) => t.id === vet.id)!;
  check(a.hp >= 65, `elites: an elite out in the field mends itself (40% → ${a.hp}%)`);
  const b = tanks().find((t) => t.id === raw.id)!;
  check(b.rank === 0 && b.hp <= 45, `elites: a recruit beside it doesn't (40% → ${b.hp}%)`);
}

/** Bots go by a rank and a name of their style's; and one far from home pulls its badly hurt out of a fight to mend. */
function botSense() {
  const h = launch('command', { seed: 8 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const lobby = (data: object) => h.send({ t: 'game', player, name: 'lobby', data });
  h.run(1);
  lobby({ op: 'preset', preset: 'ffa' });
  lobby({ op: 'peace', peace: 0 });
  lobby({ op: 'sit', seat: 3 });
  lobby({ op: 'difficulty', seat: 0, difficulty: 'normal' });
  lobby({ op: 'difficulty', seat: 1, difficulty: 'adaptive' });
  lobby({ op: 'difficulty', seat: 2, difficulty: 'hard' });
  lobby({ op: 'start' });
  h.run(9);
  const bots = state().seats.filter((s) => !s.human);
  check(bots.length === 3 && bots.every((s) => /^(Lt|Maj|Gen|Col)\. [A-Z]/.test(s.name)), `bots: each goes by a rank and a name (${bots.map((s) => s.name).join(', ')})`);
  check(bots.find((s) => s.seat === 1)!.name.startsWith('Col.') && bots.find((s) => s.seat === 2)!.name.startsWith('Gen.'), 'bots: the rank says how good it is');
  const me = state().mine[player];
  const B = BASES[0];
  const P = { x: B.x * 0.3, z: B.z * 0.3 };
  const TANK = UNIT_ORDER.indexOf('tank');
  h.ctx.commands.run(`army tank 3 0 ${P.x} ${P.z}`);
  const towards = { x: -Math.sign(B.x) * 9, z: -Math.sign(B.z) * 9 };
  h.ctx.commands.run(`army tank 1 ${me} ${P.x + towards.x} ${P.z + towards.z}`);
  h.run(0.2);
  const mine: number[] = [];
  { const u = units(); for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && u[i + 1] === TANK && Math.hypot(u[i + 3] - P.x, u[i + 4] - P.z) < 20) mine.push(u[i]); }
  h.send({ t: 'game', player, name: 'stance', data: { ids: mine, stance: 1 } });
  h.run(2.5);
  h.ctx.commands.run('hurt 0 0.28');
  // (How far each got, looked at as it goes: one may still be caught on its way.)
  const got = new Map<number, number>();
  for (let t = 0; t < 6; t += 0.5) {
    h.run(0.5);
    const u = units();
    for (let i = 0; i < u.length; i += 8) if (u[i + 2] === 0 && u[i + 1] === TANK) got.set(u[i], Math.max(got.get(u[i]) ?? 0, Math.hypot(u[i + 3] - P.x, u[i + 4] - P.z)));
  }
  const tanks = [...got.values()];
  check(tanks.length > 0 && tanks.some((d) => d > 12), `bots: badly hurt and far from home, they pull out of the fight (${tanks.map((d) => d.toFixed(0)).join(', ')} from where they were)`);
}

/** A tank put down in the slot between a factory and a wall finds its way out and round, not stuck against either. */
function routes() {
  const h = launch('command', { seed: 6 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const lobby = (data: object) => h.send({ t: 'game', player, name: 'lobby', data });
  h.run(1);
  lobby({ op: 'preset', preset: 'ffa' });
  lobby({ op: 'peace', peace: 10 });
  lobby({ op: 'start' });
  h.run(9);
  const me = Object.values(state().mine)[0];
  const B = BASES[me];
  // Open ground a way out from the base.
  const free = (x: number, z: number) => [...TREES, ...deposits()].every((t) => Math.hypot(t.x - x, t.z - z) > 16) && [...LAKES, ...MESAS].every((l) => Math.hypot(l.x - x, l.z - z) > l.r + 20) && heightAt(x, z) === 0;
  let S = { x: wallSnap(B.x * 0.5), z: wallSnap(B.z * 0.5) };
  for (let r = 0; r < 14 && !free(S.x, S.z); r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (!free(S.x, S.z) && free(wallSnap(B.x * 0.5) + i * 3, wallSnap(B.z * 0.5) + j * 3)) S = { x: wallSnap(B.x * 0.5) + i * 3, z: wallSnap(B.z * 0.5) + j * 3 };
  check(free(S.x, S.z), 'routes: open ground to build on');
  h.ctx.commands.run(`raise factory ${me} ${S.x} ${S.z}`);
  // A wall hard up against its east side, longer than the factory, and the tank squeezed in between.
  const wx = wallSnap(S.x + 6.2);
  for (let k = -5; k <= 5; k++) h.ctx.commands.run(`raise rampart ${me} ${wx} ${S.z + k * 3}`);
  h.ctx.commands.run(`army tank 1 ${me} ${S.x + 4.6} ${S.z + 1}`);
  h.run(0.5);
  const TANK = UNIT_ORDER.indexOf('tank');
  const tank = () => { const u = units(); for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && u[i + 1] === TANK && Math.hypot(u[i + 3] - S.x, u[i + 4] - S.z) < 40) return { id: u[i], x: u[i + 3], z: u[i + 4] }; return null; };
  const t0 = tank()!;
  check(!!t0, 'routes: the tank is in the slot');
  // Sent to the far (west) side of the factory: out of the slot, round the factory.
  const to = { x: S.x - 16, z: S.z };
  h.send({ t: 'game', player, name: 'move', data: { ids: [t0.id], x: to.x, z: to.z } });
  h.run(30);
  const t1 = tank()!;
  check(Math.hypot(t1.x - to.x, t1.z - to.z) < 4, `routes: it gets out and round to where it was sent (${Math.hypot(t1.x - to.x, t1.z - to.z).toFixed(1)} off)`);
}

/**
 * An engineer sent to build a length of wall goes to it from the side it's on, not round the wall to the
 * far side; and riflemen walking past an enemy who shoots at them fight back.
 */
function errands() {
  const h = launch('command', { seed: 6 });
  const player = h.ctx.player.id;
  const state = () => h.find('message', 'state').at(-1)?.args[0] as State;
  const units = () => h.find('message', 'u').at(-1)?.args[0] as number[];
  const lobby = (data: object) => h.send({ t: 'game', player, name: 'lobby', data });
  const send = (name: string, data: unknown) => h.send({ t: 'game', player, name, data });
  h.run(1);
  lobby({ op: 'preset', preset: 'ffa' });
  lobby({ op: 'peace', peace: 0 });
  lobby({ op: 'sit', seat: 3 });
  lobby({ op: 'start' });
  h.run(9);
  const me = state().mine[player];
  const B = BASES[me];
  // A long wall out from the base, with a gap in the middle of it; an engineer on the east side, told to close the gap.
  const free = (x: number, z: number) => Math.hypot(x - B.x, z - B.z) > 30 && TREES.every((t) => Math.hypot(t.x - x, t.z - z) > 5) && deposits().every((t) => Math.hypot(t.x - x, t.z - z) > 8) && [...LAKES, ...MESAS].every((l) => Math.hypot(l.x - x, l.z - z) > l.r + 8) && heightAt(x, z) === 0;
  // (The open spot nearest a little way out from the base, the whole wall's length of it.)
  const spots: { x: number; z: number }[] = [];
  for (let x = -HALF + 24; x <= HALF - 24; x += 3) for (let z = -HALF + 24; z <= HALF - 24; z += 3) if ([-18, 0, 18].every((k) => free(wallSnap(x), wallSnap(z) + k))) spots.push({ x: wallSnap(x), z: wallSnap(z) });
  const W = spots.sort((p, q) => Math.hypot(p.x - B.x * 0.45, p.z - B.z * 0.45) - Math.hypot(q.x - B.x * 0.45, q.z - B.z * 0.45))[0] ?? { x: 0, z: 0 };
  check(free(W.x, W.z), 'errands: open ground for a wall');
  for (let k = -6; k <= 6; k++) if (k) h.ctx.commands.run(`raise rampart ${me} ${W.x} ${W.z + k * 3}`);
  const ENG = UNIT_ORDER.indexOf('engineer');
  const before = new Set<number>();
  { const u = units(); for (let i = 0; i < u.length; i += 8) before.add(u[i]); }
  h.ctx.commands.run(`army engineer 1 ${me} ${W.x + 12} ${W.z + 1}`);
  h.run(0.3);
  const eng = () => { const u = units(); for (let i = 0; i < u.length; i += 8) if (u[i + 1] === ENG && !before.has(u[i])) return { id: u[i], x: u[i + 3], z: u[i + 4] }; return null; };
  const e0 = eng()!;
  send('wall', { x: W.x, z: W.z, x1: W.x, z1: W.z, ids: [e0.id] });
  h.run(3);
  const e1 = eng()!;
  check(Math.hypot(e1.x - W.x, e1.z - W.z) < 5 && e1.x > W.x, `errands: the engineer goes straight to the gap from its own side, not round the wall to the far side (${(e1.x - W.x).toFixed(1)}, ${(e1.z - W.z).toFixed(1)} from it)`);

  // Riflemen walking past the wild's riflemen (no one's: they stay where they're put and shoot), who shoot at them: they fight back.
  const RIFLE = UNIT_ORDER.indexOf('rifle');
  const P = { x: B.x * 0.4, z: B.z * 0.4 };
  const across = { x: -Math.sign(B.z) * 7, z: Math.sign(B.x) * 7 };
  h.ctx.commands.run(`army rifle 3 6 ${P.x} ${P.z}`);
  h.run(0.2);
  const theirs = () => { const u = units(); const o: number[] = []; for (let i = 0; i < u.length; i += 8) if (u[i + 2] === 6 && u[i + 1] === RIFLE && Math.hypot(u[i + 3] - P.x, u[i + 4] - P.z) < 15) o.push(u[i + 5]); return o; };
  const seen = new Set<number>();
  { const u = units(); for (let i = 0; i < u.length; i += 8) seen.add(u[i]); }
  h.ctx.commands.run(`army rifle 3 ${me} ${P.x - across.x * 3} ${P.z - across.z * 3}`);
  h.run(0.2);
  const mine: number[] = [];
  { const u = units(); for (let i = 0; i < u.length; i += 8) if (u[i + 2] === me && u[i + 1] === RIFLE && !seen.has(u[i])) mine.push(u[i]); }
  send('move', { ids: mine, x: P.x + across.x * 3, z: P.z + across.z * 3 });
  // (Watched as it goes: theirs may be out of sight by the end.)
  let low = 100;
  for (let t = 0; t < 8; t += 0.5) {
    h.run(0.5);
    for (const v of theirs()) low = Math.min(low, v);
  }
  check(mine.length === 3 && low < 100, `errands: shot at on the way past, they fight back (the enemy's riflemen down to ${low}%)`);
}
