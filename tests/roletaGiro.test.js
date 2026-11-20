import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAudioEngine } from '../src/audio/index.js';
import { createPresentationController } from '../src/draws/presentation.js';
import { createDrawSession } from '../src/draws/session.js';
import { createHistoryService } from '../src/history/service.js';
import { createIdFactory } from '../src/persistence/ids.js';
import { createMemoryStore } from '../src/persistence/memoryStore.js';
import { createRoleta } from '../src/ui/roleta.js';
import { ROLETA_SLOTS } from '../src/ui/roletaModel.js';

const SEQUENCE = [3, 7, 12, 1, 19, 25, 8, 14, 2, 16, 21, 5, 10, 23, 18];

function makeElement() {
  const classes = new Set();
  const styles = new Map();
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
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
    },
    style: {
      setProperty(key, value) { styles.set(key, String(value)); },
      removeProperty(key) { styles.delete(key); },
      getPropertyValue(key) { return styles.get(key) ?? ''; },
    },
    setAttribute(key, value) { attributes.set(key, String(value)); },
    getAttribute(key) { return attributes.get(key) ?? null; },
    appendChild(node) { children.push(node); return node; },
    append(...nodes) { children.push(...nodes); },
    replaceChildren(...nodes) { children.length = 0; children.push(...nodes); },
    _classes: classes,
    _styles: styles,
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
          .sort((left, right) => left[1].at - right[1].at);
        if (due.length === 0) break;
        const [id, entry] = due[0];
        pending.delete(id);
        now = entry.at;
        entry.callback();
      }
      now = target;
    },
    get count() { return pending.size; },
    get time() { return now; },
  };
}

function makeRoleta({ audio = { playEffect: vi.fn(() => true) }, reducedMotion = false } = {}) {
  const container = makeElement();
  const timer = fakeTimer();
  const doc = { createElement: () => makeElement() };
  const roleta = createRoleta(container, { doc, timer, audio, reducedMotion });
  return { roleta, timer, audio };
}

function runUntil(predicate, timer, limit = 30000) {
  for (let elapsed = 0; elapsed < limit && !predicate(); elapsed += 1) timer.advance(1);
  return predicate();
}

function stateOf(mode = 'normal', speed = 1) {
  return { presentationMode: mode, speed, instant: false, instantMode: false };
}

