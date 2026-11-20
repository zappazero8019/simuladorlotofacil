# Fase 5 — Plano: experiência do usuário, interface e otimização

## Escopo

Aprimorar a interface existente sem reconstruir a aplicação. Fases 0 a 4 ficam
preservadas. Nenhuma alteração em motor matemático, probabilidades, preços,
faixas, persistência, regras de Teimosinha/bolão/conferência, física do globo,
roleta ou modos de velocidade.

## Etapa 5A — Diagnóstico (concluído antes de qualquer edição)

Auditado em 20/11/2026 por leitura dos fontes e medição do DOM no navegador
(`http://127.0.0.1:4173/`, viewport 800 × 535). Nenhum sorteio foi gerado durante
a auditoria visual.

1. **Navegação:** apenas 3 abas. A aba Histórico acumula lançamentos,
   estatísticas, configuração de prêmio e backup. O requisito pede seis áreas
   distintas (Sorteio, Apostas, Histórico, Financeiro, Estatísticas,
   Configurações). Botões de aba com 34 px de altura no desktop.
2. **Compra de bilhetes:** sem campo de quantidade, sem prévia do custo total,
   sem confirmação visual de lote e sem progresso. `registerBet()` é assíncrono
   e não há travamento do botão: clique repetido pode duplicar a compra. O aviso
   sobre “todas na aba Histórico” não corresponde ao conteúdo dessa aba.
3. **Sorteio/roleta:** slots de resultado apenas no globo; progresso restrito ao
   rodapé global; menor clareza do resultado final na roleta.
4. **Financeiro/estatísticas:** apenas texto; nenhum gráfico. Cada atualização
   relê todos os eventos e bilhetes para calcular estatísticas.
5. **Responsividade:** uma coluna abaixo de 900 px; seis abas precisarão de
   barra rolável ou menu em 390 px. `prefers-reduced-motion` incompleto.
6. **Desempenho:** bundle único de 625 kB com Three.js importado estaticamente.
   Renderização de apostas já limitada a 50 cartões (manter).

Backups dos arquivos alteráveis foram criados em
`%LOCALAPPDATA%\Temp\opencode\fase5-backup` antes da Etapa 5B.

## Etapa 5B — Navegação

- Barra com seis destinos, mantendo os IDs existentes (`#aba-sorteio`,
  `#aba-apostas`, `#aba-historico`) e adicionando `#aba-financeiro`,
  `#aba-estatisticas`, `#aba-configuracoes`.
- Um único painel visível por vez; configurações (prêmio 15 e backup) saem do
  histórico e vão para Configurações.
- Navegação por teclado com `aria-current`/`aria-pressed` e barra rolável em
  telas estreitas, sem esconder destinos.

## Etapa 5C — Compra

- Campo de quantidade (padrão 1, sem teto artificial), prévia
  `quantidade × preço por bilhete = custo total`, número de dezenas e
  confirmação antes da gravação.
- Gravação em lotes com `requestAnimationFrame`/`setTimeout` apenas para
  ceder ao navegador quando necessário, preservando a transação única do
  serviço. Indicador de progresso e botão desabilitado durante a operação,
  eliminando duplo clique.
- Cartões com ID individual, resumo da última compra e link para o histórico
  filtrado pelo lote.

## Etapa 5D — Gráficos

- Gráficos SVG puros (sem dependências), gerados somente a partir de
  `getSummary()`, `getStatistics()` e `getEvents()`: evolução acumulada, saldo,
  premiações por faixa e gastos por concurso.
- Série vazia gera estado vazio explícito; nunca valores interpolados.
- Aviso permanente de que estatísticas são descritivas, não previsão.

## Etapa 5E — Apresentação

- Faixa de resultado compartilhada entre globo e roleta, com progresso
  `revelados/15` visível. Nenhuma mudança em `draws/` ou `visualization/`.
- Clareza extra apenas via CSS/HTML: contraste dos números, destaque do
  último número revelado e estado concluído.

## Etapa 5F — Responsividade/acabamento

- Alvos de toque ≥ 44 px em telas estreitas, campos com `inputmode="numeric"`,
  sem rolagem horizontal, gráficos com `viewBox` responsivo.
- `prefers-reduced-motion` ampliado para transições/ brilhos.
- Estados de carregamento, sucesso e erro com classes consistentes.

## Etapa 5G — Desempenho

- Importação dinâmica do módulo 3D com `import()` e divisor de código via
  Vite/Rolldown, mantendo a API pública de `createVisualization`.
- A UI é montada de imediato; o globo é carregado em segundo plano e recebe
  os comandos acumulados quando fica pronto. Sem remoção de funcionalidade.

## Etapa 5H — Entrega

- Testes: navegação, compra individual/lote/milhares, duplo clique, custo,
  recarga, indicadores, filtros, gráficos, globo, roleta, troca de modo sem
  novo resultado, velocidades, 390/768/desktop e console sem erros.
- `npm.cmd test`, `npm.cmd run build`, `npm.cmd audit`.
- Relatório final com 14 itens; Fase 6 não iniciada; sem commit/push.

## Status final

Etapas 5A a 5H concluídas. Os arquivos alterados foram preservados em
`%LOCALAPPDATA%\Temp\opencode\fase5-backup`. Nenhuma dependência foi adicionada,
nenhum cálculo/faixa/preço do motor foi alterado, nenhum resultado antigo foi
recalculado e nenhum commit/push foi realizado. Fase 6 permanece não iniciada.

## Complemento — Reiniciar simulação

Implementado como extensão da Fase 5. Backups prévios em
`%LOCALAPPDATA%\\Temp\\opencode\\fase5-reset-backup`. O reset é transacional,
preserva preferências, bloqueia operações concorrentes e só reporta sucesso
após verificar que todas as stores de simulação estão vazias. A confirmação
exige digitação de `REINICIAR`. Também foi corrigido o `paint()` do fluxo de
compra para não depender apenas de `requestAnimationFrame` em abas ocultas.
