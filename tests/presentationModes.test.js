import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAW_SIZE } from '../src/core/constants.js';
import { createDrawSession } from '../src/draws/session.js';
import { createPresentationController } from '../src/draws/presentation.js';
import { createShowController } from '../src/draws/show.js';
import {
  PRESENTATION_MODES,
  PRESENTATION_MODE_CONFIG,
  SPEED_OPTIONS,
  formatSpeed,
  intervalForSpeed,
  normalizeSpeed,
} from '../src/draws/presentationModes.js';
import {
  BALL_RADIUS,
  createBalls,
  createExtractionController,
  createMixer,
  createPhysicsWorld,
  createSeededRandom,
} from '../src/visualization/index.js';

const FIXED_SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function fakeTimer() {
  const callbacks = [];
  let nextId = 1;
  return {
    set(callback, delay) {
      const id = nextId;
      nextId += 1;
      callbacks.push({ id, callback, delay });
      return id;
    },
    clear(id) {
      const index = callbacks.findIndex((entry) => entry.id === id);
      if (index >= 0) callbacks.splice(index, 1);
    },
    tick() {
      const pending = callbacks.splice(0);
      for (const entry of pending) entry.callback();
      return pending.length;
    },
    get pending() {
      return callbacks.length;
    },
  };
}

function sessionWithResult() {
  const session = createDrawSession();
  session.setResult(FIXED_SEQUENCE);
  return session;
}

function captureDelays(timer) {
  const delays = [];
  const original = timer.set;
  timer.set = (callback, delay) => {
    delays.push(delay);
    return original(callback, delay);
  };
  return delays;
}

describe('configuração de ritmos e velocidade — Fase 2D', () => {
  it('define exatamente três ritmos com multiplicadores próprios', () => {
    expect(PRESENTATION_MODES).toEqual(['normal', 'acelerado', 'instantaneo']);
    expect(PRESENTATION_MODE_CONFIG.normal.speed).toBe(1);
    expect(PRESENTATION_MODE_CONFIG.acelerado.speed).toBe(3);
    expect(PRESENTATION_MODE_CONFIG.instantaneo.speed).toBe(5);
    expect(SPEED_OPTIONS).toEqual([0.5, 1, 1.5, 2, 3, 5]);
  });

  it('normaliza velocidades e calcula intervalos protegidos', () => {
    expect(normalizeSpeed(1.5)).toBe(1.5);
    expect(normalizeSpeed(0)).toBe(1);
    expect(normalizeSpeed(99)).toBe(5);
    expect(normalizeSpeed(0.1)).toBe(0.5);
    expect(intervalForSpeed(800, 1)).toBe(800);
    expect(intervalForSpeed(800, 2)).toBe(400);
    expect(intervalForSpeed(800, 5)).toBe(160);
    expect(intervalForSpeed(800, 100)).toBeGreaterThanOrEqual(40);
    expect(formatSpeed(1)).toBe('1×');
    expect(formatSpeed(1.5)).toBe('1,5×');
  });
});

