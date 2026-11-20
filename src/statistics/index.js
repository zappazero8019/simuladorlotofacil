import { PRIZE_TIERS } from '../core/constants.js';
import { buildCumulativeSeries, groupBy } from '../history/index.js';
import { getAwardedPercentage, getReturnOnInvestment } from '../finance/index.js';

/**
 * Estatísticas descritivas. Nenhum valor é inventado para períodos sem
 * premiação: todas as séries derivam de eventos reais, em ordem cronológica.
 */

const sum = (values) => values.reduce((total, value) => total + value, 0);
const average = (values) => (values.length ? sum(values) / values.length : 0);

/** Bilhetes e gasto por concurso, a partir dos bilhetes reais. */
export function getTicketsPerContest(tickets = []) {
  const groups = groupBy(tickets, (ticket) => ticket.contest ?? 1);
  return [...groups.entries()]
    .map(([contest, items]) => ({
      contest: Number(contest),
      ticketCount: items.length,
      spentCents: sum(items.map((item) => item.priceCents ?? 0)),
    }))
    .sort((left, right) => left.contest - right.contest);
}

export function getContestStatistics(tickets = []) {
  const perContest = getTicketsPerContest(tickets);
  const counts = perContest.map((item) => item.ticketCount);
  const spends = perContest.map((item) => item.spentCents);
  return {
    perContest,
    averageTicketsPerContest: average(counts),
    averageSpendPerContest: average(spends),
    maxSpendInContestCents: spends.length ? Math.max(...spends) : 0,
    maxTicketsInContest: counts.length ? Math.max(...counts) : 0,
    contestsParticipated: perContest.length,
  };
}

/** Maior premiação single recebida, em centavos. */
export function getMaxPrizeCents(prizeEvents = []) {
  const amounts = prizeEvents
    .filter((event) => event.type === 'prize')
    .map((event) => event.amountCents);
  return amounts.length ? Math.max(...amounts) : 0;
}

/** Total de premiações por faixa (somente faixas com eventos reais). */
export function getPrizesByTier(prizeEvents = []) {
  const groups = groupBy(
    prizeEvents.filter((event) => event.type === 'prize' && event.tier !== null),
    (event) => event.tier,
  );
  return PRIZE_TIERS
    .filter((tier) => groups.has(String(tier)))
    .map((tier) => {
      const items = groups.get(String(tier));
      return {
        tier,
        count: sum(items.map((item) => item.count ?? 1)),
        prizeCount: items.length,
        totalCents: sum(items.map((item) => item.amountCents)),
      };
    });
}

/**
 * Custo acumulado no instante da primeira premiação de cada faixa.
 * Usa `seq` real; nenhuma premiação fictícia é inserida.
 */
export function getFirstPrizeCosts(events = [], tiers = PRIZE_TIERS) {
  const ordered = [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  let spentCents = 0;
  const found = new Map();
  for (const event of ordered) {
    if (event.type === 'ticket') {
      spentCents += event.amountCents;
      continue;
    }
    if (event.type !== 'prize' || found.has(event.tier)) continue;
    found.set(event.tier, {
      tier: event.tier,
      spentCentsBeforePrize: spentCents,
      prizeCents: event.amountCents,
      seq: event.seq,
      createdAt: event.createdAt,
    });
  }
  return tiers.filter((tier) => found.has(tier)).map((tier) => found.get(tier));
}

/** Custo entre premiações consecutivas da mesma faixa, em ordem real. */
export function getConsecutivePrizeCosts(events = [], tiers = PRIZE_TIERS) {
  const ordered = [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const previous = new Map();
  const gaps = [];
  let spentSoFar = 0;
  for (const event of ordered) {
    if (event.type === 'ticket') {
      spentSoFar += event.amountCents;
      continue;
    }
    if (event.type !== 'prize' || !tiers.includes(event.tier)) continue;
    if (previous.has(event.tier)) {
      gaps.push({
        tier: event.tier,
        fromSeq: previous.get(event.tier).seq,
        toSeq: event.seq,
        spentCentsBetween: spentSoFar - previous.get(event.tier).spentCents,
        createdAt: event.createdAt,
      });
    }
    previous.set(event.tier, { seq: event.seq, spentCents: spentSoFar });
  }
  return gaps;
}

/** Série acumulada de saldo; apenas pontos de eventos reais. */
export function getCumulativeBalance(events = []) {
  return buildCumulativeSeries(events);
}

/** Conjunto completo de estatísticas usado pelo painel. */
export function computeStatistics({ events = [], tickets = [], totals } = {}) {
  const contestStats = getContestStatistics(tickets);
  const prizeEvents = events.filter((event) => event.type === 'prize');
  const effectiveTotals = totals ?? {
    ticketCount: tickets.length,
    awardedTicketCount: new Set(prizeEvents.map((event) => event.ticketId)).size,
    spentCents: sum(events.filter((event) => event.type === 'ticket').map((e) => e.amountCents)),
    receivedCents: sum(prizeEvents.map((event) => event.amountCents)),
  };
  const { spentCents, receivedCents } = effectiveTotals;
  return {
    ...contestStats,
    totalSpentCents: spentCents,
    totalReceivedCents: receivedCents,
    netCents: receivedCents - spentCents,
    awardedTickets: effectiveTotals.awardedTicketCount ?? 0,
    awardedPercentage: getAwardedPercentage(effectiveTotals),
    returnOnInvestment: getReturnOnInvestment(effectiveTotals),
    maxPrizeCents: getMaxPrizeCents(prizeEvents),
    prizesByTier: getPrizesByTier(prizeEvents),
    firstPrizeCosts: getFirstPrizeCosts(events),
    consecutivePrizeCosts: getConsecutivePrizeCosts(events),
    cumulativeBalance: getCumulativeBalance(events),
  };
}
