import { PRIZE_TIERS } from '../core/constants.js';
import { checkBet } from '../prizes/index.js';
import { getPrizeValueCents } from '../prizes/prizeValues.js';
import { distributePoolPrize } from './pool.js';

/**
 * Conferência de uma aposta contra um resultado já sorteado.
 * Toda a contagem de acertos/combinações vem de `checkBet`; aqui apenas
 * aplicamos os valores de referência e, se houver bolão, dividimos o prêmio.
 */
export function conferenceBet(bet, draw, options = {}) {
  const check = checkBet(bet.numbers ?? bet, draw);
  const prizeValues = options.prizeValues ?? {};
  const prizeByTier = {};
  let totalPrizeCents = 0;

  for (const tier of PRIZE_TIERS) {
    const count = check.prizes[tier] ?? 0;
    const unitCents = getPrizeValueCents(tier, prizeValues);
    const subtotalCents = count * unitCents;
    prizeByTier[tier] = { count, unitCents, subtotalCents };
    totalPrizeCents += subtotalCents;
  }

  const conference = {
    betId: bet.id ?? null,
    contest: options.contest ?? 1,
    numbers: check.numbers,
    drawnNumbers: check.drawnNumbers,
    matches: check.matches,
    totalCombinations: check.totalCombinations,
    winningCombinations: check.winningCombinations,
    bestTier: check.bestTier,
    prizeByTier,
    totalPrizeCents,
  };

  if (bet.pool) {
    conference.poolDistribution = distributePoolPrize(bet.pool, totalPrizeCents);
  }
  return conference;
}

/** Conferência de várias apostas contra o mesmo resultado. */
export function conferenceAll(bets, draw, options = {}) {
  return bets.map((bet, index) => conferenceBet(
    bet,
    draw,
    { contest: 1, ...options, betIndex: index },
  ));
}
