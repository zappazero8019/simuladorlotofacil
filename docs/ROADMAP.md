# Roadmap

Legenda: ✅ concluído · 🔄 em andamento · ⏳ planejado

## Fase 0 — Preparação do ambiente ✅

- Inicializar Git na branch `main`.
- Configurar remote `origin`.
- Verificar conexão com o GitHub (sem push).
- Instalar Vite, Three.js e Vitest.
- Criar estrutura modular de diretórios.
- Criar README e documentação de arquitetura, roadmap e Graphify.
- Validar build, teste inicial, dependências e Git.
- Registrar limitações do Graphify.

## Fase 1 — Motor matemático ✅

- Modelar o universo de números da Lotofácil (1–25, sorteio de 15).
- Implementar operações puras de combinatória e validação.
- Gerar combinações simples de 15 números para apostas de 15 a 20.
- Implementar sorteio, surpresinha e conferência com faixas de 11 a 15 acertos.
- Calcular probabilidades oficiais para apostas de 15 a 20 números.
- Definir estruturas de dados para aposta e resultado.
- Ampliar testes unitários do núcleo (54 testes determinísticos).

## Fase 1.1 — Correções e fortalecimento dos testes ✅

- Cobrir `checkBet` nas seis modalidades e em todos os acertos viáveis.
- Cobrir `probabilityByTier`, `probabilityAnyPrize` e frações exatas nas seis
  modalidades e cinco faixas.
- Testar `sampleDistinct` com geradores inválidos, falha tardia e `count = 0`.
- Testar casos extremos, geração lazy e imutabilidade de combinações.
- Ajustar apenas a apresentação de `formatOneIn` às duas exceções da tabela
  oficial da CAIXA, preservando os valores matemáticos exatos.
- Validar argumentos de `generateCombinations` imediatamente, mantendo a
  geração lazy e a API pública inalterada.
- Revisão concluída; Fase 2A autorizada.

## Fase 2 — Apostas e sorteios ⏳

- Geração manual e automática de apostas.
- Simulação de sorteios com semente controlada para testes.
- Registro de resultados.

## Fase 2A — Construção visual do globo 3D ✅

- Cena Three.js isolada em `src/visualization/`, sem dependência do motor.
- Casca transparente, armação metálica, base e iluminação com sombras/reflexos.
- Câmera responsiva, renderer com redimensionamento e modo de baixo consumo.
- Exatamente 25 bolas numeradas de 01 a 25, distribuídas no interior do globo.
- Módulos separados para cena, globo, bolas, iluminação, câmera, renderer e
  inicialização/encerramento.
- Testes determinísticos de quantidade, numeração, posições, texturas,
  responsividade e isolamento (7 novos testes).
- Revisão concluída; Fase 2B autorizada.

## Fase 2B — Mistura e física das bolas ✅

- Mundo físico independente com timestep fixo e limite de subpassos.
- Colisões esfera-esfera, restituição, rotação e confinamento dentro do globo.
- Gravidade atenuada, amortecimento, impulsos irregulares e redemoinho suave.
- Controlador de mistura com `start()`, `stop()` e transição de intensidade.
- Loop com delta time sincronizando 25 corpos e meshes sem realocar recursos.
- 9 novos testes determinísticos de movimento, colisão, contenção, estabilidade,
  limites de subpasso, transição, dispose e sincronização.
- Revisão concluída; Fase 2C autorizada.

## Fase 2C — Integração do sorteio e modos visuais ✅

- Sessão de sorteio com resultado imutável; motor matemático como única fonte.
- Controlador de apresentação com revelação individual/total, pausa, reinício e
  velocidade — nenhum deles gera números.
- Controlador de exibição com seleção de modo sem novo sorteio.
- Globo 3D: extração animada de exatamente 15 bolas na ordem do resultado,
  com 10 bolas restantes e física isolada dos corpos extraídos.
- Roleta simplificada: 15 compartimentos DOM, grade responsiva, giro/suspense/
  destaque com CSS e sem WebGL.
- Interface com seleção de modo, iniciar/pausar/continuar/próximo/todos/
  reiniciar e velocidade de apresentação.
- 25 novos testes cobrindo integração, imutabilidade, modos, roleta, extração e
  isolamento (54 da Fase 1 + 18 da Fase 1.1 + 7 + 9 + 25 = 113 testes).
- Revisão concluída; Fase 2D autorizada.

## Fase 2D — Velocidade, modos de sorteio e animações ✅

- Três ritmos de apresentação: normal (1×), acelerado (3×) e instantâneo (5×).
- Controle de velocidade ajustável (`0,5×` a `5×`) aplicável durante a execução,
  sem reiniciar, sem perder progresso e sem gerar novo resultado.
- Globo: velocidade visual separada do timestep físico, mistura interrompida no
  modo instantâneo e bolas posicionadas diretamente nos slots.
- Roleta: giro, suspense, revelação e destaque escalados por CSS, sem WebGL.
- Controles refletem o estado (iniciar desabilitado durante a apresentação;
  pausa/continuar/próximo/todos desabilitados no modo instantâneo).
