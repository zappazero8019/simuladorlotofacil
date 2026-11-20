import { PRIZE_TIERS } from '../core/constants.js';

/**
 * Ledger financeiro puro. Todos os valores são centavos inteiros e o estado
 * é atualizado de forma isolada, sem DOM, banco ou configuração externa.
 */
export const LEDGER_TYPES = Object.freeze(['ticket', 'prize', 'poolPrize']);

export function createFinancialState() {
  return {
    totals: {
      spentCents: 0,
      receivedCents: 0,
      ticketCount: 0,
      awardedTicketCount: 0,
      awardCount: 0,
    },
    contests: {},
    bySize: {},
    byTier: {},
    sequence: 0,
  };
}

export function createAggregate() {
  return {
    spentCents: 0,
    receivedCents: 0,
    ticketCount: 0,
    awardCount: 0,
    firstAwardSpentCents: null,
    previousAwardSpentCents: 0,
  };
}

function ensure(map, key) {
  const normalized = String(key);
  if (!map[normalized]) {
    map[normalized] = createAggregate();
    return map[normalized];
  }
  // Cópia antes de mutar: `applyEvent` continua pura mesmo reutilizando o estado.
  map[normalized] = { ...map[normalized] };
  return map[normalized];
}

/** Valida e normaliza um valor monetário em centavos. */
export function normalizeCents(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Valor financeiro deve ser inteiro, não negativo e seguro.');
  }
  return value;
}

/** Evento de débito: compra de um bilhete. */
export function buildTicketEvent({ ticket, contest, batchId = null, seq, now, id }) {
  const size = Number(ticket.size ?? ticket.numbers?.length);
  const amountCents = normalizeCents(ticket.priceCents);
  return {
    id,
    key: `ticket:${ticket.id}`,
    type: 'ticket',
    amountCents,
    contest: Number(contest),
    size,
    tier: null,
    ticketId: ticket.id,
    conferenceId: null,
    drawId: null,
    batchId,
    seq,
    createdAt: now,
  };
}

/** Eventos de crédito: uma faixa premiada por vez, com valor já congelado. */
export function buildPrizeEvents({
  conference, contest, drawId = null, size = null, seqStart = 0, now, idFactory,
}) {
  const events = [];
  let seq = seqStart;
  for (const tier of PRIZE_TIERS) {
    const detail = conference.prizeByTier?.[tier];
    if (!detail || detail.count <= 0) continue;
    const amountCents = normalizeCents(detail.subtotalCents);
    seq += 1;
    events.push({
      id: idFactory(),
      key: `prize:${conference.id}:${tier}`,
      type: 'prize',
      amountCents,
      contest: Number(contest),
      size: size === null ? null : Number(size),
      tier,
      ticketId: conference.ticketId ?? conference.betId ?? null,
      conferenceId: conference.id,
      drawId,
      batchId: null,
      firstForTicket: events.length === 0 && conference.totalPrizeCents > 0,
      seq,
      createdAt: now,
    });
  }
  return events;
}

/**
 * Aplica um evento ao estado agregado. A operação é pura: devolve novo estado.
 */
export function applyEvent(state, event) {
  if (!LEDGER_TYPES.includes(event.type)) {
    throw new TypeError(`Tipo de evento inválido: ${String(event.type)}.`);
  }
  const amountCents = normalizeCents(event.amountCents);
  const next = {
    totals: { ...state.totals },
    contests: { ...state.contests },
    bySize: { ...state.bySize },
    byTier: { ...state.byTier },
    sequence: Math.max(state.sequence, Number(event.seq) || 0),
  };
  const contest = ensure(next.contests, event.contest);

  if (event.type === 'ticket') {
    next.totals.spentCents += amountCents;
    next.totals.ticketCount += 1;
    contest.spentCents += amountCents;
    contest.ticketCount += 1;
    if (event.size !== null && event.size !== undefined) {
      const bySize = ensure(next.bySize, event.size);
      bySize.spentCents += amountCents;
      bySize.ticketCount += 1;
    }
    return next;
  }

  next.totals.receivedCents += amountCents;
  next.totals.awardCount += 1;
  if (event.firstForTicket) next.totals.awardedTicketCount += 1;
  contest.receivedCents += amountCents;
  contest.awardCount += 1;
  if (event.size !== null && event.size !== undefined) {
    ensure(next.bySize, event.size).receivedCents += amountCents;
  }
  if (event.tier !== null && event.tier !== undefined) {
    const byTier = ensure(next.byTier, event.tier);
    byTier.receivedCents += amountCents;
    byTier.awardCount += 1;
    if (byTier.firstAwardSpentCents === null) {
      byTier.firstAwardSpentCents = next.totals.spentCents;
    }
    byTier.previousAwardSpentCents = next.totals.spentCents;
  }
  return next;
}

/** Saldo líquido = recebido − gasto. */
export function getBalance(state) {
  const { spentCents, receivedCents } = state.totals;
  return { spentCents, receivedCents, netCents: receivedCents - spentCents };
}

/** Percentual de bilhetes premiados, com zero seguro. */
export function getAwardedPercentage(totals) {
  if (!totals.ticketCount) return 0;
  return (totals.awardedTicketCount / totals.ticketCount) * 100;
}

/** Relação entre retorno e investimento; `null` quando ainda não houve gasto. */
export function getReturnOnInvestment(totals) {
  if (!totals.spentCents) return null;
  return totals.receivedCents / totals.spentCents;
}
