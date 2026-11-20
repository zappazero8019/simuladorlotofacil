import { describe, expect, it } from 'vitest';
import {
  computeStatistics,
  getConsecutivePrizeCosts,
  getContestStatistics,
  getCumulativeBalance,
  getFirstPrizeCosts,
  getMaxPrizeCents,
  getPrizesByTier,
} from '../src/statistics/index.js';

const events = [
  { type: 'ticket', seq: 1, amountCents: 350, contest: 1, size: 15, createdAt: '2026-01-01' },
  { type: 'ticket', seq: 2, amountCents: 350, contest: 1, size: 15, createdAt: '2026-01-02' },
  { type: 'prize', seq: 3, amountCents: 700, contest: 1, size: 15, tier: 11, ticketId: 't1', createdAt: '2026-01-03' },
  { type: 'ticket', seq: 4, amountCents: 5600, contest: 2, size: 16, createdAt: '2026-01-04' },
  { type: 'prize', seq: 5, amountCents: 1400, contest: 2, size: 16, tier: 11, ticketId: 't2', createdAt: '2026-01-05' },
  { type: 'ticket', seq: 6, amountCents: 350, contest: 2, size: 15, createdAt: '2026-01-06' },
  { type: 'prize', seq: 7, amountCents: 3500, contest: 2, size: 15, tier: 13, ticketId: 't3', createdAt: '2026-01-07' },
];

const tickets = [
  { id: 't1', contest: 1, size: 15, priceCents: 350 },
  { id: 't2', contest: 1, size: 15, priceCents: 350 },
  { id: 't3', contest: 2, size: 16, priceCents: 5600 },
];

describe('Fase 4 — estatísticas', () => {
  it('agrupa bilhetes e gastos por concurso', () => {
    const stats = getContestStatistics(tickets);
    expect(stats.perContest).toEqual([
      { contest: 1, ticketCount: 2, spentCents: 700 },
      { contest: 2, ticketCount: 1, spentCents: 5600 },
    ]);
    expect(stats.averageTicketsPerContest).toBe(1.5);
    expect(stats.averageSpendPerContest).toBe(3150);
    expect(stats.maxSpendInContestCents).toBe(5600);
  });

  it('agrupa prêmios por faixa apenas com dados reais', () => {
    expect(getPrizesByTier(events)).toEqual([
      { tier: 11, count: 2, prizeCount: 2, totalCents: 2100 },
      { tier: 13, count: 1, prizeCount: 1, totalCents: 3500 },
    ]);
    expect(getMaxPrizeCents(events)).toBe(3500);
  });

  it('calcula custo até a primeira premiação de cada faixa', () => {
    const costs = getFirstPrizeCosts(events);
    expect(costs.find((item) => item.tier === 11)).toMatchObject({ spentCentsBeforePrize: 700 });
    expect(costs.find((item) => item.tier === 13)).toMatchObject({ spentCentsBeforePrize: 6650 });
  });

  it('calcula custo entre premiações consecutivas', () => {
    const gaps = getConsecutivePrizeCosts(events, [11]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].spentCentsBetween).toBe(5600);
  });

  it('não inventa pontos em períodos sem premiação', () => {
    const series = getCumulativeBalance(events);
    expect(series).toHaveLength(events.length);
    expect(series.at(-1)).toMatchObject({ spentCents: 6650, receivedCents: 5600, netCents: -1050 });
  });

  it('compõe estatísticas completas', () => {
    const stats = computeStatistics({ events, tickets });
    expect(stats.totalSpentCents).toBe(6650);
    expect(stats.totalReceivedCents).toBe(5600);
    expect(stats.netCents).toBe(-1050);
    expect(stats.awardedTickets).toBe(3);
    expect(stats.returnOnInvestment).toBeCloseTo(5600 / 6650);
  });
});
