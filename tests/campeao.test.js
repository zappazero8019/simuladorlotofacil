import { describe, expect, it } from 'vitest';
import { conferenceBet } from '../src/bets/index.js';
import {
  CHAMPION_EMPTY_LABEL,
  CHAMPION_LABEL,
  conferenceKey,
  describeChampions,
  matchedNumbersOf,
  planCelebration,
} from '../src/results/index.js';

const DRAW = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function conf(betId, matches, numbers = DRAW, contest = 1, drawnNumbers = DRAW) {
  return { betId, contest, matches, numbers, drawnNumbers };
}

describe('apuração pura do bilhete campeão', () => {
  it('escolhe o campeão único pela maior quantidade de acertos', () => {
    const champion = describeChampions([
      conf(1, 9),
      conf(2, 11),
      conf(3, 4),
    ]);
    expect(champion.active).toBe(true);
    expect(champion.bestMatches).toBe(11);
    expect(champion.count).toBe(1);
    expect(champion.betIds).toEqual(['2']);
    expect(champion.scoreLabel).toBe('11 ACERTOS');
    expect(champion.label).toBe(CHAMPION_LABEL);
  });

  it('marca todos os bilhetes empatados, independente da posição', () => {
    const champion = describeChampions([
      conf(77, 8),
      conf(42, 12),
      conf(91, 12),
      conf(10, 3),
    ]);
    expect(champion.count).toBe(2);
    expect(champion.betIds).toEqual(['42', '91']);
    expect(champion.isBetChampion(91)).toBe(true);
    expect(champion.isBetChampion(77)).toBe(false);
  });

  it('marca três ou mais empatados', () => {
    const champion = describeChampions([
      conf(1, 10),
      conf(2, 10),
      conf(3, 10),
      conf(4, 9),
    ]);
    expect(champion.count).toBe(3);
    expect(champion.betIds).toEqual(['1', '2', '3']);
    expect(champion.scoreLabel).toBe('10 ACERTOS');
  });

  it('não confunde maior acerto com maior prêmio ou faixa', () => {
    const conferences = [
      { betId: 1, contest: 1, matches: 15, bestTier: null, winningCombinations: 0, totalPrizeCents: 0 },
      { betId: 2, contest: 1, matches: 11, bestTier: '11', winningCombinations: 1, totalPrizeCents: 70000 },
    ];
    const champion = describeChampions(conferences);
    expect(champion.betIds).toEqual(['1']);
    expect(champion.bestMatches).toBe(15);

    const plan = planCelebration({ conferences, settings: {}, random: () => 0.9 });
    expect(plan.items.find((item) => item.betId === 1).isChampion).toBe(true);
    expect(plan.items.find((item) => item.betId === 1).receivedCents).toBe(0);
    expect(plan.items.find((item) => item.betId === 2).isChampion).toBe(false);
    expect(plan.items.find((item) => item.betId === 2).receivedCents).toBe(70000);
    expect(plan.summary.receivedCents).toBe(70000);
    expect(plan.summary.winnerCount).toBe(1);
  });

  it('usa exatamente a interseção entre sorteio e bilhete', () => {
    const numbers = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 2, 4];
    const drawn = [1, 2, 30, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    expect(matchedNumbersOf({ numbers, drawnNumbers: drawn })).toEqual([
      1, 2, 4, 5, 7, 9, 11, 13, 15,
    ]);

    const champion = describeChampions([conf(5, 9, numbers, 1, drawn)]);
    expect(champion.champions[0].matchedNumbers).toEqual([
      1, 2, 4, 5, 7, 9, 11, 13, 15,
    ]);
    expect(champion.numbersForBet(5)).toEqual([
      1, 2, 4, 5, 7, 9, 11, 13, 15,
    ]);
  });

  it('mantém chaves distintas para concursos diferentes da Teimosinha', () => {
    const sameBet = (contest) => conf(8, 6, DRAW, contest, DRAW);
    const champion = describeChampions([sameBet(1), sameBet(2)]);
    expect(champion.count).toBe(2);
    expect(champion.keys).toEqual(['8:1', '8:2']);
    expect(conferenceKey({ betId: 8, contest: 2 })).toBe('8:2');
  });

  it('sem conferências não produz destaque, mesmo com zero acertos empatados', () => {
    const champion = describeChampions([]);
    expect(champion.active).toBe(false);
    expect(champion.count).toBe(0);
    expect(champion.matchedNumbers).toEqual([]);
    expect(champion.isBetChampion(1)).toBe(false);
    expect(champion.scoreLabel).toBe('');
    expect(CHAMPION_EMPTY_LABEL).toBe('SEM BILHETE CAMPEÃO');
  });

  it('atualiza o campeão no concurso seguinte sem carregar o anterior', () => {
    const first = describeChampions([conf(1, 12), conf(2, 8)]);
    expect(first.betIds).toEqual(['1']);

    const second = describeChampions([conf(1, 4), conf(2, 9), conf(3, 9)]);
    expect(second.betIds).toEqual(['2', '3']);
    expect(second.scoreLabel).toBe('9 ACERTOS');
    expect(second.isBetChampion(1)).toBe(false);
    expect(second.keys).not.toEqual(first.keys);
  });

  it('conferências do motor continuam intactas e corretas', () => {
    const bet = { id: 3, numbers: DRAW };
    const original = conferenceBet(bet, DRAW, { contest: 7 });
    const snapshot = JSON.stringify(original);

    describeChampions([original]);
    planCelebration({ conferences: [original], settings: {}, random: () => 0.9 });

    expect(JSON.stringify(original)).toBe(snapshot);
    expect(original.matches).toBe(15);
    expect(original.totalPrizeCents).toBeGreaterThan(0);
  });
});
