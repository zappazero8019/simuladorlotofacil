import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createFirstBetTracker } from '../src/draws/firstBetTracker.js';
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

const FIRST = [3, 7, 12, 1, 19];
const SECOND = [25, 24, 23, 22, 21];

describe('primeiro bilhete como referência visual', () => {
  it('reconhece somente os números do primeiro bilhete', () => {
    const tracker = createFirstBetTracker(() => FIRST);
    expect(tracker.begin()).toBe(true);
    for (const number of FIRST) expect(tracker.isMatch(number)).toBe(true);
    for (const number of SECOND) expect(tracker.isMatch(number)).toBe(false);
    expect(tracker.isMatch(2)).toBe(false);
  });

  it('não usa o segundo bilhete nem o contador visual como referência', () => {
    let source = { first: FIRST, second: SECOND };
    const tracker = createFirstBetTracker(() => source.first);
    tracker.begin();
    expect(tracker.record(25)).toBe(false);
    expect(tracker.count).toBe(0);
    expect(tracker.label()).toBe('0 números sorteados');
    source = { first: SECOND, second: FIRST };
    expect(tracker.isMatch(25)).toBe(false);
    expect(tracker.numbers).toEqual(FIRST);
  });

  it('registra cada acerto uma única vez, preservando a ordem da extração', () => {
    const tracker = createFirstBetTracker(() => FIRST);
    tracker.begin();
    expect(tracker.record(7)).toBe(true);
    expect(tracker.record(7)).toBe(false);
    expect(tracker.record(3)).toBe(true);
    expect(tracker.record(99)).toBe(false);
    expect(tracker.matches).toEqual([7, 3]);
    expect(tracker.count).toBe(2);
  });

  it('pluraliza o contador de 0 para 1 e para vários', () => {
    const tracker = createFirstBetTracker(() => FIRST);
    tracker.begin();
    expect(tracker.label()).toBe('0 números sorteados');
    tracker.record(3);
    expect(tracker.label()).toBe('1 número sorteado');
    tracker.record(7);
    tracker.record(12);
    expect(tracker.label()).toBe('3 números sorteados');
  });

  it('permanece inativo quando não há bilhete cadastrado', () => {
    const tracker = createFirstBetTracker(() => null);
    expect(tracker.begin()).toBe(false);
    expect(tracker.isMatch(3)).toBe(false);
    expect(tracker.record(3)).toBe(false);
    expect(tracker.label()).toBe('0 números sorteados');
  });

  it('filtra números inválidos e remove duplicatas da referência', () => {
    const tracker = createFirstBetTracker(() => [3, 3, 0, 26, 7, '7', 12]);
    tracker.begin();
    expect(tracker.numbers).toEqual([3, 7, 12]);
    expect(tracker.active).toBe(true);
  });

  it('reset limpa os acertos e recaptura a referência atual', () => {
    let first = FIRST;
    const tracker = createFirstBetTracker(() => first);
    tracker.begin();
    tracker.record(3);
    first = SECOND;
    tracker.reset();
    expect(tracker.count).toBe(0);
    expect(tracker.isMatch(3)).toBe(false);
    expect(tracker.isMatch(25)).toBe(true);
  });
});

