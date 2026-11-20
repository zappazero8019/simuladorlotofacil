/**
 * Acompanhamento visual dos números do primeiro bilhete durante a extração.
 *
 * Esta classe é somente leitura: ela não sortea, não confere apostas, não
 * calcula prêmios e nunca é usada como fonte da contemplação final. Apenas
 * guarda quais números já apareceram para alimentar destaque, contador e som.
 */
export function createFirstBetTracker(getNumbers = () => null) {
  if (typeof getNumbers !== 'function') {
    throw new TypeError('getNumbers deve ser uma função.');
  }

  let reference = Object.freeze([]);
  let lookup = new Set();
  let matches = Object.freeze([]);
  let active = false;

  /** Congela a referência no início da extração; trocar apostas depois não a altera. */
  function begin() {
    const numbers = getNumbers();
    const unique = Array.isArray(numbers)
      ? [...new Set(numbers.filter((number) => Number.isInteger(number) && number >= 1 && number <= 25))]
      : [];
    reference = Object.freeze(unique);
    lookup = new Set(unique);
    matches = Object.freeze([]);
    active = unique.length > 0;
    return active;
  }

  function reset() {
    return begin();
  }

  /** Predicado puro: chamá-lo várias vezes nunca altera o estado. */
  function isMatch(number) {
    return active && lookup.has(number);
  }

  /** Registra a ocorrência visual; devolve true apenas na primeira vez. */
  function record(number) {
    if (!isMatch(number) || matches.includes(number)) return false;
    matches = Object.freeze([...matches, number]);
    return true;
  }

  function label() {
    const count = matches.length;
    return count === 1
      ? '1 número sorteado'
      : `${count} números sorteados`;
  }

  return {
    begin,
    reset,
    isMatch,
    record,
    label,
    get active() {
      return active;
    },
    get count() {
      return matches.length;
    },
    get numbers() {
      return reference;
    },
    get matches() {
      return matches;
    },
  };
}
