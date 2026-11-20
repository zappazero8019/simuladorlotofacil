import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computePurchasePreview,
  createPurchaseGuard,
  describePurchase,
  normalizeQuantity,
  purchaseSignature,
} from '../src/ui/purchase.js';
import {
  balanceSeries,
  chartMax,
  contestBars,
  downsample,
  tierBars,
} from '../src/ui/charts.js';
import { createDeferredVisualization } from '../src/ui/deferredVisualization.js';

const numbers = Array.from({ length: 15 }, (_, index) => index + 1);

describe('Fase 5 — compra de bilhetes', () => {
  it('aceita um bilhete ou milhares, sem teto artificial', () => {
    expect(normalizeQuantity('1')).toBe(1);
    expect(normalizeQuantity(3000)).toBe(3000);
    expect(() => normalizeQuantity(0)).toThrow(RangeError);
    expect(() => normalizeQuantity(1.5)).toThrow(RangeError);
    expect(() => normalizeQuantity('mil')).toThrow(RangeError);
  });

  it('calcula a prévia somente com o preço centralizado', () => {
    const preview = computePurchasePreview({ quantity: 1000, size: 15, priceCents: 350 });
    expect(preview.totalCents).toBe(350000);
    expect(preview.text).toBe('1000 × R$ 3,50 = R$ 3.500,00');
    expect(() => computePurchasePreview({ quantity: 1, priceCents: -1 })).toThrow(RangeError);
  });

  it('exige confirmação e bloqueia cliques repetidos com a mesma intenção', () => {
    const signature = purchaseSignature({ numbers, quantity: 500, contests: 1, contest: 2 });
    const guard = createPurchaseGuard();
    expect(guard.isArmed(signature)).toBe(false);
    guard.arm(signature);
    expect(guard.consume(signature)).toBe(true);
    expect(guard.consume(signature)).toBe(false);
    expect(guard.pending).toBeNull();
  });

  it('distingue intenções diferentes na assinatura da compra', () => {
    const base = purchaseSignature({ numbers, quantity: 2, contests: 1, contest: 1 });
    expect(purchaseSignature({ numbers, quantity: 3, contests: 1, contest: 1 })).not.toBe(base);
    expect(purchaseSignature({ numbers, quantity: 2, contests: 1, contest: 2 })).not.toBe(base);
    expect(purchaseSignature({
      numbers, quantity: 2, contests: 1, contest: 1, pool: { shares: 2, participants: ['Ana', 'Bruno'] },
    })).not.toBe(base);
  });

  it('descreve IDs individuais da última compra', () => {
    const tickets = [
      { displayId: 10, size: 15, priceCents: 350 },
      { displayId: 11, size: 15, priceCents: 350 },
    ];
    expect(describePurchase({ tickets, totalCents: 700, contest: 3 }))
      .toBe('2 bilhete(s) #10–#11 · 15 dezenas · R$ 7,00 · concurso 3');
  });
});

describe('Fase 5 — gráficos com dados reais', () => {
  it('reduz pontos para desenho preservando o primeiro e o último', () => {
    const points = Array.from({ length: 200 }, (_, index) => ({ seq: index }));
    const sampled = downsample(points, 20);
    expect(sampled).toHaveLength(20);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled.at(-1)).toEqual(points.at(-1));
  });

  it('monta a série acumulada a partir de eventos persistidos', () => {
    const events = [
      { seq: 1, type: 'ticket', amountCents: 350 },
      { seq: 2, type: 'ticket', amountCents: 5600 },
      { seq: 3, type: 'prize', amountCents: 1400 },
    ];
    const series = balanceSeries(events);
    expect(series.at(-1)).toMatchObject({ spentCents: 5950, receivedCents: 1400, netCents: -4550 });
    expect(balanceSeries([])).toEqual([]);
  });

  it('agrupa gastos por concurso e premiações por faixa sem inventar dados', () => {
    const events = [
      { type: 'ticket', contest: 2, amountCents: 350 },
      { type: 'ticket', contest: 2, amountCents: 350 },
      { type: 'ticket', contest: 3, amountCents: 5600 },
      { type: 'prize', tier: 11, amountCents: 700 },
      { type: 'prize', tier: 13, amountCents: 3500 },
    ];
    expect(contestBars(events)).toEqual([
      { label: '2', valueCents: 700 },
      { label: '3', valueCents: 5600 },
    ]);
    expect(tierBars(events)).toEqual([
      { label: '11', valueCents: 700 },
      { label: '13', valueCents: 3500 },
    ]);
    expect(tierBars(events.filter((event) => event.type === 'ticket'))).toEqual([]);
    expect(chartMax([100, 250])).toBe(300);
    expect(chartMax([])).toBe(1);
  });
});

describe('Fase 5 — carregamento sob demanda', () => {
  it('aplica comandos acumulados quando o módulo 3D fica pronto', async () => {
    const calls = [];
    const instance = {
      extraction: {
        reveal: (...args) => calls.push(['reveal', ...args]),
        reset: (...args) => calls.push(['reset', ...args]),
      },
      startMixing: () => calls.push(['startMixing']),
      setVisualSpeed: (...args) => calls.push(['setSpeed', ...args]),
      setPresentationMode: (...args) => calls.push(['mode', ...args]),
    };
    const deferred = createDeferredVisualization({}, async () => ({
      createVisualization: () => instance,
    }));

    deferred.proxy.extraction.reveal(7, 0);
    deferred.proxy.startMixing();
    deferred.proxy.setVisualSpeed(2);
    expect(calls).toEqual([]);
    expect(deferred.proxy.isReady).toBe(false);

    await deferred.load();
    expect(deferred.proxy.isReady).toBe(true);
    expect(calls).toEqual([
      ['reveal', 7, 0],
      ['startMixing'],
      ['setSpeed', 2],
    ]);
  });
});

describe('Fase 5 — estrutura da interface', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

  it('expõe seis áreas com os IDs existentes preservados', () => {
    for (const id of [
      'aba-sorteio', 'aba-apostas', 'aba-historico',
      'aba-financeiro', 'aba-estatisticas', 'aba-configuracoes',
      'painel-apostas', 'painel-historico', 'painel-financeiro',
      'painel-estatisticas', 'painel-configuracoes',
      'resultados-globo', 'quantidade-bilhetes', 'compra-custo-total',
    ]) {
      expect(html, id).toContain(`id="${id}"`);
    }
    expect(html).toContain('inputmode="numeric"');
    expect(html).toContain('aria-live="polite"');
  });

  it('prevê toque confortável e redução de movimento', () => {
    expect(css).toContain('@media (max-width: 600px)');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(css).toContain('min-height: 2.75rem');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
