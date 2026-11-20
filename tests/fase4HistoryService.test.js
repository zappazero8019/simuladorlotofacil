import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/persistence/memoryStore.js';
import { createHistoryService } from '../src/history/service.js';
import { createIdFactory } from '../src/persistence/ids.js';
import { STORE_NAMES } from '../src/persistence/schema.js';
import { validateBackup } from '../src/persistence/backup.js';

const validNumbers = Array.from({ length: 15 }, (_, index) => index + 1);
const now = () => '2026-11-20T12:00:00.000Z';

function makeService(store = createMemoryStore()) {
  let counter = 0;
  return createHistoryService({
    store,
    idFactory: createIdFactory(),
    now,
    random: () => {
      counter += 1;
      return (counter % 97) / 97;
    },
  });
}

async function setup() {
  const store = createMemoryStore();
  const service = makeService(store);
  await service.initialize();
  return { store, service };
}

describe('Fase 4 — serviço de histórico', () => {
  it('inicializa esquema, configurações e agregados sem apagar nada', async () => {
    const { store, service } = await setup();
    const meta = await store.getAll('meta');
    expect(meta.map((row) => row.key)).toEqual(
      expect.arrayContaining(['schema', 'sequence', 'currentContest', 'nextDisplayId']),
    );
    const settings = await store.getAll('settings');
    expect(settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'maxPrize15Cents', value: 50000000 }),
      expect.objectContaining({ key: 'prize14Cents', value: 189635 }),
    ]));
    expect((await service.getSummary()).ticketCount).toBe(0);
  });

  it('compra um bilhete e registra o débito na mesma transação', async () => {
    const { store, service } = await setup();
    const { tickets, events } = await service.buyTickets({ numbers: validNumbers, contest: 1 });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].priceCents).toBe(350);
    expect(events[0].key).toBe(`ticket:${tickets[0].id}`);
    expect(await store.count('tickets')).toBe(1);
    expect(await store.count('financialEvents')).toBe(1);
    const summary = await service.getSummary();
    expect(summary.spentCents).toBe(350);
    expect(summary.netCents).toBe(-350);
  });

  it('compra vários bilhetes em uma operação, com IDs distintos', async () => {
    const { service } = await setup();
    const { tickets } = await service.buyTickets({ numbers: validNumbers, quantity: 500 });
    expect(tickets).toHaveLength(500);
    expect(new Set(tickets.map((ticket) => ticket.id)).size).toBe(500);
    expect(new Set(tickets.map((ticket) => ticket.displayId)).size).toBe(500);
    expect(tickets[0].numbers).toEqual(tickets[499].numbers);
    expect((await service.getSummary()).spentCents).toBe(500 * 350);
  });

  it('aceita milhares de bilhetes sem limite artificial', async () => {
    const { store, service } = await setup();
    const { tickets } = await service.buyTickets({ numbers: validNumbers, quantity: 3000 });
    expect(tickets).toHaveLength(3000);
    expect(await store.count('tickets')).toBe(3000);
    expect((await service.getSummary()).ticketCount).toBe(3000);
  });

  it('permite quantidades diferentes de dezenas na mesma compra', async () => {
    const { service } = await setup();
    const numbers16 = Array.from({ length: 16 }, (_, index) => index + 1);
    const { tickets } = await service.buyTickets({
      items: [{ numbers: validNumbers }, { numbers: numbers16, contests: 2 }],
    });
    expect(tickets.map((ticket) => ticket.size)).toEqual([15, 16]);
    expect(tickets.map((ticket) => ticket.priceCents)).toEqual([350, 5600]);
    expect(tickets[1].contests).toBe(2);
  });

  it('protege operações repetidas com clientKey, sem bloquear bilhetes idênticos', async () => {
    const { store, service } = await setup();
    const first = await service.buyTickets({ numbers: validNumbers, clientKey: 'op-1' });
    const second = await service.buyTickets({ numbers: validNumbers, clientKey: 'op-1' });
    expect(first.tickets).toHaveLength(1);
    expect(second.tickets).toHaveLength(0);
    expect(second.skippedDuplicates).toBe(1);
    expect(await store.count('tickets')).toBe(1);
    const free = await service.buyTickets({ numbers: validNumbers });
    expect(free.tickets).toHaveLength(1);
    expect(await store.count('tickets')).toBe(2);
  });

  it('restaura bilhetes e conferências após recriar o serviço', async () => {
    const store = createMemoryStore();
    const first = makeService(store);
    await first.initialize();
    await first.buyTickets({ numbers: validNumbers, quantity: 3 });
    const draw = await first.registerDraw({ draw: validNumbers, sessionId: 's1', mode: 'globo' });
    await first.conferTickets({
      tickets: (await store.getAll('tickets')),
      draw: validNumbers,
      drawId: draw.draw.id,
      contest: draw.draw.contest,
    });

    const restored = makeService(store);
    await restored.initialize();
    const snapshot = await restored.restoreState();
    expect(snapshot.tickets).toHaveLength(3);
    expect(snapshot.conferences).toHaveLength(3);
    expect((await restored.getSummary()).spentCents).toBe(3 * 350);
  });

  it('não contabiliza a mesma premiação duas vezes', async () => {
    const { store, service } = await setup();
    await service.buyTickets({ numbers: validNumbers });
    const draw = await service.registerDraw({ draw: validNumbers });
    const tickets = await store.getAll('tickets');
    const first = await service.conferTickets({
      tickets, draw: validNumbers, drawId: draw.draw.id, contest: draw.draw.contest,
    });
    const second = await service.conferTickets({
      tickets, draw: validNumbers, drawId: draw.draw.id, contest: draw.draw.contest,
    });
    expect(first.conferences).toHaveLength(1);
    expect(second.conferences).toHaveLength(0);
    const summary = await service.getSummary();
    expect(summary.receivedCents).toBe(50000000);
    expect(summary.awardedTickets).toBe(1);
  });

  it('registra faixas 11 a 15 com valores congelados na compra', async () => {
    const { store, service } = await setup();
    await service.buyTickets({ numbers: validNumbers, quantity: 2 });
    await service.setMaxPrize15Cents(123456);
    const draw = await service.registerDraw({ draw: validNumbers });
    await service.conferTickets({
      tickets: await store.getAll('tickets'),
      draw: validNumbers,
      drawId: draw.draw.id,
      contest: draw.draw.contest,
    });
    const prizes = await service.getPrizes();
    expect(prizes.items).toHaveLength(2);
    expect(prizes.items[0].tier).toBe(15);
    expect(prizes.items[0].unitCents).toBe(50000000);
    expect(prizes.items[0].subtotalCents).toBe(50000000);
    const summary = await service.getSummary();
    expect(summary.prizesByTier['15']).toBe(100000000);
    expect(summary.prizesByTier['11']).toBeUndefined();
  });

  it('configuração nova não altera resultados antigos', async () => {
    const { store, service } = await setup();
    await service.buyTickets({ numbers: validNumbers });
    const draw = await service.registerDraw({ draw: validNumbers });
    await service.conferTickets({
      tickets: await store.getAll('tickets'),
      draw: validNumbers,
      drawId: draw.draw.id,
      contest: draw.draw.contest,
    });
    await service.setMaxPrize15Cents(1);
    const oldConference = (await store.getAll('conferences'))[0];
    expect(oldConference.totalPrizeCents).toBe(50000000);
    expect((await service.getSummary()).receivedCents).toBe(50000000);
  });

  it('filtra por concurso, período, dezenas e faixa', async () => {
    const { service } = await setup();
    const numbers16 = Array.from({ length: 16 }, (_, index) => index + 1);
    await service.buyTickets({ numbers: validNumbers, contest: 1 });
    await service.buyTickets({ numbers: numbers16, contest: 2 });
    await service.registerDraw({ draw: validNumbers, contest: 1 });
    await service.registerDraw({ draw: validNumbers, contest: 2 });

    expect((await service.getEvents({ contest: 1 })).items).toHaveLength(1);
    expect((await service.getEvents({ size: 16 })).items).toHaveLength(1);
    expect((await service.getEvents({ type: 'prize' })).items).toHaveLength(0);
    expect((await service.getTickets({ contest: 2 })).items).toHaveLength(1);
    expect((await service.getEvents({ from: '2026-11-21' })).items).toHaveLength(0);
    const page = await service.getTickets({}, { page: 1, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
    expect(page.nextPage).toBe(2);
  });

  it('gera estatísticas a partir de eventos reais', async () => {
    const { store, service } = await setup();
    await service.buyTickets({ numbers: validNumbers, quantity: 2, contest: 1 });
    const firstDraw = await service.registerDraw({ draw: validNumbers, contest: 1 });
    await service.conferTickets({
      tickets: await store.getAll('tickets'),
      draw: validNumbers,
      drawId: firstDraw.draw.id,
      contest: 1,
    });
    await service.buyTickets({ numbers: validNumbers, contest: 2 });
    const secondDraw = await service.registerDraw({ draw: validNumbers, contest: 2 });
    await service.conferTickets({
      tickets: (await store.getAll('tickets')).slice(-1),
      draw: validNumbers,
      drawId: secondDraw.draw.id,
      contest: 2,
    });
    const stats = await service.getStatistics();
    expect(stats.contestsParticipated).toBe(2);
    expect(stats.totalSpentCents).toBe(1050);
    expect(stats.firstPrizeCosts.find((item) => item.tier === 15).spentCentsBeforePrize).toBe(700);
    const gaps = stats.consecutivePrizeCosts.filter((item) => item.tier === 15);
    expect(gaps).toHaveLength(2);
    expect(gaps[0].spentCentsBetween).toBe(0);
    expect(gaps[1].spentCentsBetween).toBe(350);
  });

  it('exporta e importa backup com mesclagem segura', async () => {
    const { service } = await setup();
    await service.buyTickets({ numbers: validNumbers, quantity: 2 });
    const backup = await service.exportJson();
    expect(backup.format).toBe('simulador-lotofacil-backup');
    expect(backup.counts.tickets).toBe(2);
    expect(() => validateBackup(backup)).not.toThrow();
    await expect(service.importBackup(backup, { confirm: false })).rejects.toThrow(/Confirmação/);

    const fresh = makeService(createMemoryStore());
    await fresh.initialize();
    await fresh.buyTickets({ numbers: validNumbers });
    const result = await fresh.importBackup(backup, { confirm: true });
    expect(result.mode).toBe('merge');
    expect(result.added.tickets).toBe(2);
    expect((await fresh.getSummary()).ticketCount).toBe(3);
    await fresh.importBackup(backup, { confirm: true });
    expect((await fresh.getSummary()).ticketCount).toBe(3);
  });

  it('rejeita backup inválido', () => {
    expect(() => validateBackup({ format: 'outro', version: 1, data: {} })).toThrow();
    expect(() => validateBackup({
      format: 'simulador-lotofacil-backup', version: 99, data: {},
    })).toThrow();
  });

  it('exporta CSV do ledger com centavos inteiros', async () => {
    const { service } = await setup();
    await service.buyTickets({ numbers: validNumbers });
    const csv = await service.exportCsv();
    expect(csv.split('\r\n')[0]).toContain('amountCents');
    expect(csv).toContain('350');
  });

  it('preserva dados ao simular atualização de esquema', async () => {
    const { store, service } = await setup();
    await service.buyTickets({ numbers: validNumbers, quantity: 2 });
    expect(STORE_NAMES).toContain('tickets');
    const before = await store.getAll('tickets');
    const second = makeService(store);
    await second.initialize();
    expect(await store.getAll('tickets')).toEqual(before);
  });
});
