import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/persistence/memoryStore.js';
import { createIdFactory, ticketEventKey, prizeEventKey } from '../src/persistence/ids.js';
import { migrate, STORE_NAMES, DB_VERSION } from '../src/persistence/schema.js';
import { isIndexedDbAvailable } from '../src/persistence/indexedDbStore.js';

function makeFakeObjectStore() {
  const names = new Set();
  return {
    keyPath: 'id',
    indexNames: { contains: (name) => names.has(name) },
    createIndex(name) { names.add(name); },
    hasIndex: (name) => names.has(name),
  };
}

function fakeStore(names = []) {
  const stores = new Map(names.map((name) => [name, makeFakeObjectStore()]));
  return {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) { stores.set(name, makeFakeObjectStore()); },
    transaction: { objectStore: (name) => stores.get(name) },
    stores,
  };
}

describe('Fase 4 — persistência', () => {
  it('gera IDs únicos e chaves de idempotência', () => {
    const next = createIdFactory('ticket');
    const ids = new Set(Array.from({ length: 1000 }, () => next()));
    expect(ids.size).toBe(1000);
    expect([...ids][0]).toMatch(/^ticket_/);
    expect(ticketEventKey('abc')).toBe('ticket:abc');
    expect(prizeEventKey('c1', 15)).toBe('prize:c1:15');
  });

  it('cria stores e índices ausentes sem apagar existentes', () => {
    const database = fakeStore(['tickets']);
    const result = migrate(database, database.transaction, 0, DB_VERSION);
    expect(result.createdStores).toBe(STORE_NAMES.length);
    expect(database.stores.has('tickets')).toBe(true);
    expect(database.stores.get('tickets').hasIndex('byContest')).toBe(true);
    expect(database.stores.get('financialEvents').hasIndex('byKey')).toBe(true);
  });

  it('memória mantém consulta indexada, contagem e paginação', async () => {
    const store = createMemoryStore();
    await store.transaction(['tickets'], (tx) => {
      tx.putMany('tickets', [
        { id: 'a', contest: 1, size: 15, createdAt: '2026-01-01' },
        { id: 'b', contest: 1, size: 16, createdAt: '2026-01-02' },
        { id: 'c', contest: 2, size: 15, createdAt: '2026-01-03' },
      ]);
    });
    expect(await store.count('tickets', { index: 'byContest', value: 1 })).toBe(2);
    expect((await store.query('tickets', { index: 'bySize', value: 15 })).map((r) => r.id))
      .toEqual(['a', 'c']);
    expect((await store.query('tickets', { limit: 1, offset: 1, direction: 'prev' }))
      .map((r) => r.id)).toEqual(['b']);
  });

  it('detecta indisponibilidade de IndexedDB sem lançar', () => {
    expect(isIndexedDbAvailable(null)).toBe(false);
    expect(isIndexedDbAvailable({ open() {} })).toBe(true);
  });
});
