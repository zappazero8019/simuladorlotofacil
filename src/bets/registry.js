import { countCombinations } from '../core/combinatorics.js';
import { validateBet } from '../core/validation.js';
import { getBetPriceCents, isTeimosinhaContestCount } from './pricing.js';

/**
 * Cadastro de apostas. Cada aposta guarda uma cópia congelada dos números;
 * a combinação nunca é alterada por apresentação, Teimosinha ou bolão.
 */
export function createBetRegistry() {
  const bets = [];
  let nextId = 1;

  function normalizeContests(contests) {
    const value = Number(contests);
    if (value === 1) return 1;
    if (isTeimosinhaContestCount(value)) return value;
    throw new RangeError('Quantidade de concursos inválida.');
  }

  function add({
    numbers,
    label = '',
    contests = 1,
    pool = null,
    id,
    displayId,
    persistentId = null,
    prizeValues = null,
    results,
    conferenceCount = 0,
    contest = 1,
  } = {}) {
    const valid = validateBet(numbers);
    const contestCount = normalizeContests(contests);
    const autoId = nextId++;
    const finalId = id ?? autoId;
    if (typeof finalId === 'number') nextId = Math.max(nextId, finalId + 1);

    const bet = {
      id: finalId,
      displayId: displayId ?? finalId,
      persistentId,
      contest,
      prizeValues: prizeValues ? { ...prizeValues } : null,
      numbers: Object.freeze(valid),
      size: valid.length,
      priceCents: getBetPriceCents(valid.length),
      combinations: countCombinations(valid.length),
      contests: contestCount,
      label: String(label),
      pool: pool ? Object.freeze({ ...pool }) : null,
      results: results
        ? results.map((result) => (result ? Object.freeze([...result]) : null))
        : Array.from({ length: contestCount }, () => null),
      conferenceCount,
    };
    bets.push(bet);
    return bet;
  }

  function list() {
    return [...bets];
  }

  function getById(id) {
    return bets.find((bet) => bet.id === id) ?? null;
  }

  function remove(id) {
    const index = bets.findIndex((bet) => bet.id === id);
    if (index === -1) return false;
    bets.splice(index, 1);
    return true;
  }

  function clear() {
    bets.length = 0;
    nextId = 1;
  }

  return {
    add,
    list,
    getById,
    remove,
    clear,
    get count() {
      return bets.length;
    },
    get totalCostCents() {
      return bets.reduce((sum, bet) => sum + bet.priceCents, 0);
    },
  };
}
