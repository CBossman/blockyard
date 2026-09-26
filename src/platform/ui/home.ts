import { h } from './dom';
import { AccountCorner } from './account';
import { Profile, tally, type Earned } from './profile';
import { hintChips, keyHints, type GameControls } from './controls';

/** Playing on a game server: the home page asks for a name, and says who's on. */
export interface OnlineOptions {
  /** The server (`wss://host`), to ask how many are playing each game. */
  server: string;
  /** The game on show. */
  game: string;
  /** In a room a player started of their own: its code (else the public game). */
  room: string | null;
  /** A game with rooms of players' own: start one (`true`), or go back to the public game. */
  onRoom?: (own: boolean) => void;
}

/** A game in the list: its meta (`GameMeta`), all the home page knows of it. */
interface ListedGame {
  id: string;
  title: string;
  tagline?: string;
  accent?: string;
  cover?: string;
  achievements?: Record<string, { title: string; description: string; hidden?: boolean }>;
}

/** Blockyard's mark: a grass block, drawn isometric. */
export const MARK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="#6fd35c" d="M8 1l6 3.5L8 8 2 4.5z"/><path fill="#7a5530" d="M2 4.5L8 8v7l-6-3.5z"/><path fill="#9b6c3e" d="M14 4.5L8 8v7l6-3.5z"/><path fill="#57b247" d="M2 4.5L8 8v1.6L2 6.1z"/><path fill="#62c051" d="M14 4.5L8 8v1.6l6-3.5z"/></svg>';

/** How many of the game's control hints the home page shows before "more". */
const HINTS = 6;

/** What the home page shows for one game (and does when played or another game is picked). */
export interface HomeGame extends GameControls {
  current: string;
  /** Its name (for a game not in the list: a development preview). */
  title?: string;
  onPlay: () => void;
  onPick: (id: string) => void;
  online?: OnlineOptions | null;
}

/** A card on the shelf: the game's picture and name, and how many are playing it. */
interface Card {
  el: HTMLButtonElement;
  live: HTMLElement;
}

/**
 * The home page, shown while the world loads and until the player clicks Play. The game on show
 * fills the page (its world, slowly circling, behind everything; its cover, blurred, until the
 * world is in): its name and pitch large on the left, the name to play under and one button that
 * fills as the world loads and then starts the game, and a shelf of every game along the bottom
 * (with how many are playing each). It outlives a game: picking another switches in place
 * (`select`, then `show` for the new game), with the page staying put.
 */
export class TitleScreen {
  readonly root: HTMLElement;
  private nameInput: HTMLInputElement;
  private cover: HTMLElement;
  private kicker: HTMLElement;
  private heading: HTMLElement;
  private tagline: HTMLElement;
  private status: HTMLElement;
  private actions: HTMLElement;
  private rooms: HTMLElement;
  private hints: HTMLElement;
  private shelf: HTMLElement;
  private online: HTMLElement;
  /** Who you are: sign in, or your account. */
  private account: AccountCorner;
  /** For a guest: what's kept, and a way to sign in. */
  private guest: HTMLElement;
  /** The game on show's achievements (how many, how many earned): opens the profile. */
  private feats: HTMLElement;
  private profile: Profile;
  /** What the player has earned, as last asked (null: a guest, or not asked yet). */
  private earned: Earned | null = null;
  private fill: HTMLElement;
  private label: HTMLElement;
  private button: HTMLButtonElement;
  private cards = new Map<string, Card>();
  private ready = false;
  private title = 'the game';
  private poll = 0;
  private game: HomeGame | null = null;
  /** Who's in the room on show (a room of a player's own), as last said. */
  private here: string | null = null;

