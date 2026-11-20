/**
 * Centraliza mensagens amigáveis e registro técnico discreto. Nenhum dado do
 * usuário (números, valores ou IDs) entra no console.
 */
const messages = new Map([
  ['QuotaExceededError', 'Não há espaço de armazenamento suficiente. Exporte um backup antes de continuar.'],
  ['InvalidStateError', 'O armazenamento local foi interrompido. Recarregue a página para tentar novamente.'],
  ['AbortError', 'A operação foi interrompida. Nada foi confirmado; tente novamente.'],
  ['NetworkError', 'Falha de comunicação com o armazenamento. Verifique o modo de navegação privada.'],
]);

/** Mensagem curta e segura para exibir ao usuário. */
export function friendlyError(error) {
  const name = error?.name ?? '';
  if (messages.has(name)) return messages.get(name);
  const text = String(error?.message ?? error ?? '');
  if (/quota|espaço/i.test(text)) return messages.get('QuotaExceededError');
  if (/blocked|bloquead/i.test(text)) return 'O banco está bloqueado por outra aba. Feche as demais abas e tente novamente.';
  return 'Não foi possível concluir a operação. Nada foi confirmado; tente novamente.';
}

/** Registra apenas classe e mensagem sanitizada (sem pilha nem dados). */
export function logTechnicalError(context, error) {
  const name = error?.name ?? 'Error';
  const message = String(error?.message ?? '').slice(0, 200);
  console.warn(`[simulador] ${context}: ${name}${message ? ` — ${message}` : ''}`);
}
