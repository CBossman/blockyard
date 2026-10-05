import { h } from './dom';
import type { Earned } from './profile';

/** Who's signed in (`GET /me` on the game server). */
export interface SignedIn {
  id: string;
  name: string;
  avatar: string | null;
}

/** Discord's mark (Simple Icons), for the sign-in button. */
const DISCORD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>';

/**
 * The home page's corner for who you are: "Sign in with Discord" for a guest; your avatar and
 * name, and a menu (sign out, delete the account), once you're signed in. Signing in happens on
 * the game server (its `/auth/discord`, back to this page after); its session cookie is the
 * server's, so this page only ever learns who you are (`/me`), never the session.
 */
export class AccountCorner {
  readonly root = h('div.home-account');
  /** Who's signed in (null: a guest), once `loaded`. */
  me: SignedIn | null = null;
  loaded = false;
  /** Signed in or out, or renamed. */
  onChange: ((me: SignedIn | null) => void) | null = null;
  /** Something to say on the page (signing in failed, say). */
  onSay: ((text: string) => void) | null = null;
  /** "Achievements" in the menu: open the profile. */
  onProfile: (() => void) | null = null;
  /** "Your look" in the menu: open the locker. */
  onLocker: (() => void) | null = null;
  /** "Your games" in the menu (an uploader's): open their games. */
  onGames: (() => void) | null = null;
  /** May upload games to this server (asked once signed in). */
  uploader = false;
  private http: string | null = null;
  private menuOpen = false;

  /**
   * @param typed the name in the name box (a development server signs in as it).
   */
  constructor(private typed: () => string) {
    // A click anywhere else closes the menu.
    document.addEventListener('pointerdown', (e) => {
      if (this.menuOpen && !this.root.contains(e.target as Node)) this.toggleMenu(false);
    });
  }

  /** The game server it asks (its `https://` address), once known. */
  get server(): string | null {
    return this.http;
  }

  /** Ask this game server (its `https://` address) who's signed in: once per server. */
  use(http: string) {
    if (this.http === http) return;
    this.http = http;
    // Back from Discord without signing in: say why, and tidy the address.
    const url = new URL(location.href);
    const outcome = url.searchParams.get('signin');
    if (outcome) {
      url.searchParams.delete('signin');
      history.replaceState(null, '', url);
      this.onSay?.(outcome === 'cancelled' ? 'Signing in was cancelled' : "Signing in didn't work: try again");
    }
    fetch(`${http}/me`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<SignedIn>) : null))
      .catch(() => null)
      .then((me) => {
        if (this.http !== http) return;
        this.me = me;
        this.loaded = true;
        this.render();
        this.onChange?.(me);
        if (me) void this.askUploader(http);
      });
  }

  /** Whether they may upload games here: then "Your games" is in the menu. */
  private async askUploader(http: string) {
    const r = await fetch(`${http}/g/mine`, { credentials: 'include' }).catch(() => null);
    const mine = r?.ok ? ((await r.json()) as { uploader?: boolean; open?: boolean }) : null;
    // (Where anyone may upload, it's there for everyone signed in: it says why if they can't yet.)
    if (this.http !== http || !(mine?.uploader || mine?.open)) return;
    this.uploader = true;
    this.render();
  }

  /** The achievements they've earned in every game (signed in; null for a guest, or if it can't be had). */
  async earned(): Promise<Earned | null> {
    if (!this.me || !this.http) return null;
    try {
      const r = await fetch(`${this.http}/me/achievements`, { credentials: 'include' });
      return r.ok ? ((await r.json()) as { achievements: Earned }).achievements : null;
    } catch {
      return null;
    }
  }

  /** What they wear and own (signed in), or null. */
  async look(): Promise<{ avatar: string | null; wear: string[]; owned: Record<string, string> } | null> {
    if (!this.me || !this.http) return null;
    try {
      const r = await fetch(`${this.http}/me/look`, { credentials: 'include' });
      return r.ok ? ((await r.json()) as { avatar: string | null; wear: string[]; owned: Record<string, string> }) : null;
    } catch {
      return null;
    }
  }

  /** Keep what they wear for their account (signed in): what was kept (what they may wear of it). */
  async saveLook(avatar: string, wear: string[]): Promise<{ avatar: string | null; wear: string[] } | null> {
    if (!this.me || !this.http) return null;
    try {
      const r = await fetch(`${this.http}/me/look`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar, wear }) });
      return r.ok ? ((await r.json()) as { avatar: string | null; wear: string[] }) : null;
    } catch {
      return null;
    }
  }

  /** Take a new name (signed in): the name as kept, or throws with why not. */
  async rename(name: string): Promise<string> {
    const r = await fetch(`${this.http}/me/name`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const body = (await r.json().catch(() => ({}))) as { name?: string; error?: string };
    if (!r.ok || !body.name) throw new Error(body.error ?? "Couldn't change your name");
    this.me = { ...this.me!, name: body.name };
    this.render();
    this.onChange?.(this.me);
    return body.name;
  }

  /** Off to Discord (a development server signs in as the name typed, at once), and back here. */
  signIn() {
    if (!this.http) return;
    const back = encodeURIComponent(location.href);
    location.assign(import.meta.env.DEV ? `${this.http}/auth/dev?name=${encodeURIComponent(this.typed() || 'Tester')}&back=${back}` : `${this.http}/auth/discord?back=${back}`);
  }

  private render() {
    this.toggleMenu(false);
    if (!this.loaded) return this.root.replaceChildren();
    if (!this.me) {
      const button = h('button.home-signin', { onclick: () => this.signIn() });
      button.innerHTML = DISCORD;
      button.append(h('span', {}, 'Sign in', h('span.home-signin-more', {}, ' with Discord')));
      return this.root.replaceChildren(button);
    }
    const me = this.me;
    const face = me.avatar ? h('img.home-avatar', { src: me.avatar, alt: '', referrerpolicy: 'no-referrer' }) : h('span.home-avatar.blank', {}, me.name.slice(0, 1));
    const chip = h('button.home-me', { onclick: () => this.toggleMenu(!this.menuOpen), 'aria-haspopup': 'menu' }, face, h('span.home-me-name', {}, me.name));
    const remove = h('button.home-menu-item.danger', {}, 'Delete my account') as HTMLButtonElement;
    let armed = false;
    remove.onclick = () => {
      // Twice to be sure (no browser dialogs).
      if (!armed) {
        armed = true;
        remove.textContent = 'Click again: this deletes everything kept for you';
        return;
      }
      void fetch(`${this.http}/me`, { method: 'DELETE', credentials: 'include' }).finally(() => location.reload());
    };
    const menu = h(
      'div.home-menu',
      { role: 'menu' },
      h('div.home-menu-head', {}, 'Signed in with Discord'),
      h('button.home-menu-item', { onclick: () => (this.toggleMenu(false), this.onLocker?.()) }, 'Your look'),
      h('button.home-menu-item', { onclick: () => (this.toggleMenu(false), this.onProfile?.()) }, 'Your achievements'),
      this.uploader ? h('button.home-menu-item', { onclick: () => (this.toggleMenu(false), this.onGames?.()) }, 'Your games') : null,
      h('a.home-menu-item', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy'),
      h('button.home-menu-item', { onclick: () => void this.signOut() }, 'Sign out'),
      remove,
    );
    this.root.replaceChildren(chip, menu);
  }

  private toggleMenu(open: boolean) {
    this.menuOpen = open;
    this.root.classList.toggle('open', open);
  }

  private async signOut() {
    await fetch(`${this.http}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    // (The connection open now is theirs: a fresh page plays as a guest.)
    location.reload();
  }
}