  constructor(
    parent: HTMLElement,
    private games: ListedGame[],
  ) {
    const mark = h('span.home-mark');
    mark.innerHTML = MARK;
    this.cover = h('div.home-cover');
    this.kicker = h('div.home-kicker');
    this.heading = h('h1.home-title');
    this.tagline = h('p.home-tagline');
    this.status = h('div.home-status');
    this.fill = h('span.home-play-fill');
    this.label = h('span.home-play-label', {}, 'Starting the engine…');
    this.button = h('button.home-play', { disabled: true, onclick: () => void this.play() }, this.fill, this.label) as HTMLButtonElement;
    this.nameInput = this.makeName();
    this.nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.play();
    });
    this.nameInput.addEventListener('input', () => this.status.classList.remove('error'));
    this.account = new AccountCorner(() => this.nameInput.value.trim());
    this.account.onSay = (text) => this.setStatus(text);
    this.account.onChange = (me) => {
      if (me) this.nameInput.value = me.name;
      this.guest.classList.toggle('hidden', !!me || !this.game?.online);
      void this.refreshEarned();
    };
    this.profile = new Profile(games);
    this.profile.onSignIn = () => this.account.signIn();
    this.account.onProfile = () => this.openProfile();
    this.feats = h('button.home-feats.hidden', { onclick: () => this.openProfile(this.game?.current) });
    const signIn = h('button.home-guest-signin', { onclick: () => this.account.signIn() }, 'Sign in with Discord');
    this.guest = h('div.home-guest.hidden', {}, 'Playing as a guest: what you earn lasts this visit. ', signIn, ' to keep it.');
    this.actions = h('div.home-actions', {}, h('label.home-name', {}, h('span', {}, 'Playing as'), this.nameInput), this.button);
    this.rooms = h('div.home-rooms');
    this.hints = h('div.home-hints');
    this.shelf = h('nav.home-shelf', { 'aria-label': 'Games' });
    this.online = h('div.home-online');
    this.root = h(
      'div.screen.title-screen.home',
      {},
      this.cover,
      h('div.home-scrim'),
      h('header.home-top', {}, h('div.home-brand', {}, mark, h('span.home-logo', {}, 'Blockyard'), h('span.home-pitch', {}, 'Block games anyone can build, played together')), h('div.home-top-right', {}, this.online, this.account.root)),
      h('main.home-hero', {}, this.kicker, this.heading, this.tagline, this.feats, this.status, this.actions, this.guest, this.rooms, this.hints),
      this.shelf,
      this.profile.root,
    );
    // The mouse wheel runs the shelf sideways, when there are more games than fit.
    this.shelf.addEventListener('wheel', (e) => {
      if (this.shelf.scrollWidth <= this.shelf.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      this.shelf.scrollLeft += e.deltaY;
    }, { passive: false });
    this.renderShelf();
    parent.append(this.root);
  }

  /** Show the page for a game: it's the selected one, loading until `setReady`. */
  show(g: HomeGame) {
    this.game = g;
    this.feature(g.current, g.title);
    this.actions.querySelector('.home-name')?.classList.toggle('hidden', !g.online);
    if (g.online) this.account.use(g.online.server.replace(/^ws/, 'http').replace(/\/+$/, ''));
    // (Back from a game: what was earned there.)
    void this.refreshEarned();
    this.guest.classList.toggle('hidden', !g.online || !this.account.loaded || !!this.account.me);
    this.renderRooms(g.online ?? null);
    this.renderHints(g);
    this.here = null;
    window.clearInterval(this.poll);
    if (g.online) this.watchCounts(g.online);
  }

  /** Ask again what the player has earned (signed in), and show it. */
  private async refreshEarned() {
    this.earned = await this.account.earned();
    if (this.game) this.renderFeats(this.game.current);
  }

  /** The line under the game's name: its achievements, and how many are earned. */
  private renderFeats(id: string) {
    const g = this.games.find((x) => x.id === id);
    const { have, all } = g ? tally(g, this.earned) : { have: 0, all: 0 };
    this.feats.classList.toggle('hidden', !all);
    if (!all) return;
    this.feats.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.4A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.4 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1 1.7V7zm10 0v2.7A2 2 0 0 0 18 8V7h-1zM6 20h12v2H6v-2z"/></svg>';
    this.feats.append(h('span', {}, this.account.me ? `${have} of ${all} achievements` : `${all} achievements to earn`));
  }

  private openProfile(game?: string) {
    this.profile.show(this.account.me, this.earned, game);
    void this.refreshEarned().then(() => this.profile.open && this.profile.show(this.account.me, this.earned, game));
  }

  /** Picked another game: show it chosen at once, while the switch happens behind. */
  select(id: string) {
    this.feature(id);
    this.rooms.replaceChildren();
    this.hints.replaceChildren();
  }

  /** The game on show, loading: its name, pitch, colour and cover, and its card picked on the shelf. */
  private feature(id: string, title?: string) {
    const entry = this.games.find((x) => x.id === id);
    this.title = entry?.title ?? title ?? 'the game';
    this.root.style.setProperty('--game', entry?.accent ?? '#7fd46b');
    this.root.classList.remove('hidden', 'ready');
    this.ready = false;
    this.cover.style.backgroundImage = entry?.cover ? `url("${entry.cover}")` : '';
    this.heading.textContent = this.title;
    this.tagline.textContent = entry?.tagline ?? '';
    this.renderFeats(id);
    this.kicker.replaceChildren();
    this.status.replaceChildren();
    this.status.classList.remove('error');
    for (const [gid, card] of this.cards) {
      const on = gid === id;
      card.el.classList.toggle('current', on);
      if (on) card.el.setAttribute('aria-current', 'true');
      else card.el.removeAttribute('aria-current');
    }
    const card = this.cards.get(id)?.el;
    if (card) this.reveal(card);
    this.loading(`Loading ${this.title}…`);
  }

  /** Scroll the shelf (only the shelf: never the page) so a card is in full view. */
  private reveal(card: HTMLElement) {
    const s = this.shelf;
    const margin = parseFloat(getComputedStyle(s).paddingLeft) || 0;
    const left = card.offsetLeft - margin;
    const right = card.offsetLeft + card.offsetWidth + margin - s.clientWidth;
    if (s.scrollLeft > left) s.scrollLeft = left;
    else if (s.scrollLeft < right) s.scrollLeft = right;
  }

  private renderShelf() {
    this.cards.clear();
    if (this.games.length < 2) return this.shelf.replaceChildren();
    this.shelf.replaceChildren(
      ...this.games.map((x) => {
        const live = h('span.home-card-live');
        const art = h('span.home-card-art');
        if (x.cover) art.style.backgroundImage = `url("${x.cover}")`;
        else art.classList.add('blank');
        const el = h(
          'button.home-card',
          { style: `--game: ${x.accent ?? '#7fd46b'}`, title: x.tagline ?? x.title, onclick: () => x.id !== this.game?.current && this.game?.onPick(x.id) },
          art,
          live,
          h('span.home-card-name', {}, x.title),
        ) as HTMLButtonElement;
        this.cards.set(x.id, { el, live });
        return el;
      }),
    );
  }

  /**
   * The choice of room, under Play: in the public game, a game of one's own instead; in one's
   * own, its invite link and the way back.
   */
  private renderRooms(online: OnlineOptions | null) {
    this.rooms.replaceChildren();
    if (!online?.onRoom) return;
    const onRoom = online.onRoom;
    if (!online.room) {
      this.rooms.append(
        h('button.home-alt', { onclick: () => onRoom(true) }, h('span.home-alt-title', {}, 'Start a private game'), h('span.home-alt-note', {}, 'Just you and the bots, or friends you send the link to')),
      );
      return;
    }
    this.kicker.replaceChildren(h('span.home-room-tag', {}, 'Private game'));
    const copy = h('button.home-alt.compact', {}, 'Copy invite link') as HTMLButtonElement;
    copy.onclick = () => copyInvite((text) => {
      copy.textContent = text;
      window.setTimeout(() => (copy.textContent = 'Copy invite link'), 2000);
    });
    this.rooms.append(copy, h('button.home-alt.compact', { onclick: () => onRoom(false) }, 'Back to the public game'));
  }

  /** The controls in a line: the first few, and the rest on asking. */
  private renderHints(g: HomeGame) {
    const keys = keyHints(g);
    const shown = hintChips(keys.slice(0, HINTS));
    const rest = hintChips(keys.slice(HINTS));
    for (const r of rest) r.classList.add('extra');
    const more = rest.length
      ? h('button.home-more', {
          onclick: () => {
            const open = this.hints.classList.toggle('open');
            more!.textContent = open ? 'Fewer' : `+${rest.length} more`;
          },
        }, `+${rest.length} more`)
      : null;
    this.hints.classList.remove('open');
    this.hints.replaceChildren(
      h('div.hint-line.keys-only', {}, ...shown, ...rest, more),
      h('div.hint-line.pad-only', {}, ...hintChips(g.pad ?? [])),
    );
  }

  /**
   * Play (the button, or Enter in the name box): signed in with a new name typed, that's saved
   * first (and if it can't be, why not is said instead).
   */
  private async play() {
    if (!this.ready || !this.game) return;
    const me = this.account.me;
    const typed = this.nameInput.value.trim();
    if (me && typed && typed !== me.name) {
      try {
        this.nameInput.value = await this.account.rename(typed);
      } catch (err) {
        this.status.classList.add('error');
        this.setStatus(err instanceof Error ? err.message : String(err));
        this.nameInput.focus();
        return;
      }
    }
    this.game.onPlay();
  }

  /** Who's in the room on show (a room of a player's own). */
  present(names: string[]) {
    const here = names.join(', ');
    if (here === this.here) return;
    this.here = here;
    this.setStatus(names.length ? `Here now: ${here}` : 'Nobody here yet: send friends the link to play together', names.length > 0);
  }

  private setStatus(text: string, live = false) {
    this.status.replaceChildren(...(live ? [h('span.live-dot')] : []), text);
  }

  private loading(text: string) {
    this.button.disabled = true;
    this.fill.style.width = '0%';
    this.label.textContent = text;
  }

  /** How many are playing each game (online), kept fresh while the page is up. */
  private watchCounts(online: OnlineOptions) {
    const http = online.server.replace(/^ws/, 'http').replace(/\/+$/, '');
    const load = () =>
      fetch(`${http}/games`)
        .then((r) => r.json() as Promise<{ games: { id: string; players: number }[] }>)
        .then(({ games }) => {
          let total = 0;
          for (const g of games) {
            total += g.players;
            const card = this.cards.get(g.id);
            if (!card) continue;
            card.live.textContent = g.players ? String(g.players) : '';
            card.live.classList.toggle('on', g.players > 0);
          }
          this.online.replaceChildren(...(total ? [h('span.live-dot'), `${total} playing now`] : []));
          // (In a room of one's own, `present` says who's in it; a problem stays said.)
          if (online.room || this.status.classList.contains('error')) return;
          const here = games.find((g) => g.id === online.game)?.players ?? 0;
          this.setStatus(here ? `${here} ${here === 1 ? 'player' : 'players'} in this game now` : 'Nobody in this game yet: you could be first', here > 0);
        })
        .catch(() => {});
    void load();
    this.poll = window.setInterval(load, 5000);
  }

  private makeName(): HTMLInputElement {
    let saved = '';
    try {
      saved = localStorage.getItem('voxel.name') ?? '';
    } catch {
      // no storage: no remembered name
    }
    return h('input.home-name-input', { type: 'text', maxlength: '20', placeholder: 'Pick a name', value: saved, spellcheck: false, autocomplete: 'nickname' }) as HTMLInputElement;
  }

  /** The name typed (remembered for next time), online. */
  name(): string {
    const n = this.nameInput.value.trim().slice(0, 20) || 'Player';
    try {
      localStorage.setItem('voxel.name', n);
    } catch {
      // not remembered
    }
    return n;
  }

  progress(fraction: number, text: string) {
    if (this.ready) return;
    this.fill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
    this.label.textContent = text;
  }

  setReady() {
    if (this.ready) return;
    this.ready = true;
    this.button.disabled = false;
    this.fill.style.width = '100%';
    this.label.textContent = 'Play';
    this.root.classList.add('ready');
  }

  /** The game couldn't start (say, its server is down): say so; another can still be picked. */
  failed(text: string, onPick: (id: string) => void) {
    // Any game may be picked again, this one included (its public game).
    this.game = { current: '', onPlay: () => {}, onPick };
    this.label.textContent = `Couldn't load ${this.title}`;
    this.status.classList.add('error');
    this.setStatus(text);
  }

  /** Playing: the page fades away (it comes back with `show`). */
  hide() {
    window.clearInterval(this.poll);
    this.root.classList.add('hidden');
  }
}

/** Copy the link to this game (and room) for a friend: `said` gets what to show on the button. */
export function copyInvite(said: (text: string) => void) {
  const link = new URL(location.href);
  for (const p of ['server', 'name', 'seed']) link.searchParams.delete(p);
  const done = navigator.clipboard?.writeText(link.href).then(
    () => said('Link copied'),
    () => said(link.href),
  );
  if (!done) said(link.href);
}
