import * as THREE from 'three';
import {
  BALL_COUNT,
  BALL_RADIUS,
  BALL_SHELL_RADIUS,
  COLORS,
} from './constants.js';
import { createNumberTexture } from './numberTexture.js';

/** Posições determinísticas em espiral dourada, dentro da casca do globo. */
export function ballPositions(count = BALL_COUNT, radius = BALL_SHELL_RADIUS) {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('count deve ser um inteiro positivo.');
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const positions = [];

  for (let index = 0; index < count; index += 1) {
    const y = count === 1 ? 0 : 1 - (index / (count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = goldenAngle * index;
    positions.push(new THREE.Vector3(
      Math.cos(angle) * ring * radius,
      y * radius,
      Math.sin(angle) * ring * radius,
    ));
  }

  return positions;
}

/** Cria exatamente 25 esferas numeradas de 01 a 25, sem duplicatas. */
export function createBalls({ lowPower = false } = {}) {
  const root = new THREE.Group();
  root.name = 'bolas';

  const sphereGeometry = new THREE.SphereGeometry(
    BALL_RADIUS,
    lowPower ? 16 : 24,
    lowPower ? 12 : 16,
  );
  const bandGeometry = new THREE.TorusGeometry(
    BALL_RADIUS * 1.005,
    0.018,
    6,
    lowPower ? 16 : 24,
  );

  const sphereMaterial = new THREE.MeshPhysicalMaterial({
    color: COLORS.ball,
    roughness: 0.34,
    metalness: 0,
    clearcoat: lowPower ? 0.4 : 0.85,
    clearcoatRoughness: 0.18,
  });
  const bandMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.accent,
    roughness: 0.45,
    metalness: 0.1,
  });
  const highlightGeometry = new THREE.TorusGeometry(
    BALL_RADIUS * 1.35,
    0.025,
    8,
    lowPower ? 20 : 32,
  );
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.accent,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  // Anel separado para os números do primeiro bilhete: material próprio para
  // não alterar a cor do destaque comum das demais bolas extraídas.
  const matchMaterial = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  const positions = ballPositions(BALL_COUNT);

  for (let index = 0; index < BALL_COUNT; index += 1) {
    const number = index + 1;
    const ball = new THREE.Group();
    ball.name = `bola-${String(number).padStart(2, '0')}`;
    ball.userData.number = number;
    ball.position.copy(positions[index]);

    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.name = 'superficie';
    sphere.castShadow = true;
    ball.add(sphere);

    const band = new THREE.Mesh(bandGeometry, bandMaterial);
    band.name = 'faixa';
    band.rotation.x = Math.PI / 2;
    band.userData.baseQuaternion = band.quaternion.clone();
    ball.add(band);

    ball.userData.spinNodes = { sphere, band };

    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createNumberTexture(number),
      transparent: true,
      depthWrite: false,
      depthTest: true,
    }));
    label.name = 'numero';
    label.userData.number = number;
    label.position.set(0, 0, BALL_RADIUS + 0.02);
    label.scale.set(0.34, 0.23, 1);
    label.userData.baseScale = label.scale.clone();
    ball.add(label);

    // Destaque por bola: material e geometria compartilhados, visibilidade
    // individual. Nenhuma cor de todas as bolas é alterada durante a extração.
    const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    highlight.name = 'destaque-extracao';
    highlight.visible = false;
    ball.add(highlight);
    ball.userData.highlight = highlight;

    const matchHighlight = new THREE.Mesh(highlightGeometry, matchMaterial);
    matchHighlight.name = 'destaque-acerto-primeiro';
    matchHighlight.scale.setScalar(1.2);
    matchHighlight.visible = false;
    ball.add(matchHighlight);
    ball.userData.matchHighlight = matchHighlight;
    ball.userData.label = label;

    root.add(ball);
  }

  root.userData.ballCount = BALL_COUNT;
  return root;
}

/**
 * Copia posição e rotação dos corpos físicos para os meshes correspondentes.
 * A etiqueta numérica permanece voltada para a câmera (é um Sprite) e não gira.
 */
export function syncBalls(balls, bodies) {
  const count = Math.min(balls.children.length, bodies.length);

  for (let index = 0; index < count; index += 1) {
    const body = bodies[index];
    if (body.extracted) continue;
    const ball = balls.children[index];
    ball.position.copy(body.position);

    const nodes = ball.userData.spinNodes;
    if (!nodes) continue;
    nodes.sphere.quaternion.copy(body.quaternion);
    nodes.band.quaternion.copy(nodes.band.userData.baseQuaternion)
      .premultiply(body.quaternion);
  }

  return count;
}

/** Números presentes no grupo de bolas, em ordem crescente. */
export function getBallNumbers(balls) {
  return balls.children
    .map((ball) => ball.userData.number)
    .filter((number) => Number.isInteger(number))
    .sort((a, b) => a - b);
}
