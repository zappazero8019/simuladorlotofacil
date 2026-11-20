import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { friendlyError, logTechnicalError } from '../src/ui/errorHandler.js';
import { isWebGlAvailable, webGlFallbackMessage } from '../src/ui/webglSupport.js';
import { createDeferredVisualization } from '../src/ui/deferredVisualization.js';
import { createIndexedDbStore } from '../src/persistence/indexedDbStore.js';
import { createMemoryStore } from '../src/persistence/memoryStore.js';
import { createHistoryService } from '../src/history/service.js';

describe('Fase 6 — tratamento de erros', () => {
  it('mensagens amigáveis para falhas de armazenamento', () => {
    const quota = Object.assign(new Error('falha'), { name: 'QuotaExceededError' });
    expect(friendlyError(quota)).toMatch(/espaço de armazenamento/i);
    expect(friendlyError(new Error('banco bloqueado por outra aba'))).toMatch(/outra aba/);
    expect(friendlyError(new Error('erro interno sensível'))).toMatch(/Não foi possível concluir/);
  });

  it('registro técnico não expõe dados do usuário', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logTechnicalError('compra', new Error('falha'));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[simulador\] compra: Error/));
    expect(warn.mock.calls[0][0]).not.toContain('stack');
    warn.mockRestore();
  });
});

describe('Fase 6 — capacidade WebGL', () => {
  it('detecta ausência de WebGL com segurança', () => {
    const documentRef = { createElement: () => ({ getContext: () => null }) };
    expect(isWebGlAvailable(documentRef)).toBe(false);
  });

  it('proxy não enfileira comandos nem carrega módulo sem WebGL', async () => {
    const importer = vi.fn();
    const unavailable = vi.fn();
    const deferred = createDeferredVisualization({}, importer, {
      available: false,
      onUnavailable: unavailable,
    });
    deferred.proxy.extraction.reveal(1, 0);
    await expect(deferred.load()).resolves.toBeNull();
    expect(importer).not.toHaveBeenCalled();
    expect(deferred.proxy.isUnavailable).toBe(true);
    expect(webGlFallbackMessage()).toMatch(/roleta alternativa/i);
  });
});

describe('Fase 6 — persistência e recuperação', () => {
  it('reabre o banco após versionchange em vez de manter conexão morta', async () => {
    let opens = 0;
    let current = null;
    const factory = {
      open() {
        opens += 1;
        const request = {};
        const database = {
          closed: false,
          close() { this.closed = true; },
          transaction() {
            if (this.closed) throw new Error('InvalidStateError');
            const transaction = {};
            const store = {
              getAll() {
                const getRequest = {};
                queueMicrotask(() => {
                  getRequest.result = [];
                  getRequest.onsuccess?.();
                });
                setTimeout(() => transaction.oncomplete?.(), 0);
                return getRequest;
              },
            };
            transaction.objectStore = () => store;
            return transaction;
          },
        };
        current = database;
        queueMicrotask(() => { request.result = database; request.onsuccess?.(); });
        return request;
      },
    };

    const store = createIndexedDbStore({ factory });
    await store.getAll('settings');
    expect(opens).toBe(1);
    current.onversionchange();
    await store.getAll('settings');
    expect(opens).toBe(2);
  });

  it('rejeita nova tentativa com a mesma clientKey sem duplicar bilhete ou lançamento', async () => {
    const history = createHistoryService({ store: createMemoryStore() });
    await history.initialize();
    const input = {
      numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      quantity: 1,
      clientKey: 'recuperacao-teste',
    };
    const first = await history.buyTickets(input);
    const second = await history.buyTickets(input);
    expect(first.tickets).toHaveLength(1);
    expect(second.tickets).toHaveLength(0);
    expect((await history.getSummary()).ticketCount).toBe(1);
    expect((await history.getEvents({})).items).toHaveLength(1);
  });
});

describe('Fase 6 — distribuição', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

  it('expõe manifesto instalável e service worker sem cache de dados', () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('viewport-fit=cover');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(sw).toContain('CACHE = `simulador-lotofacil-shell-${VERSION}`');
    expect(sw).toContain('fetch(request)');
    const swCode = sw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(swCode).not.toMatch(/indexedDB|caches\.open\([^)]*(tickets|draws|ledger)/i);
  });
});
