import { BALL_RADIUS } from './constants.js';
import { createScene } from './scene.js';
import { createCamera, updateCamera } from './camera.js';
import { createLighting } from './lighting.js';
import { createGlobe } from './globe.js';
import { createBalls, getBallNumbers, syncBalls } from './balls.js';
import { createPhysicsWorld } from './physics.js';
import { createMixer } from './mixer.js';
import { createExtractionController } from './extraction.js';
import { createRenderer, resizeRenderer, disposeRenderer } from './renderer.js';
import { disposeObject } from './resources.js';

export * from './constants.js';
export * from './numberTexture.js';
export * from './scene.js';
export * from './camera.js';
export * from './lighting.js';
export * from './globe.js';
export * from './balls.js';
export * from './physics.js';
export * from './mixer.js';
export * from './extraction.js';
export * from './renderer.js';
export * from './resources.js';

/** Heurística simples para reduzir custo em GPUs limitadas. */
export function detectLowPower() {
  const cores = globalThis.navigator?.hardwareConcurrency ?? 8;
  const screenWidth = globalThis.screen?.width ?? 1920;
  return cores <= 4 || screenWidth <= 768;
}

/**
 * Monta a visualização dentro de `container` e inicia a mistura física.
 * Não há sorteio, extração, áudio, persistência nem dependência do motor
 * matemático. `options.random` permite semente controlada para a física.
 */
export function createVisualization(container, options = {}) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new TypeError('container deve ser um elemento DOM.');
  }

  const lowPower = options.lowPower ?? detectLowPower();
  const reducedMotion = options.reducedMotion
    ?? Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const scene = createScene();
  const camera = createCamera(1);
  const lighting = createLighting(scene, { lowPower });
  const globe = createGlobe({ lowPower });
  const balls = createBalls({ lowPower });

  scene.add(globe);
  scene.add(balls);

  const initialPositions = balls.children.map((ball) => ball.position.clone());
  const physics = createPhysicsWorld({
    positions: initialPositions,
    radius: BALL_RADIUS,
    lowPower,
    random: options.random,
  });
  const mixer = createMixer(physics, { lowPower });
  const extraction = createExtractionController({
    balls,
    physics,
    reducedMotion,
    onExtracted: options.onExtracted,
  });

  const renderer = createRenderer({
    lowPower,
    pixelRatio: options.pixelRatio,
  });
  renderer.domElement.className = 'globo-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis) ?? null;
  const cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) ?? null;
  let disposed = false;
  let animating = false;
  let contextLost = false;
  let frameId = null;
  let lastTime = 0;

  /** Desenha sem avançar a física (mantém a API pública da Fase 2A). */
  function render() {
    if (!disposed) renderer.render(scene, camera);
  }

  function frame(time) {
    if (disposed || !animating) return;
    const delta = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;
    mixer.update(delta);
    extraction.update(delta);
    syncBalls(balls, physics.bodies);
    renderer.render(scene, camera);
    frameId = requestFrame ? requestFrame(frame) : null;
    if (!requestFrame) animating = false;
  }

  function startAnimation() {
    if (animating || disposed || contextLost || !requestFrame) return false;
    animating = true;
    lastTime = 0;
    frameId = requestFrame(frame);
    return true;
  }

  function stopAnimation() {
    animating = false;
    if (frameId !== null && cancelFrame) cancelFrame(frameId);
    frameId = null;
  }

  function resize() {
    if (disposed) return;
    const width = container.clientWidth || container.getBoundingClientRect().width || 1;
    const height = container.clientHeight || container.getBoundingClientRect().height || 1;
    resizeRenderer(renderer, width, height);
    updateCamera(camera, width / height);
    render();
  }

  const observer = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(resize);
  observer?.observe(container);
  resize();

  // Contexto WebGL pode ser perdido ao suspender a aba em Android. A cena e a
  // física permanecem em memória; apenas a GPU é reconstruída pelo navegador.
  const canvas = renderer.domElement;
  const onContextLost = (event) => {
    event.preventDefault();
    contextLost = true;
    stopAnimation();
  };
  const onContextRestored = () => {
    if (disposed) return;
    contextLost = false;
    resize();
    startAnimation();
  };
  const doc = globalThis.document;
  const onVisibility = () => {
    if (disposed) return;
    if (doc?.hidden) stopAnimation();
    else startAnimation();
  };
  const onViewportResize = () => {
    if (!disposed) resize();
  };
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);
  doc?.addEventListener?.('visibilitychange', onVisibility);
  globalThis.visualViewport?.addEventListener?.('resize', onViewportResize);

  mixer.start();
  startAnimation();

  function startMixing() {
    if (disposed || extraction.isInstant) return;
    mixer.start();
    startAnimation();
  }

  function stopMixing() {
    if (disposed) return;
    mixer.stop();
  }

  /** Velocidade puramente visual: não altera `delta` nem o passo da física. */
  function setVisualSpeed(value) {
    if (disposed) return;
    mixer.setSpeed(value);
    extraction.setSpeed(value);
  }

  function setVisualPaused(value) {
    if (disposed) return;
    mixer.setPaused(value);
    extraction.setPaused(value);
  }

  /** No modo instantâneo a mistura é interrompida e as bolas vão direto ao slot. */
  function setPresentationMode(mode, state = {}) {
    if (disposed) return;
    const instant = mode === 'instantaneo' || state.instant === true;
    extraction.setInstant(instant);
    mixer.setPaused(Boolean(state.paused));
    if (instant) mixer.stop();
    else mixer.start();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopAnimation();
    mixer.dispose();
    extraction.dispose();
    physics.dispose();
    observer?.disconnect();
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    doc?.removeEventListener?.('visibilitychange', onVisibility);
    globalThis.visualViewport?.removeEventListener?.('resize', onViewportResize);
    lighting.dispose();
    disposeObject(scene);
    disposeRenderer(renderer);
  }

  return {
    scene,
    camera,
    renderer,
    globe,
    balls,
    lighting,
    lowPower,
    reducedMotion,
    physics,
    mixer,
    extraction,
    render,
    resize,
    dispose,
    startMixing,
    stopMixing,
    setVisualSpeed,
    setVisualPaused,
    setPresentationMode,
    startAnimation,
    stopAnimation,
    isMixing: () => mixer.isActive,
    getMixIntensity: () => mixer.intensity,
    getBallNumbers: () => getBallNumbers(balls),
    get isAnimating() {
      return animating;
    },
    get frameId() {
      return frameId;
    },
  };
}
