import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAppStateHandler,
  createBackHandler,
  isAndroidPlatform,
} from '../src/androidBridge.js';

const capacitorOriginal = globalThis.Capacitor;

afterEach(() => {
  globalThis.Capacitor = capacitorOriginal;
});

function fakeDoc({ modalHidden = true, activeArea = 'sorteio' } = {}) {
  const cancel = vi.fn();
  const modal = { hidden: modalHidden };
  return {
    cancel,
    querySelector(selector) {
      if (selector === '#modal-reset') return modal;
      if (selector === '#modal-reset-cancelar') return { click: cancel };
      if (selector === '.aba.ativa') return { dataset: { area: activeArea } };
      return null;
    },
  };
}

describe('Fase 8 — ponte Android', () => {
  it('detecta apenas a plataforma Android nativa', () => {
    expect(isAndroidPlatform(undefined)).toBe(false);
    expect(isAndroidPlatform({ isNativePlatform: () => false, getPlatform: () => 'android' })).toBe(false);
    expect(isAndroidPlatform({ isNativePlatform: () => true, getPlatform: () => 'android' })).toBe(true);
    expect(isAndroidPlatform({ isNativePlatform: () => true, getPlatform: () => 'web' })).toBe(false);
  });

  it('cancela o modal de reset antes de qualquer saída', () => {
    const doc = fakeDoc({ modalHidden: false, activeArea: 'historico' });
    const showTab = vi.fn();
    const exitApp = vi.fn();
    const result = createBackHandler({ ui: { showTab }, app: { exitApp }, doc })();

    expect(result).toBe('modal');
    expect(doc.cancel).toHaveBeenCalledOnce();
    expect(showTab).not.toHaveBeenCalled();
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('volta para a aba inicial e só encerra na aba inicial', () => {
    const showTab = vi.fn();
    const exitApp = vi.fn(() => Promise.resolve());
    const doc = fakeDoc({ activeArea: 'financeiro' });

    expect(createBackHandler({ ui: { showTab }, app: { exitApp }, doc })()).toBe('aba');
    expect(showTab).toHaveBeenCalledWith('sorteio');
    expect(exitApp).not.toHaveBeenCalled();

    const initial = fakeDoc({ activeArea: 'sorteio' });
    expect(createBackHandler({ ui: { showTab }, app: { exitApp }, doc: initial })()).toBe('saida');
    expect(exitApp).toHaveBeenCalledOnce();
  });

  it('suspende e retoma somente uma pausa causada pelo Android', () => {
    const pause = vi.fn(() => true);
    const resume = vi.fn(() => true);
    const handler = createAppStateHandler({ show: { pause, resume } });

    handler({ isActive: false });
    expect(pause).toHaveBeenCalledOnce();
    handler({ isActive: true });
    expect(resume).toHaveBeenCalledOnce();

    pause.mockReturnValue(false);
    handler({ isActive: false });
    handler({ isActive: true });
    expect(resume).toHaveBeenCalledOnce();
  });
});
