# Arquitetura

## Visão geral

A aplicação será uma SPA (Single Page Application) executada inteiramente no
navegador, sem backend nesta etapa. O Vite cuida do desenvolvimento e do build;
o código é organizado em módulos ES nativos e separado por responsabilidade de
domínio.

## Decisões arquiteturais

1. **Sem framework de UI.** HTML5 + CSS3 + JavaScript modules mantêm a base
   pequena e transparente; a interface será construída em `src/ui/`.
2. **Núcleo isolado.** O motor matemático em `src/core/` não deve depender de
   DOM, UI, Three.js nem de persistência. Isso o torna determinístico e
   testável com Vitest.
3. **Domínios separados.** Apostas, sorteios, premiações, finanças,
   estatísticas e histórico vivem em diretórios próprios para evitar um
   "arquivo único" de regras.
4. **Resultado antes da apresentação.** `src/draws/session.js` é o único ponto
   que chama `drawNumbers()`. O resultado é validado e congelado antes de
   qualquer animação. `presentation.js` controla o tempo; `presentationModes.js`
   define os ritmos; `show.js` escolhe a view. Nenhum desses módulos gera números.
5. **Visualização desacoplada.** Three.js fica confinado em
   `src/visualization/`. A cena 3D consome dados já calculados; ela não
   decide regras do jogo. A extração apenas posiciona bolas cujos números
   foram recebidos do controlador.
6. **Roleta sem WebGL.** `src/ui/roletaModel.js` mantém o estado puro dos 15
   compartimentos e `roleta.js` renderiza em DOM com CSS, reutilizando os
   mesmos elementos. A roleta não sortea nem valida regras oficiais.
6a. **Velocidade separada da física.** A rampa da mistura e a duração das
   transições respondem ao ritmo escolhido, mas o `delta` enviado a
   `world.step()` permanece o real. O timestep fixo e as colisões nunca são
   acelerados para "ganhar tempo"; no modo instantâneo a mistura é interrompida
   e as bolas vão direto aos slots.
6b. **Apostas sem segundo motor.** `src/bets/` concentra seleção, Surpresinha,
   cadastro, Teimosinha, bolões e conferência. Toda a matemática vem de
   `src/core/` e `src/prizes/`; nenhuma função é duplicada. Volante, cadastro e
   rateio são puros e testáveis sem DOM. A interface (`src/ui/volante.js` e
   `src/ui/betsPanel.js`) apenas consome esses módulos e nunca gera números.
6c. **Conferência pela fonte congelada.** A conferência lê somente
   `session.getFrozenResult()`, nunca os números exibidos no globo ou na roleta.
   A troca de modo visual não refaz nem altera conferências.
6d. **Ledger e agregados.** `src/finance/` aplica eventos em centavos inteiros
   de forma pura; `src/history/service.js` grava bilhete, evento e agregado na
   mesma transação. Chaves `ticket:<id>` e `prize:<conferência>:<faixa>` impedem
   contabilização duplicada.
6e. **Estatísticas cronológicas.** `src/statistics/` usa apenas eventos reais e
   a sequência `seq`; não preenche períodos vazios nem faz previsões.
7. **Persistência abstrata.** `src/persistence/` expõe uma API assíncrona
   comum (`get`, `query`, `snapshot`, `transaction`) implementada por
   `indexedDbStore.js` e `memoryStore.js`. O esquema e a migração ficam em
   `schema.js`; exportação/importação em `backup.js`. Nenhum dado é apagado em
   upgrade.
8. **Graphify fora do runtime.** A ferramenta é usada apenas para análise e
   documentação da arquitetura; não faz parte do bundle nem das dependências
   npm.
9. **Resiliência da visualização (Fase 6).** `webglSupport.js` verifica WebGL em
   canvas descartável; `deferredVisualization.js` aborta a fila após falha e
   expõe controle de animação. `visualization/index.js` reage a perda de
   contexto, `visibilitychange` e redimensionamento do `visualViewport`. A
   roleta continua funcional com o mesmo resultado congelado.
10. **BFCache e reconexão (Fase 6).** `main.js` só dispoe a interface em
   `pagehide` não persistido. `indexedDbStore.js` invalida a promise da conexão
   quando o banco fecha ou é bloqueado, permitindo abrir novamente sem recarregar.
