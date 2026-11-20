import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/persistence/memoryStore.js';
import { createHistoryService } from '../src/history/service.js';
import { createIdFactory } from '../src/persistence/ids.js';
import { STORE_NAMES } from '../src/persistence/schema.js';

const validNumbers = Array.from({ length: 15 }, (_, index) => index + 1);

async function setup() {
  const store = createMemoryStore();
  let counter = 0;
  const service = createHistoryService({
    store,
    idFactory: createIdFactory(),
    now: () => '2026-11-20T12:00:00.000Z',
    random: () => {
      counter += 1;
      return (counter % 97) / 97;
    },
  });
  await service.initialize();
  return { store, service };
}

async function populate(service, quantity = 2) {
  await service.setMaxPrize15Cents(123456789);
  await service.buyTickets({ numbers: validNumbers, contest: 1, quantity });
  await service.registerDraw({ numbers: validNumbers, contest: 1 });
  await service.conferTickets({ draw: validNumbers, drawId: 'draw-1', contest: 1, tickets: [] });
}

async function counts(store) {
  return Object.fromEntries(
    await Promise.all(STORE_NAMES.map(async (name) => [name, await store.count(name)])),
  );
}

describe('Reiniciar simulação — serviço', () => {
  it('exige confirmação explícita', async () => {
    const { service } = await setup();
    await expect(service.resetSimulation()).rejects.toThrow('Confirmação explícita');
  });

  it('limpa todas as stores de simulação e zera indicadores', async () => {
    const { store, service } = await setup();
    await populate(service);
    expect((await counts(store)).tickets).toBeGreaterThan(0);
    expect((await counts(store)).draws).toBeGreaterThan(0);
    expect((await counts(store)).financialEvents).toBeGreaterThan(0);

    const result = await service.resetSimulation({ confirm: true });
    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({
      spentCents: 0,
      receivedCents: 0,
      netCents: 0,
      ticketCount: 0,
      contestsWithDraws: 0,
      sequence: 0,
      currentContest: 1,
    });
    const after = await counts(store);
    for (const name of service.simulationStoreNames) {
      if (name === 'aggregates') continue; // recipiente zerado, não apagado
      expect(after[name], name).toBe(0);
    }
    expect(after.aggregates).toBeGreaterThan(0);
    expect(after.settings).toBeGreaterThan(0);
    expect(await service.getEvents()).toMatchObject({ total: 0 });
    expect(await service.getTickets()).toMatchObject({ total: 0 });
    expect(await service.getDraws()).toMatchObject({ total: 0 });
    expect(await service.getStatistics()).toMatchObject({
      totalSpentCents: 0,
      totalReceivedCents: 0,
    });
  });

  it('funciona com milhares de bilhetes sem deixar órfãos', async () => {
    const { store, service } = await setup();
    await populate(service, 2000);
    expect((await counts(store)).tickets).toBe(2000);

    await service.resetSimulation({ confirm: true });
    const after = await counts(store);
    for (const name of STORE_NAMES) {
      if (!service.simulationStoreNames.includes(name) || name === 'aggregates') continue;
      expect(after[name], name).toBe(0);
    }
    const settings = await store.getAll('settings');
    expect(settings.find((row) => row.key === 'maxPrize15Cents').value).toBe(123456789);
  });

  it('preserva prêmio configurado, preferências e metadados pessoais', async () => {
    const { store, service } = await setup();
    await populate(service, 3);
    await service.setMaxPrize15Cents(99900000);
    await service.setPrize14Cents(12345);
    await store.transaction(['settings', 'meta'], (tx) => {
      tx.put('settings', { key: 'tema', value: 'escuro' });
      tx.put('meta', { key: 'preferenciaVisual', value: 'globo' });
    });

    await service.resetSimulation({ confirm: true });
    const settings = Object.fromEntries((await store.getAll('settings')).map((row) => [row.key, row.value]));
    const meta = Object.fromEntries((await store.getAll('meta')).map((row) => [row.key, row.value]));
    expect(settings.maxPrize15Cents).toBe(99900000);
    expect(settings.prize14Cents).toBe(12345);
    expect(settings.tema).toBe('escuro');
    expect(meta.preferenciaVisual).toBe('globo');
    expect(meta.currentContest).toBe(1);
    expect(meta.nextDisplayId).toBe(1);
  });

  it('rejeita compras, sorteios e importações durante o reset', async () => {
    const { service } = await setup();
    await populate(service);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const failTransaction = async () => {
      await gate;
      throw new Error('falha');
    };
    const resetting = service.resetSimulation({ confirm: true, failTransaction }).catch(() => {});
    await new Promise((resolve) => setImmediate(resolve));

    await expect(service.buyTickets({ numbers: validNumbers, quantity: 1 })).rejects.toThrow('Aguarde');
    await expect(service.registerDraw({ numbers: validNumbers })).rejects.toThrow('Aguarde');
    await expect(service.importBackup({ format: 'x' }, { confirm: true })).rejects.toThrow('Aguarde');

    release();
    await resetting;
  });

  it('não reporta sucesso em falha de transação e mantém os dados', async () => {
    const { store, service } = await setup();
    await populate(service);
    const before = await counts(store);

    await expect(service.resetSimulation({
      confirm: true,
      failTransaction: () => { throw new Error('transação abortada'); },
    })).rejects.toThrow(/transação abortada|Falha simulada/);
    expect(await counts(store)).toEqual(before);
  });

  it('a segunda confirmação não altera dados por si só', async () => {
    const { store, service } = await setup();
    await populate(service);
    const before = await counts(store);
    await expect(service.resetSimulation({ confirm: 'REINICIAR' })).rejects.toThrow('Confirmação explícita');
    expect(await counts(store)).toEqual(before);
  });
});
