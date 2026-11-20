# Fase 6 — Plano de execução

## 6A — Auditoria técnica (diagnóstico inicial)

### Inventário

- 56 arquivos `.js` em `src/`, 27 arquivos de teste, Vite 8.3.8, Three.js 0.187.0 e
  Vitest 5.1.1. Nenhuma dependência adicional.
- `npm audit`: 0 vulnerabilidades.
- Build atual: chunk principal ~279 kB (79 kB gzip) e chunk 3D separado
  ~367 kB (90 kB gzip). Sem aviso de chunk >500 kB.
- IndexedDB: 11 stores, versão 1, transações atômicas, fallback em memória,
  chaves de idempotência para compras e premiações.
- Fases 0–5 preservadas; reset da Fase 5 validado em banco isolado.

### Problema crítico encontrado

1. **WebGL sem recuperação**: `src/visualization/index.js` não escuta
   `webglcontextlost`/`webglcontextrestored`. Medição no navegador confirmou que
   o contexto é perdido e restaurado pelo Chromium, mas a cena não é
   reconstruída. Em Android, suspensão de aba e pressão de memória podem causar
   perda de contexto, deixando o globo preto sem afetar a roleta.
2. **Sem fallback explícito sem WebGL**: `createRenderer()` lança exceção; o
   proxy captura, mas a interface continua com modo globo selecionado e sem
   aviso ao usuário.
3. **FPS**: ~29–30 fps na mistura e extração no ambiente de auditoria (Intel HD
   4000 via Direct3D11, DPR 1.5), sem picos de heap (14 MB usados). Não é um
   dispositivo Android real; não pode ser extrapolado para o Moto G35.
4. **rAF em aba oculto**: já corrigido no fluxo de compra na Fase 5; o globo
   para corretamente quando a aba é suspensa, mas não há repaint explícito ao
   voltar.
5. **Persistência**: localStorage não é usado; IndexedDB é primário. Fallback
   em memória significa perda de dados se o banco for bloqueado — precisa de
   aviso claro na interface.
6. **Android**: nenhum dispositivo físico conectado e `adb` indisponível. A
   validação será por emulação de viewport e métricas DOM, sem afirmar teste
   físico.
7. **PWA**: ainda não há manifesto/service worker. Cache ingênuo pode servir
   código antigo com banco novo; implementação deve ser shell-only com
   network-first para HTML/JS e versionamento explícito.

### Plano de execução

- 6B: validar 390/768/desktop, portrait/landscape, teclado, modais e compras.
- 6C: fallback sem WebGL, eventos de contexto, pausa ao ocultar e limpeza.
- 6D: banco isolado para testes destrutivos; verificar duplicação e recuperação.
- 6E: mensagens de erro, estados de carregamento, proteção de cliques e log
  técnico sem dados sensíveis.
- 6F: foco, leitor de tela, contraste e reduced motion.
- 6G: PWA mínima sem cache de dados, com atualização segura.

Backups prévios em `%LOCALAPPDATA%\Temp\opencode\fase6-backup`.

## Resultado da execução

### Correções entregues

- **6B/6F CSS**: `env(safe-area-inset-*)`, `@media (max-height: 520px)` com
  palco mínimo de 180 px e painéis roláveis, slider com alvo de 44 px, contraste
  do botão principal elevado de 4,44:1 para 4,88:1 e `role="group"` no palco.
- **6C WebGL**: `webglSupport.js` detecta capacidade sem tocar o canvas real;
  `deferredVisualization` deixa de enfileirar após falha e expõe
  `startAnimation`/`stopAnimation`; `visualization/index.js` trata
  `webglcontextlost`/`webglcontextrestored`, `visibilitychange` e
  `visualViewport.resize`. Roleta é selecionada automaticamente quando não há
  WebGL, com aviso visível e mesma lógica de resultado.
- **6A BFCache**: `pagehide` não dispoe a aplicação quando `event.persisted` é
  verdadeiro; `pageshow` restaura a referência do visualizador.
- **6A/6D IndexedDB**: `databasePromise` é anulado em `versionchange`, `close`,
  `onerror` e `onblocked`, permitindo reconexão; teste com factory falso prova a
  segunda abertura. `clientKey` repetido não duplica bilhete nem lançamento.
- **6E erros**: `errorHandler.js` com mensagens amigáveis e log sanitizado;
  `guardAction()` no painel de histórico desabilita exportar/importar/salvar
  prêmio/paginação e marca `aria-busy`.
- **6G PWA**: `manifest.webmanifest`, `icone.svg`, `robots.txt` e `sw.js` com
  cache versionado pelo hash do bundle, network-first, sem cache de dados.
  `base: './'` no Vite permite subdiretório. Nenhuma dependência adicionada.

### Validação

- `npm test`: 28 arquivos, 233 testes OK (7 novos).
- `npm run build`: OK; principal 281,76 kB (80,09 kB gzip), 3D 367,99 kB
  (90,32 kB gzip), CSS 17,05 kB. `npm audit`: 0 vulnerabilidades.
- Navegador: sem erros de console; contexto WebGL perdido/restaurado com
  animação pausada e retomada; modo roleta pausa o globo; BFCache preserva o
  canvas; fallback mostra aviso e seleciona roleta.
- Viewports 390×844, 390×360, 844×390 e 1280×800: sem rolagem horizontal,
  modal visível, botões e campos ≥44 px, slider 44 px.
- Lighthouse: acessibilidade 1,0; boas práticas 1,0; SEO 1,0.
- Desempenho medido em 6A: ~29–30 fps na mistura e extração, heap ~14 MB,
  GPU Intel HD 4000 em desktop remoto. Não é extrapolável para o Moto G35.
- Teste físico no Moto G35 **não realizado**: nenhum dispositivo conectado e
  `adb` indisponível.

### Limitações

- Suspensão real de aba em Android, teclado virtual do Moto G35 e pressão de
  memória do sistema não foram reproduzidos em hardware.
- O fallback em memória do IndexedDB ainda implica perda de dados ao bloquear o
  banco; a interface agora falha com mensagem clara, mas não promete persistência.
- Gráficos e tabelas leem o histórico completo; com volumes muito altos pode
  haver jank em dispositivos modestos (otimização diferida).
- APK não foi criado: exige plano técnico e autorização específica.
- Nenhum commit ou push. Fase 7 não iniciada.