describe('apresentação com ritmos — Fase 2D', () => {
  it('ritmo normal usa o intervalo padrão', () => {
    const timer = fakeTimer();
    const delays = captureDelays(timer);
    const presentation = createPresentationController({
      session: sessionWithResult(), timer, interval: 800,
    });

    presentation.start();
    expect(presentation.getState().presentationMode).toBe('normal');
    expect(presentation.getState().speed).toBe(1);
    expect(delays.at(-1)).toBe(800);
    presentation.dispose();
  });

  it('ritmo acelerado reduz o intervalo sem remover efeitos', () => {
    const timer = fakeTimer();
    const delays = captureDelays(timer);
    const presentation = createPresentationController({
      session: sessionWithResult(), timer, interval: 900,
    });

    expect(presentation.setPresentationMode('acelerado')).toBe(true);
    presentation.start();
    expect(presentation.getState().speed).toBe(3);
    expect(delays.at(-1)).toBeCloseTo(300);

    timer.tick();
    expect(presentation.getState().revealed).toBe(1);
    expect(presentation.getState().complete).toBe(false);
    presentation.dispose();
  });

  it('ritmo instantâneo revela os 15 números sem novo sorteio', () => {
    const session = sessionWithResult();
    const timer = fakeTimer();
    const presentation = createPresentationController({ session, timer, interval: 800 });
    const generation = session.generation;

    expect(presentation.setPresentationMode('instantaneo')).toBe(true);
    presentation.start();

    const state = presentation.getState();
    expect(state.revealed).toBe(DRAW_SIZE);
    expect(state.complete).toBe(true);
    expect(state.playing).toBe(false);
    expect(state.numbers).toEqual(FIXED_SEQUENCE);
    expect(timer.pending).toBe(0);
    expect(session.generation).toBe(generation);
    presentation.dispose();
  });

  it('muda a velocidade no meio da apresentação sem perder progresso ou números', () => {
    const session = sessionWithResult();
    const timer = fakeTimer();
    const delays = captureDelays(timer);
    const presentation = createPresentationController({ session, timer, interval: 800 });
    const generation = session.generation;

    presentation.start();
    timer.tick();
    timer.tick();
    const progress = presentation.getState().revealed;
    expect(progress).toBe(2);

    presentation.setSpeed(5);
    expect(presentation.getState().revealed).toBe(progress);
    expect(presentation.getState().numbers).toEqual(FIXED_SEQUENCE);
    expect(delays.at(-1)).toBe(160);
    expect(timer.pending).toBe(1);
    expect(session.generation).toBe(generation);
    presentation.dispose();
  });

  it('pausa e continua mantendo o mesmo ritmo e resultado', () => {
    const timer = fakeTimer();
    const presentation = createPresentationController({
      session: sessionWithResult(), timer, interval: 800,
    });

    presentation.setPresentationMode('acelerado');
    presentation.start();
    expect(presentation.pause()).toBe(true);
    expect(timer.pending).toBe(0);

    timer.tick();
    expect(presentation.getState().revealed).toBe(0);

    expect(presentation.resume()).toBe(true);
    expect(timer.pending).toBe(1);
    timer.tick();
    expect(presentation.getState().revealed).toBe(1);
    expect(presentation.getState().speed).toBe(3);
    presentation.dispose();
  });

  it('próximo número e revelação total preservam a sequência', () => {
    const presentation = createPresentationController({
      session: sessionWithResult(), timer: fakeTimer(),
    });

    presentation.start();
    expect(presentation.revealNext()).toBe(1);
    expect(presentation.revealNext()).toBe(2);
    expect(presentation.revealAll()).toEqual(FIXED_SEQUENCE.slice(2));
    expect(presentation.getState().revealed).toBe(DRAW_SIZE);
    expect(presentation.getState().complete).toBe(true);
    presentation.dispose();
  });

  it('reinicia com o mesmo resultado e descarta timers pendentes', () => {
    const session = sessionWithResult();
    const timer = fakeTimer();
    const presentation = createPresentationController({ session, timer, interval: 800 });
    const generation = session.generation;

    presentation.start();
    timer.tick();
    presentation.reset();
    expect(timer.pending).toBe(0);
    presentation.start();
    expect(presentation.getState().numbers).toEqual(FIXED_SEQUENCE);
    expect(session.generation).toBe(generation);
    presentation.dispose();
  });

  it('nunca acumula timers ao alternar velocidades e ritmos', () => {
    const timer = fakeTimer();
    const presentation = createPresentationController({
      session: sessionWithResult(), timer, interval: 800,
    });

    presentation.start();
    for (const speed of SPEED_OPTIONS) presentation.setSpeed(speed);
    expect(timer.pending).toBe(1);

    presentation.setPresentationMode('acelerado');
    expect(timer.pending).toBe(1);
    presentation.setPresentationMode('normal');
    expect(timer.pending).toBe(1);
    presentation.setPresentationMode('instantaneo');
    expect(timer.pending).toBe(0);
    presentation.dispose();
  });

  it('descarta recursos e bloqueia ações posteriores', () => {
    const timer = fakeTimer();
    const presentation = createPresentationController({
      session: sessionWithResult(), timer,
    });

    presentation.start();
    expect(timer.pending).toBe(1);
    presentation.dispose();

    expect(presentation.isDisposed).toBe(true);
    expect(timer.pending).toBe(0);
    expect(presentation.start()).toBe(false);
    expect(presentation.revealNext()).toBe(null);
    expect(presentation.revealAll()).toEqual([]);
  });
});

