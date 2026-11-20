import { validateDraw, validateBet } from '../core/validation.js';
import { countCombinations } from '../core/combinatorics.js';
import {
  conferenceBet,
  createPool,
  generateSurpresinha,
  getBetPriceCents,
  isTeimosinhaContestCount,
  validatePoolShares,
} from '../bets/index.js';
import { resolvePrizeValueOverrides } from '../prizes/prizeValues.js';
import {
  buildPrizeEvents,
  createAggregate,
  createFinancialState,
  applyEvent,
} from '../finance/index.js';
import { filterRecords, paginate, sortChronologically } from './index.js';
import { computeStatistics } from '../statistics/index.js';
import { createIdFactory, ticketEventKey } from '../persistence/ids.js';
import {
  DEFAULT_SETTINGS,
  DB_VERSION,
  STORE_NAMES,
  STORE_SCHEMA,
} from '../persistence/schema.js';
import { normalizePreference } from '../settings/preferences.js';
import {
  exportBackup,
  exportLedgerCsv,
  mergeBackup,
} from '../persistence/backup.js';

const AGGREGATE_PREFIXES = ['totals', 'contest:', 'size:', 'tier:'];

/** Stores que contêm exclusivamente dados da simulação. */
const SIMULATION_STORES = Object.freeze(
  STORE_NAMES.filter((name) => name !== 'settings' && name !== 'meta'),
);

/** Serializa mutações para evitar corrida na leitura do `seq`. */
function createMutex() {
  let tail = Promise.resolve();
  return function withLock(task) {
    const result = tail.then(task, task);
    tail = result.catch(() => {});
    return result;
  };
}

/**
 * Trava síncrona de reset: qualquer mutação iniciada enquanto o reset está em
 * andamento é recusada antes mesmo de entrar na fila do mutex.
 */
function createResetGate() {
  let active = false;
  return {
    get active() {
      return active;
    },
    lock() {
      if (active) throw new Error('Um reset já está em andamento.');
      active = true;
    },
    unlock() {
      active = false;
    },
    assertWritable() {
      if (active) throw new Error('Aguarde o término do reinício da simulação.');
    },
  };
}

function toAggregateState(records) {
  const byKey = Object.fromEntries(records.map((record) => [record.key, record]));
  const strip = (prefix) => Object.fromEntries(
    Object.entries(byKey)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  );
  return {
    totals: byKey.totals ?? createAggregate(),
    contests: strip('contest:'),
    bySize: strip('size:'),
    byTier: strip('tier:'),
    sequence: byKey.sequence?.value ?? 0,
  };
}

function aggregateRecords(state) {
  const records = [{ key: 'totals', ...state.totals }];
  for (const [key, value] of Object.entries(state.contests)) records.push({ key: `contest:${key}`, ...value });
  for (const [key, value] of Object.entries(state.bySize)) records.push({ key: `size:${key}`, ...value });
  for (const [key, value] of Object.entries(state.byTier)) records.push({ key: `tier:${key}`, ...value });
  return records.filter((record) => AGGREGATE_PREFIXES.some((prefix) => record.key.startsWith(prefix)));
}

/**
 * Serviço de histórico. Toda mutação relevante grava bilhete, ledger e
 * agregados na MESMA transação do armazenamento.
 */
