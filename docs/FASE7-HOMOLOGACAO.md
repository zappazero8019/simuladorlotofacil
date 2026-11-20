# Fase 7 — Homologação final e versão 1.0

Data: 20/11/2026. Escopo exclusivamente Fase 7; Fase 8 não iniciada.

## 7A — Auditoria geral

- Inventário: 56 arquivos `.js` em `src/` (57 incluindo `styles.css`), 28
  arquivos de teste e 233 testes no início, Vite 8.3.8, Three.js 0.187.0 e
  Vitest 5.1.1. Nenhuma dependência adicionada.
- `npm audit`: 0 vulnerabilidades no diagnóstico.
- Nenhum arquivo temporário/resíduo de teste no projeto; `dist/` contém somente
  artefatos do build. Nenhum ID duplicado, import morto ou export duplicado.
- Backups prévios às alterações: `%LOCALAPPDATA%\Temp\opencode\fase7-backup`
  (19 arquivos).
- Inconsistências documentais encontradas e corrigidas ao final: metadados
  "Fase 0"/`0.0.0`, README/Roadmap marcando Fase 7 como não iniciada, contagem
  de módulos e a documentação sobre prêmio de 14 acertos.
- Não foi encontrada evidência de recálculo retroativo de conferências,
  premiações, ledger ou estatísticas ao alterar prêmios.

## Ambiente isolado

- Banco real do jogador: origem `http://127.0.0.1:4173` — **somente leitura**.
- Testes destrutivos: origem `http://localhost:4174` (preview dedicado), com
  IndexedDB distinto por porta. Nenhum reset foi executado na origem real.
- Sem ADB e sem dispositivo Android detectado (`adb` ausente também no REA).

## 7B — Fluxo integrado do jogador

Executado na origem isolada, com banco limpo no build final:

- Estado inicial zerado; bilhetes de 15, 16, 17, 18, 19 e 20 dezenas criados;
  lote de 100 bilhetes com confirmação; soma dos preços dos bilhetes igual ao
  total gasto.
- Sorteio com resultado congelado antes da apresentação; conferência de 106
  bilhetes no cenário inicial e premiações registradas no ledger.
- Histórico, estatísticas e gráficos consultados após a conferência.
- Alternância globo/roleta, alteração de velocidade, pausa e retomada sem erros.
- Recarga manteve bilhetes, gasto, recebido, concursos e conferências.
- Exportação JSON, reset com preservação de preferências, importação em banco
  limpo, importação repetida (tudo ignorado como duplicata) e backup inválido
  (rejeitado com mensagem clara, sem alterar dados).

## 7C — Integridade matemática e financeira

- C(25,15) = **3.268.760**; combinações de 15 a 20 dezenas:
  **1 / 16 / 136 / 816 / 3.876 / 15.504**.
- Probabilidades por faixa em aposta de 15 dezenas conferidas pela fórmula
  oficial C(15,x)·C(10,15−x): 11 acertos 286.650, 12 acertos 54.600,
  13 acertos 4.725, 14 acertos 150 e 15 acertos 1.
- Preços oficiais em centavos: 350, 5.600, 47.600, 285.600, 1.356.600 e
  5.426.400. Faixas fixas: R$ 7, 14 e 35. Valores de 14 e 15 configuráveis
  pelo serviço; overrides aplicados corretamente.
- Conferência de 11 a 15 acertos, bolões com rateio integral e Teimosinha
  (2, 3, 4, 6, 8, 9, 12, 18 e 24 concursos) validados.
- Ledger: gasto R$ 56.003,50 com 16.001 bilhetes após o teste de volume, soma
  dos preços idêntica; saldo líquido coerente com gasto e recebido.
- Ao alterar prêmios de 14 e 15, conferências, premiações, eventos financeiros
  e agregados gravados permaneceram **byte a byte idênticos**.

## 7D — Volume e uso prolongado

Build corrigido, banco isolado, sem limite artificial de quantidade:

| Operação | Resultado |
| --- | --- |
| 1.000 bilhetes | ~0,35 s, 1.000 criados, 0 duplicados |
| 5.000 bilhetes | ~1,76 s, 5.000 criados, 0 duplicados |
| 10.000 bilhetes | ~3,80 s, 10.000 criados, 0 duplicados |
| 16.001 bilhetes no total | IDs e `persistentKey` únicos; soma de preços = gasto |
| 10 concursos + 2.000 conferências | ~0,39 s, 214 premiações, 2.000 pares únicos |
| Estatísticas sobre 16 mil bilhetes | ~0,9 s |
| Exportação JSON | ~16,5 MB em ~1,2 s |
| Importação do próprio backup | ~1,7 s; 0 registros de domínio adicionados |
| Heap JS após o volume | ~52 MB |

