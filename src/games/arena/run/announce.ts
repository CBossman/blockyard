import type { GameContext, Player } from '@platform';
import type { ArenaPart } from '../part';
import { Sprite } from '../art';
import { bossKind } from '../bosses';
import { bus, type RunResult } from './bus';
import { CLASSES } from './classes';
import { finalWave, monstersAlive, TWISTS, type Twist } from './director';
import { record } from './progression';
import { state } from './state';

/**
 * The run told on the platform's plain HUD, from the bus alone: the countdown and the waves
 * (banners, the objective line, the kills and time), a boss coming in, the Crowd's Favour, going
 * down and coming back, levels reached, and the result at the end (a screen each, with Keep
 * fighting after a victory, which goes back on the bus as `keepFighting`). The flow
 * (`server.ts`, `director.ts`) shows nothing itself, so a richer HUD (`hud/`) can say all of this
 * its own way in this part's place.
 */

/** The result screens up (Keep fighting, on any of them, takes them all down). */
const screens: (() => void)[] = [];
/** The last wave won was the run's last: nobody's told they're back in a fight that's over. */
let won = false;

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** A fighter's lines on their result screen. */
function statsFor(game: GameContext, r: RunResult | undefined, time: number): [string, string][] {
  const stats: [string, string][] = [
    ['Wave reached', state.wave > finalWave() ? `${state.wave} (endless)` : `${state.wave} of ${finalWave()}`],
    ['Time', fmtTime(time)],
  ];
  if (!r) return stats;
  const best = record(game);
  stats.push(
    ['Class', CLASSES[r.cls as keyof typeof CLASSES]?.name ?? r.cls],
    ['Monsters slain', game.players.length > 1 ? `${r.kills} of ${state.kills}` : String(r.kills)],
    ['Gold earned', String(r.gold)],
    ['XP', r.xp.level > r.xp.from ? `+${r.xp.earned} · level ${r.xp.from} → ${r.xp.level}` : `+${r.xp.earned} · level ${r.xp.level}`],
    ['Best wave here', r.newBest ? `${r.best} · new best!` : String(r.best)],
  );
  if (r.revives) stats.push(['Friends revived', String(r.revives)]);
  if (best) stats.push(['Arena record', `${best.wave} · ${best.names.slice(0, 3).join(', ')}`]);
  return stats;
}

const closeScreens = () => {
  for (const close of screens.splice(0)) close();
};

function result(game: GameContext, p: Player, e: { won: boolean; wave: number; endless: boolean; time: number; results: RunResult[]; name: string }) {
  const stats = statsFor(game, e.results.find((r) => r.player === p), e.time);
  const who = game.players.length > 1 ? 'Your party' : 'You';
  if (e.won) {
    return p.hud.screen({
      title: 'Victory!',
      subtitle: `You survived all ${finalWave()} waves and slew ${e.name}. Keep fighting for a best, or start again.`,
      tone: 'victory',
      icon: Sprite.golden_trophy,
      stats,
      buttons: [
        { label: 'Keep fighting', primary: true, onClick: () => bus.emit('keepFighting', { player: p }) },
        { label: 'Play again', onClick: () => game.restart() },
        { label: 'Switch game', onClick: () => game.exit() },
      ],
    });
  }
  return p.hud.screen({
    title: e.endless ? 'The Arena Claims You' : 'Defeated',
    subtitle: `${who} fell on ${e.endless ? 'endless ' : ''}wave ${e.wave}: ${e.name}.`,
    tone: e.endless ? 'neutral' : 'defeat',
    stats,
    buttons: [
      { label: 'Try again', primary: true, onClick: () => game.restart() },
      { label: 'Switch game', onClick: () => game.exit() },
    ],
  });
}

