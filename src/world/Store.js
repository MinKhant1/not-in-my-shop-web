import * as THREE from 'three';
import { storeLayout } from './StoreLayout.js';
import { ToonMaterialFactory } from '../rendering/ToonMaterial.js';

function isMiniMarketModel(url) {
  return url.startsWith('/models/environment/') || url.startsWith('/models/store/');
}

function hasUsableMap(material) {
  if (!material || !material.map || !material.map.image) {
    return false;
  }
  const mapName = material.map.name || '';
  return !/colormap/i.test(mapName);
}

function needsVariationA(material) {
  if (!material) {
    return true;
  }
  if (material.name === 'glass') {
    return false;
  }
  if (material.name === 'colormap' || !material.map) {
    return true;
  }
  return /colormap/i.test(material.map.name || '');
}

export class Store {
  constructor(scene, loader, collision, config) {
    this.scene = scene;
    this.loader = loader;
    this.collision = collision;
    this.shadows = config.graphics.shadows;
    this.toonShading = config.graphics.toonShading === true;
    this.debug = config.debug;
    this.group = new THREE.Group();
    this.group.name = 'store';
    this.records = [];
    this.expansionOpen = false;
    this.reportedModels = new Set();
    this.miniMarketTexture = null;
    this.toonMaterials = this.toonShading
      ? new ToonMaterialFactory(config.graphics.toonSteps ?? 4)
      : null;
  }

  async load() {
    this.miniMarketTexture = await this.loader.getMiniMarketTexture();
    this.scene.add(this.group);
    await Promise.all(storeLayout.map((entry) => this.spawn(entry)));
    this.group.updateWorldMatrix(true, true);

    for (let i = 0; i < this.records.length; i += 1) {
      const record = this.records[i];
      if (record.entry.collision && record.entry.group !== 'expansion') {
        this.collision.addObject(record.object, {
          id: record.entry.id,
          group: record.entry.group || ''
        });
      }
    }
  }

  setGroupVisible(group, visible) {
    const records = this.records;
    for (let i = 0; i < records.length; i += 1) {
      if (records[i].entry.group === group) {
        records[i].object.visible = visible === true;
      }
    }
  }

  openRightExpansion() {
    if (this.expansionOpen) {
      return;
    }
    this.expansionOpen = true;
    this.setGroupVisible('east-wall', false);
    this.setGroupVisible('expansion', true);
    this.collision.setGroupEnabled('east-wall', false);
    const records = this.records;
    for (let i = 0; i < records.length; i += 1) {
      const entry = records[i].entry;
      if (entry.group === 'expansion' && entry.collision) {
        this.collision.addObject(records[i].object, {
          id: entry.id,
          group: entry.group
        });
      }
    }
  }

  async spawn(entry) {
    const object = new THREE.Group();
    object.name = entry.id;
    object.position.set(entry.position[0], entry.position[1], entry.position[2]);
    object.rotation.set(entry.rotation[0], entry.rotation[1], entry.rotation[2]);
    object.scale.setScalar(entry.scale ?? 1);

    if (entry.placeholder) {
      object.add(this.createMapPlaceholder(entry));
    } else {
      const asset = await this.loader.load(entry.model);
      if (isMiniMarketModel(entry.model)) {
        this.applyMiniMarketTexture(asset.scene, entry.model);
      }
      if (this.shadows) {
        this.enableShadows(asset.scene);
      }
      object.add(asset.scene);
    }

    this.group.add(object);
    this.records.push({ entry, object });
  }

  createMapPlaceholder(entry) {
    const [width, height, depth] = entry.placeholder.size;
    const source = new THREE.MeshStandardMaterial({
      color: entry.placeholder.color,
      roughness: 0.74,
      metalness: 0.02
    });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      this.toonMaterials ? this.toonMaterials.fromImported(source) : source
    );
    mesh.name = entry.id;
    mesh.position.y = height / 2;
    if (this.shadows) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    return mesh;
  }

  applyMiniMarketTexture(model, modelUrl) {
    const texture = this.miniMarketTexture;
    const modelName = modelUrl.split('/').pop();
    const report = this.debug && !this.reportedModels.has(modelUrl);
    if (report) {
      this.reportedModels.add(modelUrl);
    }

    model.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const hasUV = Boolean(child.geometry && child.geometry.attributes && child.geometry.attributes.uv);
      const sources = Array.isArray(child.material) ? child.material : [child.material];
      let originalMap = false;
      let applied = false;
      const nextMaterials = sources.map((source) => {
        originalMap = originalMap || hasUsableMap(source);
        if (!needsVariationA(source)) {
          return source;
        }

        applied = true;
        if (this.toonMaterials) {
          return this.toonMaterials.create(source, texture);
        }

        const material = source ? source.clone() : new THREE.MeshStandardMaterial();
        material.map = texture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        return material;
      });

      child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0];

      if (!report) {
        return;
      }

      const meshName = child.name || '(unnamed)';
      console.log(`Model: ${modelName}`);
      console.log(`Mesh: ${meshName}`);
      console.log(`UV exists: ${hasUV}`);
      console.log(`Original map: ${originalMap}`);
      console.log(`Applied variation-a: ${applied}`);
      if (!hasUV) {
        console.log(`Mesh ${meshName} on ${modelName} has no UV attribute.`);
      }
    });
  }

  enableShadows(model) {
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }
}
