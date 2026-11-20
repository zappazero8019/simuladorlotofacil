import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../src/persistence/memoryStore.js';
import { createHistoryService } from '../src/history/service.js';
import { createIdFactory } from '../src/persistence/ids.js';
import { planCelebration, RESULT_MESSAGES } from '../src/results/index.js';

const SETTINGS_OFF = { testModeEnabled: false, testProbabilityPercent: 25 };

function conference(overrides = {}) {
  return Object.freeze({
    betId: 1,
    contest: 1,
    numbers: [1, 2, 3],
    drawnNumbers: [4, 5, 6],
    matches: 0,
    totalPrizeCents: 0,
    ...overrides,
  });
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function makeService(store = createMemoryStore()) {
  return createHistoryService({
    store,
    idFactory: createIdFactory(),
    now: () => '2026-11-20T18:00:00.000Z',
    random: () => 0.42,
  });
}

describe('Fase 9 — mensagens de resultado', () => {
  it('usa o texto exato para bilhete não contemplado', () => {
    const plan = planCelebration({ conferences: [conference()], settings: SETTINGS_OFF });
    expect(plan.items[0].message).toBe('BILHETE NÃO CONTEMPLADO');
    expect(plan.items[0].notice).toBeNull();
    expect(plan.items[0].intensity).toBe('nenhuma');
    expect(plan.summary.fireworks).toBe(false);
  });

  it('usa o texto exato para contemplação verdadeira', () => {
    const plan = planCelebration({
      conferences: [conference({ matches: 11, totalPrizeCents: 700 })],
      settings: SETTINGS_OFF,
    });
    expect(plan.items[0].message).toBe('BILHETE CONTEMPLADO!');
    expect(plan.items[0].realWin).toBe(true);
    expect(plan.items[0].simulated).toBe(false);
    expect(plan.items[0].notice).toBeNull();
    expect(plan.items[0].intensity).toBe('discreta');
  });

  it('gradua a comemoração pelo valor efetivamente recebido, não pelo teto', () => {
    const small = planCelebration({
      conferences: [conference({ totalPrizeCents: 3500 })], settings: SETTINGS_OFF,
    });
    const medium = planCelebration({
      conferences: [conference({ totalPrizeCents: 189635 })], settings: SETTINGS_OFF,
    });
    const large = planCelebration({
      conferences: [conference({ totalPrizeCents: 50000000 })], settings: SETTINGS_OFF,
    });
    expect(small.items[0].intensity).toBe('moderada');
    expect(medium.items[0].intensity).toBe('grande');
    expect(large.items[0].intensity).toBe('grande');
    expect(large.summary.fireworks).toBe(true);
  });

  it('apresenta resultados individuais e resumo sem declarar todos contemplados', () => {
    const plan = planCelebration({
      conferences: [
        conference({ betId: 10, matches: 11, totalPrizeCents: 700 }),
        conference({ betId: 11, matches: 0, totalPrizeCents: 0 }),
      ],
      settings: SETTINGS_OFF,
    });
    expect(plan.summary).toMatchObject({
      total: 2, realWinners: 1, simulatedWinners: 0, receivedCents: 700,
    });
    expect(plan.items.map((item) => item.realWin)).toEqual([true, false]);
  });
});

describe('Fase 9 — modo de teste com RNG injetável', () => {
  it('mantém o aviso obrigatório ativo mesmo quando a simulação não dispara', () => {
    const plan = planCelebration({
      conferences: [conference({ matches: 12, totalPrizeCents: 1400 })],
      settings: { testModeEnabled: true, testProbabilityPercent: 1 },
      random: () => 0.9,
    });
    expect(plan.summary.testModeActive).toBe(true);
    expect(plan.summary.simulatedWinners).toBe(0);
    expect(plan.items[0].notice).toBeNull();
  });

  it('a 100% sempre simula e não consome o RNG', () => {
    const random = vi.fn(() => 0.999999);
    const plan = planCelebration({
      conferences: [conference()],
      settings: { testModeEnabled: true, testProbabilityPercent: 100 },
      random,
    });
    expect(plan.items[0].simulated).toBe(true);
    expect(plan.items[0].message).toBe(RESULT_MESSAGES.win);
    expect(plan.items[0].notice).toBe(RESULT_MESSAGES.simulation);
    expect(random).not.toHaveBeenCalled();
  });

  it('a 1% usa o RNG injetado sem testes probabilísticos frágeis', () => {
    const settings = { testModeEnabled: true, testProbabilityPercent: 1 };
    const activates = planCelebration({
      conferences: [conference()], settings, random: () => 0.005,
    });
    const doesNotActivate = planCelebration({
      conferences: [conference()], settings, random: () => 0.02,
    });
    expect(activates.items[0].simulated).toBe(true);
    expect(doesNotActivate.items[0].simulated).toBe(false);
    expect(doesNotActivate.items[0].message).toBe(RESULT_MESSAGES.loss);
  });

  it('nunca reclassifica uma contemplação verdadeira', () => {
    const random = vi.fn(() => 0);
    const plan = planCelebration({
      conferences: [conference({ matches: 12, totalPrizeCents: 1400 })],
      settings: { testModeEnabled: true, testProbabilityPercent: 100 },
      random,
    });
    expect(plan.items[0].realWin).toBe(true);
    expect(plan.items[0].simulated).toBe(false);
    expect(plan.items[0].notice).toBeNull();
    expect(random).not.toHaveBeenCalled();
  });

  it('não altera os dados originais da conferência', () => {
    const original = deepFreeze([conference({ matches: 11, totalPrizeCents: 700 })]);
    const snapshot = JSON.stringify(original);
    const plan = planCelebration({
      conferences: original,
      settings: { testModeEnabled: true, testProbabilityPercent: 100 },
      random: () => 0.5,
    });
    expect(plan.items[0].notice).toBeNull();
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('Fase 9 — separação matemática e financeira', () => {
  it('simulação não cria crédito nem altera estatísticas reais', async () => {
    const store = createMemoryStore();
    const service = makeService(store);
    await service.initialize();
    await service.setPreference('testModeEnabled', true);
    await service.setPreference('testProbabilityPercent', 100);

    const numbers = Array.from({ length: 15 }, (_, index) => index + 1);
    const losingDraw = Array.from({ length: 15 }, (_, index) => index + 11);
    await service.buyTickets({ numbers });
    const draw = await service.registerDraw({
      draw: losingDraw, sessionId: 'fase9', generation: 1,
    });
    const conferences = (await service.conferTickets({
      tickets: await store.getAll('tickets'),
      draw: losingDraw,
      drawId: draw.draw.id,
      contest: draw.draw.contest,
    })).conferences;
    expect(conferences).toHaveLength(1);
    expect(conferences[0].totalPrizeCents).toBe(0);

    const before = {
      summary: await service.getSummary(),
      statistics: await service.getStatistics(),
      events: await service.getEvents(),
      prizes: await service.getPrizes(),
    };
    const settings = (await service.getSummary()).settings;
    const plan = planCelebration({ conferences, settings, random: () => 0 });
    expect(plan.items[0].simulated).toBe(true);
    expect(plan.summary.receivedCents).toBe(0);

    expect(await service.getSummary()).toEqual(before.summary);
    expect(await service.getStatistics()).toEqual(before.statistics);
    expect(await service.getEvents()).toEqual(before.events);
    expect(await service.getPrizes()).toEqual(before.prizes);
    service.dispose?.();
  });

  it('persiste todas as preferências e as preserva após reset completo', async () => {
    const store = createMemoryStore();
    const first = makeService(store);
    await first.initialize();
    await first.setPreference('musicEnabled', false);
    await first.setPreference('sfxEnabled', false);
    await first.setPreference('musicVolume', 12);
    await first.setPreference('sfxVolume', 88);
    await first.setPreference('testModeEnabled', true);
    await first.setPreference('testProbabilityPercent', 73);

    const restored = makeService(store);
    await restored.initialize();
    const persisted = (await restored.getSummary()).settings;
    expect(persisted).toMatchObject({
      musicEnabled: false,
      sfxEnabled: false,
      musicVolume: 12,
      sfxVolume: 88,
      testModeEnabled: true,
      testProbabilityPercent: 73,
    });

    await restored.buyTickets({ numbers: Array.from({ length: 15 }, (_, i) => i + 1) });
    const result = await restored.resetSimulation({ confirm: true });
    expect(result.preservedSettings).toMatchObject({
      musicEnabled: false,
      sfxEnabled: false,
      musicVolume: 12,
      sfxVolume: 88,
      testModeEnabled: true,
      testProbabilityPercent: 73,
    });
    expect((await restored.getSummary()).ticketCount).toBe(0);
  });

  it('rejeita preferências inválidas sem gravar nada', async () => {
    const service = makeService();
    await service.initialize();
    await expect(service.setPreference('testProbabilityPercent', 0)).rejects.toBeInstanceOf(RangeError);
    await expect(service.setPreference('musicVolume', 101)).rejects.toBeInstanceOf(RangeError);
    await expect(service.setPreference('maxPrize15Cents', 1)).rejects.toBeInstanceOf(RangeError);
    expect((await service.getSummary()).settings.testProbabilityPercent).toBe(25);
  });
});
