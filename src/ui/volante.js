import { MAX_NUMBER, MIN_NUMBER } from '../core/constants.js';

const pad = (number) => String(number).padStart(2, '0');

/**
 * Renderizador do volante 5×5. Apenas desenha os botões e reporta cliques;
 * toda a decisão sobre seleção fica em `src/bets/volante.js`.
 */
export function createVolanteUI({ container, onToggle }) {
  const buttons = [];

  for (let number = MIN_NUMBER; number <= MAX_NUMBER; number += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'numero-botao';
    button.dataset.numero = String(number);
    button.textContent = pad(number);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Número ${number}`);
    container.appendChild(button);
    buttons.push(button);
  }

  function handleClick(event) {
    const button = event.target.closest('button[data-numero]');
    if (!button || button.disabled) return;
    onToggle(Number(button.dataset.numero));
  }
  container.addEventListener('click', handleClick);

  return {
    render(numbers, { full = false } = {}) {
      const selected = new Set(numbers);
      for (const button of buttons) {
        const active = selected.has(Number(button.dataset.numero));
        button.classList.toggle('selecionado', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = !active && full;
      }
    },
    dispose() {
      container.removeEventListener('click', handleClick);
    },
  };
}
