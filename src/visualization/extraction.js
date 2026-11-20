import * as THREE from 'three';
import {
  BALL_COUNT,
  EXTRACTION_EXIT,
  EXTRACTION_OPENING,
} from './constants.js';

/** Contagem visual de slots; os números vêm sempre do controlador de sorteio. */
export const EXTRACTION_SIZE = 15;
export const BASE_EXTRACTION_DURATION = 0.7;

const OPENING_INSIDE = new THREE.Vector3(
  EXTRACTION_OPENING.x,
  EXTRACTION_OPENING.y,
  EXTRACTION_OPENING.z,
);
const OPENING_OUTSIDE = new THREE.Vector3(
  EXTRACTION_EXIT.x,
  EXTRACTION_EXIT.y,
  EXTRACTION_EXIT.z,
);
const PHASE_TO_OPENING = 0.42;
const PHASE_TO_EXIT = 0.62;

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - ((-2 * t + 2) ** 3) / 2;
}

function clampVisualSpeed(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(0.5, Math.min(5, parsed));
}

/** Posição de apresentação de cada bola extraída (duas fileiras curtas). */
function slotPosition(index) {
  const column = index % 8;
  const row = Math.floor(index / 8);
  return new THREE.Vector3((column - 3.5) * 0.58, -3.2 - row * 0.6, 1.5);
}

function setHighlight(ball, visible, pulse = 0) {
  const highlight = ball?.userData?.highlight;
  if (!highlight) return;
  highlight.visible = visible;
  highlight.scale.setScalar(1 + pulse);
}

/** Anel roxo neon exclusivo dos números dos bilhetes campeões. */
function setMatchHighlight(ball, visible, pulse = 0) {
  const highlight = ball?.userData?.matchHighlight;
  if (!highlight) return;
  highlight.visible = visible;
  highlight.scale.setScalar(1.2 + pulse);
}

function setLabelFocus(ball, focus) {
  const label = ball?.userData?.label;
  const base = label?.userData?.baseScale;
  if (!label || !base) return;
  label.scale.copy(base).multiplyScalar(focus ? 1.35 : 1);
}

/**
 * Anima a saída das bolas escolhidas pelo resultado matemático. Este módulo
 * apenas recebe números: nunca os sortea, repete ou altera.
 */
