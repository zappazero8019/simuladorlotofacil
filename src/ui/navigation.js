/** Navegação das seis áreas da aplicação, sem duplicar regras de apresentação. */
export const NAV_ITEMS = Object.freeze([
  Object.freeze({ id: 'sorteio', label: 'Sorteio' }),
  Object.freeze({ id: 'apostas', label: 'Apostas' }),
  Object.freeze({ id: 'historico', label: 'Histórico' }),
  Object.freeze({ id: 'financeiro', label: 'Financeiro' }),
  Object.freeze({ id: 'estatisticas', label: 'Estatísticas' }),
  Object.freeze({ id: 'configuracoes', label: 'Configurações' }),
]);

export function isNavArea(id) {
  return NAV_ITEMS.some((item) => item.id === id);
}

/**
 * Liga botões e painéis. `getArea(id)` permite que a área de sorteio use um
 * contêiner diferente dos demais sem alterar os IDs públicos existentes.
 */
export function createNavigation({ root = document, getArea, onChange = () => {} } = {}) {
  const buttons = new Map(
    NAV_ITEMS.map((item) => [item.id, root.querySelector(`#aba-${item.id}`)]),
  );
  const listeners = [];
  let current = null;

  function show(id) {
    if (!isNavArea(id)) return null;
    current = id;
    for (const item of NAV_ITEMS) {
      const active = item.id === id;
      const button = buttons.get(item.id);
      button?.classList.toggle('ativa', active);
      button?.setAttribute('aria-pressed', String(active));
      if (active) button?.setAttribute('aria-current', 'page');
      else button?.removeAttribute('aria-current');
      const area = getArea?.(item.id);
      if (area) area.hidden = !active;
    }
    onChange(id);
    return id;
  }

  for (const [id, button] of buttons) {
    if (!button) continue;
    const click = () => show(id);
    button.addEventListener('click', click);
    listeners.push(() => button.removeEventListener('click', click));
  }

  const nav = root.querySelector('.abas');
  const keydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const index = NAV_ITEMS.findIndex((item) => item.id === current);
    if (index < 0) return;
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? NAV_ITEMS.length - 1
        : (index + offset + NAV_ITEMS.length) % NAV_ITEMS.length;
    const target = buttons.get(NAV_ITEMS[next].id);
    if (!target) return;
    event.preventDefault();
    target.focus();
    show(NAV_ITEMS[next].id);
  };
  nav?.addEventListener('keydown', keydown);
  if (nav) listeners.push(() => nav.removeEventListener('keydown', keydown));

  show('sorteio');
  return {
    show,
    get current() {
      return current;
    },
    dispose() {
      for (const off of listeners) off();
      listeners.length = 0;
    },
  };
}
