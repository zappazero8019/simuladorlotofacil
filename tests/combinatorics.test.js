import { describe, expect, it } from 'vitest';
import {
  choose,
  countCombinations,
  countCombinationsByTier,
  generateCombinations,
  getCombinations,
} from '../src/core/combinatorics.js';

describe('combinatória', () => {
  it('calcula C(n, k)', () => {
    expect(choose(25, 15)).toBe(3268760);
    expect(choose(20, 5)).toBe(15504);
    expect(choose(20, 15)).toBe(15504);
    expect(choose(0, 0)).toBe(1);
    expect(choose(5, 7)).toBe(0);
    expect(choose(5, -1)).toBe(0);
  });

  it('conta combinações simples de 15 a 20 números', () => {
    const sizes = [15, 16, 17, 18, 19, 20];
    expect(sizes.map(countCombinations)).toEqual([1, 16, 136, 816, 3876, 15504]);
  });

  it('rejeita tamanho de aposta fora de 15 a 20', () => {
    expect(() => countCombinations(14)).toThrow(RangeError);
    expect(() => countCombinations(21)).toThrow(RangeError);
  });

  it('gera combinações em ordem lexicográfica', () => {
    expect(getCombinations([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ]);
  });

  it('gera 16 combinações de 15 em 16 números', () => {
    const numbers = Array.from({ length: 16 }, (_, index) => index + 1);
    expect(getCombinations(numbers, 15)).toHaveLength(16);
  });

  it('gera combinações sob demanda', () => {
    const iterator = generateCombinations([1, 2, 3], 2);
    expect(iterator.next().value).toEqual([1, 2]);
    expect(iterator.next().value).toEqual([1, 3]);
  });

  it('reproduz a tabela oficial para 20 números com 15 acertos no total', () => {
    expect(countCombinationsByTier(20, 15)).toEqual({
      11: 6825,
      12: 4550,
      13: 1050,
      14: 75,
      15: 1,
    });
  });

  it('conta combinações premiadas com 14 acertos no total', () => {
    expect(countCombinationsByTier(20, 14)).toEqual({
      11: 5460,
      12: 1820,
      13: 210,
      14: 6,
      15: 0,
    });
    expect(countCombinationsByTier(16, 14)).toEqual({
      11: 0,
      12: 0,
      13: 14,
      14: 2,
      15: 0,
    });
  });

  it('conta a combinação única de uma aposta simples', () => {
    expect(countCombinationsByTier(15, 11)).toEqual({
      11: 1,
      12: 0,
      13: 0,
      14: 0,
      15: 0,
    });
    expect(countCombinationsByTier(15, 10)).toEqual({
      11: 0,
      12: 0,
      13: 0,
      14: 0,
      15: 0,
    });
  });

  it('valida argumentos imediatamente e mantém a geração lazy', () => {
    expect(() => generateCombinations('x', 2)).toThrow(TypeError);
    expect(() => generateCombinations([1, 2], -1)).toThrow(RangeError);
    expect(() => generateCombinations([1, 2], 3)).toThrow(RangeError);
    expect(() => generateCombinations([1, 2], 1.5)).toThrow(RangeError);
    expect(() => getCombinations([1, 2], 3)).toThrow(RangeError);

    const reads = [];
    const tracked = new Proxy([1, 2, 3, 4, 5], {
      get(target, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          reads.push(Number(prop));
        }
        return target[prop];
      },
    });

    const iterator = generateCombinations(tracked, 2);
    expect(iterator.next().value).toEqual([1, 2]);
    expect(reads).toEqual([0, 1]);
    expect(iterator.next().value).toEqual([1, 3]);
    expect(reads).toContain(2);
    expect(reads).not.toContain(4);
  });

  it('cobre casos extremos válidos', () => {
    expect(getCombinations([1, 2, 3], 0)).toEqual([[]]);
    expect(getCombinations([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(getCombinations([], 0)).toEqual([[]]);
    expect(() => getCombinations([], 1)).toThrow(RangeError);
  });

  it('conta combinações e preserva entrada e resultados', () => {
    const frozen = Object.freeze([1, 2, 3, 4, 5]);
    const all = getCombinations(frozen, 3);
    expect(all).toHaveLength(10);
    expect([...generateCombinations(frozen, 3)]).toHaveLength(10);
    expect(getCombinations(range(10), 4)).toHaveLength(210);

    expect([...frozen]).toEqual([1, 2, 3, 4, 5]);
    expect(all[0]).toEqual([1, 2, 3]);
    expect(all[1]).toEqual([1, 2, 4]);

    all[0][0] = 99;
    expect(getCombinations(frozen, 3)[0]).toEqual([1, 2, 3]);
  });
});

function range(size) {
  return Array.from({ length: size }, (_, index) => index + 1);
}
