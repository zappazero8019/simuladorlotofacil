import { formatCurrency } from '../bets/index.js';
import { friendlyError, logTechnicalError } from './errorHandler.js';
import { PRIZE_TIERS } from '../core/constants.js';
import { FIXED_PRIZE_VALUES_CENTS } from '../prizes/prizeValues.js';
import {
  balanceSeries,
  contestBars,
  renderBarChart,
  renderLineChart,
  tierBars,
} from './charts.js';

const percent = (value) => `${Number(value || 0).toFixed(2).replace('.', ',')}%`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function labeledValue(label, value, className = '') {
  const wrapper = element('div', `cartao-financeiro ${className}`.trim());
  wrapper.appendChild(element('span', 'cartao-financeiro-label', label));
  wrapper.appendChild(element('strong', 'cartao-financeiro-valor', value));
  return wrapper;
}

function paragraph(label, value) {
  const node = element('p', 'estatistica-linha');
  node.appendChild(element('strong', '', `${label}: `));
  node.appendChild(document.createTextNode(String(value)));
  return node;
}

function download(text, filename, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reaisToCents(value) {
  const amount = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Valor inválido.');
  return Math.round(amount * 100);
}

/** Painel financeiro/histórico: só consome o serviço, sem regras próprias. */
export function createHistoryPanel({ root = document, history, onReset = () => {} } = {}) {
  const find = (selector) => root.querySelector(selector);
  if (!history) return { refresh() {}, dispose() {} };

  const status = find('#historico-status');
  const summaryBox = find('#financeiro-resumo');
  const listBox = find('#historico-lista');
  const pageInfo = find('#historico-pagina');
  const moreButton = find('#historico-mais');
  const ticketBox = find('#historico-bilhetes');
  const ticketPageInfo = find('#bilhetes-pagina');
  const ticketMoreButton = find('#bilhetes-mais');
  const statsBox = find('#estatisticas-lista');
  const periodLabel = find('#financeiro-periodo');
  const charts = {
    evolution: find('#grafico-evolucao'),
    balance: find('#grafico-saldo'),
    contests: find('#grafico-concursos'),
    tiers: find('#grafico-faixas'),
  };
  const filters = {
    contest: find('#filtro-concurso'),
    size: find('#filtro-dezenas'),
    tier: find('#filtro-faixa'),
    type: find('#filtro-tipo'),
    from: find('#filtro-de'),
    to: find('#filtro-ate'),
  };
  const financeFilters = {
    contest: find('#filtro-financeiro-concurso'),
    from: find('#filtro-financeiro-de'),
    to: find('#filtro-financeiro-ate'),
  };
  const listeners = [];
  let currentPage = 1;
  let currentTicketPage = 1;
  let refreshing = false;
  let pendingRefresh = null;

  function setStatus(message, kind = '') {
    if (!status) return;
    status.textContent = message;
    status.className = `mensagem ${kind}`.trim();
  }

  function setOptions(select, values, placeholder) {
    if (!select) return;
    const keep = select.value;
    select.replaceChildren();
    const first = element('option', '', placeholder);
    first.value = '';
    select.appendChild(first);
    for (const value of values) {
      const option = element('option', '', String(value));
      option.value = String(value);
      select.appendChild(option);
    }
    select.value = [...select.options].some((option) => option.value === keep) ? keep : '';
  }

  function readFilters() {
    const result = {};
    if (filters.contest?.value) result.contest = Number(filters.contest.value);
    if (filters.size?.value) result.size = Number(filters.size.value);
    if (filters.tier?.value) result.tier = Number(filters.tier.value);
    if (filters.type?.value) result.type = filters.type.value;
    if (filters.from?.value) result.from = filters.from.value;
    if (filters.to?.value) result.to = filters.to.value;
    return result;
  }

  function readFinanceFilters() {
    const result = {};
    if (financeFilters.contest?.value) result.contest = Number(financeFilters.contest.value);
    if (financeFilters.from?.value) result.from = financeFilters.from.value;
    if (financeFilters.to?.value) result.to = financeFilters.to.value;
    return result;
  }

  function describePeriod(filtersApplied) {
    if (!Object.keys(filtersApplied).length) return 'Gráficos mostram todo o histórico.';
    const parts = [];
    if (filtersApplied.contest) parts.push(`concurso ${filtersApplied.contest}`);
    if (filtersApplied.from) parts.push(`de ${filtersApplied.from}`);
    if (filtersApplied.to) parts.push(`até ${filtersApplied.to}`);
    return `Gráficos filtrados por ${parts.join(' · ')}.`;
  }

  function renderSummary(summary) {
    if (!summaryBox) return;
    summaryBox.replaceChildren(
      labeledValue('Total gasto', formatCurrency(summary.spentCents)),
      labeledValue('Total recebido', formatCurrency(summary.receivedCents)),
      labeledValue('Saldo líquido', formatCurrency(summary.netCents),
        summary.netCents >= 0 ? 'positivo' : 'negativo'),
      labeledValue('Bilhetes comprados', String(summary.ticketCount)),
      labeledValue('Concursos participados', String(summary.contestsWithDraws)),
      labeledValue('Bilhetes premiados', `${summary.awardedTickets} (${percent(summary.awardedPercentage)})`),
    );
  }

  function renderEventRow(event) {
    const row = element('div', 'linha-evento');
    const kind = event.type === 'ticket' ? 'Compra' : 'Premiação';
    row.appendChild(element('span', `evento-tipo ${event.type}`, kind));
    row.appendChild(element('span', 'evento-detalhe',
      `concurso ${event.contest} · ${event.size ? `${event.size} dezenas` : '—'}`
      + `${event.tier ? ` · ${event.tier} acertos` : ''}`));
    row.appendChild(element('strong', 'evento-valor', formatCurrency(event.amountCents)));
    row.appendChild(element('span', 'evento-data', String(event.createdAt).slice(0, 10)));
    return row;
  }

  function renderEvents(page) {
    if (!listBox) return;
    listBox.replaceChildren();
    if (!page.items.length) {
      listBox.appendChild(element('p', 'vazio', 'Nenhum lançamento para os filtros atuais.'));
    } else {
      for (const event of page.items) listBox.appendChild(renderEventRow(event));
    }
    if (pageInfo) {
      pageInfo.textContent = `${page.items.length} de ${page.total} lançamentos`
        + ` · página ${page.page}/${page.totalPages}`;
    }
    if (moreButton) moreButton.disabled = !page.hasMore;
  }

  function renderTickets(page) {
    if (!ticketBox) return;
    ticketBox.replaceChildren();
    if (!page.items.length) {
      ticketBox.appendChild(element('p', 'vazio', 'Nenhum bilhete para os filtros atuais.'));
    } else {
      for (const ticket of page.items) {
        const row = element('div', 'linha-evento');
        row.appendChild(element('span', 'evento-tipo ticket', `#${ticket.displayId ?? ticket.id}`));
        row.appendChild(element('span', 'evento-detalhe',
          `concurso ${ticket.contest} · ${ticket.size} dezenas`
          + `${ticket.contests > 1 ? ` · Teimosinha ${ticket.contests}` : ''}`));
        row.appendChild(element('strong', 'evento-valor', formatCurrency(ticket.priceCents)));
        row.appendChild(element('span', 'evento-data', String(ticket.createdAt).slice(0, 10)));
        ticketBox.appendChild(row);
      }
    }
    if (ticketPageInfo) {
      ticketPageInfo.textContent = `${page.items.length} de ${page.total} bilhetes`
        + ` · página ${page.page}/${page.totalPages}`;
    }
    if (ticketMoreButton) ticketMoreButton.disabled = !page.hasMore;
  }

  function renderCharts(events, filtersApplied) {
    const series = balanceSeries(events);
    renderLineChart(charts.evolution, {
      series,
      emptyMessage: 'Sem lançamentos no período selecionado.',
      lines: [
        { key: 'spentCents', color: '#f59e0b', label: 'Gasto acumulado' },
        { key: 'receivedCents', color: '#14b8a6', label: 'Recebido acumulado' },
      ],
    });
    renderLineChart(charts.balance, {
      series,
      emptyMessage: 'Sem lançamentos no período selecionado.',
      lines: [{ key: 'netCents', color: '#38bdf8', label: 'Saldo acumulado' }],
    });
    renderBarChart(charts.contests, {
      bars: contestBars(events),
      color: '#f59e0b',
      emptyMessage: 'Nenhuma compra no período selecionado.',
    });
    renderBarChart(charts.tiers, {
      bars: tierBars(events),
      color: '#14b8a6',
      emptyMessage: 'Nenhuma premiação no período selecionado.',
    });
    if (periodLabel) periodLabel.textContent = describePeriod(filtersApplied);
  }

  function renderStatistics(stats, summary) {
    if (!statsBox) return;
    statsBox.replaceChildren();
    const rows = [
      ['Bilhetes por concurso', stats.perContest
        .map((item) => `${item.contest}: ${item.ticketCount}`).join(' · ') || '—'],
      ['Média de bilhetes por concurso', stats.averageTicketsPerContest.toFixed(2).replace('.', ',')],
      ['Média de gastos por concurso', formatCurrency(Math.round(stats.averageSpendPerContest))],
      ['Maior gasto em um concurso', formatCurrency(stats.maxSpendInContestCents)],
      ['Maior premiação recebida', formatCurrency(stats.maxPrizeCents)],
      ['Relação retorno/investimento', stats.returnOnInvestment === null
        ? '—' : stats.returnOnInvestment.toFixed(3).replace('.', ',')],
      ['Prêmios por faixa', stats.prizesByTier
        .map((item) => `${item.tier}: ${formatCurrency(item.totalCents)}`).join(' · ') || '—'],
      ['Custo até a 1ª premiação', stats.firstPrizeCosts
        .map((item) => `${item.tier}: ${formatCurrency(item.spentCentsBeforePrize)}`).join(' · ') || '—'],
      ['Custo entre premiações', stats.consecutivePrizeCosts
        .map((item) => `${item.tier}: ${formatCurrency(item.spentCentsBetween)}`).join(' · ') || '—'],
      ['Saldo acumulado', formatCurrency(summary.netCents)],
    ];
    for (const [label, value] of rows) statsBox.appendChild(paragraph(label, value));
    const note = element('p', 'ajuda',
      'Estatísticas descritivas do histórico real. Não são previsão nem promessa de chances futuras; '
      + 'saldo positivo não representa vantagem matemática.');
    statsBox.appendChild(note);
  }

  function renderSettings(summary) {
    const maxInput = find('#config-premio-15');
    if (maxInput && document.activeElement !== maxInput) {
      maxInput.value = (summary.prizeValues[15] / 100).toFixed(2);
    }
    const fixed = find('#config-faixas-fixas');
    if (fixed) {
      fixed.textContent = PRIZE_TIERS.filter((tier) => FIXED_PRIZE_VALUES_CENTS[tier] !== undefined)
        .map((tier) => `${tier} acertos: ${formatCurrency(FIXED_PRIZE_VALUES_CENTS[tier])}`)
        .join(' · ');
    }
    const configured = find('#config-premio-maximo');
    if (configured) {
      configured.textContent = `Prêmio máximo configurado: ${formatCurrency(summary.prizeValues[15])}`
        + ` · referência de 14 acertos: ${formatCurrency(summary.prizeValues[14])}`;
    }
  }

  async function refresh({ resetPage = false } = {}) {
    // Cliques rápidos em filtros não são perdidos: consolida-se a última intenção.
    if (refreshing) {
      pendingRefresh = { resetPage: pendingRefresh?.resetPage || resetPage };
      return;
    }
    refreshing = true;
    try {
      if (resetPage) {
        currentPage = 1;
        currentTicketPage = 1;
      }
      const filtersApplied = readFilters();
      const financeApplied = readFinanceFilters();
      const [summary, stats, page, ticketPage, chartPage] = await Promise.all([
        history.getSummary(),
        history.getStatistics(),
        history.getEvents(filtersApplied, { page: currentPage, pageSize: 25 }),
        history.getTickets(filtersApplied, { page: currentTicketPage, pageSize: 25 }),
        history.getEvents(financeApplied, { page: 1, pageSize: Number.MAX_SAFE_INTEGER }),
      ]);
      setOptions(filters.size, [15, 16, 17, 18, 19, 20], 'Todas as dezenas');
      setOptions(filters.tier, PRIZE_TIERS, 'Todas as faixas');
      setOptions(filters.type, ['ticket', 'prize'], 'Todos os tipos');
      renderSummary(summary);
      renderEvents(page);
      renderTickets(ticketPage);
      renderCharts(chartPage.items, financeApplied);
      renderStatistics(stats, summary);
      renderSettings(summary);
    } catch (error) {
      setStatus(`Erro ao carregar histórico: ${error.message}`, 'erro');
    } finally {
      refreshing = false;
      if (pendingRefresh) {
        const next = pendingRefresh;
        pendingRefresh = null;
        refresh(next);
      }
    }
  }

  function on(selector, event, handler) {
    const elementRef = find(selector);
    if (!elementRef) return;
    const listener = (...args) => handler(...args);
    elementRef.addEventListener(event, listener);
    listeners.push(() => elementRef.removeEventListener(event, listener));
  }

  on('#filtro-aplicar', 'click', () => refresh({ resetPage: true }));
  on('#filtro-limpar', 'click', () => {
    for (const input of Object.values(filters)) if (input) input.value = '';
    refresh({ resetPage: true });
  });
  on('#historico-mais', 'click', () => {
    guardAction('#historico-mais', async () => {
      currentPage += 1;
      await refresh();
    }, 'pagina historico');
  });
  on('#bilhetes-mais', 'click', () => {
    guardAction('#bilhetes-mais', async () => {
      currentTicketPage += 1;
      await refresh();
    }, 'pagina bilhetes');
  });
  on('#filtro-financeiro-aplicar', 'click', () => refresh());
  on('#filtro-financeiro-limpar', 'click', () => {
    for (const input of Object.values(financeFilters)) if (input) input.value = '';
    refresh();
  });
  /** Botões de ação única: desabilita durante a operação e nunca finge sucesso. */
  function guardAction(selector, task, label) {
    const button = find(selector);
    if (!button || button.dataset.busy === 'true') return;
    button.dataset.busy = 'true';
    const previous = button.disabled;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    Promise.resolve()
      .then(task)
      .catch((error) => {
        logTechnicalError(label, error);
        setStatus(friendlyError(error), 'erro');
      })
      .finally(() => {
        button.disabled = previous;
        button.removeAttribute('aria-busy');
        delete button.dataset.busy;
      });
  }

  on('#config-premio-salvar', 'click', () => {
    const input = find('#config-premio-15');
    if (!input) return;
    guardAction('#config-premio-salvar', async () => {
      await history.setMaxPrize15Cents(reaisToCents(input.value));
      setStatus('Prêmio máximo atualizado. Apostas antigas mantêm seus valores.', 'sucesso');
      await refresh({ resetPage: true });
    }, 'salvar premio');
  });
  on('#exportar-json', 'click', () => {
    guardAction('#exportar-json', async () => {
      const backup = await history.exportJson();
      download(JSON.stringify(backup, null, 2), 'simulador-lotofacil-backup.json', 'application/json');
      setStatus('Backup JSON exportado.', 'sucesso');
    }, 'exportar json');
  });
  on('#exportar-csv', 'click', () => {
    guardAction('#exportar-csv', async () => {
      const csv = await history.exportCsv();
      download(`\ufeff${csv}`, 'simulador-lotofacil-ledger.csv', 'text/csv;charset=utf-8');
      setStatus('Relatório CSV exportado.', 'sucesso');
    }, 'exportar csv');
  });
  on('#importar-json', 'change', async (event) => {
    const file = event.target.files?.[0];
    const confirm = find('#confirmar-importacao')?.checked === true;
    if (!file) return;
    if (!confirm) {
      setStatus('Marque a confirmação antes de importar. Nenhum dado foi alterado.', 'erro');
      event.target.value = '';
      return;
    }
    try {
      const payload = JSON.parse(await file.text());
      const result = await history.importBackup(payload, { confirm: true });
      const total = Object.values(result.added).reduce((sum, value) => sum + value, 0);
      setStatus(`Importação concluída: ${total} registro(s) mesclado(s). Nada foi substituído.`, 'sucesso');
      await refresh({ resetPage: true });
    } catch (error) {
      setStatus(`Importação recusada: ${error.message}`, 'erro');
    } finally {
      event.target.value = '';
    }
  });

  // ---- Reiniciar simulação -------------------------------------------------
  const modal = find('#modal-reset');
  const confirmInput = find('#modal-reset-confirmar');
  const confirmButton = find('#modal-reset-confirmar-btn');
  const modalError = find('#modal-reset-erro');
  let resetting = false;
  let previousFocus = null;

  function setModalError(message) {
    if (!modalError) return;
    modalError.textContent = message;
    modalError.hidden = !message;
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    if (confirmInput) confirmInput.value = '';
    if (confirmButton) confirmButton.disabled = true;
    setModalError('');
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    previousFocus = null;
  }

  function openModal() {
    if (!modal || resetting) return;
    previousFocus = document.activeElement;
    modal.hidden = false;
    setModalError('');
    if (confirmInput) {
      confirmInput.value = '';
      confirmInput.focus();
    }
  }

  function syncConfirmButton() {
    if (confirmButton) confirmButton.disabled = confirmInput?.value.trim() !== 'REINICIAR';
  }

  async function executeReset() {
    if (resetting) return;
    resetting = true;
    if (confirmButton) confirmButton.disabled = true;
    if (confirmInput) confirmInput.disabled = true;
    setModalError('');
    if (status) setStatus('Reiniciando simulação…', '');
    try {
      const result = await history.resetSimulation({ confirm: true });
      if (!result?.ok) throw new Error('O serviço não confirmou a conclusão do reinício.');
      await onReset();
      currentPage = 1;
      currentTicketPage = 1;
      await refresh({ resetPage: true });
      closeModal();
      setStatus('Simulação reiniciada. Configurações e preferências foram preservadas.', 'sucesso');
    } catch (error) {
      setModalError(`Não foi possível reiniciar: ${error.message}. Nenhum dado foi alterado.`);
      if (status) setStatus(`Falha ao reiniciar: ${error.message}. Nenhum dado foi alterado.`, 'erro');
    } finally {
      resetting = false;
      if (confirmInput) confirmInput.disabled = false;
      if (confirmButton) confirmButton.disabled = confirmInput?.value.trim() !== 'REINICIAR';
    }
  }

  on('#reiniciar-simulacao', 'click', openModal);
  on('#modal-reset-cancelar', 'click', closeModal);
  on('#modal-reset-confirmar', 'input', syncConfirmButton);
  on('#modal-reset-confirmar-btn', 'click', executeReset);
  if (modal) {
    const onBackdrop = (event) => {
      if (event.target === modal && !resetting) closeModal();
    };
    modal.addEventListener('click', onBackdrop);
    listeners.push(() => modal.removeEventListener('click', onBackdrop));
    const onKeyDown = (event) => {
      if (modal.hidden) return;
      if (event.key === 'Escape' && !resetting) {
        event.preventDefault();
        closeModal();
      }
      if (event.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    listeners.push(() => document.removeEventListener('keydown', onKeyDown));
  }

  return {
    refresh,
    openResetModal: openModal,
    closeResetModal: closeModal,
    dispose() {
      for (const off of listeners) off();
      listeners.length = 0;
    },
  };
}
