/*
 * Service worker mínimo da Fase 6.
 * Regra de ouro: nunca cachear dados da simulação (IndexedDB é a única fonte)
 * e nunca servir código antigo quando há rede. O cache existe apenas para o
 * shell visual em caso de falha de rede.
 */
// A versão vem da URL de registro (gerada a partir do hash do bundle no build).
// Cada build troca o nome do cache e a ativação remove o anterior.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `simulador-lotofacil-shell-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icone.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // IndexedDB e dados dinâmicos nunca passam por aqui; apenas navegação e
  // arquivos estáticos do próprio app.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (request.mode === 'navigate' || /\.(js|css|svg|webmanifest)$/.test(url.pathname))) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('./index.html'))),
  );
});