export function createExtractionController({
  balls,
  physics,
  onExtracted = () => {},
  isMatch = () => false,
  duration = BASE_EXTRACTION_DURATION,
  reducedMotion = false,
} = {}) {
  if (!balls || !physics) {
    throw new TypeError('balls e physics são obrigatórios.');
  }

  const indexByNumber = new Map();
  const initialPositions = [];
  balls.children.forEach((ball, index) => {
    indexByNumber.set(ball.userData.number, index);
    initialPositions.push(ball.position.clone());
  });

  const extracted = new Map();
  const animations = [];
  let currentDuration = Math.max(0.01, duration);
  let speed = 1;
  let instant = false;
  let paused = false;
  let reduced = Boolean(reducedMotion);
  let disposed = false;
  let highlightedBall = null;

  function focus(ball) {
    if (highlightedBall && highlightedBall !== ball) {
      setHighlight(highlightedBall, false);
      setLabelFocus(highlightedBall, false);
    }
    highlightedBall = ball;
    setHighlight(ball, true);
    setLabelFocus(ball, true);
  }

  /**
   * `matchOverride` permite informar um destaque pós-conferência sem acoplar
   * este módulo à carteira de apostas. Sem override, vale o `isMatch`
   * fornecido na criação (útil em testes e usos isolados). Durante a extração
   * normal a interface não informa override, para não vazar o resultado.
   */
  function reveal(number, index, matchOverride = null) {
    if (disposed || !Number.isInteger(number) || number < 1 || number > BALL_COUNT) {
      return false;
    }
    if (!Number.isInteger(index) || index < 0 || index >= EXTRACTION_SIZE) return false;
    if (extracted.has(number) || [...extracted.values()].includes(index)) return false;

    const bodyIndex = indexByNumber.get(number);
    if (bodyIndex === undefined) return false;

    const ball = balls.children[bodyIndex];
    const destination = slotPosition(index);
    const matched = typeof matchOverride === 'boolean'
      ? matchOverride
      : Boolean(isMatch(number));
    extracted.set(number, index);
    physics.setExtracted?.(bodyIndex, true);
    focus(ball);

    if (instant || reduced) {
      ball.position.copy(destination);
      ball.scale.setScalar(1);
      setMatchHighlight(ball, matched);
      onExtracted(number, bodyIndex);
    } else {
      animations.push({
        bodyIndex,
        number,
        matched,
        from: ball.position.clone(),
        to: destination,
        elapsed: 0,
      });
    }
    return true;
  }

  function update(delta) {
    if (disposed || paused || !Number.isFinite(delta) || delta <= 0) return;

    for (let position = animations.length - 1; position >= 0; position -= 1) {
      const animation = animations[position];
      animation.elapsed += delta;
      const t = Math.min(1, animation.elapsed / currentDuration);

      const ball = balls.children[animation.bodyIndex];
      if (t < PHASE_TO_OPENING) {
        const travel = easeInOutCubic(t / PHASE_TO_OPENING);
        ball.position.lerpVectors(animation.from, OPENING_INSIDE, travel);
      } else if (t < PHASE_TO_EXIT) {
        const travel = easeInOutCubic(
          (t - PHASE_TO_OPENING) / (PHASE_TO_EXIT - PHASE_TO_OPENING),
        );
        ball.position.lerpVectors(OPENING_INSIDE, OPENING_OUTSIDE, travel);
      } else {
        const travel = easeInOutCubic((t - PHASE_TO_EXIT) / (1 - PHASE_TO_EXIT));
        ball.position.lerpVectors(OPENING_OUTSIDE, animation.to, travel);
      }

      const arc = Math.sin(t * Math.PI);
      ball.scale.setScalar(1 + arc * 0.28);
      setHighlight(ball, true, arc * 0.22);
      setMatchHighlight(ball, animation.matched, arc * 0.18);
      setLabelFocus(ball, true);

      if (t >= 1) {
        ball.position.copy(animation.to);
        ball.scale.setScalar(1);
        setHighlight(ball, true);
        setMatchHighlight(ball, animation.matched);
        setLabelFocus(ball, true);
        animations.splice(position, 1);
        onExtracted(animation.number, animation.bodyIndex);
      }
    }
  }

  function reset() {
    animations.length = 0;
    extracted.clear();

    balls.children.forEach((ball, index) => {
      if (index >= BALL_COUNT) return;
      physics.setExtracted?.(index, false);
      const body = physics.bodies?.[index];
      if (body) {
        body.position.copy(initialPositions[index]);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
      }
      ball.position.copy(initialPositions[index]);
      ball.scale.setScalar(1);
      ball.visible = true;
      setHighlight(ball, false);
      setMatchHighlight(ball, false);
      setLabelFocus(ball, false);
    });
    highlightedBall = null;
  }

  /** Aplica o destaque somente após a conferência; nunca altera o resultado. */
  function highlightChampions(numbers = []) {
    const champions = new Set(Array.isArray(numbers) ? numbers.map(Number) : []);
    for (const [number, index] of extracted) {
      const ball = balls.children[indexByNumber.get(number)];
      if (!ball) continue;
      setMatchHighlight(ball, champions.has(number));
    }
  }

  function setPaused(value) {
    paused = Boolean(value);
  }

  function setDuration(value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0.01) currentDuration = parsed;
    return currentDuration;
  }

  function setSpeed(value) {
    speed = clampVisualSpeed(value, speed);
    currentDuration = Math.max(0.01, BASE_EXTRACTION_DURATION / speed);
    return speed;
  }

  function finishPendingAnimations() {
    for (const animation of animations) {
      const ball = balls.children[animation.bodyIndex];
      ball.position.copy(animation.to);
      ball.scale.setScalar(1);
      setHighlight(ball, true);
      setMatchHighlight(ball, animation.matched);
      setLabelFocus(ball, true);
      onExtracted(animation.number, animation.bodyIndex);
    }
    animations.length = 0;
  }

  /** No modo instantâneo as bolas vão direto ao slot, sem animação nem arco. */
  function setInstant(value) {
    instant = Boolean(value);
    if (!instant) return instant;
    finishPendingAnimations();
    return instant;
  }

  /** Respeita `prefers-reduced-motion` sem alterar a sequência recebida. */
  function setReducedMotion(value) {
    reduced = Boolean(value);
    if (reduced) finishPendingAnimations();
    return reduced;
  }

  function getExtractedNumbers() {
    return [...extracted.keys()].sort((a, b) => a - b);
  }

  function getRemainingNumbers() {
    return balls.children
      .map((ball) => ball.userData.number)
      .filter((number) => !extracted.has(number));
  }

  function dispose() {
    if (disposed) return;
    reset();
    disposed = true;
  }

  return {
    reveal,
    update,
    reset,
    highlightChampions,
    setPaused,
    setDuration,
    setSpeed,
    setInstant,
    setReducedMotion,
    getExtractedNumbers,
    getRemainingNumbers,
    dispose,
    getState: () => ({
      extracted: getExtractedNumbers(),
      remaining: getRemainingNumbers(),
      animating: animations.length,
      paused,
      instant,
      reducedMotion: reduced,
      speed,
    }),
    get duration() {
      return currentDuration;
    },
    get isInstant() {
      return instant;
    },
    get isDisposed() {
      return disposed;
    },
  };
}
