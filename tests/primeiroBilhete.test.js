import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createRoleta } from '../src/ui/roleta.js';
import { BALL_RADIUS } from '../src/visualization/constants.js';
import {
  createBalls,
  createExtractionController,
  createPhysicsWorld,
  createSeededRandom,
} from '../src/visualization/index.js';

function makeElement() {
  const classes = new Set();
  const attributes = new Map();
  const children = [];
  return {
    dataset: {},
    textContent: '',
    children,
    get className() { return [...classes].join(' '); },
    set className(value) {
      classes.clear();
      String(value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
    },
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name); else classes.delete(name);
        return on;
      },
    },
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    setAttribute(key, value) { attributes.set(key, String(value)); },
    getAttribute(key) { return attributes.get(key) ?? null; },
    appendChild(node) { children.push(node); return node; },
    append(...nodes) { children.push(...nodes); },
    replaceChildren(...nodes) { children.length = 0; children.push(...nodes); },
    _classes: classes,
  };
}

function fakeTimer() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    set(callback, delay) {
      const id = nextId;
      nextId += 1;
      pending.set(id, { callback, at: now + Math.max(0, Number(delay) || 0) });
      return id;
    },
    clear(id) { pending.delete(id); },
    advance(ms) {
      const target = now + Math.max(0, ms);
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, entry]) => entry.at <= target)
          .sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0) break;
        const [id, entry] = due[0];
        pending.delete(id);
        now = entry.at;
        entry.callback();
      }
      now = target;
    },
  };
}

function cellAt(container, index) {
  return container.children[0].children[1].children[index];
}

function makeRoleta({ reducedMotion = false } = {}) {
  const container = makeElement();
  const timer = fakeTimer();
  const audio = { playEffect: vi.fn(() => true) };
  const roleta = createRoleta(container, {
    doc: { createElement: () => makeElement() },
    timer,
    audio,
    reducedMotion,
  });
  return { roleta, timer, audio, container };
}

function makeExtraction({ instant = false } = {}) {
  const balls = createBalls();
  const physics = createPhysicsWorld({
    positions: balls.children.map((ball) => ball.position.clone()),
    radius: BALL_RADIUS,
    random: createSeededRandom(97),
  });
  const extraction = createExtractionController({ balls, physics, duration: 0.05 });
  if (instant) extraction.setInstant(true);
  return { balls, extraction };
}

describe('extração neutra na roleta', () => {
  it('não antecipa campeão nem toca timbre exclusivo durante a extração', () => {
    const { roleta, timer, audio, container } = makeRoleta();
    roleta.setSpeed(5);
    expect(roleta.reveal(3, 0, { presentationMode: 'normal', speed: 5 })).toBe(true);
    for (let elapsed = 0; elapsed < 30000 && roleta.spinning; elapsed += 1) timer.advance(1);

    expect(roleta.spinning).toBe(false);
    expect(cellAt(container, 0).classList.contains('revelada')).toBe(true);
    expect(cellAt(container, 0).classList.contains('campeao')).toBe(false);
    expect(cellAt(container, 0).getAttribute('aria-label')).not.toContain('campeão');
    expect(audio.playEffect).toHaveBeenCalledWith('reveal');
    expect(audio.playEffect).not.toHaveBeenCalledWith('match');
    expect(audio.playEffect).not.toHaveBeenCalledWith('champion');
  });

  it('aplica roxo e ARIA somente aos números revelados dos campeões', () => {
    const { roleta, timer, audio, container } = makeRoleta();
    roleta.setSpeed(5);
    for (const [number, index] of [[3, 0], [4, 1], [7, 2]]) {
      roleta.reveal(number, index, { presentationMode: 'normal', speed: 5 });
      for (let elapsed = 0; elapsed < 30000 && roleta.spinning; elapsed += 1) timer.advance(1);
    }

    roleta.markChampions([3, 7]);
    expect(cellAt(container, 0).classList.contains('campeao')).toBe(true);
    expect(cellAt(container, 0).getAttribute('aria-label')).toContain('maior número de acertos');
    expect(cellAt(container, 1).classList.contains('campeao')).toBe(false);
    expect(cellAt(container, 2).classList.contains('campeao')).toBe(true);
    // O destaque é puramente visual: nenhum som novo é disparado aqui.
    expect(audio.playEffect).not.toHaveBeenCalledWith('champion');
  });

  it('marca também na revelação instantânea e limpa ao reiniciar', () => {
    const { roleta, container } = makeRoleta();
    roleta.setPresentationMode('instantaneo');
    roleta.reveal(7, 2, { presentationMode: 'instantaneo', instant: true });
    roleta.markChampions([7]);
    expect(cellAt(container, 2).classList.contains('campeao')).toBe(true);

    roleta.reset();
    expect(cellAt(container, 2).classList.contains('campeao')).toBe(false);
    expect(cellAt(container, 2).classList.contains('revelada')).toBe(false);
  });
});

