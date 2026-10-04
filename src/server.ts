// The game server: hosts the app's games for players who join from the browser.
//
//   npm run server -- [games…] [--port 8787] [--data data] [--seed 1234] [--rooms 8] [--room-size 16] [--new] [--cheats] [--dev]
//                      [--package <folder>]…
//
// Games that aren't compiled in (docs/PROPOSAL-UPLOADS.md) are kept in <data>/games: uploaded
// (`npm run game -- push`, by the accounts in UPLOADERS: their ids or Discord ids, comma-separated;
// on a development server anyone), or built from a folder here with `--package <folder>` (anywhere:
// src/games/<id>, or outside the repo; `--package <folder>=<id>` under another id). They name their
// files by the server's public address (PUBLIC_URL, default http://localhost:<port>).
//
// It reaches the games only through their server registry (src/games/server.ts): their shared
// definitions and rules. No game's client code, and nothing of the browser's, comes in here.
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { devGames, games } from './games/server';
import type { GameDefinition } from './platform/api/types';
import { Accounts } from './platform/host/accounts';
import { GameLibrary, smokeInThread } from './platform/host/library';
import { serve, type ServeOptions } from './platform/host/server';
import { SqliteStore } from './platform/host/sqlite';

/** What only the program that starts the server decides (never a flag a production server reads). */
export interface ServerMode {
  /**
   * Development mode (`npm run dev`, `npm run server -- --dev`): cheats on, the development games
   * hosted when named (`?game=gallery`), and clients' `dev` commands (`__game.dev(js)`) run in
   * their room. Never set by the production entry (src/serve.ts).
   */
  dev?: boolean;
}

/** A game by id (development games too, in development mode): what a room's worker runs. */
export async function findGame(id: string, dev = false): Promise<GameDefinition | undefined> {
  return games.find((g) => g.id === id) ?? (dev ? (await devGames()).find((g) => g.id === id) : undefined);
}

/**
 * `worker`: how to start a room's thread (the production bundle runs itself; the development
 * server, `scripts/room-worker-dev.mjs`). Without it, rooms run in the server's thread, so a game
 * has only its public room.
 */
export async function main(args: string[], worker?: ServeOptions['worker'], mode: ServerMode = {}) {
  const dev = mode.dev ?? false;
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const valued = ['--port', '--seed', '--db', '--data', '--rooms', '--room-size', '--wasm', '--package'];
  const named = args.filter((a, i) => !a.startsWith('--') && !valued.includes(args[i - 1])).flatMap((a) => a.split(','));
  // Named games may include development games (`gallery`), in development mode only.
  const extra = dev ? await devGames() : [];
  const known = [...games, ...extra];
  const defs = named.length ? named.map((id) => known.find((g) => g.id === id) ?? fail(`no game "${id}" (games: ${known.map((g) => g.id).join(', ')})`)) : games;
  // In development, the development games are there too when a client names one (not listed).
  const hidden = extra.filter((g) => !defs.includes(g));
  const port = Number(flag('port') ?? process.env.PORT ?? 8787);
  const seed = flag('seed') === undefined ? undefined : Number(flag('seed')) >>> 0;
  const data = flag('data') ?? process.env.DATA_DIR ?? 'data';
  const cheats = dev || args.includes('--cheats');
  const dbOf = (game: string) => (defs.length === 1 && flag('db')) || join(data, `${game}.sqlite`);
  if (args.includes('--new')) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const d of defs) {
      const db = dbOf(d.id);
      if (!existsSync(db)) continue;
      for (const ext of ['', '-wal', '-shm']) if (existsSync(db + ext)) renameSync(db + ext, `${db}.${stamp}${ext}`);
      console.log(`[${d.id}] the old world is in ${db}.${stamp}`);
    }
  }
  const wasm = readFileSync(flag('wasm') ?? 'engine/pkg/voxel_engine_bg.wasm');
  const publicUrl = (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, '');
  const library = GameLibrary.open({
    root: join(data, 'games'),
    publicUrl,
    taken: (id) => known.some((g) => g.id === id),
    // The packager (and esbuild) load only when something's built.
    build: async (folder, out, id) => (await import('./platform/package/build')).buildGame(folder, { out, id, dev }),
    smoke: worker ? smokeInThread(worker, wasm, publicUrl) : async (dir) => (await import('./platform/host/packaged')).smokeTest(dir, wasm, { publicUrl }),
    log: (line) => console.log(line),
  });
  for (const spec of args.flatMap((a, i) => (args[i - 1] === '--package' ? [a] : []))) {
    const [folder, id] = spec.split('=');
    const built = await library.install(folder, 'local', id);
    if (!built.ok) fail(`--package ${folder}: can't host it:\n${built.problems.map((p) => `  ${p}`).join('\n')}`);
    console.log(`[${built.id}] built ${folder} as version ${built.version}: ?game=${built.id}`);
  }
  const server = await serve({
    games: defs,
    hidden,
    library,
    uploaders: (process.env.UPLOADERS ?? '').split(',').map((u) => u.trim()).filter(Boolean),
    port,
    seed,
    wasm,
    cheats,
    dev,
    worker,
    store: (game) => SqliteStore.open(dbOf(game), game),
    storeFile: dbOf,
    // A room (a world, in a thread of its own) takes 30 to 50 MB: 8 fit a 512 MB machine. Its size
    // (players and those watching; a full public game overflows into another copy) defaults to 16.
    limits: { rooms: Number(flag('rooms') ?? process.env.ROOMS ?? 8), ...(flag('room-size') ?? process.env.ROOM_SIZE ? { playersPerGame: Number(flag('room-size') ?? process.env.ROOM_SIZE) } : {}) },
    accounts: Accounts.open(join(data, 'accounts.sqlite')),
    discord: process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET ? { id: process.env.DISCORD_CLIENT_ID, secret: process.env.DISCORD_CLIENT_SECRET } : null,
    sites: (process.env.SITE_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    log: (line) => console.log(line),
  });
  const how = dev ? ' (development mode: cheats, development games, __game.dev)' : cheats ? ' (cheats on)' : '';
  console.log(`serving ${defs.map((d) => d.id).join(', ')} on port ${server.port}${how}; kept in ${defs.length === 1 && flag('db') ? flag('db') : `${data}/`}`);
  if (!dev) for (const d of defs) console.log(`  ${d.id.padEnd(12)} http://localhost:5173/?server=ws://localhost:${server.port}&game=${d.id}`);
  return server;
}

function fail(message: string): never {
  throw new Error(message);
}
