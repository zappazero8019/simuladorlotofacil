import { describe, expect, it } from 'vitest';
import {
  BET_PRICES_CENTS,
  createBetRegistry,
  createVolante,
  formatCurrency,
  generateSurpresinha,
  getBetPriceCents,
  getSharePercentage,
  getSharePriceCents,
  isTeimosinhaContestCount,
  splitAmountCents,
  TEIMOSINHA_CONTEST_COUNTS,
  validatePoolShares,
} from '../src/bets/index.js';
import { MAX_BET_SIZE, MIN_BET_SIZE } from '../src/core/index.js';

describe('Fase 3 — preços e limites oficiais', () => {
  it('centraliza os preços de 15 a 20 números', () => {
    expect(BET_PRICES_CENTS).toEqual({
      15: 350,
      16: 5600,
      17: 47600,
      18: 285600,
      19: 1356600,
      20: 5426400,
    });
    expect(getBetPriceCents(15)).toBe(350);
    expect(getBetPriceCents(20)).toBe(5426400);
    expect(() => getBetPriceCents(14)).toThrow(RangeError);
  });

  it('formata valores em reais', () => {
    expect(formatCurrency(350)).toBe('R$ 3,50');
    expect(formatCurrency(5426400)).toBe('R$ 54.264,00');
  });

  it('mantém as quantidades oficiais de Teimosinha', () => {
    expect([...TEIMOSINHA_CONTEST_COUNTS]).toEqual([2, 3, 4, 6, 8, 9, 12, 18, 24]);
    expect(isTeimosinhaContestCount(6)).toBe(true);
    expect(isTeimosinhaContestCount(5)).toBe(false);
  });

  it('valida o limite de cotas por bolão', () => {
    expect(validatePoolShares(15, 7)).toBe(7);
    expect(validatePoolShares(20, 100)).toBe(100);
    expect(() => validatePoolShares(15, 8)).toThrow(RangeError);
    expect(() => validatePoolShares(15, 1)).toThrow(RangeError);
  });

  it('trunca o valor da cota e destina o resíduo à última', () => {
    expect(getSharePriceCents(1400, 3)).toBe(466);
    expect(splitAmountCents(1400, 3)).toEqual([466, 466, 468]);
    expect(getSharePercentage(4)).toBe(25);
  });
});

describe('Fase 3 — volante', () => {
  it('seleciona e desmarca números', () => {
    const volante = createVolante();
    expect(volante.toggle(7)).toBe(true);
    expect(volante.has(7)).toBe(true);
    expect(volante.deselect(7)).toBe(true);
    expect(volante.has(7)).toBe(false);
    expect(volante.clear).toBeTypeOf('function');
  });

  it('impede mais de 20 números e números inválidos', () => {
    const volante = createVolante();
    for (let number = 1; number <= MAX_BET_SIZE; number += 1) {
      expect(volante.select(number)).toBe(true);
    }
    expect(volante.isFull).toBe(true);
    expect(volante.select(21)).toBe(false);
    expect(volante.toggle(0)).toBe(false);
    expect(volante.size).toBe(MAX_BET_SIZE);
  });

  it('só confirma a partir de 15 números e mostra o preço correto', () => {
    const volante = createVolante();
    expect(volante.canConfirm).toBe(false);
    expect(volante.priceCents).toBe(0);
    for (let number = 1; number <= 16; number += 1) volante.select(number);
    expect(volante.canConfirm).toBe(true);
    expect(volante.priceCents).toBe(5600);
  });

  it('aceita uma Surpresinha pronta e rejeita duplicatas', () => {
    const volante = createVolante();
    expect(volante.setNumbers(generateSurpresinha(15, () => 0))).toBe(true);
    expect(volante.getNumbers()).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(volante.setNumbers([1, 1, 2, 3])).toBe(false);
    expect(volante.clear()).toBeUndefined();
    expect(volante.size).toBe(0);
  });
});

describe('Fase 3 — Surpresinha', () => {
  it('gera números únicos, ordenados e dentro da faixa', () => {
    for (let size = MIN_BET_SIZE; size <= MAX_BET_SIZE; size += 1) {
      const numbers = generateSurpresinha(size);
      expect(numbers).toHaveLength(size);
      expect(new Set(numbers).size).toBe(size);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      expect(numbers.every((n) => n >= 1 && n <= 25)).toBe(true);
    }
  });

  it('aceita gerador injetável e permite gerar novamente', () => {
    const first = generateSurpresinha(15, () => 0);
    const second = generateSurpresinha(15, () => 0.99);
    expect(first).not.toEqual(second);
    expect(first).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
});

describe('Fase 3 — cadastro de apostas', () => {
  it('congela os números e calcula preço e combinações', () => {
    const registry = createBetRegistry();
    const bet = registry.add({ numbers: Array.from({ length: 16 }, (_, i) => i + 1) });
    expect(Object.isFrozen(bet.numbers)).toBe(true);
    expect(bet.priceCents).toBe(5600);
    expect(bet.combinations).toBe(16);
    expect(bet.contests).toBe(1);
    expect(registry.count).toBe(1);
    expect(registry.totalCostCents).toBe(5600);
  });

  it('rejeita aposta inválida e permite remover/limpar', () => {
    const registry = createBetRegistry();
    expect(() => registry.add({ numbers: [1, 2, 3] })).toThrow();
    const bet = registry.add({ numbers: Array.from({ length: 15 }, (_, i) => i + 1) });
    expect(registry.getById(bet.id)).toBe(bet);
    expect(registry.remove(bet.id)).toBe(true);
    expect(registry.remove(999)).toBe(false);
    registry.add({ numbers: Array.from({ length: 15 }, (_, i) => i + 1) });
    registry.clear();
    expect(registry.count).toBe(0);
    expect(registry.list()).toEqual([]);
  });
});