describe('show com ritmos e modos visuais — Fase 2D', () => {
  function setup() {
    const session = sessionWithResult();
    const timer = fakeTimer();
    const events = { globo: [], roleta: [] };
    const views = {
      globo: {
        reveal: (number) => events.globo.push(number),
        reset: () => events.globo.push('reset'),
        setSpeed: (value) => events.globo.push(`speed:${value}`),
        setPaused: (value) => events.globo.push(value ? 'pause' : 'resume'),
        setPresentationMode: (mode) => events.globo.push(`ritmo:${mode}`),
        dispose: () => events.globo.push('dispose'),
      },
      roleta: {
        reveal: (number) => events.roleta.push(number),
        reset: () => events.roleta.push('reset'),
        setSpeed: (value) => events.roleta.push(`speed:${value}`),
        setPaused: (value) => events.roleta.push(value ? 'pause' : 'resume'),
        setPresentationMode: (mode) => events.roleta.push(`ritmo:${mode}`),
        dispose: () => events.roleta.push('dispose'),
      },
    };
    const show = createShowController({ session, views, presentationOptions: { timer } });
    return { session, timer, events, show };
  }

  it('troca de modo visual preservando ritmo, velocidade e resultado', () => {
    const { session, show } = setup();
    const generation = session.generation;

    show.setSpeed(2);
    show.start();
    show.selectMode('roleta');

    let state = show.getState();
    expect(state.mode).toBe('roleta');
    expect(state.presentationMode).toBe('normal');
    expect(state.speed).toBe(2);
    expect(state.result).toEqual(FIXED_SEQUENCE);
    expect(session.generation).toBe(generation);

    expect(show.setPresentationMode('acelerado')).toBe(true);
    state = show.getState();
    expect(state.presentationMode).toBe('acelerado');
    expect(state.speed).toBe(3);
    expect(session.generation).toBe(generation);
    show.dispose();
  });

  it('transição para o ritmo instantâneo não chama o motor novamente', () => {
    const { session, timer, show } = setup();
    const generation = session.generation;

    show.start();
    expect(show.setPresentationMode('instantaneo')).toBe(true);
    expect(show.getState().revealed).toBe(DRAW_SIZE);
    expect(timer.pending).toBe(0);
    expect(session.generation).toBe(generation);
    expect(show.getState().result).toEqual(FIXED_SEQUENCE);
    show.dispose();
  });

  it('trata a apresentação anterior antes de gerar um novo sorteio', () => {
    const { session, timer, show } = setup();
    const generation = session.generation;

    show.start();
    timer.tick();
    expect(show.getState().revealed).toBe(1);

    const result = show.startDraw();
    expect(result).toHaveLength(DRAW_SIZE);
    expect(session.generation).toBe(generation + 1);
    expect(show.getState().revealed).toBe(0);
    expect(timer.pending).toBe(1);
    show.dispose();
  });

  it('entrega a mesma sequência nos dois modos em qualquer ritmo', () => {
    const { events, show } = setup();

    show.setPresentationMode('acelerado');
    show.start();
    show.revealAll();
    show.selectMode('roleta');
    show.revealAll();

    const globo = events.globo.filter((event) => typeof event === 'number');
    const roleta = events.roleta.filter((event) => typeof event === 'number');
    expect(globo).toEqual(FIXED_SEQUENCE);
    expect(roleta).toEqual(FIXED_SEQUENCE);
    show.dispose();
  });
});

describe('velocidade visual e estabilidade física — Fase 2D', () => {
  it('não altera o delta entregue à física ao acelerar a mistura', () => {
    const steps = [];
    const world = {
      step: (delta) => steps.push(delta),
      kick: () => {},
    };
    const mixer = createMixer(world);

    mixer.start();
    mixer.update(1 / 60);
    mixer.setSpeed(5);
    mixer.update(1 / 60);
    mixer.setSpeed(0.5);
    mixer.update(1 / 60);

    expect(steps).toEqual([1 / 60, 1 / 60, 1 / 60]);
    expect(mixer.speed).toBe(0.5);
    mixer.dispose();
  });

  it('pausa e descarta a mistura sem novos passos físicos', () => {
    const steps = [];
    const world = { step: (delta) => steps.push(delta), kick: () => {} };
    const mixer = createMixer(world);

    mixer.start();
    mixer.setPaused(true);
    mixer.update(1 / 60);
    expect(steps).toEqual([]);

    mixer.setPaused(false);
    mixer.update(1 / 60);
    expect(steps).toEqual([1 / 60]);

    mixer.dispose();
    mixer.update(1 / 60);
    expect(steps).toHaveLength(1);
    expect(mixer.isDisposed).toBe(true);
  });

  it('acelera a transição das bolas e conclui na extração instantânea', () => {
    const balls = createBalls();
    const physics = createPhysicsWorld({
      positions: balls.children.map((ball) => ball.position.clone()),
      radius: BALL_RADIUS,
      random: createSeededRandom(97),
    });
    const done = [];
    const extraction = createExtractionController({
      balls, physics, duration: 0.7, onExtracted: (number) => done.push(number),
    });

    expect(extraction.setSpeed(5)).toBe(5);
    expect(extraction.duration).toBeCloseTo(0.14);

    for (const [index, number] of FIXED_SEQUENCE.entries()) {
      expect(extraction.reveal(number, index)).toBe(true);
    }
    extraction.setInstant(true);

    expect(done).toEqual(FIXED_SEQUENCE);
    expect(extraction.getState().animating).toBe(0);
    expect(extraction.getState().instant).toBe(true);
    expect(physics.bodies.filter((body) => body.extracted)).toHaveLength(DRAW_SIZE);
    extraction.dispose();
  });
});

describe('isolamento das regras na Fase 2D', () => {
  it('os módulos de ritmo não geram números', () => {
    const source = readFileSync(
      new URL('../src/draws/presentationModes.js', import.meta.url), 'utf8',
    );
    expect(source).not.toMatch(/Math\.random|drawNumbers|sampleNumbers/);
  });

  it('a visualização não importa regras nem controladores de sorteio', () => {
    const source = readFileSync(
      new URL('../src/visualization/mixer.js', import.meta.url), 'utf8',
    );
    expect(source).not.toMatch(/from\s+['"][^'"]*(core|draws|bets|prizes)\//);
  });
});
