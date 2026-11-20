import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../src/core/constants.js';
import { sampleDistinct, sampleNumbers } from '../src/core/sampling.js';

const population = [1, 2, 3, 4, 5];

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('sampleDistinct', () => {
  it('rejeita retornos inválidos do gerador', () => {
    const invalids = [
      -0.1, -1, 1, 1.1, 2, NaN, Infinity, -Infinity,
      undefined, null, '0.5', {}, [],
    ];

    for (const value of invalids) {
      expect(() => sampleDistinct(population, 2, () => value)).toThrow(RangeError);
    }
    expect(() => sampleDistinct(population, 2, () => -0)).not.toThrow();
  });

  it('rejeita falha em chamadas posteriores sem alterar a população', () => {
    const before = [...population];
    const sequence = [0.5, 0.5, NaN];
    let calls = 0;

    expect(() => sampleDistinct(
      population,
      3,
      () => sequence[calls++],
    )).toThrow(RangeError);
    expect(calls).toBe(3);
    expect(population).toEqual(before);
  });

  it('count igual a zero não chama o gerador', () => {
    let called = false;
    const result = sampleDistinct(population, 0, () => {
      called = true;
      return 0.5;
    });

    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  it('rejeita entradas inválidas com segurança', () => {
    expect(() => sampleDistinct(null, 1, Math.random)).toThrow(TypeError);
    expect(() => sampleDistinct('123', 1, Math.random)).toThrow(TypeError);
    expect(() => sampleDistinct(population, -1, Math.random)).toThrow(RangeError);
    expect(() => sampleDistinct(population, 6, Math.random)).toThrow(RangeError);
    expect(() => sampleDistinct(population, 1.5, Math.random)).toThrow(RangeError);
    expect(() => sampleDistinct(population, 1, null)).toThrow(TypeError);
    expect(() => sampleDistinct(population, 1, 123)).toThrow(TypeError);
  });

  it('não altera a população e devolve uma cópia', () => {
    const frozen = Object.freeze([5, 4, 3, 2, 1]);
    const result = sampleDistinct(frozen, 5, () => 0);

    expect(result).toEqual([5, 4, 3, 2, 1]);
    expect(result).not.toBe(frozen);
    result[0] = 99;
    expect([...frozen]).toEqual([5, 4, 3, 2, 1]);
  });

  it('produz amostras determinísticas e sem repetição', () => {
    expect(sampleDistinct(population, 3, () => 0)).toEqual([1, 2, 3]);
    expect(sampleDistinct(population, 3, () => 0.999999999)).toEqual([5, 1, 2]);

    for (let seed = 1; seed <= 20; seed += 1) {
      const sample = sampleDistinct(population, 5, seededRandom(seed));
      expect(sample).toHaveLength(5);
      expect(new Set(sample).size).toBe(5);
    }
  });
});

describe('sampleNumbers', () => {
  it('ordena o resultado e preserva o universo', () => {
    const before = [...UNIVERSE];
    const result = sampleNumbers(15, () => 0);

    expect(result).toEqual(before.slice(0, 15));
    expect(UNIVERSE).toEqual(before);

    result[0] = 99;
    expect(UNIVERSE).toEqual(before);
  });
});
