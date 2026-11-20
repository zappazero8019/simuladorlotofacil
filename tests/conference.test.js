import { describe, expect, it } from 'vitest';
import {
  conferenceAll,
  conferenceBet,
  createBetRegistry,
  createPool,
} from '../src/bets/index.js';
import { countCombinationsByTier, PRIZE_TIERS } from '../src/core/index.js';
import { checkBet } from '../src/prizes/index.js';
import {
  FIXED_PRIZE_VALUES_CENTS as FIXED_VALUES,
  REFERENCE_PRIZE_VALUES_CENTS as REFERENCE_VALUES,
} from '../src/prizes/prizeValues.js';

const bet15 = Array.from({ length: 15 }, (_, index) => index + 1);

function drawWithMatches(matches) {
  const drawn = Array.from({ length: matches }, (_, index) => index + 1);
  let outside = 16;
  while (drawn.length < 15) {
    drawn.push(outside);
    outside += 1;
  }
  return drawn;
}

describe('Fase 3 — conferência e valores', () => {
  it('usa valores oficiais fixos e referências centralizadas', () => {
    expect(FIXED_VALUES).toEqual({ 11: 700, 12: 1400, 13: 3500 });
    expect(PRIZE_TIERS).toEqual([11, 12, 13, 14, 15]);
    expect(REFERENCE_VALUES[14]).toBeGreaterThan(0);
    expect(REFERENCE_VALUES[15]).toBeGreaterThan(0);
  });

  it.each([
    [15, REFERENCE_VALUES[15]],
    [14, REFERENCE_VALUES[14]],
    [13, FIXED_VALUES[13]],
    [12, FIXED_VALUES[12]],
    [11, FIXED_VALUES[11]],
    [10, 0],
  ])('conferência de %i acertos', (matches, expectedPrize) => {
    const draw = drawWithMatches(matches);
    const conference = conferenceBet({ id: 1, numbers: bet15 }, draw);
    expect(conference.matches).toBe(matches);
    expect(conference.winningCombinations).toBe(matches >= 11 ? 1 : 0);
    expect(conference.totalPrizeCents).toBe(expectedPrize);
    expect(conference.drawnNumbers).toEqual(draw);
    expect(conference.bestTier).toBe(matches >= 11 ? matches : null);
  });

  it('conta cada combinação premiada uma única vez', () => {
    const bet20 = Array.from({ length: 20 }, (_, index) => index + 1);
    const draw = bet15;
    const expected = countCombinationsByTier(20, 15, PRIZE_TIERS);
    const conference = conferenceBet({ id: 2, numbers: bet20 }, draw);
    expect(conference.totalCombinations).toBe(15504);
    expect(Object.fromEntries(
      Object.entries(conference.prizeByTier).map(([tier, value]) => [tier, value.count]),
    )).toEqual(expected);
    expect(conference.winningCombinations).toBe(checkBet(bet20, draw).winningCombinations);
    const expectedTotal = PRIZE_TIERS.reduce(
      (sum, tier) => sum + expected[tier] * conference.prizeByTier[tier].unitCents,
      0,
    );
    expect(conference.totalPrizeCents).toBe(expectedTotal);
  });

  it('aceita sobrescrever valores de referência', () => {
    const conference = conferenceBet(
      { numbers: bet15 },
      bet15,
      { prizeValues: { 15: 12345 } },
    );
    expect(conference.totalPrizeCents).toBe(12345);
  });

  it('conferência não altera aposta nem resultado', () => {
    const bet = Object.freeze({ id: 3, numbers: Object.freeze([...bet15]) });
    const draw = Object.freeze([...bet15]);
    const snapshot = JSON.stringify({ bet: bet.numbers, draw });
    const conference = conferenceBet(bet, draw);
    expect(JSON.stringify({ bet: bet.numbers, draw })).toBe(snapshot);
    expect(Object.isFrozen(conference.numbers)).toBe(false);
  });

  it('conferência de todas as apostas cadastradas', () => {
    const registry = createBetRegistry();
    registry.add({ numbers: bet15 });
    registry.add({ numbers: Array.from({ length: 16 }, (_, i) => i + 1) });
    const conferences = conferenceAll(registry.list(), bet15);
    expect(conferences).toHaveLength(2);
    expect(conferences.map((item) => item.betId)).toEqual([1, 2]);
    expect(conferences[0].totalPrizeCents).toBe(REFERENCE_VALUES[15]);
  });

  it('distribui o prêmio do bolão entre os cotistas', () => {
    const pool = createPool({
      betSize: 15,
      totalCents: 350,
      shares: 2,
      participants: ['Ana', 'Bruno'],
    });
    const bet = { id: 4, numbers: bet15, pool };
    const conference = conferenceBet(bet, bet15);
    expect(conference.poolDistribution).toHaveLength(2);
    expect(conference.poolDistribution.reduce((sum, p) => sum + p.amountCents, 0))
      .toBe(conference.totalPrizeCents);
  });
});
