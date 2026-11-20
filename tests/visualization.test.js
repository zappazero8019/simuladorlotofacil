import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BALL_COUNT,
  BALL_RADIUS,
  GLOBE_RADIUS,
  ballPositions,
  createBalls,
  createCamera,
  createGlobe,
  createLighting,
  createNumberTexture,
  createScene,
  getBallNumbers,
  updateCamera,
} from '../src/visualization/index.js';

const visualizationUrl = new URL('../src/visualization/', import.meta.url);
const visualizationDir = fileURLToPath(visualizationUrl);

describe('visualização 3D — Fase 2A', () => {
  it('exporta todos os módulos de responsabilidade separada', async () => {
    const modules = [
      'constants', 'numberTexture', 'scene', 'camera', 'lighting',
      'globe', 'balls', 'physics', 'mixer', 'extraction', 'renderer', 'resources', 'index',
    ];

    for (const name of modules) {
      const module = await import(`../src/visualization/${name}.js`);
      expect(Object.keys(module).length).toBeGreaterThan(0);
    }
  });

  it('cria exatamente 25 bolas numeradas de 01 a 25', () => {
    const balls = createBalls();

    expect(balls.children).toHaveLength(BALL_COUNT);
    expect(balls.userData.ballCount).toBe(25);
    expect(getBallNumbers(balls)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
    expect(new Set(getBallNumbers(balls)).size).toBe(25);

    for (const [index, ball] of balls.children.entries()) {
      expect(ball.userData.number).toBe(index + 1);
      expect(ball.name).toBe(`bola-${String(index + 1).padStart(2, '0')}`);
      expect(ball.children.map((child) => child.name)).toEqual([
        'superficie', 'faixa', 'numero', 'destaque-extracao', 'destaque-acerto-primeiro',
      ]);
    }
  });

  it('mantém as bolas separadas e dentro da casca do globo', () => {
    const positions = ballPositions();

    expect(positions).toHaveLength(25);
    for (const position of positions) {
      expect(position.length() + BALL_RADIUS).toBeLessThan(GLOBE_RADIUS);
    }

    let minimum = Infinity;
    for (let first = 0; first < positions.length; first += 1) {
      for (let second = first + 1; second < positions.length; second += 1) {
        minimum = Math.min(minimum, positions[first].distanceTo(positions[second]));
      }
    }
    expect(minimum).toBeGreaterThan(BALL_RADIUS * 2);
  });

  it('posiciona as bolas de forma determinística', () => {
    const first = ballPositions();
    const second = ballPositions();
    expect(first.map((position) => position.toArray())).toEqual(
      second.map((position) => position.toArray()),
    );
  });

  it('gera texturas numéricas legíveis e em alto contraste', () => {
    const texture = createNumberTexture(7);
    expect(texture.isDataTexture).toBe(true);
    expect(texture.image.width).toBe(48);
    expect(texture.image.height).toBe(32);

    const bytes = texture.image.data;
    const opaque = [];
    for (let index = 3; index < bytes.length; index += 4) {
      if (bytes[index] === 255) opaque.push(index);
    }
    expect(opaque.length).toBeGreaterThan(20);
    expect(bytes[opaque[0] - 3]).toBe(15);
    expect(bytes[opaque[0] - 2]).toBe(23);
    expect(bytes[opaque[0] - 1]).toBe(42);
    expect(() => createNumberTexture(26)).toThrow(RangeError);
  });

  it('monta cena, globo, iluminação e câmera responsiva', () => {
    const scene = createScene();
    expect(scene.fog).not.toBeNull();

    const globe = createGlobe({ lowPower: true });
    expect(globe.name).toBe('globo');
    expect(globe.children.length).toBeGreaterThan(5);
    expect(globe.getObjectByName('casca-transparente')).toBeDefined();
    expect(globe.getObjectByName('base')).toBeDefined();

    const lighting = createLighting(scene, { lowPower: true });
    expect(lighting.lights).toHaveLength(5);
    expect(scene.children).toHaveLength(5);
    lighting.dispose();
    expect(scene.children).toHaveLength(0);

    const wide = createCamera(1.6);
    const narrow = createCamera(0.5);
    expect(wide.isPerspectiveCamera).toBe(true);
    expect(narrow.position.z).toBeGreaterThan(wide.position.z);
    updateCamera(wide, 0.75);
    expect(wide.aspect).toBe(0.75);
  });

  it('mantém a visualização isolada do motor matemático', () => {
    const files = readdirSync(visualizationDir).filter((file) => file.endsWith('.js'));
    const forbidden = /from\s+['"](\.\.\/)+(core|bets|draws|prizes|finance|history|statistics)\//;

    for (const file of files) {
      const source = readFileSync(new URL(file, visualizationUrl), 'utf8');
      expect(source).not.toMatch(forbidden);
      expect(source).not.toMatch(/document\.|localStorage|new Audio\(/);
    }
  });
});
