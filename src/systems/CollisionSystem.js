import * as THREE from 'three';

export class CollisionSystem {
  constructor(config) {
    this.padding = config.collision.padding;
    this.debug = config.debug;
    this.boxes = [];
    this._box = new THREE.Box3();
  }

  addObject(object) {
    object.updateWorldMatrix(true, true);
    this._box.setFromObject(object);
    if (this._box.isEmpty()) {
      return;
    }

    const pad = this.padding;
    this.boxes.push({
      minX: this._box.min.x - pad,
      maxX: this._box.max.x + pad,
      minZ: this._box.min.z - pad,
      maxZ: this._box.max.z + pad
    });
  }

  blocksMovement(x, z, radius) {
    const radiusSquared = radius * radius;
    const boxes = this.boxes;

    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i];
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

    const group = new THREE.Group();
    group.name = 'collision-debug';
    const material = new THREE.LineBasicMaterial({ color: 0x3ddc97 });
    const y = 0.08;

    for (let i = 0; i < this.boxes.length; i += 1) {
      const box = this.boxes[i];
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
      group.add(new THREE.LineLoop(geometry, material));
    }

    return group;
  }
}
