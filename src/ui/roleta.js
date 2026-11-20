import { ROLETA_SLOTS, createRoletaModel } from './roletaModel.js';
import { createSpinPlan, normalizeSpinMode } from './roletaSpin.js';

const defaultTimer = {
  set: (callback, delay) => globalThis.setTimeout(callback, delay),
  clear: (id) => globalThis.clearTimeout(id),
};

/**
 * Renderizador DOM da roleta. O giro percorre visualmente as 15 posições até
 * chegar ao número que já veio da sequência congelada. Nenhum número é gerado,
 * reordenado ou conferido aqui; a animação é exclusivamente de apresentação.
 */
export function createRoleta(container, {
  doc = globalThis.document,
  audio = null,
  timer = defaultTimer,
  reducedMotion = false,
  interval = 720,
  isMatch = () => false,
  onMatch = () => {},
} = {}) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new TypeError('container deve ser um elemento DOM.');
  }
  if (!doc || typeof doc.createElement !== 'function') {
    throw new TypeError('doc deve expor createElement().');
  }

  const model = createRoletaModel();
  const timers = new Set();
  let instantMode = false;
  let presentationMode = 'normal';
  let speed = 1;
  let reduce = Boolean(reducedMotion);
  let spin = null;
  let hoveredIndex = -1;
  container.replaceChildren();

  const machine = doc.createElement('div');
  machine.className = 'maquina-roleta';

  const header = doc.createElement('div');
  header.className = 'roleta-cabecalho';
  header.textContent = 'ROLETA LOTOFÁCIL · 15 POSIÇÕES';

  const grid = doc.createElement('div');
  grid.className = 'roleta-grade';

  const cells = [];
  for (let index = 0; index < ROLETA_SLOTS; index += 1) {
    const cell = doc.createElement('div');
    cell.className = 'celula vazia';
    cell.dataset.index = String(index);
    cell.style.setProperty('--i', String(index));
    cell.setAttribute('aria-label', `Posição ${index + 1} vazia`);

    const number = doc.createElement('span');
    number.className = 'numero';
    number.textContent = '·';
    cell.appendChild(number);
    grid.appendChild(cell);
    cells.push({ cell, number });
  }

  const footer = doc.createElement('div');
  footer.className = 'roleta-rodape';
  footer.textContent = 'Aguardando sorteio';

  machine.append(header, grid, footer);
  container.appendChild(machine);

  function later(callback, delay) {
    const id = timer.set(() => {
      timers.delete(id);
      callback();
    }, delay);
    timers.add(id);
    return id;
  }

  function clearHover() {
    if (hoveredIndex >= 0) {
      const slot = cells[hoveredIndex];
      slot.cell.classList.remove('em-giro');
      slot.cell.style.removeProperty?.('--brilho');
      slot.cell.style.removeProperty?.('--brilho-alpha');
    }
    hoveredIndex = -1;
  }

  function paintHover(index, progress) {
    if (index === hoveredIndex) return;
    clearHover();
    hoveredIndex = index;
    const slot = cells[index];
    slot.cell.classList.add('em-giro');
    slot.cell.style.setProperty?.('--brilho', progress.toFixed(3));
    slot.cell.style.setProperty?.('--brilho-alpha', (0.2 + progress * 0.55).toFixed(3));
  }

  function clearSpinTimer() {
    if (!spin?.timerId) return;
    timer.clear(spin.timerId);
    spin.timerId = null;
  }

  function updateFooter() {
    if (spin) {
      footer.textContent = `Selecionando ${model.revealed + 1} de ${ROLETA_SLOTS}…`;
    } else if (model.complete) {
      grid.classList.remove('girando');
      machine.classList.add('concluida');
      footer.textContent = 'Sorteio concluído';
    } else if (model.revealed > 0) {
      footer.textContent = `Revelando ${model.revealed} de ${ROLETA_SLOTS}`;
    }
  }

  function applyReveal(number, index, animated) {
    const slot = cells[index];
    if (!slot) return;
    const text = String(number).padStart(2, '0');
    slot.number.textContent = text;
    slot.cell.classList.remove('vazia', 'em-giro');
    slot.cell.classList.add('revelada');
    const matched = Boolean(isMatch(number));
    if (matched) {
      slot.cell.classList.add('acerto-primeiro');
      onMatch(number);
    }
    if (animated) {
      slot.cell.classList.add('impacto');
      slot.number.classList.add('entrando');
      later(() => {
        slot.cell.classList.remove('impacto');
        slot.number.classList.remove('entrando');
      }, 650);
    }
    slot.cell.setAttribute(
      'aria-label',
      `Posição ${index + 1}: número ${text}${matched ? ' · acerto do primeiro bilhete' : ''}`,
    );
  }

  function finishSpin({ silent = false } = {}) {
    if (!spin) return false;
    const { number, index } = spin;
    const matched = Boolean(isMatch(number));
    clearSpinTimer();
    clearHover();
    spin = null;
    applyReveal(number, index, !silent);
    if (!silent) {
      // O slowdown já tocou ao cruzar a fase de desaceleração em `advance()`;
      // aqui só a confirmação da parada, com timbre exclusivo quando o número
      // pertence ao primeiro bilhete.
      audio?.playEffect?.(matched ? 'match' : 'reveal');
      if (index === ROLETA_SLOTS - 1) audio?.playEffect?.('last');
    }
    updateFooter();
    return true;
  }

  /** Cancela o giro; `applyPending` garante que o número não seja perdido. */
  function cancelSpin({ applyPending = false, silent = false } = {}) {
    if (!spin) return false;
    const { number, index } = spin;
    clearSpinTimer();
    clearHover();
    spin = null;
    if (applyPending) applyReveal(number, index, false);
    if (silent && applyPending) updateFooter();
    return true;
  }

  function advance() {
    if (!spin || spin.paused || spin.disposed) return;
    const step = spin.plan.steps[spin.step];
    if (!step) {
      finishSpin();
      return;
    }

    paintHover(step.index, step.progress);
    const tickInterval = presentationMode === 'acelerado' ? 4 : 3;
    if (spin.step > 0 && spin.step % tickInterval === 0) audio?.playEffect?.('spin');
    if (!spin.slowedDown && step.progress >= 0.72) {
      spin.slowedDown = true;
      audio?.playEffect?.('slowdown');
    }

    spin.timerId = timer.set(() => {
      spin.timerId = null;
      if (!spin || spin.paused) return;
      spin.step += 1;
      advance();
    }, Math.max(1, step.duration));
  }

  function startSpin() {
    if (instantMode) {
      footer.textContent = 'Revelação instantânea';
      return;
    }
    grid.classList.add('girando');
    machine.classList.remove('concluida');
    footer.textContent = 'Embaralhando…';
  }

  function reveal(number, index, state = {}) {
    const slot = cells[index];
    if (!slot) return false;
    // Reserva a posição no modelo antes de qualquer animação: nenhum outro
    // número pode ocupá-la enquanto o destaque está percorrendo a grade.
    if (!model.reveal(number, index)) return false;

    presentationMode = state.presentationMode === 'instantaneo'
      ? 'instantaneo'
      : normalizeSpinMode(state.presentationMode, presentationMode);
    const skipEffects = state.instant === true
      || state.instantMode === true
      || presentationMode === 'instantaneo'
      || reduce;

    // Se outra revelação chegar antes do giro terminar, a pendente é aplicada
    // imediatamente: a ordem da sequência nunca é perdida ou duplicada.
    cancelSpin({ applyPending: true });

    if (skipEffects) {
      applyReveal(number, index, false);
      updateFooter();
      return true;
    }

    // Na primeira revelação começa na própria posição de destino, de modo que
    // o primeiro destaque visualize a posição seguinte — nunca o alvo já no
    // primeiro passo. Depois disso mantém continuidade com o giro anterior.
    const fromIndex = hoveredIndex >= 0 ? hoveredIndex : index;
    const plan = createSpinPlan({
      fromIndex,
      targetIndex: index,
      mode: presentationMode,
      speed: state.speed ?? speed,
      index,
      interval,
    });
    spin = {
      number,
      index,
      plan,
      step: 0,
      paused: false,
      slowedDown: false,
      timerId: null,
      disposed: false,
    };
    audio?.playEffect?.('spin');
    advance();
    updateFooter();
    return true;
  }

  function reset() {
    cancelSpin();
    for (const id of timers) timer.clear(id);
    timers.clear();
    model.reset();
    grid.classList.remove('girando', 'pausada');
    machine.classList.remove('concluida');
    hoveredIndex = -1;

    cells.forEach((slot, index) => {
      slot.number.textContent = '·';
      slot.number.classList.remove('entrando');
      slot.cell.className = 'celula vazia';
      slot.cell.style.removeProperty?.('--brilho');
      slot.cell.style.removeProperty?.('--brilho-alpha');
      slot.cell.setAttribute('aria-label', `Posição ${index + 1} vazia`);
    });
    footer.textContent = 'Aguardando sorteio';
  }

  function setPaused(value) {
    const paused = Boolean(value);
    grid.classList.toggle('pausada', paused && !instantMode);
    if (!spin) return paused;
    if (paused) {
      clearSpinTimer();
      spin.paused = true;
    } else if (spin.paused) {
      spin.paused = false;
      advance();
    }
    return paused;
  }

  function setSpeed(value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      speed = Math.max(0.5, Math.min(5, parsed));
      grid.style.setProperty('--velocidade', String(speed));
    }
    return speed;
  }

  function setPresentationMode(mode) {
    presentationMode = mode;
    instantMode = mode === 'instantaneo';
    if (instantMode) {
      cancelSpin({ applyPending: true });
      grid.classList.remove('girando', 'pausada');
      footer.textContent = 'Revelação instantânea';
    }
  }

  function setReducedMotion(value) {
    reduce = Boolean(value);
    if (reduce) cancelSpin({ applyPending: true });
    return reduce;
  }

  function dispose() {
    if (spin) {
      spin.disposed = true;
      cancelSpin();
    }
    for (const id of timers) timer.clear(id);
    timers.clear();
    container.replaceChildren();
  }

  return {
    reveal,
    startSpin,
    reset,
    setPaused,
    setSpeed,
    setPresentationMode,
    setReducedMotion,
    cancelAnimation: () => cancelSpin({ applyPending: true }),
    dispose,
    getSlots: model.getSlots,
    getNumbers: model.getNumbers,
    get revealed() {
      return model.revealed;
    },
    get complete() {
      return model.complete;
    },
    get isInstant() {
      return instantMode;
    },
    get speed() {
      return speed;
    },
    get spinning() {
      return Boolean(spin);
    },
    get activeIndex() {
      return spin ? hoveredIndex : -1;
    },
    get pendingNumber() {
      return spin?.number ?? null;
    },
    get spinSteps() {
      return spin?.plan.steps.length ?? 0;
    },
    get reducedMotion() {
      return reduce;
    },
    get pendingTimers() {
      return timers.size + (spin?.timerId ? 1 : 0);
    },
  };
}
