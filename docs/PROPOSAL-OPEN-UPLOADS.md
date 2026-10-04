# Proposal: open uploads (anyone may upload a game)

Status: **stage 1 built** (2026-10-04; see "Stage 1: what was built"); stages 2 to 4 to come. Follows `PROPOSAL-UPLOADS.md`, which built
uploads for trusted people only.

## Why it's not open yet

An uploaded game runs with the platform's own power, which is fine only while every uploader is
trusted:

- **On the server**, its room's worker thread reaches everything the server process can: the
  Discord client secret in the environment, `accounts.sqlite` and every game's data on the volume,
  the network, other programs. A room that loops forever holds a core and a room slot until the
  server restarts (nothing stops it).
- **While it's built**, the packager ran the game's `meta.ts` in the server's main thread.
- **In players' browsers**, its client code runs on blockyard.gg as the signed-in player: it can
  call `DELETE /me`, rename them, mint an upload token as them, manage their games, or draw a fake
  sign-in.

## Decisions (the owner's, 2026-10-04)

1. **A second Fly machine for the sandbox: yes.**
2. **The home page is approval only.** Everything else that's hosted can be found in a **community
   directory** (a page of its own).
3. **Admin tooling on the site, for the owner's Discord id only** (`ADMINS`).

## The design

### Visibility

A hosted game is one of:

| | Who finds it | Who decides |
|---|---|---|
| **Link only** | whoever has its link | its owners (the default for a new game) |
| **In the directory** | anyone, on the community directory | its owners |
| **On the home page** | everyone, on the shelf | an admin approves an owner's request |

Approval is for the game, not a version: an approved game's new versions stay on the home page
(its owners have been trusted once); an admin can take it off again.

### Admin tooling (stage 1)

`ADMINS` (Discord or account ids; on Fly: the owner's) see an **Admin** tab in Your games:

- every uploaded game: its owners, state, versions, reports; **approve or decline** a request for
  the home page, **take one off** the home page or the directory, **stop hosting** any game;
- **reports** from players (a "Report this game" on an uploaded game's page), to resolve;
- **bans**: a banned account can't upload or manage games (and their games can be unhosted);
- **recent activity**: uploads, refusals and changes, newest first.

An admin may manage any game as its owners can.

### The server sandbox (stage 2)

Uploaded games' rooms (and their smoke tests) run on a **sandbox machine** with no secrets and no
volume: a process per room, as an unprivileged user under Node's permission model (it reads its own
code only, starts no programs), its outbound network firewalled. The main server keeps the sockets,
accounts and data, and relays each room's messages (the room boundary is already messages only).
A room's `game.store` becomes a copy loaded when it starts and saved back through the relay. The
main server's games stay where they are.

### The browser sandbox (stage 3)

An uploaded game's screen runs in an iframe on another domain (`blockyard-usercontent.com`, a
subdomain per game), sandboxed (no navigating the page, no popups; a content security policy that
lets it reach only the game server). blockyard.gg keeps the home page, the account and sign-in.
The game connects with a **room ticket** the page asks the server for (playing that game only),
never the sign-in cookie. This means splitting today's single page (runtime, home page and pause
menu together, games switching in place) into a shell and a game frame talking by `postMessage`:
the biggest job here.

### Opening up (stage 4)

Any signed-in Discord account may upload, within **quotas** (games, versions and storage per
account; uploads per hour; a build queue a flood can't block) and a **pool of rooms** of its own
for uploaded games, so they never crowd out the built-in ones. Plus terms of service and a
takedown route.

## Plan

1. **Admin, visibility and reports; the quick fixes**: `ADMINS`; link only / directory / home page
   with approval; the community directory page; reports; bans; activity; a watchdog for rooms that
   stop responding (every room); no game code in the main thread while building (its id is read
   from `meta.ts` as text).
2. **The sandbox machine** and the relay.
3. **The browser sandbox**: shell and game frame, room tickets.
4. **Open uploads**: quotas, the room pool, terms.

## Stage 1: what was built

- **Visibility**: `listed` now means "in the community directory"; `home` (asked, approved,
  declined) gates the home page. `/games` lists only approved games; `GET /g/directory` lists
  those in the directory and not on the home page. Owners put a game in the directory and ask for
  the home page from Your games; the directory is the shelf's last card ("Community games") and
  `?directory`.
- **Admin** (`ADMINS`; on Fly the owner's Discord id): an Admin tab in Your games with requests
  for the home page (approve, decline), reports (resolve, stop hosting), every game (take it off
  the home page or out of the directory, stop hosting, host the newest), bans by name (optionally
  stopping their games; an admin can't be banned) and the last activity (`<data>/games/
  activity.jsonl`). Admins may manage any game.
- **Reports**: "Report this game" under an uploaded game on the home page, for players signed in
  or not (five per address per ten minutes), kept in `accounts.sqlite`.
- **Bans** in `accounts.sqlite`: a banned account may neither upload nor manage.
- **The watchdog**: a room's thread says it's alive every 2 s; one quiet for 30 s (or not started
  in 2 minutes) is terminated and its players told "The game stopped responding". Every room.
- **No game code in the main thread while building**: meta.ts's id and title are read as text.
- **Development rooms' threads no longer start a Vite of their own**: they run Vite's module
  runner, compiled by the starting thread's Vite over a message channel (`scripts/dev-worker.mjs`).
  Terminating a thread holding Vite's native bundler aborted the whole process (found testing the
  watchdog); a bare `room-worker-dev.mjs` still starts its own.

