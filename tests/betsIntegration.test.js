import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assignContestResult,
  conferenceBet,
  createBetRegistry,
  createPool,
  createVolante,
  generateSurpresinha,
} from '../src/bets/index.js';
import { createDrawSession } from '../src/draws/session.js';
import { createPresentationController } from '../src/draws/presentation.js';
import { createShowController } from '../src/draws/show.js';
import { getPrizeValueCents } from '../src/prizes/prizeValues.js';

function listSources(directory) {
  const base = new URL(directory, import.meta.url);
  return readdirSync(fileURLToPath(base), { recursive: true })
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, source: readFileSync(new URL(file, base), 'utf8') }));
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
      for (const entry of callbacks.splice(0)) entry.callback();
    },
  };
}

describe('Fase 3 — integração com sessão de sorteio', () => {
  it('conferência usa somente o resultado congelado da sessão', () => {
    const session = createDrawSession({ random: () => 0 });
    const result = session.draw();
    const frozen = session.getFrozenResult();
    const bet = { id: 1, numbers: result };

    const timer = fakeTimer();
    const presentation = createPresentationController({ session, timer });
    expect(presentation.start()).toBe(true);
    timer.tick();
    presentation.revealAll();
    presentation.setSpeed(5);
    presentation.reset();

    const conference = conferenceBet(bet, session.getFrozenResult());
    expect(conference.drawnNumbers).toEqual(result);
    expect(conference.matches).toBe(15);
    expect(session.getFrozenResult()).toBe(frozen);
    expect(Object.isFrozen(frozen)).toBe(true);
    presentation.dispose();
  });

  it('troca de modo visual não altera a conferência', () => {
    const session = createDrawSession({ random: () => 0.42 });
    session.draw();
    const frozen = session.getFrozenResult();
    const bet = { id: 1, numbers: [...frozen] };
    const before = conferenceBet(bet, frozen);

    const show = createShowController({ session, views: { globo: {}, roleta: {} } });
    show.selectMode('roleta');
    show.setSpeed(3);
    show.restart();
    show.selectMode('globo');
    const after = conferenceBet(bet, session.getFrozenResult());

    expect(after).toEqual(before);
    expect(session.getFrozenResult()).toBe(frozen);
    show.dispose();
  });

  it('novo sorteio gera novo resultado, mas não altera apostas já cadastradas', () => {
    const session = createDrawSession({ random: () => 0.3 });
    const registry = createBetRegistry();
    const bet = registry.add({ numbers: generateSurpresinha(15, () => 0) });
    const originalNumbers = [...bet.numbers];

    const first = session.draw();
    const second = session.draw();
    expect(session.generation).toBe(2);
    expect([...bet.numbers]).toEqual(originalNumbers);
    expect(conferenceBet(bet, first).drawnNumbers).toEqual(first);
    expect(conferenceBet(bet, second).drawnNumbers).toEqual(second);
  });

  it('Teimosinha usa o resultado de cada concurso sem gerar nova aposta', () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const session = createDrawSession({ random });
    const registry = createBetRegistry();
    const bet = registry.add({
      numbers: generateSurpresinha(15, () => 0),
      contests: 3,
    });
    for (let index = 0; index < bet.contests; index += 1) {
      session.draw();
      expect(assignContestResult(bet.results, session.getFrozenResult())).toBe(index);
    }
    const conferences = bet.results.map((result, index) => conferenceBet(bet, result, {
      contest: index + 1,
    }));
    expect(conferences).toHaveLength(3);
    expect(conferences.every((item) => item.numbers.join(',') === bet.numbers.join(',')))
      .toBe(true);
    expect(new Set(conferences.map((item) => item.drawnNumbers.join(','))).size).toBe(3);
  });

  it('volante + surpresinha + bolão + conferência fecham o ciclo', () => {
    const volante = createVolante();
    expect(volante.setNumbers(generateSurpresinha(16, () => 0))).toBe(true);
    const registry = createBetRegistry();
    const pool = createPool({ betSize: 16, totalCents: 5600, shares: 2 });
    const bet = registry.add({ numbers: volante.getNumbers(), pool });
    const session = createDrawSession({ random: () => 0 });
    session.draw();
    const conference = conferenceBet(bet, session.getFrozenResult());
    expect(conference.betId).toBe(bet.id);
    expect(conference.totalCombinations).toBe(16);
    expect(conference.poolDistribution).toHaveLength(2);
    expect(conference.totalPrizeCents).toBe(
      15 * getPrizeValueCents(14) + getPrizeValueCents(15),
    );
  });
});

describe('Fase 3 — ausência de duplicação de lógica', () => {
  it('módulos de apostas não reimplementam combinatória, amostragem ou conferência', () => {
    const forbidden = /function\s+(choose|countCombinations|countCombinationsByTier|sampleNumbers|sampleDistinct|checkBet|countMatches|validateBet|validateDraw)\b/;
    for (const { file, source } of listSources('../src/bets/')) {
      expect(source, file).not.toMatch(forbidden);
    }
    // Prizes define checkBet/countMatches legítimos; apenas não pode refazer o núcleo.
    const coreOnly = /function\s+(choose|countCombinations|countCombinationsByTier|sampleNumbers|sampleDistinct|validateBet|validateDraw)\b/;
    for (const { file, source } of listSources('../src/prizes/')) {
      expect(source, file).not.toMatch(coreOnly);
    }
  });

  it('aposta, bolão e conferência não dependem de UI, DOM ou sorteio', () => {
    const forbidden = /from\s+['"][^'"]*\/(visualization|ui|draws|finance|history|statistics)\//;
    const dom = /document\.|window\.|requestAnimationFrame|localStorage/;
    for (const { file, source } of listSources('../src/bets/')) {
      expect(source, file).not.toMatch(forbidden);
      expect(source, file).not.toMatch(dom);
    }
    for (const { file, source } of listSources('../src/prizes/')) {
      expect(source, file).not.toMatch(forbidden);
      expect(source, file).not.toMatch(dom);
    }
  });
});