describe('roleta — giro de seleção', () => {
  it('percorre as 15 posições e para no destino correto', () => {
    const { roleta, timer, audio } = makeRoleta();
    roleta.reveal(7, 0, stateOf());
    expect(roleta.spinning).toBe(true);
    expect(roleta.spinSteps).toBeGreaterThanOrEqual(ROLETA_SLOTS);

    const visited = new Set();
    for (let elapsed = 0; elapsed < 5000 && roleta.spinning; elapsed += 1) {
      timer.advance(1);
      if (roleta.activeIndex >= 0) visited.add(roleta.activeIndex);
    }
    expect(visited.size).toBe(ROLETA_SLOTS);
    expect(roleta.spinning).toBe(false);
    expect(roleta.getSlots()[0]).toBe(7);
    expect(roleta.pendingNumber).toBeNull();
    expect(audio.playEffect).toHaveBeenCalledWith('spin');
    expect(audio.playEffect).toHaveBeenCalledWith('slowdown');
    expect(audio.playEffect).toHaveBeenCalledWith('reveal');
  });

  it('para em cada uma das 15 posições sem duplicar números', () => {
    const { roleta, timer } = makeRoleta();
    SEQUENCE.forEach((number, index) => {
      expect(roleta.reveal(number, index, stateOf())).toBe(true);
      runUntil(() => !roleta.spinning, timer);
      expect(roleta.getSlots()[index]).toBe(number);
    });
    expect(roleta.getNumbers()).toEqual(SEQUENCE);
    expect(new Set(roleta.getNumbers()).size).toBe(ROLETA_SLOTS);
    expect(roleta.complete).toBe(true);
    expect(roleta.spinning).toBe(false);
    // A limpeza visual de impacto tem 650 ms e é apenas cosmética; ela não
    // bloqueia o encerramento e é cancelada por reset/dispose.
    timer.advance(700);
    expect(roleta.pendingTimers).toBe(0);
  });

  it('modo normal gira mais que o acelerado e ambos terminam', () => {
    const normal = makeRoleta();
    normal.roleta.reveal(4, 0, stateOf('normal', 1));
    const normalSteps = normal.roleta.spinSteps;
    const normalStart = normal.timer.time;
    runUntil(() => !normal.roleta.spinning, normal.timer);
    const normalTime = normal.timer.time - normalStart;

    const fast = makeRoleta();
    fast.roleta.reveal(4, 0, stateOf('acelerado', 3));
    const fastSteps = fast.roleta.spinSteps;
    const fastStart = fast.timer.time;
    runUntil(() => !fast.roleta.spinning, fast.timer);
    const fastTime = fast.timer.time - fastStart;

    expect(normalSteps).toBeGreaterThan(fastSteps);
    expect(normalTime).toBeGreaterThan(fastTime);
    expect(normal.roleta.getSlots()[0]).toBe(4);
    expect(fast.roleta.getSlots()[0]).toBe(4);
  });

  it('modo instantâneo revela sem giro nem timers pendentes', () => {
    const { roleta, timer, audio } = makeRoleta();
    expect(roleta.reveal(9, 0, { presentationMode: 'instantaneo', instantMode: true })).toBe(true);
    expect(roleta.spinning).toBe(false);
    expect(roleta.getSlots()[0]).toBe(9);
    expect(timer.count).toBe(0);
    expect(audio.playEffect).not.toHaveBeenCalledWith('spin');
  });

  it('redução de movimento revela diretamente e cancela giros ativos', () => {
    const { roleta, timer } = makeRoleta({ reducedMotion: true });
    roleta.reveal(11, 0, stateOf());
    expect(roleta.spinning).toBe(false);
    expect(roleta.getSlots()[0]).toBe(11);

    roleta.setReducedMotion(false);
    roleta.reveal(12, 1, stateOf());
    expect(roleta.spinning).toBe(true);
    roleta.setReducedMotion(true);
    expect(roleta.spinning).toBe(false);
    expect(roleta.getSlots()[1]).toBe(12);
    expect(timer.count).toBe(0);
  });

  it('interrompe o giro com reset sem revelar número pendente', () => {
    const { roleta, timer } = makeRoleta();
    roleta.reveal(6, 0, stateOf());
    timer.advance(20);
    roleta.reset();
    expect(roleta.spinning).toBe(false);
    expect(roleta.getSlots()).toEqual(Array(ROLETA_SLOTS).fill(null));
    expect(roleta.pendingTimers).toBe(0);
  });

  it('cancelamento por navegação aplica o número pendente uma única vez', () => {
    const { roleta, timer } = makeRoleta();
    roleta.reveal(15, 0, stateOf());
    timer.advance(20);
    expect(roleta.cancelAnimation()).toBe(true);
    expect(roleta.spinning).toBe(false);
    expect(roleta.getSlots()[0]).toBe(15);
    expect(roleta.reveal(15, 0, stateOf())).toBe(false);
    expect(roleta.getNumbers()).toEqual([15]);
    expect(timer.count).toBe(0);
  });

  it('troca para modo instantâneo durante o giro não perde a revelação', () => {
    const { roleta, timer } = makeRoleta();
    roleta.reveal(18, 2, stateOf());
    timer.advance(25);
    roleta.setPresentationMode('instantaneo');
    expect(roleta.spinning).toBe(false);
    expect(roleta.getSlots()[2]).toBe(18);
    expect(roleta.isInstant).toBe(true);
    expect(timer.count).toBe(0);
  });

  it('pausa e retoma sem duplicar passos nem perder a posição', () => {
    const { roleta, timer } = makeRoleta();
    roleta.reveal(21, 1, stateOf());
    timer.advance(30);
    const before = timer.time;
    roleta.setPaused(true);
    timer.advance(200);
    expect(timer.time).toBeGreaterThan(before + 199);
    expect(roleta.spinning).toBe(true);
    // O número fica reservado no modelo, mas ainda não foi aplicado ao DOM:
    // `pendingNumber` é a prova de que a revelação visual está suspensa.
    expect(roleta.pendingNumber).toBe(21);
    roleta.setPaused(false);
    runUntil(() => !roleta.spinning, timer);
    expect(roleta.pendingNumber).toBeNull();
    expect(roleta.getSlots()[1]).toBe(21);
    expect(roleta.getNumbers()).toEqual([21]);
  });

  it('nova revelação antes do fim aplica a pendente e mantém a ordem', () => {
    const { roleta, timer } = makeRoleta();
    roleta.reveal(3, 0, stateOf());
    timer.advance(20);
    roleta.reveal(7, 1, stateOf());
    expect(roleta.getSlots()[0]).toBe(3);
    expect(roleta.spinning).toBe(true);
    runUntil(() => !roleta.spinning, timer);
    expect(roleta.getNumbers()).toEqual([3, 7]);
  });

  it('respeita a sequência congelada e não altera histórico nem finanças', async () => {
    const store = createMemoryStore();
    const service = createHistoryService({
      store,
      idFactory: createIdFactory(),
      now: () => '2026-11-20T18:00:00.000Z',
      random: () => 0.42,
    });
    await service.initialize();
    await service.buyTickets({ numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] });
    const draw = await service.registerDraw({ draw: SEQUENCE, sessionId: 'giro', generation: 1 });
    // O serviço persiste a sequência em ordem canônica ascendente; a ordem de
    // extração exibida vem da sessão congelada, não do registro.
    expect(draw.draw.numbers).toEqual([...SEQUENCE].sort((left, right) => left - right));

    const before = {
      summary: await service.getSummary(),
      statistics: await service.getStatistics(),
      events: await service.getEvents(),
      prizes: await service.getPrizes(),
    };

    const session = createDrawSession();
    session.setResult(SEQUENCE);
    const { roleta, timer } = makeRoleta();
    const timerPresentation = fakeTimer();
    const presentation = createPresentationController({
      session,
      timer: timerPresentation,
      onReveal: (number, index, state) => roleta.reveal(number, index, state),
    });
    presentation.start();
    for (let elapsed = 0; elapsed < 60000; elapsed += 1) {
      if (presentation.getState().complete && !roleta.spinning) break;
      timerPresentation.advance(1);
      timer.advance(1);
    }
    expect(presentation.getState().complete).toBe(true);
    expect(roleta.spinning).toBe(false);

    const frozen = session.getFrozenResult();
    // O motor congela a sequência em ordem canônica; a roleta deve apresentá-la
    // exatamente nessa ordem, sem reordenar nem sortear novamente.
    expect(frozen).toEqual([...SEQUENCE].sort((left, right) => left - right));
    expect(roleta.getNumbers()).toEqual(frozen);
    expect(await service.getSummary()).toEqual(before.summary);
    expect(await service.getStatistics()).toEqual(before.statistics);
    expect(await service.getEvents()).toEqual(before.events);
    expect(await service.getPrizes()).toEqual(before.prizes);
  });
});

