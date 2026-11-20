import './styles.css';
import { createInterface } from './ui/index.js';
import { createDeferredVisualization } from './ui/deferredVisualization.js';
import { isWebGlAvailable } from './ui/webglSupport.js';
import { installAndroidBridge } from './androidBridge.js';
import { installFirstGestureAudio } from './audio/index.js';
import { createVisibilityHandler } from './ui/visibility.js';
import {
  createHistoryService,
  createIndexedDbStore,
  createMemoryStore,
  isIndexedDbAvailable,
} from './persistence/index.js';

const app = document.querySelector('#app');
const stage = document.querySelector('#globo');

if (app) app.dataset.phase = '7';

/** IndexedDB é primário; memória é usada apenas se o navegador bloquear o banco. */
async function createHistory() {
  if (isIndexedDbAvailable()) {
    try {
      const service = createHistoryService({ store: createIndexedDbStore() });
      await service.initialize();
      return service;
    } catch (error) {
      console.warn('IndexedDB indisponível; usando armazenamento em memória.', error);
    }
  }
  const service = createHistoryService({ store: createMemoryStore() });
  await service.initialize();
  return service;
}

function whenIdle(callback) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(callback, { timeout: 1500 });
  } else {
    globalThis.setTimeout(callback, 0);
  }
}

async function start() {
  const history = await createHistory();

  if (stage) {
    // A interface sobe primeiro; o Three.js entra em um chunk separado.
    const webgl = isWebGlAvailable();
    const reducedMotion = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    const deferred = createDeferredVisualization(stage, undefined, {
      available: webgl,
      onUnavailable: () => globalThis.__lotofacilInterface?.useRoletaFallback(),
      visualizationOptions: { reducedMotion },
    });
    const ui = createInterface({ visualization: deferred.proxy, history });

    globalThis.__lotofacilVisualization = deferred.proxy;
    globalThis.__lotofacilInterface = ui;
    globalThis.__lotofacilApostas = ui.bets;
    globalThis.__lotofacilHistorico = history;

    // A trilha começa no primeiro gesto válido e acompanha o jogador durante
    // toda a navegação, independentemente do sorteio ou do modo visual.
    installFirstGestureAudio(ui.audio);

    if (!webgl) ui.useRoletaFallback();

    whenIdle(() => {
      deferred.load().then((instance) => {
        if (instance) globalThis.__lotofacilVisualization = instance;
      });
    });

    await ui.ready;

    // No APK, registra voltar/suspensão e ajusta as barras; na web não carrega
    // nenhum módulo nativo adicional.
    installAndroidBridge(ui).catch((error) => {
      console.warn('Ponte Android indisponível:', error);
    });

    // BFCache: ao navegar para outro app e voltar no Android, a página pode ser
    // restaurada intacta. Dispor nesse caso deixaria a interface sem eventos e
    // o WebGL sem contexto.
    globalThis.addEventListener('pagehide', (event) => {
      if (event.persisted) return;
      ui.audio?.stopAll?.();
      ui.dispose();
      deferred.proxy.dispose();
    });
    globalThis.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      globalThis.__lotofacilVisualization = deferred.proxy.isReady
        ? deferred.instance ?? deferred.proxy
        : deferred.proxy;
      deferred.proxy.resize?.();
    });

    // Troca de aba no navegador: pausa o giro e o áudio, retomando apenas o que
    // foi pausado por aqui para não conflitar com a ponte Android.
    globalThis.addEventListener('visibilitychange', createVisibilityHandler(ui));
  }
}

/** Registro opcional: falha do SW nunca impede o uso da aplicação. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  globalThis.addEventListener('load', () => {
    // Hash do bundle muda a cada build: força atualização do SW e invalida o
    // cache do shell, evitando servir código antigo com banco novo.
    const bundle = document.querySelector('script[type="module"][src]')?.src ?? '';
    const version = bundle.match(/index-([^.]+)\.js/)?.[1] ?? 'desconhecida';
    navigator.serviceWorker.register(new URL(`sw.js?v=${version}`, document.baseURI).href).catch(() => {});
  });
}

start().catch((error) => {
  console.error('Falha ao iniciar o simulador:', error);
  const status = document.querySelector('#status');
  if (status) status.textContent = `Falha ao iniciar: ${error.message}`;
});
