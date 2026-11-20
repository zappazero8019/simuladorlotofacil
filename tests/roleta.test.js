import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROLETA_SLOTS, createRoletaModel } from '../src/ui/roletaModel.js';

const SEQUENCE = [3, 7, 12, 1, 19, 25, 8, 14, 2, 16, 21, 5, 10, 23, 18];

describe('roleta simplificada — Fase 2C', () => {
  it('possui exatamente 15 compartimentos que começam vazios', () => {
    const model = createRoletaModel();
    expect(ROLETA_SLOTS).toBe(15);
    expect(model.getSlots()).toHaveLength(15);
    expect(model.getSlots()).toEqual(Array(15).fill(null));
    expect(model.revealed).toBe(0);
    expect(model.complete).toBe(false);
  });

  it('preenche cada posição com um número da sequência sorteada', () => {
    const model = createRoletaModel();
    for (const [index, number] of SEQUENCE.entries()) {
      expect(model.reveal(number, index)).toBe(true);
    }

    expect(model.getSlots()).toEqual(SEQUENCE);
    expect(model.getNumbers()).toEqual(SEQUENCE);
    expect(model.revealed).toBe(15);
    expect(model.complete).toBe(true);
    expect(new Set(model.getNumbers()).size).toBe(15);
  });

  it('rejeita posições inválidas, duplicatas e números repetidos', () => {
    const model = createRoletaModel();
    expect(model.reveal(3, -1)).toBe(false);
    expect(model.reveal(3, 15)).toBe(false);
    expect(model.reveal(0, 0)).toBe(false);
    expect(model.reveal('3', 0)).toBe(false);

    expect(model.reveal(3, 0)).toBe(true);
    expect(model.reveal(3, 1)).toBe(false);
    expect(model.reveal(4, 0)).toBe(false);
    expect(model.getSlots()[0]).toBe(3);
    expect(model.getSlots()[1]).toBe(null);
  });

  it('revela todos de uma vez e reinicia sem alterar a sequência', () => {
    const model = createRoletaModel();
    expect(model.revealAll(SEQUENCE)).toEqual(SEQUENCE);
    expect(model.getNumbers()).toEqual(SEQUENCE);
    expect(model.complete).toBe(true);

    model.reset();
    expect(model.getSlots()).toEqual(Array(15).fill(null));
    expect(model.complete).toBe(false);
    expect(SEQUENCE).toEqual([3, 7, 12, 1, 19, 25, 8, 14, 2, 16, 21, 5, 10, 23, 18]);
  });

  it('não gera números nem depende de sorteio', () => {
    const source = readFileSync(new URL('../src/ui/roletaModel.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(/drawNumbers|createDrawSession|createShowController/);
  });
});
