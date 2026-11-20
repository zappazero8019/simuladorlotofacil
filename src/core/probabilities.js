import {
  DRAW_SIZE,
  MAX_BET_SIZE,
  MAX_NUMBER,
  MIN_BET_SIZE,
  PRIZE_TIERS,
} from './constants.js';
import { choose } from './combinatorics.js';

/** Universe: C(25, 15). */
export const TOTAL_POSSIBLE_DRAWS = choose(MAX_NUMBER, DRAW_SIZE);

function assertBetSize(betSize) {
  if (
    !Number.isInteger(betSize)
    || betSize < MIN_BET_SIZE
    || betSize > MAX_BET_SIZE
  ) {
    throw new RangeError(
      `Aposta deve ter entre ${MIN_BET_SIZE} e ${MAX_BET_SIZE} números.`,
    );
  }
}

/**
 * Quantidade de sorteios possíveis em que a aposta tem exatamente `matches`
 * números sorteados. Equivale a C(k, x) × C(25−k, 15−x).
 */
export function countDrawsWithMatches(betSize, matches) {
  assertBetSize(betSize);
  if (!Number.isInteger(matches) || matches < 0 || matches > DRAW_SIZE) {
    throw new RangeError(`Acertos devem estar entre 0 e ${DRAW_SIZE}.`);
  }

  const outside = MAX_NUMBER - betSize;
  const drawnOutside = DRAW_SIZE - matches;
  if (drawnOutside < 0 || drawnOutside > outside) {
    return 0;
  }

  return choose(betSize, matches) * choose(outside, drawnOutside);
}

export function probabilityExactMatches(betSize, matches) {
  const draws = countDrawsWithMatches(betSize, matches);
  return {
    betSize,
    matches,
    draws,
    totalDraws: TOTAL_POSSIBLE_DRAWS,
    probability: draws / TOTAL_POSSIBLE_DRAWS,
    oneIn: draws === 0 ? Infinity : TOTAL_POSSIBLE_DRAWS / draws,
  };
}

/** Probabilidade oficial de cada faixa: P(x = t), para t em 11..15. */
export function probabilityByTier(betSize) {
  assertBetSize(betSize);
  return PRIZE_TIERS.map((tier) => probabilityExactMatches(betSize, tier));
}

/** Probabilidade derivada de a aposta ter pelo menos uma faixa premiada. */
export function probabilityAnyPrize(betSize) {
  assertBetSize(betSize);
  const draws = PRIZE_TIERS.reduce(
    (sum, tier) => sum + countDrawsWithMatches(betSize, tier),
    0,
  );
  return {
    betSize,
    draws,
    totalDraws: TOTAL_POSSIBLE_DRAWS,
    probability: draws / TOTAL_POSSIBLE_DRAWS,
    oneIn: TOTAL_POSSIBLE_DRAWS / draws,
  };
}

/**
 * Exceções de apresentação publicadas pela CAIXA. A regra geral (uma casa
 * decimal para N < 5, inteiro para N >= 5) reproduz a tabela oficial em todas
 * as células exceto estas duas. Apenas a string exibida é ajustada: os valores
 * matemáticos exatos permanecem intactos.
 */
const OFFICIAL_DISPLAY_OVERRIDES = Object.freeze({
  '17:11': '4',
  '18:11': '3',
});

function officialDisplayKey(betSize, tier) {
  if (!Number.isInteger(betSize) || !Number.isInteger(tier)) {
    return null;
  }
  return `${betSize}:${tier}`;
}

/**
 * Formata "1 em N" para apresentação, sem alterar os valores exatos.
 * Regra geral: uma casa decimal quando N < 5; inteiro arredondado quando
 * N >= 5. Com `context = { betSize, tier }`, aplica as exceções oficiais.
 */
export function formatOneIn(value, context = null) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  if (context !== null) {
    const key = officialDisplayKey(context.betSize, context.tier);
    if (key !== null && Object.hasOwn(OFFICIAL_DISPLAY_OVERRIDES, key)) {
      return OFFICIAL_DISPLAY_OVERRIDES[key];
    }
  }

  const oneDecimal = value < 5;
  const rounded = oneDecimal ? Math.round(value * 10) / 10 : Math.round(value);
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: oneDecimal ? 1 : 0,
    maximumFractionDigits: oneDecimal ? 1 : 0,
  }).format(rounded);
}

/** Formata a faixa oficial usando valores exatos e a apresentação da CAIXA. */
export function formatOfficialOneIn(betSize, tier) {
  assertBetSize(betSize);
  if (!PRIZE_TIERS.includes(tier)) {
    throw new RangeError(
      `Faixa deve estar entre ${PRIZE_TIERS[0]} e ${PRIZE_TIERS.at(-1)}.`,
    );
  }

  const { oneIn } = probabilityExactMatches(betSize, tier);
  return formatOneIn(oneIn, { betSize, tier });
}
