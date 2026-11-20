import { MAX_BET_SIZE, MIN_BET_SIZE } from '../core/constants.js';
import { isValidNumber } from '../core/validation.js';
import { getBetPriceCents } from './pricing.js';

/**
 * Estado puro do volante: seleção de 15 a 20 números entre 1 e 25.
 * Não toca o DOM e não gera números; a Surpresinha vem de `src/bets/index.js`.
 */
export function createVolante() {
  const selected = new Set();

  function toggle(number) {
    if (selected.has(number)) {
      selected.delete(number);
      return true;
    }
    if (!isValidNumber(number) || selected.size >= MAX_BET_SIZE) return false;
    selected.add(number);
    return true;
  }

  function select(number) {
    if (!isValidNumber(number) || selected.size >= MAX_BET_SIZE) return false;
    if (selected.has(number)) return false;
    selected.add(number);
    return true;
  }

  function deselect(number) {
    return selected.delete(number);
  }

  function clear() {
    selected.clear();
  }

  /** Substitui a seleção por uma lista pronta (ex.: Surpresinha), sem duplicatas. */
  function setNumbers(numbers) {
    if (!Array.isArray(numbers) || numbers.length > MAX_BET_SIZE) return false;
    if (!numbers.every(isValidNumber) || new Set(numbers).size !== numbers.length) {
      return false;
    }
    selected.clear();
    for (const number of numbers) selected.add(number);
    return true;
  }

  function getNumbers() {
    return [...selected].sort((a, b) => a - b);
  }

  return {
    toggle,
    select,
    deselect,
    clear,
    setNumbers,
    getNumbers,
    has: (number) => selected.has(number),
    get size() {
      return selected.size;
    },
    get isFull() {
      return selected.size >= MAX_BET_SIZE;
    },
    get canConfirm() {
      return selected.size >= MIN_BET_SIZE;
    },
    get priceCents() {
      return this.canConfirm ? getBetPriceCents(selected.size) : 0;
    },
  };
}
