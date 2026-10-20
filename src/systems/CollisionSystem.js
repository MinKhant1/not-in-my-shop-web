import * as THREE from 'three';

export class CollisionSystem {
  constructor(config) {
    this.padding = config.collision.padding;
    this.debug = config.debug;
    this.boxes = [];
    this.debugRoot = null;
    this.debugMaterial = null;
    this._box = new THREE.Box3();
  }

  addObject(object, meta = null) {
    object.updateWorldMatrix(true, true);
    this._box.setFromObject(object);
    if (this._box.isEmpty()) {
      return;
    }

    const pad = this.padding;
    this.boxes.push({
      id: meta?.id ?? null,
      group: meta?.group ?? '',
      enabled: meta?.enabled !== false,
      minX: this._box.min.x - pad,
      maxX: this._box.max.x + pad,
      minZ: this._box.min.z - pad,
      maxZ: this._box.max.z + pad
    });
  }

  setIdEnabled(id, enabled) {
    const boxes = this.boxes;
    let changed = false;
    for (let i = 0; i < boxes.length; i += 1) {
      if (boxes[i].id === id && boxes[i].enabled !== (enabled === true)) {
        boxes[i].enabled = enabled === true;
        changed = true;
      }
    }
    return changed;
  }

  overlapsId(id, x, z, radius) {
    const radiusSquared = radius * radius;
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i];
      if (box.id !== id) {
        continue;
      }
      const closestX = x < box.minX ? box.minX : x > box.maxX ? box.maxX : x;
      const closestZ = z < box.minZ ? box.minZ : z > box.maxZ ? box.maxZ : z;
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz < radiusSquared) {
        return true;
      }
    }
    return false;
  }

  removeGroup(group) {
    this.boxes = this.boxes.filter((box) => box.group !== group);
    this.rebuildDebug();
  }

  setGroupEnabled(group, enabled) {
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i += 1) {
      if (boxes[i].group === group) {
        boxes[i].enabled = enabled === true;
      }
    }
  }

  blocksMovement(x, z, radius) {
    const radiusSquared = radius * radius;
    const boxes = this.boxes;

    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i];
      if (box.enabled === false) {
        continue;
      }
      const closestX = x < box.minX ? box.minX : x > box.maxX ? box.maxX : x;
      const closestZ = z < box.minZ ? box.minZ : z > box.maxZ ? box.maxZ : z;
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz < radiusSquared) {
        return true;
      }
    }

    return false;
  }

  createDebugVisuals() {
    if (!this.debug) {
      return null;
    }

    this.debugRoot = new THREE.Group();
    this.debugRoot.name = 'collision-debug';
    this.debugMaterial = new THREE.LineBasicMaterial({ color: 0x3ddc97 });
    this.rebuildDebug();
    return this.debugRoot;
  }

  rebuildDebug() {
    if (!this.debugRoot) {
      return;
    }

    const root = this.debugRoot;
    for (let i = root.children.length - 1; i >= 0; i -= 1) {
      const child = root.children[i];
      child.geometry.dispose();
      root.remove(child);
    }

    const y = 0.08;
    for (let i = 0; i < this.boxes.length; i += 1) {
      const box = this.boxes[i];
      if (box.enabled === false) {
        continue;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array([
            box.minX, y, box.minZ,
            box.maxX, y, box.minZ,
            box.maxX, y, box.maxZ,
            box.minX, y, box.maxZ
          ]),
          3
        )
      );
      root.add(new THREE.LineLoop(geometry, this.debugMaterial));
    }
  }
}
