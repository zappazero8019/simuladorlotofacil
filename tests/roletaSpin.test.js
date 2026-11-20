import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROLETA_SLOTS } from '../src/ui/roletaModel.js';
import {
  createSpinPath,
  createSpinPlan,
  normalizeSpinMode,
  spinDuration,
} from '../src/ui/roletaSpin.js';

const ALL_SLOTS = Array.from({ length: ROLETA_SLOTS }, (_, index) => index);

describe('roleta — planejamento do giro', () => {
  it('percorre todas as 15 posições antes de parar', () => {
    for (const target of ALL_SLOTS) {
      const path = createSpinPath({ fromIndex: 0, targetIndex: target });
      expect(new Set(path).size, `alvo ${target}`).toBe(ROLETA_SLOTS);
      expect(path.length).toBeGreaterThanOrEqual(ROLETA_SLOTS);
    }
  });

  it('para exatamente na posição de destino, para qualquer alvo', () => {
    for (const from of ALL_SLOTS) {
      for (const target of ALL_SLOTS) {
        const path = createSpinPath({ fromIndex: from, targetIndex: target });
        expect(path[path.length - 1], `de ${from} para ${target}`).toBe(target);
      }
    }
  });

  it('voltas extras não alteram a posição final', () => {
    for (const target of ALL_SLOTS) {
      const plan = createSpinPlan({
        fromIndex: 3, targetIndex: target, mode: 'normal', extraLaps: 2,
      });
      expect(plan.targetIndex).toBe(target);
      expect(plan.steps[plan.steps.length - 1].index).toBe(target);
    }
  });

  it('desacelera: os últimos passos são mais longos que os primeiros', () => {
    const plan = createSpinPlan({ fromIndex: 0, targetIndex: 9, laps: 2 });
    expect(plan.steps[0].duration).toBeLessThan(plan.steps[plan.steps.length - 1].duration);
    expect(plan.steps[plan.steps.length - 1].progress).toBe(1);
    expect(plan.steps.reduce((sum, step) => sum + step.duration, 0)).toBeCloseTo(plan.duration, 6);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.steps)).toBe(true);
  });

  it('normal é mais longo que acelerado e o último número ganha suspense', () => {
    const normal = spinDuration({ mode: 'normal', speed: 1, index: 0 });
    const accelerated = spinDuration({ mode: 'acelerado', speed: 3, index: 0 });
    const last = spinDuration({ mode: 'normal', speed: 1, index: ROLETA_SLOTS - 1 });
    expect(normal).toBeGreaterThan(accelerated);
    expect(last).toBeGreaterThan(normal);
    expect(accelerated).toBeGreaterThan(0);

    const normalPlan = createSpinPlan({ fromIndex: 0, targetIndex: 5, mode: 'normal', index: 0 });
    const fastPlan = createSpinPlan({ fromIndex: 0, targetIndex: 5, mode: 'acelerado', speed: 3, index: 0 });
    expect(normalPlan.steps.length).toBeGreaterThan(fastPlan.steps.length);
  });

  it('cabe no intervalo da apresentação sem depender de tempo real', () => {
    const fast = spinDuration({ mode: 'normal', speed: 5, index: 3, interval: 720 });
    expect(fast).toBeLessThanOrEqual(720 / 5);
    expect(spinDuration({ mode: 'normal', speed: 5, index: 3 })).toBe(fast);
  });

  it('normaliza modos e rejeita índices inválidos', () => {
    expect(normalizeSpinMode('acelerado')).toBe('acelerado');
    expect(normalizeSpinMode('instantaneo')).toBe('normal');
    expect(normalizeSpinMode(undefined)).toBe('normal');
    expect(() => createSpinPath({ targetIndex: -1 })).toThrow(RangeError);
    expect(() => createSpinPath({ targetIndex: 15 })).toThrow(RangeError);
    expect(() => createSpinPlan({ targetIndex: 1.5 })).toThrow(RangeError);
  });

  it('não contém RNG, sorteio, conferência ou efeito financeiro', () => {
    const source = readFileSync(new URL('../src/ui/roletaSpin.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Math\.random|crypto\.getRandomValues/);
    expect(source).not.toMatch(/drawNumbers|createDrawSession|checkBet|registerDraw|confer/i);
  });
});
