import { h } from './dom';
import type { MyGame, MyGames } from '../package/link';

/** What's never part of a game's folder (as the server's unpacking has it): hidden files, packages, macOS's leftovers. */
const SKIPPED = (path: string) => path.split('/').some((part) => part.startsWith('.') || part === 'node_modules' || part === '__MACOSX');
/** The most an upload may be (the server's `MAX_UPLOAD`). */
const MAX_UPLOAD = 50 * 1024 * 1024;

/** "5 min ago", "yesterday", "12 Sep". */
function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * An uploader's games, over the home page: upload a game's folder (or a zip of it), which the
 * server builds, checks and hosts at once; then, for each of their games, its versions (go back to
 * one), listed on the home page or by link only, its owners, and stopping hosting it. Also an
 * upload token, for `npm run game -- push`. It talks to the game server with the player's sign-in
 * (see host/uploads.ts).
 */
export class MyGamesPanel {
  readonly root = h('div.screen.profile-screen.mygames-screen.hidden', { role: 'dialog', 'aria-label': 'Your games' });
  private panel = h('div.profile-panel.mygames-panel');
  private list = h('div.mygames-list');
  private result = h('div.mygames-result');
  private drop = h('div.mygames-drop');
  private asId = h('input.mygames-id', { type: 'text', placeholder: 'its id (optional)', maxlength: '32', spellcheck: false, autocomplete: 'off' }) as HTMLInputElement;
  private token = h('div.mygames-token');
  private http = '';
  private busy = false;
  private data: MyGames | null = null;
  /** A game's link (`?game=<id>`) was followed: open it here. */
  onOpen: ((id: string) => void) | null = null;

