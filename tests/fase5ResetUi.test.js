import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDrawSession } from '../src/draws/session.js';
import { createShowController } from '../src/draws/show.js';

const validNumbers = Array.from({ length: 15 }, (_, index) => index + 1);

describe('Reiniciar simulação — apresentação', () => {
  it('limpa o resultado sem gerar um novo sorteio', () => {
    const session = createDrawSession();
    session.setResult(validNumbers);
    const generation = session.generation;
    session.clear();
    expect(session.hasResult()).toBe(false);
    expect(session.getResult()).toBeNull();
    expect(session.getFrozenResult()).toBeNull();
    expect(session.generation).toBe(generation);
  });

  it('show.clear() zera reveal sem alterar modo, ritmo ou velocidade', () => {
    const session = createDrawSession();
    session.setResult(validNumbers);
    const views = { globo: { reset: () => {}, setSpeed: () => {} } };
    const show = createShowController({ session, views });
    show.setSpeed(3);
    show.setPresentationMode('acelerado');
    show.start();
    show.revealAll();
    expect(show.getState().revealed).toBe(15);

    show.clear();
    const state = show.getState();
    expect(state.revealed).toBe(0);
    expect(state.result).toBeNull();
    expect(state.playing).toBe(false);
    expect(state.speed).toBe(3);
    expect(state.presentationMode).toBe('acelerado');
    expect(state.mode).toBe('globo');
    show.dispose();
  });
});

describe('Reiniciar simulação — confirmação na interface', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('exige confirmação em duas etapas com aviso integral', () => {
    expect(html).toContain('id="reiniciar-simulacao"');
    expect(html).toContain('id="modal-reset"');
    expect(html).toContain('aria-modal="true"');
    for (const phrase of [
      'apagará permanentemente todos os bilhetes, sorteios, resultados, investimentos, premiações, histórico financeiro e estatísticas',
      'Suas configurações e preferências pessoais serão preservadas.',
      'Esta operação não poderá ser desfeita.',
    ]) {
      expect(html).toContain(phrase);
    }
    expect(html).toContain('Digite <code>REINICIAR</code> para confirmar');
    expect(html).toContain('id="modal-reset-cancelar"');
    expect(html).toContain('id="modal-reset-confirmar-btn"');
    expect(html).toMatch(/modal-reset-confirmar-btn[^>]*disabled/);
  });
});
