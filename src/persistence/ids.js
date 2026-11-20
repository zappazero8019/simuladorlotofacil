/**
 * Identificadores estáveis e únicos. `crypto.randomUUID` é usado quando
 * disponível; o fallback mantém determinismo em ambientes de teste.
 */
let fallbackCounter = 0;

export function createIdFactory(prefix = '') {
  return function nextId() {
    let value;
    if (globalThis.crypto?.randomUUID) {
      value = globalThis.crypto.randomUUID();
    } else {
      fallbackCounter += 1;
      value = `${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.floor(
        Number.MAX_SAFE_INTEGER * pseudoRandom(),
      ).toString(36)}`;
    }
    return prefix ? `${prefix}_${value}` : value;
  };
}

function pseudoRandom() {
  // Gerador determinístico apenas para o fallback; nunca usado para sorteios.
  fallbackCounter = (fallbackCounter * 1103515245 + 12345) % 2147483647;
  return fallbackCounter / 2147483647;
}

/** Chave de idempotência do ledger. */
export function ticketEventKey(ticketId) {
  return `ticket:${ticketId}`;
}

export function prizeEventKey(conferenceId, tier) {
  return `prize:${conferenceId}:${tier}`;
}
