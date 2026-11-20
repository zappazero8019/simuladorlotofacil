import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createVisibilityHandler } from '../src/ui/visibility.js';

function makeUi({ pauseResult = true } = {}) {
  return {
    audio: { pause: vi.fn(), resume: vi.fn() },
    show: { pause: vi.fn(() => pauseResult), resume: vi.fn(() => true) },
  };
}

describe('suspensão por troca de aba', () => {
  it('pausa áudio e apresentação ao ocultar e retoma ao voltar', () => {
    const ui = makeUi();
    const doc = { hidden: true };
    const handle = createVisibilityHandler(ui, doc);

    expect(handle()).toEqual({ hidden: true, paused: true });
    expect(ui.audio.pause).toHaveBeenCalledWith('aba');
    expect(ui.show.pause).toHaveBeenCalledTimes(1);

    doc.hidden = false;
    expect(handle()).toEqual({ hidden: false, paused: false });
    expect(ui.audio.resume).toHaveBeenCalledWith('aba');
    expect(ui.show.resume).toHaveBeenCalledTimes(1);
  });

  it('não retoma apresentação que já estava parada', () => {
    const ui = makeUi({ pauseResult: false });
    const doc = { hidden: true };
    const handle = createVisibilityHandler(ui, doc);

    handle();
    doc.hidden = false;
    handle();

    expect(ui.show.resume).not.toHaveBeenCalled();
    expect(ui.audio.resume).toHaveBeenCalledWith('aba');
  });

  it('retoma apenas uma vez mesmo com eventos repetidos', () => {
    const ui = makeUi();
    const doc = { hidden: true };
    const handle = createVisibilityHandler(ui, doc);

    handle();
    handle();
    expect(ui.show.pause).toHaveBeenCalledTimes(2);
    doc.hidden = false;
    handle();
    handle();
    expect(ui.show.resume).toHaveBeenCalledTimes(1);
  });

  it('não gera resultado nem mexe em finanças', () => {
    const source = readFileSync(new URL('../src/ui/visibility.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/draw|random|prize|balance|history/i);
  });
});
