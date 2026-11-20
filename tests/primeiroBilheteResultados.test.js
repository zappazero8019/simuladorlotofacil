import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_EFFECTS, createAudioEngine } from '../src/audio/index.js';
import {
  CHAMPION_EMPTY_LABEL,
  CHAMPION_LABEL,
  describeChampions,
  planCelebration,
  RESULT_MESSAGES,
  resultTitle,
} from '../src/results/index.js';
import { createCelebrationOverlay } from '../src/ui/resultCelebration.js';
import { BALL_RADIUS } from '../src/visualization/constants.js';
import {
  createBalls,
  createExtractionController,
  createPhysicsWorld,
  createSeededRandom,
} from '../src/visualization/index.js';

class FakeParam {
  constructor(value = 0) { this.value = value; }

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
  constructor(context) {
    super();
    this.frequency = new FakeParam(440);
    this.type = 'sine';
    context.oscillators.push(this);
  }

  start(time) { this.started = time; }

  stop(time) { this.stopped = time; }
}

class FakeGain extends FakeNode {
  constructor(context) {
    super();
    this.gain = new FakeParam(1);
    context.gains.push(this);
  }
}

class FakeContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 10;
    this.destination = new FakeNode();
    this.oscillators = [];
    this.gains = [];
  }

  createGain() { return new FakeGain(this); }

  createOscillator() { return new FakeOscillator(this); }

  createBuffer(channels, length) {
    return { getChannelData: () => new Float32Array(length) };
  }

  createBufferSource() {
    const node = new FakeNode();
    node.start = () => {};
    node.stop = () => {};
    return node;
  }

  createBiquadFilter() {
    const node = new FakeNode();
    node.frequency = new FakeParam(1000);
    return node;
  }

  resume() { this.state = 'running'; return Promise.resolve(); }

  suspend() { this.state = 'suspended'; return Promise.resolve(); }

  close() { this.state = 'closed'; return Promise.resolve(); }
}

function makeTimer() {
  const callbacks = new Map();
  let next = 1;
  return {
    set(callback) { const id = next; next += 1; callbacks.set(id, callback); return id; },
    clear(id) { callbacks.delete(id); },
    get count() { return callbacks.size; },
  };
}

function makeEngine() {
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
  });
  return { engine, timer, contexts };
}

function makeElement(tag = 'div') {
  const classes = new Set();
  const listeners = new Map();
  const element = {
    tagName: tag.toUpperCase(),
    hidden: false,
    textContent: '',
    width: 0,
    height: 0,
    children: [],
    dataset: {},
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
    setAttribute(key, value) { element[key] = value; },
    getAttribute(key) { return element[key] ?? null; },
    appendChild(node) { element.children.push(node); return node; },
    append(...nodes) { element.children.push(...nodes); },
    replaceChildren(...nodes) { element.children.length = 0; element.children.push(...nodes); },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    click() { for (const handler of [...(listeners.get('click') ?? [])]) handler(); },
    focus() {},
    remove() { element.removed = true; },
    getBoundingClientRect() { return { width: 400, height: 300 }; },
    getContext() { return null; },
  };
  return element;
}

