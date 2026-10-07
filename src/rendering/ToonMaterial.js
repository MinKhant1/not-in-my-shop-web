import * as THREE from 'three';

const FOUR_STEP_BANDS = [70, 150, 220, 255];

function bandValue(index, count) {
  if (count === FOUR_STEP_BANDS.length) {
    return FOUR_STEP_BANDS[index];
  }
  const t = count <= 1 ? 1 : index / (count - 1);
  return Math.round(70 + t * (255 - 70));
}

const sharedGradients = new Map();

export function createToonGradientMap(steps = 4) {
  const count = Math.max(2, Math.min(8, steps | 0));
  const colors = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    colors[i] = bandValue(i, count);
  }

  const gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  gradientMap.colorSpace = THREE.NoColorSpace;
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.wrapS = THREE.ClampToEdgeWrapping;
  gradientMap.wrapT = THREE.ClampToEdgeWrapping;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export function getSharedToonGradientMap(steps = 4) {
  const count = Math.max(2, Math.min(8, steps | 0));
  let gradientMap = sharedGradients.get(count);
  if (!gradientMap) {
    gradientMap = createToonGradientMap(count);
    sharedGradients.set(count, gradientMap);
  }
  return gradientMap;
}

export function createToonMaterial(baseMaterial, texture, gradientMap) {
  const material = new THREE.MeshToonMaterial({
    map: texture || null,
    gradientMap,
    color: 0xffffff
  });

  if (baseMaterial) {
    material.transparent = Boolean(baseMaterial.transparent);
    material.opacity = baseMaterial.opacity ?? 1;
    material.side = baseMaterial.side ?? THREE.FrontSide;
    material.alphaTest = baseMaterial.alphaTest ?? 0;
    material.depthWrite = baseMaterial.depthWrite !== false;
    if (baseMaterial.name) {
      material.name = baseMaterial.name;
    }
    if (!texture && baseMaterial.color) {
      material.color.copy(baseMaterial.color);
    }
  }

  material.needsUpdate = true;
  return material;
}

export function createToonMaterialFromImported(baseMaterial, gradientMap) {
  const texture = baseMaterial?.map || null;
  if (texture && texture.colorSpace !== THREE.SRGBColorSpace) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }

  const material = new THREE.MeshToonMaterial({
    map: texture,
    gradientMap,
    color: 0xffffff
  });

  if (baseMaterial) {
    if (baseMaterial.color) {
      material.color.copy(baseMaterial.color);
    }
    material.transparent = Boolean(baseMaterial.transparent);
    material.opacity = baseMaterial.opacity ?? 1;
    material.side = baseMaterial.side ?? THREE.FrontSide;
    material.alphaTest = baseMaterial.alphaTest ?? 0;
    material.depthWrite = baseMaterial.depthWrite !== false;
    material.vertexColors = Boolean(baseMaterial.vertexColors);
    if (baseMaterial.name) {
      material.name = baseMaterial.name;
    }
  }

  material.needsUpdate = true;
  return material;
}

export class ToonMaterialFactory {
  constructor(steps = 4) {
    this.gradientMap = getSharedToonGradientMap(steps);
    this.cache = new Map();
    this.importedCache = new Map();
  }

  fromImported(baseMaterial) {
    if (!baseMaterial) {
      return createToonMaterialFromImported(null, this.gradientMap);
    }
    let material = this.importedCache.get(baseMaterial.uuid);
    if (!material) {
      material = createToonMaterialFromImported(baseMaterial, this.gradientMap);
      this.importedCache.set(baseMaterial.uuid, material);
    }
    return material;
  }

  create(baseMaterial, texture) {
    const side = baseMaterial?.side ?? THREE.FrontSide;
    const transparent = Boolean(baseMaterial?.transparent);
    const opacity = baseMaterial?.opacity ?? 1;
    const alphaTest = baseMaterial?.alphaTest ?? 0;
    const key = `${side}|${transparent}|${opacity}|${alphaTest}|${texture ? texture.uuid : 'none'}`;
    let material = this.cache.get(key);
    if (!material) {
      material = createToonMaterial(baseMaterial, texture, this.gradientMap);
      this.cache.set(key, material);
    }
    return material;
  }
}
