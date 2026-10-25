import * as THREE from 'three';
import { createToonMaterialFromImported, getSharedToonGradientMap } from '../rendering/ToonMaterial.js';

const MODEL_URL = '/models/outside/football.glb';
const SIZE = 0.5;
const RESTITUTION = 0.72;
const KNOCK = 3.3;
const DRAG = 1.7;
const SLEEP_SPEED = 0.18;

function prepareModel(model, gradient) {
  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }
    child.castShadow = false;
    child.receiveShadow = false;
    if (!gradient || !child.material) {
      return;
    }
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((material) => createToonMaterialFromImported(material, gradient));
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

// Sits on the street as a loose ball. It is not a navigation collider, so shoppers
// walk their routes through the spot even if the ball is resting there.
export class StreetBall {
  constructor(scene, loader, collision, outside, config) {
    this.scene = scene;
    this.loader = loader;
    this.collision = collision;
    this.outside = outside;
    this.useToon = config?.graphics?.toonShading === true;
    this.toonSteps = config?.graphics?.toonSteps ?? 4;
    this.radius = 0.14;
    this.x = 0;
    this.z = 0;
    this.spawnX = 0;
    this.spawnZ = 0;
    this.vx = 0;
    this.vz = 0;
    this.group = null;
    this.spin = null;
    this.rollAxis = new THREE.Vector3();
    this.ready = false;
  }

  async load() {
    const asset = await this.loader.load(MODEL_URL);
    const gradient = this.useToon ? getSharedToonGradientMap(this.toonSteps) : null;
    const model = asset.scene;
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const size = box.getSize(new THREE.Vector3());
    this.radius = Math.max(size.x, size.z) * 0.5 * SIZE;
    prepareModel(model, gradient);

    const spin = new THREE.Group();
    spin.name = 'football-spin';
    spin.scale.setScalar(SIZE);
    spin.add(model);
    const group = new THREE.Group();
    group.name = 'street-football';
    group.userData.editorId = 'street-football';
    group.userData.editorRoot = true;
    group.userData.editorPersistent = true;
    group.userData.editorCollision = false;
    group.userData.editorKind = 'football';
    group.add(spin);
    this.scene.add(group);
    this.group = group;
    this.spin = spin;
    this.place();
    this.ready = true;
  }

  // Left edge of the road, in front of the northernmost building on that side.
  place() {
    const layout = this.outside?.layout;
    const buildings = this.outside?.buildings ?? [];
    let top = null;
    for (let i = 0; i < buildings.length; i += 1) {
      const building = buildings[i];
      const name = building.object?.name ?? '';
      if (!name.startsWith('outside-building-') || name.includes('north')) {
        continue;
      }
      if (!top || building.z < top.z) {
        top = building;
      }
    }
    let x = layout ? layout.roadWest + this.radius + 0.22 : -9.45;
    const z = top ? top.z : (layout?.minZ ?? -4) + 1.4;
    if (layout) {
      const limit = layout.centerX - 0.6;
      while (this.collision.blocksMovement(x, z, this.radius) && x < limit) {
        x += 0.12;
      }
    }
    this.setSpawn(x, z);
  }

  // The editor moves the mesh. That spot is where the ball starts each time edit mode opens.
  setSpawn(x, z, move = true) {
    this.spawnX = x;
    this.spawnZ = z;
    this.x = x;
    this.z = z;
    this.vx = 0;
    this.vz = 0;
    if (move) {
      this.syncMesh();
    }
  }

  showSpawn() {
    this.x = this.spawnX;
    this.z = this.spawnZ;
    this.vx = 0;
    this.vz = 0;
    this.syncMesh();
  }

  captureSpawn() {
    if (!this.group) {
      return;
    }
    this.setSpawn(this.group.position.x, this.group.position.z);
  }

  update(dt, player) {
    if (!this.ready || !this.group || dt <= 0) {
      return;
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.bounceOffSolids();
    if (player?.group) {
      this.bounceOffPlayer(player);
      this.bounceOffSolids();
    }
    const drag = Math.exp(-DRAG * dt);
    this.vx *= drag;
    this.vz *= drag;
    if (this.vx * this.vx + this.vz * this.vz < SLEEP_SPEED * SLEEP_SPEED) {
      this.vx = 0;
      this.vz = 0;
    }
    this.roll(dt);
    this.syncMesh();
  }

  bounceOffPlayer(player) {
    const px = player.group.position.x;
    const pz = player.group.position.z;
    const reach = (player.collisionRadius ?? 0.22) + this.radius;
    let dx = this.x - px;
    let dz = this.z - pz;
    let dist = Math.hypot(dx, dz);
    if (dist >= reach) {
      return;
    }
    if (dist < 0.0001) {
      dx = 1;
      dz = 0;
      dist = 1;
    }
    const nx = dx / dist;
    const nz = dz / dist;
    this.x = px + nx * reach;
    this.z = pz + nz * reach;

    let kx = nx;
    let kz = nz;
    const input = player.input?.getMovementVector?.();
    if (input) {
      const ix = input.x;
      const iz = -input.y;
      const moving = ix * ix + iz * iz;
      if (moving > 0.04) {
        const length = Math.sqrt(moving);
        kx = ix / length;
        kz = iz / length;
      }
    }
    const knock = Math.max(KNOCK, (player.speed ?? 2.6) * 1.15);
    this.vx = kx * knock;
    this.vz = kz * knock;
  }

  bounceOffSolids() {
    const push = this.solidPush(this.x, this.z, this.radius);
    if (!push.hit) {
      return;
    }
    this.x += push.nx;
    this.z += push.nz;
    const length = Math.hypot(push.nx, push.nz);
    if (length < 0.0001) {
      return;
    }
    const nx = push.nx / length;
    const nz = push.nz / length;
    const into = this.vx * nx + this.vz * nz;
    if (into < 0) {
      const bounce = (1 + RESTITUTION) * into;
      this.vx -= bounce * nx;
      this.vz -= bounce * nz;
    }
  }

  solidPush(x, z, radius) {
    const boxes = this.collision?.boxes ?? [];
    const radiusSquared = radius * radius;
    let nx = 0;
    let nz = 0;
    let hit = false;
    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i];
      if (box.enabled === false) {
        continue;
      }
      const closestX = x < box.minX ? box.minX : x > box.maxX ? box.maxX : x;
      const closestZ = z < box.minZ ? box.minZ : z > box.maxZ ? box.maxZ : z;
      let dx = x - closestX;
      let dz = z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radiusSquared) {
        continue;
      }
      hit = true;
      if (distSq > 0.0000001) {
        const dist = Math.sqrt(distSq);
        const gap = radius - dist;
        nx += (dx / dist) * gap;
        nz += (dz / dist) * gap;
        continue;
      }
      const left = x - box.minX;
      const right = box.maxX - x;
      const north = z - box.minZ;
      const south = box.maxZ - z;
      const min = Math.min(left, right, north, south);
      if (min === left) {
        nx -= left + radius;
      } else if (min === right) {
        nx += right + radius;
      } else if (min === north) {
        nz -= north + radius;
      } else {
        nz += south + radius;
      }
    }
    return { hit, nx, nz };
  }

  roll(dt) {
    const speed = Math.hypot(this.vx, this.vz);
    if (!this.spin || speed < 0.02) {
      return;
    }
    this.rollAxis.set(this.vz, 0, -this.vx).multiplyScalar(1 / speed);
    this.spin.rotateOnWorldAxis(this.rollAxis, (speed / this.radius) * dt);
  }

  syncMesh() {
    if (!this.group) {
      return;
    }
    this.group.position.set(this.x, this.radius, this.z);
  }
}
