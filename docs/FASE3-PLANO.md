# Plano de implementação — Fase 3

## 1. Inventário (inspeção prévia)

O motor matemático aprovado já fornece, e será **reutilizado sem duplicação**:

| Necessidade | Função existente | Origem |
| --- | --- | --- |
| Validar aposta/resultado | `validateBet`, `validateDraw`, `isValidNumber` | `src/core/validation.js` |
| Combinatória | `choose`, `countCombinations`, `generateCombinations`, `getCombinations`, `countCombinationsByTier` | `src/core/combinatorics.js` |
| Surpresinha | `generateSurpresinha(size, random)` | `src/bets/index.js` |
| Amostragem com `random` injetável | `sampleDistinct`, `sampleNumbers` | `src/core/sampling.js` |
| Constantes de regra | `MIN_NUMBER`, `MAX_NUMBER`, `MIN_BET_SIZE`, `MAX_BET_SIZE`, `DRAW_SIZE`, `PRIZE_TIERS`, `UNIVERSE` | `src/core/constants.js` |
| Conferência | `checkBet`, `checkSimpleCombination`, `countMatches` | `src/prizes/index.js` |
| Sessão imutável | `createDrawSession()` | `src/draws/session.js` |

`src/finance/`, `src/history/`, `src/statistics/` e `src/persistence/` hoje são apenas
placeholders `export {}`. Nenhum volante, teimosinha, bolão ou conferência em tela existe.

## 2. Regras oficiais confirmadas (CAIXA, consulta em 20/11/2026)

**Preços:** 15 → R$ 3,50 · 16 → R$ 56,00 · 17 → R$ 476,00 · 18 → R$ 2.856,00 ·
19 → R$ 13.566,00 · 20 → R$ 54.264,00.

**Teimosinha:** 2, 3, 4, 6, 8, 9, 12, 18 e 24 concursos consecutivos, sempre com a
mesma combinação. Bolão CAIXA **não** admite Teimosinha (Manual de Produtos 6.4.1.4).

**Bolão:** mínimo de 2 cotas; máximos por quantidade de números:
15 → 7 · 16 → 35 · 17 → 40 · 18 → 50 · 19 → 85 · 20 → 100.
O valor da cota é o total da aposta dividido pelas cotas, com truncamento na segunda
casa decimal (Manual 6.4.1.5/6.4.1.6); a última cota recebe o resíduo (6.4.1.9).
Todas as cotas têm a mesma chance de premiação.

**Faixas fixas:** 11 acertos = R$ 7,00 · 12 = R$ 14,00 · 13 = R$ 35,00.
As faixas de 14 e 15 acertos são variáveis por rateio; a simulação usará valores
de **referência estimados**, centralizados e explicitamente identificados como
ficção — nenhuma regra, probabilidade ou premiação oficial será alterada.

## 3. Módulos novos (lógica de negócio — sem DOM)

- `src/bets/pricing.js` — preços em centavos, limites de bolão, Teimosinha e formatação.
- `src/bets/volante.js` — seleção pura (máx. 20, sem duplicatas, limpar, confirmar ≥15).
- `src/bets/registry.js` — cadastro de apostas com os mesmos números congelados.
- `src/bets/teimosinha.js` — N concursos, mesma combinação, resultado por concurso.
- `src/bets/pool.js` — cotas, participantes fictícios, valor/percentual e rateio.
- `src/prizes/prizeValues.js` — valores de referência por faixa (centavos).
- `src/bets/conference.js` — conferência reutilizando `checkBet` + valores de referência.

## 4. Interface (sem lógica de negócio)

- `src/ui/volante.js` — grade 5×5, destaque, contador, preço, limpar/surpresinha.
- `src/ui/betsPanel.js` — cadastro, Teimosinha, bolão e conferência.
- `index.html` — abas **Sorteio** / **Apostas**, preservando todo o markup das Fases 2A–2D.
- `src/styles.css` — volante e painel responsivos (desktop/Android).
- `src/ui/index.js`, `src/main.js` — integração com a sessão existente e globals de validação.

## 5. Integração com o sorteio

A conferência lê **somente** `session.getFrozenResult()`. O painel de apostas não
lê os números exibidos na roleta/globo. Ao concluir um sorteio, o resultado é
atribuído ao próximo concurso pendente de cada Teimosinha e todas as apostas são
conferidas. Trocar globo ↔ roleta não refaz a conferência.

## 6. Testes

Novas suítes: preços/limites, volante, cadastro, surpresinha, Teimosinha, bolão,
conferência (11–15 acertos), integração com sessão, imutabilidade e isolamento.
Todos os 133 testes existentes devem continuar aprovados.

## 7. Fora de escopo

Histórico financeiro completo, persistência, pagamentos reais, Fase 4 e alterações
no motor matemático aprovado.