describe('destaque e som do acerto na roleta', () => {
  function makeRoleta({ matchedNumbers = [], reducedMotion = false } = {}) {
    const container = makeElement();
    const timer = fakeTimer();
    const audio = { playEffect: vi.fn(() => true) };
    const onMatch = vi.fn();
    const roleta = createRoleta(container, {
      doc: { createElement: () => makeElement() },
      timer,
      audio,
      reducedMotion,
      isMatch: (number) => matchedNumbers.includes(number),
      onMatch,
    });
    return { roleta, timer, audio, onMatch, container };
  }

  it('aplica brilho verde e usa o som exclusivo quando o número é do primeiro bilhete', () => {
    const { roleta, timer, audio, onMatch, container } = makeRoleta({ matchedNumbers: [3] });
    roleta.setSpeed(5);
    expect(roleta.reveal(3, 0, { presentationMode: 'normal', speed: 5 })).toBe(true);
    for (let elapsed = 0; elapsed < 30000 && roleta.spinning; elapsed += 1) timer.advance(1);

    expect(roleta.spinning).toBe(false);
    expect(cellAt(container, 0).classList.contains('revelada')).toBe(true);
    expect(cellAt(container, 0).classList.contains('acerto-primeiro')).toBe(true);
    expect(cellAt(container, 0).getAttribute('aria-label')).toContain('acerto do primeiro bilhete');
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onMatch).toHaveBeenCalledWith(3);
    expect(audio.playEffect).toHaveBeenCalledWith('match');
    expect(audio.playEffect).not.toHaveBeenCalledWith('reveal');
  });

  it('mantém aparência e som normais para número que não é do primeiro bilhete', () => {
    const { roleta, timer, audio, onMatch, container } = makeRoleta({ matchedNumbers: [3] });
    roleta.setSpeed(5);
    roleta.reveal(4, 1, { presentationMode: 'normal', speed: 5 });
    for (let elapsed = 0; elapsed < 30000 && roleta.spinning; elapsed += 1) timer.advance(1);

    expect(cellAt(container, 1).classList.contains('acerto-primeiro')).toBe(false);
    expect(onMatch).not.toHaveBeenCalled();
    expect(audio.playEffect).toHaveBeenCalledWith('reveal');
    expect(audio.playEffect).not.toHaveBeenCalledWith('match');
  });

  it('notifica o acerto também na revelação instantânea, sem som de giro', () => {
    const { roleta, audio, onMatch, container } = makeRoleta({ matchedNumbers: [7] });
    roleta.setPresentationMode('instantaneo');
    roleta.reveal(7, 2, { presentationMode: 'instantaneo', instant: true });
    expect(cellAt(container, 2).classList.contains('acerto-primeiro')).toBe(true);
    expect(onMatch).toHaveBeenCalledWith(7);
    expect(audio.playEffect).not.toHaveBeenCalled();
  });

  it('remove o destaque ao reiniciar', () => {
    const { roleta, onMatch, container } = makeRoleta({ matchedNumbers: [7] });
    roleta.setPresentationMode('instantaneo');
    roleta.reveal(7, 2, { presentationMode: 'instantaneo', instant: true });
    expect(onMatch).toHaveBeenCalledTimes(1);
    roleta.reset();
    expect(cellAt(container, 2).classList.contains('acerto-primeiro')).toBe(false);
    // O rastreador é quem deduplica; a roleta notifica uma vez por revelação.
    roleta.reveal(7, 2, { presentationMode: 'instantaneo', instant: true });
    expect(onMatch).toHaveBeenCalledTimes(2);
  });
});

describe('destaque 3D do primeiro bilhete', () => {
  it('ativa o anel verde apenas nas bolas do primeiro bilhete', () => {
    const balls = createBalls();
    const physics = createPhysicsWorld({
      positions: balls.children.map((ball) => ball.position.clone()),
      radius: BALL_RADIUS,
      random: createSeededRandom(97),
    });
    const matched = new Set([3, 7]);
    const extraction = createExtractionController({
      balls,
      physics,
      duration: 0.05,
      isMatch: (number) => matched.has(number),
    });

    for (const number of [3, 4, 7]) {
      const index = [3, 4, 7].indexOf(number);
      expect(extraction.reveal(number, index)).toBe(true);
      for (let frame = 0; frame < 8; frame += 1) extraction.update(0.02);
    }

    // O anel verde persiste em cada acerto, independente da última bola focada.
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
    const balls = createBalls();
    const physics = createPhysicsWorld({
      positions: balls.children.map((ball) => ball.position.clone()),
      radius: BALL_RADIUS,
      random: createSeededRandom(31),
    });
    const extraction = createExtractionController({
      balls,
      physics,
      isMatch: (number) => number === 12,
    });
    extraction.setInstant(true);
    extraction.reveal(12, 0);
    extraction.reveal(13, 1);
    expect(balls.children[11].userData.matchHighlight.visible).toBe(true);
    expect(balls.children[12].userData.matchHighlight.visible).toBe(false);
    extraction.dispose();
  });
});

describe('integração do contador e dos estilos', () => {
  it('expõe o contador na área de sorteio', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('id="contador-primeiro-bilhete"');
    expect(html).toContain('0 números sorteados');
    expect(html).toContain('Primeiro bilhete:');
  });

  it('define brilho verde persistente sem substituir os estilos normais', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(css).toContain('.resultado-slot.acerto-primeiro');
    expect(css).toContain('.celula.acerto-primeiro');
    expect(css).toContain('#4ade80');
    expect(css).toContain('.contador-primeiro-bilhete');
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.resultado-slot\.acerto-primeiro/);
  });
});
