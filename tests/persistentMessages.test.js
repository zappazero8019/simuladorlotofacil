import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESULT_MESSAGES } from '../src/results/index.js';
import { createCelebrationOverlay } from '../src/ui/resultCelebration.js';

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

function texts(node, result = []) {
  if (node.textContent) result.push(node.textContent);
  for (const child of node.children ?? []) texts(child, result);
  return result;
}

function planOf(messages, { fireworks = false } = {}) {
  const items = messages.map((message, index) => {
    const win = message === RESULT_MESSAGES.win;
    return {
      betId: index + 1,
      contest: 10 + index,
      matches: win ? 11 : 0,
      message,
      realWin: win,
      simulated: false,
      receivedCents: win ? 700 : 0,
      intensity: win ? 'discreta' : 'nenhuma',
    };
  });
  const winners = items.filter((item) => item.realWin).length;
  return {
    items,
    summary: {
      total: items.length,
      realWinners: winners,
      simulatedWinners: 0,
      receivedCents: winners * 700,
      anyCelebration: winners > 0,
      testModeActive: false,
      fireworks,
    },
  };
}

const overlays = [];
afterEach(() => {
  while (overlays.length) overlays.pop().dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createOverlay() {
  const doc = { createElement: (tag) => makeElement(tag) };
  const root = makeElement('body');
  vi.stubGlobal('document', doc);
  const overlay = createCelebrationOverlay({
    root,
    onClose: vi.fn(),
    reducedMotion: true,
  });
  overlays.push(overlay);
  return { overlay, root };
}

describe('mensagens persistentes de resultado', () => {
  it('mantém BILHETE CONTEMPLADO! aberta por muito tempo e fecha só pelo botão', () => {
    vi.useFakeTimers();
    const { overlay, root } = createOverlay();

    expect(overlay.show(planOf([RESULT_MESSAGES.win], { fireworks: true }))).toBe(true);
    expect(overlay.visible).toBe(true);
    vi.advanceTimersByTime(3_600_000);
    expect(overlay.visible).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    findByClass(root, 'celebracao-fechar').click();
    expect(overlay.visible).toBe(false);
  });

  it('mantém BILHETE NÃO CONTEMPLADO aberta após as animações e vários segundos', () => {
    vi.useFakeTimers();
    const { overlay, root } = createOverlay();
    expect(overlay.show(planOf([RESULT_MESSAGES.loss]))).toBe(true);
    vi.advanceTimersByTime(600_000);
    expect(overlay.visible).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    findByClass(root, 'celebracao-fechar').click();
    expect(overlay.visible).toBe(false);
  });

  it('preserva mensagens individuais de vários bilhetes', () => {
    vi.useFakeTimers();
    const { overlay, root } = createOverlay();
    expect(overlay.show(planOf([RESULT_MESSAGES.win, RESULT_MESSAGES.loss]))).toBe(true);
    const content = texts(root).join(' | ');
    expect(content).toContain(RESULT_MESSAGES.win);
    expect(content).toContain(RESULT_MESSAGES.loss);
    expect(content).toContain('Aposta #1');
    expect(content).toContain('Aposta #2');
    vi.advanceTimersByTime(120_000);
    expect(overlay.visible).toBe(true);
  });

  it('reabre corretamente depois do fechamento manual', () => {
    const { overlay, root } = createOverlay();
    overlay.show(planOf([RESULT_MESSAGES.win]));
    findByClass(root, 'celebracao-fechar').click();
    expect(overlay.visible).toBe(false);
    expect(overlay.show(planOf([RESULT_MESSAGES.loss]))).toBe(true);
    expect(overlay.visible).toBe(true);
    expect(texts(root).join(' | ')).toContain(RESULT_MESSAGES.loss);
    expect(texts(root).join(' | ')).not.toContain(RESULT_MESSAGES.win);
  });

  it('não contém nenhum temporizador de fechamento automático no código', () => {
    const source = readFileSync(
      new URL('../src/ui/resultCelebration.js', import.meta.url), 'utf8',
    );
    expect(source).not.toMatch(/autoHideMs/);
    expect(source).not.toMatch(/setTimeout/);
    expect(source).not.toMatch(/hideTimer/);
    expect(source).toContain("close.addEventListener('click', handleClose)");
  });
});
