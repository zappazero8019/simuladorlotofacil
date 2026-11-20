import { createPresentationController } from './presentation.js';

export const SHOW_MODES = Object.freeze(['globo', 'roleta']);

/**
 * Coordena modo visual, ritmo de apresentação e estado sem gerar resultados.
 * A troca de modo reinicia apenas a apresentação, preservando o resultado
 * imutável da sessão, o ritmo escolhido e a velocidade.
 */
export function createShowController({
  session,
  views = {},
  onChange = () => {},
  presentationOptions = {},
} = {}) {
  if (!session || typeof session.getFrozenResult !== 'function') {
    throw new TypeError('session inválida.');
  }

  const listeners = new Set();
  let mode = SHOW_MODES[0];
  let disposed = false;

  function activeView() {
    return views[mode] ?? {};
  }

  function getState() {
    return {
      ...presentation.getState(),
      mode,
      result: session.getResult(),
    };
  }

  function emit() {
    const state = getState();
    for (const listener of listeners) listener(state);
    onChange(state);
  }

  const presentation = createPresentationController({
    session,
    ...presentationOptions,
    onChange: emit,
    onReveal(number, index, state) {
      activeView().reveal?.(number, index, state);
      presentationOptions.onReveal?.(number, index, state);
      emit();
    },
    onComplete(state) {
      activeView().complete?.(state);
      presentationOptions.onComplete?.(state);
      emit();
    },
  });

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function applySpeed() {
    activeView().setSpeed?.(presentation.getState().speed);
  }

  /** Troca apenas o modo visual; nunca chama `session.draw()`. */
  function selectMode(nextMode) {
    if (disposed || !SHOW_MODES.includes(nextMode) || nextMode === mode) return false;

    activeView().reset?.();
    mode = nextMode;
    activeView().reset?.();
    activeView().setPresentationMode?.(presentation.getState().presentationMode);
    applySpeed();
    if (session.hasResult()) {
      const started = presentation.start();
      if (started) activeView().startSpin?.();
    }
    emit();
    return true;
  }

  /** Único ponto que solicita um novo resultado ao motor matemático. */
  function startDraw() {
    if (disposed) return null;

    // Encerra explicitamente a sessão anterior antes de gerar um novo resultado.
    activeView().reset?.();
    presentation.reset();
    const result = session.draw();
    const started = presentation.start();
    if (started) activeView().startSpin?.();
    emit();
    return result;
  }

  function start() {
    if (disposed) return false;
    const started = presentation.start();
    if (started) activeView().startSpin?.();
    emit();
    return started;
  }

  /**
   * Volta ao estado inicial sem gerar resultado. Modo visual, ritmo e
   * velocidade permanecem intactos (preferências do jogador).
   */
  function clear() {
    if (disposed) return false;
    activeView().reset?.();
    presentation.reset();
    session.clear();
    emit();
    return true;
  }

  /** Reinicia a apresentação com o mesmo resultado já definido. */
  function restart() {
    if (disposed) return false;
    activeView().reset?.();
    presentation.reset();
    const started = presentation.start();
    if (started) activeView().startSpin?.();
    emit();
    return started;
  }

  function pause() {
    if (disposed) return false;
    const changed = presentation.pause();
    activeView().setPaused?.(true);
    emit();
    return changed;
  }

  function resume() {
    if (disposed) return false;
    const changed = presentation.resume();
    activeView().setPaused?.(false);
    emit();
    return changed;
  }

  function revealNext() {
    if (disposed) return null;
    const number = presentation.revealNext();
    emit();
    return number;
  }

  function revealAll() {
    if (disposed) return [];
    const numbers = presentation.revealAll();
    emit();
    return numbers;
  }

  function setSpeed(value) {
    if (disposed) return 0;
    const speed = presentation.setSpeed(value);
    activeView().setSpeed?.(speed);
    emit();
    return speed;
  }

  /** Normal, acelerado ou instantâneo; nunca gera resultado. */
  function setPresentationMode(nextMode) {
    if (disposed) return false;
    const changed = presentation.setPresentationMode(nextMode);
    activeView().setPresentationMode?.(nextMode, getState());
    applySpeed();
    emit();
    return changed;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    presentation.dispose();
    activeView().dispose?.();
    listeners.clear();
  }

  return {
    subscribe,
    selectMode,
    startDraw,
    start,
    clear,
    restart,
    pause,
    resume,
    revealNext,
    revealAll,
    setSpeed,
    setPresentationMode,
    dispose,
    getState,
    get mode() {
      return mode;
    },
    get isDisposed() {
      return disposed;
    },
  };
}