  constructor() {
    const close = h('button.profile-close', { onclick: () => this.close(), 'aria-label': 'Close' }, '×');
    const folder = h('input', { type: 'file', webkitdirectory: true, multiple: true, hidden: true, onchange: () => void this.fromFiles(folder.files) }) as HTMLInputElement;
    const zip = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true, onchange: () => void this.fromFiles(zip.files) }) as HTMLInputElement;
    this.drop.append(
      h('div.mygames-drop-title', {}, "Drop a game's folder here"),
      h('div.mygames-drop-note', {}, 'Or a zip of it. It’s built, checked and hosted in seconds, not listed until you list it.'),
      h(
        'div.mygames-drop-actions',
        {},
        h('button.mygames-button.primary', { onclick: () => (folder.value = '', folder.click()) }, 'Choose a folder'),
        h('button.mygames-button', { onclick: () => (zip.value = '', zip.click()) }, 'Choose a zip'),
        this.asId,
      ),
      folder,
      zip,
    );
    this.drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.drop.classList.add('over');
    });
    this.drop.addEventListener('dragleave', () => this.drop.classList.remove('over'));
    this.drop.addEventListener('drop', (e) => {
      e.preventDefault();
      this.drop.classList.remove('over');
      void this.fromDrop((e as DragEvent).dataTransfer);
    });
    this.panel.append(
      h('header.profile-head', {}, h('div.profile-who', {}, h('div.profile-name', {}, 'Your games'), h('div.profile-sub', {}, 'Games you host on Blockyard, built from their folders: no deploy needed')), close),
      this.drop,
      this.result,
      this.list,
      h('section.mygames-cli', {}, h('div.mygames-section', {}, 'From the command line'), this.token),
    );
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => e.target === this.root && this.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.close();
    });
    this.renderToken();
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** Show it, for the game server at `http` (its web address). */
  show(http: string) {
    this.http = http;
    this.root.classList.remove('hidden');
    void this.refresh();
  }

  close() {
    this.root.classList.add('hidden');
  }

  private async refresh() {
    const r = await fetch(`${this.http}/g/mine`, { credentials: 'include' }).catch(() => null);
    if (!r?.ok) {
      this.list.replaceChildren(h('div.mygames-empty', {}, r?.status === 401 ? 'Sign in to see your games.' : "Couldn't reach the game server."));
      return;
    }
    this.data = (await r.json()) as MyGames;
    this.renderList();
  }

  private renderList() {
    const games = this.data?.games ?? [];
    if (!games.length) {
      this.list.replaceChildren(h('div.mygames-empty', {}, 'No games yet: drop one above.'));
      return;
    }
    this.list.replaceChildren(h('div.mygames-section', {}, games.length === 1 ? 'One game' : `${games.length} games`), ...games.map((g) => this.card(g)));
  }

  private card(g: MyGame): HTMLElement {
    const hosted = g.current !== null;
    const cover = h('span.profile-cover.mygames-cover');
    if (g.cover) cover.style.backgroundImage = `url("${g.cover}")`;
    const state = !hosted ? 'Not hosted' : g.broken ? 'Broken by an update' : g.listed ? 'On the home page' : 'Link only';
    const current = g.versions.find((v) => v.version === g.current);
    const open = h('a.mygames-button', { href: g.play ?? `?game=${g.id}`, onclick: (e: MouseEvent) => (e.preventDefault(), this.close(), this.onOpen?.(g.id)) }, 'Play');
    const list = h('button.mygames-button', { onclick: () => void this.change(g.id, { listed: !g.listed }) }, g.listed ? 'Unlist' : 'List on the home page');
    const host = hosted
      ? h('button.mygames-button.danger', { onclick: () => void this.change(g.id, { current: null }) }, 'Stop hosting')
      : h('button.mygames-button', { onclick: () => void this.change(g.id, { current: g.versions[0]?.version }) }, 'Host the newest version');
    const copy = h('button.mygames-button', {}, 'Copy link') as HTMLButtonElement;
    copy.onclick = () => {
      void navigator.clipboard?.writeText(g.play ?? `${location.origin}/?game=${g.id}`).then(() => {
        copy.textContent = 'Copied';
        window.setTimeout(() => (copy.textContent = 'Copy link'), 1500);
      });
    };
    const versions = h(
      'details.mygames-versions',
      {},
      h('summary', {}, `Versions (${g.versions.length})`),
      ...g.versions.map((v) =>
        h(
          `div.mygames-version${v.version === g.current ? '.current' : ''}`,
          {},
          h('code', {}, v.version),
          h('span.mygames-dim', {}, `${v.title} · ${ago(v.built)} by ${v.by}`),
          v.version === g.current ? h('span.mygames-tag', {}, 'current') : h('button.mygames-button.small', { onclick: () => void this.change(g.id, { current: v.version }) }, 'Make current'),
        ),
      ),
    );
    const owner = h('input.mygames-id', { type: 'text', placeholder: 'a player’s name', maxlength: '20', spellcheck: false }) as HTMLInputElement;
    const owners = h(
      'details.mygames-versions',
      {},
      h('summary', {}, `Owners (${g.owners.length})`),
      ...g.owners.map((o) =>
        h('div.mygames-version', {}, h('span', {}, o.name), g.owners.length > 1 ? h('button.mygames-button.small', { onclick: () => void this.change(g.id, { removeOwner: o.id }) }, 'Remove') : h('span.mygames-dim', {}, 'the only owner')),
      ),
      h(
        'form.mygames-version',
        {
          onsubmit: (e: SubmitEvent) => {
            e.preventDefault();
            if (owner.value.trim()) void this.change(g.id, { addOwner: owner.value.trim() });
          },
        },
        owner,
        h('button.mygames-button.small', { type: 'submit' }, 'Add owner'),
      ),
    );
    return h(
      'article.mygames-game',
      { style: `--game: ${g.accent ?? '#7fd46b'}` },
      h(
        'div.profile-game-head.mygames-head',
        {},
        cover,
        h('div.profile-game-title', {}, g.title),
        h(`span.mygames-state.${!hosted ? 'off' : g.broken ? 'broken' : g.listed ? 'listed' : 'link'}`, {}, state),
        h('div.mygames-sub', {}, h('code', {}, g.id), current ? ` · version ${current.version}, ${ago(current.built)}` : ''),
      ),
      g.broken && hosted ? this.brokenNote(g) : null,
      h('div.mygames-actions', {}, hosted && !g.broken ? open : null, hosted ? copy : null, hosted ? list : null, host),
      versions,
      owners,
    );
  }

  /** A game an update to the platform broke: what went wrong, and checking it again. */
  private brokenNote(g: MyGame): HTMLElement {
    const again = h('button.mygames-button.small', {}, 'Check again') as HTMLButtonElement;
    again.onclick = () => {
      again.disabled = true;
      again.textContent = 'Checking…';
      void this.change(g.id, { recheck: true });
    };
    return h(
      'div.mygames-result.error',
      {},
      h('div', {}, `It stopped passing its smoke test after an update to Blockyard (${ago(g.broken!.at)}), so it isn't played or listed. Upload a fixed version, or check again after the next update.`),
      h('ul.mygames-problems', {}, ...g.broken!.errors.slice(0, 3).map((e) => h('li', {}, e.split('\n').slice(0, 4).join('\n')))),
      h('div.mygames-actions', {}, again),
    );
  }

  /** Change one of their games (`POST /g/<id>/manage`), then show it as it is. */
  private async change(id: string, change: Record<string, unknown>) {
    const r = await fetch(`${this.http}/g/${id}/manage`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) }).catch(() => null);
    const body = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!r?.ok) this.say('error', body?.error ?? "That didn't work");
    else this.result.replaceChildren();
    await this.refresh();
  }

  /** The files chosen: a folder's (zipped here first) or a zip. */
  private async fromFiles(list: FileList | null) {
    const files = [...(list ?? [])];
    if (files.length === 1 && /\.zip$/i.test(files[0].name)) return this.upload(new Uint8Array(await files[0].arrayBuffer()), files[0].name);
    if (!files.length) return;
    const entries: [string, File][] = files.map((f) => [f.webkitRelativePath || f.name, f]);
    await this.uploadFolder(entries, entries[0][0].split('/')[0]);
  }

  /** Something dropped: a folder (read through), or a zip. */
  private async fromDrop(dt: DataTransfer | null) {
    const item = dt?.items?.[0];
    const entry = item?.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      const files: [string, File][] = [];
      await walk(entry as FileSystemDirectoryEntry, entry.name, files);
      return this.uploadFolder(files, entry.name);
    }
    return this.fromFiles(dt?.files ?? null);
  }

  private async uploadFolder(files: [string, File][], name: string) {
    const kept = files.filter(([path]) => !SKIPPED(path));
    if (!kept.length) return this.say('error', 'That folder is empty');
    this.say('busy', `Packing ${name} (${kept.length} files)…`);
    const { zipSync } = await import('fflate');
    const zipped: Record<string, Uint8Array> = {};
    for (const [path, file] of kept) zipped[path] = new Uint8Array(await file.arrayBuffer());
    await this.upload(zipSync(zipped, { level: 6 }), name);
  }

  private async upload(zip: Uint8Array, name: string) {
    if (this.busy) return;
    if (zip.length > MAX_UPLOAD) return this.say('error', `${name} is too big: ${MAX_UPLOAD / 1024 / 1024} MB at most`);
    this.busy = true;
    this.drop.classList.add('busy');
    this.say('busy', `Uploading ${name} (${Math.max(1, Math.round(zip.length / 1024))} KB): building and checking it…`);
    try {
      const id = this.asId.value.trim();
      const r = await fetch(`${this.http}/g${id ? `?id=${encodeURIComponent(id)}` : ''}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/zip' }, body: zip as BodyInit });
      const body = (await r.json().catch(() => ({ error: `${r.status} ${r.statusText}` }))) as { id?: string; version?: string; ms?: number; error?: string; problems?: string[] };
      if (!r.ok) {
        this.say('error', body.error ?? "It couldn't be hosted", body.problems);
        return;
      }
      const play = h('a', { href: `?game=${body.id}`, onclick: (e: MouseEvent) => (e.preventDefault(), this.close(), this.onOpen?.(body.id!)) }, 'Play it');
      this.result.className = 'mygames-result ok';
      this.result.replaceChildren(h('strong', {}, `${body.id} is up`), ` · version ${body.version}, built and checked in ${((body.ms ?? 0) / 1000).toFixed(1)} s · `, play);
      await this.refresh();
    } catch (err) {
      this.say('error', `The upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.busy = false;
      this.drop.classList.remove('busy');
    }
  }

  private say(kind: 'busy' | 'error', text: string, problems?: string[]) {
    this.result.className = `mygames-result ${kind}`;
    this.result.replaceChildren(h('div', {}, text), ...(problems?.length ? [h('ul.mygames-problems', {}, ...problems.map((p) => h('li', {}, p)))] : []));
  }

  private renderToken() {
    const make = h('button.mygames-button', {}, 'Make an upload token') as HTMLButtonElement;
    make.onclick = async () => {
      const r = await fetch(`${this.http}/uploads/token`, { method: 'POST', credentials: 'include' }).catch(() => null);
      const body = (await r?.json().catch(() => ({}))) as { token?: string; error?: string } | undefined;
      if (!r?.ok || !body?.token) {
        this.token.append(h('div.mygames-result.error', {}, body?.error ?? "Couldn't make one"));
        return;
      }
      this.token.replaceChildren(
        h('div.mygames-dim', {}, 'Your token, shown this once. Keep it to yourself; then, in the repo:'),
        h('pre.mygames-pre', {}, `npm run game -- token ${body.token}\nnpm run game -- push src/games/<your game> --server ${this.http}`),
      );
    };
    this.token.replaceChildren(h('div.mygames-dim', {}, 'Push a game from your machine with npm run game -- push. It needs an upload token:'), make);
  }
}

/** A dropped folder's files, read through (each with its path from the folder's own name). */
async function walk(dir: FileSystemDirectoryEntry, path: string, out: [string, File][]) {
  const reader = dir.createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((done, fail) => reader.readEntries(done, fail));
    if (!batch.length) break;
    for (const e of batch) {
      const at = `${path}/${e.name}`;
      if (SKIPPED(at)) continue;
      if (e.isDirectory) await walk(e as FileSystemDirectoryEntry, at, out);
      else out.push([at, await new Promise<File>((done, fail) => (e as FileSystemFileEntry).file(done, fail))]);
    }
  }
}
