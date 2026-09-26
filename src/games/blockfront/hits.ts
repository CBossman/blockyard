import type { GameContext } from '@platform';

/**
 * Hit confirms: every time someone's hurt by a person (a bolt, a saber, a power, a detonator),
 * their screen hears of it (`bf.hit`: how much it took, a head hit, a kill), and draws its hit
 * marker from that (`client/hits.ts`). Bots have no screen.
 */
export function setupHits(game: GameContext) {
  game.events.on('playerDamage', ({ player, amount, source, headshot }) => {
    if (!source || source === 'world' || source.kind !== 'player' || source === player || source.bot) return;
    game.clients.send(source, 'bf.hit', { n: Math.round(amount), h: !!headshot, k: player.health <= 0 });
  });
}
