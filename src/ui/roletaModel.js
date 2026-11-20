/** Quantidade visual de compartimentos da roleta. */
export const ROLETA_SLOTS = 15;

/**
 * Estado puro da roleta. Apenas posiciona números já sorteados: não gera,
 * valida regras oficiais nem decide resultados.
 */
export function createRoletaModel() {
  let slots = Array(ROLETA_SLOTS).fill(null);

  function reveal(number, index) {
    if (!Number.isInteger(number) || number < 1 || number > 25) return false;
    if (!Number.isInteger(index) || index < 0 || index >= ROLETA_SLOTS) return false;
    if (slots[index] !== null || slots.includes(number)) return false;

    slots[index] = number;
    return true;
  }

  function revealAll(numbers) {
    if (!Array.isArray(numbers)) return [];
    const revealed = [];
    for (let index = 0; index < ROLETA_SLOTS; index += 1) {
      if (reveal(numbers[index], index)) revealed.push(numbers[index]);
    }
    return revealed;
  }

  function reset() {
    slots = Array(ROLETA_SLOTS).fill(null);
  }

  function getSlots() {
    return [...slots];
  }

  function getNumbers() {
    return slots.filter((number) => number !== null);
  }

  return {
    reveal,
    revealAll,
    reset,
    getSlots,
    getNumbers,
    get revealed() {
      return getNumbers().length;
    },
    get complete() {
      return getNumbers().length === ROLETA_SLOTS;
    },
  };
}
