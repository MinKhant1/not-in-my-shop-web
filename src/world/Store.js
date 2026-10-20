import * as THREE from 'three';
import { storeLayout } from './StoreLayout.js';
import { ToonMaterialFactory } from '../rendering/ToonMaterial.js';
import { createDecor, createPurchaseMarker } from './SectionDecor.js';
import { createProceduralFixture } from './ProceduralFixtures.js';
import { buildExpansionShell, groceryDecor, shellFloorModel } from './SectionShell.js';
import {
  STORE_WEST,
  fixtureById,
  sanitizeUnlock,
  sectionById,
  sectionEast,
  storeSections
} from './StoreSections.js';

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

function applyScale(object, scale) {
  if (Array.isArray(scale)) {
    object.scale.set(scale[0], scale[1], scale[2]);
    return;
  }
  object.scale.setScalar(scale ?? 1);
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
    this.shells = new Map();
    this.markers = [];
    this.spawnedFixtures = new Set();
    this.heldFixtureCollision = new Set();
    this.collidingGroups = new Set();
    this.maxUnlocked = 0;
    this.floorTemplate = null;
    this.floorDummy = new THREE.Object3D();
    this.reportedModels = new Set();
    this.miniMarketTexture = null;
    this._box = new THREE.Box3();
    this.onBoundsChanged = null;
    this.onFixtureSpawned = null;
    this.toonMaterials = this.toonShading
      ? new ToonMaterialFactory(config.graphics.toonSteps ?? 4)
      : null;
  }

  async load(unlockedIds, ownedFixtureIds) {
    this.miniMarketTexture = await this.loader.getMiniMarketTexture();
    this.scene.add(this.group);
    this.maxUnlocked = Math.max(0, sanitizeUnlock(unlockedIds).length - 1);

    await Promise.all(storeLayout.map((entry) => this.spawn(entry)));
    const grocery = sectionById('grocery');
    await Promise.all(groceryDecor(grocery).map((entry) => this.spawn(entry)));

    await this.prepareFloorTemplate();
    for (let i = 1; i < storeSections.length; i += 1) {
      const section = storeSections[i];
      const shell = buildExpansionShell(section);
      const floors = this.makeFloors(`floors-${section.id}`, shell.tiles);
      const apron = this.makeFloors(`apron-${section.id}`, shell.apron);
      floors.visible = false;
      apron.visible = false;
      this.group.add(floors, apron);
      this.shells.set(section.id, { floors, apron });
      await Promise.all(shell.entries.map((entry) => this.spawn(entry)));
    }

    this.group.updateWorldMatrix(true, true);
    this.addInitialCollision();
    this.syncUnlock();
    await this.preloadFixtureAssets();

    const owned = Array.isArray(ownedFixtureIds) ? ownedFixtureIds : [];
    for (let i = 0; i < owned.length; i += 1) {
      const fixture = fixtureById.get(owned[i]);
      if (fixture && !fixture.existing) {
        await this.spawnFixture(fixture);
      }
    }
  }

  unlockedIds() {
    return storeSections.slice(0, this.maxUnlocked + 1).map((section) => section.id);
  }

  isUnlocked(sectionId) {
    const section = sectionById(sectionId);
    return Boolean(section) && section.index <= this.maxUnlocked;
  }

  playLimits() {
    return {
      minX: STORE_WEST - 2.5,
      maxX: sectionEast(this.maxUnlocked) + 0.45,
      floorWest: -3,
      floorEast: sectionEast(this.maxUnlocked) - 0.5
    };
  }

  unlockSection(sectionId) {
    const section = sectionById(sectionId);
    if (!section || section.index <= 0) {
      return false;
    }
    if (section.index <= this.maxUnlocked) {
      return true;
    }
    if (section.index !== this.maxUnlocked + 1) {
      return false;
    }
    this.maxUnlocked = section.index;
    this.syncUnlock();
    this.collision.rebuildDebug();
    return true;
  }

  holdFixtureCollision(id) {
    this.heldFixtureCollision.add(id);
    if (this.collision.setIdEnabled(id, false)) {
      this.collision.rebuildDebug();
    }
  }

  releaseFixtureCollision(id) {
    if (!this.heldFixtureCollision.has(id)) {
      return;
    }
    this.heldFixtureCollision.delete(id);
    if (this.collision.setIdEnabled(id, true)) {
      this.collision.rebuildDebug();
    }
  }

  async spawnFixture(fixture) {
    if (!fixture || fixture.existing || this.spawnedFixtures.has(fixture.id)) {
      return false;
    }
    const entry = {
      id: fixture.id,
      model: fixture.asset,
      procedural: fixture.procedural,
      caseSize: fixture.caseSize,
      caseAccent: fixture.caseAccent,
      caseInterior: fixture.caseInterior,
      position: fixture.position,
      rotation: fixture.rotation,
      scale: fixture.scale,
      collision: true,
      keepColor: fixture.keepColor,
      group: `fixture-${fixture.sectionId}`
    };
    const object = await this.spawn(entry);
    this.collision.addObject(object, {
      id: fixture.id,
      group: entry.group,
      enabled: !this.heldFixtureCollision.has(fixture.id)
    });
    this.spawnedFixtures.add(fixture.id);
    this.onFixtureSpawned?.(object, fixture.id);
    this.collision.rebuildDebug();
    return true;
  }

  hideMarker(fixtureId) {
    const index = this.markers.findIndex((marker) => marker.fixture.id === fixtureId);
    if (index < 0) {
      return;
    }
    const marker = this.markers[index];
    this.disposeMarker(marker.object);
    this.markers.splice(index, 1);
  }

  showMarker(fixture) {
    if (this.markers.some((marker) => marker.fixture.id === fixture.id)) {
      return;
    }
    const section = sectionById(fixture.sectionId);
    if (!section || !this.isUnlocked(section.id)) {
      return;
    }
    this.addMarker(fixture, section);
  }

  setGroupVisible(group, visible) {
    const records = this.records;
    for (let i = 0; i < records.length; i += 1) {
      if (records[i].entry.group === group) {
        records[i].object.visible = visible === true;
      }
    }
  }

  syncUnlock() {
    const open = this.maxUnlocked;
    this.setGroupVisible('east-wall', open === 0);
    this.collision.setGroupEnabled('east-wall', open === 0);

    for (let index = 1; index < storeSections.length; index += 1) {
      const section = storeSections[index];
      const shown = index <= open;
      const edge = index === open;
      this.setGroupVisible(`section-${section.id}`, shown);
      this.setGroupVisible(`boundary-${section.id}`, shown && edge);
      const shell = this.shells.get(section.id);
      if (shell) {
        shell.floors.visible = shown;
        shell.apron.visible = shown && edge;
      }
      this.setCollisionGroup(`section-${section.id}`, shown);
      this.setCollisionGroup(`boundary-${section.id}`, shown && edge);
    }
    this.onBoundsChanged?.(this.playLimits());
  }

  addInitialCollision() {
    for (let i = 0; i < this.records.length; i += 1) {
      const record = this.records[i];
      if (!record.entry.collision) {
        continue;
      }
      const group = record.entry.group || '';
      if (group.startsWith('section-') || group.startsWith('boundary-')) {
        continue;
      }
      this.collision.addObject(record.object, { id: record.entry.id, group });
      if (group) {
        this.collidingGroups.add(group);
      }
    }
  }

  setCollisionGroup(group, enabled) {
    if (enabled && !this.collidingGroups.has(group)) {
      for (let i = 0; i < this.records.length; i += 1) {
        const record = this.records[i];
        if (record.entry.group === group && record.entry.collision) {
          this.collision.addObject(record.object, { id: record.entry.id, group });
        }
      }
      this.collidingGroups.add(group);
    }
    this.collision.setGroupEnabled(group, enabled);
  }

  createMarkersForUnlocked() {
    for (let i = 0; i <= this.maxUnlocked; i += 1) {
      this.createMarkers(storeSections[i]);
    }
  }

  createMarkers(section) {
    if (!section || section.index > this.maxUnlocked) {
      return;
    }
    const fixtures = section.fixtures;
    for (let i = 0; i < fixtures.length; i += 1) {
      const fixture = fixtures[i];
      if (fixture.existing || fixture.purchasedByDefault || this.spawnedFixtures.has(fixture.id)) {
        continue;
      }
      if (this.markers.some((marker) => marker.fixture.id === fixture.id)) {
        continue;
      }
      this.addMarker(fixture, section);
    }
  }

  addMarker(fixture, section) {
    const marker = createPurchaseMarker(fixture, section.accent);
    this.group.add(marker.object);
    this.markers.push({ fixture, object: marker.object, ring: marker.ring });
  }

  disposeMarker(object) {
    object.removeFromParent();
    object.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (let i = 0; i < materials.length; i += 1) {
        materials[i]?.map?.dispose();
        materials[i]?.dispose();
      }
    });
  }

  async preloadFixtureAssets() {
    const urls = new Set();
    for (let s = 0; s < storeSections.length; s += 1) {
      const fixtures = storeSections[s].fixtures;
      for (let i = 0; i < fixtures.length; i += 1) {
        if (fixtures[i].asset && !fixtures[i].existing) {
          urls.add(fixtures[i].asset);
        }
      }
    }
    await Promise.all([...urls].map((url) => this.loader.preload(url)));
  }

  async prepareFloorTemplate() {
    const asset = await this.loader.load(shellFloorModel);
    this.applyMiniMarketTexture(asset.scene, shellFloorModel);
    const meshes = [];
    asset.scene.updateWorldMatrix(true, true);
    asset.scene.traverse((child) => {
      if (child.isMesh) {
        meshes.push(child);
      }
    });
    this.floorTemplate = meshes;
  }

  makeFloors(name, tiles) {
    const group = new THREE.Group();
    group.name = name;
    const meshes = this.floorTemplate ?? [];
    if (tiles.length === 0 || meshes.length === 0) {
      return group;
    }
    for (let m = 0; m < meshes.length; m += 1) {
      const source = meshes[m];
      const instanced = new THREE.InstancedMesh(source.geometry, source.material, tiles.length);
      instanced.name = `${name}-mesh-${m}`;
      instanced.frustumCulled = false;
      instanced.castShadow = false;
      instanced.receiveShadow = this.shadows;
      for (let i = 0; i < tiles.length; i += 1) {
        this.floorDummy.position.set(tiles[i][0], 0, tiles[i][1]);
        this.floorDummy.rotation.set(0, 0, 0);
        this.floorDummy.scale.set(1, 1, 1);
        this.floorDummy.updateMatrix();
        instanced.setMatrixAt(i, this.floorDummy.matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      group.add(instanced);
    }
    return group;
  }

  async spawn(entry) {
    const object = new THREE.Group();
    object.name = entry.id;
    object.position.set(entry.position[0], entry.position[1], entry.position[2]);
    object.rotation.set(entry.rotation[0], entry.rotation[1], entry.rotation[2]);
    applyScale(object, entry.scale);
    object.visible = entry.startsHidden !== true;

    if (entry.decor) {
      object.add(createDecor(entry));
    } else if (entry.procedural) {
      object.add(createProceduralFixture(entry, this.toonMaterials));
    } else if (entry.placeholder) {
      object.add(this.createMapPlaceholder(entry));
    } else {
      const asset = await this.loader.load(entry.model);
      if (entry.keepColor === true) {
        if (this.toonMaterials) {
          this.applyOwnedToon(asset.scene);
        }
      } else if (isMiniMarketModel(entry.model)) {
        this.applyMiniMarketTexture(asset.scene, entry.model);
      }
      if (this.shadows) {
        this.enableShadows(asset.scene);
      }
      this.snapToFloor(asset.scene);
      object.add(asset.scene);
    }

    this.group.add(object);
    this.records.push({ entry, object });
    return object;
  }

  snapToFloor(model) {
    model.position.set(0, 0, 0);
    model.updateWorldMatrix(true, true);
    this._box.setFromObject(model);
    if (!this._box.isEmpty() && Math.abs(this._box.min.y) > 0.001) {
      model.position.y -= this._box.min.y;
    }
  }

  applyOwnedToon(model) {
    model.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }
      const geometry = child.geometry;
      if (geometry && !geometry.attributes.normal) {
        geometry.computeVertexNormals();
      }
      const sources = Array.isArray(child.material) ? child.material : [child.material];
      const next = sources.map((source) => this.toonMaterials.fromImported(source));
      child.material = Array.isArray(child.material) ? next : next[0];
    });
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
