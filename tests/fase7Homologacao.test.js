import { describe, expect, it } from 'vitest';
import { choose } from '../src/core/combinatorics.js';
import { BET_PRICES_CENTS } from '../src/bets/pricing.js';
import { FIXED_PRIZE_VALUES_CENTS } from '../src/prizes/prizeValues.js';
import { createMemoryStore } from '../src/persistence/memoryStore.js';
import { createHistoryService } from '../src/history/service.js';

const DRAW = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

async function isolatedHistory() {
  const history = createHistoryService({ store: createMemoryStore() });
  await history.initialize();
  return history;
}

describe('Fase 7 — integridade homologada', () => {
  it('mantém constantes matemáticas e financeiras oficiais', () => {
    expect(choose(25, 15)).toBe(3268760);
    expect(BET_PRICES_CENTS).toEqual({
      15: 350, 16: 5600, 17: 47600, 18: 285600, 19: 1356600, 20: 5426400,
    });
    expect(FIXED_PRIZE_VALUES_CENTS).toEqual({ 11: 700, 12: 1400, 13: 3500 });
  });

  it('não cria concurso-fantasma ao conferir o mesmo sorteio duas vezes', async () => {
    const history = await isolatedHistory();
    await history.buyTickets({ numbers: DRAW, quantity: 1 });

    const first = await history.registerDraw({
      draw: DRAW,
      sessionId: 'sessao-unica',
      generation: 1,
    });
    const second = await history.registerDraw({
      draw: DRAW,
      sessionId: 'sessao-unica',
      generation: 1,
    });
    const next = await history.registerDraw({
      draw: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      sessionId: 'sessao-unica',
      generation: 2,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.draw.id).toBe(first.draw.id);
    expect(next.created).toBe(true);
    expect((await history.store.getAll('draws'))).toHaveLength(2);
    expect((await history.getSummary()).currentContest).toBe(3);
  });

  it('restaura contadores e preferências ao importar após reset', async () => {
    const history = await isolatedHistory();
    await history.setMaxPrize15Cents(77700000);
    await history.registerDraw({ draw: DRAW, sessionId: 'antes' });
    const backup = await history.exportJson();

    await history.resetSimulation({ confirm: true });
    await history.setMaxPrize15Cents(123456);
    const zerado = await history.getSummary();
    expect(zerado.currentContest).toBe(1);
    expect(zerado.prizeValues[15]).toBe(123456);

    await history.importBackup(backup, { confirm: true });
    const restaurado = await history.getSummary();
    expect(restaurado.currentContest).toBe(2);
    expect(restaurado.prizeValues[15]).toBe(77700000);

    const proximo = await history.registerDraw({ draw: DRAW, sessionId: 'depois' });
    expect(proximo.draw.contest).toBe(2);
  });
});
