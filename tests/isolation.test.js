import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDrawSession } from '../src/draws/session.js';
import { createPresentationController } from '../src/draws/presentation.js';

function listFiles(directory) {
  const base = new URL(directory, import.meta.url);
  return readdirSync(fileURLToPath(base), { recursive: true })
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ base, file, source: readFileSync(new URL(file, base), 'utf8') }));
}

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
    },
  };
}

describe('isolamento arquitetural — Fase 2C', () => {
  it('o motor matemático não depende de interface, física ou apresentação', () => {
    const forbidden = /from\s+['"][^'"]*\/(visualization|ui|draws|finance|history|statistics)\//;
    const dom = /document\.|window\.|requestAnimationFrame|localStorage/;
    for (const { file, source } of listFiles('../src/core/')) {
      expect(source, file).not.toMatch(forbidden);
      expect(source, file).not.toMatch(dom);
    }
    for (const { file, source } of listFiles('../src/bets/')) {
      expect(source, file).not.toMatch(forbidden);
      expect(source, file).not.toMatch(dom);
    }
    for (const { file, source } of listFiles('../src/prizes/')) {
      expect(source, file).not.toMatch(forbidden);
      expect(source, file).not.toMatch(dom);
    }
  });

  it('a física e a extração não determinam resultados', () => {
    const forbidden = /from\s+['"](\.\.\/)+(core|draws|bets|prizes)\//;
    for (const { file, source } of listFiles('../src/visualization/')) {
      expect(source, file).not.toMatch(forbidden);
      expect(source, file).not.toMatch(/drawNumbers|validateDraw|createDrawSession/);
    }
  });

  it('a roleta e a interface visual não geram números', () => {
    for (const { file, source } of listFiles('../src/ui/')) {
      expect(source, file).not.toMatch(/drawNumbers|sampleNumbers|Math\.random/);
    }
  });

  it('o controlador de sorteio é o único ponto que chama o motor', () => {
    const sessionSource = readFileSync(
      new URL('../src/draws/session.js', import.meta.url), 'utf8',
    );
    expect(sessionSource).toMatch(/drawNumbers\(random\)/);

    const controllerSources = [
      'presentation.js', 'show.js',
    ].map((file) => readFileSync(new URL(`../src/draws/${file}`, import.meta.url), 'utf8'));
    for (const source of controllerSources) {
      expect(source).not.toMatch(/drawNumbers|sampleNumbers/);
    }
  });

  it('animação, velocidade e troca de modo não alteram o resultado', () => {
    const deterministic = createDrawSession({ random: () => 0.42 });
    const fixed = deterministic.draw();
    const frozen = deterministic.getFrozenResult();

    const events = [];
    const timer = fakeTimer();
    const presentation = createPresentationController({ session: deterministic, timer });
    presentation.start();
    presentation.setSpeed(3);
    timer.tick();
    presentation.revealAll();
    presentation.reset();
    presentation.start();
    timer.tick();

    expect(deterministic.getFrozenResult()).toBe(frozen);
    expect([...frozen]).toEqual(fixed);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(events).toEqual([]);
    presentation.dispose();
  });
});