Consultas paginadas levaram ~1,0 s no conjunto completo. O gargalo observado é
a leitura/agregação do histórico inteiro, não a gravação; não foi identificado
gargalo crítico, mas volumes muito altos podem causar jank em dispositivos
modestos.

## 7E — Falhas e recuperação

- Recarga no meio de uma compra de 500 bilhetes: nenhum registro parcial;
  gasto e eventos permaneceram íntegros.
- Mesma `clientKey` em compras repetidas: 10 bilhetes, não 20.
- Clique duplo em exportar: botão desabilitado com `aria-busy="true"` e
  reabilitado ao concluir, sem segunda exportação.
- Backup com versão inválida: rejeitado, dados intactos.
- Importação repetida: todos os registros de domínio ignorados.
- `pagehide`/`pageshow` com `persisted: true`: canvas e interface preservados.
- Perda de contexto WebGL e alternância de modos: nenhum erro de console.
- Reset interrompido por recarga não foi reproduzível como estado parcial: a
  operação é transacional (coberta por testes da Fase 5).

## 7F — PWA e distribuição

- Manifesto `display: standalone`, nome/ícone/start_url relativos presentes.
- Service worker ativo como `sw.js?v=<hash do bundle>`; cache único
  `simulador-lotofacil-shell-<hash>` contendo shell, CSS, JS e SVG.
- Nenhuma chave de IndexedDB, backup ou dado da simulação no Cache API.
- Versionamento por hash garante troca de cache e remoção do anterior; build
  limpo, sem artefatos antigos em `dist/`.
- Instalação pela tela inicial e abertura offline em dispositivo não foram
  verificadas em hardware. Nenhum APK, deploy, commit ou push.

## 7G — Teste físico Android

**Não realizado.** `adb` não está disponível e nenhum dispositivo foi detectado
(também pela consulta REA, que reportou binário ausente). A emulação de viewport
da Fase 6 permanece como evidência indireta, sem afirmar teste no Moto G35.

## 7H — Correções

1. **Concurso-fantasma ao conferir duas vezes.** Causa: `registerDraw` procurava
   duplicata apenas no concurso atual; a conferência manual registrava novamente
   o mesmo resultado após o concurso ter avançado. Correção: o serviço passou a
   deduplicar por `(sessionId, generation)` via índice `bySession`; a UI passa a
   geração da sessão. Backup antes da edição; teste de regressão incluído.
2. **Importação após reset perdia contadores/configurações.** Causa: `mergeBackup`
   tratava `meta` e `settings` como registros de domínio e ignorava chaves já
   existentes criadas com valores padrão no reset. Correção: `meta` e `settings`
   são restaurados do backup (outras stores continuam merge-only). Backup antes
   da edição; teste de regressão incluído.

Nenhuma outra alteração de código foi necessária. Nenhuma dependência foi
adicionada.

## Resultado final

- `npm test`: **29 arquivos, 236 testes OK** (3 novos).
- `npm run build`: OK — principal ~282 kB (80 kB gzip), 3D ~368 kB (90 kB gzip).
- `npm audit`: **0 vulnerabilidades**.
- Navegador: sem erros de console; persistência, WebGL, BFCache e guards OK.
- Versão do pacote: **1.0.0**; `dataset.phase = '7'`.
- Fases 0 a 6 preservadas, backups intactos, nenhum dado real apagado.

### Avaliação de prontidão

**Homologada para versão 1.0**, com uma pendência não crítica registrada: teste
físico no Moto G35 e instalação PWA em dispositivo. Não há falha crítica
conhecida que impeça a versão; a pendência deve ser executada quando houver
dispositivo e ADB disponíveis, sem alterar o código homologado salvo nova falha
comprovada.

### Limitações pendentes

- Suspensão real em Android, teclado virtual e pressão de memória não testados
  em hardware.
- Instalação/offline da PWA confirmada por cache/versionamento e código do SW,
  não por instalação efetiva na tela inicial.
- Agregações sobre o histórico muito grande podem levar ~1 s em desktop; em
  dispositivos modestos pode haver jank.
- `prefers-reduced-motion` e responsividade foram validados por CSS/Lighthouse
  e viewports, sem emulação de todas as media features.
- Nenhum commit, push ou deploy foi executado; Fase 8 não iniciada.
