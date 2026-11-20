/**
 * Configuração dos ritmos de apresentação. Valores puramente visuais: nenhum
 * destes números participa do sorteio matemático.
 */

export const PRESENTATION_MODES = Object.freeze(['normal', 'acelerado', 'instantaneo']);

export const PRESENTATION_MODE_CONFIG = Object.freeze({
  normal: Object.freeze({ label: 'Normal', speed: 1 }),
  acelerado: Object.freeze({ label: 'Acelerado', speed: 3 }),
  instantaneo: Object.freeze({ label: 'Instantâneo', speed: 5 }),
});

export const SPEED_OPTIONS = Object.freeze([0.5, 1, 1.5, 2, 3, 5]);
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 5;
export const MIN_INTERVAL = 40;

/** Rótulo curto para exibição da velocidade (ex.: `1,5×`). */
export function formatSpeed(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '1×';
  return `${Number.isInteger(parsed) ? parsed : parsed.toFixed(1).replace('.', ',')}×`;
}

export function isPresentationMode(value) {
  return PRESENTATION_MODES.includes(value);
}

/** Aceita apenas velocidades positivas e finitas dentro da faixa suportada. */
export function normalizeSpeed(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, parsed));
}

/** Intervalo entre revelações, limitado para não acumular timers. */
export function intervalForSpeed(interval, speed) {
  const base = Number(interval);
  const multiplier = Number(speed);
  if (!Number.isFinite(base) || base <= 0) return MIN_INTERVAL;
  if (!Number.isFinite(multiplier) || multiplier <= 0) return base;
  return Math.max(MIN_INTERVAL, base / multiplier);
}
