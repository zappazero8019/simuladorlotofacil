import { readPreferences, volumeToGain } from '../settings/preferences.js';

export const AUDIO_EFFECTS = Object.freeze([
  'start',
  'mix',
  'spin',
  'slowdown',
  'extract',
  'reveal',
  'match',
  'last',
  'result',
  'noPrize',
  'win',
  'fireworks',
]);

// Trilha original e instrumental: compasso lento, registro médio-baixo e seno
// suave. Não há percussão, ruído nem ataques bruscos na música de fundo.
// Intervalo mínimo entre dois toques de acerto do primeiro bilhete. Mesmo no
// ritmo acelerado isso evita sobreposição com a própria confirmação da parada.
const MATCH_MIN_INTERVAL_SECONDS = 0.09;

const LOOP_STEP_SECONDS = 0.42;
const LOOP_STEPS = 8;
const LOOP_INTERVAL_MS = LOOP_STEP_SECONDS * LOOP_STEPS * 1000;

// Frase de 24 notas (três blocos de 8): o ciclo não recomeça no mesmo ponto a
// cada bloco, evitando a sensação de "reinício" do loop.
const MELODY = Object.freeze([
  392.00, 440.00, 523.25, 493.88, 440.00, 392.00, 349.23, 392.00,
  329.63, 392.00, 440.00, 392.00, 349.23, 329.63, 293.66, 349.23,
  392.00, 440.00, 493.88, 523.25, 587.33, 523.25, 493.88, 440.00,
]);

// Pad sustentado, trocado a cada bloco; nenhuma nota funciona como batida.
const PAD_ROOTS = Object.freeze([130.81, 146.83, 174.61, 146.83]);

const defaultTimer = {
  set: (callback, delay) => globalThis.setInterval(callback, delay),
  clear: (id) => globalThis.clearInterval(id),
};

