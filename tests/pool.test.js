import { describe, expect, it } from 'vitest';
import {
  createPool,
  distributePoolPrize,
  getBetPriceCents,
  splitAmountCents,
} from '../src/bets/index.js';

describe('Fase 3 — bolões fictícios', () => {
  it('cria cotas anônimas quando não há participantes', () => {
    const pool = createPool({
      betSize: 15,
      totalCents: getBetPriceCents(15),
      shares: 7,
    });
    expect(pool.shares).toBe(7);
    expect(pool.members).toHaveLength(7);
    expect(pool.shareCents).toBe(50);
    expect(pool.sharePercentage).toBeCloseTo(100 / 7);
    expect(pool.members[0].name).toBe('Cota 1');
    expect(Object.isFrozen(pool.members)).toBe(true);
  });

  it('respeita participantes fictícios com cotas múltiplas', () => {
    const pool = createPool({
      betSize: 16,
      totalCents: getBetPriceCents(16),
      shares: 4,
      participants: [
        { name: 'Ana', shares: 2 },
        { name: 'Bruno', shares: 1 },
        'Carla',
      ],
    });
    expect(pool.members.map((member) => member.name)).toEqual(['Ana', 'Bruno', 'Carla']);
    expect(pool.members.map((member) => member.shares)).toEqual([2, 1, 1]);
    expect(pool.members.map((member) => member.percentage)).toEqual([50, 25, 25]);
    expect(pool.members.reduce((sum, member) => sum + member.amountCents, 0))
      .toBe(getBetPriceCents(16));
  });

  it('rejeita soma de cotas diferente da quantidade informada', () => {
    expect(() => createPool({
      betSize: 15,
      totalCents: 350,
      shares: 3,
      participants: ['Ana'],
    })).toThrow(RangeError);
    expect(() => createPool({ betSize: 15, totalCents: 350, shares: 8 }))
      .toThrow(RangeError);
  });

  it('divide o prêmio com resíduo na última cota', () => {
    const pool = createPool({ betSize: 15, totalCents: 350, shares: 3 });
    const distribution = distributePoolPrize(pool, 1000);
    expect(distribution.map((item) => item.amountCents)).toEqual([333, 333, 334]);
    expect(distribution.reduce((sum, item) => sum + item.amountCents, 0)).toBe(1000);
    expect(splitAmountCents(1000, 3)).toEqual([333, 333, 334]);
  });

  it('não altera o bolão ao distribuir prêmios', () => {
    const pool = createPool({ betSize: 15, totalCents: 350, shares: 2 });
    const snapshot = JSON.stringify(pool);
    distributePoolPrize(pool, 700);
    expect(JSON.stringify(pool)).toBe(snapshot);
  });
});
