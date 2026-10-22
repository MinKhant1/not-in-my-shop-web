import * as THREE from 'three';
import { createToonMaterial, createToonMaterialFromImported, getSharedToonGradientMap } from '../rendering/ToonMaterial.js';

export const STREETLIGHT_MODEL = '/models/outside/streetlight.glb';
const STREETLIGHT = STREETLIGHT_MODEL;
const BENCH = '/models/outside/bench.glb';
const HYDRANT = '/models/outside/firehydrant.glb';

const DEFAULTS = {
  marginNorth: 5.4,
  marginSouth: 2.9,
  marginEast: 4,
  marginWest: 1.35,
  lip: 0.42,
  plinthDrop: 0.84,
  plinthMid: 0.4,
  tread: 0.5,
  sidewalk: 2,
  southWalk: 2
};

function snapEdgeMin(value) {
  return Math.floor(value - 0.5) + 0.5;
}

function snapEdgeMax(value) {
  return Math.ceil(value - 0.5) + 0.5;
}

function tileCenters(min, max) {
  const start = Math.ceil(min + 0.5 - 1e-3);
  const end = Math.floor(max - 0.5 + 1e-3);
  const centers = [];
  for (let value = start; value <= end; value += 1) {
    centers.push(value);
  }
  return centers;
}

export class Diorama {
  constructor(parent, collision, loader, config) {
    this.parent = parent;
    this.collision = collision;
    this.loader = loader;
    this.cfg = { ...DEFAULTS, ...(config?.diorama ?? {}) };
    this.useToon = config?.graphics?.toonShading === true;
    this.group = new THREE.Group();
    this.group.name = 'diorama';
    this.group.userData.editorIgnore = true;
    this.group.userData.editorPersistent = true;
    this.group.userData.editorHelper = true;
    this.ownedGeometries = [];
    this.ownedMaterials = [];
    this.bounds = null;
    this.prepared = false;
    this.pendingEdges = null;
    this.lampTemplate = null;
    this.benchTemplate = null;
    this.hydrantTemplate = null;
    this.socket = null;
    this.streetlights = [];
    this.placedLights = [];
    this.previewNight = null;
    this.nightAmount = 0;
    this.lightConfig = {
      color: 0xffd58a,
      intensity: 20,
      angle: Math.PI / 5,
      penumbra: 0.7,
      distance: 12,
      decay: 2,
      castShadow: false,
      emissiveIntensity: 1.5,
      headLocal: null,
      headNudge: [0, 0, 0],
      lightForward: 0.05,
      ...(config?.streetlight ?? {})
    };
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.ownedGeometries.push(this.unitBox);
    parent.add(this.group);
  }

  async prepare() {
    const [lamp, bench, hydrant] = await Promise.all([
      this.loadProp(STREETLIGHT),
      this.loadProp(BENCH),
      this.loadProp(HYDRANT)
    ]);
    this.lampTemplate = lamp ? this.groundTemplate(lamp, this.lightConfig.height ?? 2.35) : null;
    if (this.lampTemplate) {
      this.socket = this.measureSocket(this.lampTemplate);
    }
    this.benchTemplate = bench ? this.groundTemplate(bench, 1.55, 'horizontal') : null;
    this.hydrantTemplate = hydrant ? this.groundTemplate(hydrant, 0.58) : null;
    this.prepared = true;
    if (this.pendingEdges) {
      const edges = this.pendingEdges;
      this.pendingEdges = null;
      this.fit(edges);
    }
  }

  async loadProp(url) {
    try {
      const gltf = await this.loader.load(url);
      this.applyToon(gltf.scene);
      return gltf.scene;
    } catch (error) {
      console.error('Failed to load diorama prop', url, error);
      return null;
    }
  }

  applyToon(root) {
    if (!this.useToon) {
      return;
    }
    const gradient = getSharedToonGradientMap(4);
    root.traverse((child) => {
      if (!child.isMesh) {
        return;
      }
      const next = createToonMaterialFromImported(child.material, gradient);
      this.ownedMaterials.push(next);
      child.material = next;
    });
  }

  groundTemplate(object, target, mode = 'height') {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const basis = mode === 'horizontal' ? Math.max(size.x, size.z) : size.y;
    const scale = target / Math.max(basis, 0.001);
    object.position.set(
      -(box.min.x + box.max.x) * 0.5,
      -box.min.y,
      -(box.min.z + box.max.z) * 0.5
    );
    const wrap = new THREE.Group();
    wrap.add(object);
    wrap.scale.setScalar(scale);
    wrap.userData.width = size.x * scale;
    wrap.userData.depth = size.z * scale;
    wrap.userData.height = size.y * scale;
    return wrap;
  }

