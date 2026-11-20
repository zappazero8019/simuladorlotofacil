import {
  getSharePercentage,
  getSharePriceCents,
  splitAmountCents,
  validatePoolShares,
} from './pricing.js';

/**
 * Normaliza participantes fictícios. Aceita nomes (uma cota cada) ou objetos
 * `{ name, shares }`. Se omitidos, cria cotas anônimas numeradas.
 */
function normalizeParticipants(participants, shares) {
  if (participants === undefined || participants === null) {
    return Array.from({ length: shares }, (_, index) => ({
      name: `Cota ${index + 1}`,
      shares: 1,
    }));
  }
  if (!Array.isArray(participants)) {
    throw new TypeError('participants deve ser um array.');
  }

  const normalized = participants.map((entry, index) => {
    if (typeof entry === 'string') {
      return { name: entry, shares: 1 };
    }
    const name = entry?.name;
    const count = entry?.shares ?? 1;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new TypeError(`Participante ${index + 1} precisa de um nome.`);
    }
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError(`Participante ${name} tem cotas inválidas.`);
    }
    return { name: name.trim(), shares: count };
  });

  const total = normalized.reduce((sum, member) => sum + member.shares, 0);
  if (total !== shares) {
    throw new RangeError(
      `A soma das cotas dos participantes (${total}) deve ser ${shares}.`,
    );
  }
  return normalized;
}

/** Distribui as partes (já com o resíduo na última) entre os participantes. */
function groupParts(participants, parts) {
  let cursor = 0;
  return participants.map((member) => {
    const ownParts = parts.slice(cursor, cursor + member.shares);
    cursor += member.shares;
    return {
      name: member.name,
      shares: member.shares,
      percentage: getSharePercentage(parts.length) * member.shares,
      amountCents: ownParts.reduce((sum, value) => sum + value, 0),
    };
  });
}

/**
 * Bolão fictício: cotas, participantes e rateio. Toda a matemática de cotas
 * vem de `pricing.js`; nenhuma aposta é gerada aqui.
 */
export function createPool({
  betSize,
  totalCents,
  shares,
  participants = undefined,
} = {}) {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new RangeError('totalCents deve ser inteiro e não negativo.');
  }
  const validShares = validatePoolShares(betSize, shares);
  const members = normalizeParticipants(participants, validShares);
  const parts = splitAmountCents(totalCents, validShares);
  const distribution = groupParts(members, parts);

  return Object.freeze({
    betSize,
    totalCents,
    shares: validShares,
    shareCents: getSharePriceCents(totalCents, validShares),
    sharePercentage: getSharePercentage(validShares),
    members: Object.freeze(distribution),
  });
}

/** Divide o prêmio simulado entre os cotistas, respeitando as cotas de cada um. */
export function distributePoolPrize(pool, prizeCents) {
  if (!pool || !Array.isArray(pool.members)) {
    throw new TypeError('Bolão inválido.');
  }
  if (!Number.isInteger(prizeCents) || prizeCents < 0) {
    throw new RangeError('prizeCents deve ser inteiro e não negativo.');
  }
  const parts = splitAmountCents(prizeCents, pool.shares);
  return groupParts(
    pool.members.map(({ name, shares }) => ({ name, shares })),
    parts,
  );
}
