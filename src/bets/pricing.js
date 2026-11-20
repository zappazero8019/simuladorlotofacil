/**
 * Constantes centralizadas de preços e limites oficiais da Lotofácil.
 * Valores em centavos para evitar erros de ponto flutuante.
 * Nenhuma regra matemática do motor é reimplementada aqui.
 */

/** Preço de cada aposta simples, por quantidade de números. */
export const BET_PRICES_CENTS = Object.freeze({
  15: 350,
  16: 5600,
  17: 47600,
  18: 285600,
  19: 1356600,
  20: 5426400,
});

/** Quantidades oficiais de concursos consecutivos da Teimosinha. */
export const TEIMOSINHA_CONTEST_COUNTS = Object.freeze([2, 3, 4, 6, 8, 9, 12, 18, 24]);

/** Limites oficiais de cotas por bolão, conforme a quantidade de números. */
export const POOL_MAX_SHARES_BY_SIZE = Object.freeze({
  15: 7,
  16: 35,
  17: 40,
  18: 50,
  19: 85,
  20: 100,
});
export const POOL_MIN_SHARES = 2;

/** Número máximo de apostas simples em um bolão (CAIXA). */
export const POOL_MAX_SIMPLE_BETS = 10;
export const POOL_MAX_SIMPLE_BETS_SIZE_20 = 4;

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Preço de uma aposta com `size` números, em centavos. */
export function getBetPriceCents(size) {
  const price = BET_PRICES_CENTS[size];
  if (price === undefined) {
    throw new RangeError(`Não existe preço oficial para ${String(size)} números.`);
  }
  return price;
}

/** Formata centavos como moeda brasileira. */
export function formatCurrency(cents) {
  if (!Number.isInteger(cents)) {
    throw new TypeError('Valor em centavos deve ser inteiro.');
  }
  return currencyFormatter.format(cents / 100).replace(/\u00a0/g, ' ');
}

/** Verifica se a quantidade é uma Teimosinha oficial. */
export function isTeimosinhaContestCount(value) {
  return TEIMOSINHA_CONTEST_COUNTS.includes(Number(value));
}

/** Valida a quantidade de cotas para um bolão do tamanho informado. */
export function validatePoolShares(betSize, shares) {
  const max = POOL_MAX_SHARES_BY_SIZE[betSize];
  if (max === undefined) {
    throw new RangeError(`Bolão inválido para ${String(betSize)} números.`);
  }
  if (!Number.isInteger(shares) || shares < POOL_MIN_SHARES || shares > max) {
    throw new RangeError(
      `Bolão de ${betSize} números deve ter entre ${POOL_MIN_SHARES} e ${max} cotas.`,
    );
  }
  return shares;
}

/** Valor de cada cota, truncado na segunda casa decimal (regra CAIXA). */
export function getSharePriceCents(totalCents, shares) {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new RangeError('Total em centavos deve ser inteiro e não negativo.');
  }
  if (!Number.isInteger(shares) || shares < 1) {
    throw new RangeError('Quantidade de cotas deve ser inteira positiva.');
  }
  return Math.floor(totalCents / shares);
}

/** Participação percentual de uma cota. */
export function getSharePercentage(shares) {
  if (!Number.isInteger(shares) || shares < 1) {
    throw new RangeError('Quantidade de cotas deve ser inteira positiva.');
  }
  return 100 / shares;
}

/**
 * Divide um valor em cotas iguais, truncadas na segunda casa decimal.
 * O resíduo é destinado à última cota, conforme o manual da CAIXA.
 */
export function splitAmountCents(totalCents, shares) {
  const perShare = getSharePriceCents(totalCents, shares);
  const parts = Array.from({ length: shares }, () => perShare);
  parts[shares - 1] += totalCents - perShare * shares;
  return parts;
}
