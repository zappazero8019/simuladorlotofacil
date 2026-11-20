/**
 * Detecção de capacidade WebGL isolada da cena. Usa um canvas descartável e
 * nunca altera o canvas principal da aplicação.
 */
export function isWebGlAvailable(documentRef = globalThis.document) {
  if (!documentRef || typeof documentRef.createElement !== 'function') return false;
  try {
    const canvas = documentRef.createElement('canvas');
    const context = canvas.getContext('webgl2')
      ?? canvas.getContext('webgl')
      ?? canvas.getContext('experimental-webgl');
    if (!context) return false;
    const lose = context.getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Cria um aviso curto e sem detalhes técnicos para o usuário. */
export function webGlFallbackMessage() {
  return 'Globo 3D indisponível neste dispositivo. A roleta alternativa continua disponível e usa o mesmo resultado.';
}
