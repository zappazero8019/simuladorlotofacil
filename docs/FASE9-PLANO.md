# Fase 9 — plano técnico e verificação

Versão web 1.0.0 · executada em 20/11/2026 · **Fase 10 não iniciada**.

Este documento registra os vinte pontos de aceite da Fase 9, a prova de cada um
e as limitações que dependem de hardware. Nenhuma linha do motor matemático,
das regras de premiação ou do ledger financeiro foi alterada.

## Princípio de integridade

O resultado é gerado e congelado em `createDrawSession().draw()` (`session.js`)
**antes** de `presentation.start()`. Áudio, física, velocidade, animação, roleta,
fogos e modo de teste apenas consomem o estado já congelado. O único ponto que
pede um novo resultado continua sendo `show.startDraw()`.

## Os 20 pontos de aceite

| # | Requisito | Onde | Evidência |
|---|---|---|---|
| 1 | Resultado matemático definido e congelado antes da animação | `src/draws/session.js`, `src/draws/show.js` | `tests/draws.test.js`, `tests/fase9Integration.test.js`; nenhuma API de áudio/teste aparece em `createDrawSession` |
| 2 | Música instrumental original em loop durante a extração | `src/audio/engine.js` (`MELODY`/`BASS`, `musicTick`) | `tests/fase9Audio.test.js`: loop repete e cada tick agenda novas notas |
| 3 | Encerramento suave da música | `stopMusic({ fade: true })`, chamado no `onComplete` | `tests/fase9Audio.test.js`: rampa exponencial a zero e temporizador liberado |
| 4 | Efeitos distintos para início, mistura,extração, revelação, última bola, resultado, não contemplado, contemplado e fogos | `AUDIO_EFFECTS` (9 itens) | `tests/fase9Audio.test.js`: identidades sonoras distintas; `tests/fase9Integration.test.js`: globo e roleta disparam os mesmos ganchos |
| 5 | Música on/off, efeitos on/off e volumes independentes persistidos | `src/settings/preferences.js`, `src/ui/preferencesPanel.js`, `history.setPreference` | `tests/fase9Audio.test.js` (volumes 20/90 e 75/90), `tests/fase9Celebration.test.js` (persistência) |
| 6 | Áudio somente após interação válida | `createAudioEngine` cria contexto só em `unlock`/`playEffect`/`startMusic` | `tests/fase9Audio.test.js`: zero contextos antes de `unlock()`; botões de sorteio/avanço chamam `unlock()` |
| 7 | Pausa, retomada e encerramento corretos no Android | `src/androidBridge.js`, `src/main.js` (`pagehide`) | `tests/fase9Audio.test.js`: razões `android` e `apresentacao` independentes; `tests/fase8Android.test.js` preservado |
| 8 | Globo mistura 25 bolas antes da extração | `src/visualization/mixer.js`, `views.globo.startSpin` | `tests/visualization.test.js`, `tests/fase9Integration.test.js` |
| 9 | Próxima bola da sequência congelada é conduzida à abertura e extraída fisicamente | `src/visualization/extraction.js` (`PHASE_TO_OPENING`/`PHASE_TO_EXIT`) | `tests/fase9Integration.test.js`: posição interna, travessia superior, chegada ao slot; `tests/extraction.test.js` |
| 10 | Número grande/legível, registrado no painel e removido do conjunto interno | `src/visualization/balls.js` (halo + etiqueta), `revealShared`, `physics.setExtracted` | `tests/fase9Integration.test.js`: halo visível, etiqueta ampliada, 10 números restantes |
| 11 | Roleta de 15 posições sem WebGL, com mesmos sons e resultado final | `src/ui/roleta.js`, `src/ui/deferredVisualization.js` | `tests/roleta.test.js`, `tests/fase9Integration.test.js` (fallback `available: false`) |
| 12 | Mensagens exatas `BILHETE NÃO CONTEMPLADO` e `BILHETE CONTEMPLADO!` | `RESULT_MESSAGES` em `src/results/celebration.js` | `tests/fase9Celebration.test.js` compara strings literalmente |
| 13 | Comemoração por valor efetivamente recebido, nunca pelo teto | `prizeIntensity(totalPrizeCents)` | `tests/fase9Celebration.test.js`: 700/3500/189635/50000000 geram intensidades distintas |
| 14 | Múltiplos bilhetes com resultados individuais e resumo geral | `planCelebration.items` + `src/ui/resultCelebration.js` | `tests/fase9Celebration.test.js`: 2 bilhetes, 1 real e 1 sem prêmio |
| 15 | Modo de teste 1–100%, desligado por padrão, com slider, percentual e selo permanente | `index.html`, `src/ui/preferencesPanel.js` | `tests/fase9Integration.test.js` (HTML), `tests/fase9Celebration.test.js` (default 25%) e inspeção no navegador (selo visível ao ativar) |
| 16 | Aviso obrigatório `SIMULAÇÃO DE TESTE — NÃO É UM PRÊMIO REAL` | `RESULT_MESSAGES.simulation` no overlay | `tests/fase9Celebration.test.js` e navegador: aviso exibido com 1 simulação |
| 17 | Simulação não altera acertos, prêmio, saldo, histórico ou estatísticas | `planCelebration` é somente leitura | `tests/fase9Celebration.test.js`: snapshots idênticos antes/depois; navegador: `Total recebido R$ 0,00`, `Bilhetes premiados 0` |
| 18 | RNG do modo de teste independente, não determinístico e injetável; sem teste probabilístico frágil | `createTestRandom()` com `crypto.getRandomValues` | `tests/fase9Integration.test.js`: RNG de sorteio não consumido; `tests/fase9Celebration.test.js`: limites fixos 0,005/0,02 e 100% determinístico |
| 19 | Preferências persistem e sobrevivem ao reset completo | `settings` fora de `SIMULATION_STORES` | `tests/fase9Celebration.test.js`: 6 preferências gravadas, restauradas e preservadas após `resetSimulation` |
| 20 | Acessibilidade, redução de movimento, retrato/paisagem e Android 15 (Moto G35) | `aria-live`, `role=status`, `@media (prefers-reduced-motion)`, `safe-area-inset`, `setReducedMotion` | `tests/fase9Integration.test.js` (HTML/CSS), `tests/fase9Audio.test.js`, build Android. **Teste físico pendente**: `adb devices` vazio |

## Verificações executadas

- `npm.cmd test`: **33 arquivos, 269 testes aprovados**.
- `npm.cmd run build`: OK (75 módulos; `dist` gerado).
- `npm.cmd audit`: **0 vulnerabilidades**.
- Navegador (preview do `dist`): console sem erros; modo de teste a 100% gerou
  `BILHETE CONTEMPLADO!` com aviso e `R$ 0,00 em prêmios reais`; nenhuma
  estatística financeira alterada.
- `npx cap sync android` + `gradlew assembleDebug`: **BUILD SUCCESSFUL**.
- APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 5.424.516 bytes,
  `versionName=1.0.0`, `versionCode=1`, `minSdk=24`, `targetSdk=36`.

## Backups e limitações

- Backup prévio em `%LOCALAPPDATA%\Temp\opencode\fase9-backup` (163 arquivos),
  criado antes da primeira alteração da Fase 9.
- `adb devices -l` não listou dispositivo. Portanto **não** foi possível afirmar
  instalação, áudio real, teclado, FPS, física, roleta, fogos, rotação ou
  sobrevivência de dados após reboot no Moto G35/Android 15. O APK foi gerado e
  permanece pronto para instalação manual.
- Nenhum commit, push, deploy, publicação ou versão assinada foi realizado.