11. **Distribuição sem cache de dados (Fase 6).** O service worker é
   network-first, versionado pelo hash do bundle e guarda apenas o shell visual;
   IndexedDB e backups nunca passam pelo Cache API. `base: './'` mantém os
   assets relativos em subdiretórios.

## Mapa de diretórios

| Diretório | Responsabilidade prevista |
| --- | --- |
| `src/ui/` | Componentes, eventos e renderização da interface |
| `src/core/` | Combinatória, validações e operações matemáticas puras |
| `src/bets/` | Volante, Surpresinha, cadastro, Teimosinha, bolões e conferência |
| `src/draws/` | Sorteios e resultados |
| `src/prizes/` | Contagem de faixas (11–15) e valores simulados de referência |
| `src/finance/` | Saldo, custos, ganhos e fluxo financeiro |
| `src/statistics/` | Agregações e indicadores |
| `src/history/` | Linha do tempo de apostas e sorteios |
| `src/visualization/` | Cena Three.js e recursos gráficos 3D |
| `src/persistence/` | Serialização e acesso a dados locais |

## Fluxo de dados previsto

```text
UI (ui) -> show (draws) -> session (draws) -> motor matemático (core)
                                      |-> resultado congelado
show -> presentation (tempo, pausa, velocidade)
     -> view globo (visualization/extraction) ou view roleta (ui/roleta)
UI -> apostas (bets) -> premiações (prizes) -> conferência (bets/conference)
   -> finance (ledger/aggregates) -> persistence (IndexedDB)
   -> history (filtros/paginação) -> statistics (descritiva)
```

O resultado flui em uma única direção: o motor determina os números, a sessão
os congela e as views apenas os apresentam. Física, animação e velocidade nunca
alimentam o motor. Na Fase 4, o ciclo `apostas → premiações → conferência →
finance → persistência → histórico/estatísticas` está implementado. A restauração
apenas lê registros: não gera novas apostas, não refaz sorteios e não recomputa
conferências antigas com configurações novas.

Na Fase 5, `src/ui/navigation.js` coordena as seis áreas, `src/ui/purchase.js`
valida apenas a intenção de compra, `src/ui/charts.js` desenha séries a partir
dos eventos já persistidos e `src/ui/deferredVisualization.js` adia o módulo
Three.js sem alterar a API de `createVisualization`. O proxy enfileira comandos
de apresentação enquanto o chunk 3D carrega; nenhuma decisão matemática passa
por essa camada.

## Camada Android (Fase 8)

O diretório `android/` é gerado pelo Capacitor e consome `dist/`; ele não contém
regras de negócio. `src/main.js` chama `installAndroidBridge(ui)`, que verifica
`Capacitor.getPlatform() === 'android'` antes de importar `@capacitor/app` e
`SystemBars`. No navegador esses chunks não são baixados.

A ponte trata apenas integração nativa:

- `backButton`: cancela o modal de reset, volta à aba Sorteio ou `App.exitApp()`.
- `appStateChange`: pausa/retoma a apresentação em andamento, sem tocar na
  matemática, na física ou em registros gravados.
- `SystemBars`: barras escuras com conteúdo claro, complementando o tema CSS.

A origem `https://localhost` do WebView mantém IndexedDB estável entre aberturas
e atualizações; os assets do shell estão embutidos no APK, então o funcionamento
offline não depende exclusivamente do service worker. Safe areas já eram
tratadas em `src/styles.css` com `env(safe-area-inset-*)`.

## Convenções

- Arquivos de entrada de domínio: `index.js`.
- Testes: `tests/**/*.test.js`, executados por `npm test`.
- Configuração do Vite/Vitest: `vite.config.js`.
- Idioma da documentação: português do Brasil.
- Nomes de módulos e diretórios: inglês, alinhados ao domínio.

## Histórico e restrições atuais

- Na Fase 0 não havia regras, globo 3D nem persistência; as Fases 1 a 6
  implementaram todas essas camadas, preservadas na homologação da Fase 7.
- Continua não havendo backend, pagamentos, integração com a CAIXA nem
  publicação em loja; existe apenas um APK de depuração para testes.
- Nenhum commit, push ou deploy foi realizado até o fim da Fase 8.
