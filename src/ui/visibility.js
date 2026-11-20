/**
 * Suspensão no navegador quando a aba deixa de ficar visível. É o equivalente
 * web do `appStateChange` do Android: apenas pausa e retoma o que já estava em
 * andamento. Nenhum número, resultado ou efeito financeiro é criado aqui.
 */
export function createVisibilityHandler(ui, doc = globalThis.document) {
  let pausedByVisibility = false;

  return function handleVisibility() {
    const hidden = Boolean(doc?.hidden);
    if (hidden) {
      ui?.audio?.pause?.('aba');
      pausedByVisibility = Boolean(ui?.show?.pause?.());
      return { hidden: true, paused: pausedByVisibility };
    }

    ui?.audio?.resume?.('aba');
    if (pausedByVisibility) {
      ui?.show?.resume?.();
      pausedByVisibility = false;
    }
    return { hidden: false, paused: false };
  };
}
