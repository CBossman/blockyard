import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { WebSocket } from 'ws';
import { Accounts } from '../../src/platform/host/accounts';
import { serve } from '../../src/platform/host/server';
import { MemoryStore } from '../../src/platform/host/store';
import { decode, encode } from '../../src/platform/net/codec';
import { FrameReader } from '../../src/platform/net/delta';
import type { ClientCommand, ServerWelcome, WireBatch } from '../../src/platform/net/protocol';
import type { SimFrame } from '../../src/platform/sim/sim';
import { check, games } from './_harness';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SITE = 'https://blockyard.example';
const LOCAL = 'http://localhost:5173';

async function until(what: string, ok: () => boolean, ms = 10000) {
  for (const t0 = Date.now(); !ok(); await wait(20)) if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`);
}

/** A socket from a page at `origin`, with `cookie`, pressing Play as `name` (at once, or on `play()` if `hold`). */
function player(port: number, name: string, origin: string, cookie?: string, hold = false) {
  const ws = new WebSocket(`ws://localhost:${port}/heart-hunt`, { origin, headers: cookie ? { Cookie: cookie } : {} });
  const frames = new FrameReader<SimFrame>();
  let frame: SimFrame | null = null;
  let closed: { code: number; reason: string } | null = null;
  let welcomed = false;
  const play = () => ws.send(encode({ t: 'start', name } satisfies ClientCommand));
  ws.on('message', (data) => {
    const m = decode<ServerWelcome | WireBatch>(String(data));
    if ('t' in m && m.t === 'welcome') {
      welcomed = true;
      if (!hold) play();
    }
    else if ((m as WireBatch).f !== undefined) frame = frames.read((m as WireBatch).f);
  });
  ws.on('close', (code, reason) => (closed = { code, reason: String(reason) }));
  return {
    play,
    welcomed: () => welcomed,
    names: () => (frame as SimFrame | null)?.players.map((p) => p.name) ?? [],
    get closed() {
      return closed;
    },
    close: () => ws.close(),
  };
}

/**
 * Accounts on a game server: signing in with Discord (Discord's side stood in for), sessions in a
 * cookie, `/me` for the site's pages only, playing as the account's name over the WebSocket
 * (only from the site), guests kept off account names, renaming, signing out, and deleting an
 * account with what the game kept for it.
 */
