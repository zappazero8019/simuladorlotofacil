/**
 * Proxy para o módulo 3D. A interface é montada antes do Three.js; chamadas
 * feitas enquanto o módulo carrega são aplicadas em ordem quando ele chega.
 * Nenhuma decisão matemática passa por aqui.
 */
export function createDeferredVisualization(
  container,
  importer = () => import('../visualization/index.js'),
  { available = true, onUnavailable = () => {}, visualizationOptions = {} } = {},
) {
  let instance = null;
  let loading = null;
  let disposed = false;
  let unavailable = !available;
  const pending = [];

  function enqueue(method, args) {
    if (instance) return instance[method]?.(...args);
    // Após falha não há receptor para a fila: acumular chamadas vazaria memória.
    if (disposed || unavailable) return undefined;
    pending.push([method, args]);
    return undefined;
  }

  const proxy = {
    extraction: {
      reveal: (...args) => enqueue('extractionReveal', args),
      reset: (...args) => enqueue('extractionReset', args),
    },
    startMixing: (...args) => enqueue('startMixing', args),
    stopMixing: (...args) => enqueue('stopMixing', args),
    setVisualPaused: (...args) => enqueue('setVisualPaused', args),
    setVisualSpeed: (...args) => enqueue('setVisualSpeed', args),
    setPresentationMode: (...args) => enqueue('setPresentationMode', args),
    startAnimation: (...args) => enqueue('startAnimation', args),
    stopAnimation: (...args) => enqueue('stopAnimation', args),
    resize: (...args) => enqueue('resize', args),
    render: (...args) => enqueue('render', args),
    dispose() {
      disposed = true;
      if (instance) instance.dispose();
    },
    get isReady() {
      return Boolean(instance);
    },
    get isDisposed() {
      return disposed;
    },
    get isUnavailable() {
      return unavailable;
    },
  };

  function apply(method, args) {
    if (method === 'extractionReveal') instance.extraction.reveal(...args);
    else if (method === 'extractionReset') instance.extraction.reset(...args);
    else instance[method]?.(...args);
  }

  function load() {
    if (loading) return loading;
    if (disposed || unavailable) return Promise.resolve(null);
    loading = importer()
      .then((module) => {
        if (disposed) return null;
        instance = module.createVisualization(container, visualizationOptions);
        for (const [method, args] of pending.splice(0)) apply(method, args);
        return instance;
      })
      .catch((error) => {
        unavailable = true;
        console.warn('Falha ao carregar a visualização 3D; usando roleta.', error);
        onUnavailable();
        return null;
      });
    return loading;
  }

  return { proxy, load, get instance() { return instance; } };
}
