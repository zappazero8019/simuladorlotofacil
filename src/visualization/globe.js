import * as THREE from 'three';
import { COLORS, GLOBE_RADIUS } from './constants.js';

function metalMaterial(color, roughness = 0.28) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.85,
    roughness,
  });
}

/** Estrutura transparente, armação metálica, base e palco do equipamento. */
export function createGlobe({ lowPower = false } = {}) {
  const group = new THREE.Group();
  group.name = 'globo';

  const frameMaterial = metalMaterial(COLORS.frame);
  const darkMaterial = metalMaterial(COLORS.frameDark, 0.4);

  const shellGeometry = new THREE.SphereGeometry(
    GLOBE_RADIUS,
    lowPower ? 28 : 40,
    lowPower ? 18 : 28,
  );
  const shellMaterial = lowPower
    ? new THREE.MeshStandardMaterial({
      color: COLORS.shell,
      transparent: true,
      opacity: 0.18,
      roughness: 0.2,
      metalness: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    : new THREE.MeshPhysicalMaterial({
      color: COLORS.shell,
      transparent: true,
      opacity: 0.42,
      transmission: 0.9,
      thickness: 0.4,
      ior: 1.45,
      roughness: 0.08,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  shell.name = 'casca-transparente';
  shell.renderOrder = 3;
  group.add(shell);

  const ringGeometry = new THREE.TorusGeometry(GLOBE_RADIUS + 0.02, 0.035, 6, lowPower ? 40 : 64);
  const equator = new THREE.Mesh(ringGeometry, frameMaterial);
  equator.name = 'anel-equatorial';
  equator.rotation.x = Math.PI / 2;
  equator.castShadow = true;
  group.add(equator);

  const meridianA = new THREE.Mesh(ringGeometry, frameMaterial);
  meridianA.name = 'anel-meridiano-a';
  meridianA.castShadow = true;
  group.add(meridianA);

  const meridianB = new THREE.Mesh(ringGeometry, frameMaterial);
  meridianB.name = 'anel-meridiano-b';
  meridianB.rotation.y = Math.PI / 2;
  meridianB.castShadow = true;
  group.add(meridianB);

  const capGeometry = new THREE.SphereGeometry(0.13, 12, 8);
  for (const [name, y] of [['tampa-superior', 2.2], ['tampa-inferior', -2.2]]) {
    const cap = new THREE.Mesh(capGeometry, darkMaterial);
    cap.name = name;
    cap.position.y = y;
    cap.castShadow = true;
    group.add(cap);
  }

  const postGeometry = new THREE.CylinderGeometry(0.055, 0.055, 4.8, 10);
  for (const x of [-2.3, 2.3]) {
    const post = new THREE.Mesh(postGeometry, darkMaterial);
    post.name = 'coluna-sustentacao';
    post.position.set(x, -0.15, 0);
    post.castShadow = true;
    group.add(post);
  }

  const topRingGeometry = new THREE.TorusGeometry(2.3, 0.06, 8, lowPower ? 40 : 64);
  const topRing = new THREE.Mesh(topRingGeometry, darkMaterial);
  topRing.name = 'anel-superior';
  topRing.position.y = 2.25;
  topRing.rotation.x = Math.PI / 2;
  topRing.castShadow = true;
  group.add(topRing);

  const baseGeometry = new THREE.CylinderGeometry(2.0, 2.2, 0.3, lowPower ? 32 : 48);
  const base = new THREE.Mesh(baseGeometry, darkMaterial);
  base.name = 'base';
  base.position.y = -2.75;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const plateGeometry = new THREE.CylinderGeometry(1.85, 1.85, 0.06, lowPower ? 32 : 48);
  const plate = new THREE.Mesh(plateGeometry, frameMaterial);
  plate.name = 'placa-base';
  plate.position.y = -2.56;
  plate.receiveShadow = true;
  group.add(plate);

  const trimGeometry = new THREE.TorusGeometry(2.05, 0.06, 8, lowPower ? 40 : 64);
  const trim = new THREE.Mesh(trimGeometry, frameMaterial);
  trim.name = 'detalhe-base';
  trim.position.y = -2.58;
  trim.rotation.x = Math.PI / 2;
  group.add(trim);

  const stage = new THREE.Mesh(
    new THREE.CircleGeometry(4.6, lowPower ? 40 : 64),
    new THREE.MeshStandardMaterial({
      color: COLORS.stage,
      roughness: 0.85,
      metalness: 0.1,
    }),
  );
  stage.name = 'palco';
  stage.rotation.x = -Math.PI / 2;
  stage.position.y = -3.06;
  stage.receiveShadow = true;
  group.add(stage);

  return group;
}
