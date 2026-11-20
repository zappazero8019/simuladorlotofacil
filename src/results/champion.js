/**
 * Apuração purosamente visual dos bilhetes campeões.
 *
 * Este módulo nunca sortea, confere, calcula prêmio, altera saldo ou escreve
 * em bilhetes. Ele apenas lê conferências já realizadas pelo motor e deriva
 * quais bilhetes empataram na maior quantidade de acertos do concurso.
 */

export const CHAMPION_LABEL = 'MAIOR NÚMERO DE ACERTOS';
export const CHAMPION_EMPTY_LABEL = 'SEM BILHETE CAMPEÃO';

const sortNumbers = (numbers) => [...numbers].sort((a, b) => a - b);

export function conferenceKey(conference = {}) {
  return `${String(conference.betId ?? '?')}:${String(conference.contest ?? 1)}`;
}

/** Interseção exata entre os números do bilhete e o resultado sorteado. */
export function matchedNumbersOf(conference = {}) {
  const drawn = new Set(Array.isArray(conference.drawnNumbers) ? conference.drawnNumbers : []);
  const betNumbers = Array.isArray(conference.numbers) ? conference.numbers : [];
  const unique = new Set();
  for (const number of betNumbers) {
    if (Number.isInteger(number) && drawn.has(number)) unique.add(number);
  }
  return sortNumbers(unique);
}

function scoreLabel(matches) {
  return `${matches} ${matches === 1 ? 'ACERTO' : 'ACERTOS'}`;
}

const EMPTY_CHAMPION = Object.freeze({
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

/**
 * Recebe somente conferências já calculadas pelo motor. Empates na maior
 * quantidade de acertos produzem vários campeões; a posição na lista é
 * irrelevante. A chave `betId:contest` evita confundir concursos da Teimosinha.
 */
export function describeChampions(conferences = [], drawNumbers = null) {
  if (!Array.isArray(conferences)) {
    throw new TypeError('conferences deve ser um array.');
  }

  const drawnFallback = Array.isArray(drawNumbers) ? drawNumbers : [];
  const valid = conferences.filter((conference) => (
    conference
    && Number.isInteger(conference.matches)
    && conference.matches >= 0
  ));
  if (valid.length === 0) return EMPTY_CHAMPION;

  const byKey = new Map();
  for (const conference of valid) byKey.set(conferenceKey(conference), conference);
  const all = [...byKey.values()];
  const bestMatches = Math.max(...all.map((conference) => conference.matches));

  const champions = Object.freeze(all
    .filter((conference) => conference.matches === bestMatches)
    .map((conference) => Object.freeze({
      betId: conference.betId ?? null,
      contest: conference.contest ?? 1,
      matches: conference.matches,
      key: conferenceKey(conference),
      numbers: Object.freeze([...(Array.isArray(conference.numbers) ? conference.numbers : [])]),
      drawnNumbers: Object.freeze([
        ...(Array.isArray(conference.drawnNumbers) && conference.drawnNumbers.length > 0
          ? conference.drawnNumbers
          : drawnFallback),
      ]),
      matchedNumbers: Object.freeze(matchedNumbersOf({
        ...conference,
        drawnNumbers: Array.isArray(conference.drawnNumbers) && conference.drawnNumbers.length > 0
          ? conference.drawnNumbers
          : drawnFallback,
      })),
    })));

  const betIds = Object.freeze([...new Set(champions.map((champion) => String(champion.betId)))]);
  const keys = Object.freeze(champions.map((champion) => champion.key));
  const matchedNumbers = Object.freeze(sortNumbers(new Set(
    champions.flatMap((champion) => champion.matchedNumbers),
  )));
  const numbersByBet = new Map();
  for (const champion of champions) {
    const id = String(champion.betId);
    numbersByBet.set(id, Object.freeze(sortNumbers(new Set([
      ...(numbersByBet.get(id) ?? []),
      ...champion.matchedNumbers,
    ]))));
  }

  return Object.freeze({
    active: true,
    label: CHAMPION_LABEL,
    scoreLabel: scoreLabel(bestMatches),
    bestMatches,
    count: champions.length,
    champions,
    betIds,
    keys,
    matchedNumbers,
    isBetChampion: (betId) => betIds.includes(String(betId)),
    numbersForBet: (betId) => numbersByBet.get(String(betId)) ?? Object.freeze([]),
  });
}
