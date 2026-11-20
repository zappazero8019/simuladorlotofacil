import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createDrawSession } from '../src/draws/session.js';
import { createShowController } from '../src/draws/show.js';
import { createDeferredVisualization } from '../src/ui/deferredVisualization.js';
import { createTestRandom, planCelebration } from '../src/results/index.js';
import { BALL_RADIUS } from '../src/visualization/constants.js';
import {
  createBalls,
  createExtractionController,
  createPhysicsWorld,
  createSeededRandom,
} from '../src/visualization/index.js';

const FIXED_SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const EXTRACTION_SEQUENCE = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 1, 3, 5];

function fakeTimer() {
  const callbacks = [];
  let nextId = 1;
  return {
    set(callback) {
      const id = nextId;
      nextId += 1;
      callbacks.push({ id, callback });
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
  };
}

function fixedRandom() {
  let index = 0;
  return () => {
    index += 1;
    return index / 1000;
  };
}

describe('Fase 9 — extração física animada', () => {
  it('extrai as 15 bolas na ordem exata recebida, sem duplicatas', () => {
    const balls = createBalls();
    const physics = createPhysicsWorld({
      positions: balls.children.map((ball) => ball.position.clone()),
      radius: BALL_RADIUS,
      random: createSeededRandom(97),
    });
    const extracted = [];
    const extraction = createExtractionController({
      balls,
      physics,
      duration: 0.1,
      onExtracted: (number) => extracted.push(number),
    });

    for (const [index, number] of EXTRACTION_SEQUENCE.entries()) {
      expect(extraction.reveal(number, index)).toBe(true);
      for (let frame = 0; frame < 10; frame += 1) extraction.update(0.02);
    }

    expect(extracted).toEqual(EXTRACTION_SEQUENCE);
    expect(new Set(extracted).size).toBe(15);
    expect(extraction.getRemainingNumbers()).toHaveLength(10);
    expect(extraction.getState().animating).toBe(0);
    extraction.dispose();
  });

  it('conduz a bola até a abertura superior antes de tirá-la do globo', () => {
    const balls = createBalls();
    const physics = createPhysicsWorld({
      positions: balls.children.map((ball) => ball.position.clone()),
      radius: BALL_RADIUS,
      random: createSeededRandom(11),
    });
    const extraction = createExtractionController({ balls, physics, duration: 0.1 });
    const ball = balls.children[1];

    extraction.reveal(2, 0);
    extraction.update(0.02);
    expect(ball.position.length()).toBeLessThanOrEqual(physics.containerRadius + 0.01);
    expect(ball.userData.highlight.visible).toBe(true);

    extraction.update(0.03);
    expect(ball.position.y).toBeGreaterThan(1.5);
    expect(Math.abs(ball.position.x)).toBeLessThan(0.5);

    for (let frame = 0; frame < 10; frame += 1) extraction.update(0.02);
    expect(ball.position.y).toBeLessThan(-2);
    expect(ball.userData.highlight.visible).toBe(true);
    expect(ball.userData.label.scale.x).toBeGreaterThan(ball.userData.label.userData.baseScale.x);
    extraction.dispose();
  });

  it('respeita redução de movimento sem alterar a sequência', () => {
    const balls = createBalls();
    const physics = createPhysicsWorld({
      positions: balls.children.map((ball) => ball.position.clone()),
      radius: BALL_RADIUS,
      random: createSeededRandom(5),
    });
    const extracted = [];
    const extraction = createExtractionController({
      balls,
      physics,
      reducedMotion: true,
      onExtracted: (number) => extracted.push(number),
    });

    for (const [index, number] of EXTRACTION_SEQUENCE.entries()) {
      expect(extraction.reveal(number, index)).toBe(true);
    }
    expect(extracted).toEqual(EXTRACTION_SEQUENCE);
    expect(extraction.getState().animating).toBe(0);
    expect(extraction.getState().reducedMotion).toBe(true);
    extraction.dispose();
  });
});

describe('Fase 9 — integração sem embaralhar matemática', () => {
  it('globo e roleta disparam os mesmos ganchos de áudio e resultado', () => {
    for (const mode of ['globo', 'roleta']) {
      const session = createDrawSession();
      session.setResult(FIXED_SEQUENCE);
      const reveals = [];
      const completes = [];
      const spins = [];
      const view = {
        reveal: (number, index) => reveals.push([number, index]),
        startSpin: () => spins.push(mode),
        setPresentationMode() {},
        setSpeed() {},
      };
      const show = createShowController({
        session,
        views: { globo: view, roleta: view },
        presentationOptions: {
          onReveal: (number) => reveals.push(number),
          onComplete: () => completes.push(true),
        },
      });

      show.selectMode(mode);
      show.start();
      expect(spins.length).toBeGreaterThanOrEqual(1);
      show.revealAll();
      expect(reveals.filter((entry) => typeof entry === 'number')).toEqual(FIXED_SEQUENCE);
      expect(completes).toHaveLength(1);
      show.dispose();
    }
  });

  it('o RNG do modo de teste nunca consome ou altera o RNG do sorteio', () => {
    const drawRandom = vi.fn(fixedRandom());
    const session = createDrawSession({ random: drawRandom });
    const result = session.draw();
    const drawCalls = drawRandom.mock.calls.length;
    const testRandom = vi.fn(() => 0);

    const plan = planCelebration({
      conferences: [{ betId: 1, contest: 1, matches: 0, totalPrizeCents: 0 }],
      settings: { testModeEnabled: true, testProbabilityPercent: 1 },
      random: testRandom,
    });

    expect(plan.items[0].simulated).toBe(true);
    expect(testRandom).toHaveBeenCalledOnce();
    expect(drawRandom.mock.calls.length).toBe(drawCalls);
    expect(session.getFrozenResult()).toEqual(result);
  });

  it('usa uma fonte aleatória independente quando crypto está disponível', () => {
    const values = [];
    const source = {
      crypto: {
        getRandomValues(buffer) {
          buffer[0] = values.shift() ?? 0;
          return buffer;
        },
      },
    };
    values.push(0, 4294967295);
    const random = createTestRandom(source);
    expect(random()).toBeCloseTo(0, 5);
    expect(random()).toBeGreaterThan(0.999);
  });

  it('mantém a roleta como fallback sem WebGL', async () => {
    const stage = {
      appendChild() {},
      clientWidth: 320,
      clientHeight: 240,
      getBoundingClientRect: () => ({ width: 320, height: 240 }),
    };
    const deferred = createDeferredVisualization(stage, undefined, { available: false });
    expect(deferred.proxy.isUnavailable).toBe(true);
    expect(await deferred.load()).toBeNull();
    expect(() => deferred.proxy.extraction.reveal(7, 0)).not.toThrow();
    expect(() => deferred.proxy.dispose()).not.toThrow();
  });
});

describe('Fase 9 — acessibilidade e redução de movimento na interface', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

  it('expõe controles e identificação permanente do modo de teste', () => {
    for (const id of [
      'selo-modo-teste',
      'config-musica',
      'config-efeitos',
      'config-volume-musica',
      'config-volume-efeitos',
      'config-modo-teste',
      'config-probabilidade-teste',
    ]) {
      expect(html, id).toContain(`id="${id}"`);
    }
    expect(html).toContain('MODO DE TESTE — PROBABILIDADE DE CONTEMPLAÇÃO');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('min="1" max="100"');
  });

  it('desativa fogos e animações quando o movimento é reduzido', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.celebracao .fogos-canvas');
    expect(css).toContain('display: none');
    expect(css).toContain('env(safe-area-inset-top)');
  });
});
