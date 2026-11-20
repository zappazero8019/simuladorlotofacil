import { describe, expect, it } from 'vitest';
import { DRAW_SIZE } from '../src/core/constants.js';
import { drawNumbers } from '../src/draws/index.js';
import { createDrawSession } from '../src/draws/session.js';
import { createPresentationController } from '../src/draws/presentation.js';
import { createShowController } from '../src/draws/show.js';

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

const FIXED_SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function fixedRandom() {
  let index = 0;
  return () => {
    index += 1;
    return index / 1000;
  };
}

describe('sessão de sorteio — Fase 2C', () => {
  it('usa o motor matemático existente como única fonte do resultado', () => {
    const session = createDrawSession({ random: fixedRandom() });
    const expected = drawNumbers(fixedRandom());

    const first = session.draw();
    expect(first).toHaveLength(DRAW_SIZE);
    expect(first).toEqual(expected);
    expect(new Set(first).size).toBe(DRAW_SIZE);
    expect(first.every((number) => number >= 1 && number <= 25)).toBe(true);
  });

  it('congela o resultado e devolve cópias independentes', () => {
    const session = createDrawSession({ random: fixedRandom() });
    session.draw();

    const frozen = session.getFrozenResult();
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(() => { frozen[0] = 99; }).toThrow(TypeError);

    const copy = session.getResult();
    copy[0] = 99;
    expect(session.getResult()[0]).not.toBe(99);
    expect(session.getFrozenResult()[0]).not.toBe(99);
  });

  it('valida sequências injetadas sem criar novo motor de sorteio', () => {
    const session = createDrawSession();
    expect(session.setResult(FIXED_SEQUENCE)).toEqual(FIXED_SEQUENCE);
    expect(() => session.setResult([1, 2, 3])).toThrow(TypeError);
    expect(() => session.setResult([1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])).toThrow(TypeError);
    expect(() => session.setResult([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])).toThrow(TypeError);
    expect(session.generation).toBe(1);
    expect(session.hasResult()).toBe(true);
    session.draw();
    expect(session.generation).toBe(2);
  });
});

describe('controlador de apresentação — Fase 2C', () => {
  it('revela na ordem exata do resultado sem tocá-lo', () => {
    const session = createDrawSession();
    session.setResult(FIXED_SEQUENCE);
    const revealed = [];
    const timer = fakeTimer();
    const presentation = createPresentationController({
      session,
      timer,
      onReveal: (number) => revealed.push(number),
    });

    expect(presentation.start()).toBe(true);
    expect(presentation.getState().next).toBe(1);
    expect(presentation.revealNext()).toBe(1);
    expect(presentation.revealNext()).toBe(2);
    timer.tick();
    expect(revealed).toEqual([1, 2, 3]);

    const result = session.getFrozenResult();
    expect([...result]).toEqual(FIXED_SEQUENCE);
    expect(Object.isFrozen(result)).toBe(true);
    presentation.dispose();
  });

  it('revela todos de uma vez preservando a sequência', () => {
    const session = createDrawSession();
    session.setResult(FIXED_SEQUENCE);
    const revealed = [];
    let completed = 0;
    const timer = fakeTimer();
    const presentation = createPresentationController({
      session,
      timer,
      onReveal: (number) => revealed.push(number),
      onComplete: () => { completed += 1; },
    });

    presentation.start();
    expect(presentation.revealAll()).toEqual(FIXED_SEQUENCE);
    expect(revealed).toEqual(FIXED_SEQUENCE);
    expect(completed).toBe(1);
    expect(presentation.getState().complete).toBe(true);
    expect(timer.pending).toBe(0);
    expect(presentation.revealNext()).toBeNull();
    presentation.dispose();
  });

  it('pausa e continua sem perder o progresso', () => {
    const session = createDrawSession();
    session.setResult(FIXED_SEQUENCE);
    const timer = fakeTimer();
    const presentation = createPresentationController({ session, timer });

    presentation.start();
    presentation.revealNext();
    const before = presentation.getState().revealed;
    expect(presentation.pause()).toBe(true);
    expect(timer.pending).toBe(0);
    timer.tick();
    expect(presentation.getState().revealed).toBe(before);

    expect(presentation.resume()).toBe(true);
    timer.tick();
    expect(presentation.getState().revealed).toBe(before + 1);
    expect(presentation.getState().revealed).toBe(presentation.getState().revealed);
    presentation.dispose();
  });

  it('reinicia a apresentação sem gerar novo resultado', () => {
    const session = createDrawSession();
    session.setResult(FIXED_SEQUENCE);
    const generation = session.generation;
    const timer = fakeTimer();
    const presentation = createPresentationController({ session, timer });

    presentation.start();
    presentation.revealAll();
    presentation.reset();
    expect(presentation.getState().revealed).toBe(0);
    expect(presentation.getState().numbers).toEqual(FIXED_SEQUENCE);
    expect(session.generation).toBe(generation);
    expect(session.getFrozenResult()).toEqual(FIXED_SEQUENCE);
    presentation.dispose();
  });

  it('velocidade altera apenas o intervalo, nunca os números', () => {
    const session = createDrawSession();
    session.setResult(FIXED_SEQUENCE);
    const timer = fakeTimer();
    const presentation = createPresentationController({ session, timer, interval: 800 });

    presentation.start();
    const callbacks = [];
    const originalSet = timer.set;
    timer.set = (callback, delay) => {
      callbacks.push(delay);
      return originalSet(callback, delay);
    };
    presentation.setSpeed(2);
    expect(callbacks.at(-1)).toBe(400);
    presentation.setSpeed(0.5);
    expect(callbacks.at(-1)).toBe(1600);

    expect(presentation.getState().numbers).toEqual(FIXED_SEQUENCE);
    expect(session.getFrozenResult()).toEqual(FIXED_SEQUENCE);
    expect(presentation.setSpeed(0)).toBe(0.5);
    presentation.dispose();
  });
});

