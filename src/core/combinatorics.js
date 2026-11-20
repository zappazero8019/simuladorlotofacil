import {
  DRAW_SIZE,
  MAX_BET_SIZE,
  MIN_BET_SIZE,
  PRIZE_TIERS,
} from './constants.js';

/** Combinações simples: C(n, k). Retorna 0 para parâmetros inválidos. */
export function choose(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
    return 0;
  }

  const reduced = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= reduced; i += 1) {
    result = (result * (n - reduced + i)) / i;
  }
  return result;
}

/** Quantidade de apostas simples equivalentes a uma aposta de k números. */
export function countCombinations(betSize) {
  if (
    !Number.isInteger(betSize)
    || betSize < MIN_BET_SIZE
    || betSize > MAX_BET_SIZE
  ) {
    throw new RangeError(
      `Aposta deve ter entre ${MIN_BET_SIZE} e ${MAX_BET_SIZE} números.`,
    );
  }
  return choose(betSize, DRAW_SIZE);
}

/**
 * Quantidade de combinações simples com exatamente `t` acertos,
 * dado o tamanho da aposta e a quantidade `matches` de números sorteados
 * presentes nela.
 */
export function countCombinationsByTier(betSize, matches, tiers = PRIZE_TIERS) {
  countCombinations(betSize);

  if (!Number.isInteger(matches) || matches < 0 || matches > DRAW_SIZE) {
    throw new RangeError(`Acertos devem estar entre 0 e ${DRAW_SIZE}.`);
  }

  const notDrawnInBet = betSize - matches;
  const result = {};

  for (const tier of tiers) {
    const neededFromDraw = tier;
    const neededFromNotDrawn = DRAW_SIZE - tier;
    const count = neededFromDraw <= matches && neededFromNotDrawn <= notDrawnInBet
      ? choose(matches, neededFromDraw) * choose(notDrawnInBet, neededFromNotDrawn)
      : 0;
    result[tier] = count;
  }

  return result;
}

/**
 * Valida os argumentos imediatamente e devolve um gerador lazy que produz
 * combinações simples de `size` elementos em ordem lexicográfica.
 */
export function generateCombinations(items, size) {
  if (!Array.isArray(items)) {
    throw new TypeError('items deve ser um array.');
  }
  if (!Number.isInteger(size) || size < 0 || size > items.length) {
    throw new RangeError('size deve estar entre 0 e o tamanho de items.');
  }

  function* build(start, remaining, picked) {
    if (remaining === 0) {
      yield [...picked];
      return;
    }
    for (let i = start; i <= items.length - remaining; i += 1) {
      picked.push(items[i]);
      yield* build(i + 1, remaining - 1, picked);
      picked.pop();
    }
  }

  return build(0, size, []);
}

/** Versão materializada de `generateCombinations`. */
export function getCombinations(items, size) {
  return [...generateCombinations(items, size)];
}
