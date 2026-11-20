/** Constantes das regras oficiais da Lotofácil (CAIXA). */
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 25;
export const MIN_BET_SIZE = 15;
export const MAX_BET_SIZE = 20;
export const DRAW_SIZE = 15;

/** Faixas premiadas, em ordem crescente de acertos. */
export const PRIZE_TIERS = Object.freeze([11, 12, 13, 14, 15]);

/** Universo de números sorteados (1 a 25). */
export const UNIVERSE = Object.freeze(
  Array.from({ length: MAX_NUMBER }, (_, index) => index + 1),
);
