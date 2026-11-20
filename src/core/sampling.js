import { UNIVERSE } from './constants.js';

/**
 * Amostragem sem reposição com algoritmo de Fisher-Yates parcial.
 * O gerador `random` é injetável para permitir testes determinísticos.
 */
export function sampleDistinct(population, count, random = Math.random) {
  if (!Array.isArray(population)) {
    throw new TypeError('population deve ser um array.');
  }
  if (!Number.isInteger(count) || count < 0 || count > population.length) {
    throw new RangeError('count deve estar entre 0 e o tamanho da população.');
  }
  if (typeof random !== 'function') {
    throw new TypeError('random deve ser uma função.');
  }

  const pool = [...population];

  for (let i = 0; i < count; i += 1) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError('random deve retornar um número em [0, 1).');
    }
    const j = i + Math.floor(value * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count);
}

/** Amostra números do universo 1–25, devolvendo-os em ordem crescente. */
export function sampleNumbers(count, random = Math.random) {
  return sampleDistinct(UNIVERSE, count, random).sort((a, b) => a - b);
}
