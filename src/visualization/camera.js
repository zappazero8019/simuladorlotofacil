import * as THREE from 'three';
import { CAMERA_FOV } from './constants.js';

/** Câmera em perspectiva, posicionada de acordo com a proporção da tela. */
export function createCamera(aspect = 1) {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
  camera.name = 'camera-principal';
  return updateCamera(camera, aspect);
}

/** Ajusta aspecto e distância: telas estreitas recebem uma câmera mais afastada. */
export function updateCamera(camera, aspect) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const distance = Math.max(9.2, 6.4 / safeAspect);

  camera.aspect = safeAspect;
  camera.position.set(0, 0.45, distance);
  camera.lookAt(0, -0.25, 0);
  camera.updateProjectionMatrix();
  return camera;
}
