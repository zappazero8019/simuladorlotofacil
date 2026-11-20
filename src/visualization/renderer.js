import * as THREE from 'three';

/** Renderer WebGL com sombras e tone mapping, otimizado para dispositivos móveis. */
export function createRenderer({ lowPower = false, pixelRatio } = {}) {
  const renderer = new THREE.WebGLRenderer({
    antialias: !lowPower,
    alpha: true,
    powerPreference: lowPower ? 'low-power' : 'high-performance',
  });

  const ratio = pixelRatio ?? Math.min(
    globalThis.devicePixelRatio || 1,
    lowPower ? 1 : 2,
  );
  renderer.setPixelRatio(ratio);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lowPower ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

/** Redimensiona o desenho sem alterar o pixel ratio definido na criação. */
export function resizeRenderer(renderer, width, height) {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  renderer.setSize(safeWidth, safeHeight, false);
  return renderer;
}

/** Libera o contexto WebGL e remove o canvas do DOM. */
export function disposeRenderer(renderer) {
  renderer.dispose();
  if (typeof renderer.forceContextLoss === 'function') {
    renderer.forceContextLoss();
  }
  renderer.domElement?.remove();
}