- 20 novos testes cobrindo ritmos, velocidade, pausa, próximo, revelação total,
  reinício, troca de modo, ausência de sorteios adicionais, estabilidade física,
  timers únicos e descarte de recursos (total: 133 testes).
- Revisão concluída; Fase 3 autorizada.

## Fase 3 — Sistema de apostas, volante, Surpresinha, Teimosinha, bolões e conferência ✅

- Volante 5 × 5 responsivo com seleção/deseleção, destaque, contador, preço,
  limite de 20 números e bloqueio de confirmação abaixo de 15.
- Surpresinha reutilizando `generateSurpresinha`, com tamanho 15–20 e nova geração
  antes do cadastro; nunca confundida com resultado do sorteio.
- Preços oficiais de 15 a 20 números centralizados em centavos; combinações
  simples validadas por `countCombinations`.
- Teimosinha com 2/3/4/6/8/9/12/18/24 concursos, mesma combinação congelada e
  resultado/conferência individuais por concurso.
- Bolões fictícios com 2 cotas até o limite oficial por quantidade de números,
  participantes nomeados, valor por cota truncado, resíduo na última cota e
  rateio simulado.
- Conferência automática/manual contra `session.getFrozenResult()`, cobrindo
  11 a 15 acertos, combinações premiadas sem duplicidade e valor simulado.
- Valores de 14/15 acertos centralizados como referências fictícias, com
  justificativa documentada em `docs/FASE3-PLANO.md`.
- 42 novos testes cobrindo preços, volante, Surpresinha, cadastro, Teimosinha,
  bolões, conferência, integração com sessão, imutabilidade e não duplicação
  (total: 175 testes).
- Revisão concluída; Fase 4 autorizada.

## Fase 4 — Histórico financeiro, estatísticas e persistência ✅

- IndexedDB versão 1 com 11 stores, índices, transações atômicas e migração
  sem apagar dados; fallback em memória quando o navegador bloqueia o banco.
- Compra ilimitada de bilhetes: IDs únicos, bilhetes idênticos permitidos, lotes
  de milhares em uma transação, sem limite artificial.
- Ledger em centavos com chaves de idempotência para compras e premiações;
  nenhuma premiação é contada duas vezes.
- Painel financeiro com totais, saldo líquido, premiados, filtros, paginação e
  evolução acumulada; renderização limitada a 25 lançamentos e 50 cartões.
- Estatísticas descritivas cronológicas, sem dados inventados nem promessas.
- Prêmio máximo de 15 acertos configurável; faixas 11/12/13 intactas.
- Exportação JSON/CSV e importação JSON por mesclagem validada e confirmada.
- 30 novos testes (total: 205). **Revisão concluída; Fase 5 autorizada.**

### Pendências de escopo (somente com nova autorização)

- Substituição completa do banco em importação.
- Indicadores preditivos de frequência, atraso e cobertura.

## Fase 5 — Integração visual avançada ✅

- Diagnóstico 5A registrado em `docs/FASE5-PLANO.md`, com backups antes de editar.
- Navegação com seis áreas (Sorteio, Apostas, Histórico, Financeiro,
  Estatísticas e Configurações), IDs antigos preservados e configuração/backup
  separados do histórico.
- Compra de 1, vários ou milhares de bilhetes com prévia de custo, confirmação,
  progresso, IDs individuais e proteção contra duplo clique.
- Gráficos SVG com dados reais e filtros; estados vazios explícitos e aviso de
  que estatísticas são descritivas, não preditivas.
- Resultado compartilhado entre globo e roleta, com progresso visível. Troca de
  apresentação, ritmos e velocidades sem gerar novo resultado.
- Responsividade para 390 px, 768 px e desktop, alvos de toque de 44 px e
  `prefers-reduced-motion` ampliado.
- Three.js carregado sob demanda em chunk separado; interface pronta antes do
  globo, sem remover física, mistura ou velocidades.
- 11 novos testes (total: 216), `npm test`, `npm run build` e `npm audit`
  validados; Fase 6 não iniciada e nenhum commit/push realizado.

### Complemento — Reiniciar simulação ✅

- Diálogo em Configurações com aviso integral e segunda confirmação por
  digitação de `REINICIAR`.
- Reset transacional de todas as stores de simulação, com preservação de
  `settings`, metadados pessoais e prêmio máximo configurado.
- Trava contra operações concorrentes, verificação pós-reset e mensagem de
  falha sem falso sucesso.
- Estado inicial do sorteio e todos os painéis atualizados automaticamente.
- 10 novos testes (total: 226); build, auditoria e navegador validados.

## Fase 6 — Estabilidade, Android e distribuição ✅

- 6A: auditoria completa, 0 vulnerabilidades, plano e backups prévios em
  `%LOCALAPPDATA%\Temp\opencode\fase6-backup`.
- 6B: portrait/landscape, modal, toque e teclado validados por viewport; sem
  dispositivo físico conectado (teste físico não realizado).
