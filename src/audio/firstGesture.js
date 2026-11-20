/**
 * Libera o áudio e inicia a trilha contínua no primeiro gesto válido do
 * jogador. Nenhum resultado, premiação ou preferência é alterado aqui: o
 * próprio motor de áudio respeita `musicEnabled` e o volume salvo.
 */
export function installFirstGestureAudio(audio, target = globalThis) {
  if (!audio || typeof target?.addEventListener !== 'function') return () => {};

  const events = ['pointerdown', 'keydown', 'touchstart'];
  let done = false;
  let handler = null;

  function remove() {
    for (const type of events) target.removeEventListener(type, handler, true);
    done = true;
  }

  handler = () => {
    if (done) return;
    remove();
    audio.unlock?.();
    audio.startMusic?.();
  };

  for (const type of events) target.addEventListener(type, handler, true);
  return remove;
}
