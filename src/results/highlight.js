import {
  CHAMPION_LABEL,
  conferenceKey,
  describeChampions,
  matchedNumbersOf,
} from './champion.js';

/**
 * Destaque visual de um concurso com um único bilhete participante.
 *
 * Não há apuração de campeão nem comparação entre bilhetes: a interseção é
 * derivada apenas da conferência já calculada pelo motor para aquele bilhete.
 * O formato devolvido é compatível com o estado de apresentação existente,
 * preservando rótulo, cor, brilho e animação já implementados.
 */

function scoreLabel(matches) {
  return `${matches} ${matches === 1 ? 'ACERTO' : 'ACERTOS'}`;
}

const EMPTY_HIGHLIGHT = Object.freeze({
  active: false,
  label: CHAMPION_LABEL,
  scoreLabel: '',
  bestMatches: 0,
  count: 0,
  champions: Object.freeze([]),
  betIds: Object.freeze([]),
  keys: Object.freeze([]),
  matchedNumbers: Object.freeze([]),
  isBetChampion: () => false,
  numbersForBet: () => Object.freeze([]),
});

export function describeSingleHighlight(conference, drawNumbers = null) {
  if (!conference || !Number.isInteger(conference.matches) || conference.matches < 0) {
    return EMPTY_HIGHLIGHT;
  }

  const drawnFallback = Array.isArray(drawNumbers) ? drawNumbers : [];
  const drawnNumbers = Array.isArray(conference.drawnNumbers) && conference.drawnNumbers.length > 0
    ? conference.drawnNumbers
    : drawnFallback;
  const numbers = Array.isArray(conference.numbers) ? conference.numbers : [];
  const matched = Object.freeze(matchedNumbersOf({ numbers, drawnNumbers }));
  const betId = String(conference.betId ?? '?');
  const matchedByBet = new Map([[betId, matched]]);

  const selected = Object.freeze({
    betId: conference.betId ?? null,
    contest: conference.contest ?? 1,
    matches: conference.matches,
    key: conferenceKey(conference),
    numbers: Object.freeze([...numbers]),
    drawnNumbers: Object.freeze([...drawnNumbers]),
    matchedNumbers: matched,
  });

  return Object.freeze({
    active: true,
    label: CHAMPION_LABEL,
    scoreLabel: scoreLabel(conference.matches),
    bestMatches: conference.matches,
    count: 1,
    champions: Object.freeze([selected]),
    betIds: Object.freeze([betId]),
    keys: Object.freeze([selected.key]),
    matchedNumbers: matched,
    isBetChampion: (id) => String(id) === betId,
    numbersForBet: (id) => matchedByBet.get(String(id)) ?? Object.freeze([]),
  });
}

/**
 * Escolhe a origem do destaque após a conferência do concurso:
 * - uma conferência: destaque direto do bilhete único;
 * - duas ou mais: apuração completa de todos os empatados;
 * - nenhuma: estado vazio, sem destaque.
 */
export function resolveHighlight(conferences = [], drawNumbers = null, strategies = {}) {
  if (!Array.isArray(conferences)) {
    throw new TypeError('conferences deve ser um array.');
  }

  const single = strategies.single ?? describeSingleHighlight;
  const champions = strategies.champions ?? describeChampions;

  if (conferences.length === 0) return champions([], drawNumbers);
  if (conferences.length === 1) return single(conferences[0], drawNumbers);
  return champions(conferences, drawNumbers);
}
