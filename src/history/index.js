/** Consultas puras sobre histórico: filtros, ordenação e paginação. */

function normalizeNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Normaliza filtros vindos da interface ou de uma consulta programática. */
export function normalizeFilters(filters = {}) {
  const period = filters.period ?? {};
  return {
    contest: normalizeNumber(filters.contest),
    size: normalizeNumber(filters.size),
    tier: normalizeNumber(filters.tier),
    type: filters.type || null,
    ticketId: filters.ticketId || null,
    from: period.from || filters.from || null,
    to: period.to || filters.to || null,
  };
}

/** Aplica filtros a eventos/bilhetes sem alterar os originais. */
export function filterRecords(records, rawFilters = {}) {
  const filters = normalizeFilters(rawFilters);
  return records.filter((record) => {
    if (filters.contest !== null && Number(record.contest) !== filters.contest) return false;
    if (filters.size !== null && Number(record.size) !== filters.size) return false;
    if (filters.tier !== null && Number(record.tier) !== filters.tier) return false;
    if (filters.type && record.type !== filters.type) return false;
    if (filters.ticketId && record.ticketId !== filters.ticketId) return false;
    if (filters.from && record.createdAt < filters.from) return false;
    if (filters.to && record.createdAt > filters.to) return false;
    return true;
  });
}

/** Ordem cronológica real: `seq` quando disponível, senão `createdAt`. */
export function sortChronologically(records, direction = 'asc') {
  const factor = direction === 'desc' ? -1 : 1;
  return [...records].sort((left, right) => {
    const leftSeq = Number(left.seq);
    const rightSeq = Number(right.seq);
    if (Number.isFinite(leftSeq) && Number.isFinite(rightSeq) && leftSeq !== rightSeq) {
      return (leftSeq - rightSeq) * factor;
    }
    const leftTime = String(left.createdAt ?? '');
    const rightTime = String(right.createdAt ?? '');
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime) * factor;
    return String(left.id ?? left.key ?? '').localeCompare(String(right.id ?? right.key ?? '')) * factor;
  });
}

/**
 * Paginação estável. `pageSize` é limitado apenas para proteger a renderização,
 * nunca para limitar a quantidade total de registros.
 */
export function paginate(records, { page = 1, pageSize = 50 } = {}) {
  const size = Math.max(1, Number(pageSize) || 50);
  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * size;
  const items = records.slice(start, start + size);
  return {
    items,
    page: current,
    pageSize: size,
    total,
    totalPages,
    hasMore: current < totalPages,
    nextPage: current < totalPages ? current + 1 : null,
  };
}

/** Agrupa registros por uma chave derivada. */
export function groupBy(records, keyFn) {
  const groups = new Map();
  for (const record of records) {
    const key = String(keyFn(record));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return groups;
}

/** Série acumulada de gastos e recebimentos em ordem cronológica. */
export function buildCumulativeSeries(events) {
  let spentCents = 0;
  let receivedCents = 0;
  return sortChronologically(events).map((event) => {
    if (event.type === 'ticket') spentCents += event.amountCents;
    else receivedCents += event.amountCents;
    return {
      seq: event.seq,
      createdAt: event.createdAt,
      spentCents,
      receivedCents,
      netCents: receivedCents - spentCents,
    };
  });
}
