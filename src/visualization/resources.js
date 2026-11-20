/** Libera geometrias, materiais e texturas de uma árvore Three.js. */
export function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);

    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];

    for (const material of objectMaterials) {
      materials.add(material);
      for (const key of Object.keys(material)) {
        const value = material[key];
        if (value && value.isTexture) textures.add(value);
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
