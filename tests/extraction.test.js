import { describe, expect, it } from 'vitest';
import { BALL_COUNT, BALL_RADIUS } from '../src/visualization/constants.js';
import {
  EXTRACTION_SIZE,
  createBalls,
  createExtractionController,
  createPhysicsWorld,
  createSeededRandom,
} from '../src/visualization/index.js';

const SEQUENCE = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 1, 3, 5];

function setup() {
  const balls = createBalls();
  const physics = createPhysicsWorld({
    positions: balls.children.map((ball) => ball.position.clone()),
    radius: BALL_RADIUS,
    random: createSeededRandom(97),
  });
  const extractedEvents = [];
  const extraction = createExtractionController({
    balls,
    physics,
    duration: 0.1,
    onExtracted: (number) => extractedEvents.push(number),
  });
  return { balls, physics, extraction, extractedEvents };
}

describe('extração visual do globo — Fase 2C', () => {
  it('extrai exatamente 15 bolas correspondentes ao resultado', () => {
    const { balls, physics, extraction } = setup();
    expect(EXTRACTION_SIZE).toBe(15);
    expect(balls.children).toHaveLength(BALL_COUNT);

    for (const [index, number] of SEQUENCE.entries()) {
      expect(extraction.reveal(number, index)).toBe(true);
    }
    expect(extraction.getExtractedNumbers()).toEqual([...SEQUENCE].sort((a, b) => a - b));
    expect(extraction.getRemainingNumbers()).toHaveLength(10);

    const extractedIndices = physics.bodies
      .map((body, index) => (body.extracted ? index : -1))
      .filter((index) => index >= 0);
    expect(extractedIndices).toHaveLength(15);
    for (const index of extractedIndices) {
      expect(SEQUENCE).toContain(balls.children[index].userData.number);
    }
    extraction.dispose();
  });

  it('não extrai números repetidos nem posições repetidas', () => {
    const { extraction } = setup();
    expect(extraction.reveal(2, 0)).toBe(true);
    expect(extraction.reveal(2, 1)).toBe(false);
    expect(extraction.reveal(7, 0)).toBe(false);
    expect(extraction.reveal(26, 1)).toBe(false);
    expect(extraction.reveal(7, 15)).toBe(false);
    expect(extraction.getExtractedNumbers()).toEqual([2]);
    extraction.dispose();
  });

  it('mantém as 10 bolas restantes dentro do globo', () => {
    const { balls, physics, extraction } = setup();
    for (const [index, number] of SEQUENCE.entries()) extraction.reveal(number, index);

    for (let frame = 0; frame < 300; frame += 1) {
      physics.step(1 / 60, 1);
      extraction.update(1 / 60);
    }

    for (const body of physics.bodies) {
      if (!body.extracted) {
        expect(body.position.length()).toBeLessThanOrEqual(physics.containerRadius + 0.01);
      }
    }
    expect(extraction.getRemainingNumbers()).toHaveLength(10);
    extraction.dispose();
  });

  it('a física ignora corpos extraídos', () => {
    const { balls, physics, extraction } = setup();
    extraction.reveal(5, 0);
    const removed = physics.bodies[4];
    const before = removed.position.clone();

    for (let frame = 0; frame < 120; frame += 1) {
      physics.step(1 / 60, 1);
      extraction.update(1 / 60);
    }
    expect(removed.position.equals(before)).toBe(true);
    expect(balls.children[4].visible).toBe(true);
    extraction.dispose();
  });

  it('anima a saída e notifica ao concluir', () => {
    const { balls, extraction, extractedEvents } = setup();
    const ball = balls.children[1];
    const original = ball.position.clone();

    expect(extraction.reveal(2, 0)).toBe(true);
    extraction.update(0.05);
    const middle = ball.position.clone();
    expect(middle.equals(original)).toBe(false);
    expect(ball.scale.x).toBeGreaterThan(1);

    extraction.update(0.1);
    expect(ball.scale.x).toBe(1);
    expect(extractedEvents).toEqual([2]);
    expect(extraction.getState().animating).toBe(0);
    extraction.dispose();
  });

  it('pausa e reinicia preservando as 25 bolas', () => {
    const { balls, physics, extraction } = setup();
    for (const [index, number] of SEQUENCE.entries()) extraction.reveal(number, index);

    extraction.setPaused(true);
    const pausedPosition = balls.children[1].position.clone();
    extraction.update(1);
    expect(balls.children[1].position.equals(pausedPosition)).toBe(true);

    extraction.reset();
    expect(extraction.getExtractedNumbers()).toEqual([]);
    expect(extraction.getRemainingNumbers()).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
    expect(physics.bodies.every((body) => !body.extracted)).toBe(true);
    expect(extraction.getState().paused).toBe(true);
    extraction.dispose();
  });

  it('libera recursos sem duplicar extrações', () => {
    const { extraction } = setup();
    extraction.reveal(2, 0);
    extraction.dispose();
    expect(extraction.isDisposed).toBe(true);
    expect(extraction.reveal(4, 1)).toBe(false);
    expect(extraction.getState().paused).toBe(false);
  });
});
