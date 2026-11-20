import { describe, expect, it } from 'vitest';

describe('importação independente dos módulos', () => {
  it('exporta o núcleo sem depender de interface', async () => {
    const core = await import('../src/core/index.js');
    expect(typeof core.choose).toBe('function');
    expect(typeof core.validateBet).toBe('function');
    expect(typeof core.sampleNumbers).toBe('function');
    expect(typeof core.probabilityByTier).toBe('function');
    expect(core.TOTAL_POSSIBLE_DRAWS).toBe(3268760);
  });

  it('exporta apostas, sorteios e premiações pelos índices de domínio', async () => {
    const bets = await import('../src/bets/index.js');
    const draws = await import('../src/draws/index.js');
    const prizes = await import('../src/prizes/index.js');

    expect(typeof bets.generateSurpresinha).toBe('function');
    expect(typeof draws.drawNumbers).toBe('function');
    expect(typeof prizes.checkBet).toBe('function');
  });

  it('roda em ambiente sem DOM', () => {
    expect(typeof globalThis.document).toBe('undefined');
  });
});