describe('destaque 3D somente após conferência', () => {
  it('revela sem anel de campeão e aplica o destaque depois, sob demanda', () => {
    const { balls, extraction } = makeExtraction();
    for (const [number, index] of [[3, 0], [4, 1], [7, 2]]) {
      expect(extraction.reveal(number, index)).toBe(true);
      for (let frame = 0; frame < 8; frame += 1) extraction.update(0.02);
    }

    expect(balls.children[2].userData.matchHighlight.visible).toBe(false);
    expect(balls.children[3].userData.matchHighlight.visible).toBe(false);
    expect(balls.children[6].userData.matchHighlight.visible).toBe(false);

    extraction.highlightChampions([3, 7]);
    expect(balls.children[2].userData.matchHighlight.visible).toBe(true);
    expect(balls.children[3].userData.matchHighlight.visible).toBe(false);
    expect(balls.children[6].userData.matchHighlight.visible).toBe(true);
    // O brilho comum continua seguindo apenas a última bola revelada.
    expect(balls.children[6].userData.highlight.visible).toBe(true);
    expect(balls.children[2].userData.highlight.visible).toBe(false);

    extraction.reset();
    expect(balls.children[2].userData.matchHighlight.visible).toBe(false);
    expect(balls.children[6].userData.matchHighlight.visible).toBe(false);
    extraction.dispose();
  });

  it('também destaca no modo instantâneo, sem animação', () => {
    const { balls, extraction } = makeExtraction({ instant: true });
    extraction.reveal(12, 0);
    extraction.reveal(13, 1);
    extraction.highlightChampions([12]);
    expect(balls.children[11].userData.matchHighlight.visible).toBe(true);
    expect(balls.children[12].userData.matchHighlight.visible).toBe(false);
    extraction.dispose();
  });

  it('aceita override explícito para usos isolados sem carteira de apostas', () => {
    const { balls, extraction } = makeExtraction();
    extraction.reveal(5, 0, true);
    extraction.reveal(6, 1, false);
    for (let frame = 0; frame < 12; frame += 1) extraction.update(0.02);
    expect(balls.children[4].userData.matchHighlight.visible).toBe(true);
    expect(balls.children[5].userData.matchHighlight.visible).toBe(false);
    extraction.dispose();
  });
});

describe('identidade visual roxo neon', () => {
  it('expõe o contador de campeão na área de sorteio', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('id="contador-primeiro-bilhete"');
    expect(html).toContain('Aguardando conferência');
    expect(html).toContain('Bilhete campeão:');
  });

  it('usa roxo neon nos slots, roleta, contador e cards sem manter o verde antigo', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(css).toContain('.resultado-slot.campeao');
    expect(css).toContain('.celula.campeao');
    expect(css).toContain('.contador-campeao');
    expect(css).toContain('.aposta-campea-selo');
    expect(css).toContain('#a855f7');
    expect(css).toContain('color: #ffffff');
    expect(css).not.toContain('acerto-primeiro');
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.resultado-slot\.campeao/);
  });
});
