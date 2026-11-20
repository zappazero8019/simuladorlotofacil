import {
  DRAW_SIZE,
  MAX_BET_SIZE,
  MAX_NUMBER,
  MIN_BET_SIZE,
  MIN_NUMBER,
} from './constants.js';

export class LotofacilValidationError extends TypeError {
  constructor(message, code) {
    super(message);
    this.name = 'LotofacilValidationError';
    this.code = code;
  }
}

export function isValidNumber(value) {
  return Number.isInteger(value) && value >= MIN_NUMBER && value <= MAX_NUMBER;
}

function validateNumberArray(values, { min, max, label }) {
  if (!Array.isArray(values)) {
    throw new LotofacilValidationError(`${label} deve ser um array.`, 'NOT_ARRAY');
  }
  if (values.length < min || values.length > max) {
    throw new LotofacilValidationError(
      `${label} deve ter entre ${min} e ${max} números.`,
      'INVALID_LENGTH',
    );
  }

  values.forEach((value) => {
    if (!isValidNumber(value)) {
      throw new LotofacilValidationError(
        `${label} contém número inválido: ${String(value)}.`,
        'INVALID_NUMBER',
      );
    }
  });

  if (new Set(values).size !== values.length) {
    throw new LotofacilValidationError(
      `${label} não pode ter números repetidos.`,
      'DUPLICATE_NUMBER',
    );
  }

  return [...values].sort((a, b) => a - b);
}

/** Valida aposta de 15 a 20 números e devolve uma cópia ordenada. */
export function validateBet(numbers) {
  return validateNumberArray(numbers, {
    min: MIN_BET_SIZE,
    max: MAX_BET_SIZE,
    label: 'Aposta',
  });
}

/** Valida sorteio de exatamente 15 números e devolve uma cópia ordenada. */
export function validateDraw(numbers) {
  return validateNumberArray(numbers, {
    min: DRAW_SIZE,
    max: DRAW_SIZE,
    label: 'Sorteio',
  });
}

export function isValidBet(numbers) {
  try {
    validateBet(numbers);
    return true;
  } catch {
    return false;
  }
}

export function isValidDraw(numbers) {
  try {
    validateDraw(numbers);
    return true;
  } catch {
    return false;
  }
}
