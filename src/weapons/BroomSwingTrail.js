import * as THREE from 'three';
import { createTrailMaterial } from './FlamingBroomShader.js';

const up = new THREE.Vector3(0, 1, 0);
const fallback = new THREE.Vector3(1, 0, 0);
const tangent = new THREE.Vector3();
const side = new THREE.Vector3();

export class BroomSwingTrail {
  constructor(scene, options) {
    this.life = options.trailLife;
    this.width = options.trailWidth;
    this.max = options.trailSegments;
    this.samples = new Float32Array(this.max * 3);
    this.sampleTime = new Float32Array(this.max);
    this.sampleCount = 0;
    this.recording = false;
    this.prevSide = new THREE.Vector3(1, 0, 0);
    this.hasSide = false;
    this.opacity = 0;
    this.lastTime = null;

    const verts = this.max * 2;
    this.positions = new Float32Array(verts * 3);
    this.uvs = new Float32Array(verts * 2);
    const indices = [];
    for (let i = 0; i < this.max - 1; i += 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    this.geometry.setIndex(indices);
    this.geometry.setDrawRange(0, 0);
    this.material = createTrailMaterial({
      seed: options.seed ?? 0,
      quality: options.quality ?? 1
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'broom-swing-trail';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.mesh.userData.editorIgnore = true;
    this.mesh.userData.flameVfx = true;
    scene.add(this.mesh);
  }

  get busy() {
    return this.sampleCount > 1 || this.opacity > 0.01;
  }

  begin() {
    this.recording = true;
    this.opacity = 1;
  }

  end() {
    this.recording = false;
  }

  push(x, y, z, time) {
    if (!this.recording) {
      return;
    }
    if (this.sampleCount > 0) {
      const last = (this.sampleCount - 1) * 3;
      const dx = x - this.samples[last];
      const dy = y - this.samples[last + 1];
      const dz = z - this.samples[last + 2];
      if (dx * dx + dy * dy + dz * dz < 0.00022) {
        this.sampleTime[this.sampleCount - 1] = time;
        return;
      }
    }
    if (this.sampleCount === this.max) {
      this.samples.copyWithin(0, 3);
      this.sampleTime.copyWithin(0, 1);
      this.sampleCount -= 1;
    }
    const offset = this.sampleCount * 3;
    this.samples[offset] = x;
    this.samples[offset + 1] = y;
    this.samples[offset + 2] = z;
    this.sampleTime[this.sampleCount] = time;
    this.sampleCount += 1;
  }

  expire(time) {
    let drop = 0;
    while (drop < this.sampleCount && time - this.sampleTime[drop] > this.life) {
      drop += 1;
    }
    if (drop <= 0) {
      return;
    }
    this.sampleCount -= drop;
    if (this.sampleCount > 0) {
      this.samples.copyWithin(0, drop * 3, (drop + this.sampleCount) * 3);
      this.sampleTime.copyWithin(0, drop, drop + this.sampleCount);
    }
  }

  update(time) {
    const step = this.lastTime == null ? 0 : Math.min(0.05, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    this.expire(time);
    this.material.uniforms.uTime.value = time;
    const count = this.sampleCount;
    if (!this.recording) {
      this.opacity = Math.max(0, this.opacity - step * 6);
    }
    if (count < 2 || this.opacity <= 0.02) {
      if (!this.recording || this.opacity <= 0.02) {
        this.opacity = this.recording ? this.opacity : 0;
        if (!this.recording) {
          this.sampleCount = 0;
        }
      }
      this.mesh.visible = false;
      this.geometry.setDrawRange(0, 0);
      this.hasSide = false;
      return;
    }

    const head = (count - 1) * 3;
    const originX = this.samples[head];
    const originY = this.samples[head + 1];
    const originZ = this.samples[head + 2];
    this.mesh.position.set(originX, originY, originZ);
    this.hasSide = false;

    for (let i = 0; i < count; i += 1) {
      const next = Math.min(count - 1, i + 1);
      const prev = Math.max(0, i - 1);
      tangent.set(
        this.samples[next * 3] - this.samples[prev * 3],
        this.samples[next * 3 + 1] - this.samples[prev * 3 + 1],
        this.samples[next * 3 + 2] - this.samples[prev * 3 + 2]
      );
      if (tangent.lengthSq() < 1e-8) {
        tangent.set(0, 0, 1);
      } else {
        tangent.normalize();
      }
      side.crossVectors(up, tangent);
      if (side.lengthSq() < 1e-6) {
        side.crossVectors(fallback, tangent);
      }
      side.normalize();
      side.x *= 0.35;
      side.z *= 0.35;
      side.y = 1;
      side.normalize();
      if (this.hasSide && side.dot(this.prevSide) < 0) {
        side.negate();
      }
      this.prevSide.copy(side);
      this.hasSide = true;

      const along = count <= 1 ? 0 : i / (count - 1);
      const bell = Math.sin(along * Math.PI);
      const half = (0.025 + bell * this.width) * 0.5;
      const x = this.samples[i * 3] - originX;
      const y = this.samples[i * 3 + 1] - originY;
      const z = this.samples[i * 3 + 2] - originZ;
      const left = i * 2;
      const right = left + 1;
      this.positions[left * 3] = x - side.x * half;
      this.positions[left * 3 + 1] = y - side.y * half;
      this.positions[left * 3 + 2] = z - side.z * half;
      this.positions[right * 3] = x + side.x * half;
      this.positions[right * 3 + 1] = y + side.y * half;
      this.positions[right * 3 + 2] = z + side.z * half;
      const v = 1 - along;
      this.uvs[left * 2] = 0;
      this.uvs[left * 2 + 1] = v;
      this.uvs[right * 2] = 1;
      this.uvs[right * 2 + 1] = v;
    }

    if (this.recording) {
      this.opacity = 1;
    }
    this.material.uniforms.uOpacity.value = this.opacity;
    this.geometry.setDrawRange(0, (count - 1) * 6);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this.mesh.visible = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
