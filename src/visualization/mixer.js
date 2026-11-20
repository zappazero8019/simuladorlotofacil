/** Velocidade visual da mistura, restrita à faixa suportada pela interface. */
function clampVisualSpeed(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(0.5, Math.min(5, parsed));
}

/**
 * Controlador independente da mistura: transforma os comandos iniciar/parar em
 * uma intensidade contínua e entrega essa intensidade ao mundo físico.
 * Não conhece cena, câmera, iluminação, renderização nem regras do jogo.
 *
 * A velocidade altera apenas a rampa de intensidade. O `delta` enviado ao
 * mundo físico não é modificado, portanto o timestep fixo e as colisões
 * permanecem estáveis em qualquer ritmo visual.
 */
export function createMixer(world, {
  rampUp = 1.1,
  rampDown = 0.9,
  lowPower = false,
} = {}) {
  if (!world || typeof world.step !== 'function') {
    throw new TypeError('world deve expor step(delta, intensity).');
  }

  const baseUpTau = lowPower ? rampUp * 1.25 : rampUp;
  const baseDownTau = lowPower ? rampDown * 1.25 : rampDown;
  let active = false;
  let intensity = 0;
  let speed = 1;
  let paused = false;
  let disposed = false;

  function start() {
    if (disposed || active) return false;
    active = true;
    world.kick?.(0.5);
    return true;
  }

  function stop() {
    if (disposed || !active) return false;
    active = false;
    return true;
  }

  function setSpeed(value) {
    if (disposed) return speed;
    speed = clampVisualSpeed(value, speed);
    return speed;
  }

  function setPaused(value) {
    if (disposed) return paused;
    paused = Boolean(value);
    return paused;
  }

  /** Atualiza a transição e avança a física com o delta informado. */
  function update(delta) {
    if (disposed || paused) return intensity;

    const target = active ? 1 : 0;
    const tau = (active ? baseUpTau : baseDownTau) / speed;
    if (Number.isFinite(delta) && delta > 0) {
      const factor = 1 - Math.exp(-delta / Math.max(0.01, tau));
      intensity += (target - intensity) * factor;
      if (Math.abs(target - intensity) < 0.001) intensity = target;
    }

    world.step(delta, intensity);
    return intensity;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    active = false;
    intensity = 0;
  }

  return {
    start,
    stop,
    update,
    setSpeed,
    setPaused,
    dispose,
    get intensity() {
      return intensity;
    },
    get isActive() {
      return active;
    },
    get isPaused() {
      return paused;
    },
    get speed() {
      return speed;
    },
    get isDisposed() {
      return disposed;
    },
  };
}
