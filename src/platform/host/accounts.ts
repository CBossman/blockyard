import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** A player's Blockyard account, as the server knows it (games get `PlayerAccount`: no Discord id). */
export interface Account {
  id: string;
  /** Their Discord user id (`dev:<name>` for a development server's made-up accounts). */
  discord: string;
  /** Unique on the platform, ignoring case. */
  name: string;
  /** Their Discord avatar's URL, or null. */
  avatar: string | null;
}

/** What Discord says of a user (`GET /users/@me`, scope `identify`). */
export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

const SETUP = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    discord TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    avatar TEXT,
    created TEXT NOT NULL DEFAULT (datetime('now')),
    seen TEXT NOT NULL DEFAULT (datetime('now')),
    renamed TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY,
    account TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    expires INTEGER NOT NULL,
    created TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS sessions_account ON sessions (account);
`;

/** How long a sign-in lasts (seconds). */
export const SESSION_SECONDS = 90 * 24 * 3600;
/** How often a name can be changed (seconds). */
const RENAME_EVERY = 24 * 3600;

/** A name as players may have one: letters, digits, spaces, `_ . -`; 20 at most (what `start` allows). */
export function cleanName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * The server's accounts (Sign in with Discord): who they are, their unique names, and their
 * sessions. One SQLite file (`accounts.sqlite`), kept by the server's main thread; rooms hear who's
 * who from it when players connect. A session is a random token in the player's cookie; only its
 * hash is kept.
 */
export class Accounts {
  private db: DatabaseSync;

  private constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(SETUP);
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  static open(path: string): Accounts {
    return new Accounts(path);
  }

  /** Signed in with Discord: their account (made the first time, with a name of their own), its avatar kept up to date. */
  fromDiscord(user: DiscordUser): Account {
    const avatar = avatarUrl(user);
    const found = this.db.prepare('SELECT id FROM accounts WHERE discord = ?').get(user.id) as { id: string } | undefined;
    if (found) {
      this.db.prepare(`UPDATE accounts SET avatar = ?, seen = datetime('now') WHERE id = ?`).run(avatar, found.id);
      return this.get(found.id)!;
    }
    const name = this.freeName(cleanName(user.global_name || user.username) || 'Player');
    const id = randomBytes(9).toString('base64url');
    this.db.prepare('INSERT INTO accounts (id, discord, name, name_key, avatar) VALUES (?, ?, ?, ?, ?)').run(id, user.id, name, name.toLowerCase(), avatar);
    return this.get(id)!;
  }

  get(id: string): Account | null {
    const row = this.db.prepare('SELECT id, discord, name, avatar FROM accounts WHERE id = ?').get(id) as Account | undefined;
    return row ? { ...row } : null;
  }

  /** `name`, or with a number after it (`Pat 2`) if an account has it: one no account has. */
  private freeName(name: string): string {
    if (!this.nameHeld(name)) return name;
    for (let n = 2; ; n++) {
      const tail = ` ${n}`;
      const next = name.slice(0, 20 - tail.length) + tail;
      if (!this.nameHeld(next)) return next;
    }
  }

  /** Whether an account has this name (ignoring case). */
  nameHeld(name: string, except?: string): boolean {
    const row = this.db.prepare('SELECT id FROM accounts WHERE name_key = ?').get(name.toLowerCase()) as { id: string } | undefined;
    return !!row && row.id !== except;
  }

  /** Change an account's name (once a day; unique; the same cleaning as a typed one): the new name, or why not. */
  rename(id: string, raw: string): { name: string } | { error: string } {
    const name = cleanName(raw);
    const row = this.db.prepare(`SELECT name, renamed FROM accounts WHERE id = ?`).get(id) as { name: string; renamed: string | null } | undefined;
    if (!row) return { error: 'No such account' };
    if (!name) return { error: 'Names need a letter or number' };
    if (name === row.name) return { name };
    if (this.nameHeld(name, id)) return { error: `${name} is taken` };
    // (Only changing case is always fine.)
    const since = row.renamed ? (Date.now() - Date.parse(`${row.renamed}Z`)) / 1000 : Infinity;
    if (name.toLowerCase() !== row.name.toLowerCase() && since < RENAME_EVERY) return { error: 'Names can be changed once a day' };
    this.db.prepare(`UPDATE accounts SET name = ?, name_key = ?, renamed = datetime('now') WHERE id = ?`).run(name, name.toLowerCase(), id);
    return { name };
  }

  /** A new session for an account: the token for the player's cookie. */
  startSession(account: string): string {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions (hash, account, expires) VALUES (?, ?, ?)').run(hash(token), account, Math.floor(Date.now() / 1000) + SESSION_SECONDS);
    return token;
  }

  /** Who a session token is (null: unknown or expired). */
  session(token: string | undefined): Account | null {
    if (!token) return null;
    const row = this.db.prepare('SELECT account, expires FROM sessions WHERE hash = ?').get(hash(token)) as { account: string; expires: number } | undefined;
    if (!row) return null;
    if (row.expires < Date.now() / 1000) {
      this.endSession(token);
      return null;
    }
    return this.get(row.account);
  }

  endSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash(token));
  }

  /** Gone: the account and its sessions (the games' data for it is the server's to clear). */
  delete(id: string) {
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }

  close() {
    this.db.close();
  }
}

/** A Discord user's avatar (their own, or Discord's default for them). */
function avatarUrl(u: DiscordUser): string {
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`;
  let n = 0;
  try {
    n = Number((BigInt(u.id) >> 22n) % 6n);
  } catch {
    // (A made-up id: the first default.)
  }
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
}
