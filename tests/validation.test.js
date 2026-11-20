import { describe, expect, it } from 'vitest';
import {
  LotofacilValidationError,
  isValidBet,
  isValidDraw,
  isValidNumber,
  validateBet,
  validateDraw,
} from '../src/core/validation.js';

const bet15 = Array.from({ length: 15 }, (_, index) => index + 1);

describe('validação de números', () => {
  it('aceita inteiros de 1 a 25', () => {
    expect(isValidNumber(1)).toBe(true);
    expect(isValidNumber(25)).toBe(true);
    expect(isValidNumber(13)).toBe(true);
  });

  it('rejeita intervalo, tipo e inteiros inválidos', () => {
    expect(isValidNumber(0)).toBe(false);
    expect(isValidNumber(26)).toBe(false);
    expect(isValidNumber(1.5)).toBe(false);
    expect(isValidNumber('5')).toBe(false);
    expect(isValidNumber(NaN)).toBe(false);
    expect(isValidNumber(Infinity)).toBe(false);
  });
});

describe('validação de aposta', () => {
  it('aceita de 15 a 20 números', () => {
    for (let size = 15; size <= 20; size += 1) {
      const bet = Array.from({ length: size }, (_, index) => index + 1);
      expect(validateBet(bet)).toEqual(bet);
    }
  });

  it('devolve cópia ordenada sem alterar a entrada', () => {
    const input = [25, 21, 22, 24];
    const inputCopy = [...input];
    const numbers = [...bet15.slice(3), ...input];
    const result = validateBet(numbers);
    expect(result).toEqual([...numbers].sort((a, b) => a - b));
    expect(result).not.toBe(input);
    expect(input).toEqual(inputCopy);
  });

  it('rejeita quantidade inválida', () => {
    expect(() => validateBet(bet15.slice(1))).toThrow(LotofacilValidationError);
    expect(() => validateBet([...bet15, 16, 17, 18, 19])).not.toThrow();
    expect(() => validateBet([...bet15, 16, 17, 18, 19, 20, 21])).toThrow(LotofacilValidationError);
  });

  it('rejeita números repetidos', () => {
    const duplicated = [...bet15.slice(0, 14), 15, 15];
    expect(() => validateBet(duplicated)).toThrow(LotofacilValidationError);
    try {
      validateBet(duplicated);
    } catch (error) {
      expect(error.code).toBe('DUPLICATE_NUMBER');
    }
  });

  it('rejeita números fora do intervalo', () => {
    expect(() => validateBet([...bet15.slice(1), 26])).toThrow(LotofacilValidationError);
    expect(() => validateBet([...bet15.slice(1), 0])).toThrow(LotofacilValidationError);
    expect(() => validateBet([...bet15.slice(1), '5'])).toThrow(LotofacilValidationError);
  });

  it('rejeita entrada que não seja array', () => {
    expect(() => validateBet(null)).toThrow(LotofacilValidationError);
    expect(() => validateBet('123')).toThrow(LotofacilValidationError);
  });

  it('oferece wrapper booleano', () => {
    expect(isValidBet(bet15)).toBe(true);
    expect(isValidBet(bet15.slice(1))).toBe(false);
  });
});

describe('validação de sorteio', () => {
  it('aceita exatamente 15 números distintos', () => {
    expect(validateDraw(bet15)).toEqual(bet15);
  });

  it('rejeita 14 ou 16 números', () => {
    expect(() => validateDraw(bet15.slice(1))).toThrow(LotofacilValidationError);
    expect(() => validateDraw([...bet15, 16])).toThrow(LotofacilValidationError);
  });

  it('rejeita repetição', () => {
    expect(() => validateDraw([...bet15.slice(1), 15])).toThrow(LotofacilValidationError);
  });

  it('oferece wrapper booleano', () => {
    expect(isValidDraw(bet15)).toBe(true);
    expect(isValidDraw([...bet15, 16])).toBe(false);
  });
});
