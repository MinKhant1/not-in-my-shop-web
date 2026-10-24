import * as THREE from 'three';
import { INTERIOR_Z_MAX, INTERIOR_Z_MIN } from './StoreSections.js';

const DUST_LIFE = 0.4;
const DUST_COUNT = 8;

function paintTemplate(root, toonFactory) {
  root.traverse((child) => {
    child.userData.editorIgnore = true;
    child.castShadow = false;
    child.receiveShadow = false;
    if (!child.isMesh || !toonFactory) {
      return;
    }
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((material) => toonFactory.fromImported(material));
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

function fitOnFloor(model, targetHeight) {
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.scale.setScalar(1);
  model.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(model);
  const height = Math.max(0.001, box.max.y - box.min.y);
  let scale = targetHeight / height;
  model.scale.setScalar(scale);
  model.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(model);
  const wide = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  if (wide > 0.42) {
    scale *= 0.42 / wide;
    model.scale.setScalar(scale);
    model.updateWorldMatrix(true, true);
    box = new THREE.Box3().setFromObject(model);
  }
  model.position.y += 0.008 - box.min.y;
}

export class TrashManager {
  constructor(options) {
    this.scene = options.scene;
    this.loader = options.loader;
    this.collision = options.collision;
    this.config = options.config ?? {};
    this.toonFactory = options.toonFactory ?? null;
    this.floorEast = options.floorEast ?? (() => 3);
    this.modelUrl = this.config.model ?? '/models/objects/trash_bag.glb';
    this.targetHeight = this.config.height ?? 0.28;
    this.template = null;
    this.ready = false;
    this.bags = [];
    this.puffs = [];
  }

  async load() {
    try {
      const asset = await this.loader.load(this.modelUrl);
      const model = asset.scene;
      paintTemplate(model, this.toonFactory);
      fitOnFloor(model, this.targetHeight);
      this.template = new THREE.Group();
      this.template.name = 'trash-bag-template';
      this.template.userData.editorIgnore = true;
      this.template.add(model);
      this.ready = true;
    } catch (error) {
      console.error('Failed to load trash bag', error);
    }
  }

  isInside(x, z) {
    const east = this.floorEast();
    const maxX = Number.isFinite(east) ? east - 0.4 : 2.6;
    return x >= -2.9 && x <= maxX && z >= INTERIOR_Z_MIN + 0.35 && z <= INTERIOR_Z_MAX - 0.2;
  }

  spawn(x, z) {
    if (!this.ready || !this.template) {
      return;
    }
    const spot = this.findSpot(x, z);
    if (!spot) {
      return;
    }
    const group = this.template.clone(true);
    group.name = 'trash-bag';
    group.userData.editorIgnore = true;
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);
    this.bags.push({
      group,
      x: spot.x,
      z: spot.z,
      cleaned: false
    });
  }

  inRange(x, z, range) {
    return this.nearest(x, z, range) !== null;
  }

  sweep(x, z, range) {
    const bag = this.nearest(x, z, range);
    if (!bag) {
      return false;
    }
    bag.cleaned = true;
    this.detach(bag);
    this.puff(bag.x, bag.z);
    return true;
  }

  clear() {
    for (let i = this.bags.length - 1; i >= 0; i -= 1) {
      this.bags[i].cleaned = true;
      this.detach(this.bags[i]);
    }
    for (let i = this.puffs.length - 1; i >= 0; i -= 1) {
      this.disposePuff(this.puffs[i]);
    }
    this.puffs = [];
  }

  update(dt) {
    for (let i = this.puffs.length - 1; i >= 0; i -= 1) {
      const puff = this.puffs[i];
      puff.age += dt;
      const positions = puff.geometry.attributes.position;
      for (let p = 0; p < DUST_COUNT; p += 1) {
        const seed = puff.seeds[p];
        positions.setXYZ(
          p,
          seed.x + seed.vx * puff.age,
          seed.y + seed.vy * puff.age,
          seed.z + seed.vz * puff.age
        );
      }
      positions.needsUpdate = true;
      puff.material.opacity = Math.max(0, 1 - puff.age / DUST_LIFE);
      if (puff.age < DUST_LIFE) {
        continue;
      }
      this.disposePuff(puff);
      this.puffs.splice(i, 1);
    }
  }

  findSpot(x, z) {
    const spots = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.16 + Math.random() * 0.22;
      spots.push({
        x: x + Math.cos(angle) * dist,
        z: z + Math.sin(angle) * dist
      });
    }
    spots.push({ x, z });
    for (let i = 0; i < spots.length; i += 1) {
      const spot = spots[i];
      if (!this.isInside(spot.x, spot.z)) {
        continue;
      }
      if (this.collision?.blocksMovement(spot.x, spot.z, 0.16)) {
        continue;
      }
      if (this.nearBag(spot.x, spot.z, 0.28)) {
        continue;
      }
      return spot;
    }
    if (this.isInside(x, z)) {
      return { x, z };
    }
    return null;
  }

  nearBag(x, z, gap) {
    const gapSq = gap * gap;
    for (let i = 0; i < this.bags.length; i += 1) {
      const bag = this.bags[i];
      if (bag.cleaned) {
        continue;
      }
      const dx = bag.x - x;
      const dz = bag.z - z;
      if (dx * dx + dz * dz < gapSq) {
        return true;
      }
    }
    return false;
  }

  nearest(x, z, range) {
    const rangeSq = range * range;
    let best = null;
    let bestDist = rangeSq;
    for (let i = 0; i < this.bags.length; i += 1) {
      const bag = this.bags[i];
      if (bag.cleaned) {
        continue;
      }
      const dx = bag.x - x;
      const dz = bag.z - z;
      const dist = dx * dx + dz * dz;
      if (dist <= bestDist) {
        best = bag;
        bestDist = dist;
      }
    }
    return best;
  }

  detach(bag) {
    const index = this.bags.indexOf(bag);
    if (index >= 0) {
      this.bags.splice(index, 1);
    }
    bag.group.removeFromParent();
  }

  puff(x, z) {
    const positions = new Float32Array(DUST_COUNT * 3);
    const seeds = [];
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const angle = (i / DUST_COUNT) * Math.PI * 2;
      const speed = 0.35 + Math.random() * 0.45;
      seeds.push({
        x,
        y: 0.06,
        z,
        vx: Math.cos(angle) * speed,
        vy: 0.45 + Math.random() * 0.55,
        vz: Math.sin(angle) * speed
      });
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0.06;
      positions[i * 3 + 2] = z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xd2c6b4,
      size: 0.07,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'trash-dust';
    points.userData.editorIgnore = true;
    points.frustumCulled = false;
    this.scene.add(points);
    this.puffs.push({
      points,
      geometry,
      material,
      seeds,
      age: 0
    });
  }

  disposePuff(puff) {
    puff.points.removeFromParent();
    puff.geometry.dispose();
    puff.material.dispose();
  }
}
