import * as THREE from 'three';
import { createToonMaterial, createToonMaterialFromImported, getSharedToonGradientMap } from '../rendering/ToonMaterial.js';

const BUILDING_TEXTURE = '/models/textures/colormap-building.png';
const ROAD_TEXTURE = '/models/textures/colormap-road.png';

const BUILDING_F = '/models/outside/building-f.glb';
const BUILDING_G = '/models/outside/building-g.glb';
const BUILDING_H = '/models/outside/building-h.glb';
const STRAIGHT_ROAD = '/models/outside/straightRoad.glb';
const TILE_LOW = '/models/outside/tile-low.glb';

// Fixed once from the original grocery shop. The west apron ends at x = -4.5.
// The street runs north–south on the left. Nothing here reads the unlocked shop width.
export const OUTSIDE_CONFIG = {
  staticEnvironment: true,
  originZ: 0,
  minZ: -5,
  maxZ: 5,
  shopSidewalk: { fixed: true, width: 1, firstX: -5 },
  buildingSidewalk: { fixed: true, width: 1 },
  roadScale: 0.6,
  buildingScale: 3,
  buildingCount: 3,
  buildingGap: 0.5,
  buildingSetback: 0.15
};

const BUILDING_URLS = [BUILDING_F, BUILDING_G, BUILDING_H];

function findMesh(root) {
  let mesh = null;
  root.traverse((child) => {
    if (!mesh && child.isMesh) {
      mesh = child;
    }
  });
  return mesh;
}

export class OutsideEnvironment {
  constructor(scene, loader, collision, config) {
    this.scene = scene;
    this.loader = loader;
    this.collision = collision;
    this.useToon = config?.graphics?.toonShading === true;
    this.group = new THREE.Group();
    this.group.name = 'outside-environment';
    this.anchors = [];
    this.buildings = [];
    this.cameraMinX = -6;
    this.ownedGeometries = [];
    this.ownedMaterials = [];
    this.ready = false;
  }

  async load() {
    if (this.ready) {
      return;
    }
    this.scene.add(this.group);
    try {
      const [buildingTexture, roadTexture, buildings, road, tile] = await Promise.all([
        this.loader.loadTexture(BUILDING_TEXTURE),
        this.loader.loadTexture(ROAD_TEXTURE),
        Promise.all(BUILDING_URLS.map((url) => this.loadTemplate(url))),
        this.loader.load(STRAIGHT_ROAD),
        this.loadTemplate(TILE_LOW)
      ]);
      const buildingMaterial = this.materialFor(buildingTexture);
      const roadMaterial = this.materialFor(roadTexture);
      const roadSize = this.prepareRoad(road.scene);
      const layout = this.layoutFor(roadSize);
      const footprint = this.placeBuildings(buildings, buildingMaterial, layout);
      const ground = this.placeBuildingGround(tile, roadMaterial, footprint);
      this.fitRoadToGround(layout, roadSize, ground);
      this.placeSidewalks(tile, roadMaterial, layout);
      this.placeRoad(road.scene, layout);
      this.ready = true;
    } catch (error) {
      console.error('Failed to build the outside environment', error);
    }
  }

  async loadTemplate(url) {
    try {
      const gltf = await this.loader.cached(url);
      const mesh = findMesh(gltf.scene);
      if (!mesh) {
        throw new Error(`No mesh in ${url}`);
      }
      const geometry = mesh.geometry;
      if (!geometry.attributes.normal) {
        geometry.computeVertexNormals();
      }
      geometry.computeBoundingBox();
      return { url, geometry, boundingBox: geometry.boundingBox };
    } catch (error) {
      console.error('Failed to load outside model', url, error);
      return null;
    }
  }

