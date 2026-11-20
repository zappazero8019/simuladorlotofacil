# Plano de implementação — Fase 4

## 1. Inspeção prévia

Estado verificado antes de qualquer alteração:

- `src/persistence/`, `src/finance/`, `src/statistics/` e `src/history/` são
  placeholders `export {}`.
- A Fase 3 já mantém `createBetRegistry()`, `conferenceBet()` e valores de prêmio
  em `src/prizes/prizeValues.js`.
- Nenhuma dependência de banco de dados existe; `indexedDB` é nativo do navegador.
- O ambiente de testes Vitest roda em `environment: 'node'`, sem IndexedDB.

## 2. Decisões arquiteturais

### 2.1 Quantidade ilimitada de bilhetes

- Cada bilhete é um registro próprio com **ID único e estável** (`crypto.randomUUID`,
  com fallback determinístico para testes).
- Bilhetes idênticos são registros distintos — a chave never é a combo de números.
- Compra em lote grava N bilhetes em **uma única transação**; o limite é apenas o
  do navegador/IndexedDB, nunca uma regra do jogo.
- Nenhuma lista é renderizada por completo: consultas usam índices, `limit`/offset
  e paginação progressiva.

### 2.2 Banco IndexedDB (versão 1)

| Store | Chave | Índices principais |
| --- | --- | --- |
| `tickets` | `id` | `byBatch`, `byContest`, `byCreatedAt`, `bySize` |
| `draws` | `id` | `byContest`, `bySession`, `byCreatedAt` |
| `sessions` | `id` | `byCreatedAt` |
| `teimosinha` | `id` | `byTicket`, `byContest` |
| `pools` | `id` | `byTicket` |
| `conferences` | `id` | `byTicket`, `byContest`, `byDraw`, `byCreatedAt` |
| `prizes` | `id` | `byConference`, `byTier`, `byContest` |
| `financialEvents` | `id` | `byKey` (único), `byType`, `byContest`, `bySize`, `byTier`, `byCreatedAt`, `bySeq` |
| `aggregates` | `key` | — (`totals`, `contest:<n>`, `size:<n>`, `tier:<n>`) |
| `settings` | `key` | — |
| `meta` | `key` | — (`schema`, `sequence`) |

Todas as gravações relacionadas (bilhete + evento + agregados) ocorrem na **mesma
transação**. A chave `byKey` do ledger garante idempotência:
`ticket:<id>` para compras e `prize:<conferenceId>:<tier>` para premiações.

### 2.3 Migração

`onupgradeneeded` cria somente stores/índices ausentes; **nunca apaga dados**.
`migrate(db, oldVersion, newVersion)` é um despacho versionado para evoluções
futuras. A versão atual fica em `meta/schema`.

### 2.4 Finanças e estatísticas

- Valores monetários sempre em **centavos inteiros**.
- `src/finance/` contém o ledger puro (compras, premiações, saldo e agregados).
- `src/statistics/` calcula médias, máximos, custo até a primeira premiação e
  custo entre premiações usando a ordem cronológica real (`seq`).
- `src/history/` fornece filtros e paginação sobre eventos/bilhetes.

### 2.5 Prêmio configurável

O jogador pode configurar apenas o **prêmio máximo de 15 acertos**. Os valores
fixos de 11, 12 e 13 acertos (= R$ 7/14/35) nunca são sobrescritos. O valor
aplicado é gravado no evento/prêmio no momento da conferência; configurações
futuras não recalculam registros antigos.

### 2.6 Exportação / importação

- Exportação JSON versionada e relatório CSV do ledger.
- Importação **somente mesclagem** (`merge`), validada, com confirmação explícita
  na interface e proteção por ID/chave duplicada. Substituição completa do banco
  fica **pendente de aprovação específica**, conforme solicitado.

## 3. Sequência de implementação

1. Módulos puros (`finance`, `statistics`, `history`, `backup`).
2. Adaptadores de armazenamento (IndexedDB + memória para testes).
3. Serviço de histórico (compra em lote, premiação, consultas, config).
4. Integração com o painel de apostas e com a conclusão de sorteios.
5. Interface financeira com filtros, paginação, configuração e exportação.
6. Testes, build, auditoria e validação no navegador.

## 4. Fora de escopo

Fase 5, apostas reais, pagamentos, inferência estatística preditiva, promessa de
melhores chances futuras e substituição automática de banco em importação.
