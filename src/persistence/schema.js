/**
 * Esquema único do banco local. Usado tanto pelo adaptador IndexedDB quanto
 * pelo adaptador em memória (testes), evitando divergência de índices.
 *
 * Nenhuma store é apagada em atualizações: `onupgradeneeded` apenas cria o que
 * ainda não existe.
 */
export const DB_NAME = 'simulador-lotofacil';
export const DB_VERSION = 1;

export const STORE_NAMES = Object.freeze([
  'tickets',
  'draws',
  'sessions',
  'teimosinha',
  'pools',
  'conferences',
  'prizes',
  'financialEvents',
  'aggregates',
  'settings',
  'meta',
]);

/** Chave e índices de cada store. */
export const STORE_SCHEMA = Object.freeze({
  tickets: {
    keyPath: 'id',
    indexes: {
      byBatch: 'batchId',
      byContest: 'contest',
      byCreatedAt: 'createdAt',
      bySize: 'size',
      byPersistentKey: 'persistentKey',
    },
  },
  draws: {
    keyPath: 'id',
    indexes: { byContest: 'contest', bySession: 'sessionId', byCreatedAt: 'createdAt' },
  },
  sessions: {
    keyPath: 'id',
    indexes: { byCreatedAt: 'createdAt' },
  },
  teimosinha: {
    keyPath: 'id',
    indexes: { byTicket: 'ticketId', byContest: 'contest' },
  },
  pools: {
    keyPath: 'id',
    indexes: { byTicket: 'ticketId' },
  },
  conferences: {
    keyPath: 'id',
    indexes: {
      byTicket: 'ticketId',
      byContest: 'contest',
      byDraw: 'drawId',
      byCreatedAt: 'createdAt',
    },
  },
  prizes: {
    keyPath: 'id',
    indexes: { byConference: 'conferenceId', byTier: 'tier', byContest: 'contest' },
  },
  financialEvents: {
    keyPath: 'id',
    indexes: {
      byKey: 'key',
      byType: 'type',
      byContest: 'contest',
      bySize: 'size',
      byTier: 'tier',
      byCreatedAt: 'createdAt',
      bySeq: 'seq',
    },
    uniqueIndexes: ['byKey'],
  },
  aggregates: { keyPath: 'key', indexes: {} },
  settings: { keyPath: 'key', indexes: {} },
  meta: { keyPath: 'key', indexes: {} },
});

export const SETTINGS_KEYS = Object.freeze({
  MAX_PRIZE_15: 'maxPrize15Cents',
  PRIZE_14: 'prize14Cents',
  MUSIC_ENABLED: 'musicEnabled',
  SFX_ENABLED: 'sfxEnabled',
  MUSIC_VOLUME: 'musicVolume',
  SFX_VOLUME: 'sfxVolume',
  TEST_MODE_ENABLED: 'testModeEnabled',
  TEST_PROBABILITY: 'testProbabilityPercent',
});

export const DEFAULT_SETTINGS = Object.freeze({
  [SETTINGS_KEYS.MAX_PRIZE_15]: 50000000,
  [SETTINGS_KEYS.PRIZE_14]: 189635,
  [SETTINGS_KEYS.MUSIC_ENABLED]: true,
  [SETTINGS_KEYS.SFX_ENABLED]: true,
  [SETTINGS_KEYS.MUSIC_VOLUME]: 45,
  [SETTINGS_KEYS.SFX_VOLUME]: 70,
  [SETTINGS_KEYS.TEST_MODE_ENABLED]: false,
  [SETTINGS_KEYS.TEST_PROBABILITY]: 25,
});

/**
 * Cria stores e índices ausentes sem apagar nada. Seguro para versões futuras.
 */
export function migrate(database, transaction, oldVersion = 0, newVersion = DB_VERSION) {
  if (!database || !transaction) throw new TypeError('database e transaction são obrigatórios.');
  for (const name of STORE_NAMES) {
    if (!database.objectStoreNames.contains(name)) {
      database.createObjectStore(name, { keyPath: STORE_SCHEMA[name].keyPath });
    }
  }

  for (const name of STORE_NAMES) {
    const store = transaction.objectStore(name);
    const definition = STORE_SCHEMA[name];
    for (const [indexName, keyPath] of Object.entries(definition.indexes)) {
      if (!store.indexNames.contains(indexName)) {
        store.createIndex(indexName, keyPath, {
          unique: (definition.uniqueIndexes ?? []).includes(indexName),
        });
      }
    }
  }

  return { oldVersion, newVersion, createdStores: STORE_NAMES.length };
}
