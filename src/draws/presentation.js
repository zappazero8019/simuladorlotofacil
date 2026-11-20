import { DRAW_SIZE } from '../core/constants.js';
import {
  PRESENTATION_MODE_CONFIG,
  intervalForSpeed,
  isPresentationMode,
  normalizeSpeed,
} from './presentationModes.js';

const defaultTimer = {
  set: (callback, delay) => globalThis.setTimeout(callback, delay),
  clear: (id) => globalThis.clearTimeout(id),
};

/**
 * Controla apenas o estado da apresentação: quantos números foram revelados,
 * ritmo, pausa e velocidade. O resultado vem sempre da sessão imutável; este
 * módulo nunca gera números.
 */
export function createPresentationController({
  session,
  onReveal = () => {},
  onChange = () => {},
  onComplete = () => {},
  interval = 720,
  timer = defaultTimer,
} = {}) {
  if (!session || typeof session.getFrozenResult !== 'function') {
    throw new TypeError('session deve expor getFrozenResult().');
  }
  if (!timer || typeof timer.set !== 'function' || typeof timer.clear !== 'function') {
    throw new TypeError('timer deve expor set() e clear().');
  }

  let numbers = null;
  let revealed = 0;
  let playing = false;
  let paused = false;
  let speed = PRESENTATION_MODE_CONFIG.normal.speed;
  let presentationMode = 'normal';
  let instantReveal = false;
  let handle = null;
  let disposed = false;

  function getState() {
    return {
      numbers: numbers ? [...numbers] : null,
      revealed,
      total: DRAW_SIZE,
      playing,
      paused,
      speed,
      presentationMode,
      instant: instantReveal,
      instantMode: presentationMode === 'instantaneo',
      complete: revealed === DRAW_SIZE,
      next: numbers && revealed < DRAW_SIZE ? numbers[revealed] : null,
    };
  }

  function clearTimer() {
    if (handle !== null) {
      timer.clear(handle);
      handle = null;
    }
  }

  function announce() {
    onChange(getState());
  }

  function schedule() {
    clearTimer();
    if (!playing || paused || disposed || !numbers || revealed >= DRAW_SIZE) return;
    if (presentationMode === 'instantaneo') return;
    handle = timer.set(() => {
      handle = null;
      revealNext();
    }, intervalForSpeed(interval, speed));
  }

  function revealNext() {
    if (disposed || !numbers || revealed >= DRAW_SIZE) return null;

    const index = revealed;
    const number = numbers[index];
    revealed += 1;
    onReveal(number, index, getState());
    announce();

    if (revealed === DRAW_SIZE) {
      playing = false;
      clearTimer();
      onComplete(getState());
    } else {
      schedule();
    }
    return number;
  }

  function revealAll() {
    if (disposed || !numbers || revealed >= DRAW_SIZE) return [];

    const revealedNow = [];
    instantReveal = true;
    while (revealed < DRAW_SIZE) {
      const number = numbers[revealed];
      const index = revealed;
      revealed += 1;
      revealedNow.push(number);
      onReveal(number, index, getState());
    }
    instantReveal = false;
    playing = false;
    clearTimer();
    announce();
    onComplete(getState());
    return revealedNow;
  }

  function start() {
    if (disposed) return false;
    const result = session.getFrozenResult();
    if (!result) return false;

    numbers = result;
    revealed = 0;
    paused = false;
    playing = true;
    announce();

    if (presentationMode === 'instantaneo') revealAll();
    else schedule();
    return true;
  }

  function reset() {
    clearTimer();
    numbers = session.getFrozenResult();
    revealed = 0;
    playing = false;
    paused = false;
    instantReveal = false;
    announce();
  }

  function pause() {
    if (disposed || !playing || paused) return false;
    paused = true;
    clearTimer();
    announce();
    return true;
  }

  function resume() {
    if (disposed || !playing || !paused) return false;
    paused = false;
    announce();
    schedule();
    return true;
  }

  /** Altera o ritmo sem tocar no resultado nem reiniciar o progresso. */
  function setPresentationMode(mode) {
    if (disposed || !isPresentationMode(mode)) return false;
    if (mode === presentationMode) return false;

    presentationMode = mode;
    speed = PRESENTATION_MODE_CONFIG[mode].speed;
    if (mode === 'instantaneo') {
      if (numbers && revealed < DRAW_SIZE) revealAll();
      else clearTimer();
    } else if (playing && !paused) {
      schedule();
    }
    announce();
    return true;
  }

  function setSpeed(value) {
    if (disposed) return speed;
    speed = normalizeSpeed(value, speed);
    if (playing && !paused) schedule();
    announce();
    return speed;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimer();
    numbers = null;
    playing = false;
  }

  return {
    start,
    reset,
    pause,
    resume,
    revealNext,
    revealAll,
    setSpeed,
    setPresentationMode,
    dispose,
    getState,
    get isDisposed() {
      return disposed;
    },
  };
}
