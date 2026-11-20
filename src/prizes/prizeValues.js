import { PRIZE_TIERS } from '../core/constants.js';

/**
 * Valores monetários usados apenas na simulação.
 *
 * Justificativa documentada (Fase 3):
 * - 11, 12 e 13 acertos têm valores FIXOS oficiais da CAIXA: R$ 7,00,
 *   R$ 14,00 e R$ 35,00.
 * - 14 e 15 acertos dependem do rateio de cada concurso. Como este simulador
 *   não consulta a CAIXA, adota-se valores de REFERÊNCIA centralizados e
 *   identificados como fictícios. A fonte consultada em 20/11/2026 registrou
 *   R$ 1.896,35 para 14 acertos; para 15 acertos usa-se uma estimativa
 *   plausível de R$ 500.000,00. Nenhuma probabilidade ou regra oficial é
 *   alterada por essa escolha — apenas a apresentação do "valor recebido".
 */
export const FIXED_PRIZE_VALUES_CENTS = Object.freeze({
  11: 700,
  12: 1400,
  13: 3500,
});

export const REFERENCE_PRIZE_VALUES_CENTS = Object.freeze({
  14: 189635,
  15: 50000000,
});

export const PRIZE_VALUES_CENTS = Object.freeze({
  ...FIXED_PRIZE_VALUES_CENTS,
  ...REFERENCE_PRIZE_VALUES_CENTS,
});

/** Valor de referência de uma faixa, em centavos. */
export function getPrizeValueCents(tier, overrides = {}) {
  if (!PRIZE_TIERS.includes(tier)) {
    throw new RangeError(`Faixa de prêmio inválida: ${String(tier)}.`);
  }
  const value = overrides[tier] ?? PRIZE_VALUES_CENTS[tier];
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Valor inválido para a faixa ${tier}.`);
  }
  return value;
}

/**
 * Fase 4: o jogador pode configurar apenas o prêmio máximo (15 acertos) e a
 * referência de 14 acertos. As faixas fixas 11/12/13 NUNCA entram em overrides,
 * portanto não podem ser alteradas pela configuração.
 */
export function resolvePrizeValueOverrides({ maxPrize15Cents, prize14Cents } = {}) {
  const overrides = {};
  if (maxPrize15Cents !== undefined) {
    if (!Number.isSafeInteger(maxPrize15Cents) || maxPrize15Cents < 0) {
      throw new RangeError('Prêmio máximo inválido.');
    }
    overrides[15] = maxPrize15Cents;
  }
  if (prize14Cents !== undefined) {
    if (!Number.isSafeInteger(prize14Cents) || prize14Cents < 0) {
      throw new RangeError('Referência de 14 acertos inválida.');
    }
    overrides[14] = prize14Cents;
  }
  return overrides;
}
