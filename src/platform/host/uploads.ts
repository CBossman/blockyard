// The game server's routes for games that aren't compiled into it (see host/library.ts):
//
//   GET    /g/<id>                         what a screen loads (`PackageEntry`): the current version
//   GET    /g/<id>/<version>/client.js     a kept version's client code (and its .map, game.json, workers/)
//   GET    /g/<id>/assets/<file>           its files
//   POST   /g[?id=<id>]                    upload a zip of a game's folder: built, smoke-tested, made current
//   GET    /g/mine                         the games one may manage, and whether one may upload
//   GET    /g/<id>/manage                  its record (owners only)
//   POST   /g/<id>/manage                  `{ current?, listed?, addOwner?, removeOwner?, recheck? }` (owners only)
//   DELETE /g/<id>                         stop hosting it (its files and record stay)
//   GET    /uploads                        a page for making an upload token (for `npm run game -- push`)
//   POST   /uploads/token                  a new upload token
//
// Who's asking: an upload token (`Authorization: Bearer byu_…`), else the signed-in account (a page
// on the site, or this server's own). Who may upload: the accounts on the server's list of
// uploaders (UPLOADERS: their ids or Discord ids); on a development server, anyone. Never a built
// game's server code.
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { packagePath, type MyGame, type MyGames, type PackageEntry } from '../package/link';
import type { Account, Accounts } from './accounts';
import type { Auth } from './auth';
import type { GameLibrary, GameRecord } from './library';

export interface UploadsOptions {
  library: GameLibrary;
  accounts?: Accounts;
  auth?: Auth | null;
  /** Accounts that may upload: their ids or Discord ids. */
  uploaders: string[];
  /** The site's addresses: where a game's link points (the first), and the pages that may manage games. */
  sites: string[];
  /** A development server: anyone may upload and manage (a guest as `dev`). */
  dev: boolean;
  log?(line: string): void;
}

/** The biggest upload (a zip). */
export const MAX_UPLOAD = 50 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const VERSION = /^[0-9a-f]{12}$/;

export class Uploads {
  private readonly own: string;

  constructor(private o: UploadsOptions) {
    this.own = new URL(o.library.publicUrl).origin;
  }

