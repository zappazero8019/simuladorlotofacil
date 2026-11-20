import { formatCurrency } from '../bets/index.js';
import { buildCumulativeSeries } from '../history/index.js';
import { PRIZE_TIERS } from '../core/constants.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 600;
const HEIGHT = 180;
const PADDING = { left: 12, right: 12, top: 12, bottom: 26 };

/** Reduz pontos para desenho sem inventar valores: sempre preserva o último. */
export function downsample(points, maxPoints = 60) {
  const list = Array.isArray(points) ? points : [];
  const limit = Math.max(2, Math.floor(maxPoints));
  if (list.length <= limit) return [...list];
  const lastIndex = list.length - 1;
  const indices = new Set([0, lastIndex]);
  for (let step = 1; step < limit - 1; step += 1) {
    indices.add(Math.round((step * lastIndex) / (limit - 1)));
  }
  return [...indices].sort((a, b) => a - b).map((index) => list[index]);
}

/** Série acumulada dos eventos já filtrados, sem pontos sintéticos. */
export function balanceSeries(events = [], maxPoints = 60) {
  return downsample(buildCumulativeSeries(events), maxPoints);
}

/** Barras de gasto por concurso a partir de eventos reais de compra. */
export function contestBars(events = [], limit = 24) {
  const totals = new Map();
  for (const event of events) {
    if (event.type !== 'ticket') continue;
    const contest = Number(event.contest);
    totals.set(contest, (totals.get(contest) ?? 0) + event.amountCents);
  }
  const all = [...totals.entries()]
    .map(([contest, valueCents]) => ({ label: String(contest), valueCents }))
    .sort((a, b) => Number(a.label) - Number(b.label));
  return all.slice(-Math.max(1, limit));
}

/** Barras de premiação por faixa; faixas sem evento não aparecem. */
export function tierBars(events = []) {
  const totals = new Map();
  for (const event of events) {
    if (event.type !== 'prize' || event.tier === null || event.tier === undefined) continue;
    totals.set(Number(event.tier), (totals.get(Number(event.tier)) ?? 0) + event.amountCents);
  }
  return PRIZE_TIERS
    .filter((tier) => totals.has(tier))
    .map((tier) => ({ label: String(tier), valueCents: totals.get(tier) }));
}

/** Escala linear com folga; zero quando não há dados. */
export function chartMax(values = []) {
  const max = values.reduce((higher, value) => Math.max(higher, Number(value) || 0), 0);
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

function svg(tag, attributes = {}, text = '') {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (text !== '') node.textContent = text;
  return node;
}

function emptyState(container, message) {
  container.replaceChildren();
  const note = document.createElement('p');
  note.className = 'vazio';
  note.textContent = message;
  container.appendChild(note);
}

function legend(container, items) {
  const box = document.createElement('div');
  box.className = 'grafico-legenda';
  for (const item of items) {
    const entry = document.createElement('span');
    const dot = document.createElement('i');
    dot.style.backgroundColor = item.color;
    entry.append(dot, document.createTextNode(item.label));
    box.appendChild(entry);
  }
  container.appendChild(box);
}

function makeSvg(label) {
  const node = svg('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': label,
  });
  node.classList.add('grafico-svg');
  return node;
}

function plotArea() {
  return {
    width: WIDTH - PADDING.left - PADDING.right,
    height: HEIGHT - PADDING.top - PADDING.bottom,
    left: PADDING.left,
    top: PADDING.top,
  };
}

/** Gráfico de linhas. `series` é a série acumulada já filtrada. */
export function renderLineChart(container, { series = [], lines = [], emptyMessage = 'Sem dados no período.' } = {}) {
  if (!container) return;
  if (!series.length) {
    emptyState(container, emptyMessage);
    return;
  }
  const area = plotArea();
  const max = chartMax(lines.flatMap((line) => series.map((point) => point[line.key])));
  const xAt = (index) => area.left
    + (series.length === 1 ? area.width / 2 : (index * area.width) / (series.length - 1));
  const yAt = (value) => area.top + area.height - (Number(value) / max) * area.height;

  const node = makeSvg(`Gráfico de linhas: ${series.length} pontos, ${lines.map((line) => line.label).join(', ')}.`);
  node.appendChild(svg('line', {
    x1: area.left, y1: area.top + area.height,
    x2: area.left + area.width, y2: area.top + area.height,
    stroke: 'rgba(148,163,184,0.35)',
  }));
  node.appendChild(svg('text', {
    x: area.left, y: HEIGHT - 6, fill: '#64748b', 'font-size': 11,
  }, formatCurrency(max)));

  for (const line of lines) {
    const points = series
      .map((point, index) => `${xAt(index).toFixed(1)},${yAt(point[line.key]).toFixed(1)}`)
      .join(' ');
    node.appendChild(svg('polyline', {
      points,
      fill: 'none',
      stroke: line.color,
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }));
    const last = series[series.length - 1];
    node.appendChild(svg('circle', {
      cx: xAt(series.length - 1), cy: yAt(last[line.key]), r: 3.5, fill: line.color,
    }));
  }
  container.replaceChildren(node);
  legend(container, lines);
}

/** Gráfico de barras horizontais, legível também em telas estreitas. */
export function renderBarChart(container, { bars = [], color = '#14b8a6', emptyMessage = 'Sem dados no período.' } = {}) {
  if (!container) return;
  const usable = bars.filter((bar) => Number(bar.valueCents) > 0);
  if (!usable.length) {
    emptyState(container, emptyMessage);
    return;
  }
  const max = chartMax(usable.map((bar) => bar.valueCents));
  const node = makeSvg(`Gráfico de barras com ${usable.length} categorias; valores em reais.`);
  const rowHeight = areaHeight(usable.length);
  usable.forEach((bar, index) => {
    const y = PADDING.top + index * rowHeight;
    const barWidth = (Number(bar.valueCents) / max) * (WIDTH - 170);
    node.appendChild(svg('text', {
      x: area().left, y: y + rowHeight * 0.62, fill: '#cbd5e1', 'font-size': 12,
    }, bar.label));
    node.appendChild(svg('rect', {
      x: 70, y: y + 4, width: Math.max(2, barWidth),
      height: Math.max(6, rowHeight - 10), rx: 4, fill: color, opacity: 0.85,
    }));
    node.appendChild(svg('text', {
      x: Math.min(WIDTH - 6, 76 + barWidth), y: y + rowHeight * 0.62,
      fill: '#94a3b8', 'font-size': 11,
    }, formatCurrency(bar.valueCents)));
  });
  container.replaceChildren(node);
}

function area() {
  return { left: PADDING.left };
}

function areaHeight(count) {
  return (HEIGHT - PADDING.top - PADDING.bottom) / Math.max(1, count);
}
