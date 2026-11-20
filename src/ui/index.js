import { createDrawSession } from '../draws/session.js';
import { createShowController } from '../draws/show.js';
import { formatSpeed, PRESENTATION_MODE_CONFIG } from '../draws/presentationModes.js';
import { EXTRACTION_SIZE } from '../visualization/extraction.js';
import { createAudioEngine } from '../audio/index.js';
import {
  CHAMPION_EMPTY_LABEL,
  createTestRandom,
  describeChampions,
  planCelebration,
} from '../results/index.js';
import { readPreferences } from '../settings/preferences.js';
import { createRoleta } from './roleta.js';
import { createBetsPanel } from './betsPanel.js';
import { createHistoryPanel } from './historyPanel.js';
import { createNavigation } from './navigation.js';
import { createCelebrationOverlay } from './resultCelebration.js';
import { createPreferencesPanel } from './preferencesPanel.js';
import { webGlFallbackMessage } from './webglSupport.js';

export { createRoleta } from './roleta.js';
export * from './roletaModel.js';
export { createVolanteUI } from './volante.js';

const pad = (number) => String(number).padStart(2, '0');

/** Liga os controles DOM ao controlador de apresentação, sem gerar números. */
export function createInterface({ visualization, root = document, history = null }) {
  if (!visualization) throw new TypeError('visualization é obrigatória.');

  const find = (selector) => root.querySelector(selector);
  const session = createDrawSession();
  const audio = createAudioEngine();
  let preferences = readPreferences();
  const reducedMotion = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

  // Destaque dos bilhetes campeões: estado puramente apresentacional, derivado
  // das conferências já calculadas. Nenhuma pontuação é antecipada na extração.
  let bets = null;
  let champion = describeChampions([]);
  let replayChampion = null;
  const championCounter = find('#contador-primeiro-bilhete');

  function applyChampion(next, { conferenced = true } = {}) {
    champion = next && typeof next.isBetChampion === 'function'
      ? next
      : describeChampions([]);
    bets?.setChampion?.(champion);
    if (championCounter) {
      championCounter.textContent = champion.active
        ? `${champion.label}: ${champion.scoreLabel}`
        : conferenced ? CHAMPION_EMPTY_LABEL : 'Aguardando conferência';
    }
    const highlighted = champion.matchedNumbers;
    roleta.markChampions(highlighted);
    visualization.extraction.highlightChampions(highlighted);
    for (const slot of resultSlots) {
      const number = Number(slot.textContent);
      slot.classList.toggle('campeao', champion.active && highlighted.includes(number));
    }
  }

  function clearChampion() {
    applyChampion(describeChampions([]), { conferenced: false });
  }

  const celebration = createCelebrationOverlay({ root: root.body ?? root });
  const roleta = createRoleta(find('#roleta'), {
    audio,
    reducedMotion,
  });

  const results = find('#resultados-globo');
  const resultSlots = [];
  for (let index = 0; index < EXTRACTION_SIZE; index += 1) {
    const slot = document.createElement('span');
    slot.className = 'resultado-slot';
    slot.textContent = '--';
    results.appendChild(slot);
    resultSlots.push(slot);
  }

  /** Faixa de resultado comum aos dois modos visuais. */
  function revealShared(number, index, state) {
    const slot = resultSlots[index];
    if (!slot) return;
    slot.textContent = pad(number);
    slot.classList.add('preenchido');
    for (const other of resultSlots) other.classList.remove('ultimo');
    slot.classList.add('ultimo');
    if (!state.instant && !state.instantMode) {
      slot.classList.remove('destaque');
      void slot.offsetWidth;
      slot.classList.add('destaque');
    } else {
      slot.classList.remove('destaque');
    }
  }

  function resetShared() {
    for (const slot of resultSlots) {
      slot.textContent = '--';
      slot.classList.remove('preenchido', 'destaque', 'ultimo', 'campeao');
    }
    // Todo reset de view inicia uma nova extração. O destaque só voltará depois
    // da conferência deste concurso; a conferência matemática não é alterada.
    clearChampion();
  }

  const views = {
    globo: {
      reveal(number, index, state) {
        // Nenhum override de destaque durante a extração: o resultado dos
        // bilhetes ainda não foi conferido neste concurso.
        visualization.extraction.reveal(number, index);
        revealShared(number, index, state);
      },
      startSpin() {
        audio.playEffect('mix');
        visualization.startMixing();
      },
      reset() {
        visualization.extraction.reset();
        resetShared();
      },
      setPaused(value) {
        visualization.setVisualPaused(value);
      },
      setSpeed(value) {
        visualization.setVisualSpeed(value);
      },
      setPresentationMode(mode, state) {
        visualization.setPresentationMode(mode, state);
      },
    },
    roleta: {
      reveal(number, index, state) {
        roleta.reveal(number, index, state);
        revealShared(number, index, state);
      },
      startSpin() {
        audio.playEffect('mix');
        roleta.startSpin();
      },
      reset() {
        roleta.reset();
        resetShared();
      },
      setPaused(value) {
        roleta.setPaused(value);
      },
      setSpeed(value) {
        roleta.setSpeed(value);
      },
      setPresentationMode(mode) {
        roleta.setPresentationMode(mode);
      },
    },
  };

  const status = find('#status');
  const buttonSortear = find('#btn-sortear');
  const buttonPause = find('#btn-pausar');
  const buttonResume = find('#btn-continuar');
  const buttonNext = find('#btn-proximo');
  const buttonAll = find('#btn-todos');
  const buttonRestart = find('#btn-reiniciar');
  const radioGlobo = find('#modo-globo');
  const radioRoleta = find('#modo-roleta');
  const speedInput = find('#velocidade');
  const speedValue = find('#velocidade-valor');
  const ritmoInputs = [...root.querySelectorAll('input[name="ritmo"]')];
  const progressBar = find('#progresso-barra');
  const progressText = find('#progresso-texto');
  const progressWrapper = progressBar?.parentElement;

  function updateUI(state) {
    find('#painel-globo').hidden = state.mode !== 'globo';
    find('#painel-roleta').hidden = state.mode !== 'roleta';
    radioGlobo.checked = state.mode === 'globo';
    radioRoleta.checked = state.mode === 'roleta';

    if (speedInput && Number(speedInput.value) !== state.speed) {
      speedInput.value = String(state.speed);
    }
    if (speedValue) speedValue.textContent = formatSpeed(state.speed);
    for (const input of ritmoInputs) {
      input.checked = input.value === state.presentationMode;
    }

    const modeLabel = state.mode === 'globo' ? 'Globo 3D' : 'Roleta simplificada';
    const paceLabel = PRESENTATION_MODE_CONFIG[state.presentationMode]?.label ?? 'Normal';
    status.textContent = `Modo: ${modeLabel} · Ritmo: ${paceLabel} (${formatSpeed(state.speed)})`
      + ` · Revelados: ${state.revealed}/${state.total}`
      + `${state.complete ? ' · Sorteio concluído' : ''}`;

    const percentage = state.total ? (state.revealed / state.total) * 100 : 0;
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `${state.revealed}/${state.total}`;
    progressWrapper?.setAttribute('aria-valuenow', String(state.revealed));
    progressWrapper?.classList.toggle('concluida', state.complete);

    buttonSortear.disabled = state.playing;
    buttonPause.disabled = !state.playing || state.paused || state.complete || state.instantMode;
    buttonResume.disabled = !state.playing || !state.paused || state.instantMode;
    buttonNext.disabled = !state.result || state.complete || state.instantMode;
    buttonAll.disabled = !state.result || state.complete || state.instantMode;
    buttonRestart.disabled = !state.result;
  }

  const show = createShowController({
    session,
    views,
    onChange: updateUI,
    presentationOptions: {
      onReveal(number, index, state) {
        if (state.instant || state.instantMode) return;
        // A roleta possui trilha sonora própria: `spin`, `slowdown`, `reveal` e
        // `last` são disparados quando o destaque para, não na seleção.
        if (show.mode === 'roleta') return;
        audio.playEffect('extract');
        audio.playEffect('reveal');
        if (index === EXTRACTION_SIZE - 1) audio.playEffect('last');
      },
      onComplete() {
        // A trilha de fundo é contínua: o fim do sorteio não a interrompe.
        audio.playEffect('result');
      },
    },
  });
  let contestCache = 1;

  async function handleSimulationReset() {
    // Limpa apenas estado local; os dados persistidos já foram apagados pelo
    // serviço. Nenhuma função gera novo resultado ou nova aposta.
    bets.clearAll();
    replayChampion = null;
    clearChampion();
    celebration.hide();
    show.clear();
    conferredGeneration = session.generation;
    contestCache = 1;
    await refreshContest();
  }

  const historyPanel = createHistoryPanel({ root, history, onReset: handleSimulationReset });
  const preferencesPanel = createPreferencesPanel({
    root,
    history,
    audio,
    onPreferences(next, error) {
      preferences = next;
      if (error) status.textContent = `Não foi possível salvar a preferência: ${error.message}`;
    },
  });
  const sessionId = history ? `ui_${Date.now().toString(36)}` : null;

  async function refreshContest() {
    if (!history) return;
    try {
      contestCache = (await history.getSummary()).currentContest;
    } catch {
      // Falha de leitura não impede o uso da interface.
    }
  }

  bets = createBetsPanel({
    root,
    getResult: () => session.getResult(),
    history,
    sessionId,
    getContest: () => contestCache,
    getGeneration: () => session.generation,
    onDataChange: () => {
      refreshContest();
      historyPanel.refresh();
    },
    onDrawConferred: (conferences, draw) => {
      applyChampion(describeChampions(conferences, draw));
    },
  });

  // Conferência automática: apenas quando um novo resultado é concluído. A
  // comemoração é somente leitura; toda a conferência/finança já aconteceu em
  // `registerDrawResult`, antes de `planCelebration`.
  let conferredGeneration = 0;
  show.subscribe((state) => {
    if (!state.complete || session.generation === conferredGeneration) return;
    conferredGeneration = session.generation;
    (async () => {
      const conferences = await bets.registerDrawResult(session.getFrozenResult());
      if (!Array.isArray(conferences) || conferences.length === 0) return;

      if (history) {
        try {
          const summary = await history.getSummary();
          if (summary?.settings) {
            preferences = readPreferences(summary.settings);
            preferencesPanel.refresh(summary.settings);
            audio.configure(preferences);
          }
        } catch {
          // Preferências já carregadas continuam válidas nesta sessão.
        }
      }

      const championInfo = bets.getChampion();
      const plan = planCelebration({
        conferences,
        champion: championInfo,
        settings: preferences,
        random: createTestRandom(),
      });
      celebration.show(plan);
      if (championInfo.active) audio.playEffect('champion');
      const intensity = plan.items.some((item) => item.intensity === 'grande')
        ? 'grande'
        : plan.items.some((item) => item.intensity === 'moderada') ? 'moderada' : 'discreta';
      audio.playEffect(plan.summary.anyCelebration ? 'win' : 'noPrize', { intensity });
      if (plan.summary.fireworks) audio.playEffect('fireworks');
    })().catch((error) => console.warn('Apresentação de resultado indisponível:', error));
  });

  // A apresentação pode ser replayada na troca de modo; reaplicamos o destaque
  // quando a reprodução termina, sem nova conferência e sem novo resultado.
  let wasComplete = false;
  show.subscribe((state) => {
    if (state.complete && !wasComplete) {
      const next = replayChampion ?? (champion.active ? champion : null);
      replayChampion = null;
      if (next) applyChampion(next);
    }
    wasComplete = state.complete;
  });

  // A troca de modo visual não recalcula nem descarta o campeão: ele permanece
  // visível até o próximo sorteio ou conferência manual.
  radioGlobo.addEventListener('change', () => {
    if (!radioGlobo.checked) return;
    replayChampion = champion.active ? champion : null;
    show.selectMode('globo');
  });
  radioRoleta.addEventListener('change', () => {
    if (!radioRoleta.checked) return;
    replayChampion = champion.active ? champion : null;
    show.selectMode('roleta');
  });

  // O globo consome GPU mesmo oculto: a animação só roda no modo visível.
  show.subscribe((state) => {
    if (typeof visualization.stopAnimation !== 'function') return;
    if (state.mode === 'globo') visualization.startAnimation?.();
    else visualization.stopAnimation();
  });

  for (const input of ritmoInputs) {
    input.addEventListener('change', () => {
      if (input.checked) show.setPresentationMode(input.value);
    });
  }
  find('#btn-sortear').addEventListener('click', () => {
    audio.unlock();
    audio.playEffect('start');
    replayChampion = null;
    clearChampion();
    show.startDraw();
  });
  buttonPause.addEventListener('click', () => {
    show.pause();
  });
  buttonResume.addEventListener('click', () => {
    show.resume();
  });
  buttonNext.addEventListener('click', () => {
    audio.unlock();
    show.revealNext();
  });
  buttonAll.addEventListener('click', () => {
    audio.unlock();
    show.revealAll();
  });
  buttonRestart.addEventListener('click', () => {
    audio.unlock();
    replayChampion = champion.active ? champion : null;
    show.restart();
  });
  speedInput.addEventListener('input', (event) => {
    show.setSpeed(event.target.value);
  });

  const navigation = createNavigation({
    root,
    getArea: (id) => (id === 'sorteio' ? find('#area-sorteio') : find(`#painel-${id}`)),
    onChange(id) {
      if (id === 'sorteio') visualization?.resize?.();
      else roleta.cancelAnimation();
      if (['historico', 'financeiro', 'estatisticas'].includes(id)) historyPanel.refresh();
    },
  });

  const linkHistorico = find('#ver-historico');
  const goToHistorico = () => navigation.show('historico');
  linkHistorico?.addEventListener('click', goToHistorico);

  const ready = (async () => {
    if (!history) {
      audio.configure(preferences);
      return;
    }
    await refreshContest();
    try {
      const summary = await history.getSummary();
      if (summary?.settings) {
        preferences = readPreferences(summary.settings);
        preferencesPanel.refresh(summary.settings);
      }
    } catch {
      // Preferências padrão já estão aplicadas no áudio.
    }
    audio.configure(preferences);
    await bets.hydrate();
    await historyPanel.refresh();
  })();

  updateUI(show.getState());

  function useRoletaFallback() {
    if (show.mode !== 'roleta') show.selectMode('roleta');
    const help = find('#aviso-3d');
    if (help) {
      help.textContent = webGlFallbackMessage();
      help.hidden = false;
    }
    if (status) status.textContent = webGlFallbackMessage();
  }

  return {
    session,
    show,
    roleta,
    bets,
    history,
    historyPanel,
    preferencesPanel,
    celebration,
    audio,
    navigation,
    ready,
    get mode() {
      return show.mode;
    },
    get result() {
      return session.getResult();
    },
    get state() {
      return show.getState();
    },
    setPresentationMode: (mode) => show.setPresentationMode(mode),
    setSpeed: (value) => show.setSpeed(value),
    showTab: (which) => navigation.show(which),
    useRoletaFallback,
    dispose() {
      show.dispose();
      bets.dispose();
      historyPanel.dispose();
      navigation.dispose();
      roleta.dispose();
      preferencesPanel.dispose();
      celebration.dispose();
      audio.dispose();
      linkHistorico?.removeEventListener('click', goToHistorico);
    },
  };
}
