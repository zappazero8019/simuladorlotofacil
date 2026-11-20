import { PRIZE_TIERS } from '../core/constants.js';
import { countCombinations, countCombinationsByTier } from '../core/combinatorics.js';
import { validateBet, validateDraw } from '../core/validation.js';

/** Quantidade de números sorteados presentes na aposta (0 a 15). */
export function countMatches(bet, draw) {
  const validBet = validateBet(bet);
  const validDraw = validateDraw(draw);
  const drawn = new Set(validDraw);
  return validBet.filter((number) => drawn.has(number)).length;
}

/** Conferência de uma aposta simples (exatamente 15 números). */
export function checkSimpleCombination(combination, draw) {
  validateDraw(combination);
  const matches = countMatches(combination, draw);
  return { matches, tier: matches >= 11 ? matches : null };
}

/**
 * Conferência completa de uma aposta de 15 a 20 números.
 * Cada aposta simples é avaliada separadamente para as faixas de 11 a 15.
 */
export function checkBet(bet, draw) {
  const validBet = validateBet(bet);
  const validDraw = validateDraw(draw);
  const drawn = new Set(validDraw);
  const matches = validBet.filter((number) => drawn.has(number)).length;
  const prizes = countCombinationsByTier(validBet.length, matches, PRIZE_TIERS);
  const winningCombinations = PRIZE_TIERS.reduce(
    (sum, tier) => sum + prizes[tier],
    0,
  );
  const bestTier = [...PRIZE_TIERS].reverse().find((tier) => prizes[tier] > 0) ?? null;

  return {
    numbers: validBet,
    drawnNumbers: validDraw,
    matches,
    maxMatches: matches,
    totalCombinations: countCombinations(validBet.length),
    prizes,
    winningCombinations,
    isWinner: winningCombinations > 0,
    bestTier,
  };
}
