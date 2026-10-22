import * as THREE from 'three';
import { createToonMaterial, createToonMaterialFromImported, getSharedToonGradientMap } from '../rendering/ToonMaterial.js';
import { STORE_SOUTH } from './StoreSections.js';
import { Diorama, dioramaSouth } from './Diorama.js';

const BUILDING_TEXTURE = '/models/textures/colormap-building.png';
const ROAD_TEXTURE = '/models/textures/colormap-road.png';

const BUILDING_F = '/models/outside/building-f.glb';
const BUILDING_G = '/models/outside/building-g.glb';
const BUILDING_H = '/models/outside/building-h.glb';
const STRAIGHT_ROAD = '/models/outside/straightRoad.glb';
const TILE_LOW = '/models/outside/tile-low.glb';
const BRICK_WALL = '/models/outside/brown_brick_wall.glb';

const SHOP_NORTH_ROWS = [-6, -5];
const STREET_SOUTH = STORE_SOUTH + 0.3;
const BRICK_LENGTH = 3;
const BRICK_HEIGHT = 2.4;
const BRICK_THICKNESS = 0.24;

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
    this.group.userData.editorId = 'outside-environment';
    this.group.userData.editorRoot = true;
    this.group.userData.editorPersistent = true;
    this.group.userData.editorCollision = false;
    this.anchors = [];
    this.buildings = [];
    this.cameraMinX = -6;
    this.tile = null;
    this.roadMaterial = null;
    this.buildingTemplates = [];
    this.buildingMaterial = null;
    this.layout = null;
    this.shopFloorWest = null;
    this.shopFloorEast = null;
    this.shopNorth = new THREE.Group();
    this.shopNorth.name = 'outside-shop-north';
    this.shopNorth.userData.editorId = 'outside-shop-north';
    this.shopNorth.userData.editorRoot = true;
    this.shopNorth.userData.editorPersistent = true;
    this.shopNorth.userData.editorCollision = false;
    this.ownedGeometries = [];
    this.ownedMaterials = [];
    this.ready = false;
    this.diorama = new Diorama(this.group, collision, loader, config);
  }

  async load() {
    if (this.ready) {
      return;
    }
    this.scene.add(this.group);
    try {
      const [buildingTexture, roadTexture, buildings, road, tile, wall] = await Promise.all([
        this.loader.loadTexture(BUILDING_TEXTURE),
        this.loader.loadTexture(ROAD_TEXTURE),
        Promise.all(BUILDING_URLS.map((url) => this.loadTemplate(url))),
        this.loader.load(STRAIGHT_ROAD),
        this.loadTemplate(TILE_LOW),
        this.loader.load(BRICK_WALL),
        this.diorama.prepare()
      ]);
      const buildingMaterial = this.materialFor(buildingTexture);
      const roadMaterial = this.materialFor(roadTexture);
      this.tile = tile;
      this.roadMaterial = roadMaterial;
      this.buildingTemplates = buildings;
      this.buildingMaterial = buildingMaterial;
      this.prepareWall(wall.scene);
      this.group.add(this.shopNorth);
      const roadSize = this.prepareRoad(road.scene);
      const layout = this.layoutFor(roadSize);
      const footprint = this.placeBuildings(buildings, buildingMaterial, layout);
      const ground = this.placeBuildingGround(tile, roadMaterial, footprint);
      this.fitRoadToGround(layout, roadSize, ground);
      this.placeSidewalks(tile, roadMaterial, layout);
      this.placeShopSideGap(layout);
      this.placeRoad(road.scene, layout);
      this.extendStreetSouth(road.scene, layout);
      this.layout = layout;
      this.placeNorthBuildings(buildings, buildingMaterial, layout);
      this.placeTopLeftFill();
      this.placeSouthBarrier();
      this.ready = true;
      this.setShopSpan(this.shopFloorWest, this.shopFloorEast);
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
      maxZ: OUTSIDE_CONFIG.originZ + length * 0.5,
      streetWest: roadWest - OUTSIDE_CONFIG.buildingSidewalk.width,
      streetEast: -3.5
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

  sidewalkColumns(layout) {
    const columns = [];
    const shopStart = OUTSIDE_CONFIG.shopSidewalk.firstX;
    for (let i = 0; i < OUTSIDE_CONFIG.shopSidewalk.width; i += 1) {
      columns.push(shopStart - i);
    }
    for (let i = 0; i < OUTSIDE_CONFIG.buildingSidewalk.width; i += 1) {
      columns.push(layout.roadWest - 0.5 - i);
    }
    return columns;
  }

  placeSidewalks(tile, material, layout) {
    if (!tile) {
      return;
    }
    const zs = this.centersCovering(layout.minZ, layout.maxZ);
    const columns = this.sidewalkColumns(layout);
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
    let preview = 0;
    for (let i = 0; i < count; i += 1) {
      const box = usable[i].boundingBox;
      const along = (box.max.x - box.min.x) * scale;
      preview += i === 0 ? along : gap + along;
    }
    let cursor = OUTSIDE_CONFIG.originZ - preview * 0.5;
    const frontX = layout.roadWest - OUTSIDE_CONFIG.buildingSidewalk.width - OUTSIDE_CONFIG.buildingSetback;
    let westEdge = frontX;
    let minZ = Infinity;
    let placed = 0;

    while (placed < 24) {
      const template = usable[placed % usable.length];
      const box = template.boundingBox;
      const along = (box.max.x - box.min.x) * scale;
      const depth = (box.max.z - box.min.z) * scale;
      const height = (box.max.y - box.min.y) * scale;
      if (placed > 0 && cursor + along > STREET_SOUTH + 0.15) {
        break;
      }
      const z = cursor + along * 0.5;
      cursor += along + gap;
      const x = frontX - depth * 0.5;
      westEdge = Math.min(westEdge, x - depth * 0.5);
      minZ = Math.min(minZ, z - along * 0.5);
      const mesh = new THREE.Mesh(template.geometry, material);
      mesh.name = `outside-building-${placed}`;
      placed += 1;
      mesh.position.set(x, -box.min.y * scale, z);
      mesh.rotation.y = -Math.PI / 2;
      mesh.scale.setScalar(scale);
      this.group.add(mesh);
      this.buildings.push({ object: mesh, x, z });
      this.addBuildingCollision(mesh, depth, height, along, x, z);
    }
    this.contentWestEdge = westEdge;
    this.cameraMinX = westEdge - 2.5;
    this.anchors.push({ id: 'buildings', count: placed, frontX });
    return {
      minX: westEdge - 1,
      maxX: layout.roadWest - OUTSIDE_CONFIG.buildingSidewalk.width,
      minZ: minZ - 1,
      maxZ: STREET_SOUTH
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
    this.leftPad = {
      minX: Math.min(...xs) - 0.5,
      maxX: Math.max(...xs) + 0.5,
      minZ,
      maxZ
    };
    this.anchors.push({ id: 'building-ground', columns: xs, minZ, maxZ });
    return { minZ, maxZ };
  }

  placeTileGrid(name, xs, zs) {
    if (!this.tile || xs.length === 0 || zs.length === 0) {
      return;
    }
    const mesh = new THREE.InstancedMesh(this.tile.geometry, this.roadMaterial, xs.length * zs.length);
    mesh.name = name;
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
    this.group.add(mesh);
  }

  placeShopSideGap(layout) {
    const xs = [-4];
    const zs = this.centersCovering(layout.minZ, layout.maxZ);
    this.placeTileGrid('floor-outside-shop-side', xs, zs);
  }

  extendStreetSouth(scene, layout) {
    const target = dioramaSouth(STREET_SOUTH, STORE_SOUTH, this.diorama.cfg).south;
    const extra = target - layout.maxZ;
    if (extra <= 0.05 || !(layout.lengthScale > 0)) {
      return;
    }
    const localExtra = extra / layout.lengthScale;
    const meshes = [];
    let roadEnd = -Infinity;
    scene.traverse((child) => {
      if (!child.isMesh || !child.geometry?.attributes?.position) {
        return;
      }
      const source = child.geometry.attributes.position;
      let maxZ = -Infinity;
      for (let i = 0; i < source.count; i += 1) {
        maxZ = Math.max(maxZ, source.getZ(i));
      }
      roadEnd = Math.max(roadEnd, maxZ);
      meshes.push(child);
    });
    for (let m = 0; m < meshes.length; m += 1) {
      const child = meshes[m];
      const geometry = child.geometry.clone();
      this.ownedGeometries.push(geometry);
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i += 1) {
        if (position.getZ(i) >= roadEnd - 0.02) {
          position.setZ(i, roadEnd + localExtra);
        }
      }
      position.needsUpdate = true;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      child.geometry = geometry;
    }
    const fromZ = layout.maxZ;
    layout.maxZ = target;
    layout.length = target - layout.minZ;
    this.placeContinuedTiles(
      'floor-outside-street-south',
      [...this.sidewalkColumns(layout), -4],
      fromZ,
      target
    );
    for (let i = 0; i < this.anchors.length; i += 1) {
      const anchor = this.anchors[i];
      if (anchor.id === 'road' || anchor.id === 'sidewalks') {
        anchor.maxZ = target;
      }
    }
  }

  placeContinuedTiles(name, xs, fromZ, toZ) {
    const pieces = [];
    let cursor = fromZ;
    while (toZ - cursor > 0.02) {
      const size = Math.min(1, toZ - cursor);
      pieces.push({ z: cursor + size * 0.5, scaleZ: size });
      cursor += size;
    }
    if (!this.tile || xs.length === 0 || pieces.length === 0) {
      return;
    }
    const mesh = new THREE.InstancedMesh(this.tile.geometry, this.roadMaterial, xs.length * pieces.length);
    mesh.name = name;
    const dummy = new THREE.Object3D();
    let index = 0;
    for (let c = 0; c < xs.length; c += 1) {
      for (let i = 0; i < pieces.length; i += 1) {
        dummy.position.set(xs[c], 0, pieces[i].z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, pieces[i].scaleZ);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  placeTopLeftFill() {
    if (!this.leftPad || !this.northPad) {
      return;
    }
    const xs = this.centersCovering(this.leftPad.minX - 0.5, this.northPad.minX);
    const zs = this.centersCovering(this.northPad.minZ, this.leftPad.minZ);
    this.placeTileGrid('floor-outside-top-left', xs, zs);
  }

  addBuildingCollision(mesh, width, height, depth, x, z) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const dummy = new THREE.Mesh(geometry);
    dummy.position.set(x, height * 0.5, z);
    dummy.updateWorldMatrix(true, true);
    this.collision.addObject(dummy, { id: mesh.name, group: 'outside-building' });
    geometry.dispose();
  }

  prepareWall(scene) {
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
      child.material = next;
    });
    this.wallTemplate = scene;
  }

  setShopSpan(floorWest, floorEast) {
    if (floorWest == null || floorEast == null) {
      return;
    }
    this.shopFloorWest = floorWest;
    this.shopFloorEast = floorEast;
    if (!this.ready) {
      return;
    }
    if (this.builtShopWest !== floorWest || this.builtShopEast !== floorEast) {
      this.builtShopWest = floorWest;
      this.builtShopEast = floorEast;
      this.rebuildShopNorth(floorWest, floorEast);
    }
    const fitted = this.diorama.fit(this.dioramaEdges(floorWest, floorEast));
    if (fitted) {
      this.cameraMinX = fitted.outerWest + 2.2;
    }
  }

  dioramaEdges(floorWest, floorEast) {
    let contentWest = this.contentWestEdge ?? this.cameraMinX + 2.5;
    let contentNorth = this.layout?.minZ ?? -6.2;
    if (this.leftPad) {
      contentWest = Math.min(contentWest, this.leftPad.minX);
      contentNorth = Math.min(contentNorth, this.leftPad.minZ);
    }
    if (this.northPad) {
      contentNorth = Math.min(contentNorth, this.northPad.minZ);
      contentWest = Math.min(contentWest, this.northPad.minX);
    }
    return {
      floorWest,
      floorEast,
      shopWest: -3.5,
      shopEast: floorEast + 0.5,
      shopNorth: -4.5,
      shopSouth: 5.5,
      backNorth: -6.5,
      streetSouth: STREET_SOUTH,
      streetNorth: this.layout?.minZ ?? -6.2,
      streetWest: this.layout?.streetWest,
      streetEast: this.layout?.streetEast,
      street: this.layout,
      contentWest,
      contentNorth,
      tile: this.tile?.geometry ?? null,
      pavementMaterial: this.roadMaterial,
      missingNorthPad: Boolean(this.northPad) && !this.group.getObjectByName('floor-outside-north-pad'),
      northPad: this.northPad
    };
  }

  rebuildShopNorth(floorWest, floorEast) {
    this.collision.removeGroup('outside-brick-wall');
    this.occlusion?.forgetPrefix('outside-wall-');
    for (let i = this.shopNorth.children.length - 1; i >= 0; i -= 1) {
      this.shopNorth.remove(this.shopNorth.children[i]);
    }
    this.placeShopPlatform(floorWest, floorEast);
    this.placeBrickWall(floorWest, floorEast);
  }

  placeShopPlatform(floorWest, floorEast) {
    if (!this.tile) {
      return;
    }
    const xs = [];
    for (let x = floorWest; x <= floorEast + 0.001; x += 1) {
      xs.push(x);
    }
    const mesh = new THREE.InstancedMesh(
      this.tile.geometry,
      this.roadMaterial,
      xs.length * SHOP_NORTH_ROWS.length
    );
    mesh.name = 'floor-outside-shop-north';
    const dummy = new THREE.Object3D();
    let index = 0;
    for (let c = 0; c < xs.length; c += 1) {
      for (let i = 0; i < SHOP_NORTH_ROWS.length; i += 1) {
        dummy.position.set(xs[c], 0, SHOP_NORTH_ROWS[i]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.shopNorth.add(mesh);
  }

  placeBrickWall(floorWest, floorEast) {
    if (!this.wallTemplate) {
      return;
    }
    const west = Math.min(floorWest - 0.5, this.northBuildingEast ?? floorWest - 0.5);
    const east = floorEast + 0.5;
    const z = SHOP_NORTH_ROWS[0] - 0.5 - BRICK_THICKNESS * 0.5;
    let cursor = west;
    let index = 0;
    while (cursor < east - 0.01) {
      const piece = Math.min(BRICK_LENGTH, east - cursor);
      const mesh = this.wallTemplate.clone(true);
      mesh.name = `outside-wall-${index}`;
      mesh.scale.set(piece / BRICK_LENGTH, 1, 1);
      mesh.position.set(cursor + piece * 0.5, 0, z);
      this.shopNorth.add(mesh);
      this.addWallCollision(mesh, piece, cursor + piece * 0.5, z);
      this.occlusion?.track(mesh, mesh.name);
      cursor += piece;
      index += 1;
    }
  }

  addWallCollision(mesh, width, x, z) {
    const geometry = new THREE.BoxGeometry(width, BRICK_HEIGHT, BRICK_THICKNESS);
    const dummy = new THREE.Mesh(geometry);
    dummy.position.set(x, BRICK_HEIGHT * 0.5, z);
    dummy.updateWorldMatrix(true, true);
    this.collision.addObject(dummy, { id: mesh.name, group: 'outside-brick-wall' });
    geometry.dispose();
  }

  placeNorthBuildings(templates, material, layout) {
    const usable = templates.filter(Boolean);
    if (usable.length === 0) {
      return;
    }
    const scale = OUTSIDE_CONFIG.buildingScale;
    const gap = OUTSIDE_CONFIG.buildingGap;
    const span = layout.roadEast - layout.roadWest;
    const order = [];
    let used = 0;
    while (order.length < 8) {
      const template = usable[order.length % usable.length];
      const along = (template.boundingBox.max.x - template.boundingBox.min.x) * scale;
      const next = order.length === 0 ? along : used + gap + along;
      if (order.length > 0 && next > span + 0.05) {
        break;
      }
      order.push(template);
      used = next;
    }
    let cursor = layout.centerX - used * 0.5;
    const frontZ = layout.minZ - OUTSIDE_CONFIG.buildingSetback;
    let northEdge = frontZ;
    let minX = Infinity;
    let maxX = -Infinity;

    for (let i = 0; i < order.length; i += 1) {
      const template = order[i];
      const box = template.boundingBox;
      const along = (box.max.x - box.min.x) * scale;
      const depth = (box.max.z - box.min.z) * scale;
      const height = (box.max.y - box.min.y) * scale;
      const x = cursor + along * 0.5;
      cursor += along + gap;
      const z = frontZ - depth * 0.5;
      northEdge = Math.min(northEdge, z - depth * 0.5);
      minX = Math.min(minX, x - along * 0.5);
      maxX = Math.max(maxX, x + along * 0.5);
      this.northBuildingEast = maxX;
      const mesh = new THREE.Mesh(template.geometry, material);
      mesh.name = `outside-building-north-${i}`;
      mesh.position.set(x, -box.min.y * scale, z);
      mesh.rotation.y = Math.PI;
      mesh.scale.setScalar(scale);
      this.group.add(mesh);
      this.buildings.push({ object: mesh, x, z });
      this.addBuildingCollision(mesh, along, height, depth, x, z);
    }
    this.placeNorthPad(minX, maxX, northEdge, frontZ);
  }

  placeSouthBarrier() {
    const thickness = 0.4;
    const geometry = new THREE.BoxGeometry(90, 3, thickness);
    const dummy = new THREE.Mesh(geometry);
    dummy.position.set(0, 1.5, STREET_SOUTH + thickness * 0.5);
    dummy.updateWorldMatrix(true, true);
    this.collision.addObject(dummy, { id: 'outside-south-barrier', group: 'outside-barrier' });
    geometry.dispose();
  }

  placeNorthPad(minX, maxX, minZ, maxZ) {
    if (!this.tile) {
      return;
    }
    const xs = this.centersCovering(minX, maxX);
    const zs = this.centersCovering(minZ, maxZ);
    if (xs.length === 0 || zs.length === 0) {
      return;
    }
    const mesh = new THREE.InstancedMesh(this.tile.geometry, this.roadMaterial, xs.length * zs.length);
    mesh.name = 'floor-outside-north-pad';
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
    this.group.add(mesh);
    this.northPad = {
      minX: Math.min(...xs) - 0.5,
      maxX: Math.max(...xs) + 0.5,
      minZ: Math.min(...zs) - 0.5,
      maxZ: Math.max(...zs) + 0.5
    };
  }

  trackOccluders(occlusion) {
    this.occlusion = occlusion;
    for (let i = 0; i < this.buildings.length; i += 1) {
      occlusion.track(this.buildings[i].object, this.buildings[i].object.name);
    }
    for (let i = 0; i < this.shopNorth.children.length; i += 1) {
      const child = this.shopNorth.children[i];
      if (child.name.startsWith('outside-wall-')) {
        occlusion.track(child, child.name);
      }
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
    this.diorama?.dispose();
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
