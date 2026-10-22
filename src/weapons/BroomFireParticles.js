import * as THREE from 'three';
import { createPointMaterial } from './FlamingBroomShader.js';

function smooth(edge0, edge1, value) {
  const span = edge1 - edge0;
  if (span <= 0) {
    return value >= edge1 ? 1 : 0;
  }
  const t = Math.min(1, Math.max(0, (value - edge0) / span));
  return t * t * (3 - 2 * t);
}

class ParticlePool {
  constructor(scene, capacity, additive, name) {
    this.capacity = capacity;
    this.count = 0;
    this.cursor = 0;
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.fade = new Float32Array(capacity);
    this.red = new Float32Array(capacity);
    this.green = new Float32Array(capacity);
    this.blue = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);

    this.positions = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.colors = new Float32Array(capacity * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.material = createPointMaterial(additive);
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = name;
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    this.points.userData.editorIgnore = true;
    this.points.userData.flameVfx = true;
    this.points.visible = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, size, red, green, blue, fade) {
    let slot = -1;
    for (let i = 0; i < this.capacity; i += 1) {
      const index = (this.cursor + i) % this.capacity;
      if (this.alive[index] === 0) {
        slot = index;
        break;
      }
    }
    if (slot < 0) {
      let oldest = 0;
      let oldestAge = -1;
      for (let i = 0; i < this.capacity; i += 1) {
        const ratio = this.life[i] > 0 ? this.age[i] / this.life[i] : 1;
        if (ratio > oldestAge) {
          oldestAge = ratio;
          oldest = i;
        }
      }
      slot = oldest;
    }
    this.cursor = (slot + 1) % this.capacity;
    if (this.alive[slot] === 0) {
      this.count += 1;
    }
    this.alive[slot] = 1;
    this.px[slot] = x;
    this.py[slot] = y;
    this.pz[slot] = z;
    this.vx[slot] = vx;
    this.vy[slot] = vy;
    this.vz[slot] = vz;
    this.age[slot] = 0;
    this.life[slot] = life;
    this.size[slot] = size;
    this.fade[slot] = fade;
    this.red[slot] = red;
    this.green[slot] = green;
    this.blue[slot] = blue;
  }

  update(dt, origin) {
    if (this.count <= 0) {
      this.points.visible = false;
      return;
    }
    this.points.position.copy(origin);
    const drag = Math.max(0, 1 - dt * 0.45);
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.alive[i] === 0) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const life = this.life[i];
      if (this.age[i] >= life) {
        this.alive[i] = 0;
        this.count = Math.max(0, this.count - 1);
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      this.vx[i] *= drag;
      this.vy[i] *= drag;
      this.vz[i] *= drag;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const ratio = life > 0 ? this.age[i] / life : 1;
      const fadeIn = smooth(0, 0.06, ratio);
      const fadeOut = 1 - smooth(this.fade[i], 1, ratio);
      this.positions[i * 3] = this.px[i] - origin.x;
      this.positions[i * 3 + 1] = this.py[i] - origin.y;
      this.positions[i * 3 + 2] = this.pz[i] - origin.z;
      this.sizes[i] = this.size[i] * (1 - ratio * 0.7);
      this.alphas[i] = fadeIn * fadeOut;
      this.colors[i * 3] = this.red[i];
      this.colors[i * 3 + 1] = this.green[i];
      this.colors[i * 3 + 2] = this.blue[i];
    }
    this.points.visible = this.count > 0;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class BroomFireParticles {
  constructor(scene, emberCapacity, sparkCapacity) {
    this.embers = new ParticlePool(scene, emberCapacity, false, 'broom-embers');
    this.sparks = new ParticlePool(scene, sparkCapacity, true, 'broom-sparks');
  }

  get emberCount() {
    return this.embers.count;
  }

  get sparkCount() {
    return this.sparks.count;
  }

  get busy() {
    return this.embers.count > 0 || this.sparks.count > 0;
  }

  spawnEmber(x, y, z, vx, vy, vz, life, size, red, green, blue) {
    this.embers.spawn(x, y, z, vx, vy, vz, life, size, red, green, blue, 0.58);
  }

  spawnSpark(x, y, z, vx, vy, vz, life, size, red, green, blue) {
    this.sparks.spawn(x, y, z, vx, vy, vz, life, size, red, green, blue, 0.22);
  }

  update(dt, origin) {
    this.embers.update(dt, origin);
    this.sparks.update(dt, origin);
  }

  dispose() {
    this.embers.dispose();
    this.sparks.dispose();
  }
}