export const announcePart: ArenaPart = {
  name: 'announce',
  setup(game) {
    /** Each wave's name, as its start said it (for the end screens). */
    const names = new Map<number, string>();
    bus.on('runStart', ({ map: m }) => game.hud.banner('ARENA', `${m.name} · survive ${finalWave()} waves`, { duration: 2.8, color: '#ffb36b' }));
    bus.on('waveStart', ({ wave, name, twist, boss, final, endless }) => {
      names.set(wave, name);
      const t = twist ? TWISTS[twist as Twist] : undefined;
      const color = (boss && bossKind(boss)?.color) ?? (final ? '#c9a2ff' : t?.color);
      game.hud.banner(final ? 'Final Wave' : endless ? `Endless · Wave ${wave}` : `Wave ${wave}`, t ? `${name} · ${t.name}!` : name, { duration: 2.6, color });
      if (t) game.clock.after(2.8, () => state.wave === wave && state.phase === 'fighting' && game.hud.banner(t.name, t.text, { duration: 2.4, color: t.color }));
      game.audio.play('wave');
    });
    bus.on('spawned', ({ type }) => {
      const boss = bossKind(type);
      if (boss) game.hud.banner(boss.name, boss.title, { duration: 3, color: boss.color });
    });
    bus.on('waveCleared', ({ final, bonus }) => {
      won = final;
      if (final) return;
      game.hud.banner('Wave cleared!', `+${bonus} gold each · the merchant is open`, { duration: 2.4, color: '#9dff8a' });
      game.audio.play('victory', { volume: 0.5 });
    });
    bus.on('feat', ({ player, name }) => {
      if (name === 'favour') game.hud.banner("THE CROWD'S FAVOUR", 'Double gold · the emperor sends gifts', { duration: 2.8, color: '#ffd23a' });
      if (name === 'phoenix' && player) player.hud.banner('REBORN', 'The Phoenix Feather burns away', { duration: 2.2, color: '#ffb347' });
    });
    bus.on('downed', ({ player }) => game.hud.feed(`${player.name} is down!`, { color: '#ff6b6b' }));
    bus.on('revived', ({ player, by }) => {
      if (!by) return;
      player.hud.banner('REVIVED', `${by.name} pulled you up`, { duration: 1.8, color: '#9dff8a' });
      game.hud.feed(`${by.name} revived ${player.name}`, { color: '#9dff8a' });
    });
    bus.on('fell', ({ player }) => {
      player.hud.banner('YOU FELL', "You'll be back when this wave is cleared", { duration: 3, color: '#ff6b6b' });
      game.hud.feed(`${player.name} has fallen`, { color: '#ff8a4c' });
    });
    bus.on('rejoined', ({ player }) => {
      if (won) return;
      player.hud.banner('BACK IN THE FIGHT', undefined, { duration: 1.6, color: '#9dff8a' });
      player.audio.play('heal');
    });
    bus.on('levelUp', ({ player, level, unlocks }) => {
      player.hud.pop(`LEVEL ${level}`, { big: true, color: '#ffd23a', sub: unlocks.length ? `Unlocked: ${unlocks.map((u) => u.name).join(', ')}` : undefined });
      game.hud.feed([{ text: player.name, color: '#ffd23a' }, ` reached level ${level}`]);
    });
    bus.on('runEnd', (e) => {
      const name = names.get(e.wave) ?? `Wave ${e.wave}`;
      if (e.won) {
        game.hud.banner('VICTORY', 'The arena is yours', { duration: 3.5, color: '#ffd36b' });
        game.audio.play('victory');
      } else game.audio.play('defeat');
      game.clock.after(e.won ? 3.2 : 1.6, () => {
        if (state.phase !== (e.won ? 'victory' : 'defeat')) return;
        for (const p of game.players) screens.push(result(game, p, { ...e, name }));
      });
    });
    bus.on('ready', ({ player, ready, of }) => {
      if (of > 1) game.hud.feed(`${player.name} is ready (${ready}/${of})`, { color: '#9dff8a' });
      if (ready === of) game.hud.banner('Ready', 'Here they come', { duration: 1.4, color: '#9dff8a' });
    });
    bus.on('keepFighting', () => {
      closeScreens();
      game.hud.banner('ENDLESS', 'How far can you go?', { duration: 2.6, color: '#c9a2ff' });
    });
    game.events.on('playerJoin', ({ player }) => {
      if (state.phase !== 'fighting' && state.phase !== 'intermission') return;
      player.hud.banner('ARENA', state.phase === 'fighting' ? `Joining wave ${state.wave}` : `Survive ${finalWave()} waves`, { duration: 2.4, color: '#ffb36b' });
      game.hud.feed(`${player.name} joins the fight`, { color: '#ffb36b' });
    });
  },
  start() {
    screens.length = 0;
    won = false;
  },
  // The objective line (the countdown, the wave and what's left of it, the break), its beeps, the kills and the time.
  update(game) {
    const now = game.clock.now;
    if (state.phase === 'countdown' || state.phase === 'intermission') {
      const t = Math.ceil(state.nextWaveAt - now);
      if (state.phase === 'countdown') game.hud.objective(t > 3 ? `Choose your class · the first wave in ${t}s` : `The first wave in ${t}…`);
      else game.hud.objective(`Next wave in ${t}s · the merchant's open · B: your blessing · N: ready`);
      if (t <= 3 && t > 0 && t !== state.lastBeep) {
        state.lastBeep = t;
        game.audio.play('countdown');
      }
    } else if (state.phase === 'fighting') {
      const left = monstersAlive(game) + state.queue.length;
      game.hud.objective(`${state.endless ? `Endless wave ${state.wave}` : `Wave ${state.wave}/${finalWave()}`} · ${left} ${left === 1 ? 'enemy' : 'enemies'} left`);
    } else if (state.phase === 'victory' || state.phase === 'defeat') game.hud.objective(null);
    if (state.phase === 'intro' || state.phase === 'waiting') return;
    game.hud.stat('kills', 'Kills', state.kills);
    game.hud.stat('time', 'Time', fmtTime(Math.max(0, now - state.startedAt)));
  },
};
