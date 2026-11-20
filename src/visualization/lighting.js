import * as THREE from 'three';

/** Iluminação com uma luz principal, preenchimento e reflexos coloridos. */
export function createLighting(scene, { lowPower = false } = {}) {
  const lights = [];

  const ambient = new THREE.HemisphereLight(0xd8ecff, 0x0b1220, 1.1);
  ambient.name = 'luz-ambiente';
  scene.add(ambient);
  lights.push(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.name = 'luz-principal';
  key.position.set(4, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 22;
  key.shadow.bias = -0.0004;
  scene.add(key);
  lights.push(key);

  const rim = new THREE.PointLight(0x5bd6ff, lowPower ? 10 : 22, 14, 2);
  rim.name = 'luz-contorno';
  rim.position.set(-4, 2.5, 3);
  scene.add(rim);
  lights.push(rim);

  const warm = new THREE.PointLight(0xffd2a1, lowPower ? 8 : 14, 12, 2);
  warm.name = 'luz-quente';
  warm.position.set(3, -0.5, -3);
  scene.add(warm);
  lights.push(warm);

  const top = new THREE.PointLight(0xffffff, lowPower ? 8 : 16, 12, 2);
  top.name = 'luz-superior';
  top.position.set(0, 5.5, 1.5);
  scene.add(top);
  lights.push(top);

  return {
    lights,
    dispose() {
      for (const light of lights) {
        scene.remove(light);
        light.shadow?.map?.dispose();
      }
      lights.length = 0;
    },
  };
}
