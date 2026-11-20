import { MAX_BET_SIZE, MIN_BET_SIZE } from '../core/constants.js';
import { sampleNumbers } from '../core/sampling.js';
import { validateBet } from '../core/validation.js';

/** Gera uma surpresinha válida, ordenada e sem números repetidos. */
export function generateSurpresinha(size = MIN_BET_SIZE, random = Math.random) {
  if (!Number.isInteger(size) || size < MIN_BET_SIZE || size > MAX_BET_SIZE) {
    throw new RangeError(
      `Surpresinha deve ter entre ${MIN_BET_SIZE} e ${MAX_BET_SIZE} números.`,
    );
  }
  return validateBet(sampleNumbers(size, random));
}

export * from './pricing.js';
export * from './volante.js';
export * from './teimosinha.js';
export * from './pool.js';
export * from './registry.js';
export * from './conference.js';
