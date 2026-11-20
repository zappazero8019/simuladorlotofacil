import {
  assignContestResult,
  conferenceBet,
  createBetRegistry,
  createPool,
  createVolante,
  formatCurrency,
  generateSurpresinha,
  getBetPriceCents,
  getSharePriceCents,
  isTeimosinhaContestCount,
  TEIMOSINHA_CONTEST_COUNTS,
  validatePoolShares,
} from '../bets/index.js';
import { countCombinations, MAX_BET_SIZE, MIN_BET_SIZE } from '../core/index.js';
import { conferenceKey, describeChampions } from '../results/champion.js';
import { createVolanteUI } from './volante.js';
import {
  computePurchasePreview,
  createPurchaseGuard,
  describePurchase,
  normalizeQuantity,
  purchaseSignature,
} from './purchase.js';

const pad = (number) => String(number).padStart(2, '0');
const numbersText = (numbers) => numbers.map(pad).join(' ');

/** Painel de apostas: apenas liga a lógica de `src/bets/` ao DOM. */
export function createBetsPanel({
  root = document,
  getResult = () => null,
  history = null,
  sessionId = null,
  getContest = () => 1,
  getGeneration = () => null,
  onDataChange = () => {},
  onDrawConferred = () => {},
} = {}) {
  const find = (selector) => root.querySelector(selector);
  const volante = createVolante();
  const registry = createBetRegistry();
  const conferences = [];
  const listeners = [];
  const RENDER_LIMIT = 50;
  let persistenceQueue = Promise.resolve();
  let localSessionId = sessionId;
  const purchaseGuard = createPurchaseGuard();
  let buying = false;
  // Apenas apresentação: o campeão é derivado de conferências já calculadas.
  let champion = describeChampions([]);

  const volanteUI = createVolanteUI({
    container: find('#volante'),
    onToggle(number) {
      volante.toggle(number);
      purchaseGuard.disarm();
      if (buttonCadastrar && !buying) buttonCadastrar.textContent = 'Cadastrar aposta';
      refreshVolante();
    },
  });

  const status = find('#apostas-status');
  const quantity = find('#volante-quantidade');
  const price = find('#volante-preco');
  const combinations = find('#volante-combinacoes');
  const surpresinhaSize = find('#surpresinha-tamanho');
  const contestSelect = find('#teimosinha-contestos');
  const poolToggle = find('#bolao-ativo');
  const poolShares = find('#bolao-cotas');
  const poolParticipants = find('#bolao-participantes');
  const poolSummary = find('#bolao-resumo');
  const betsList = find('#lista-apostas');
  const conferenceList = find('#resultado-conferencia');
  const quantityInput = find('#quantidade-bilhetes');
  const purchaseSize = find('#compra-dezenas');
  const purchaseUnit = find('#compra-preco-unitario');
  const purchaseTotal = find('#compra-custo-total');
  const purchaseSummary = find('#compra-resumo');
  const purchaseProgress = find('#compra-progresso');
  const purchaseProgressText = find('#compra-progresso-texto');
  const lastPurchase = find('#ultima-compra');
  const lastPurchaseText = find('#ultima-compra-resumo');
  const buttonCadastrar = find('#btn-cadastrar');

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function enqueuePersistence(task) {
    const result = persistenceQueue.then(task, task);
    persistenceQueue = result.catch(() => {});
    return result;
  }

  function resetPurchaseButton() {
    buying = false;
    if (buttonCadastrar) {
      buttonCadastrar.disabled = false;
      buttonCadastrar.removeAttribute('aria-busy');
      buttonCadastrar.textContent = 'Cadastrar aposta';
    }
    if (purchaseProgress) purchaseProgress.hidden = true;
  }

  function setPurchaseProgress(message) {
    if (purchaseProgressText) purchaseProgressText.textContent = message;
    if (purchaseProgress) purchaseProgress.hidden = false;
  }

  function readQuantity() {
    return normalizeQuantity(quantityInput?.value ?? 1);
  }

  /** Deixa o navegador pintar o estado "salvando" antes da transação. */
  function paint() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      // Abas em segundo plano podem não disparar rAF; o timeout garante que a
      // gravação nunca fique presa no estado "Salvando…".
      if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(finish);
      globalThis.setTimeout(finish, 50);
    });
  }

  function refreshPurchasePreview() {
    const numbers = volante.getNumbers();
    if (!purchaseSize || !purchaseUnit || !purchaseTotal || !purchaseSummary) return;
    if (!volante.canConfirm) {
      purchaseSize.textContent = '—';
      purchaseUnit.textContent = 'R$ 0,00';
      purchaseTotal.textContent = 'R$ 0,00';
      purchaseSummary.textContent = 'Selecione de 15 a 20 números para ver o custo total.';
      return;
    }
    try {
      const preview = computePurchasePreview({
        quantity: readQuantity(),
        size: numbers.length,
        priceCents: volante.priceCents,
      });
      const contests = Number(contestSelect?.value ?? 1);
      purchaseSize.textContent = String(preview.size);
      purchaseUnit.textContent = formatCurrency(preview.priceCents);
      purchaseTotal.textContent = formatCurrency(preview.totalCents);
      purchaseSummary.textContent = `${preview.text} · ${contests} concurso(s) por bilhete`
        + `${poolToggle?.checked ? ' · bolão fictício' : ''}. Sem limite de quantidade.`;
    } catch (error) {
      purchaseSize.textContent = String(numbers.length);
      purchaseUnit.textContent = formatCurrency(volante.priceCents);
      purchaseTotal.textContent = '—';
      purchaseSummary.textContent = error.message;
    }
  }

  function refreshVolante() {
    const numbers = volante.getNumbers();
    volanteUI.render(numbers, { full: volante.isFull });
    if (quantity) quantity.textContent = String(numbers.length);
    if (price) price.textContent = formatCurrency(volante.priceCents);
    if (combinations) {
      combinations.textContent = volante.canConfirm
        ? `${countCombinations(numbers.length)} aposta(s) simples`
        : `mínimo de ${MIN_BET_SIZE} números`;
    }
    if (surpresinhaSize && Number(surpresinhaSize.value) !== numbers.length
      && volante.canConfirm) {
      surpresinhaSize.value = String(numbers.length);
    }
    refreshPoolSummary();
    refreshPurchasePreview();
  }

  function refreshPoolSummary() {
    if (!poolSummary) return;
    if (!poolToggle?.checked) {
      poolSummary.textContent = 'Desativado — aposta individual.';
      return;
    }
    const numbers = volante.getNumbers();
    if (!volante.canConfirm) {
      poolSummary.textContent = 'Selecione 15 a 20 números para calcular o bolão.';
      return;
    }
    try {
      const shares = validatePoolShares(numbers.length, Number(poolShares.value));
      const total = getBetPriceCents(numbers.length);
      poolSummary.textContent = `Total ${formatCurrency(total)} · ${shares} cotas`
        + ` · ${formatCurrency(getSharePriceCents(total, shares))} por cota`;
    } catch (error) {
      poolSummary.textContent = error.message;
    }
  }

  function buildPool(numbers) {
    if (!poolToggle?.checked) return null;
    const shares = validatePoolShares(numbers.length, Number(poolShares.value));
    const names = poolParticipants?.value
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean) ?? [];
    if (names.length > 0 && names.length !== shares) {
      throw new RangeError(`Informe ${shares} participantes ou deixe o campo vazio.`);
    }
    return createPool({
      betSize: numbers.length,
      totalCents: getBetPriceCents(numbers.length),
      shares,
      participants: names.length > 0 ? names : undefined,
    });
  }

  async function registerBet() {
    if (buying) return null;
    const numbers = volante.getNumbers();
    if (!volante.canConfirm) {
      setStatus(`Selecione pelo menos ${MIN_BET_SIZE} números (máximo ${MAX_BET_SIZE}).`);
      return null;
    }
    const contests = Number(contestSelect?.value ?? 1);
    if (!isTeimosinhaContestCount(contests) && contests !== 1) {
      setStatus('Quantidade de concursos inválida.');
      return null;
    }
    let pool = null;
    try {
      pool = buildPool(numbers);
    } catch (error) {
      setStatus(error.message);
      return null;
    }
    let quantity;
    try {
      quantity = readQuantity();
    } catch (error) {
      setStatus(error.message);
      refreshPurchasePreview();
      return null;
    }

    const contest = getContest();
    const poolData = pool
      ? { shares: pool.shares, participants: pool.members.map((member) => member.name) }
      : null;
    const signature = purchaseSignature({ numbers, quantity, contests, pool: poolData, contest });

    // Segundo clique confirma apenas compras não triviais; cliques seguintes
    // com a mesma assinatura não gravam novamente.
    if (quantity > 1 && !purchaseGuard.isArmed(signature)) {
      purchaseGuard.arm(signature);
      const preview = computePurchasePreview({
        quantity, size: numbers.length, priceCents: volante.priceCents,
      });
      if (buttonCadastrar) buttonCadastrar.textContent = `Confirmar ${quantity} bilhetes`;
      setStatus(`Confirme a compra: ${preview.text}. Clique novamente para gravar.`);
      return null;
    }
    purchaseGuard.consume(signature);
    if (purchaseGuard.pending) purchaseGuard.disarm();

    buying = true;
    if (buttonCadastrar) {
      buttonCadastrar.disabled = true;
      buttonCadastrar.setAttribute('aria-busy', 'true');
      buttonCadastrar.textContent = 'Salvando…';
    }
    setPurchaseProgress(`Salvando ${quantity} bilhete(s)…`);
    await paint();

    const detail = pool ? ` · bolão com ${pool.shares} cotas` : '';
    const teimosinha = contests > 1 ? ` · Teimosinha ${contests} concursos` : '';
    try {
      let tickets = [];
      if (history) {
        const saved = await enqueuePersistence(() => history.buyTickets({
          numbers, contests, quantity, contest, pool: poolData,
        }));
        tickets = saved.tickets;
        for (const ticket of tickets) {
          registry.add({
            numbers: ticket.numbers,
            contests: ticket.contests,
            pool: ticket.pool,
            id: ticket.id,
            displayId: ticket.displayId,
            persistentId: ticket.persistentId ?? ticket.id,
            prizeValues: ticket.prizeValues,
            contest: ticket.contest,
          });
        }
        if (tickets.length) {
          const totalCents = tickets.reduce((sum, ticket) => sum + ticket.priceCents, 0);
          if (lastPurchase) lastPurchase.hidden = false;
          if (lastPurchaseText) {
            lastPurchaseText.textContent = describePurchase({ tickets, totalCents, contest });
          }
        }
      } else {
        for (let index = 0; index < quantity; index += 1) {
          registry.add({ numbers, contests, pool, contest });
        }
      }
      renderBets();
      onDataChange();
      const firstId = tickets[0]?.displayId ?? registry.list().at(-1)?.displayId;
      setStatus(`${quantity} bilhete(s) cadastrado(s) #${firstId}: ${numbersText(numbers)}`
        + `${teimosinha}${detail}${history ? ' · salvo no histórico.' : '.'}`);
      return tickets[0] ?? registry.list().at(-1) ?? null;
    } catch (error) {
      setStatus(`Não foi possível salvar a compra: ${error.message}`);
      return null;
    } finally {
      resetPurchaseButton();
      refreshPurchasePreview();
    }
  }

  function renderBets() {
    betsList.replaceChildren();
    if (registry.count === 0) {
      const empty = document.createElement('p');
      empty.className = 'vazio';
      empty.textContent = 'Nenhuma aposta cadastrada.';
      betsList.appendChild(empty);
      return;
    }

    const allBets = registry.list();
    for (const bet of allBets.slice(0, RENDER_LIMIT)) {
      const card = document.createElement('article');
      card.className = 'aposta-cartao';
      const isChampion = champion.isBetChampion(bet.id);
      if (isChampion) {
        card.classList.add('aposta-campea');
        card.setAttribute('aria-label', `Bilhete campeão · ${champion.scoreLabel}`);
      }

      const title = document.createElement('h4');
      title.textContent = `Aposta #${bet.displayId ?? bet.id}${bet.contests > 1
        ? ` — Teimosinha ${bet.contests} concursos` : ''}`;
      card.appendChild(title);

      if (isChampion) {
        const badge = document.createElement('p');
        badge.className = 'aposta-campea-selo';
        badge.textContent = `${champion.label} · ${champion.scoreLabel}`;
        card.appendChild(badge);
      }

      const numbers = document.createElement('p');
      numbers.className = 'aposta-numeros';
      const matchedNumbers = new Set(champion.numbersForBet(bet.id));
      if (isChampion && matchedNumbers.size > 0) {
        bet.numbers.forEach((number, index) => {
          if (index > 0) numbers.appendChild(document.createTextNode(' '));
          const span = document.createElement('span');
          span.textContent = pad(number);
          if (matchedNumbers.has(number)) {
            span.className = 'numero-campeao';
            span.setAttribute('aria-label', `Acerto do bilhete campeão: ${pad(number)}`);
          }
          numbers.appendChild(span);
        });
      } else {
        numbers.textContent = numbersText(bet.numbers);
      }
      card.appendChild(numbers);

      const meta = document.createElement('p');
      meta.className = 'aposta-meta';
      const poolText = bet.pool
        ? ` · bolão ${bet.pool.shares} cotas (${formatCurrency(bet.pool.shareCents)}/cota; `
          + `${bet.pool.members
            .map((member) => `${member.name}: ${member.percentage.toFixed(2).replace('.', ',')}%`)
            .join(', ')})`
        : '';
      meta.textContent = `${bet.size} números · ${formatCurrency(bet.priceCents)}`
        + ` · ${bet.combinations} aposta(s) simples${poolText}`;
      card.appendChild(meta);

      if (bet.contests > 1) {
        const progress = document.createElement('p');
        progress.className = 'aposta-meta';
        const filled = bet.results.filter(Boolean).length;
        progress.textContent = `Concursos com resultado: ${filled}/${bet.contests}`;
        card.appendChild(progress);
      }

      betsList.appendChild(card);
    }
    if (allBets.length > RENDER_LIMIT) {
      const note = document.createElement('p');
      note.className = 'ajuda';
      note.textContent = `Mostrando ${RENDER_LIMIT} de ${allBets.length} apostas. `
        + 'Consulte todas na aba Histórico, em “Bilhetes comprados”.';
      betsList.appendChild(note);
    }
  }

  function appendConference(conference) {
    conferences.push(conference);
    renderConferences();
  }

  function renderConferences() {
    conferenceList.replaceChildren();
    if (conferences.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'vazio';
      empty.textContent = 'Nenhuma conferência ainda. Conclua um sorteio ou clique em '
        + '“Conferir apostas”.';
      conferenceList.appendChild(empty);
      return;
    }

    const visible = conferences.slice(-RENDER_LIMIT).reverse();
    for (const item of visible) {
      const card = document.createElement('article');
      card.className = 'conferencia-cartao';

      const title = document.createElement('h4');
      title.textContent = `Aposta #${item.betId} · concurso ${item.contest}`;
      card.appendChild(title);

      if (champion.keys.includes(conferenceKey(item))) {
        card.classList.add('conferencia-campea');
        const badge = document.createElement('p');
        badge.className = 'aposta-campea-selo';
        badge.textContent = `${champion.label} · ${champion.scoreLabel}`;
        card.appendChild(badge);
      }

      const lines = [
        ['Apostados', numbersText(item.numbers)],
        ['Sorteados', numbersText(item.drawnNumbers)],
        ['Acertos', String(item.matches)],
        ['Combinações premiadas', String(item.winningCombinations)],
        ['Faixa', item.bestTier === null ? 'sem premiação' : `${item.bestTier} acertos`],
        ['Valor recebido (simulação)', formatCurrency(item.totalPrizeCents)],
      ];
      for (const [label, value] of lines) {
        const paragraph = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = `${label}: `;
        paragraph.append(strong, document.createTextNode(value));
        card.appendChild(paragraph);
      }

      const tiers = document.createElement('p');
      tiers.className = 'conferencia-faixas';
      tiers.textContent = Object.entries(item.prizeByTier)
        .map(([tier, value]) => `${tier}: ${value.count}`)
        .join(' · ');
      card.appendChild(tiers);

      if (item.poolDistribution) {
        const poolTitle = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = 'Rateio do bolão: ';
        poolTitle.appendChild(strong);
        poolTitle.appendChild(document.createTextNode(
          item.poolDistribution
            .map((member) => `${member.name} ${formatCurrency(member.amountCents)}`
              + ` (${member.percentage.toFixed(2).replace('.', ',')}%)`)
            .join(' · '),
        ));
        card.appendChild(poolTitle);
      }

      conferenceList.appendChild(card);
    }
    if (conferences.length > RENDER_LIMIT) {
      const note = document.createElement('p');
      note.className = 'ajuda';
      note.textContent = `Mostrando as ${RENDER_LIMIT} conferências mais recentes de `
        + `${conferences.length}. Consulte todas na aba Histórico.`;
      conferenceList.appendChild(note);
    }
  }

  /** Chamado pelo controlador de sorteio quando um resultado é concluído. */
  function registerDrawResult(draw) {
    if (!Array.isArray(draw)) return Promise.resolve([]);
    return enqueuePersistence(async () => {
      let drawRecord = null;
      let contest = Number(getContest());

      if (history) {
        try {
          const result = await history.registerDraw({
            draw,
            sessionId: localSessionId,
            generation: getGeneration(),
          });
          drawRecord = result.draw;
          contest = result.draw.contest;
        } catch (error) {
          setStatus(`Resultado não pôde ser salvo: ${error.message}`);
        }
      }

      // Um bilhete só é conferido no seu próprio concurso; Teimosinha segue
      // conferindo até atingir a quantidade contratada.
      const targets = registry.list().filter((bet) => {
        if (bet.conferenceCount >= bet.contests) return false;
        if (!history || bet.contests > 1) return true;
        return Number(bet.contest ?? 1) === contest;
      });

      let created = [];
      if (history) {
        try {
          const persisted = await history.conferTickets({
            tickets: targets.map((bet) => ({
              id: bet.id,
              persistentId: bet.persistentId,
              numbers: [...bet.numbers],
              size: bet.size,
              contests: bet.contests,
              prizeValues: bet.prizeValues ?? undefined,
            })).filter((ticket) => ticket.persistentId),
            draw,
            drawId: drawRecord?.id ?? null,
            contest,
          });
          created = persisted.conferences;
          const conferenced = new Set(created.map((item) => item.betId));
          for (const bet of targets) {
            if (!conferenced.has(bet.id)) continue;
            assignContestResult(bet.results, draw);
            bet.conferenceCount += 1;
          }
        } catch (error) {
          setStatus(`Conferência não pôde ser salva: ${error.message}`);
        }
      } else {
        for (const bet of targets) {
          assignContestResult(bet.results, draw);
          bet.conferenceCount += 1;
          created.push(conferenceBet(bet, draw, { contest: bet.conferenceCount }));
        }
      }

      for (const conference of created) appendConference(conference);
      renderBets();
      onDataChange();
      onDrawConferred(created, [...draw]);
      return created;
    });
  }

  /** Atualiza somente a apresentação do campeão; não recalcula conferência. */
  function setChampion(next) {
    champion = next && typeof next.isBetChampion === 'function'
      ? next
      : describeChampions([]);
    renderBets();
    renderConferences();
  }

  /** Esvazia o estado local após um reinício persistido, sem gravar nada. */
  function clearAll() {
    registry.clear();
    conferences.length = 0;
    champion = describeChampions([]);
    renderBets();
    renderConferences();
    clearSelection();
    setStatus('');
  }

  /** Restaura apostas e conferências persistidas sem gerar novos números. */
  async function hydrate() {
    if (!history) return;
    const snapshot = await history.restoreState();
    for (const ticket of snapshot.tickets) {
      const bet = registry.add({
        numbers: ticket.numbers,
        contests: ticket.contests,
        pool: ticket.pool,
        id: ticket.id,
        displayId: ticket.displayId,
        persistentId: ticket.persistentId ?? ticket.id,
        prizeValues: ticket.prizeValues,
        results: ticket.results,
        conferenceCount: ticket.conferenceCount,
        contest: ticket.contest,
      });
      bet.contest = ticket.contest;
    }
    for (const conference of snapshot.conferences) conferences.push({ ...conference });
    renderBets();
    renderConferences();
  }

  async function conferir() {
    const draw = getResult();
    if (!draw) {
      setStatus('Conclua um sorteio antes de conferir as apostas.');
      return [];
    }
    if (registry.count === 0) {
      setStatus('Cadastre ao menos uma aposta antes de conferir.');
      return [];
    }
    setStatus('Conferindo apostas…');
    const created = await registerDrawResult(draw);
    setStatus(`Conferência concluída: ${created.length} resultado(s) registrado(s).`);
    return created;
  }

  function clearSelection() {
    volante.clear();
    refreshVolante();
    setStatus('Seleção limpa.');
  }

  function handleSurpresinha() {
    const size = Number(surpresinhaSize?.value ?? MIN_BET_SIZE);
    try {
      volante.setNumbers(generateSurpresinha(size));
      refreshVolante();
      setStatus(`Surpresinha de ${size} números gerada (aposta, não resultado).`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function on(selector, event, handler) {
    const element = find(selector);
    if (!element) return;
    element.addEventListener(event, handler);
    listeners.push(() => element.removeEventListener(event, handler));
  }

  function invalidatePurchase() {
    purchaseGuard.disarm();
    if (buttonCadastrar && !buying) buttonCadastrar.textContent = 'Cadastrar aposta';
    refreshPurchasePreview();
  }

  on('#btn-limpar', 'click', clearSelection);
  on('#btn-surpresinha', 'click', handleSurpresinha);
  on('#btn-cadastrar', 'click', registerBet);
  on('#btn-conferir', 'click', conferir);
  on('#bolao-ativo', 'change', () => { refreshPoolSummary(); invalidatePurchase(); });
  on('#bolao-cotas', 'input', () => { refreshPoolSummary(); invalidatePurchase(); });
  on('#bolao-participantes', 'input', () => { refreshPoolSummary(); invalidatePurchase(); });
  on('#teimosinha-contestos', 'change', invalidatePurchase);
  on('#quantidade-bilhetes', 'input', invalidatePurchase);
  on('#quantidade-bilhetes', 'change', invalidatePurchase);

  if (contestSelect) {
    for (const count of TEIMOSINHA_CONTEST_COUNTS) {
      const option = document.createElement('option');
      option.value = String(count);
      option.textContent = `${count} concursos`;
      contestSelect.appendChild(option);
    }
  }
  for (let size = MIN_BET_SIZE; size <= MAX_BET_SIZE; size += 1) {
    if (!surpresinhaSize) break;
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = `${size} números`;
    surpresinhaSize.appendChild(option);
  }

  refreshVolante();
  renderBets();
  renderConferences();

  return {
    volante,
    registry,
    get conferences() {
      return conferences.map((item) => ({ ...item }));
    },
    registerBet,
    registerDrawResult,
    /** Apresentação do campeão; nenhuma função altera conferência ou finanças. */
    setChampion,
    getChampion: () => champion,
    hydrate,
    clearAll,
    conferir,
    clearSelection,
    handleSurpresinha,
    dispose() {
      volanteUI.dispose();
      for (const off of listeners) off();
      listeners.length = 0;
    },
  };
}
