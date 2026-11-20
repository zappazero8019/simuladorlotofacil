import * as THREE from 'three';
import { BALL_COUNT, BALL_RADIUS, GLOBE_RADIUS } from './constants.js';
import { ballPositions } from './balls.js';

/** Parâmetros da simulação. Valores visuais, sem qualquer regra do jogo. */
export const PHYSICS = Object.freeze({
  FIXED_DT: 1 / 120,
  MAX_SUBSTEPS: 8,
  MAX_FRAME_DELTA: 0.1,
  GRAVITY: -3.6,
  GRAVITY_DURING_MIX: 0.28,
  DAMPING: 0.99,
  ANGULAR_DAMPING: 0.985,
  RESTITUTION: 0.55,
  WALL_RESTITUTION: 0.5,
  MAX_SPEED: 3.2,
  MAX_ANGULAR: 6,
  MIX_FORCE: 3,
  SWIRL_FORCE: 1.2,
  KICK_STRENGTH: 0.3,
  WALL_MARGIN: 0.06,
  COLLISION_ITERATIONS: 2,
});

/** PRNG local para simulações reproduzíveis; não é usado pelo motor matemático. */
export function createSeededRandom(seed = 1) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const _delta = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _negativeNormal = new THREE.Vector3();
const _relative = new THREE.Vector3();
const _cross = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _swirl = new THREE.Vector3();
const _rotation = new THREE.Quaternion();

function limitLength(vector, maximum) {
  const lengthSq = vector.lengthSq();
  if (lengthSq > maximum * maximum) {
    vector.multiplyScalar(maximum / Math.sqrt(lengthSq));
  }
}

/**
 * Mundo físico independente de cena, câmera, iluminação e renderização.
 * Integra com timestep fixo, colisões esfera-esfera e confinamento esférico.
 */
