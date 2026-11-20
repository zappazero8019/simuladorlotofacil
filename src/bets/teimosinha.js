import { validateDraw } from '../core/validation.js';
import { isTeimosinhaContestCount } from './pricing.js';

/**
 * Teimosinha: a mesma combinação é repetida em concursos consecutivos.
 * Cada concurso guarda o próprio resultado; a aposta nunca é regenerada.
 */
export function createContestResults(contests) {
  if (!isTeimosinhaContestCount(contests)) {
    throw new RangeError('Quantidade de concursos inválida para Teimosinha.');
  }
  return Array.from({ length: Number(contests) }, () => null);
}

/** Atribui o resultado de um concurso ao próximo espaço livre. */
export function assignContestResult(results, draw) {
  if (!Array.isArray(results)) {
    throw new TypeError('Resultados devem ser um array.');
  }
  const index = results.findIndex((item) => item === null);
  if (index === -1) return null;

  const valid = Object.freeze(validateDraw(draw));
  results[index] = valid;
  return index;
}

/** Cópia dos resultados já preenchidos (índice = concurso). */
export function getContestResults(results) {
  return results.map((result) => (result ? [...result] : null));
}

export function getPendingContests(results) {
  return results.filter((result) => result === null).length;
}

export function isTeimosinhaComplete(results) {
  return getPendingContests(results) === 0;
}