  fit(edges) {
    if (!edges) {
      return null;
    }
    if (!this.prepared) {
      this.pendingEdges = edges;
      return null;
    }
    this.clear();
    this.ensureMaterials();
    const bounds = this.computeBounds(edges);
    this.bounds = bounds;
    this.buildGround(bounds);
    this.buildPlinth(bounds);
    this.buildDressing(bounds);
    this.buildRim(bounds);
    this.setNight(this.nightAmount);
    return bounds;
  }

  computeBounds(edges) {
    const cfg = this.cfg;
    const yardNorth = edges.backNorth - cfg.marginNorth;
    const outerNorth = snapEdgeMin(Math.min(edges.contentNorth, yardNorth));
    const outerSouth = snapEdgeMax(Math.max(edges.streetSouth, edges.shopSouth) + cfg.marginSouth);
    const outerEast = snapEdgeMax(edges.shopEast + cfg.marginEast);
    const outerWest = snapEdgeMin(edges.contentWest - cfg.marginWest);
    const lip = cfg.lip;
    return {
      ...edges,
      outerWest,
      outerEast,
      outerNorth,
      outerSouth,
      west: outerWest + lip,
      east: outerEast - lip,
      north: outerNorth + lip,
      south: outerSouth - lip,
      lip,
      sidewalk: cfg.sidewalk,
      southWalk: cfg.southWalk
    };
  }

