import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { conferenceBet } from '../src/bets/index.js';
import {
  applyEvent,
  buildPrizeEvents,
  createFinancialState,
  getBalance,
} from '../src/finance/index.js';
import {
  CHAMPION_LABEL,
  describeChampions,
  describeSingleHighlight,
  planCelebration,
  resolveHighlight,
} from '../src/results/index.js';

const DRAW = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const DRAW_2 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

function makeConference({ betId, matches, contest = 1, drawnNumbers = DRAW }) {
  const matched = drawnNumbers.slice(0, matches);
  const unmatched = Array.from({ length: 15 - matches }, (_, index) => 100 + index);
  return {
    betId,
    contest,
    numbers: [...matched, ...unmatched],
    drawnNumbers: [...drawnNumbers],
    matches,
    totalPrizeCents: 0,
  };
}

function prizeEventsFor(conference) {
  let sequence = 0;
  return buildPrizeEvents({
    conference,
    contest: conference.contest,
    now: 1,
    seqStart: 0,
    idFactory: () => `evento-${++sequence}`,
  });
}

function ledgerFrom(events) {
  return events.reduce(applyEvent, createFinancialState());
}

describe('destaque imediato de bilhete único', () => {
  it('usa somente a conferência única, sem apuração de campeão', () => {
    const conference = makeConference({ betId: 7, matches: 8 });
    const single = vi.fn((item, draw) => describeSingleHighlight(item, draw));
    const champions = vi.fn(() => { throw new Error('campeão não deveria ser apurado'); });

    const highlight = resolveHighlight([conference], DRAW, { single, champions });

    expect(single).toHaveBeenCalledTimes(1);
    expect(single).toHaveBeenCalledWith(conference, DRAW);
    expect(champions).not.toHaveBeenCalled();
    expect(highlight.active).toBe(true);
    expect(highlight.count).toBe(1);
    expect(highlight.betIds).toEqual(['7']);
    expect(highlight.keys).toEqual(['7:1']);
    expect(highlight.label).toBe(CHAMPION_LABEL);
    expect(highlight.scoreLabel).toBe('8 ACERTOS');
  });

  it('destaca exatamente a interseção entre sorteio e bilhete único', () => {
    const conference = makeConference({ betId: 3, matches: 6, contest: 4 });
    const highlight = resolveHighlight([conference], DRAW);

    expect(highlight.matchedNumbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(highlight.numbersForBet(3)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(highlight.isBetChampion(3)).toBe(true);
    expect(highlight.isBetChampion(4)).toBe(false);
    expect(highlight.champions[0].matchedNumbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('usa o resultado do sorteio como fallback quando a conferência não traz drawnNumbers', () => {
    const conference = {
      betId: 9,
      contest: 2,
      matches: 4,
      numbers: [10, 11, 12, 13, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    };

    const highlight = describeSingleHighlight(conference, DRAW);

    expect(highlight.matchedNumbers).toEqual([10, 11, 12, 13]);
    expect(highlight.keys).toEqual(['9:2']);
  });

  it('não destaca nada antes da conferência, mesmo com aposta cadastrada', () => {
    const beforeDraw = resolveHighlight([], DRAW);
    expect(beforeDraw.active).toBe(false);
    expect(beforeDraw.count).toBe(0);
    expect(beforeDraw.matchedNumbers).toEqual([]);
    expect(beforeDraw.scoreLabel).toBe('');
    expect(beforeDraw.isBetChampion(1)).toBe(false);

    const invalid = describeSingleHighlight(null, DRAW);
    expect(invalid.active).toBe(false);
    expect(invalid.matchedNumbers).toEqual([]);
  });
});

describe('dois ou mais bilhetes mantêm a apuração completa', () => {
  it('aguarda todas as conferências antes de escolher o maior acerto', () => {
    const conferences = [
      makeConference({ betId: 1, matches: 5 }),
      makeConference({ betId: 2, matches: 11 }),
    ];
    const single = vi.fn(() => { throw new Error('bilhete único não deveria ser usado'); });
    const champions = vi.fn((items, draw) => describeChampions(items, draw));

    const highlight = resolveHighlight(conferences, DRAW, { single, champions });

    expect(champions).toHaveBeenCalledTimes(1);
    expect(champions).toHaveBeenCalledWith(conferences, DRAW);
    expect(single).not.toHaveBeenCalled();
    expect(highlight.betIds).toEqual(['2']);
    expect(highlight.scoreLabel).toBe('11 ACERTOS');
  });

  it('destaca todos os bilhetes empatados na maior quantidade de acertos', () => {
    const conferences = [
      makeConference({ betId: 1, matches: 9 }),
      makeConference({ betId: 2, matches: 9 }),
      makeConference({ betId: 3, matches: 9 }),
      makeConference({ betId: 4, matches: 6 }),
    ];

    const highlight = resolveHighlight(conferences, DRAW);

    expect(highlight.count).toBe(3);
    expect(highlight.betIds).toEqual(['1', '2', '3']);
    expect(highlight.scoreLabel).toBe('9 ACERTOS');
    for (const betId of [1, 2, 3]) expect(highlight.isBetChampion(betId)).toBe(true);
    expect(highlight.isBetChampion(4)).toBe(false);
  });

  it('marca somente os números efetivamente acertados de cada campeão', () => {
    const conferences = [
      makeConference({ betId: 1, matches: 7 }),
      makeConference({ betId: 2, matches: 7 }),
    ];

    const highlight = resolveHighlight(conferences, DRAW);

    for (const betId of [1, 2]) {
      expect(highlight.numbersForBet(betId)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    }
    expect(highlight.matchedNumbers).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('correção pontual entre concursos e regras financeiras', () => {
  it('atualiza o destaque no concurso seguinte sem carregar o anterior', () => {
    const first = resolveHighlight([
      makeConference({ betId: 5, matches: 9, contest: 1, drawnNumbers: DRAW }),
    ]);
    const second = resolveHighlight([
      makeConference({ betId: 5, matches: 6, contest: 2, drawnNumbers: DRAW_2 }),
    ]);

    expect(first.matchedNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(second.keys).toEqual(['5:2']);
    expect(second.matchedNumbers).toEqual([2, 3, 4, 5, 6, 7]);
    expect(second.champions).toHaveLength(1);
  });

  it('não altera conferência, prêmio ou mensagem de premiação', () => {
    const conference = conferenceBet({ id: 1, numbers: DRAW }, DRAW, { contest: 1 });
    const snapshot = JSON.stringify(conference);
    const withoutHighlight = planCelebration({
      conferences: [conference], settings: {}, random: () => 0.9,
    });

    const highlight = resolveHighlight([conference], DRAW);
    const withHighlight = planCelebration({
      conferences: [conference], champion: highlight, settings: {}, random: () => 0.9,
    });

    expect(JSON.stringify(conference)).toBe(snapshot);
    expect(withHighlight.summary.receivedCents).toBe(withoutHighlight.summary.receivedCents);
    expect(withHighlight.summary.winnerCount).toBe(withoutHighlight.summary.winnerCount);
    expect(withHighlight.items.map((item) => [item.betId, item.message, item.receivedCents]))
      .toEqual(withoutHighlight.items.map((item) => [item.betId, item.message, item.receivedCents]));
    expect(withHighlight.summary.receivedCents).toBeGreaterThan(0);
  });

  it('não altera eventos, saldo ou histórico financeiro', () => {
    const conference = conferenceBet({ id: 1, numbers: DRAW }, DRAW, { contest: 1 });
    const eventsBefore = prizeEventsFor(conference);
    const ledgerBefore = ledgerFrom(eventsBefore);
    const balanceBefore = getBalance(ledgerBefore);
    const snapshot = JSON.stringify(conference);

    resolveHighlight([conference], DRAW);
    resolveHighlight([
      makeConference({ betId: 1, matches: 5 }),
      makeConference({ betId: 2, matches: 7 }),
    ], DRAW);

    const eventsAfter = prizeEventsFor(conference);
    const ledgerAfter = ledgerFrom(eventsAfter);

    expect(JSON.stringify(conference)).toBe(snapshot);
    expect(eventsAfter).toEqual(eventsBefore);
    expect(ledgerAfter).toEqual(ledgerBefore);
    expect(getBalance(ledgerAfter)).toEqual(balanceBefore);
  });

  it('mantém o roxo neon existente no CSS', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(css).toContain('#a855f7');
    expect(css).toContain('.resultado-slot.campeao');
    expect(css).toContain('.celula.campeao');
  });
});
