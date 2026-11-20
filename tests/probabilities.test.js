import { describe, expect, it } from 'vitest';
import {
  TOTAL_POSSIBLE_DRAWS,
  countDrawsWithMatches,
  formatOneIn,
  formatOfficialOneIn,
  probabilityAnyPrize,
  probabilityByTier,
  probabilityExactMatches,
} from '../src/core/probabilities.js';

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

describe('probabilidades', () => {
  it('usa C(25, 15) como total de sorteios possíveis', () => {
    expect(TOTAL_POSSIBLE_DRAWS).toBe(3268760);
  });

  it('conta sorteios por quantidade de acertos da aposta simples', () => {
    const counts = [15, 14, 13, 12, 11]
      .map((tier) => countDrawsWithMatches(15, tier));
    expect(counts).toEqual([1, 150, 4725, 54600, 286650]);
  });

  it('calcula probabilidade exata de 15 acertos', () => {
    const result = probabilityExactMatches(15, 15);
    expect(result.draws).toBe(1);
    expect(result.probability).toBe(1 / 3268760);
    expect(result.oneIn).toBe(3268760);
  });

  it('calcula as faixas oficiais para 16 e 20 números', () => {
    expect(probabilityByTier(16).map((item) => item.draws)).toEqual([
      550368, 152880, 20160, 1080, 16,
    ]);
    expect(probabilityByTier(20).map((item) => item.draws)).toEqual([
      839800, 1259700, 775200, 193800, 15504,
    ]);
  });

  it('retorna zero para quantidade de acertos impossível', () => {
    expect(countDrawsWithMatches(20, 9)).toBe(0);
    expect(probabilityExactMatches(20, 9).oneIn).toBe(Infinity);
  });

  it('calcula probabilidade derivada de qualquer prêmio', () => {
    const simple = probabilityAnyPrize(15);
    expect(simple.draws).toBe(346126);
    expect(simple.oneIn).toBeCloseTo(9.44, 1);
    expect(probabilityAnyPrize(20).draws).toBe(3084004);
  });

  it('formata \"1 em N\" para apresentação', () => {
    expect(formatOneIn(3268760)).toBe('3.268.760');
    expect(formatOneIn(2.8827)).toBe('2,9');
    expect(formatOneIn(5.939)).toBe('6');
    expect(formatOneIn(Infinity)).toBe('—');
  });

  it('valida o tamanho da aposta', () => {
    expect(() => probabilityByTier(14)).toThrow(RangeError);
    expect(() => probabilityByTier(21)).toThrow(RangeError);
  });

  it('valida numeradores, denominadores e frações exatas nas seis modalidades', () => {
    const total = referenceChoose(25, 15);
    expect(TOTAL_POSSIBLE_DRAWS).toBe(total);

    for (let size = 15; size <= 20; size += 1) {
      const rows = probabilityByTier(size);
      expect(rows.map((row) => row.matches)).toEqual(TIERS);

      for (const row of rows) {
        const expectedDraws = referenceChoose(size, row.matches)
          * referenceChoose(25 - size, 15 - row.matches);

        expect(row.betSize).toBe(size);
        expect(row.draws).toBe(expectedDraws);
        expect(row.totalDraws).toBe(total);
        expect(row.probability).toBe(expectedDraws / total);
        expect(row.oneIn).toBe(total / expectedDraws);
      }
    }
  });

  it('valida probabilityAnyPrize nas seis modalidades', () => {
    const total = referenceChoose(25, 15);

    for (let size = 15; size <= 20; size += 1) {
      const expectedDraws = TIERS.reduce(
        (sum, tier) => sum + referenceChoose(size, tier)
          * referenceChoose(25 - size, 15 - tier),
        0,
      );
      const result = probabilityAnyPrize(size);

      expect(result.draws).toBe(expectedDraws);
      expect(result.totalDraws).toBe(total);
      expect(result.probability).toBe(expectedDraws / total);
      expect(result.oneIn).toBe(total / expectedDraws);
    }
  });

  it('aplica as exceções oficiais em 17/11 e 18/11 sem alterar os valores exatos', () => {
    const seventeen = probabilityExactMatches(17, 11);
    const eighteen = probabilityExactMatches(18, 11);

    expect(seventeen.draws).toBe(866320);
    expect(eighteen.draws).toBe(1113840);
    expect(seventeen.oneIn).toBeCloseTo(3.7731554160125587, 12);
    expect(eighteen.oneIn).toBeCloseTo(2.9346764346764345, 12);
    expect(seventeen.probability).toBe(866320 / TOTAL_POSSIBLE_DRAWS);
    expect(eighteen.probability).toBe(1113840 / TOTAL_POSSIBLE_DRAWS);

    expect(formatOfficialOneIn(17, 11)).toBe('4');
    expect(formatOfficialOneIn(18, 11)).toBe('3');

    expect(formatOneIn(seventeen.oneIn)).toBe('3,8');
    expect(formatOneIn(eighteen.oneIn)).toBe('2,9');
    expect(formatOneIn(seventeen.oneIn, { betSize: 17, tier: 11 })).toBe('4');
    expect(formatOneIn(eighteen.oneIn, { betSize: 18, tier: 11 })).toBe('3');
  });

  it('reproduz a tabela oficial de apresentação em todas as 30 células', () => {
    const official = {
      15: ['11', '60', '692', '21.792', '3.268.760'],
      16: ['6', '21', '162', '3.027', '204.298'],
      17: ['4', '9', '49', '601', '24.035'],
      18: ['3', '5', '18', '153', '4.006'],
      19: ['2,9', '3,2', '8', '47', '843'],
      20: ['3,9', '2,6', '4,2', '17', '211'],
    };

    for (let size = 15; size <= 20; size += 1) {
      const displayed = TIERS.map((tier) => formatOfficialOneIn(size, tier));
      expect(displayed).toEqual(official[size]);
    }
  });

  it('valida os argumentos da formatação oficial', () => {
    expect(() => formatOfficialOneIn(14, 11)).toThrow(RangeError);
    expect(() => formatOfficialOneIn(21, 11)).toThrow(RangeError);
    expect(() => formatOfficialOneIn(15, 10)).toThrow(RangeError);
    expect(() => formatOfficialOneIn(15, 16)).toThrow(RangeError);
    expect(formatOfficialOneIn(15, 11)).toBe('11');
  });
});
