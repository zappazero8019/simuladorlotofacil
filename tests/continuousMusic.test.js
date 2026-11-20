import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAudioEngine, installFirstGestureAudio } from '../src/audio/index.js';

class FakeParam {
  constructor(value = 0) {
    this.value = value;
  }

  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}

class FakeNode {
  connect(destination) { return destination; }
  disconnect() {}
}

class FakeOscillator extends FakeNode {
  constructor(context, type = 'sine') {
    super();
    this.frequency = new FakeParam(440);
    this.type = type;
    this.started = null;
    context.oscillators.push(this);
  }

  start(time) { this.started = time; }
  stop() {}
}

class FakeContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 1;
    this.destination = new FakeNode();
    this.oscillators = [];
    this.gains = [];
    this.sources = [];
    this.resumeCalls = 0;
    this.suspendCalls = 0;
  }

  createGain() {
    const node = new FakeNode();
    node.gain = new FakeParam(1);
    this.gains.push(node);
    return node;
  }

  createOscillator() {
    return new FakeOscillator(this);
  }

  createBuffer(channels, length) {
    return { getChannelData: () => new Float32Array(length) };
  }

  createBufferSource() {
    const node = new FakeNode();
    node.start = () => {};
    node.stop = () => {};
    this.sources.push(node);
    return node;
  }

  resume() { this.resumeCalls += 1; this.state = 'running'; return Promise.resolve(); }
  suspend() { this.suspendCalls += 1; this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

function makeEngine({ musicEnabled = true, sfxEnabled = true } = {}) {
  const contexts = [];
  let nextId = 1;
  const callbacks = new Map();
  const timer = {
    set(callback) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
    clear(id) { callbacks.delete(id); },
    fire() { for (const callback of [...callbacks.values()]) callback(); },
    get count() { return callbacks.size; },
  };
  const engine = createAudioEngine({
    createContext: () => {
      const context = new FakeContext();
      contexts.push(context);
      return context;
    },
    timer,
    logger: { warn() {} },
  });
  engine.configure({ musicEnabled, sfxEnabled, musicVolume: 40, sfxVolume: 80 });
  return { engine, contexts, timer };
}

function makeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    emit(type) { for (const handler of [...(listeners.get(type) ?? [])]) handler(); },
    get count() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
  };
}

