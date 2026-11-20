import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../src/core/constants.js';
import { isValidBet } from '../src/core/validation.js';
import { generateSurpresinha } from '../src/bets/index.js';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1103515245, state) + 12345) >>> 0;
    return state / 4294967296;
  };
}

describe('surpresinha', () => {
  it('produz aposta determinística com gerador fixo', () => {
    expect(generateSurpresinha(15, () => 0)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
  });

  it('gera apostas válidas de 15 a 20 números', () => {
    for (let size = 15; size <= 20; size += 1) {
      const bet = generateSurpresinha(size, seededRandom(size * 7));
      expect(bet).toHaveLength(size);
      expect(new Set(bet).size).toBe(size);
      expect(bet).toEqual([...bet].sort((a, b) => a - b));
      expect(isValidBet(bet)).toBe(true);
    }
  });

  it('gera várias apostas válidas com a mesma semente', () => {
    const random = seededRandom(99);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(isValidBet(generateSurpresinha(20, random))).toBe(true);
    }
  });

  it('rejeita quantidade inválida', () => {
    expect(() => generateSurpresinha(14)).toThrow(RangeError);
    expect(() => generateSurpresinha(21)).toThrow(RangeError);
  });

  it('não altera o universo de números', () => {
    const before = [...UNIVERSE];
    generateSurpresinha(20, seededRandom(1));
    expect(UNIVERSE).toEqual(before);
  });
});
