import { describe, expect, it } from 'vitest';
import {
  assignContestResult,
  createBetRegistry,
  createContestResults,
  getContestResults,
  getPendingContests,
  isTeimosinhaComplete,
} from '../src/bets/index.js';
import { validateDraw } from '../src/core/index.js';

const betNumbers = Array.from({ length: 15 }, (_, index) => index + 1);

function makeDraw(offset = 0) {
  return Array.from({ length: 15 }, (_, index) => offset + index + 1);
}

describe('Fase 3 — Teimosinha', () => {
  it('cria um espaço por concurso oficial', () => {
    expect(createContestResults(2)).toHaveLength(2);
    expect(createContestResults(24)).toHaveLength(24);
    expect(() => createContestResults(5)).toThrow(RangeError);
    expect(getContestResults(createContestResults(3))).toEqual([null, null, null]);
  });

  it('preserva a mesma combinação em todos os concursos', () => {
    const registry = createBetRegistry();
    const bet = registry.add({ numbers: betNumbers, contests: 6 });
    expect(bet.numbers).toEqual(betNumbers);
    expect(bet.contests).toBe(6);
    expect(bet.results).toHaveLength(6);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].numbers).toBe(bet.numbers);
  });

  it('atribui um resultado diferente a cada concurso', () => {
    const results = createContestResults(3);
    expect(assignContestResult(results, makeDraw(0))).toBe(0);
    expect(assignContestResult(results, makeDraw(1))).toBe(1);
    expect(assignContestResult(results, makeDraw(2))).toBe(2);
    expect(getPendingContests(results)).toBe(0);
    expect(isTeimosinhaComplete(results)).toBe(true);
    expect(assignContestResult(results, makeDraw(3))).toBe(null);
    expect(getContestResults(results)[0]).toEqual(validateDraw(makeDraw(0)));
  });

  it('rejeita resultado inválido sem avançar o concurso', () => {
    const results = createContestResults(2);
    expect(() => assignContestResult(results, [1, 2, 3])).toThrow();
    expect(getPendingContests(results)).toBe(2);
  });

  it('mantém os resultados congelados', () => {
    const results = createContestResults(2);
    assignContestResult(results, makeDraw(0));
    expect(Object.isFrozen(results[0])).toBe(true);
    expect(() => { results[0][0] = 99; }).toThrow(TypeError);
  });
});
