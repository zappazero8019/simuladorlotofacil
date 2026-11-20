import { DRAW_SIZE } from '../core/constants.js';
import { sampleNumbers } from '../core/sampling.js';
import { validateDraw } from '../core/validation.js';

/**
 * Gera o resultado do sorteio de forma síncrona, pura e independente de UI.
 * O resultado deve ser obtido antes de qualquer animação ou apresentação.
 */
export function drawNumbers(random = Math.random) {
  return validateDraw(sampleNumbers(DRAW_SIZE, random));
}