- 6C: fallback WebGL, perda/recuperação de contexto, pausa em aba oculto e no
  modo roleta; FPS medido em ~30 no ambiente de auditoria.
- 6D: reconexão IndexedDB e idempotência de compra testadas; nenhum reset em
  dados reais do usuário.
- 6E: mensagens seguras, `aria-busy`, guards de ação e log sem dados sensíveis.
- 6F: Lighthouse 1,0 em acessibilidade, boas práticas e SEO.
- 6G: PWA instalável com SW network-first, cache versionado e zero cache de
  dados; sem APK (exige autorização específica).
- 7 novos testes (total: 233); build, audit, navegador e Lighthouse validados.

## Fase 7 — Homologação final e versão 1.0 ✅

- 7A: auditoria somente leitura, 0 vulnerabilidades, 19 backups prévios e plano
  em `docs/FASE7-HOMOLOGACAO.md`.
- 7B: fluxo integrado em origem isolada, incluindo bilhetes de 15 a 20 dezenas,
  lote, conferência, apresentação, recarga, exportação/importação e reset.
- 7C: integridade matemática/financeira confirmada, sem recálculo retroativo ao
  alterar prêmios.
- 7D: 1.000/5.000/10.000 bilhetes gravados em ~0,35/1,76/3,80 s; 16.001
  bilhetes íntegros, sem duplicatas; backup de ~16,5 MB e estatísticas ~0,9 s.
- 7E: recarga durante compra sem gravação parcial, duplo clique idempotente,
  guard de exportação, BFCache e contexto WebGL sem erros de console.
- 7F: manifesto, ícone, SW versionado, shell em cache e nenhum dado no Cache
  API. Instalação em tela inicial não verificada em dispositivo.
- 7G: sem ADB e sem dispositivo conectado; teste físico do Moto G35 pendente.
- 7H: duas falhas corrigidas — concurso-fantasma ao conferir duas vezes e perda
  de contadores/configurações na importação após reset.
- 3 novos testes (total: 236), `npm test`, `npm run build`, `npm audit`,
  navegador e PWA validados. Versão `1.0.0`. Nenhum commit/push/deploy.

## Fase 8 — Aplicativo Android e APK de depuração ✅

- 8A: Android Studio/SDK/JDK mapeados; Capacitor escolhido em vez de TWA ou
  WebView manual por gerar APK local sem publicar o PWA. JDK 17 rejeitado
  (exige Java 21); build com Temurin 21.
- 8B: pacote `com.zappazero8019.simuladorlotofacil`, nome Simulador Lotofácil,
  ícone adaptativo/splash próprios, tema escuro, orientação livre, barras
  escuras, safe areas, teclado `adjustResize`, voltar e ciclo de vida.
- 8C: mesmo bundle da web; `src/androidBridge.js` nativo sob demanda, sem
  duplicar motor, regras ou persistência.
- 8D: IndexedDB em `https://localhost`, assets embutidos para offline;
  nenhum dado no Cache API e nenhum reset em banco real.
- 8E: sem dispositivo, medições Android não realizadas; roleta segue como
  fallback de WebGL sem alterar física ou matemática.
- 8F: APK de depuração gerado em `android/app/build/outputs/apk/debug/app-debug.apk`
  (~5,07 MB, `versionName` 1.0.0, minSdk 24, targetSdk 36, somente INTERNET).
- 8G: `adb devices` vazio; instalação e testes físicos pendentes.
- 4 novos testes (total: 240), `npm test`, `npm run build`, `npm audit`,
  navegador e PWA validados. Versão web 1.0.0 preservada. Nenhum commit,
  push, deploy ou Fase 9 naquele momento.

## Fase 9 — áudio, extração animada, comemoração e modo de teste (concluída em 20/11/2026)

- 9A: preferências em `settings` (música, efeitos, volumes, modo de teste e
  probabilidade) validadas em `src/settings/preferences.js`, gravadas por
  `setPreference()` e preservadas no reset da simulação.
- 9B: áudio Web Audio procedural (`src/audio/engine.js`) com unlock por gesto,
  nove efeitos, loop original, fade de saída, volumes independentes,
  pausa/retomada por razão e descarte no AndroidBridge/`pagehide`.
- 9C: extração 3D pela abertura superior com halo, número ampliado, remoção do
  conjunto interno e respeito a `prefers-reduced-motion`; roleta mantém os
  mesmos ganchos sem WebGL.
- 9D: comemoração com mensagens exatas e fogos proporcionais ao valor recebido;
  results individuais e resumo para múltiplos bilhetes.
- 9E: modo de teste com RNG separado (`crypto.getRandomValues`), injetável, sem
  reclassificar contemplações reais e sem qualquer efeito financeiro.
- 9F: 29 novos testes (total: 269), `npm test`, `npm run build`, `npm audit`
  (0 vulnerabilidades), console do navegador limpo e novo APK de depuração
  (~5,17 MB, `versionName` 1.0.0). `adb devices` segue vazio. Nenhum commit,
  push, deploy, versão assinada ou Fase 10.