function defaultCreateContext() {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    return new AudioContextClass({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
}

function param(node, name) {
  return node?.[name] ?? null;
}

function setParamValue(target, value, time, smooth = false) {
  if (!target) return;
  if (smooth && typeof target.setTargetAtTime === 'function' && Number.isFinite(time)) {
    target.setTargetAtTime(value, time, 0.03);
    return;
  }
  if (typeof target.setValueAtTime === 'function' && Number.isFinite(time)) {
    target.setValueAtTime(value, time);
    return;
  }
  target.value = value;
}

function rampToZero(target, time, duration) {
  if (!target) return;
  if (typeof target.exponentialRampToValueAtTime === 'function' && Number.isFinite(time)) {
    target.exponentialRampToValueAtTime(0.0001, time + duration);
    return;
  }
  target.value = 0;
}

function safeConnect(source, destination) {
  if (typeof source?.connect !== 'function' || !destination) return;
  try {
    source.connect(destination);
  } catch {
    // Um grafo indisponível nunca pode impedir a apresentação do sorteio.
  }
}

function safeDisconnect(node) {
  if (typeof node?.disconnect !== 'function') return;
  try {
    node.disconnect();
  } catch {
    // Nós já desconectados pelo navegador não exigem ação adicional.
  }
}

/**
 * Áudio procedural com Web Audio API. Nenhum arquivo de mídia é carregado e a
 * criação do `AudioContext` acontece somente após `unlock()` (gesto do usuário).
 */
export function createAudioEngine({
  createContext = defaultCreateContext,
  timer = defaultTimer,
  logger = console,
} = {}) {
  let settings = readPreferences();
  let context = null;
  let master = null;
  let musicBus = null;
  let effectsBus = null;
  let noiseBuffer = null;
  let musicTimer = null;
  let nextNoteTime = 0;
  let musicStep = 0;
  let musicWanted = false;
  let disposed = false;
  let lastMatchAt = -Infinity;
  const pauseReasons = new Set();

  function audioTime() {
    return Number.isFinite(context?.currentTime) ? context.currentTime : 0;
  }

  function applyVolumes({ fade = true } = {}) {
    if (!context || !master || !musicBus || !effectsBus) return;
    const time = audioTime();
    setParamValue(param(master, 'gain'), 0.9, time, fade);
    setParamValue(
      param(musicBus, 'gain'),
      settings.musicEnabled ? volumeToGain(settings.musicVolume) : 0,
      time,
      fade,
    );
    setParamValue(
      param(effectsBus, 'gain'),
      settings.sfxEnabled ? volumeToGain(settings.sfxVolume) : 0,
      time,
      fade,
    );
  }

  function ensureContext() {
    if (disposed) return null;
    if (context) return context;
    try {
      context = createContext();
    } catch (error) {
      logger?.warn?.('Áudio indisponível:', error);
      return null;
    }
    if (!context || typeof context.createGain !== 'function') {
      context = null;
      return null;
    }
    try {
      master = context.createGain();
      musicBus = context.createGain();
      effectsBus = context.createGain();
      safeConnect(musicBus, master);
      safeConnect(effectsBus, master);
      safeConnect(master, context.destination);
      applyVolumes({ fade: false });
    } catch (error) {
      logger?.warn?.('Grafo de áudio indisponível:', error);
      context = null;
      master = null;
      musicBus = null;
      effectsBus = null;
      return null;
    }
    return context;
  }

  function resumeContext() {
    if (!context || context.state !== 'suspended' || typeof context.resume !== 'function') return;
    try {
      const result = context.resume();
      result?.catch?.(() => {});
    } catch {
      // Falha de retomada não interrompe a interface.
    }
  }

  function suspendContext() {
    if (!context || context.state === 'closed' || typeof context.suspend !== 'function') return;
    try {
      const result = context.suspend();
      result?.catch?.(() => {});
    } catch {
      // Falha de suspensão não interrompe a interface.
    }
  }

  function scheduleTone({
    frequency,
    start,
    duration,
    gain = 0.12,
    type = 'sine',
    destination = effectsBus,
    sweepTo = null,
    attack = 0.012,
    release = 0.06,
  } = {}) {
    if (!context || typeof context.createOscillator !== 'function') return;
    if (!Number.isFinite(frequency) || !Number.isFinite(duration) || duration <= 0) return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    setParamValue(param(oscillator, 'frequency'), frequency, start);
    if (Number.isFinite(sweepTo) && typeof param(oscillator, 'frequency')?.exponentialRampToValueAtTime === 'function') {
      param(oscillator, 'frequency').exponentialRampToValueAtTime(sweepTo, start + duration);
    }

    const attackTime = Math.min(attack, duration / 3);
    const releaseTime = Math.min(release, duration / 3);
    const sustainEnd = start + duration - releaseTime;
    setParamValue(param(envelope, 'gain'), 0, start);
    if (typeof param(envelope, 'gain')?.linearRampToValueAtTime === 'function') {
      param(envelope, 'gain').linearRampToValueAtTime(gain, start + attackTime);
      setParamValue(param(envelope, 'gain'), gain, sustainEnd);
    } else {
      setParamValue(param(envelope, 'gain'), gain, start);
    }
    rampToZero(param(envelope, 'gain'), sustainEnd, releaseTime);

    safeConnect(oscillator, envelope);
    safeConnect(envelope, destination ?? effectsBus);
    if (typeof oscillator.start === 'function') oscillator.start(start);
    if (typeof oscillator.stop === 'function') oscillator.stop(start + duration + 0.02);
    if (typeof oscillator.addEventListener === 'function') {
      oscillator.addEventListener('ended', () => {
        safeDisconnect(oscillator);
        safeDisconnect(envelope);
      });
    } else {
      oscillator.onended = () => {
        safeDisconnect(oscillator);
        safeDisconnect(envelope);
      };
    }
  }

  function getNoiseBuffer() {
    if (noiseBuffer || typeof context.createBuffer !== 'function') return noiseBuffer;
    const length = Math.floor(44100 * 0.6);
    noiseBuffer = context.createBuffer(1, length, 44100);
    const data = noiseBuffer.getChannelData?.(0);
    if (!data) return null;
    // PRNG local: o áudio nunca consome a fonte aleatória do sorteio.
    let seed = 0x5f3759df;
    for (let index = 0; index < data.length; index += 1) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      data[index] = (seed / 2147483648) - 1;
    }
    return noiseBuffer;
  }

  function playNoise({ start, duration = 0.35, gain = 0.08, filterFrequency = 1800 } = {}) {
    if (!context || typeof context.createBufferSource !== 'function') return;
    const buffer = getNoiseBuffer();
    if (!buffer) return;
    const source = context.createBufferSource();
    const filter = typeof context.createBiquadFilter === 'function'
      ? context.createBiquadFilter()
      : null;
    const envelope = context.createGain();
    source.buffer = buffer;
    if (filter) {
      filter.type = 'highpass';
      setParamValue(param(filter, 'frequency'), filterFrequency, start);
      safeConnect(source, filter);
      safeConnect(filter, envelope);
    } else {
      safeConnect(source, envelope);
    }
    safeConnect(envelope, effectsBus);
    setParamValue(param(envelope, 'gain'), gain, start);
    rampToZero(param(envelope, 'gain'), start + duration * 0.5, duration * 0.5);
    if (typeof source.start === 'function') source.start(start);
    if (typeof source.stop === 'function') source.stop(start + duration);
    source.onended = () => {
      safeDisconnect(source);
      safeDisconnect(filter);
      safeDisconnect(envelope);
    };
  }

  function musicTick() {
    if (disposed || !context || !musicWanted || pauseReasons.size > 0 || !settings.musicEnabled) return;
    const start = Math.max(nextNoteTime, audioTime() + 0.05);
    for (let step = 0; step < LOOP_STEPS; step += 1) {
      scheduleTone({
        frequency: MELODY[(musicStep + step) % MELODY.length],
        start: start + step * LOOP_STEP_SECONDS,
        duration: LOOP_STEP_SECONDS * 0.9,
        gain: 0.05,
        type: 'sine',
        destination: musicBus,
        attack: 0.05,
        release: 0.16,
      });
    }
    const padRoot = PAD_ROOTS[Math.floor(musicStep / LOOP_STEPS) % PAD_ROOTS.length];
    const padDuration = LOOP_STEPS * LOOP_STEP_SECONDS * 0.96;
    scheduleTone({
      frequency: padRoot,
      start,
      duration: padDuration,
      gain: 0.028,
      type: 'sine',
      destination: musicBus,
      attack: 0.25,
      release: 0.4,
    });
    scheduleTone({
      frequency: padRoot * 1.5,
      start,
      duration: padDuration,
      gain: 0.018,
      type: 'sine',
      destination: musicBus,
      attack: 0.3,
      release: 0.4,
    });
    musicStep += LOOP_STEPS;
    nextNoteTime = start + LOOP_STEPS * LOOP_STEP_SECONDS;
  }

  function clearMusicTimer() {
    if (musicTimer === null) return;
    try {
      timer.clear(musicTimer);
    } catch {
      // Temporizadores já encerrados não precisam de limpeza adicional.
    }
    musicTimer = null;
  }

  function startMusicTimer() {
    if (musicTimer !== null || pauseReasons.size > 0 || !settings.musicEnabled) return;
    musicTick();
    musicTimer = timer.set(musicTick, LOOP_INTERVAL_MS);
  }

  function startMusic() {
    if (disposed || !settings.musicEnabled) return false;
    const ctx = ensureContext();
    if (!ctx) return false;
    musicWanted = true;
    applyVolumes();
    startMusicTimer();
    return true;
  }

  function stopMusic({ fade = true } = {}) {
    musicWanted = false;
    clearMusicTimer();
    if (musicBus) {
      if (fade) {
        rampToZero(param(musicBus, 'gain'), audioTime(), 0.35);
      } else {
        setParamValue(param(musicBus, 'gain'), 0, audioTime());
      }
    }
    return true;
  }

  function playEffect(name, { intensity = 'moderada' } = {}) {
    if (disposed || !settings.sfxEnabled || pauseReasons.size > 0) return false;
    const ctx = ensureContext();
    if (!ctx) return false;
    const start = audioTime() + 0.01;

    switch (name) {
      case 'start':
        [523.25, 659.25, 783.99].forEach((frequency, index) => scheduleTone({
          frequency, start: start + index * 0.09, duration: 0.14, gain: 0.11, type: 'triangle',
        }));
        break;
      case 'mix':
        scheduleTone({ frequency: 110, sweepTo: 320, start, duration: 0.55, gain: 0.09, type: 'sawtooth' });
        playNoise({ start, duration: 0.5, gain: 0.045, filterFrequency: 700 });
        break;
      // Giro da roleta: ganho baixo para não cobrir a música de fundo.
      case 'spin':
        scheduleTone({ frequency: 320, start, duration: 0.045, gain: 0.022, type: 'triangle' });
        break;
      case 'slowdown':
        scheduleTone({ frequency: 620, sweepTo: 240, start, duration: 0.2, gain: 0.035, type: 'sine' });
        break;
      case 'extract':
        scheduleTone({ frequency: 420, sweepTo: 700, start, duration: 0.13, gain: 0.12, type: 'square' });
        break;
      case 'reveal':
        scheduleTone({ frequency: 880, start: start + 0.06, duration: 0.24, gain: 0.1, type: 'sine' });
        scheduleTone({ frequency: 1318.5, start: start + 0.09, duration: 0.2, gain: 0.05, type: 'sine' });
        break;
      // Acerto do primeiro bilhete: dois sinos curtos e graves, distintos do
      // som de extração e da confirmação normal, com limitador de repetição.
      case 'match': {
        const now = audioTime();
        if (now - lastMatchAt < MATCH_MIN_INTERVAL_SECONDS) return false;
        lastMatchAt = now;
        scheduleTone({
          frequency: 659.25, start, duration: 0.18, gain: 0.085,
          type: 'sine', attack: 0.008, release: 0.11,
        });
        scheduleTone({
          frequency: 987.77, start: start + 0.07, duration: 0.22, gain: 0.06,
          type: 'sine', attack: 0.008, release: 0.14,
        });
        break;
      }
      case 'last':
        [659.25, 830.61, 987.77, 1318.5].forEach((frequency, index) => scheduleTone({
          frequency, start: start + index * 0.07, duration: 0.3, gain: 0.1, type: 'triangle',
        }));
        break;
      case 'result':
        [523.25, 622.25, 783.99].forEach((frequency, index) => scheduleTone({
          frequency, start: start + index * 0.1, duration: 0.3, gain: 0.09, type: 'triangle',
        }));
        break;
      case 'noPrize':
        scheduleTone({ frequency: 392, start, duration: 0.22, gain: 0.07, type: 'sine' });
        scheduleTone({ frequency: 329.63, start: start + 0.15, duration: 0.28, gain: 0.06, type: 'sine' });
        break;
      case 'win': {
        const notes = intensity === 'grande'
          ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
          : [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((frequency, index) => scheduleTone({
          frequency, start: start + index * 0.1, duration: 0.34, gain: 0.1, type: 'triangle',
        }));
        break;
      }
      case 'fireworks':
        playNoise({ start, duration: 0.6, gain: 0.07, filterFrequency: 1200 });
        scheduleTone({ frequency: 1760, sweepTo: 440, start: start + 0.08, duration: 0.42, gain: 0.06, type: 'sine' });
        break;
      default:
        return false;
    }
    return true;
  }

  function pause(reason = 'manual') {
    pauseReasons.add(String(reason));
    clearMusicTimer();
    suspendContext();
    return true;
  }

  function resume(reason = 'manual') {
    pauseReasons.delete(String(reason));
    if (pauseReasons.size > 0) return false;
    if (disposed) return false;
    resumeContext();
    if (musicWanted) startMusicTimer();
    return true;
  }

  function stopAll() {
    stopMusic({ fade: false });
    pause('encerramento');
    return true;
  }

  function configure(nextSettings = {}) {
    settings = readPreferences({ ...settings, ...nextSettings });
    applyVolumes({ fade: false });
    if (!settings.musicEnabled) {
      stopMusic({ fade: false });
      return { ...settings };
    }
    // Com o contexto já liberado por um gesto, ativar a música retoma a trilha
    // contínua na hora. Antes do gesto não criamos ÁudioContext (autoplay).
    if (context && !musicWanted && pauseReasons.size === 0) startMusic();
    return { ...settings };
  }

  function dispose() {
    if (disposed) return;
    stopMusic({ fade: false });
    disposed = true;
    pauseReasons.clear();
    safeDisconnect(master);
    safeDisconnect(musicBus);
    safeDisconnect(effectsBus);
    if (context && typeof context.close === 'function') {
      try {
        const result = context.close();
        result?.catch?.(() => {});
      } catch {
        // Encerramento do contexto é feito no melhor esforço.
      }
    }
    context = null;
    master = null;
    musicBus = null;
    effectsBus = null;
    noiseBuffer = null;
  }

  return {
    unlock() {
      const ctx = ensureContext();
      if (!ctx) return false;
      resumeContext();
      applyVolumes({ fade: false });
      return true;
    },
    configure,
    startMusic,
    stopMusic,
    playEffect,
    pause,
    resume,
    stopAll,
    dispose,
    // `tick` é público apenas para testes determinísticos do loop.
    tick: musicTick,
    get settings() {
      return { ...settings };
    },
    get contextState() {
      return context?.state ?? null;
    },
    get isMusicPlaying() {
      return musicWanted && musicTimer !== null && pauseReasons.size === 0;
    },
    get isPaused() {
      return pauseReasons.size > 0;
    },
    get isDisposed() {
      return disposed;
    },
  };
}