describe('música de fundo contínua', () => {
  it('começa somente após o primeiro gesto válido do jogador', () => {
    const { engine, contexts, timer } = makeEngine();
    const target = makeEventTarget();
    const remove = installFirstGestureAudio(engine, target);

    expect(contexts).toHaveLength(0);
    expect(engine.isMusicPlaying).toBe(false);
    target.emit('pointerdown');

    expect(contexts).toHaveLength(1);
    expect(engine.isMusicPlaying).toBe(true);
    expect(timer.count).toBe(1);
    expect(target.count).toBe(0);
    expect(remove()).toBeUndefined();
    engine.dispose();
  });

  it('não reinicia nem duplica a trilha a cada novo sorteio', () => {
    const { engine, contexts, timer } = makeEngine();
    expect(engine.startMusic()).toBe(true);
    const firstStart = contexts[0].oscillators[0].started;

    for (let draw = 0; draw < 15; draw += 1) {
      expect(engine.startMusic()).toBe(true);
      engine.playEffect('start');
      engine.playEffect('result');
    }

    expect(contexts).toHaveLength(1);
    expect(timer.count).toBe(1);
    // Nenhuma nota de trilha foi reagendada: as 15 chamadas a startMusic só
    // mantiveram o loop já existente. Os efeitos criam envelopes próprios, mas
    // os barramentos de música e efeitos permanecem com os volumes salvos.
    expect(contexts[0].oscillators[0].started).toBe(firstStart);
    expect(contexts[0].gains[1].gain.value).toBeCloseTo(0.4);
    expect(contexts[0].gains[2].gain.value).toBeCloseTo(0.8);
    expect(engine.isMusicPlaying).toBe(true);
    engine.dispose();
  });

  it('continua tocando após resultados, fogos e navegação', () => {
    const { engine, timer } = makeEngine();
    expect(engine.startMusic()).toBe(true);
    for (let tick = 0; tick < 5; tick += 1) {
      engine.playEffect('result');
      engine.playEffect('win');
      engine.playEffect('fireworks');
      timer.fire();
    }
    expect(engine.isMusicPlaying).toBe(true);
    expect(timer.count).toBe(1);

    const ui = readFileSync(new URL('../src/ui/index.js', import.meta.url), 'utf8');
    expect(ui).not.toMatch(/audio\.stopMusic\(/);
    expect(ui).not.toMatch(/audio\.startMusic\(/);
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(main).toContain('installFirstGestureAudio(ui.audio)');
    engine.dispose();
  });

  it('desativar a música não desativa os efeitos sonoros', () => {
    const { engine, contexts, timer } = makeEngine();
    engine.startMusic();
    expect(engine.configure({ musicEnabled: false }).musicEnabled).toBe(false);
    expect(engine.isMusicPlaying).toBe(false);
    expect(timer.count).toBe(0);

    const before = contexts[0].oscillators.length;
    expect(engine.playEffect('reveal')).toBe(true);
    expect(contexts[0].oscillators.length).toBeGreaterThan(before);
    expect(contexts[0].gains[2].gain.value).toBeCloseTo(0.8);

    // Reativar após um gesto retoma a trilha contínua sem novo contexto.
    expect(engine.configure({ musicEnabled: true }).musicEnabled).toBe(true);
    expect(engine.isMusicPlaying).toBe(true);
    expect(contexts).toHaveLength(1);
    engine.dispose();
  });

  it('suspende e retoma a trilha no ciclo de vida do aplicativo', () => {
    const { engine, contexts, timer } = makeEngine();
    engine.startMusic();
    engine.pause('android');
    expect(contexts[0].state).toBe('suspended');
    expect(timer.count).toBe(0);
    engine.pause('aba');
    engine.resume('android');
    expect(engine.isMusicPlaying).toBe(false);
    expect(contexts[0].state).toBe('suspended');
    engine.resume('aba');
    expect(engine.isMusicPlaying).toBe(true);
    expect(contexts[0].state).toBe('running');
    expect(timer.count).toBe(1);
    engine.dispose();
  });

  it('usa melodia suave, lenta, sem percussão e sem ciclo curto de oito notas', () => {
    const { engine, contexts, timer } = makeEngine();
    engine.startMusic();
    // Sem fontes de ruído e com tones senoidais em registro médio-baixo, a
    // trilha não tem percussão nem ataques agressivos.
    expect(contexts[0].sources).toHaveLength(0);
    expect(contexts[0].oscillators.every((oscillator) => oscillator.type === 'sine')).toBe(true);

    const firstTick = contexts[0].oscillators.slice(0, 8);
    const spacing = firstTick[1].started - firstTick[0].started;
    expect(spacing).toBeCloseTo(0.42, 5);
    const frequencies = contexts[0].oscillators.map((oscillator) => oscillator.frequency.value);
    expect(Math.max(...frequencies)).toBeLessThan(700);
    expect(Math.min(...frequencies)).toBeGreaterThan(100);

    const starts = [];
    starts.push(firstTick[0].frequency.value);
    for (let tick = 0; tick < 3; tick += 1) {
      const before = contexts[0].oscillators.length;
      timer.fire();
      starts.push(contexts[0].oscillators[before].frequency.value);
    }
    expect(new Set(starts).size).toBeGreaterThan(1);
    engine.dispose();
  });

  it('respeita o volume configurado durante a reprodução contínua', () => {
    const { engine, contexts } = makeEngine({ musicEnabled: true });
    engine.startMusic();
    expect(contexts[0].gains[1].gain.value).toBeCloseTo(0.4);
    expect(contexts[0].gains[2].gain.value).toBeCloseTo(0.8);
    engine.configure({ musicVolume: 15, sfxVolume: 60 });
    expect(contexts[0].gains[1].gain.value).toBeCloseTo(0.15);
    expect(contexts[0].gains[2].gain.value).toBeCloseTo(0.6);
    expect(engine.isMusicPlaying).toBe(true);
    engine.dispose();
  });
});
