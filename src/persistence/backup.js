import { DB_VERSION, STORE_NAMES, STORE_SCHEMA } from './schema.js';

export const BACKUP_FORMAT = 'simulador-lotofacil-backup';
export const BACKUP_VERSION = 1;

/** Exportação completa e versionada do banco. */
export async function exportBackup(store, { now = () => new Date().toISOString() } = {}) {
  const data = {};
  for (const name of STORE_NAMES) data[name] = await store.getAll(name);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    databaseVersion: DB_VERSION,
    exportedAt: now(),
    counts: Object.fromEntries(STORE_NAMES.map((name) => [name, data[name].length])),
    data,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validação rígida antes de qualquer importação. */
export function validateBackup(payload) {
  if (!isPlainObject(payload)) throw new TypeError('Backup inválido: objeto esperado.');
  if (payload.format !== BACKUP_FORMAT) throw new TypeError('Formato de backup desconhecido.');
  if (payload.version !== BACKUP_VERSION) {
    throw new RangeError(`Versão de backup não suportada: ${String(payload.version)}.`);
  }
  if (!isPlainObject(payload.data)) throw new TypeError('Backup inválido: falta `data`.');
  for (const name of STORE_NAMES) {
    const records = payload.data[name];
    if (records !== undefined && !Array.isArray(records)) {
      throw new TypeError(`Backup inválido: ${name} deve ser uma lista.`);
    }
    for (const record of records ?? []) {
      if (!isPlainObject(record)) throw new TypeError(`Registro inválido em ${name}.`);
      const keyPath = STORE_SCHEMA[name].keyPath;
      const key = record[keyPath];
      if (typeof key !== 'string' || !key) {
        throw new TypeError(`Registro de ${name} sem chave ${keyPath} válida.`);
      }
    }
  }
  return payload;
}

/**
 * Mesclagem segura: registros de domínio somente se a chave ainda não existe.
 * `meta` e `settings` são restaurados do backup porque um reset recria essas
 * chaves com valores padrão: mantê-las faria a importação perder concurso,
 * sequência e prêmios configurados. Nenhum dado de domínio é apagado.
 */
const RESTORED_STORES = new Set(['meta', 'settings']);

export async function mergeBackup(store, payload) {
  const valid = validateBackup(payload);
  const existing = await store.snapshot(STORE_NAMES);
  const added = {};
  for (const name of STORE_NAMES) {
    const incoming = valid.data[name] ?? [];
    if (RESTORED_STORES.has(name) && incoming.length) {
      added[name] = incoming;
      continue;
    }
    const keys = new Set(existing[name].map((record) => record[STORE_SCHEMA[name].keyPath]));
    added[name] = incoming.filter(
      (record) => !keys.has(record[STORE_SCHEMA[name].keyPath]),
    );
  }

  await store.transaction(STORE_NAMES, (tx) => {
    for (const name of STORE_NAMES) {
      if (added[name].length) tx.putMany(name, added[name]);
    }
  });

  return {
    mode: 'merge',
    added: Object.fromEntries(STORE_NAMES.map((name) => [name, added[name].length])),
    skippedDuplicate: Object.fromEntries(STORE_NAMES.map((name) => [
      name,
      (valid.data[name] ?? []).length - added[name].length,
    ])),
  };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Relatório CSV do ledger (centavos inteiros, sem conversão float). */
export function exportLedgerCsv(events = []) {
  const columns = [
    'seq', 'createdAt', 'type', 'key', 'contest', 'size', 'tier',
    'amountCents', 'ticketId', 'conferenceId', 'drawId', 'batchId',
  ];
  const lines = [columns.join(',')];
  for (const event of events) {
    lines.push(columns.map((column) => escapeCsv(event[column])).join(','));
  }
  return lines.join('\r\n');
}
