import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BALL_COUNT,
  BALL_RADIUS,
  PHYSICS,
  createBalls,
  createMixer,
  createPhysicsWorld,
  createSeededRandom,
  getBallNumbers,
  syncBalls,
} from '../src/visualization/index.js';

const TOLERANCE = 0.01;

function finitePositions(world) {
  return world.bodies.every((body) => Number.isFinite(body.position.x)
    && Number.isFinite(body.position.y)
    && Number.isFinite(body.position.z));
}

function minimumDistance(world) {
  let minimum = Infinity;
  for (let first = 0; first < world.bodies.length; first += 1) {
    for (let second = first + 1; second < world.bodies.length; second += 1) {
      minimum = Math.min(
        minimum,
        world.bodies[first].position.distanceTo(world.bodies[second].position),
      );
    }
  }
  return minimum;
}

describe('física e mistura das bolas — Fase 2B', () => {
  it('move as 25 bolas enquanto a mistura está ativa', () => {
    const world = createPhysicsWorld({ random: createSeededRandom(7) });
    const before = world.bodies.map((body) => body.position.clone());

    for (let frame = 0; frame < 120; frame += 1) {
      world.step(1 / 60, 1);
    }

    const moved = world.bodies.filter(
      (body, index) => body.position.distanceTo(before[index]) > 0.01,
    );
    expect(world.bodies).toHaveLength(BALL_COUNT);
    expect(moved).toHaveLength(25);
    expect(finitePositions(world)).toBe(true);
  });

  it('resolve colisões entre bolas sobrepostas sem atravessamento', () => {
    const world = createPhysicsWorld({
      positions: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.01, 0, 0)],
      count: 2,
      random: createSeededRandom(3),
    });

    world.step(1 / 120, 1);
    expect(minimumDistance(world)).toBeGreaterThanOrEqual(
      world.minDistance - TOLERANCE,
    );

    for (let frame = 0; frame < 120; frame += 1) {
      world.step(1 / 60, 1);
      expect(minimumDistance(world)).toBeGreaterThanOrEqual(
        world.minDistance - TOLERANCE,
      );
    }
  });

  it('mantém as 25 bolas separadas e dentro do globo após longa mistura', () => {
    const world = createPhysicsWorld({ random: createSeededRandom(13) });

    for (let frame = 0; frame < 900; frame += 1) {
      world.step(1 / 60, 1);
      expect(minimumDistance(world)).toBeGreaterThanOrEqual(
        world.minDistance - TOLERANCE,
      );
    }

    for (const body of world.bodies) {
      expect(body.position.length()).toBeLessThanOrEqual(
        world.containerRadius + TOLERANCE,
      );
    }
  });

  it('permanece estável com diferentes deltas de tempo', () => {
    for (const delta of [1 / 240, 1 / 120, 1 / 60, 1 / 30, 0.1, 0.5, NaN, -1]) {
      const world = createPhysicsWorld({ random: createSeededRandom(21) });
      for (let frame = 0; frame < 300; frame += 1) {
        world.step(delta, 1);
      }

      expect(finitePositions(world)).toBe(true);
      expect(minimumDistance(world)).toBeGreaterThanOrEqual(
        world.minDistance - TOLERANCE,
      );
      for (const body of world.bodies) {
        expect(body.velocity.length()).toBeLessThanOrEqual(PHYSICS.MAX_SPEED * 1.001);
        expect(body.angularVelocity.length()).toBeLessThanOrEqual(PHYSICS.MAX_ANGULAR * 1.001);
      }
    }
  });

  it('usa timestep fixo e limita subpassos', () => {
    const world = createPhysicsWorld({ random: createSeededRandom(31) });

    expect(world.step(1 / 240).substeps).toBe(0);
    expect(world.step(1 / 240).substeps).toBe(1);
    expect(world.step(0).substeps).toBe(0);
    expect(world.step(NaN).substeps).toBe(0);
    expect(world.step(-1).substeps).toBe(0);

    const long = world.step(0.5);
    expect(long.substeps).toBe(world.maxSubsteps);
    expect(long.accumulator).toBeLessThanOrEqual(PHYSICS.FIXED_DT);
    expect(world.stats.totalSteps).toBeGreaterThanOrEqual(world.maxSubsteps);

    const lowPower = createPhysicsWorld({
      random: createSeededRandom(31),
      lowPower: true,
    });
    expect(lowPower.maxSubsteps).toBeLessThan(world.maxSubsteps);
    expect(lowPower.step(0.5).substeps).toBe(lowPower.maxSubsteps);
  });

  it('faz a transição suave ao iniciar e interromper a mistura', () => {
    const world = createPhysicsWorld({ random: createSeededRandom(41) });
    const mixer = createMixer(world);

    expect(mixer.isActive).toBe(false);
    expect(mixer.start()).toBe(true);
    expect(mixer.start()).toBe(false);

    mixer.update(1 / 60);
    expect(mixer.intensity).toBeGreaterThan(0);
    expect(mixer.intensity).toBeLessThan(0.1);

    for (let frame = 0; frame < 600; frame += 1) mixer.update(1 / 60);
    expect(mixer.intensity).toBe(1);

    expect(mixer.stop()).toBe(true);
    expect(mixer.stop()).toBe(false);
    for (let frame = 0; frame < 600; frame += 1) mixer.update(1 / 60);
    expect(mixer.intensity).toBe(0);
    expect(mixer.isActive).toBe(false);
  });

  it('interrompe e libera a simulação no dispose', () => {
    const world = createPhysicsWorld({ random: createSeededRandom(47) });
    const mixer = createMixer(world);
    mixer.start();
    mixer.update(1 / 60);
    const before = world.bodies.map((body) => body.position.clone());

    mixer.dispose();
    world.dispose();

    expect(mixer.isActive).toBe(false);
    expect(mixer.isDisposed).toBe(true);
    expect(mixer.intensity).toBe(0);
    expect(mixer.update(1 / 60)).toBe(0);
    expect(world.step(1 / 60).substeps).toBe(0);
    expect(world.isDisposed).toBe(true);
    expect(world.bodies).toHaveLength(0);
    expect(before).toHaveLength(BALL_COUNT);
  });

  it('sincroniza meshes sem alterar a numeração das bolas', () => {
    const balls = createBalls();
    const world = createPhysicsWorld({
      positions: balls.children.map((ball) => ball.position.clone()),
      random: createSeededRandom(53),
    });
    world.step(1 / 60, 1);

    expect(syncBalls(balls, world.bodies)).toBe(25);
    expect(getBallNumbers(balls)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );

    for (let index = 0; index < balls.children.length; index += 1) {
      const ball = balls.children[index];
      const body = world.bodies[index];
      expect(ball.position.equals(body.position)).toBe(true);
      expect(ball.userData.spinNodes.sphere.quaternion.equals(body.quaternion)).toBe(true);
      expect(ball.getObjectByName('numero').userData.number).toBe(index + 1);
    }
  });

  it('valida argumentos do mundo físico', () => {
    expect(() => createPhysicsWorld({ count: 0 })).toThrow(RangeError);
    expect(() => createPhysicsWorld({ positions: [], count: 2 })).toThrow(RangeError);
    expect(() => createPhysicsWorld({ radius: 0 })).toThrow(RangeError);
    expect(() => createPhysicsWorld({ random: null })).toThrow(TypeError);
    expect(() => createMixer(null)).toThrow(TypeError);
  });
});