export default async function accounts() {
  const accounts = Accounts.open(':memory:');
  const store = new MemoryStore();
  const logs: string[] = [];
  // Discord, stood in for: its token and who the user is.
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('https://discord.com/')) return realFetch(input, init);
    asked.push(url);
    if (url.endsWith('/api/oauth2/token')) {
      const body = new URLSearchParams(String(init?.body));
      if (body.get('code') !== 'good-code') return new Response('bad code', { status: 400 });
      return Response.json({ access_token: 'discord-token', token_type: 'Bearer' });
    }
    if (url.endsWith('/api/users/@me')) return Response.json({ id: '80351110224678912', username: 'nelly', global_name: 'Nelly', avatar: '8342729096ea3675442027381ff50dfe' });
    return new Response('?', { status: 404 });
  }) as typeof fetch;
  const srv = await serve({
    games: games.filter((g) => g.id === 'heart-hunt'),
    port: 0,
    seed: 1,
    wasm: readFileSync('engine/pkg/voxel_engine_bg.wasm'),
    store: () => store,
    accounts,
    discord: { id: 'app-id', secret: 'app-secret' },
    sites: [SITE],
    dev: true,
    log: (l) => logs.push(l),
  });
  const base = `http://localhost:${srv.port}`;
  const get = (path: string, o: { cookie?: string; origin?: string; method?: string; body?: unknown } = {}) =>
    realFetch(`${base}${path}`, {
      method: o.method ?? 'GET',
      redirect: 'manual',
      headers: { ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.origin ? { Origin: o.origin } : {}), ...(o.body ? { 'Content-Type': 'application/json' } : {}) },
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
  const session = (r: Response) => r.headers.getSetCookie().find((c) => c.startsWith('session='))?.split(';')[0];
  try {
    check((await get('/me', { origin: SITE })).status === 401, 'nobody signed in');

    // Signing in with Discord: off to Discord with our state, back with a code, a session.
    const go = await get(`/auth/discord?back=${encodeURIComponent(`${SITE}/?game=heart-hunt`)}`);
    const to = new URL(go.headers.get('location') ?? '');
    const oauth = go.headers.getSetCookie().find((c) => c.startsWith('oauth='))?.split(';')[0] ?? '';
    check(go.status === 302 && to.origin === 'https://discord.com' && to.searchParams.get('scope') === 'identify' && to.searchParams.get('client_id') === 'app-id', `off to Discord: ${to.href}`);
    check(to.searchParams.get('redirect_uri') === `${base}/auth/discord/callback`, `and back here: ${to.searchParams.get('redirect_uri')}`);
    const state = to.searchParams.get('state')!;
    const forged = await get(`/auth/discord/callback?code=good-code&state=not-ours`, { cookie: oauth });
    check(forged.status === 302 && new URL(forged.headers.get('location')!).searchParams.get('signin') === 'failed' && !session(forged), 'a state not ours: no sign-in');
    const back = await get(`/auth/discord/callback?code=good-code&state=${state}`, { cookie: oauth });
    const nelly = session(back);
    check(back.status === 302 && back.headers.get('location') === `${SITE}/?game=heart-hunt` && !!nelly, `back to the page, signed in: ${back.headers.get('location')}`);
    check(/HttpOnly/.test(back.headers.getSetCookie().join()) && /SameSite=Lax/.test(back.headers.getSetCookie().join()), 'the session cookie is HttpOnly, SameSite=Lax');
    check(asked.length === 2, `Discord asked twice (token, user): ${asked.length}`);
    const me = await get('/me', { cookie: nelly, origin: SITE });
    const meBody = (await me.json()) as { name: string; avatar: string };
    check(me.status === 200 && meBody.name === 'Nelly' && meBody.avatar.includes('8342729096ea3675442027381ff50dfe'), `who's signed in: ${JSON.stringify(meBody)}`);
    check(me.headers.get('access-control-allow-origin') === SITE && me.headers.get('access-control-allow-credentials') === 'true', 'the site may read it');
    const elsewhere = await get('/me', { cookie: nelly, origin: 'https://evil.example' });
    check(elsewhere.status === 401 && elsewhere.headers.get('access-control-allow-origin') === null, 'another site may not');
    check((await get('/me', { cookie: nelly, origin: LOCAL })).status === 200, 'a localhost page may, on a development server');

    // Playing: as the account's name, whatever's typed; a guest can't take it; a page elsewhere
    // doesn't get to be her.
    const n = player(srv.port, 'Mallory', SITE, nelly);
    await until('Nelly in the game', () => n.names().includes('Nelly'));
    const host = srv.host('heart-hunt')!;
    check(host.sim.players.find((p) => p.name === 'Nelly')?.account?.name === 'Nelly', 'she plays as her account');
    const g = player(srv.port, 'nelly', SITE);
    await until('the guest in', () => n.names().includes('nelly (guest)'));
    const e = player(srv.port, 'Eve', 'https://evil.example', nelly);
    await until('Eve in', () => n.names().includes('Eve'));
    check(!host.sim.players.find((p) => p.name === 'Eve')?.account, `from another site, the cookie counts for nothing: ${n.names()}`);
    host.sim.players.find((p) => p.name === 'Nelly')!.api.store.set('hearts', 7);
    const nellyId = accounts.session(nelly!.split('=')[1])!.id;
    check(store.data().get(`$player:${nellyId}:hearts`) === 7, 'her own data is kept by account');

    // Renaming: once a day, and not to a name an account holds.
    // Watching as Nelly, she renames herself on the home page, then presses Play.
    const watching = player(srv.port, 'x', SITE, nelly, true);
    await until('watching', () => watching.welcomed());
    const dev = await get('/auth/dev?name=Zed');
    const zed = session(dev);
    check(dev.status === 200 && !!zed, 'a development sign-in');
    const renamed = await get('/me/name', { cookie: nelly, origin: SITE, method: 'POST', body: { name: 'Nell!' } });
    check(renamed.status === 200 && ((await renamed.json()) as { name: string }).name === 'Nell', 'renamed (cleaned like a typed name)');
    watching.play();
    await until('Nell in, by her new name', () => n.names().includes('Nell'));
    watching.close();
    const taken = await get('/me/name', { cookie: nelly, origin: SITE, method: 'POST', body: { name: 'zed' } });
    check(taken.status === 409, `a name an account holds is taken: ${taken.status}`);
    const again = await get('/me/name', { cookie: nelly, origin: SITE, method: 'POST', body: { name: 'Nellie' } });
    check(again.status === 409 && ((await again.json()) as { error: string }).error.includes('once a day'), 'once a day');
    const pre = await get('/me/name', { origin: SITE, method: 'OPTIONS' });
    check(pre.status === 204 && pre.headers.get('access-control-allow-methods')?.includes('POST') === true, 'the preflight is answered');

    // Signing out ends the session.
    check((await get('/auth/logout', { cookie: nelly, origin: SITE, method: 'POST' })).status === 204, 'signed out');
    check((await get('/me', { cookie: nelly, origin: SITE })).status === 401, 'the session is over');

    // Deleting an account: its connection closes, and the game forgets what it kept for it.
    const z = player(srv.port, 'x', SITE, zed);
    await until('Zed in', () => n.names().includes('Zed'));
    const zedId = accounts.session(zed!.split('=')[1])!.id;
    host.sim.players.find((p) => p.name === 'Zed')!.api.store.set('hearts', 3);
    check(store.data().get(`$player:${zedId}:hearts`) === 3, "Zed's data kept");
    check((await get('/me', { cookie: zed, origin: SITE, method: 'DELETE' })).status === 204, 'deleted');
    await until('his connection closes', () => z.closed?.code === 4003);
    check(store.data().get(`$player:${zedId}:hearts`) === undefined && accounts.get(zedId) === null, 'and everything kept for him is gone');
    check(!accounts.nameHeld('Zed'), 'his name is free again');
    for (const c of [n, g, e]) c.close();
    console.log('  Discord sign-in (stood in for) · sessions · /me for the site only · playing as the account from the site only · guests off account names · renaming · signing out · deleting');
  } catch (err) {
    console.log(logs.slice(-20).join('\n'));
    throw err;
  } finally {
    globalThis.fetch = realFetch;
    await srv.close();
  }
  await inWorker();
}

/** A room in a worker thread (as on a real server) hears who's signed in too. */
async function inWorker() {
  const srv = await serve({
    games: games.filter((g) => g.id === 'heart-hunt'),
    port: 0,
    seed: 1,
    wasm: readFileSync('engine/pkg/voxel_engine_bg.wasm'),
    worker: (workerData) => new Worker(resolve('scripts/room-worker-dev.mjs'), { workerData }),
    accounts: Accounts.open(':memory:'),
    sites: [SITE],
    dev: true,
  });
  try {
    const r = await fetch(`http://localhost:${srv.port}/auth/dev?name=Tess`);
    const cookie = r.headers.getSetCookie()[0].split(';')[0];
    const t = player(srv.port, 'typed', SITE, cookie);
    await until('Tess in, in a worker', () => t.names().includes('Tess'), 20000);
    t.close();
    console.log('  a room in a worker thread plays her as her account');
  } finally {
    await srv.close();
  }
}