export function createPhysicsWorld({
  positions = ballPositions(),
  count = BALL_COUNT,
  radius = BALL_RADIUS,
  containerRadius = GLOBE_RADIUS - BALL_RADIUS - PHYSICS.WALL_MARGIN,
  random = Math.random,
  lowPower = false,
} = {}) {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('count deve ser um inteiro positivo.');
  }
  if (!Array.isArray(positions) || positions.length !== count) {
    throw new RangeError('positions deve conter exatamente `count` vetores.');
  }
  if (!(radius > 0) || !(containerRadius > radius)) {
    throw new RangeError('radius deve ser positivo e menor que containerRadius.');
  }
  if (typeof random !== 'function') {
    throw new TypeError('random deve ser uma função.');
  }

  const minDistance = radius * 2;
  const maxSubsteps = lowPower ? Math.min(4, PHYSICS.MAX_SUBSTEPS) : PHYSICS.MAX_SUBSTEPS;
  const collisionIterations = lowPower ? 1 : PHYSICS.COLLISION_ITERATIONS;
  const bodies = positions.map((position, index) => {
    if (!position || !Number.isFinite(position.x)
      || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      throw new TypeError('Cada posição deve ter coordenadas finitas.');
    }
    return {
      index,
      extracted: false,
      position: position.clone(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      stirDirection: new THREE.Vector3(0, 1, 0),
      stirTarget: new THREE.Vector3(0, 1, 0),
      stirTimer: random() * 0.5,
    };
  });

  const stats = { substeps: 0, accumulator: 0, totalSteps: 0 };
  let accumulator = 0;
  let disposed = false;

  function randomDirection(output) {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(Math.max(0, 1 - z * z));
    return output.set(Math.cos(angle) * ring, z, Math.sin(angle) * ring);
  }

  function addSpin(body, normal, tangentVelocity) {
    _cross.crossVectors(normal, tangentVelocity).multiplyScalar(0.5 / radius);
    body.angularVelocity.add(_cross);
    limitLength(body.angularVelocity, PHYSICS.MAX_ANGULAR);
  }

  function stir(body, dt, intensity) {
    if (intensity <= 0) return;

    body.stirTimer -= dt;
    if (body.stirTimer <= 0) {
      body.stirTimer = 0.2 + random() * 0.45;
      randomDirection(body.stirTarget);
    }

    body.stirDirection.lerp(body.stirTarget, Math.min(1, dt * 4));
    if (body.stirDirection.lengthSq() < 1e-8) {
      randomDirection(body.stirDirection);
    }
    body.stirDirection.normalize();
    body.velocity.addScaledVector(body.stirDirection, PHYSICS.MIX_FORCE * intensity * dt);

    _swirl.set(-body.position.z, radius * 0.12, body.position.x);
    if (_swirl.lengthSq() > 1e-8) {
      _swirl.normalize();
      body.velocity.addScaledVector(_swirl, PHYSICS.SWIRL_FORCE * intensity * dt);
    }
  }

  function resolveCollisions() {
    const minimumSq = minDistance * minDistance;

    for (let first = 0; first < bodies.length; first += 1) {
      const a = bodies[first];
      if (a.extracted) continue;
      for (let second = first + 1; second < bodies.length; second += 1) {
        const b = bodies[second];
        if (b.extracted) continue;
        _delta.subVectors(b.position, a.position);
        const distanceSq = _delta.lengthSq();
        if (distanceSq >= minimumSq) continue;

        const distance = Math.sqrt(distanceSq);
        if (distance > 1e-8) _normal.copy(_delta).divideScalar(distance);
        else _normal.set(1, 0, 0);

        const penetration = minDistance - distance;
        a.position.addScaledVector(_normal, -penetration * 0.5);
        b.position.addScaledVector(_normal, penetration * 0.5);

        _relative.subVectors(b.velocity, a.velocity);
        const alongNormal = _relative.dot(_normal);
        if (alongNormal >= 0) continue;

        const impulse = -(1 + PHYSICS.RESTITUTION) * alongNormal * 0.5;
        a.velocity.addScaledVector(_normal, -impulse);
        b.velocity.addScaledVector(_normal, impulse);
        _negativeNormal.copy(_normal).negate();
        addSpin(a, _negativeNormal, a.velocity);
        addSpin(b, _normal, b.velocity);
      }
    }
  }

  function containAll() {
    for (const body of bodies) {
      if (body.extracted) continue;
      const distance = body.position.length();
      if (distance <= containerRadius) continue;

      _normal.copy(body.position).divideScalar(distance);
      body.position.copy(_normal).multiplyScalar(containerRadius);
      const radialVelocity = body.velocity.dot(_normal);
      if (radialVelocity > 0) {
        body.velocity.addScaledVector(
          _normal,
          -(1 + PHYSICS.WALL_RESTITUTION) * radialVelocity,
        );
        addSpin(body, _normal, body.velocity);
      }
    }
  }

  function integrate(dt, intensity) {
    const gravity = PHYSICS.GRAVITY
      * (1 - (1 - PHYSICS.GRAVITY_DURING_MIX) * intensity);
    const damping = PHYSICS.DAMPING ** (dt / PHYSICS.FIXED_DT);
    const angularDamping = PHYSICS.ANGULAR_DAMPING ** (dt / PHYSICS.FIXED_DT);

    for (const body of bodies) {
      if (body.extracted) continue;
      stir(body, dt, intensity);
      body.velocity.y += gravity * dt;
      body.velocity.multiplyScalar(damping);
      limitLength(body.velocity, PHYSICS.MAX_SPEED);
      body.position.addScaledVector(body.velocity, dt);

      const angularSpeed = body.angularVelocity.length();
      if (angularSpeed > 1e-7) {
        _axis.copy(body.angularVelocity).divideScalar(angularSpeed);
        _rotation.setFromAxisAngle(_axis, angularSpeed * dt);
        body.quaternion.premultiply(_rotation).normalize();
      }
      body.angularVelocity.multiplyScalar(angularDamping);
    }

    for (let iteration = 0; iteration < collisionIterations; iteration += 1) {
      resolveCollisions();
      containAll();
    }

    for (const body of bodies) {
      if (body.extracted) continue;
      limitLength(body.velocity, PHYSICS.MAX_SPEED);
      limitLength(body.angularVelocity, PHYSICS.MAX_ANGULAR);
    }
  }

  /** Remove/reinsere um corpo da simulação sem descartar o objeto. */
  function setExtracted(index, extracted) {
    const body = bodies[index];
    if (!body) return false;
    body.extracted = Boolean(extracted);
    if (body.extracted) {
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    }
    return true;
  }

  /** Avança a simulação com passo fixo, limitando subpassos por chamada. */
  function step(delta, intensity = 0) {
    stats.substeps = 0;
    if (disposed || !Number.isFinite(delta) || delta <= 0) {
      return { ...stats };
    }

    const mix = Number.isFinite(intensity)
      ? Math.max(0, Math.min(1, intensity))
      : 0;
    accumulator += Math.min(delta, PHYSICS.MAX_FRAME_DELTA);

    let substeps = 0;
    while (accumulator >= PHYSICS.FIXED_DT && substeps < maxSubsteps) {
      integrate(PHYSICS.FIXED_DT, mix);
      accumulator -= PHYSICS.FIXED_DT;
      substeps += 1;
    }
    if (substeps >= maxSubsteps) {
      accumulator = Math.min(accumulator, PHYSICS.FIXED_DT);
    }

    stats.substeps = substeps;
    stats.accumulator = accumulator;
    stats.totalSteps += substeps;
    return { ...stats };
  }

  /** Impulso curto e aleatório usado apenas ao iniciar a mistura. */
  function kick(strength = 1) {
    if (disposed) return;
    const factor = Math.max(0, Math.min(1, strength)) * PHYSICS.KICK_STRENGTH;
    for (const body of bodies) {
      if (body.extracted) continue;
      randomDirection(_direction);
      body.velocity.addScaledVector(_direction, factor);
      limitLength(body.velocity, PHYSICS.MAX_SPEED);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    bodies.length = 0;
    accumulator = 0;
    stats.accumulator = 0;
    stats.substeps = 0;
  }

  return {
    bodies,
    radius,
    containerRadius,
    minDistance,
    maxSubsteps,
    stats,
    step,
    kick,
    setExtracted,
    dispose,
    get isDisposed() {
      return disposed;
    },
  };
}
