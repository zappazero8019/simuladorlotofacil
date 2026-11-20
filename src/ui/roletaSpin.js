import { intervalForSpeed } from '../draws/presentationModes.js';
import { ROLETA_SLOTS } from './roletaModel.js';

/**
 * Plano visual do giro da roleta. O único dado externo é a posição de destino,
 * que já vem da sequência congelada. Nada aqui sorteia, valida ou altera o
 * resultado: a função apenas descreve por quais posições o destaque passa e
 * quanto tempo fica em cada uma.
 */

const SPIN_MODES = Object.freeze(['normal', 'acelerado']);
const LAST_INDEX = ROLETA_SLOTS - 1;

function integerInRange(value, name, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new RangeError(`${name} deve ser um inteiro de ${min} a ${max}.`);
  }
  return parsed;
}

export function isSpinMode(value) {
  return SPIN_MODES.includes(value);
}

/** Normaliza modos aceitos; `instantaneo` é tratado pela própria roleta. */
export function normalizeSpinMode(value, fallback = 'normal') {
  return isSpinMode(value) ? value : fallback;
}

/**
 * Caminho determinístico que termina exatamente em `targetIndex`. Voltas
 * completas não mudam a parada; não há randomização de percurso.
 */
export function createSpinPath({
  fromIndex = 0,
  targetIndex,
  laps = 2,
  extraLaps = 0,
} = {}) {
  const from = integerInRange(fromIndex, 'fromIndex', 0, LAST_INDEX);
  const target = integerInRange(targetIndex, 'targetIndex', 0, LAST_INDEX);
  const turns = integerInRange(laps, 'laps', 1, 20);
  const extra = integerInRange(extraLaps, 'extraLaps', 0, 20);

  const offset = (target - from + ROLETA_SLOTS) % ROLETA_SLOTS;
  const total = turns * ROLETA_SLOTS + offset + extra * ROLETA_SLOTS;
  const path = new Array(total);
  let current = from;
  for (let step = 0; step < total; step += 1) {
    current = (current + 1) % ROLETA_SLOTS;
    path[step] = current;
  }
  return Object.freeze(path);
}

/**
 * Duração total do giro. Nunca depende de tempo real e cabe no intervalo da
 * apresentação, exceto no último número do modo normal, onde o suspense extra
 * é seguro porque não existe uma revelação seguinte.
 */
export function spinDuration({
  mode = 'normal',
  speed = 1,
  index = 0,
  interval = 720,
} = {}) {
  const normalized = normalizeSpinMode(mode);
  const position = integerInRange(index, 'index', 0, LAST_INDEX);
  const parsedSpeed = Number(speed);
  const effectiveSpeed = Number.isFinite(parsedSpeed) && parsedSpeed > 0
    ? Math.max(0.5, Math.min(5, parsedSpeed))
    : 1;

  const base = normalized === 'acelerado' ? 240 : 600;
  const isLast = position === LAST_INDEX;
  const desired = base + (normalized === 'normal' && isLast ? 260 : 0);
  const available = intervalForSpeed(interval, effectiveSpeed);

  if (normalized === 'normal' && isLast) return Math.max(120, desired);
  return Math.max(60, Math.min(desired, available * 0.8));
}

function decelerationWeights(count) {
  const weights = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const progress = count === 1 ? 1 : index / (count - 1);
    weights[index] = 0.55 + 2.4 * progress * progress;
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

/** Plano imutável com passos já cronometrados e parada garantida no destino. */
export function createSpinPlan({
  fromIndex = 0,
  targetIndex,
  mode = 'normal',
  speed = 1,
  index = 0,
  interval = 720,
  extraLaps = 0,
} = {}) {
  const normalized = normalizeSpinMode(mode);
  const position = integerInRange(index, 'index', 0, LAST_INDEX);
  const laps = normalized === 'acelerado' ? 1 : 2;
  const suspense = normalized === 'normal' && position === LAST_INDEX;

  const path = createSpinPath({
    fromIndex,
    targetIndex,
    laps,
    extraLaps: suspense ? extraLaps + 1 : extraLaps,
  });
  const duration = spinDuration({ mode: normalized, speed, index: position, interval });
  const weights = decelerationWeights(path.length);

  let elapsed = 0;
  const steps = path.map((slotIndex, stepIndex) => {
    const stepDuration = duration * weights[stepIndex];
    elapsed += stepDuration;
    return Object.freeze({
      index: slotIndex,
      duration: stepDuration,
      elapsed,
      progress: (stepIndex + 1) / path.length,
    });
  });

  return Object.freeze({
    mode: normalized,
    duration,
    suspense,
    targetIndex: path[path.length - 1],
    steps: Object.freeze(steps),
  });
}
