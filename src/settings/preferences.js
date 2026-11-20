import { DEFAULT_SETTINGS, SETTINGS_KEYS } from '../persistence/schema.js';

/**
 * Preferências pessoais da Fase 9. Todas vivem na store `settings`, que já é
 * preservada pelo reset da simulação. Nenhuma destas chaves participa do motor
 * matemático, da conferência, do saldo ou das estatísticas.
 */
export const PREFERENCE_KEYS = Object.freeze([
  SETTINGS_KEYS.MUSIC_ENABLED,
  SETTINGS_KEYS.SFX_ENABLED,
  SETTINGS_KEYS.MUSIC_VOLUME,
  SETTINGS_KEYS.SFX_VOLUME,
  SETTINGS_KEYS.TEST_MODE_ENABLED,
  SETTINGS_KEYS.TEST_PROBABILITY,
]);

const booleanKeys = new Set([
  SETTINGS_KEYS.MUSIC_ENABLED,
  SETTINGS_KEYS.SFX_ENABLED,
  SETTINGS_KEYS.TEST_MODE_ENABLED,
]);

const volumeKeys = new Set([
  SETTINGS_KEYS.MUSIC_VOLUME,
  SETTINGS_KEYS.SFX_VOLUME,
]);

/** Aceita apenas valores válidos; nunca devolve `undefined` para uma chave conhecida. */
export function normalizePreference(key, value) {
  if (!PREFERENCE_KEYS.includes(key)) {
    throw new RangeError(`Preferência desconhecida: ${String(key)}.`);
  }
  if (booleanKeys.has(key)) {
    if (typeof value !== 'boolean') throw new TypeError(`${key} deve ser booleano.`);
    return value;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${key} deve ser numérico.`);
  if (volumeKeys.has(key)) {
    if (!Number.isInteger(number) || number < 0 || number > 100) {
      throw new RangeError(`${key} deve ser um inteiro de 0 a 100.`);
    }
    return number;
  }
  if (!Number.isInteger(number) || number < 1 || number > 100) {
    throw new RangeError(`${key} deve ser um inteiro de 1 a 100.`);
  }
  return number;
}

/** Mescla preferências persistidas com os padrões, sem alterar o objeto recebido. */
export function readPreferences(settings = {}) {
  const result = {};
  for (const key of PREFERENCE_KEYS) {
    const raw = settings[key];
    try {
      result[key] = normalizePreference(key, raw);
    } catch {
      result[key] = DEFAULT_SETTINGS[key];
    }
  }
  return result;
}

/** Converte percentual de interface (0–100) em ganho linear para Web Audio. */
export function volumeToGain(percent) {
  const normalized = Number(percent);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(1, normalized / 100));
}
