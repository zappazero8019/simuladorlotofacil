import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  buildPrizeEvents,
  buildTicketEvent,
  createAggregate,
  createFinancialState,
  getAwardedPercentage,
  getBalance,
  getReturnOnInvestment,
  normalizeCents,
} from '../src/finance/index.js';

const now = '2026-11-20T12:00:00.000Z';

describe('Fase 4 — ledger financeiro', () => {
  it('rejeita valores fracionários e inseguros', () => {
    expect(() => normalizeCents(10.5)).toThrow(RangeError);
    expect(() => normalizeCents(-1)).toThrow(RangeError);
    expect(() => normalizeCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(normalizeCents(0)).toBe(0);
  });

  it('mantém estado puro ao aplicar eventos', () => {
    const state = createFinancialState();
    const event = buildTicketEvent({
      ticket: { id: 't1', size: 15, priceCents: 350 },
      contest: 1,
      seq: 1,
      now,
      id: 'e1',
    });
    const next = applyEvent(state, event);
    expect(next.totals.spentCents).toBe(350);
    expect(state.totals.spentCents).toBe(0);
    expect(next.contests['1'].ticketCount).toBe(1);
  });

  it('constrói eventos de premiação com chave idempotente', () => {
    let counter = 0;
    const events = buildPrizeEvents({
      conference: {
        id: 'c1',
        ticketId: 't1',
        totalPrizeCents: 1400,
        prizeByTier: {
          11: { count: 2, unitCents: 700, subtotalCents: 1400 },
          12: { count: 0, unitCents: 1400, subtotalCents: 0 },
          13: { count: 0, unitCents: 3500, subtotalCents: 0 },
          14: { count: 0, unitCents: 189635, subtotalCents: 0 },
          15: { count: 0, unitCents: 50000000, subtotalCents: 0 },
        },
      },
      contest: 3,
      seqStart: 5,
      now,
      idFactory: () => `p${++counter}`,
    });
    expect(events).toHaveLength(1);
    expect(events[0].key).toBe('prize:c1:11');
    expect(events[0].amountCents).toBe(1400);
    expect(events[0].firstForTicket).toBe(true);
  });

  it('calcula saldo, percentual e retorno corretamente', () => {
    let state = createFinancialState();
    state = applyEvent(state, buildTicketEvent({
      ticket: { id: 't1', size: 15, priceCents: 350 },
      contest: 1, seq: 1, now, id: 'e1',
    }));
    state = applyEvent(state, {
      id: 'e2', type: 'prize', amountCents: 3500, contest: 1,
      size: 15, tier: 13, seq: 2, createdAt: now, firstForTicket: true,
    });
    expect(getBalance(state)).toEqual({ spentCents: 350, receivedCents: 3500, netCents: 3150 });
    expect(getAwardedPercentage(state.totals)).toBe(100);
    expect(getReturnOnInvestment(state.totals)).toBe(10);
    expect(createAggregate().firstAwardSpentCents).toBeNull();
  });
});