describe('controlador de exibição — Fase 2C', () => {
  function setup() {
    const session = createDrawSession();
    session.setResult(FIXED_SEQUENCE);
    const timer = fakeTimer();
    const events = { globo: [], roleta: [] };
    const views = {
      globo: {
        reveal: (number) => events.globo.push(number),
        reset: () => events.globo.push('reset'),
        startSpin: () => events.globo.push('spin'),
        setPaused: (value) => events.globo.push(value ? 'pause' : 'resume'),
        setSpeed: (value) => events.globo.push(`speed:${value}`),
      },
      roleta: {
        reveal: (number) => events.roleta.push(number),
        reset: () => events.roleta.push('reset'),
        startSpin: () => events.roleta.push('spin'),
        setPaused: (value) => events.roleta.push(value ? 'pause' : 'resume'),
        setSpeed: (value) => events.roleta.push(`speed:${value}`),
      },
    };
    const show = createShowController({ session, views, presentationOptions: { timer } });
    return { session, timer, events, show };
  }

  it('troca de modo preserva o resultado e não gera novo sorteio', () => {
    const { session, show } = setup();
    const generation = session.generation;
    const before = session.getResult();

    expect(show.selectMode('roleta')).toBe(true);
    expect(show.mode).toBe('roleta');
    expect(session.generation).toBe(generation);
    expect(session.getResult()).toEqual(before);
    expect(show.getState().result).toEqual(before);

    expect(show.selectMode('invalido')).toBe(false);
    expect(show.selectMode('roleta')).toBe(false);
    show.dispose();
  });

  it('entrega a mesma sequência aos dois modos', () => {
    const { events, show } = setup();

    show.start();
    show.revealAll();
    const globoRevealed = events.globo.filter((event) => typeof event === 'number');
    expect(globoRevealed).toEqual(FIXED_SEQUENCE);

    show.selectMode('roleta');
    show.revealAll();
    const roletaRevealed = events.roleta.filter((event) => typeof event === 'number');
    expect(roletaRevealed).toEqual(FIXED_SEQUENCE);
    expect(globoRevealed).toEqual(roletaRevealed);
    show.dispose();
  });

  it('reinicia a apresentação mantendo o resultado definido', () => {
    const { session, show } = setup();
    const generation = session.generation;

    show.start();
    show.revealAll();
    expect(show.getState().complete).toBe(true);
    expect(show.restart()).toBe(true);

    expect(show.getState().revealed).toBe(0);
    expect(show.getState().result).toEqual(FIXED_SEQUENCE);
    expect(session.generation).toBe(generation);
    show.dispose();
  });

  it('inicia sorteio apenas quando explicitamente solicitado', () => {
    const { session, show } = setup();
    const generation = session.generation;
    show.selectMode('roleta');
    expect(session.generation).toBe(generation);

    const result = show.startDraw();
    expect(result).toHaveLength(DRAW_SIZE);
    expect(new Set(result).size).toBe(DRAW_SIZE);
    expect(result.every((number) => number >= 1 && number <= 25)).toBe(true);
    // `startDraw` é o único ponto que chama o motor e cria um novo resultado.
    expect(session.generation).toBe(generation + 1);
    show.dispose();
  });

  it('notifica assinantes e encerra sem efeitos posteriores', () => {
    const { show } = setup();
    let updates = 0;
    const unsubscribe = show.subscribe(() => { updates += 1; });

    show.start();
    expect(updates).toBeGreaterThan(0);
    const beforeDispose = updates;
    unsubscribe();
    show.revealNext();
    expect(updates).toBe(beforeDispose);

    show.dispose();
    expect(show.isDisposed).toBe(true);
    expect(show.start()).toBe(false);
    expect(show.restart()).toBe(false);
  });
});