function findByClass(node, className) {
  if (node.classList?.contains(className)) return node;
  for (const child of node.children ?? []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

function conference(betId, totalPrizeCents, matches = 11) {
  return { betId, contest: 42, matches, totalPrizeCents };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('mensagem final segundo a conferência matemática — sem alterar premiação', () => {
  it('nenhum contemplado', () => {
    const plan = planCelebration({
      conferences: [conference(1, 0, 0), conference(2, 0, 4)],
      settings: {},
    });
    expect(plan.summary.winnerCount).toBe(0);
    expect(resultTitle(plan.summary)).toBe(RESULT_MESSAGES.noWinners);
    expect(plan.summary.receivedCents).toBe(0);
  });

  it('um contemplado mantém o valor e a faixa', () => {
    const plan = planCelebration({
      conferences: [conference(1, 700), conference(2, 0, 4)],
      settings: {},
    });
    expect(plan.summary.winnerCount).toBe(1);
    expect(resultTitle(plan.summary)).toBe('BILHETE CONTEMPLADO!');
    expect(plan.summary.receivedCents).toBe(700);
  });

  it('vários contemplados com total correto', () => {
    const plan = planCelebration({
      conferences: [conference(1, 700), conference(2, 1400), conference(3, 700), conference(4, 0, 5)],
      settings: {},
    });
    expect(plan.summary.winnerCount).toBe(3);
    expect(resultTitle(plan.summary)).toBe('3 BILHETES CONTEMPLADOS!');
    expect(plan.summary.receivedCents).toBe(2800);
  });

  it('simulações de teste entram na contagem sem virar prêmio real', () => {
    const plan = planCelebration({
      conferences: [conference(1, 0, 15), conference(2, 0, 12)],
      settings: { testModeEnabled: true, testProbabilityPercent: 100 },
      random: () => 0.5,
    });
    expect(plan.summary.realWinners).toBe(0);
    expect(plan.summary.simulatedWinners).toBe(2);
    expect(resultTitle(plan.summary)).toBe('2 BILHETES CONTEMPLADOS!');
    expect(plan.summary.receivedCents).toBe(0);
  });

  it('resultados individuais permanecem disponíveis quando há vários contemplados', () => {
    const plan = planCelebration({
      conferences: [conference(10, 700), conference(11, 700), conference(12, 0, 3)],
      settings: {},
    });
    expect(plan.items.map((item) => item.betId)).toEqual([10, 11, 12]);
    expect(plan.items.map((item) => item.message)).toEqual([
      RESULT_MESSAGES.win,
      RESULT_MESSAGES.win,
      RESULT_MESSAGES.loss,
    ]);
  });
});

describe('identificação textual do campeão', () => {
  const draw = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const conf = (betId, numbers, matches, totalPrizeCents = 0, contest = 42) => ({
    betId, contest, numbers, drawnNumbers: draw, matches, totalPrizeCents,
  });

  it('rótulo e quantidade em caso de campeão único', () => {
    const conferences = [
      conf(1, [1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23], 7),
      conf(2, [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], 7),
    ];
    const champion = describeChampions(conferences, draw);
    expect(champion.count).toBe(2);
    expect(champion.label).toBe(CHAMPION_LABEL);
    expect(champion.scoreLabel).toBe('7 ACERTOS');
  });

  it('marca todos os empatados e não sugere prêmio quando não há faixa premiada', () => {
    const conferences = [
      conf(11, [1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23], 7, 0),
      conf(12, [1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 24, 25, 8], 7, 0),
      conf(13, [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 1, 2, 3, 4, 5], 5, 0),
    ];
    const champion = describeChampions(conferences, draw);
    expect(champion.scoreLabel).toBe('7 ACERTOS');
    expect(champion.betIds).toEqual(['11', '12']);
    expect(champion.match).toBeUndefined();

    const plan = planCelebration({ conferences, champion, settings: {}, random: () => 0.9 });
    expect(plan.summary.anyCelebration).toBe(false);
    expect(plan.items.filter((item) => item.isChampion).map((item) => item.betId)).toEqual([11, 12]);
    expect(plan.items.find((item) => item.isChampion).championLabel).toBe(CHAMPION_LABEL);
    expect(plan.items.find((item) => item.isChampion).championScoreLabel).toBe('7 ACERTOS');
  });

  it('sem bilhetes não há campeão', () => {
    const champion = describeChampions([], draw);
    expect(champion.active).toBe(false);
    expect(champion.count).toBe(0);
    expect(CHAMPION_EMPTY_LABEL).toBe('SEM BILHETE CAMPEÃO');
  });
});

describe('overlay persistente com mensagem geral', () => {
  function makePlan(conferences, settings = {}) {
    return planCelebration({ conferences, settings, random: () => 0.9 });
  }

  function makeOverlay() {
    const doc = { createElement: (tag) => makeElement(tag) };
    const root = makeElement('body');
    vi.stubGlobal('document', doc);
    const overlay = createCelebrationOverlay({ root, reducedMotion: true });
    return { overlay, root };
  }

  it('mostra o título de nenhum contemplado e fecha apenas manualmente', () => {
    const { overlay, root } = makeOverlay();
    const plan = makePlan([conference(1, 0, 2)]);

    expect(overlay.show(plan)).toBe(true);
    const box = findByClass(root, 'celebracao-caixa');
    expect(findByClass(box, 'celebracao-titulo').textContent).toBe(RESULT_MESSAGES.noWinners);
    expect(overlay.visible).toBe(true);
    findByClass(box, 'celebracao-fechar').click();
    expect(overlay.visible).toBe(false);
    overlay.dispose();
  });

  it('mostra o rótulo de campeão e identifica todos os empatados', () => {
    const { overlay, root } = makeOverlay();
    const conferences = [
      conference(1, 0, 7),
      conference(2, 0, 7),
      conference(3, 0, 5),
    ];
    overlay.show(makePlan(conferences));
    const box = findByClass(root, 'celebracao-caixa');
    const note = findByClass(box, 'celebracao-campeao');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('MAIOR NÚMERO DE ACERTOS');
    expect(note.textContent).toContain('7 ACERTOS');
    expect(note.textContent).toContain('2 bilhetes empatados');
    expect(findByClass(box, 'celebracao-lista').children).toHaveLength(3);
    overlay.dispose();
  });

  it('mantém contagem e lista individual para vários contemplados', () => {
    const { overlay, root } = makeOverlay();
    overlay.show(makePlan([
      conference(1, 700),
      conference(2, 700),
      conference(3, 700),
      conference(4, 0, 6),
    ]));
    const box = findByClass(root, 'celebracao-caixa');
    expect(findByClass(box, 'celebracao-titulo').textContent).toBe('3 BILHETES CONTEMPLADOS!');
    const note = findByClass(box, 'celebracao-contagem');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('3 bilhetes contemplados');
    expect(findByClass(box, 'celebracao-lista').children).toHaveLength(4);
    overlay.dispose();
  });
});

describe('cue único do campeão', () => {
  it('é um efeito registrado, distinto de extract e reveal', () => {
    expect(AUDIO_EFFECTS).toContain('champion');
    expect(AUDIO_EFFECTS).not.toContain('match');
    const { engine, contexts } = makeEngine();
    engine.configure({ musicEnabled: false, sfxEnabled: true });

    engine.playEffect('extract');
    const extractFrequencies = contexts[0].oscillators.map((oscillator) => oscillator.frequency.value);
    contexts[0].oscillators.length = 0;
    engine.playEffect('reveal');
    const revealFrequencies = contexts[0].oscillators.map((oscillator) => oscillator.frequency.value);
    contexts[0].oscillators.length = 0;
    engine.playEffect('champion');
    const championFrequencies = contexts[0].oscillators.map((oscillator) => oscillator.frequency.value);

    expect(championFrequencies).toEqual([659.25, 987.77]);
    expect(championFrequencies).not.toEqual(extractFrequencies);
    expect(championFrequencies).not.toEqual(revealFrequencies);
    engine.dispose();
  });

  it('toca uma vez por chamada, sem limitador de repetição', () => {
    const { engine, contexts } = makeEngine();
    engine.configure({ musicEnabled: false, sfxEnabled: true });
    expect(engine.playEffect('champion')).toBe(true);
    expect(contexts[0].oscillators).toHaveLength(2);
    expect(engine.playEffect('champion')).toBe(true);
    expect(contexts[0].oscillators).toHaveLength(4);
    engine.dispose();
  });

  it('não interrompe a música contínua nem os controles independentes', () => {
    const { engine, timer, contexts } = makeEngine();
    engine.configure({ musicEnabled: true, sfxEnabled: true, musicVolume: 60, sfxVolume: 40 });
    expect(engine.startMusic()).toBe(true);
    expect(engine.isMusicPlaying).toBe(true);
    const oscillatorsBefore = contexts[0].oscillators.length;

    expect(engine.playEffect('champion')).toBe(true);
    expect(engine.isMusicPlaying).toBe(true);
    expect(timer.count).toBeGreaterThan(0);
    expect(contexts[0].oscillators.length).toBeGreaterThan(oscillatorsBefore);

    engine.configure({ sfxEnabled: false });
    expect(engine.isMusicPlaying).toBe(true);
    expect(engine.playEffect('champion')).toBe(false);
    engine.configure({ musicEnabled: false });
    expect(engine.isMusicPlaying).toBe(false);
    engine.dispose();
  });
});

describe('aplicação do destaque 3D pós-conferência', () => {
  it('usa highlightChampions sem depender da carteira de apostas', () => {
    const balls = createBalls();
    const physics = createPhysicsWorld({
      positions: balls.children.map((ball) => ball.position.clone()),
      radius: BALL_RADIUS,
      random: createSeededRandom(11),
    });
    const extraction = createExtractionController({ balls, physics });

    extraction.reveal(5, 0);
    extraction.reveal(6, 1);
    for (let frame = 0; frame < 12; frame += 1) extraction.update(0.02);
    expect(balls.children[4].userData.matchHighlight.visible).toBe(false);

    extraction.highlightChampions([5]);
    expect(balls.children[4].userData.matchHighlight.visible).toBe(true);
    expect(balls.children[5].userData.matchHighlight.visible).toBe(false);
    expect(balls.children[4].userData.matchHighlight.material.color.getHex()).toBe(0xa855f7);
    extraction.dispose();
  });
});
