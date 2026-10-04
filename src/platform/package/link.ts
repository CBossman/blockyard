// How a built game (see ./build.ts) meets the platform that runs it: the packager turns each
// `@platform…` import into a read of `globalThis.__blockyard.modules`, which the server's room
// (host/packaged.ts) and the player's screen (client/packaged.ts) fill before importing it.
// Nothing here imports anything but types (no bundler, no Node): the packager, the server (its
// rooms' threads too) and screens all use it.
import type { GameMeta } from '../api/types';

/** Why a folder can't be built: its problems, one per line (see ./build.ts). */
export class BuildError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
  }
}

/** Ids are a URL's path segment and a file name: lowercase letters, digits and dashes. */
export const GAME_ID = /^[a-z][a-z0-9-]{1,31}$/;

/** The global the platform hands built games its modules through. */
export const GLOBAL = '__blockyard';

/** The public API a game's server side may import (shared code included). */
export const SERVER_MODULES = ['@platform', '@platform/art', '@platform/kits', '@platform/items'] as const;
/** The public API a game's client side may import (shared code included). */
export const CLIENT_MODULES = ['@platform', '@platform/art', '@platform/items', '@platform/client', '@platform/client/kits', '@platform/client/math'] as const;

/** The public API a game's client Web Workers may import (no screen there). */
export const WORKER_MODULES = ['@platform', '@platform/art', '@platform/items', '@platform/client/math'] as const;

export type PlatformModule = (typeof SERVER_MODULES)[number] | (typeof CLIENT_MODULES)[number];

/** What `globalThis.__blockyard` holds while built games load and run. */
export interface PlatformLink {
  /** The public API by import name. */
  modules: Partial<Record<PlatformModule, unknown>>;
  /** A file of a game's (`assets/rifle-1a2b3c4d.glb`) by the address the server serves it at. */
  asset(game: string, path: string): string;
  /**
   * Start one of a game's client Web Workers (`workers/<name>.js` by its absolute address): the
   * packager turns `new Worker(new URL('./x.ts', import.meta.url), options)` into this. The worker
   * gets the public API too. Screens only.
   */
  worker?(url: string, options?: WorkerOptions): Worker;
}

/** A built version's manifest (`game.json`). */
export interface PackageManifest {
  id: string;
  /** The hash of what was built (its code and its files' names). */
  version: string;
  title: string;
  /** When it was built (ISO time). */
  built: string;
  /** The platform modules each side imports: a screen loads those before the game. */
  modules: { server: PlatformModule[]; client: PlatformModule[] };
  /** Its client's Web Workers, in `<version>/workers/`. */
  workers: string[];
  /** Its files, in `<id>/assets/`. */
  assets: string[];
}

/**
 * A native `import()`, never a bundler's or a dev server's: a built game must run as plain Node
 * runs it (Vite's loader would quietly give it `import.meta.env`, say). Node only.
 */
export function nativeImport(url: string): Promise<unknown> {
  importer ??= new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;
  return importer(url);
}
let importer: ((url: string) => Promise<unknown>) | undefined;

/** Where a game server serves a built game: its manifest and code by version, its files by name. */
export const packagePath = {
  /** The game: its meta, current version and client code's address (JSON). */
  entry: (id: string) => `/g/${id}`,
  version: (id: string, version: string, file: 'client.js' | 'server.js' | 'game.json') => `/g/${id}/${version}/${file}`,
  asset: (id: string, path: string) => `/g/${id}/${path}`,
};

/** What `GET /g/<id>` answers: enough for a screen to list the game and load it. */
export interface PackageEntry {
  id: string;
  version: string;
  /** The game's meta, as the server has it. */
  meta: GameMeta;
  /** The platform modules its client code imports. */
  modules: PlatformModule[];
  /** Its client code's address (absolute). */
  client: string;
}

/** A game as its owners' page shows it (`GET /g/mine`). */
export interface MyGame {
  id: string;
  title: string;
  accent?: string;
  cover?: string;
  listed: boolean;
  /** The version new rooms run (null: not hosted). */
  current: string | null;
  created: string;
  owners: { id: string; name: string }[];
  /** Newest first. */
  versions: { version: string; built: string; by: string; title: string }[];
  /** Its link on the site. */
  play: string | null;
  /**
   * Its current version stopped passing its smoke test after an update to the platform: not listed
   * or played until it passes again (or a new version is uploaded). When, and what went wrong.
   */
  broken: { at: string; errors: string[] } | null;
}

/** What `GET /g/mine` answers. */
export interface MyGames {
  uploader: boolean;
  account: { id: string; name: string } | null;
  games: MyGame[];
}
