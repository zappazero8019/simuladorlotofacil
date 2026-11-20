import { describe, expect, it } from 'vitest';
import { AUDIO_EFFECTS, createAudioEngine } from '../src/audio/index.js';

class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.calls = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.calls.push(['set', value, time]);
  }

  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.calls.push(['linear', value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.value = value;
    this.calls.push(['exp', value, time]);
  }

  setTargetAtTime(value, time, constant) {
    this.value = value;
    this.calls.push(['target', value, time, constant]);
  }
}

class FakeNode {
  constructor(context) {
    this.context = context;
    this.connections = [];
    this.disconnected = false;
  }

  connect(destination) {
    this.connections.push(destination);
    return destination;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeOscillator extends FakeNode {
  constructor(context) {
    super(context);
    this.frequency = new FakeParam(440);
    this.type = 'sine';
    this.started = null;
    this.stopped = null;
    context.oscillators.push(this);
  }

  start(time) { this.started = time; }

  stop(time) { this.stopped = time; }
}

class FakeGain extends FakeNode {
  constructor(context) {
    super(context);
    this.gain = new FakeParam(1);
    context.gains.push(this);
  }
}

class FakeContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 1;
    this.destination = new FakeNode(this);
    this.oscillators = [];
    this.gains = [];
    this.sources = [];
    this.resumeCalls = 0;
    this.suspendCalls = 0;
    this.closeCalls = 0;
  }

  createGain() { return new FakeGain(this); }

  createOscillator() { return new FakeOscillator(this); }

  createBuffer(channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }

  createBufferSource() {
    const node = new FakeNode(this);
    node.start = () => {};
    node.stop = () => {};
    this.sources.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new FakeNode(this);
    node.frequency = new FakeParam(1000);
    return node;
  }

  resume() { this.resumeCalls += 1; this.state = 'running'; return Promise.resolve(); }

  suspend() { this.suspendCalls += 1; this.state = 'suspended'; return Promise.resolve(); }

  close() { this.closeCalls += 1; this.state = 'closed'; return Promise.resolve(); }
}

function makeTimer() {
  let next = 1;
  const callbacks = new Map();
  return {
    set(callback) {
      const id = next;
      next += 1;
      callbacks.set(id, callback);
      return id;
    },
    clear(id) { callbacks.delete(id); },
    fire() { for (const callback of [...callbacks.values()]) callback(); },
    get count() { return callbacks.size; },
  };
}

function makeEngine(overrides = {}) {
  const contexts = [];
  const timer = makeTimer();
  const engine = createAudioEngine({
    createContext: () => {
      const context = new FakeContext();
      contexts.push(context);
      return context;
    },
    timer,
    logger: { warn() {} },
    ...overrides,
  });
  return { engine, timer, contexts };
}

describe('Fase 9 — áudio procedural', () => {
  it('não cria AudioContext antes da interação do usuário', () => {
    const { engine, contexts } = makeEngine();
    expect(contexts).toHaveLength(0);
    expect(engine.unlock()).toBe(true);
    expect(contexts).toHaveLength(1);
    engine.dispose();
  });

  it('ativa e desativa a música sem apagar as demais preferências', () => {
    const { engine, timer, contexts } = makeEngine();
    engine.configure({ musicEnabled: true, musicVolume: 50, sfxVolume: 80 });
    expect(engine.startMusic()).toBe(true);
    expect(engine.isMusicPlaying).toBe(true);
    expect(timer.count).toBe(1);

    engine.configure({ musicEnabled: false });
    expect(engine.isMusicPlaying).toBe(false);
    expect(timer.count).toBe(0);
    expect(contexts[0].gains[1].gain.value).toBeLessThan(0.001);
    expect(engine.settings.sfxVolume).toBe(80);
    engine.dispose();
  });

  it('ativa e desativa os efeitos sonoros', () => {
    const { engine, contexts } = makeEngine();
    // Isola os efeitos da trilha contínua, que agora começa ao configurar com o
    // contexto já livre; aqui queremos medir apenas os osciladores dos efeitos.
    engine.configure({ musicEnabled: false, sfxEnabled: true });
    expect(engine.playEffect('reveal')).toBe(true);
    const count = contexts[0].oscillators.length;
    expect(count).toBeGreaterThan(0);

    engine.configure({ sfxEnabled: false });
    expect(engine.playEffect('reveal')).toBe(false);
    expect(contexts[0].oscillators).toHaveLength(count);
    engine.dispose();
  });

  it('mantém volumes independentes para música e efeitos', () => {
    const { engine, contexts } = makeEngine();
    engine.configure({ musicVolume: 20, sfxVolume: 90 });
    engine.unlock();
    expect(contexts[0].gains[1].gain.value).toBeCloseTo(0.2);
    expect(contexts[0].gains[2].gain.value).toBeCloseTo(0.9);

    engine.configure({ musicVolume: 75 });
    expect(contexts[0].gains[1].gain.value).toBeCloseTo(0.75);
    expect(contexts[0].gains[2].gain.value).toBeCloseTo(0.9);
    engine.dispose();
  });

  it('encerra a música suavemente ao final do sorteio', () => {
    const { engine, timer, contexts } = makeEngine();
    engine.startMusic();
    expect(engine.stopMusic()).toBe(true);
    expect(engine.isMusicPlaying).toBe(false);
    expect(timer.count).toBe(0);
    expect(contexts[0].gains[1].gain.calls.some(([kind]) => kind === 'exp')).toBe(true);
    engine.dispose();
  });

  it('pausa e retoma em suspensão/retomada do aplicativo, com razões independentes', () => {
    const { engine, timer, contexts } = makeEngine();
    engine.startMusic();
    engine.pause('android');
    expect(contexts[0].state).toBe('suspended');
    expect(timer.count).toBe(0);

    engine.pause('apresentacao');
    engine.resume('android');
    expect(engine.isPaused).toBe(true);
    expect(contexts[0].state).toBe('suspended');
    expect(timer.count).toBe(0);

    engine.resume('apresentacao');
    expect(contexts[0].state).toBe('running');
    expect(engine.isPaused).toBe(false);
    expect(timer.count).toBe(1);
    engine.dispose();
  });

  it('gera identidades sonoras distintas para os oito efeitos', () => {
    const { engine, contexts } = makeEngine();
    expect(engine.unlock()).toBe(true);
    const counts = {};
    for (const effect of AUDIO_EFFECTS) {
      const before = contexts[0].oscillators.length;
      expect(engine.playEffect(effect)).toBe(true);
      counts[effect] = contexts[0].oscillators.length - before;
    }
    expect(new Set(Object.values(counts)).size).toBeGreaterThan(3);
    expect(counts.start).toBeGreaterThan(1);
    expect(counts.win).toBeGreaterThan(2);
    expect(contexts[0].sources.length).toBeGreaterThan(0);
    engine.dispose();
  });

  it('repete a melodia em loop e libera os recursos ao disposed', () => {
    const { engine, timer, contexts } = makeEngine();
    engine.startMusic();
    const before = contexts[0].oscillators.length;
    timer.fire();
    expect(contexts[0].oscillators.length).toBeGreaterThan(before);
    engine.dispose();
    expect(contexts[0].closeCalls).toBe(1);
    expect(engine.isDisposed).toBe(true);
  });
});
