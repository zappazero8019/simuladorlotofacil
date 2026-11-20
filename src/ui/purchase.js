import { formatCurrency } from '../bets/index.js';

/**
 * Auxiliares puros da compra na interface. Nenhuma regra de preço, sorteado ou
 * persistência é reimplementada aqui: apenas validação de entrada e prévia.
 */

/** Quantidade de bilhetes: inteiro positivo, sem teto artificial. */
export function normalizeQuantity(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RangeError('Informe um número inteiro positivo de bilhetes.');
  }
  return parsed;
}

/** Prévia baseada no preço já centralizado em `src/bets/pricing.js`. */
export function computePurchasePreview({ quantity, size, priceCents }) {
  const count = normalizeQuantity(quantity);
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new RangeError('Preço por bilhete inválido.');
  }
  const totalCents = count * priceCents;
  if (!Number.isSafeInteger(totalCents)) {
    throw new RangeError('Custo total excede o limite seguro de centavos.');
  }
  return {
    quantity: count,
    size: Number(size) || null,
    priceCents,
    totalCents,
    text: `${count} × ${formatCurrency(priceCents)} = ${formatCurrency(totalCents)}`,
  };
}

/** Assinatura que identifica uma intenção de compra para o duplo clique. */
export function purchaseSignature({ numbers = [], quantity, contests = 1, pool = null, contest = 1 }) {
  return [
    [...numbers].join(','),
    normalizeQuantity(quantity),
    Number(contests),
    pool ? `${pool.shares}:${(pool.participants ?? []).join('|')}` : 'single',
    Number(contest),
  ].join('::');
}

/**
 * Guarda de confirmação. Compras acima de um bilhete exigem um segundo clique
 * com a mesma intenção; cliques repetidos depois disso são ignorados.
 */
export function createPurchaseGuard() {
  let armed = null;
  return {
    isArmed(signature) {
      return armed === signature;
    },
    arm(signature) {
      armed = signature;
    },
    consume(signature) {
      const accepted = armed === signature;
      armed = null;
      return accepted;
    },
    disarm() {
      armed = null;
    },
    get pending() {
      return armed;
    },
  };
}

/** Resumo textual da última compra gravada. */
export function describePurchase({ tickets = [], totalCents = 0, contest = 1 }) {
  if (!tickets.length) return 'Nenhum bilhete foi gravado (a operação pode ter sido repetida).';
  const first = tickets[0];
  const last = tickets[tickets.length - 1];
  const ids = first.displayId === last.displayId
    ? `#${first.displayId}`
    : `#${first.displayId}–#${last.displayId}`;
  return `${tickets.length} bilhete(s) ${ids} · ${first.size} dezenas · `
    + `${formatCurrency(totalCents)} · concurso ${contest}`;
}