  materialFor(texture) {
    const source = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture });
    const material = this.useToon
      ? createToonMaterial(source, texture, getSharedToonGradientMap(4))
      : source;
    this.ownedMaterials.push(material);
    if (material !== source) {
      source.dispose();
    }
    return material;
  }

  prepareRoad(scene) {
    scene.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    scene.position.set(-center.x, -box.min.y, -center.z);
    const gradient = this.useToon ? getSharedToonGradientMap(4) : null;
    scene.traverse((child) => {
      if (!child.isMesh) {
        return;
      }
      if (!child.geometry.attributes.normal) {
        child.geometry.computeVertexNormals();
      }
      if (!gradient) {
        return;
      }
      const next = createToonMaterialFromImported(child.material, gradient);
      this.ownedMaterials.push(next);
      child.material.dispose();
      child.material = next;
    });
    return size;
  }

  layoutFor(roadSize) {
    const streetLength = OUTSIDE_CONFIG.maxZ - OUTSIDE_CONFIG.minZ + 1;
    const scale = (streetLength / roadSize.z) * OUTSIDE_CONFIG.roadScale;
    const width = roadSize.x * scale;
    const length = roadSize.z * scale;
    const roadEast = OUTSIDE_CONFIG.shopSidewalk.firstX - OUTSIDE_CONFIG.shopSidewalk.width + 0.5;
    const roadWest = roadEast - width;
    return {
      scale,
      lengthScale: scale,
      width,
      length,
      roadEast,
      roadWest,
      centerX: (roadEast + roadWest) * 0.5,
      centerZ: OUTSIDE_CONFIG.originZ,
      minZ: OUTSIDE_CONFIG.originZ - length * 0.5,
      maxZ: OUTSIDE_CONFIG.originZ + length * 0.5
    };
  }

  fitRoadToGround(layout, roadSize, ground) {
    if (!ground) {
      return;
    }
    const length = ground.maxZ - ground.minZ;
    layout.length = length;
    layout.lengthScale = length / roadSize.z;
    layout.minZ = ground.minZ;
    layout.maxZ = ground.maxZ;
    layout.centerZ = (ground.minZ + ground.maxZ) * 0.5;
  }

  placeSidewalks(tile, material, layout) {
    if (!tile) {
      return;
    }
    const zs = this.centersCovering(layout.minZ, layout.maxZ);
    const columns = [];
    const shopStart = OUTSIDE_CONFIG.shopSidewalk.firstX;
    for (let i = 0; i < OUTSIDE_CONFIG.shopSidewalk.width; i += 1) {
      columns.push(shopStart - i);
    }
    for (let i = 0; i < OUTSIDE_CONFIG.buildingSidewalk.width; i += 1) {
      columns.push(layout.roadWest - 0.5 - i);
    }
    const mesh = new THREE.InstancedMesh(tile.geometry, material, zs.length * columns.length);
    mesh.name = 'floor-outside-sidewalk';
    const dummy = new THREE.Object3D();
    let index = 0;
    for (let c = 0; c < columns.length; c += 1) {
      for (let i = 0; i < zs.length; i += 1) {
        dummy.position.set(columns[c], 0, zs[i]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    this.anchors.push({ id: 'sidewalks', columns, minZ: layout.minZ, maxZ: layout.maxZ });
  }

  placeRoad(scene, layout) {
    const holder = new THREE.Group();
    holder.name = 'floor-outside-road';
    holder.add(scene);
    holder.scale.set(layout.scale, layout.scale, layout.lengthScale);
    holder.position.set(layout.centerX, 0.02, layout.centerZ);
    this.group.add(holder);
    this.anchors.push({
      id: 'road',
      minX: layout.roadWest,
      maxX: layout.roadEast,
      minZ: layout.minZ,
      maxZ: layout.maxZ
    });
  }

  placeBuildings(templates, material, layout) {
    const usable = templates.filter(Boolean);
    if (usable.length === 0) {
      return;
    }
    const scale = OUTSIDE_CONFIG.buildingScale;
    const gap = OUTSIDE_CONFIG.buildingGap;
    const count = Math.min(OUTSIDE_CONFIG.buildingCount, usable.length);
    const order = usable.slice(0, count);
    let used = 0;
    for (let i = 0; i < order.length; i += 1) {
      const box = order[i].boundingBox;
      const along = (box.max.x - box.min.x) * scale;
      used += i === 0 ? along : gap + along;
    }
    let cursor = OUTSIDE_CONFIG.originZ - used * 0.5;
    const frontX = layout.roadWest - OUTSIDE_CONFIG.buildingSidewalk.width - OUTSIDE_CONFIG.buildingSetback;
    let westEdge = frontX;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < order.length; i += 1) {
      const template = order[i];
      const box = template.boundingBox;
      const along = (box.max.x - box.min.x) * scale;
      const depth = (box.max.z - box.min.z) * scale;
      const height = (box.max.y - box.min.y) * scale;
      const z = cursor + along * 0.5;
      cursor += along + gap;
      const x = frontX - depth * 0.5;
      westEdge = Math.min(westEdge, x - depth * 0.5);
      minZ = Math.min(minZ, z - along * 0.5);
      maxZ = Math.max(maxZ, z + along * 0.5);
      const mesh = new THREE.Mesh(template.geometry, material);
      mesh.name = `outside-building-${i}`;
      mesh.position.set(x, -box.min.y * scale, z);
      mesh.rotation.y = -Math.PI / 2;
      mesh.scale.setScalar(scale);
      this.group.add(mesh);
      this.buildings.push({ object: mesh, x, z });
      this.addBuildingCollision(mesh, depth, height, along, x, z);
    }
    this.cameraMinX = westEdge - 2.5;
    this.anchors.push({ id: 'buildings', count: order.length, frontX });
    return {
      minX: westEdge - 1,
      maxX: layout.roadWest - OUTSIDE_CONFIG.buildingSidewalk.width,
      minZ: minZ - 1,
      maxZ: maxZ + 1
    };
  }

  centersCovering(min, max) {
    const centers = [];
    let edge = max;
    while (edge > min + 0.001) {
      centers.push(edge - 0.5);
      edge -= 1;
    }
    return centers;
  }

  placeBuildingGround(tile, material, footprint) {
    if (!tile || !footprint) {
      return;
    }
    const xs = this.centersCovering(footprint.minX, footprint.maxX);
    const zs = this.centersCovering(footprint.minZ, footprint.maxZ);
    if (xs.length === 0 || zs.length === 0) {
      return;
    }
    const mesh = new THREE.InstancedMesh(tile.geometry, material, xs.length * zs.length);
    mesh.name = 'floor-outside-building-pad';
    const dummy = new THREE.Object3D();
    let index = 0;
    for (let c = 0; c < xs.length; c += 1) {
      for (let i = 0; i < zs.length; i += 1) {
        dummy.position.set(xs[c], 0, zs[i]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    const minZ = Math.min(...zs) - 0.5;
    const maxZ = Math.max(...zs) + 0.5;
    this.anchors.push({ id: 'building-ground', columns: xs, minZ, maxZ });
    return { minZ, maxZ };
  }

  addBuildingCollision(mesh, width, height, depth, x, z) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const dummy = new THREE.Mesh(geometry);
    dummy.position.set(x, height * 0.5, z);
    dummy.updateWorldMatrix(true, true);
    this.collision.addObject(dummy, { id: mesh.name, group: 'outside-building' });
    geometry.dispose();
  }

  trackOccluders(occlusion) {
    for (let i = 0; i < this.buildings.length; i += 1) {
      occlusion.track(this.buildings[i].object, this.buildings[i].object.name);
    }
  }

  snapshot() {
    this.group.updateWorldMatrix(true, true);
    return {
      position: this.group.position.toArray(),
      children: this.group.children.map((child) => ({
        name: child.name,
        x: Math.round(child.position.x * 1000) / 1000,
        y: Math.round(child.position.y * 1000) / 1000,
        z: Math.round(child.position.z * 1000) / 1000
      })),
      buildings: this.buildings.map((item) => [item.x, item.z])
    };
  }

  dispose() {
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