describe('roleta — áudio do giro', () => {
  it('respeita efeitos desativados e volume configurado sem novo motor', () => {
    let created = 0;
    const gains = [];
    const makeContext = () => {
      created += 1;
      const context = {
        state: 'running',
        currentTime: 1,
        destination: {},
        createGain() {
          const node = {
            gain: {
              value: 1,
              setValueAtTime(value) { node.gain.value = value; },
              setTargetAtTime(value) { node.gain.value = value; },
              linearRampToValueAtTime(value) { node.gain.value = value; },
              exponentialRampToValueAtTime(value) { node.gain.value = value; },
            },
            connect() {},
            disconnect() {},
          };
          gains.push(node);
          return node;
        },
        createOscillator() {
          return {
            frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {},
            disconnect() {},
            start() {},
            stop() {},
          };
        },
      };
      return context;
    };
    const engine = createAudioEngine({ createContext: makeContext, timer: { set: () => 1, clear() {} } });
    engine.configure({ sfxEnabled: false, sfxVolume: 30 });
    expect(engine.playEffect('spin')).toBe(false);
    expect(engine.playEffect('slowdown')).toBe(false);
    expect(created).toBe(0);

    engine.configure({ sfxEnabled: true });
    engine.unlock();
    expect(created).toBe(1);
    expect(gains[2].gain.value).toBeCloseTo(0.3);
    expect(engine.playEffect('spin')).toBe(true);
    expect(engine.playEffect('slowdown')).toBe(true);
    engine.dispose();
  });

  it('mantém o CSS de destaque, impacto e redução de movimento', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(css).toContain('.celula.em-giro');
    expect(css).toContain('--brilho-alpha');
    expect(css).toContain('.celula.impacto');
    expect(css).toContain('.numero.entrando');
    expect(css).toContain('@keyframes numero-entrada');
    expect(css).toContain('.celula.em-giro,\n  .celula.impacto');
  });
});
