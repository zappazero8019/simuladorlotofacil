import { formatCurrency } from '../bets/index.js';
import { RESULT_MESSAGES, resultTitle } from '../results/celebration.js';

const INTENSITY_ORDER = ['nenhuma', 'discreta', 'moderada', 'grande'];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function maxIntensity(items) {
  return items.reduce((best, item) => (
    INTENSITY_ORDER.indexOf(item.intensity) > INTENSITY_ORDER.indexOf(best) ? item.intensity : best
  ), 'nenhuma');
}

/**
 * Camada visual da comemoração. Consome apenas o plano imutável produzido por
 * `planCelebration`: nunca grava resultado, saldo, prêmio ou estatística.
 */
export function createCelebrationOverlay({
  root = globalThis.document?.body,
  reducedMotion = prefersReducedMotion,
  onClose = () => {},
} = {}) {
  if (!root || typeof root.appendChild !== 'function') {
    throw new TypeError('root deve ser um elemento DOM.');
  }

  const overlay = element('div', 'celebracao');
  overlay.id = 'resultado-celebracao';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.hidden = true;

  const canvas = element('canvas', 'fogos-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const box = element('div', 'celebracao-caixa');
  box.setAttribute('tabindex', '-1');
  const title = element('h2', 'celebracao-titulo');
  const notice = element('p', 'celebracao-aviso');
  notice.hidden = true;
  const winnerNote = element('p', 'celebracao-contagem');
  winnerNote.hidden = true;
  const summary = element('p', 'celebracao-resumo');
  const list = element('div', 'celebracao-lista');
  const close = element('button', 'celebracao-fechar', 'Fechar');
  close.type = 'button';
  box.append(title, notice, winnerNote, summary, list, close);
  overlay.append(canvas, box);
  root.appendChild(overlay);

  const context = canvas.getContext?.('2d') ?? null;
  const particles = [];
  let frameId = null;
  let lastFrame = 0;
  let active = false;
  let disposed = false;
  let randomSeed = 0x1a2b3c4d;

  function visualRandom() {
    randomSeed = (Math.imul(1664525, randomSeed) + 1013904223) >>> 0;
    return randomSeed / 4294967296;
  }

  function clearCanvas() {
    if (!context || !canvas.width || !canvas.height) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function resizeCanvas() {
    if (!context) return;
    const rect = canvas.getBoundingClientRect?.();
    const width = Math.max(1, Math.floor(rect?.width || globalThis.innerWidth || 480));
    const height = Math.max(1, Math.floor(rect?.height || globalThis.innerHeight || 320));
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform?.(ratio, 0, 0, ratio, 0, 0);
  }

  function launch(count) {
    if (!context) return;
    const width = canvas.width || 480;
    const height = canvas.height || 320;
    for (let index = 0; index < count; index += 1) {
      const angle = visualRandom() * Math.PI * 2;
      const speed = 40 + visualRandom() * 110;
      const maxLife = 0.7 + visualRandom() * 0.7;
      particles.push({
        x: width * (0.2 + visualRandom() * 0.6),
        y: height * (0.12 + visualRandom() * 0.42),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife,
        size: 1.5 + visualRandom() * 2.5,
        color: ['#5eead4', '#fbbf24', '#f472b6', '#a5f3fc'][index % 4],
      });
    }
  }

  function frame(time) {
    if (!active || !context || disposed) return;
    const delta = lastFrame ? Math.min((time - lastFrame) / 1000, 0.05) : 0.016;
    lastFrame = time;
    clearCanvas();

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life += delta;
      if (particle.life >= particle.maxLife) {
        const last = particles.pop();
        if (index < particles.length) particles[index] = last;
        continue;
      }
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 85 * delta;
      const alpha = 1 - particle.life / particle.maxLife;
      context.globalAlpha = Math.max(0, alpha);
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1;

    if (particles.length > 0 && globalThis.requestAnimationFrame) {
      frameId = globalThis.requestAnimationFrame(frame);
    } else {
      frameId = null;
    }
  }

  function startParticles(count) {
    if (reducedMotion === true || typeof reducedMotion === 'function' && reducedMotion()) return;
    if (!context || !globalThis.requestAnimationFrame) return;
    resizeCanvas();
    particles.length = 0;
    launch(count);
    lastFrame = 0;
    frameId = globalThis.requestAnimationFrame(frame);
  }

  function hide() {
    if (frameId !== null) {
      globalThis.cancelAnimationFrame?.(frameId);
      frameId = null;
    }
    particles.length = 0;
    active = false;
    clearCanvas();
    overlay.hidden = true;
    overlay.className = 'celebracao';
    title.textContent = '';
    notice.textContent = '';
    notice.hidden = true;
    winnerNote.textContent = '';
    winnerNote.hidden = true;
    summary.textContent = '';
    list.replaceChildren();
  }

  function show(plan) {
    if (disposed || !plan?.items) return false;
    hide();

    const items = plan.items;
    const { summary: totals } = plan;
    const intensity = maxIntensity(items);
    const winnerCount = Number.isFinite(totals?.winnerCount)
      ? totals.winnerCount
      : Number(totals?.realWinners ?? 0) + Number(totals?.simulatedWinners ?? 0);

    overlay.classList.add(totals.anyCelebration ? 'com-contemplacao' : 'sem-contemplacao');
    overlay.classList.add(`intensidade-${intensity}`);
    title.textContent = resultTitle(totals);
    if (winnerCount > 1) {
      winnerNote.textContent = `${winnerCount} bilhetes contemplados — veja os resultados individuais abaixo.`;
      winnerNote.hidden = false;
    }

    if (totals.testModeActive || totals.simulatedWinners > 0) {
      notice.textContent = totals.simulatedWinners > 0
        ? `${RESULT_MESSAGES.simulation} (${totals.simulatedWinners} bilhete(s) de teste).`
        : RESULT_MESSAGES.simulation;
      notice.hidden = false;
    }

    summary.textContent = `${totals.total} bilhete(s) · ${totals.realWinners} contemplado(s) real(is)`
      + ` · ${totals.simulatedWinners} simulação(ões) de teste`
      + ` · ${formatCurrency(totals.receivedCents)} em prêmios reais.`;

    for (const item of items) {
      const card = element('article', `celebracao-item ${item.message === RESULT_MESSAGES.win
        ? 'item-contemplado' : 'item-nao-contemplado'}`);
      card.appendChild(element('strong', '', `Aposta #${item.betId ?? '?'} · concurso ${item.contest ?? '?'}`));
      card.appendChild(element('span', '', `${item.matches} acerto(s) · ${item.message}`));
      if (item.realWin) {
        card.appendChild(element('span', 'item-valor', `Prêmio real: ${formatCurrency(item.receivedCents)}`));
      }
      if (item.simulated) card.appendChild(element('span', 'item-simulacao', RESULT_MESSAGES.simulation));
      list.appendChild(card);
    }

    overlay.hidden = false;
    active = true;
    box.focus?.();
    if (totals.fireworks) startParticles(intensity === 'grande' ? 90 : 42);
    // A mensagem permanece até o jogador pressionar "Fechar": nenhum
    // temporizador de resultado é criado aqui.
    return true;
  }

  function handleClose() {
    hide();
    onClose();
  }

  close.addEventListener('click', handleClose);

  return {
    show,
    hide,
    get visible() {
      return !overlay.hidden;
    },
    get particles() {
      return particles.length;
    },
    dispose() {
      if (disposed) return;
      hide();
      close.removeEventListener('click', handleClose);
      overlay.remove();
      disposed = true;
    },
  };
}