  ensureMaterials() {
    if (this.materials) {
      return;
    }
    this.materials = {
      grass: this.colorMaterial(0x63a45a),
      curb: this.colorMaterial(0xd7dde4),
      plinth: this.colorMaterial(0x8b97a2),
      plinthDeep: this.colorMaterial(0x5e6b76),
      trunk: this.colorMaterial(0x8b5a38),
      canopy: this.colorMaterial(0x3d8d4c),
      cone: this.colorMaterial(0x2f7340),
      bush: this.colorMaterial(0x4c9454),
      hedge: this.colorMaterial(0x3e7c48),
      fence: this.colorMaterial(0xe4dfd4),
      filler: this.colorMaterial(0xb7b2a8),
      shadow: new THREE.MeshBasicMaterial({
        color: 0x1a2420,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      }),
      bulb: new THREE.MeshBasicMaterial({ color: this.lightConfig.color })
    };
    this.ownedMaterials.push(this.materials.bulb);
    this.ownedMaterials.push(this.materials.shadow);
    this.trunkGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.58, 5);
    this.canopyGeo = new THREE.IcosahedronGeometry(0.5, 0);
    this.coneGeo = new THREE.ConeGeometry(0.42, 1.2, 6);
    this.bushGeo = new THREE.IcosahedronGeometry(0.32, 0);
    this.shadowGeo = new THREE.CircleGeometry(0.5, 10);
    this.bulbGeo = new THREE.SphereGeometry(1, 12, 8);
    this.hedgeGeo = new THREE.BoxGeometry(0.72, 0.36, 0.28);
    this.postGeo = new THREE.BoxGeometry(0.08, 1, 0.08);
    this.railGeo = new THREE.BoxGeometry(1, 0.05, 0.04);
    this.ownedGeometries.push(
      this.trunkGeo,
      this.canopyGeo,
      this.coneGeo,
      this.bushGeo,
      this.shadowGeo,
      this.bulbGeo,
      this.hedgeGeo,
      this.postGeo,
      this.railGeo
    );
  }

  colorMaterial(color) {
    const source = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
    if (!this.useToon) {
      this.ownedMaterials.push(source);
      return source;
    }
    const material = createToonMaterial(source, null, getSharedToonGradientMap(4));
    source.dispose();
    this.ownedMaterials.push(material);
    return material;
  }

  clear() {
    this.disposeStreetlights();
    this.collision.removeGroup('diorama-rim');
    for (let i = this.group.children.length - 1; i >= 0; i -= 1) {
      this.group.remove(this.group.children[i]);
    }
  }

  addBox(material, width, height, depth, x, y, z) {
    const mesh = new THREE.Mesh(this.unitBox, material);
    mesh.scale.set(width, Math.max(height, 0.001), Math.max(depth, 0.001));
    mesh.position.set(x, y, z);
    mesh.userData.editorIgnore = true;
    this.group.add(mesh);
    return mesh;
  }

  buildGround(bounds) {
    const pavement = [];
    const eastWalk = Math.min(bounds.shopEast + bounds.sidewalk, bounds.east);
    const northWalk = bounds.backNorth - bounds.sidewalk;
    const southWalkEnd = bounds.shopSouth + bounds.southWalk;
    const contentNorth = Math.min(bounds.contentNorth, bounds.streetNorth);

    this.collectTiles(pavement, bounds.shopEast, eastWalk, bounds.north, bounds.south);
    this.collectTiles(pavement, bounds.shopWest, bounds.shopEast, bounds.shopSouth, southWalkEnd);
    this.collectTiles(pavement, bounds.shopWest, bounds.shopEast, northWalk, bounds.backNorth);
    if (bounds.missingNorthPad && bounds.northPad) {
      const pad = bounds.northPad;
      this.collectTiles(pavement, pad.minX, pad.maxX, pad.minZ, pad.maxZ);
    }
    this.addTileMesh(bounds.tile, bounds.pavementMaterial, pavement);

    this.addSlab(bounds.west, bounds.shopWest, bounds.streetSouth, southWalkEnd, this.materials.filler, 0.06, 0.03);
    this.addSlab(bounds.shopEast, bounds.east, bounds.north, bounds.south, this.materials.filler, 0.04, -0.01);
    this.addSlab(bounds.shopWest, bounds.shopEast, bounds.north, northWalk, this.materials.filler, 0.04, -0.01);
    this.addSlab(bounds.west, bounds.east, southWalkEnd, bounds.south, this.materials.filler, 0.04, -0.01);
    if (contentNorth - bounds.north > 0.15) {
      this.addSlab(bounds.west, bounds.shopWest, bounds.north, contentNorth, this.materials.filler, 0.04, -0.01);
    }

    if (bounds.east - eastWalk > 0.2) {
      this.addSlab(eastWalk, bounds.east, bounds.north, bounds.south, this.materials.grass, 0.08, 0.045);
    }
    if (northWalk - bounds.north > 0.2) {
      this.addSlab(bounds.shopWest, bounds.shopEast, bounds.north, northWalk, this.materials.grass, 0.08, 0.045);
    }
    if (contentNorth - bounds.north > 0.2) {
      this.addSlab(bounds.west, bounds.shopWest, bounds.north, contentNorth, this.materials.grass, 0.08, 0.045);
    }
    if (bounds.south - southWalkEnd > 0.15) {
      this.addSlab(bounds.west, eastWalk, southWalkEnd, bounds.south, this.materials.grass, 0.08, 0.045);
    }
    if (bounds.contentWest - bounds.west > 0.25) {
      const westNorth = Math.max(bounds.north, contentNorth);
      const westSouth = Math.min(bounds.south, southWalkEnd);
      this.addSlab(bounds.west, bounds.contentWest, westNorth, westSouth, this.materials.grass, 0.08, 0.045);
    }
    this.addCurb(bounds, eastWalk, southWalkEnd);
  }

  addCurb(bounds, eastWalk, southWalkEnd) {
    const curb = this.materials.curb;
    const height = 0.08;
    const y = 0.05;
    if (bounds.east - eastWalk > 0.25) {
      this.addBox(
        curb,
        0.14,
        height,
        bounds.south - bounds.north,
        eastWalk,
        y,
        (bounds.north + bounds.south) * 0.5
      );
    }
    if (bounds.south - southWalkEnd > 0.2) {
      this.addBox(
        curb,
        eastWalk - bounds.west,
        height,
        0.14,
        (bounds.west + eastWalk) * 0.5,
        y,
        southWalkEnd
      );
    }
  }

  collectTiles(list, minX, maxX, minZ, maxZ) {
    if (!(maxX - minX > 0.4) || !(maxZ - minZ > 0.4)) {
      return;
    }
    const xs = tileCenters(minX, maxX);
    const zs = tileCenters(minZ, maxZ);
    for (let x = 0; x < xs.length; x += 1) {
      for (let z = 0; z < zs.length; z += 1) {
        list.push(xs[x], zs[z]);
      }
    }
  }

  addTileMesh(geometry, material, centers) {
    if (!geometry || !material || centers.length < 2) {
      return;
    }
    const count = centers.length / 2;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = 'diorama-pavement';
    mesh.userData.editorIgnore = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      dummy.position.set(centers[i * 2], 0.008, centers[i * 2 + 1]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  addSlab(minX, maxX, minZ, maxZ, material, thickness, top) {
    const width = maxX - minX;
    const depth = maxZ - minZ;
    if (width < 0.08 || depth < 0.08) {
      return;
    }
    this.addBox(material, width, thickness, depth, (minX + maxX) * 0.5, top - thickness * 0.5, (minZ + maxZ) * 0.5);
  }

  buildPlinth(bounds) {
    const drop = this.cfg.plinthDrop;
    const mid = this.cfg.plinthMid;
    const tread = this.cfg.tread;
    const lip = bounds.lip;
    const { outerWest: west, outerEast: east, outerNorth: north, outerSouth: south } = bounds;
    this.addStep(this.materials.plinth, west, east, north, south, lip, 0, mid);
    this.addStep(this.materials.plinthDeep, west - tread, east + tread, north - tread, south + tread, lip + tread, mid, drop);
  }

  addStep(material, west, east, north, south, thickness, yTop, yBottom) {
    const height = yBottom - yTop;
    const y = -(yTop + yBottom) * 0.5;
    const spanX = east - west;
    const spanZ = south - north - thickness * 2;
    this.addBox(material, spanX, height, thickness, (west + east) * 0.5, y, south - thickness * 0.5);
    this.addBox(material, spanX, height, thickness, (west + east) * 0.5, y, north + thickness * 0.5);
    if (spanZ > 0.05) {
      this.addBox(material, thickness, height, spanZ, east - thickness * 0.5, y, (north + south) * 0.5);
      this.addBox(material, thickness, height, spanZ, west + thickness * 0.5, y, (north + south) * 0.5);
    }
  }

  buildDressing(bounds) {
    const eastWalk = Math.min(bounds.shopEast + bounds.sidewalk, bounds.east - 0.3);
    const treeX = Math.min(bounds.east - 0.7, eastWalk + 0.62);
    const trees = [];
    const bushes = [];
    const northWalk = bounds.backNorth - bounds.sidewalk;
    const treeZ = (bounds.north + northWalk) * 0.5;

    for (let z = bounds.shopNorth + 1.2; z <= bounds.shopSouth - 0.4; z += 2.6) {
      trees.push({ x: treeX, z, kind: trees.length % 4 === 3 ? 'cone' : 'round', scale: 0.9 + (trees.length % 3) * 0.08 });
    }
    const northSpan = bounds.shopEast - bounds.shopWest;
    const northStep = northSpan > 16 ? 3.1 : 2.65;
    for (let x = bounds.shopWest + 1.15; x <= bounds.shopEast - 0.7; x += northStep) {
      trees.push({ x, z: treeZ, kind: 'round', scale: 1.18 });
    }
    if (bounds.east - treeX > 0.2) {
      trees.push({ x: bounds.east - 0.45, z: treeZ, kind: 'cone', scale: 1.08 });
    }

    const southWalkEnd = bounds.shopSouth + bounds.southWalk;
    const bushZ = (southWalkEnd + bounds.south) * 0.5;
    if (bounds.south - southWalkEnd > 0.35) {
      for (let x = bounds.west + 0.7; x <= bounds.east - 0.55; x += 1.7) {
        bushes.push({ x, z: bushZ, scale: 0.72 + (bushes.length % 3) * 0.12 });
      }
    }
    for (let i = 0; i < trees.length; i += 1) {
      bushes.push({
        x: trees[i].x + (i % 2 === 0 ? 0.48 : -0.46),
        z: trees[i].z + 0.42,
        scale: 0.62
      });
    }

    this.addTrees(trees);
    this.addBushes(bushes);
    this.addHedge(bounds, southWalkEnd);
    this.addFence(bounds);
    this.addProps(bounds, eastWalk);
    this.addShadows(trees, bushes, bounds, eastWalk);
  }

  addTrees(trees) {
    if (trees.length === 0) {
      return;
    }
    const trunks = new THREE.InstancedMesh(this.trunkGeo, this.materials.trunk, trees.length);
    const rounds = [];
    const cones = [];
    trees.forEach((tree, index) => {
      if (tree.kind === 'cone') {
        cones.push(index);
      } else {
        rounds.push(index);
      }
    });
    const dummy = new THREE.Object3D();
    trunks.name = 'diorama-trunks';
    trunks.userData.editorIgnore = true;
    for (let i = 0; i < trees.length; i += 1) {
      const tree = trees[i];
      dummy.position.set(tree.x, 0.29, tree.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
    }
    trunks.instanceMatrix.needsUpdate = true;
    this.group.add(trunks);
    this.addCanopies(trees, rounds, this.canopyGeo, this.materials.canopy, 1.05, 0.78);
    this.addCanopies(trees, cones, this.coneGeo, this.materials.cone, 1.18, 0.9);
  }

  addCanopies(trees, indices, geometry, material, y, widthScale) {
    if (indices.length === 0) {
      return;
    }
    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
    mesh.userData.editorIgnore = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < indices.length; i += 1) {
      const tree = trees[indices[i]];
      dummy.position.set(tree.x, y * tree.scale, tree.z);
      dummy.rotation.set(0, (indices[i] % 5) * 0.4, 0);
      dummy.scale.set(tree.scale * widthScale, tree.scale, tree.scale * widthScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  addBushes(bushes) {
    if (bushes.length === 0) {
      return;
    }
    const mesh = new THREE.InstancedMesh(this.bushGeo, this.materials.bush, bushes.length);
    mesh.name = 'diorama-bushes';
    mesh.userData.editorIgnore = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < bushes.length; i += 1) {
      const bush = bushes[i];
      dummy.position.set(bush.x, 0.18 * bush.scale, bush.z);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.scale.set(bush.scale, bush.scale * 0.72, bush.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  addHedge(bounds, southWalkEnd) {
    const northZ = bounds.north + 0.22;
    const posts = [];
    for (let x = bounds.west + 0.4; x <= bounds.shopEast - 0.3; x += 0.72) {
      posts.push(x, northZ, 0.42);
    }
    if (bounds.south - southWalkEnd > 0.3) {
      const southZ = bounds.south - 0.2;
      for (let x = bounds.west + 0.45; x <= bounds.east - 0.4; x += 0.72) {
        posts.push(x, southZ, 0.3);
      }
    }
    if (posts.length === 0) {
      return;
    }
    const mesh = new THREE.InstancedMesh(this.hedgeGeo, this.materials.hedge, posts.length / 3);
    mesh.userData.editorIgnore = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < posts.length; i += 3) {
      const height = posts[i + 2];
      dummy.position.set(posts[i], height * 0.5, posts[i + 1]);
      dummy.scale.set(1, height / 0.36, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i / 3, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  addFence(bounds) {
    const runs = [
      { x1: bounds.west + 0.15, z1: bounds.north + 0.16, x2: bounds.shopEast - 0.2, z2: bounds.north + 0.16, height: 0.62 },
      { x1: bounds.east - 0.16, z1: bounds.north + 0.2, x2: bounds.east - 0.16, z2: bounds.south - 0.2, height: 0.55 }
    ];
    const posts = [];
    const rails = [];
    for (let r = 0; r < runs.length; r += 1) {
      const run = runs[r];
      const dx = run.x2 - run.x1;
      const dz = run.z2 - run.z1;
      const length = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.round(length / 1.35));
      const yaw = Math.atan2(-dz, dx);
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        posts.push(run.x1 + dx * t, run.z1 + dz * t, run.height);
      }
      for (let i = 0; i < steps; i += 1) {
        const t = (i + 0.5) / steps;
        rails.push([run.x1 + dx * t, run.z1 + dz * t, yaw, length / steps, run.height]);
      }
    }
    this.instancePosts(posts);
    this.instanceRails(rails);
  }

  instancePosts(posts) {
    if (posts.length === 0) {
      return;
    }
    const mesh = new THREE.InstancedMesh(this.postGeo, this.materials.fence, posts.length / 3);
    mesh.userData.editorIgnore = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < posts.length; i += 3) {
      dummy.position.set(posts[i], posts[i + 2] * 0.5, posts[i + 1]);
      dummy.scale.set(1, posts[i + 2], 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i / 3, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  instanceRails(rails) {
    if (rails.length === 0) {
      return;
    }
    const mesh = new THREE.InstancedMesh(this.railGeo, this.materials.fence, rails.length * 2);
    mesh.userData.editorIgnore = true;
    const dummy = new THREE.Object3D();
    let index = 0;
    for (let i = 0; i < rails.length; i += 1) {
      const [x, z, yaw, length, height] = rails[i];
      for (let rail = 0; rail < 2; rail += 1) {
        dummy.position.set(x, height * (rail === 0 ? 0.72 : 0.38), z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(Math.max(0.2, length - 0.08), 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  addProps(bounds, eastWalk) {
    const x = Math.min(bounds.shopEast + 0.95, eastWalk - 0.25);
    this.placeStreetlight(x, -1.35, 0);
    this.placeStreetlight(x, 3.15, 0);
    this.placeProp(this.benchTemplate, Math.min(bounds.shopEast + 1.25, eastWalk - 0.15), 0.85, -Math.PI / 2);
    this.placeProp(this.hydrantTemplate, Math.min(bounds.shopEast + 0.62, eastWalk - 0.2), 4.55, 0.4);
  }

  measureSocket(wrap) {
    const fallback = {
      bulb: new THREE.Vector3(-0.12, 0.9, 0),
      light: new THREE.Vector3(-0.17, 0.9, 0),
      radius: 0.03
    };
    let mesh = null;
    wrap?.traverse((child) => {
      if (!mesh && child.isMesh && child.geometry?.attributes?.position) {
        mesh = child;
      }
    });
    if (!mesh) {
      return fallback;
    }
    const position = mesh.geometry.attributes.position;
    let maxY = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      maxY = Math.max(maxY, position.getY(i));
    }
    const point = new THREE.Vector3();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    let count = 0;
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i);
      if (point.y < maxY - 0.12) {
        continue;
      }
      min.min(point);
      max.max(point);
      count += 1;
    }
    if (count === 0) {
      return fallback;
    }
    const center = min.clone().add(max).multiplyScalar(0.5);
    const size = max.clone().sub(min);
    const radius = Math.max(size.z * 0.48, 0.012);
    const bulb = new THREE.Vector3(center.x, center.y - radius * 0.15, center.z);
    const nudge = this.lightConfig.headNudge ?? [0, 0, 0];
    bulb.x += nudge[0] ?? 0;
    bulb.y += nudge[1] ?? 0;
    bulb.z += nudge[2] ?? 0;
    const light = bulb.clone();
    const forward = this.lightConfig.lightForward ?? 0.05;
    light.x += Math.sign(min.x - center.x) * forward;
    return { bulb, light, radius };
  }

  placeStreetlight(x, z, rotationY) {
    if (!this.lampTemplate) {
      return;
    }
    const root = this.lampTemplate.clone(true);
    root.name = 'diorama-streetlight';
    root.position.set(x, 0.02, z);
    root.rotation.y = rotationY;
    root.traverse((child) => {
      if (child !== root) {
        child.userData.editorIgnore = true;
      }
    });
    this.group.add(root);
    this.attachLamp(root, this.streetlights);
  }

  attachPlacedStreetlights(root) {
    if (!root || !this.socket) {
      return;
    }
    this.ensureMaterials();
    root.traverse((child) => {
      const model = child.userData?.editorModel;
      if (typeof model === 'string' && model.includes('streetlight.glb')) {
        this.attachLamp(child, this.placedLights);
      }
    });
    this.setNight(this.nightAmount);
  }

  attachLamp(root, list) {
    if (!root || root.userData.streetlightLit || !this.socket || !this.materials?.bulb) {
      return;
    }
    const placed = this.socketOn(root);
    const cfg = this.lightConfig;
    const light = new THREE.SpotLight(cfg.color, 0, cfg.distance, cfg.angle, cfg.penumbra, cfg.decay);
    light.name = 'streetlight-spot';
    light.castShadow = cfg.castShadow === true;
    light.position.copy(placed.light);
    light.userData.editorIgnore = true;
    light.userData.editorPrefabPart = true;
    const target = new THREE.Object3D();
    target.name = 'streetlight-target';
    target.position.set(placed.light.x, 0.02, placed.light.z);
    target.userData.editorIgnore = true;
    light.target = target;
    const bulb = new THREE.Mesh(this.bulbGeo, this.materials.bulb);
    bulb.name = 'streetlight-bulb';
    bulb.position.copy(placed.bulb);
    bulb.scale.setScalar(placed.radius);
    bulb.visible = false;
    bulb.userData.editorIgnore = true;
    bulb.userData.editorPrefabPart = true;
    root.add(light, target, bulb);
    root.userData.streetlightLit = true;
    if (!root.userData.editorModel) {
      root.userData.editorPrefab = STREETLIGHT;
      root.userData.editorRoot = true;
      root.userData.editorIgnore = false;
      root.userData.editorId = root.userData.editorId || `diorama-streetlight-${list.length}`;
    }
    list.push({ light, bulb, root });
  }

  socketOn(root) {
    let mesh = null;
    root.traverse((child) => {
      if (!mesh && child.isMesh && child.geometry?.attributes?.position) {
        mesh = child;
      }
    });
    const bulb = this.socket.bulb.clone();
    const light = this.socket.light.clone();
    if (!mesh) {
      return { bulb, light, radius: this.socket.radius };
    }
    root.updateWorldMatrix(true, true);
    mesh.localToWorld(bulb);
    mesh.localToWorld(light);
    root.worldToLocal(bulb);
    root.worldToLocal(light);
    return { bulb, light, radius: this.socket.radius };
  }

  meshOf(root) {
    let mesh = null;
    root?.traverse((child) => {
      if (!mesh && child.isMesh && !child.userData.editorPrefabPart && child.geometry?.attributes?.position) {
        mesh = child;
      }
    });
    return mesh;
  }

  rootToMesh(root, position) {
    const mesh = this.meshOf(root);
    const point = position.clone();
    if (!mesh) {
      return point;
    }
    root.updateWorldMatrix(true, true);
    root.localToWorld(point);
    mesh.worldToLocal(point);
    return point;
  }

  applySavedPrefab(prefab) {
    if (!prefab?.parts || !this.socket) {
      return;
    }
    const bulb = prefab.parts['streetlight-bulb'];
    const spot = prefab.parts['streetlight-spot'];
    if (Array.isArray(bulb?.position)) {
      this.socket.bulb.fromArray(bulb.position);
    }
    if (Array.isArray(bulb?.scale)) {
      this.socket.radius = Math.abs(bulb.scale[0]) || this.socket.radius;
    }
    if (Array.isArray(spot?.position)) {
      this.socket.light.fromArray(spot.position);
    }
    this.readLightSettings(spot);
    this.reflowStreetlights();
  }

  readLightSettings(spot) {
    if (!spot) {
      return;
    }
    const cfg = this.lightConfig;
    if (typeof spot.intensity === 'number') cfg.intensity = spot.intensity;
    if (typeof spot.color === 'string') cfg.color = new THREE.Color(spot.color).getHex();
    if (typeof spot.angle === 'number') cfg.angle = spot.angle;
    if (typeof spot.penumbra === 'number') cfg.penumbra = spot.penumbra;
    if (typeof spot.distance === 'number') cfg.distance = spot.distance;
    if (typeof spot.decay === 'number') cfg.decay = spot.decay;
  }

  captureStreetlightPart(root, object) {
    if (!this.socket || !object) {
      return;
    }
    if (object.name === 'streetlight-bulb') {
      this.socket.bulb.copy(this.rootToMesh(root, object.position));
      this.socket.radius = Math.abs(object.scale.x) || this.socket.radius;
      return;
    }
    if (object.name === 'streetlight-spot') {
      this.socket.light.copy(this.rootToMesh(root, object.position));
      this.lightConfig.intensity = object.intensity;
      this.lightConfig.color = object.color.getHex();
      this.lightConfig.angle = object.angle;
      this.lightConfig.penumbra = object.penumbra;
      this.lightConfig.distance = object.distance;
      this.lightConfig.decay = object.decay;
    }
  }

  reflowStreetlights(skipRoot = null, skipName = '') {
    const lists = [this.streetlights, this.placedLights];
    for (let listIndex = 0; listIndex < lists.length; listIndex += 1) {
      const list = lists[listIndex];
      for (let i = 0; i < list.length; i += 1) {
        const lamp = list[i];
        const placed = this.socketOn(lamp.root);
        const skip = lamp.root === skipRoot;
        if (!skip || skipName !== 'streetlight-bulb') {
          lamp.bulb.position.copy(placed.bulb);
          lamp.bulb.scale.setScalar(this.socket.radius);
        }
        if (!skip || skipName !== 'streetlight-spot') {
          lamp.light.position.copy(placed.light);
        }
        lamp.light.target.position.set(lamp.light.position.x, 0.02, lamp.light.position.z);
      }
    }
    this.setNight(this.nightAmount);
  }

  streetlightPrefabRecord() {
    const color = new THREE.Color(this.lightConfig.color);
    const round = (value) => Math.round(value * 10000) / 10000;
    const vec = (point) => [round(point.x), round(point.y), round(point.z)];
    const radius = round(this.socket.radius);
    return {
      parts: {
        'streetlight-bulb': {
          position: vec(this.socket.bulb),
          scale: [radius, radius, radius]
        },
        'streetlight-spot': {
          position: vec(this.socket.light),
          intensity: round(this.lightConfig.intensity),
          color: `#${color.getHexString()}`,
          angle: round(this.lightConfig.angle),
          penumbra: round(this.lightConfig.penumbra),
          distance: round(this.lightConfig.distance),
          decay: round(this.lightConfig.decay)
        }
      }
    };
  }

  setNight(amount) {
    const requested = Math.min(1, Math.max(0, amount || 0));
    if (this.previewNight == null) {
      this.nightAmount = requested;
    }
    const night = this.previewNight == null ? requested : this.previewNight;
    const cfg = this.lightConfig;
    if (!cfg) {
      return;
    }
    const lit = night > 0.02;
    const lists = [this.streetlights, this.placedLights];
    for (let listIndex = 0; listIndex < lists.length; listIndex += 1) {
      const list = lists[listIndex];
      for (let i = 0; i < list.length; i += 1) {
        const lamp = list[i];
        lamp.light.color.set(cfg.color);
        lamp.light.intensity = cfg.intensity * night;
        lamp.light.angle = cfg.angle;
        lamp.light.penumbra = cfg.penumbra;
        lamp.light.distance = cfg.distance;
        lamp.light.decay = cfg.decay;
        lamp.light.castShadow = cfg.castShadow === true;
        lamp.light.visible = lit;
        lamp.bulb.visible = lit;
      }
    }
    if (this.materials?.bulb) {
      this.materials.bulb.color.set(cfg.color);
    }
  }

  disposeStreetlights() {
    this.releaseLamps(this.streetlights);
    this.streetlights = [];
  }

  releaseLamps(list) {
    for (let i = 0; i < list.length; i += 1) {
      const lamp = list[i];
      lamp.light.target.removeFromParent();
      lamp.light.removeFromParent();
      lamp.bulb.removeFromParent();
      lamp.light.dispose();
      if (lamp.root) {
        lamp.root.userData.streetlightLit = false;
      }
    }
  }

  placeProp(template, x, z, rotationY) {
    if (!template) {
      return;
    }
    const clone = template.clone(true);
    clone.position.set(x, 0.02, z);
    clone.rotation.y = rotationY;
    clone.traverse((child) => {
      child.userData.editorIgnore = true;
    });
    this.group.add(clone);
  }

  addShadows(trees, bushes, bounds, eastWalk) {
    const marks = [];
    for (let i = 0; i < trees.length; i += 1) {
      marks.push(trees[i].x, trees[i].z, 0.95 * trees[i].scale);
    }
    for (let i = 0; i < bushes.length; i += 1) {
      marks.push(bushes[i].x, bushes[i].z, 0.55 * bushes[i].scale);
    }
    const lampX = Math.min(bounds.shopEast + 0.95, eastWalk - 0.25);
    marks.push(lampX, -1.35, 0.42, lampX, 3.15, 0.42);
    marks.push(Math.min(bounds.shopEast + 1.25, eastWalk - 0.15), 0.85, 0.7);
    marks.push(Math.min(bounds.shopEast + 0.62, eastWalk - 0.2), 4.55, 0.32);
    const mesh = new THREE.InstancedMesh(this.shadowGeo, this.materials.shadow, marks.length / 3);
    mesh.userData.editorIgnore = true;
    mesh.renderOrder = 2;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < marks.length; i += 3) {
      dummy.position.set(marks[i], 0.03, marks[i + 1]);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(marks[i + 2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i / 3, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  buildRim(bounds) {
    const height = 1.5;
    const thick = 0.4;
    const y = height * 0.5;
    const midX = (bounds.outerWest + bounds.outerEast) * 0.5;
    const midZ = (bounds.outerNorth + bounds.outerSouth) * 0.5;
    const spanX = bounds.outerEast - bounds.outerWest + thick;
    const spanZ = bounds.outerSouth - bounds.outerNorth;
    this.addRimBox(spanX, height, thick, midX, y, bounds.outerSouth + thick * 0.2);
    this.addRimBox(spanX, height, thick, midX, y, bounds.outerNorth - thick * 0.2);
    this.addRimBox(thick, height, spanZ, bounds.outerEast + thick * 0.2, y, midZ);
    this.addRimBox(thick, height, spanZ, bounds.outerWest - thick * 0.2, y, midZ);
  }

  addRimBox(width, height, depth, x, y, z) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const dummy = new THREE.Mesh(geometry);
    dummy.position.set(x, y, z);
    dummy.updateWorldMatrix(true, true);
    this.collision.addObject(dummy, { id: 'diorama-rim', group: 'diorama-rim' });
    geometry.dispose();
  }

  dispose() {
    this.releaseLamps(this.placedLights);
    this.placedLights = [];
    this.disposeStreetlights();
    this.clear();
    this.group.removeFromParent();
    for (let i = 0; i < this.ownedGeometries.length; i += 1) {
      this.ownedGeometries[i].dispose();
    }
    for (let i = 0; i < this.ownedMaterials.length; i += 1) {
      this.ownedMaterials[i].dispose();
    }
    this.ownedGeometries = [];
    this.ownedMaterials = [];
  }
}