export function createHistoryService({
  store,
  idFactory = createIdFactory(),
  now = () => new Date().toISOString(),
  random = Math.random,
} = {}) {
  if (!store || typeof store.transaction !== 'function') {
    throw new TypeError('store com suporte a transações é obrigatório.');
  }
  const withLock = createMutex();
  const resetGate = createResetGate();

  function writableLock(task) {
    // Verificação síncrima: mutateções iniciadas após o travamento são recusadas
    // antes de entrar na fila, mesmo que o reset ainda esteja processando.
    resetGate.assertWritable();
    return withLock(async () => {
      resetGate.assertWritable();
      return task();
    });
  }

  async function readControl() {
    const [metaRows, settingsRows, aggregateRows] = await Promise.all([
      store.getAll('meta'),
      store.getAll('settings'),
      store.getAll('aggregates'),
    ]);
    return {
      meta: Object.fromEntries(metaRows.map((row) => [row.key, row.value])),
      settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value])),
      aggregateState: toAggregateState(aggregateRows),
    };
  }

  function prizeValuesFrom(settings) {
    return resolvePrizeValueOverrides({
      maxPrize15Cents: settings.maxPrize15Cents ?? DEFAULT_SETTINGS.maxPrize15Cents,
      prize14Cents: settings.prize14Cents ?? DEFAULT_SETTINGS.prize14Cents,
    });
  }

  async function initialize() {
    return withLock(async () => {
      const [metaRows, settingsRows, aggregateRows] = await Promise.all([
        store.getAll('meta'), store.getAll('settings'), store.getAll('aggregates'),
      ]);
      const metaKeys = new Set(metaRows.map((row) => row.key));
      const settingKeys = new Set(settingsRows.map((row) => row.key));
      const aggregateKeys = new Set(aggregateRows.map((row) => row.key));
      const createdAt = now();
      const puts = [];

      if (!metaKeys.has('schema')) {
        puts.push(['meta', { key: 'schema', value: DB_VERSION, createdAt }]);
      }
      if (!metaKeys.has('sequence')) puts.push(['meta', { key: 'sequence', value: 0 }]);
      if (!metaKeys.has('currentContest')) puts.push(['meta', { key: 'currentContest', value: 1 }]);
      if (!metaKeys.has('nextDisplayId')) puts.push(['meta', { key: 'nextDisplayId', value: 1 }]);
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (!settingKeys.has(key)) puts.push(['settings', { key, value, updatedAt: createdAt }]);
      }
      if (!aggregateKeys.has('totals')) {
        puts.push(['aggregates', { key: 'totals', ...createAggregate() }]);
      }

      if (puts.length) {
        await store.transaction(['meta', 'settings', 'aggregates'], (tx) => {
          for (const [name, record] of puts) tx.put(name, record);
        });
      }
      return getSummary();
    });
  }

  function normalizePurchaseSpecs(input) {
    const items = Array.isArray(input.items) ? input.items : [input];
    const repeat = input.items ? 1 : Math.max(1, Math.floor(Number(input.quantity ?? 1)));
    if (!Number.isSafeInteger(repeat) || repeat < 1) {
      throw new RangeError('Quantidade de bilhetes inválida.');
    }
    const specs = [];
    for (const item of items) {
      for (let index = 0; index < repeat; index += 1) {
        const numbers = item.numbers
          ? validateBet(item.numbers)
          : generateSurpresinha(Number(item.size ?? 15), random);
        const size = numbers.length;
        const contests = Number(item.contests ?? 1);
        if (contests !== 1 && !isTeimosinhaContestCount(contests)) {
          throw new RangeError('Quantidade de concursos inválida.');
        }
        let pool = null;
        if (item.pool) {
          const shares = validatePoolShares(size, Number(item.pool.shares));
          pool = createPool({
            betSize: size,
            totalCents: getBetPriceCents(size),
            shares,
            participants: item.pool.participants,
          });
        }
        specs.push({ numbers, size, contests, pool });
      }
    }
    if (!specs.length) throw new RangeError('Nenhum bilhete informado.');
    return specs;
  }

  async function buyTickets(input = {}) {
    return writableLock(async () => {
      const specs = normalizePurchaseSpecs(input);
      const control = await readControl();
      const contest = Number(input.contest ?? control.meta.currentContest ?? 1);
      const createdAt = now();
      const batchId = input.batchId ?? idFactory('batch');
      const prizeValues = prizeValuesFrom(control.settings);
      const existingKeys = new Set(
        (await store.query('tickets', { index: 'byPersistentKey' }))
          .map((ticket) => ticket.persistentKey),
      );

      let seq = control.meta.sequence ?? 0;
      let displayId = control.meta.nextDisplayId ?? 1;
      const tickets = [];
      const events = [];
      const poolRecords = [];
      const teimosinhaRecords = [];
      const skipped = [];

      for (const [specIndex, spec] of specs.entries()) {
        const id = idFactory('ticket');
        const persistentKey = input.clientKey
          ? `client:${input.clientKey}:${specIndex}`
          : ticketEventKey(id);
        if (existingKeys.has(persistentKey)) {
          skipped.push(persistentKey);
          continue;
        }
        existingKeys.add(persistentKey);
        seq += 1;
        const ticket = {
          id,
          persistentId: id,
          persistentKey,
          displayId,
          batchId,
          contest,
          numbers: [...spec.numbers],
          size: spec.size,
          priceCents: getBetPriceCents(spec.size),
          combinations: countCombinations(spec.size),
          contests: spec.contests,
          pool: spec.pool,
          results: Array.from({ length: spec.contests }, () => null),
          conferenceCount: 0,
          prizeValues: { ...prizeValues },
          createdAt,
          sequence: seq,
          clientKey: input.clientKey ?? null,
        };
        displayId += 1;
        tickets.push(ticket);
        poolRecords.push({
          id: idFactory('pool'),
          ticketId: id,
          shares: spec.pool?.shares ?? null,
          shareCents: spec.pool?.shareCents ?? null,
          members: spec.pool?.members ?? [],
          createdAt,
        });
        if (spec.contests > 1) {
          teimosinhaRecords.push({
            id: idFactory('teimosinha'),
            ticketId: id,
            contest,
            contests: spec.contests,
            createdAt,
          });
        }
        events.push({
          id: idFactory('event'),
          key: ticketEventKey(id),
          type: 'ticket',
          amountCents: ticket.priceCents,
          contest,
          size: spec.size,
          tier: null,
          ticketId: id,
          conferenceId: null,
          drawId: null,
          batchId,
          seq,
          createdAt,
        });
      }

      if (tickets.length) {
        let aggregateState = control.aggregateState;
        for (const event of events) aggregateState = applyEvent(aggregateState, event);
        const aggregateUpdates = aggregateRecords(aggregateState);
        const metaUpdates = [
          ['sequence', seq],
          ['nextDisplayId', displayId],
        ];
        await store.transaction(
          ['tickets', 'pools', 'teimosinha', 'financialEvents', 'aggregates', 'meta'],
          (tx) => {
            tx.putMany('tickets', tickets);
            tx.putMany('pools', poolRecords);
            tx.putMany('teimosinha', teimosinhaRecords);
            tx.putMany('financialEvents', events);
            for (const record of aggregateUpdates) tx.put('aggregates', record);
            for (const [key, value] of metaUpdates) tx.put('meta', { key, value });
          },
        );
      }
      return { tickets, events, batchId, skippedDuplicates: skipped.length, contest };
    });
  }

  async function registerDraw(input = {}) {
    return writableLock(async () => {
      const numbers = validateDraw(input.draw ?? input.numbers);
      const control = await readControl();
      const contest = Number(input.contest ?? control.meta.currentContest ?? 1);
      const existing = await store.query('draws', { index: 'byContest', value: contest });
      const duplicate = existing.find(
        (draw) => JSON.stringify(draw.numbers) === JSON.stringify([...numbers]),
      );
      if (duplicate) return { draw: duplicate, created: false };

      // Um mesmo resultado (geração da sessão) pode ser registrado pelo evento
      // automático de conferência e pela conferência manual. A geração identifica
      // o sorteio mesmo quando o concurso já avançou, evitando concursos-fantasma.
      const generation = Number(input.generation);
      if (input.sessionId && Number.isSafeInteger(generation) && generation > 0) {
        const sameGeneration = (await store.query('draws', {
          index: 'bySession',
          value: input.sessionId,
        })).find((draw) => draw.generation === generation);
        if (sameGeneration) return { draw: sameGeneration, created: false };
      }

      const seq = (control.meta.sequence ?? 0) + 1;
      const createdAt = now();
      const draw = {
        id: idFactory('draw'),
        contest,
        sessionId: input.sessionId ?? null,
        mode: input.mode ?? null,
        generation: input.generation ?? null,
        numbers: [...numbers],
        createdAt,
        sequence: seq,
      };
      const puts = [];
      puts.push(['meta', { key: 'sequence', value: seq }]);
      puts.push(['meta', { key: 'currentContest', value: contest + 1 }]);
      if (input.sessionId) {
        puts.push(['sessions', {
          id: input.sessionId,
          contest,
          mode: input.mode ?? null,
          startedAt: input.startedAt ?? createdAt,
          endedAt: createdAt,
          generation: input.generation ?? null,
        }]);
      }
      await store.transaction(['draws', 'sessions', 'meta'], (tx) => {
        tx.put('draws', draw);
        for (const [name, record] of puts) tx.put(name, record);
      });
      return { draw, created: true };
    });
  }

  /** Conferência persistente: uma premiação por (bilhete, concurso, sorteio). */
  async function conferTickets(input = {}) {
    return writableLock(async () => {
      const draw = validateDraw(input.draw ?? input.numbers);
      const drawId = input.drawId ?? null;
      const contest = Number(input.contest ?? 1);
      const candidates = (input.tickets ?? []).filter(
        (ticket) => ticket?.id && (ticket.persistentId || ticket.persistentKey),
      );
      if (!candidates.length) return { conferences: [], events: [], prizes: [] };

      const control = await readControl();
      const existing = drawId
        ? await store.query('conferences', { index: 'byDraw', value: drawId })
        : await store.query('conferences', { index: 'byContest', value: contest });
      const conferenced = new Set(
        existing.map((item) => `${item.ticketId}:${item.contest}`),
      );
      const createdAt = now();
      let seq = control.meta.sequence ?? 0;
      const conferences = [];
      const prizes = [];
      const events = [];
      const teimosinhaUpdates = [];

      for (const ticket of candidates) {
        const ticketId = ticket.persistentId ?? ticket.persistentKey ?? ticket.id;
        if (conferenced.has(`${ticketId}:${contest}`)) continue;
        conferenced.add(`${ticketId}:${contest}`);

        const conference = conferenceBet(ticket, draw, {
          contest,
          prizeValues: ticket.prizeValues ?? prizeValuesFrom(control.settings),
        });
        seq += 1;
        Object.assign(conference, {
          id: idFactory('conference'),
          ticketId,
          betId: ticket.id,
          drawId,
          createdAt,
          sequence: seq,
          prizeValues: { ...(ticket.prizeValues ?? prizeValuesFrom(control.settings)) },
        });
        conferences.push(conference);

        const prizeEvents = buildPrizeEvents({
          conference,
          contest,
          drawId,
          size: ticket.size ?? ticket.numbers?.length ?? null,
          seqStart: seq,
          now: createdAt,
          idFactory,
        });
        for (const event of prizeEvents) {
          events.push(event);
          prizes.push({
            id: event.id,
            conferenceId: conference.id,
            ticketId,
            tier: event.tier,
            count: conference.prizeByTier[event.tier]?.count ?? 1,
            unitCents: conference.prizeByTier[event.tier]?.unitCents ?? event.amountCents,
            subtotalCents: event.amountCents,
            contest,
            createdAt,
            sequence: event.seq,
          });
        }
        seq += prizeEvents.length;
        if (ticket.contests > 1) {
          teimosinhaUpdates.push({
            id: idFactory('teimosinha-contest'),
            ticketId,
            contest,
            conferenceId: conference.id,
            drawId,
            createdAt,
          });
        }
      }

      if (conferences.length) {
        let aggregateState = control.aggregateState;
        for (const event of events) aggregateState = applyEvent(aggregateState, event);
        const aggregateUpdates = aggregateRecords(aggregateState);
        await store.transaction(
          ['conferences', 'prizes', 'financialEvents', 'teimosinha', 'aggregates', 'meta'],
          (tx) => {
            tx.putMany('conferences', conferences);
            tx.putMany('prizes', prizes);
            tx.putMany('financialEvents', events);
            tx.putMany('teimosinha', teimosinhaUpdates);
            for (const record of aggregateUpdates) tx.put('aggregates', record);
            tx.put('meta', { key: 'sequence', value: seq });
          },
        );
      }
      return { conferences, events, prizes };
    });
  }

  async function getSummary() {
    const control = await readControl();
    const { totals, contests, bySize, byTier } = control.aggregateState;
    const [contestCount, awardedConferences] = await Promise.all([
      store.count('draws'),
      store.getAll('conferences'),
    ]);
    const uniqueAwarded = new Set(
      awardedConferences.filter((item) => item.totalPrizeCents > 0).map((item) => item.ticketId),
    ).size;
    return {
      spentCents: totals.spentCents,
      receivedCents: totals.receivedCents,
      netCents: totals.receivedCents - totals.spentCents,
      ticketCount: totals.ticketCount,
      awardedTickets: uniqueAwarded,
      awardedPercentage: totals.ticketCount
        ? (uniqueAwarded / totals.ticketCount) * 100
        : 0,
      contestsParticipated: Object.keys(contests).length || contestCount,
      contestsWithDraws: contestCount,
      spendByContest: Object.fromEntries(
        Object.entries(contests).map(([key, value]) => [key, value.spentCents]),
      ),
      prizesByContest: Object.fromEntries(
        Object.entries(contests).map(([key, value]) => [key, value.receivedCents]),
      ),
      spendBySize: Object.fromEntries(
        Object.entries(bySize).map(([key, value]) => [key, value.spentCents]),
      ),
      prizesByTier: Object.fromEntries(
        Object.entries(byTier).map(([key, value]) => [key, value.receivedCents]),
      ),
      settings: { ...control.settings },
      prizeValues: prizeValuesFrom(control.settings),
      sequence: control.meta.sequence ?? 0,
      currentContest: control.meta.currentContest ?? 1,
    };
  }

  function pickStore(filters) {
    if (filters.contest !== null) return { name: 'financialEvents', index: 'byContest', value: filters.contest };
    if (filters.tier !== null) return { name: 'financialEvents', index: 'byTier', value: filters.tier };
    if (filters.type) return { name: 'financialEvents', index: 'byType', value: filters.type };
    if (filters.size !== null) return { name: 'financialEvents', index: 'bySize', value: filters.size };
    return { name: 'financialEvents', index: null, value: undefined };
  }

  async function getEvents(rawFilters = {}, pagination = {}) {
    const filters = { contest: null, size: null, tier: null, type: null, from: null, to: null, ticketId: null, ...rawFilters };
    const source = pickStore(filters);
    const records = source.index
      ? await store.query(source.name, { index: source.index, value: source.value })
      : await store.getAll(source.name);
    const filtered = sortChronologically(filterRecords(records, filters), 'asc');
    return paginate(filtered, pagination);
  }

  async function getTickets(rawFilters = {}, pagination = {}) {
    const filters = { contest: null, size: null, from: null, to: null, ...rawFilters };
    let records;
    if (filters.contest !== null) {
      records = await store.query('tickets', { index: 'byContest', value: filters.contest });
    } else if (filters.size !== null) {
      records = await store.query('tickets', { index: 'bySize', value: filters.size });
    } else {
      records = await store.getAll('tickets');
    }
    const filtered = sortChronologically(filterRecords(records, filters), 'asc');
    return paginate(filtered, pagination);
  }

  async function getConferences(rawFilters = {}, pagination = {}) {
    const filters = { contest: null, ticketId: null, from: null, to: null, ...rawFilters };
    let records;
    if (filters.contest !== null) {
      records = await store.query('conferences', { index: 'byContest', value: filters.contest });
    } else if (filters.ticketId) {
      records = await store.query('conferences', { index: 'byTicket', value: filters.ticketId });
    } else {
      records = await store.getAll('conferences');
    }
    return paginate(sortChronologically(filterRecords(records, filters), 'asc'), pagination);
  }

  async function getPrizes(rawFilters = {}, pagination = {}) {
    const filters = { contest: null, tier: null, from: null, to: null, ...rawFilters };
    let records;
    if (filters.tier !== null) {
      records = await store.query('prizes', { index: 'byTier', value: filters.tier });
    } else if (filters.contest !== null) {
      records = await store.query('prizes', { index: 'byContest', value: filters.contest });
    } else {
      records = await store.getAll('prizes');
    }
    return paginate(sortChronologically(filterRecords(records, filters), 'asc'), pagination);
  }

  async function getDraws(rawFilters = {}, pagination = {}) {
    const filters = { contest: null, from: null, to: null, ...rawFilters };
    const records = filters.contest !== null
      ? await store.query('draws', { index: 'byContest', value: filters.contest })
      : await store.getAll('draws');
    return paginate(sortChronologically(filterRecords(records, filters), 'asc'), pagination);
  }

  async function getStatistics() {
    const [events, tickets] = await Promise.all([
      store.getAll('financialEvents'),
      store.getAll('tickets'),
    ]);
    const summary = await getSummary();
    return computeStatistics({
      events: sortChronologically(events, 'asc'),
      tickets,
      totals: {
        ticketCount: summary.ticketCount,
        awardedTicketCount: summary.awardedTickets,
        spentCents: summary.spentCents,
        receivedCents: summary.receivedCents,
      },
    });
  }

  async function setMaxPrize15Cents(value) {
    const cents = Number(value);
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new RangeError('Prêmio máximo deve ser um inteiro não negativo em centavos.');
    }
    await writableLock(async () => {
      await store.transaction(['settings'], (tx) => {
        tx.put('settings', {
          key: 'maxPrize15Cents',
          value: cents,
          updatedAt: now(),
        });
      });
    });
    return getSummary();
  }

  async function setPrize14Cents(value) {
    const cents = Number(value);
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new RangeError('Referência de 14 acertos inválida.');
    }
    await writableLock(async () => {
      await store.transaction(['settings'], (tx) => {
        tx.put('settings', { key: 'prize14Cents', value: cents, updatedAt: now() });
      });
    });
    return getSummary();
  }

  /** Grava uma preferência pessoal validada, sem tocar em dados da simulação. */
  async function setPreference(key, value) {
    const normalized = normalizePreference(key, value);
    await writableLock(async () => {
      await store.transaction(['settings'], (tx) => {
        tx.put('settings', {
          key,
          value: normalized,
          updatedAt: now(),
        });
      });
    });
    return getSummary();
  }

  /**
   * Apaga somente stores de simulação em uma transação, preservando settings e
   * meta. Metadados de sequência/concurso/ID voltam ao estado inicial, enquanto
   * chaves pessoais eventualmente presentes em `meta` permanecem intactas.
   */
  async function resetSimulation({ confirm = false, failTransaction = null } = {}) {
    if (confirm !== true) {
      throw new Error('Confirmação explícita necessária para reiniciar a simulação.');
    }
    if (failTransaction !== null && typeof failTransaction !== 'function') {
      throw new TypeError('failTransaction deve ser uma função ou null.');
    }
    resetGate.lock();
    try {
      const metaRows = await store.getAll('meta');
      const metaKeys = new Set(metaRows.map((row) => row.key));
      const resetMeta = {
        sequence: 0,
        currentContest: 1,
        nextDisplayId: 1,
      };
      const snapshot = await store.snapshot(SIMULATION_STORES);
      await withLock(async () => {
        return store.transaction([...SIMULATION_STORES, 'aggregates', 'meta'], async (tx) => {
          for (const name of SIMULATION_STORES) {
            const keyPath = STORE_SCHEMA[name].keyPath;
            for (const record of snapshot[name] ?? []) tx.delete(name, record[keyPath]);
          }
          for (const record of aggregateRecords({
            ...createFinancialState(),
            contests: {},
            bySize: {},
            byTier: {},
          })) {
            tx.put('aggregates', record);
          }
          for (const [key, value] of Object.entries(resetMeta)) {
            tx.put('meta', { key, value, ...(metaKeys.has(key) ? {} : { createdAt: now() }) });
          }
          if (failTransaction) await failTransaction();
        });
      });
      if (failTransaction) {
        throw new Error('Falha simulada na transação de reinício.');
      }
      const [summary, events, tickets, draws, conferences, prizes] = await Promise.all([
        getSummary(), getEvents(), getTickets(), getDraws(), getConferences(), getPrizes(),
      ]);
      const empty = (page) => page.total === 0 && page.items.length === 0;
      if (
        summary.spentCents !== 0 || summary.receivedCents !== 0 || summary.ticketCount !== 0
        || summary.contestsWithDraws !== 0 || !empty(events) || !empty(tickets)
        || !empty(draws) || !empty(conferences) || !empty(prizes)
      ) {
        throw new Error('A verificação pós-reset encontrou dados residuais.');
      }
      return { ok: true, preservedSettings: summary.settings, summary };
    } finally {
      resetGate.unlock();
    }
  }

  async function restoreState() {
    const names = ['tickets', 'draws', 'sessions', 'conferences', 'prizes', 'teimosinha', 'pools'];
    return store.snapshot(names);
  }

  async function conferTicketById({ ticketId, draw, drawId, contest }) {
    const ticket = await store.get('tickets', ticketId);
    if (!ticket) return { conferences: [], events: [], prizes: [] };
    return conferTickets({ tickets: [ticket], draw, drawId, contest });
  }

  async function exportJson() {
    return exportBackup(store, { now });
  }

  async function exportCsv() {
    const events = await store.getAll('financialEvents');
    return exportLedgerCsv(sortChronologically(events, 'asc'));
  }

  /** Recalcula agregados a partir do ledger após uma mesclagem de backup. */
  async function rebuildAggregates() {
    const events = sortChronologically(await store.getAll('financialEvents'), 'asc');
    let state = createFinancialState();
    for (const event of events) state = applyEvent(state, event);
    const records = aggregateRecords(state);
    const maxSeq = events.reduce((max, event) => Math.max(max, Number(event.seq) || 0), 0);
    await store.transaction(['aggregates', 'meta'], (tx) => {
      for (const record of records) tx.put('aggregates', record);
      tx.put('meta', { key: 'sequence', value: maxSeq });
    });
  }

  async function importBackup(payload, { confirm = false } = {}) {
    if (confirm !== true) {
      throw new Error('Confirmação explícita necessária para importar backup.');
    }
    return writableLock(async () => {
      const result = await mergeBackup(store, payload);
      if (Object.values(result.added).some((count) => count > 0)) {
        await rebuildAggregates();
      }
      return result;
    });
  }

  return {
    store,
    initialize,
    buyTickets,
    registerDraw,
    conferTickets,
    conferTicketById,
    getSummary,
    getEvents,
    getTickets,
    getConferences,
    getPrizes,
    getDraws,
    getStatistics,
    setMaxPrize15Cents,
    setPrize14Cents,
    setPreference,
    restoreState,
    exportJson,
    exportCsv,
    importBackup,
    resetSimulation,
    simulationStoreNames: SIMULATION_STORES,
    STORE_NAMES,
  };
}
