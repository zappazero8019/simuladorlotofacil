import { STORE_NAMES, STORE_SCHEMA } from './schema.js';

/** Cópia profunda simples (registros são dados puros, sem funções ou DOM). */
function clone(record) {
  if (record === null || record === undefined) return record;
  if (typeof structuredClone === 'function') return structuredClone(record);
  return JSON.parse(JSON.stringify(record));
}

function recordKey(storeName, record) {
  return record[STORE_SCHEMA[storeName].keyPath];
}

/**
 * Armazenamento em memória com a mesma API assíncrona do adaptador IndexedDB.
 * Usado nos testes (environment: 'node') e como fallback quando o navegador
 * não oferece IndexedDB.
 */
export function createMemoryStore() {
  const data = new Map(STORE_NAMES.map((name) => [name, new Map()]));

  function bucket(name) {
    if (!data.has(name)) data.set(name, new Map());
    return data.get(name);
  }

  function all(name) {
    return [...bucket(name).values()].map(clone);
  }

  function matchesIndex(record, name, index, value) {
    if (!index) return true;
    const path = STORE_SCHEMA[name]?.indexes?.[index];
    if (!path) throw new RangeError(`Índice desconhecido: ${name}.${index}`);
    if (value === undefined) return true;
    return record[path] === value;
  }

  function sorted(name, records, direction) {
    const keyPath = STORE_SCHEMA[name]?.keyPath ?? 'id';
    return [...records].sort((left, right) => {
      const a = left[keyPath];
      const b = right[keyPath];
      const result = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b));
      return direction === 'prev' ? -result : result;
    });
  }

  return {
    kind: 'memory',

    async get(storeName, key) {
      const value = bucket(storeName).get(key);
      return value === undefined ? undefined : clone(value);
    },

    async getAll(storeName) {
      return all(storeName);
    },

    async query(storeName, { index, value, limit, offset = 0, direction = 'next' } = {}) {
      let records = all(storeName).filter((record) => matchesIndex(record, storeName, index, value));
      records = sorted(storeName, records, direction);
      const start = Math.max(0, Number(offset) || 0);
      const size = limit === undefined || limit === null ? records.length : Math.max(0, Number(limit));
      return records.slice(start, start + size);
    },

    async count(storeName, { index, value } = {}) {
      return all(storeName).filter((record) => matchesIndex(record, storeName, index, value)).length;
    },

    async snapshot(storeNames = STORE_NAMES) {
      const result = {};
      for (const name of storeNames) result[name] = all(name);
      return result;
    },

    /**
     * `mutator(tx)` enfileira operações síncronas; todas são aplicadas juntas.
     * Isso reproduz a atomicidade de uma transação IndexedDB.
     */
    async transaction(storeNames, mutator) {
      if (typeof mutator !== 'function') throw new TypeError('mutator deve ser uma função.');
      const operations = [];
      const tx = {
        put(storeName, record) {
          operations.push({ type: 'put', storeName, record: clone(record) });
        },
        putMany(storeName, records) {
          for (const record of records) tx.put(storeName, record);
        },
        delete(storeName, key) {
          operations.push({ type: 'delete', storeName, key });
        },
      };
      const result = await mutator(tx);
      for (const operation of operations) {
        const target = bucket(operation.storeName);
        if (operation.type === 'delete') target.delete(operation.key);
        else target.set(recordKey(operation.storeName, operation.record), operation.record);
      }
      return result;
    },

    async close() {
      data.clear();
    },
  };
}
