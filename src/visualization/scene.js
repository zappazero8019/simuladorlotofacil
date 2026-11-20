import * as THREE from 'three';
import { COLORS } from './constants.js';

/** Cena com fundo transparente (o CSS da interface fornece o gradiente). */
export function createScene() {
  const scene = new THREE.Scene();
  scene.name = 'cena-lotofacil';
  scene.fog = new THREE.Fog(COLORS.background, 13, 30);
  return scene;
}
