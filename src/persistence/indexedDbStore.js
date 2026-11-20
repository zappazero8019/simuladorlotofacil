import { DB_NAME, DB_VERSION, migrate, STORE_SCHEMA } from './schema.js';

function clone(record) {
  if (record === null || record === undefined) return record;
  if (typeof structuredClone === 'function') return structuredClone(record);
  return JSON.parse(JSON.stringify(record));
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Verifica disponibilidade sem abrir o banco. */
export function isIndexedDbAvailable(factory = globalThis.indexedDB) {
  return Boolean(factory && typeof factory.open === 'function');
}

/**
 * Adaptador IndexedDB. Nenhuma escrita parcial: todas as operações de uma
 * transação lógica são enfileiradas e emitidas em uma única transação nativa.
 */
export function createIndexedDbStore({
  name = DB_NAME,
  version = DB_VERSION,
  factory = globalThis.indexedDB,
} = {}) {
  if (!isIndexedDbAvailable(factory)) {
    throw new Error('IndexedDB não está disponível neste ambiente.');
  }

  let databasePromise = null;

  function open() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        let request;
        try {
          request = factory.open(name, version);
        } catch (error) {
          reject(error);
          return;
        }
        request.onupgradeneeded = (event) => {
          migrate(event.target.result, event.target.transaction, event.oldVersion, version);
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => {
            database.close();
            databasePromise = null;
          };
          database.onclose = () => { databasePromise = null; };
          resolve(database);
        };
        request.onerror = () => {
          databasePromise = null;
          reject(request.error);
        };
        request.onblocked = () => {
          databasePromise = null;
          reject(new Error('Banco bloqueado por outra aba.'));
        };
      });
    }
    return databasePromise;
  }

  async function run(storeName, mode, callback) {
    const database = await open();
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = await callback(store, transaction);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Transação abortada.'));
    });
    return result;
  }

  return {
    kind: 'indexeddb',
    name,

    async get(storeName, key) {
      const value = await run(storeName, 'readonly', (store) => requestAsPromise(store.get(key)));
      return value === undefined ? undefined : clone(value);
    },

    async getAll(storeName) {
      const values = await run(storeName, 'readonly', (store) => requestAsPromise(store.getAll()));
      return values.map(clone);
    },

    async query(storeName, { index, value, limit, offset = 0, direction = 'next' } = {}) {
      return run(storeName, 'readonly', async (store) => {
        const source = index ? store.index(index) : store;
        const range = value === undefined ? null : IDBKeyRange.only(value);
        const start = Math.max(0, Number(offset) || 0);
        const size = limit === undefined || limit === null ? Infinity : Math.max(0, Number(limit));
        const results = [];
        return new Promise((resolve, reject) => {
          const request = source.openCursor(range, direction);
          let skipped = 0;
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || results.length >= size) {
              resolve(results.map(clone));
              return;
            }
            if (skipped < start) {
              skipped += 1;
              cursor.continue();
              return;
            }
            results.push(cursor.value);
            if (results.length >= size) {
              resolve(results.map(clone));
              return;
            }
            cursor.continue();
          };
          request.onerror = () => reject(request.error);
        });
      });
    },

    async count(storeName, { index, value } = {}) {
      return run(storeName, 'readonly', (store) => {
        const source = index ? store.index(index) : store;
        const range = value === undefined ? null : IDBKeyRange.only(value);
        return requestAsPromise(source.count(range));
      });
    },

    async snapshot(storeNames) {
      const result = {};
      for (const storeName of storeNames) result[storeName] = await this.getAll(storeName);
      return result;
    },

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
      let result;
      try {
        result = await mutator(tx);
      } catch (error) {
        throw error;
      }
      for (const storeName of storeNames) {
        if (!STORE_SCHEMA[storeName]) throw new RangeError(`Store desconhecida: ${storeName}.`);
      }

      const database = await open();
      return new Promise((resolve, reject) => {
        let transaction;
        try {
          transaction = database.transaction(storeNames, 'readwrite');
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('Transação abortada.'));
        try {
          for (const operation of operations) {
            const store = transaction.objectStore(operation.storeName);
            if (operation.type === 'delete') store.delete(operation.key);
            else store.put(operation.record);
          }
        } catch (error) {
          try { transaction.abort(); } catch { /* já abortada */ }
          reject(error);
        }
      });
    },

    async close() {
      if (!databasePromise) return;
      const database = await databasePromise;
      database.close();
      databasePromise = null;
    },
  };
}
