import { SETTINGS_KEYS } from '../persistence/schema.js';
import { FIXED_PRIZE_VALUES_CENTS, REFERENCE_PRIZE_VALUES_CENTS } from '../prizes/prizeValues.js';
import { readPreferences } from '../settings/preferences.js';

export const RESULT_MESSAGES = Object.freeze({
  loss: 'BILHETE NÃO CONTEMPLADO',
  win: 'BILHETE CONTEMPLADO!',
  noWinners: 'NENHUM BILHETE CONTEMPLADO.',
  simulation: 'SIMULAÇÃO DE TESTE — NÃO É UM PRÊMIO REAL',
});

export const INTENSITIES = Object.freeze(['nenhuma', 'discreta', 'moderada', 'grande']);

/**
 * Fonte aleatória separada do motor de sorteio. Usa `crypto.getRandomValues`
 * quando disponível; o fallback existe apenas para ambientes sem crypto e nunca
 * é passado para `createDrawSession`.
 */
export function createTestRandom(source = globalThis) {
  const cryptoObject = source.crypto;
  if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    return () => {
      cryptoObject.getRandomValues(buffer);
      return (buffer[0] + 0.5) / 4294967296;
    };
  }
  return () => Math.random();
}

/** Intensidade definida pelo valor efetivamente recebido, nunca pelo teto configurado. */
export function prizeIntensity(totalPrizeCents) {
  const cents = Number(totalPrizeCents);
  if (!Number.isFinite(cents) || cents <= 0) return 'nenhuma';
  if (cents >= REFERENCE_PRIZE_VALUES_CENTS[14]) return 'grande';
  if (cents >= FIXED_PRIZE_VALUES_CENTS[13]) return 'moderada';
  return 'discreta';
}

/**
 * Título geral a partir do plano já conferido. Nunca recebe o contador visual:
 * a contemplação vem exclusivamente do resultado matemático (e da simulação
 * determinística configurada, quando ativa).
 */
export function resultTitle(summary = {}) {
  const count = Number.isFinite(summary?.winnerCount)
    ? summary.winnerCount
    : Number(summary?.realWinners ?? 0) + Number(summary?.simulatedWinners ?? 0);
  if (!Number.isFinite(count) || count <= 0) return RESULT_MESSAGES.noWinners;
  if (count === 1) return RESULT_MESSAGES.win;
  return `${count} BILHETES CONTEMPLADOS!`;
}

function activationDecides(settings, random) {
  if (!settings[SETTINGS_KEYS.TEST_MODE_ENABLED]) return false;
  const percent = settings[SETTINGS_KEYS.TEST_PROBABILITY];
  // 100% é determinístico: não consome RNG e nunca depende de arredondamento.
  if (percent >= 100) return true;
  const value = random();
  return Number.isFinite(value) && value >= 0 && value < percent / 100;
}

/**
 * Plana a apresentação sem alterar nenhuma conferência. O objeto devolvido é
 * somente leitura: a comemoração nunca escreve em bilhetes, prêmios, saldo,
 * histórico ou estatísticas.
 */
export function planCelebration({ conferences = [], settings = {}, random = createTestRandom() } = {}) {
  if (!Array.isArray(conferences)) throw new TypeError('conferences deve ser um array.');
  if (typeof random !== 'function') throw new TypeError('random deve ser uma função.');

  const preferences = readPreferences(settings);
  const items = conferences.map((conference, index) => {
    const receivedCents = Number(conference?.totalPrizeCents ?? 0);
    const realWin = Number.isFinite(receivedCents) && receivedCents > 0;
    const simulated = !realWin && activationDecides(preferences, random);
    const intensity = simulated ? 'moderada' : realWin ? prizeIntensity(receivedCents) : 'nenhuma';
    return Object.freeze({
      index,
      betId: conference?.betId ?? null,
      contest: conference?.contest ?? null,
      matches: conference?.matches ?? 0,
      realWin,
      simulated,
      receivedCents: realWin ? receivedCents : 0,
      message: realWin || simulated ? RESULT_MESSAGES.win : RESULT_MESSAGES.loss,
      notice: simulated ? RESULT_MESSAGES.simulation : null,
      intensity,
    });
  });

  const realWinners = items.filter((item) => item.realWin).length;
  const simulatedWinners = items.filter((item) => item.simulated).length;
  const summary = Object.freeze({
    total: items.length,
    realWinners,
    simulatedWinners,
    winnerCount: realWinners + simulatedWinners,
    testModeActive: preferences[SETTINGS_KEYS.TEST_MODE_ENABLED],
    receivedCents: items.reduce((sum, item) => sum + item.receivedCents, 0),
    fireworks: items.some((item) => item.intensity === 'grande' || item.simulated),
    anyCelebration: realWinners + simulatedWinners > 0,
  });

  return Object.freeze({ items: Object.freeze(items), summary });
}
