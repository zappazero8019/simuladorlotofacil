import { DRAW_SIZE } from '../core/constants.js';
import { validateDraw } from '../core/validation.js';
import { drawNumbers } from './index.js';

/**
 * Sessão de sorteio: única responsável por obter o resultado do motor e
 * mantê-lo imutável. Nenhuma animação, física ou interface participa aqui.
 */
export function createDrawSession({ random = Math.random } = {}) {
  if (typeof random !== 'function') {
    throw new TypeError('random deve ser uma função.');
  }

  let result = null;
  let generation = 0;

  function commit(numbers) {
    // Reutiliza a validação oficial; não existe segundo motor de sorteio.
    const valid = validateDraw(numbers);
    result = Object.freeze([...valid]);
    generation += 1;
    return [...result];
  }

  /** Executa o motor matemático e congela o resultado antes de qualquer UI. */
  function draw() {
    return commit(drawNumbers(random));
  }

  /** Injeta uma sequência já determinada (usada em testes/replay). */
  function setResult(numbers) {
    return commit(numbers);
  }

  /** Remove o resultado atual sem gerar um novo sorteio. */
  function clear() {
    result = null;
  }

  /** Devolve uma cópia mutável, protegendo o resultado interno. */
  function getResult() {
    return result ? [...result] : null;
  }

  /** Referência congelada, destinada apenas à leitura pela apresentação. */
  function getFrozenResult() {
    return result;
  }

  return {
    draw,
    setResult,
    clear,
    getResult,
    getFrozenResult,
    hasResult: () => result !== null,
    get size() {
      return DRAW_SIZE;
    },
    get generation() {
      return generation;
    },
  };
}