  /** Answer a `/g…` or `/uploads…` request: true if it was one. */
  handle(req: IncomingMessage, res: ServerResponse, path: string): boolean {
    if (path !== '/g' && !path.startsWith('/g/') && path !== '/uploads' && path !== '/uploads/token') return false;
    const method = req.method ?? 'GET';
    // The site's pages ask with the player's sign-in (their games, uploads, changes).
    this.cors(req, res);
    if (method !== 'GET' && method !== 'HEAD') {
      if (method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' }).end();
        return true;
      }
    }
    void this.route(req, res, path, method).catch((err: unknown) => {
      this.o.log?.(`[uploads] ${method} ${path} failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      if (!res.headersSent) this.json(res, 500, { error: 'Something went wrong on the server' });
    });
    return true;
  }

  private async route(req: IncomingMessage, res: ServerResponse, path: string, method: string) {
    if (path === '/uploads') return method === 'GET' ? this.tokenPage(res) : this.json(res, 405, { error: 'GET it' });
    if (path === '/uploads/token') return method === 'POST' ? this.newToken(req, res) : this.json(res, 405, { error: 'POST it' });
    if (path === '/g') return method === 'POST' ? this.upload(req, res, new URL(req.url ?? '/', 'http://server').searchParams.get('id') ?? undefined) : this.json(res, 405, { error: 'POST a zip' });
    if (path === '/g/mine') return method === 'GET' ? this.mine(req, res) : this.json(res, 405, { error: 'GET it' });
    const parts = path.split('/').slice(2);
    const id = parts[0];
    if (parts.length === 1 && method === 'DELETE') return this.manage(req, res, id, { current: null });
    if (parts.length === 2 && parts[1] === 'manage') {
      if (method === 'GET') return this.manage(req, res, id, null);
      if (method === 'POST') {
        const body = await readBody(req, 64 * 1024);
        let change: Change;
        try {
          change = JSON.parse(body?.toString() ?? '') as Change;
        } catch {
          return this.json(res, 400, { error: 'Send JSON: { current?, listed?, addOwner?, removeOwner? }' });
        }
        return this.manage(req, res, id, change);
      }
    }
    if (method === 'GET' || method === 'HEAD') return this.serve(res, parts);
    this.json(res, 405, { error: 'Not here' });
  }

  /** A screen's view of a game: what to load, then its code by version and its files. Never its server code. */
  private async serve(res: ServerResponse, parts: string[]) {
    const lib = this.o.library;
    const [id] = parts;
    const missing = () => res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    if (parts.length === 1) {
      const v = lib.current(id);
      if (!v) return missing();
      const spec = lib.spec(v);
      const entry: PackageEntry = { id, version: v.version, meta: { ...v.meta, id }, modules: spec.modules, client: spec.client };
      return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }).end(JSON.stringify(entry));
    }
    if (!lib.record(id)) return missing();
    const file =
      parts.length === 3 && parts[1] === 'assets' && /^[\w.-]+$/.test(parts[2]) && !parts[2].startsWith('.')
        ? join(lib.folder(id), 'assets', parts[2])
        : VERSION.test(parts[1]) && lib.version(id, parts[1])
          ? parts.length === 3 && ['client.js', 'client.js.map', 'game.json'].includes(parts[2])
            ? join(lib.folder(id), parts[1], parts[2])
            : parts.length === 4 && parts[2] === 'workers' && /^[\w-]+\.js(\.map)?$/.test(parts[3])
              ? join(lib.folder(id), parts[1], 'workers', parts[3])
              : null
          : null;
    if (!file) return missing();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' }).end(body);
    } catch {
      missing();
    }
  }

  private async upload(req: IncomingMessage, res: ServerResponse, asId: string | undefined) {
    const who = this.who(req);
    if (!who) return this.json(res, 401, { error: req.headers.authorization ? 'That upload token is unknown or revoked' : 'Sign in, or send an upload token (Authorization: Bearer …)' });
    if (!this.mayUpload(who)) return this.json(res, 403, { error: `${who.account?.name ?? who.by} isn't one of this server's uploaders` });
    const zip = await readBody(req, MAX_UPLOAD);
    if (!zip) return this.json(res, 413, { error: `Too big: ${MAX_UPLOAD / 1024 / 1024} MB at most` });
    if (!zip.length) return this.json(res, 400, { error: "Send the zip of a game's folder as the body" });
    const t0 = performance.now();
    const result = await this.o.library.upload(new Uint8Array(zip.buffer, zip.byteOffset, zip.length), who.by, asId);
    if (!result.ok) {
      this.o.log?.(`[uploads] ${who.account?.name ?? who.by}'s upload refused (${result.status}): ${result.problems[0]}`);
      return this.json(res, result.status, { error: "Your game can't be hosted", problems: result.problems });
    }
    const play = this.o.sites[0] ? `${this.o.sites[0]}/?game=${result.id}` : null;
    this.json(res, 201, { id: result.id, version: result.version, summary: result.summary, ms: Math.round(performance.now() - t0), listed: result.record.listed, play });
  }

  /** A game's record (`change` null), or a change to it: its owners only. */
  private manage(req: IncomingMessage, res: ServerResponse, id: string, change: Change | null) {
    const lib = this.o.library;
    const who = this.who(req);
    if (!who) return this.json(res, 401, { error: 'Sign in, or send an upload token' });
    const record = lib.record(id);
    if (!record) return this.json(res, 404, { error: `No game "${id}" here` });
    if (!this.o.dev && !record.owners.includes(who.by)) return this.json(res, 403, { error: `"${id}" isn't yours` });
    if (change?.recheck) {
      // Smoke-test its current version again now (after a fix to the platform, say).
      void lib.recheck({ force: true, only: id }).then(() => this.json(res, 200, { record: lib.record(id), broken: lib.broken(id) }));
      return;
    }
    if (change) {
      const problems: string[] = [];
      if (change.current !== undefined && !lib.setCurrent(id, change.current)) problems.push(`no version "${change.current}"`);
      if (change.listed !== undefined && !lib.setListed(id, !!change.listed)) problems.push('not listed');
      if (change.addOwner) {
        // By account id or by name.
        const owner = this.o.accounts?.get(change.addOwner) ?? this.o.accounts?.byName(change.addOwner);
        if (!owner) problems.push(`no account "${change.addOwner}"`);
        else if (!lib.setOwner(id, owner.id, true)) problems.push(`can't add ${owner.name}`);
      }
      if (change.removeOwner && !lib.setOwner(id, change.removeOwner, false)) problems.push(`can't remove ${change.removeOwner} (a game keeps an owner)`);
      if (problems.length) return this.json(res, 400, { error: problems.join('; '), record: lib.record(id) });
      this.o.log?.(`[uploads] ${id}: ${JSON.stringify(change)} by ${who.account?.name ?? who.by}`);
    }
    this.json(res, 200, { record: lib.record(id) satisfies GameRecord | undefined, entry: packagePath.entry(id) });
  }

  /** The games one may manage (all of them on a development server), and whether one may upload. */
  private mine(req: IncomingMessage, res: ServerResponse) {
    const who = this.who(req);
    if (!who) return this.json(res, 401, { error: 'Sign in first' });
    const lib = this.o.library;
    const name = (id: string) => (id === 'local' ? 'this server' : id === 'dev' ? 'a guest' : (this.o.accounts?.get(id)?.name ?? 'someone gone'));
    const games: MyGame[] = lib
      .records()
      .filter((r) => this.o.dev || r.owners.includes(who.by))
      .map((r) => {
        const latest = r.versions[r.versions.length - 1];
        const shown = r.versions.find((v) => v.version === r.current)?.meta ?? latest?.meta;
        return {
          id: r.id,
          title: shown?.title ?? r.id,
          accent: shown?.accent,
          cover: shown?.cover,
          listed: r.listed,
          current: r.current,
          created: r.created,
          owners: r.owners.map((id) => ({ id, name: name(id) })),
          versions: [...r.versions].reverse().map((v) => ({ version: v.version, built: v.built, by: name(v.by), title: v.meta.title })),
          play: this.o.sites[0] ? `${this.o.sites[0]}/?game=${r.id}` : null,
          broken: ((b) => (b ? { at: b.at, errors: b.errors ?? [] } : null))(lib.broken(r.id)),
        };
      })
      .sort((a, b) => (b.versions[0]?.built ?? '').localeCompare(a.versions[0]?.built ?? ''));
    this.json(res, 200, { uploader: this.mayUpload(who), account: who.account ? { id: who.account.id, name: who.account.name } : null, games } satisfies MyGames);
  }

  private newToken(req: IncomingMessage, res: ServerResponse) {
    const account = this.o.auth?.who(req, this.own) ?? null;
    if (!account || !this.o.accounts) return this.json(res, 401, { error: 'Sign in first' });
    if (!this.mayUpload({ by: account.id, account })) return this.json(res, 403, { error: `${account.name} isn't one of this server's uploaders (their account id: ${account.id})` });
    const token = this.o.accounts.newUploadToken(account.id);
    this.o.log?.(`[uploads] an upload token for ${account.name}`);
    this.json(res, 200, { token, account: { id: account.id, name: account.name } });
  }

  /** A page of the server's own for making an upload token (the site gets a proper one later). */
  private tokenPage(res: ServerResponse) {
    const signIn = this.o.dev ? '/auth/dev?name=Tester' : `/auth/discord?back=${encodeURIComponent(this.o.sites[0] ?? '')}`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(TOKEN_PAGE.replace('{{signIn}}', signIn));
  }

  /** Who's asking: an upload token's account, the signed-in account, or (a development server) a guest. */
  private who(req: IncomingMessage): { by: string; account: Account | null } | null {
    const bearer = /^Bearer\s+(\S+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (bearer) {
      const account = this.o.accounts?.uploadToken(bearer) ?? null;
      return account ? { by: account.id, account } : null;
    }
    const account = this.o.auth?.who(req, this.own) ?? null;
    if (account) return { by: account.id, account };
    return this.o.dev ? { by: 'dev', account: null } : null;
  }

  private mayUpload(who: { by: string; account: Account | null }): boolean {
    if (this.o.dev) return true;
    return !!who.account && (this.o.uploaders.includes(who.account.id) || this.o.uploaders.includes(who.account.discord));
  }

  /** The site's pages (and this server's own) may manage games with the player's sign-in. */
  private cors(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && (this.o.auth?.allowed(origin) || origin === this.own)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  private json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  }
}

/** What an owner may change of a game (`POST /g/<id>/manage`). */
interface Change {
  /** The version new rooms run (null: stop hosting it). */
  current?: string | null;
  listed?: boolean;
  addOwner?: string;
  removeOwner?: string;
  /** Smoke-test its current version again now. */
  recheck?: boolean;
}

/** A request's body, or null if it's longer than `limit`. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((done, fail) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > limit) {
      req.resume();
      return done(null);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (c: Buffer) => {
      if (over) return;
      size += c.length;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => done(over ? null : Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

const TOKEN_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload token</title>
<style>
  :root { color-scheme: dark; --bg: #14161b; --panel: #1e2129; --text: #e9ebf0; --dim: #9aa1ad; --accent: #ffd36b; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; padding: 16px; box-sizing: border-box; }
  main { background: var(--panel); border-radius: 12px; padding: 28px; max-width: 560px; width: 100%; box-sizing: border-box; }
  h1 { margin: 0 0 8px; font-size: 22px; } p { color: var(--dim); margin: 8px 0 16px; }
  button { background: var(--accent); color: #111; border: 0; border-radius: 8px; padding: 10px 18px; font: inherit; font-weight: 600; cursor: pointer; }
  code, pre { background: #0d0f13; border-radius: 6px; padding: 2px 6px; font-size: 14px; }
  pre { padding: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  a { color: var(--accent); } .error { color: #ff7a7a; }
</style></head>
<body><main>
  <h1>Upload games from the command line</h1>
  <p>An upload token lets <code>npm run game -- push</code> upload games as you. It lasts until revoked: keep it to yourself.</p>
  <button id="make">Make a token</button>
  <div id="out"></div>
</main>
<script>
  const out = document.getElementById('out');
  document.getElementById('make').onclick = async () => {
    const res = await fetch('/uploads/token', { method: 'POST', credentials: 'same-origin' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) { out.innerHTML = '<p>Sign in first: <a href="{{signIn}}">sign in</a>, then come back here.</p>'; return; }
    if (!res.ok) { out.innerHTML = '<p class="error"></p>'; out.firstChild.textContent = body.error || 'That failed'; return; }
    out.innerHTML = '<p>Your token, shown this once (as ' + body.account.name.replace(/[<>&]/g, '') + '):</p><pre></pre><p>Then, in the repo:</p><pre></pre>';
    const pres = out.querySelectorAll('pre');
    pres[0].textContent = body.token;
    pres[1].textContent = 'npm run game -- token ' + body.token + '\\nnpm run game -- push src/games/<your game> --server ' + location.origin;
  };
</script>
</body></html>`;
