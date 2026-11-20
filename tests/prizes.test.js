import { describe, expect, it } from 'vitest';
import {
  checkBet,
  checkSimpleCombination,
  countMatches,
} from '../src/prizes/index.js';

const range = (start, end) => Array.from(
  { length: end - start + 1 },
  (_, index) => start + index,
);

const TIERS = [11, 12, 13, 14, 15];

/** Implementação independente de C(n, k), usada apenas como referência. */
function referenceChoose(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
    return 0;
  }
  const reduced = Math.min(k, n - k);
  let value = 1;
  for (let i = 1; i <= reduced; i += 1) {
    value = (value * (n - reduced + i)) / i;
  }
  return value;
}

/** Enumeração independente de subconjuntos, sem usar o módulo sob teste. */
function referenceCombinations(items, size) {
  const output = [];

  function visit(start, picked) {
    if (picked.length === size) {
      output.push([...picked]);
      return;
    }
    for (let i = start; i <= items.length - (size - picked.length); i += 1) {
      picked.push(items[i]);
      visit(i + 1, picked);
      picked.pop();
    }
  }

  visit(0, []);
  return output;
}

describe('conferência de apostas', () => {
  it('conta acertos entre aposta e resultado', () => {
    expect(countMatches(range(1, 15), range(1, 15))).toBe(15);
    expect(countMatches(range(1, 15), [...range(1, 10), ...range(16, 20)])).toBe(10);
  });

  it('confera aposta simples com 15 acertos', () => {
    const result = checkBet(range(1, 15), range(1, 15));
    expect(result.matches).toBe(15);
    expect(result.totalCombinations).toBe(1);
    expect(result.prizes).toEqual({ 11: 0, 12: 0, 13: 0, 14: 0, 15: 1 });
    expect(result.winningCombinations).toBe(1);
    expect(result.bestTier).toBe(15);
    expect(result.isWinner).toBe(true);
  });

  it('confera cada faixa de premiação de aposta simples', () => {
    const cases = [
      { draw: [...range(1, 14), 16], matches: 14, tier: 14 },
      { draw: [...range(1, 13), 16, 17], matches: 13, tier: 13 },
      { draw: [...range(1, 12), 16, 17, 18], matches: 12, tier: 12 },
      { draw: [...range(1, 11), 16, 17, 18, 19], matches: 11, tier: 11 },
    ];

    for (const { draw, matches, tier } of cases) {
      const result = checkBet(range(1, 15), draw);
      expect(result.matches).toBe(matches);
      expect(result.prizes[tier]).toBe(1);
      expect(result.bestTier).toBe(tier);
      expect(result.isWinner).toBe(true);
    }
  });

  it('não premia aposta simples com 10 acertos', () => {
    const result = checkBet(range(1, 15), [...range(1, 10), ...range(16, 20)]);
    expect(result.matches).toBe(10);
    expect(result.winningCombinations).toBe(0);
    expect(result.bestTier).toBeNull();
    expect(result.isWinner).toBe(false);
  });

  it('trate aposta de 16 números como 16 apostas simples', () => {
    const result = checkBet(range(1, 16), range(1, 15));
    expect(result.totalCombinations).toBe(16);
    expect(result.prizes).toEqual({ 11: 0, 12: 0, 13: 0, 14: 15, 15: 1 });
    expect(result.winningCombinations).toBe(16);
    expect(result.bestTier).toBe(15);
  });

  it('trate 14 acertos em aposta de 16 números', () => {
    const result = checkBet(range(1, 16), [...range(1, 14), 17]);
    expect(result.matches).toBe(14);
    expect(result.prizes).toEqual({ 11: 0, 12: 0, 13: 14, 14: 2, 15: 0 });
    expect(result.winningCombinations).toBe(16);
    expect(result.bestTier).toBe(14);
  });

  it('reproduza a tabela oficial para aposta de 20 números', () => {
    const allDrawn = checkBet(range(1, 20), range(1, 15));
    expect(allDrawn.totalCombinations).toBe(15504);
    expect(allDrawn.prizes).toEqual({
      11: 6825,
      12: 4550,
      13: 1050,
      14: 75,
      15: 1,
    });

    const fourteenDrawn = checkBet(range(1, 20), [...range(1, 14), 21]);
    expect(fourteenDrawn.prizes).toEqual({
      11: 5460,
      12: 1820,
      13: 210,
      14: 6,
      15: 0,
    });
  });

  it('confera combinação simples isolada', () => {
    expect(checkSimpleCombination(range(1, 15), range(1, 15))).toEqual({
      matches: 15,
      tier: 15,
    });
    expect(checkSimpleCombination(
      range(1, 15),
      [...range(1, 10), ...range(16, 20)],
    )).toEqual({ matches: 10, tier: null });
    expect(() => checkSimpleCombination(range(1, 14), range(1, 15))).toThrow();
  });

  it('valide apostas e resultados inválidos', () => {
    expect(() => checkBet(range(1, 14), range(1, 15))).toThrow();
    expect(() => checkBet(range(1, 15), range(1, 14))).toThrow();
  });

  it('cubra as seis modalidades e todos os acertos viáveis', () => {
    let cases = 0;

    for (let size = 15; size <= 20; size += 1) {
      const bet = range(1, size);
      const combinations = referenceCombinations(bet, 15);
      const minMatches = Math.max(0, 15 - (25 - size));

      for (let matches = minMatches; matches <= Math.min(15, size); matches += 1) {
        const draw = [...range(1, matches), ...range(size + 1, size + 15 - matches)];

        const enumerated = Object.fromEntries(TIERS.map((tier) => [tier, 0]));
        for (const combination of combinations) {
          let hits = 0;
          for (const number of combination) {
            if (number <= matches) hits += 1;
          }
          if (hits >= 11) enumerated[hits] += 1;
        }

        const byFormula = {};
        for (const tier of TIERS) {
          byFormula[tier] = referenceChoose(matches, tier)
            * referenceChoose(size - matches, 15 - tier);
        }

        const result = checkBet(bet, draw);
        const winners = TIERS.reduce((total, tier) => total + enumerated[tier], 0);

        expect(result.matches).toBe(matches);
        expect(result.prizes).toEqual(enumerated);
        expect(result.prizes).toEqual(byFormula);
        expect(result.totalCombinations).toBe(combinations.length);
        expect(result.winningCombinations).toBe(winners);
        expect(result.isWinner).toBe(winners > 0);
        expect(result.bestTier).toBe(
          [...TIERS].reverse().find((tier) => enumerated[tier] > 0) ?? null,
        );
        cases += 1;
      }
    }

    expect(cases).toBe(51);
  });

  it('reproduza as linhas oficiais da CAIXA para 17, 18 e 19 números', () => {
    const official = {
      17: { 11: 0, 12: 0, 13: 105, 14: 30, 15: 1 },
      18: { 11: 0, 12: 455, 13: 315, 14: 45, 15: 1 },
      19: { 11: 1365, 12: 1820, 13: 630, 14: 60, 15: 1 },
    };

    for (const [size, prizes] of Object.entries(official)) {
      const result = checkBet(range(1, Number(size)), range(1, 15));
      expect(result.prizes).toEqual(prizes);
    }
  });

  it('não modifique entradas congeladas e devolva cópias', () => {
    const bet = Object.freeze(range(1, 15).reverse());
    const draw = Object.freeze(range(11, 25));
    const betBefore = [...bet];
    const drawBefore = [...draw];

    const result = checkBet(bet, draw);
    expect(result.numbers).not.toBe(bet);
    expect(result.drawnNumbers).not.toBe(draw);
    expect(result.numbers).toEqual([...betBefore].sort((a, b) => a - b));
    expect(result.drawnNumbers).toEqual([...drawBefore].sort((a, b) => a - b));

    result.numbers[0] = 99;
    result.drawnNumbers[0] = 99;
    result.prizes[11] = 99;

    expect([...bet]).toEqual(betBefore);
    expect([...draw]).toEqual(drawBefore);
    expect(countMatches(bet, draw)).toBe(5);
  });
});
