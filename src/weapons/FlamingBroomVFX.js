import * as THREE from 'three';
import { BroomFireParticles } from './BroomFireParticles.js';
import { BroomSwingTrail } from './BroomSwingTrail.js';
import { createFlameMaterial } from './FlamingBroomShader.js';
import { flamePreset } from './flameQuality.js';

const PLANES = [
  { angle: 0, seed: 0.05, sx: 1, sy: 1 },
  { angle: Math.PI / 3, seed: 0.41, sx: 0.86, sy: 1.08 },
  { angle: -Math.PI / 3, seed: 0.73, sx: 1.05, sy: 0.9 }
];

function halfWidth(y) {
  const belly = Math.sin(Math.min(1, y) * Math.PI);
  return (1 - y) * 0.42 + belly * 0.1 + 0.035;
}

function createFlameGeometry(planes, rows) {
  const segments = rows;
  const verts = planes * (segments + 1) * 2;
  const positions = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const seeds = new Float32Array(verts);
  const angles = new Float32Array(verts);
  const indices = [];
  let vertex = 0;
  for (let plane = 0; plane < planes; plane += 1) {
    const spec = PLANES[plane];
    const base = vertex;
    for (let row = 0; row <= segments; row += 1) {
      const y = row / segments;
      const half = halfWidth(y) * spec.sx;
      const height = y * spec.sy;
      for (let side = 0; side < 2; side += 1) {
        const sign = side === 0 ? -1 : 1;
        const offset = vertex * 3;
        positions[offset] = sign * half;
        positions[offset + 1] = height;
        positions[offset + 2] = 0;
        uvs[vertex * 2] = sign;
        uvs[vertex * 2 + 1] = y;
        seeds[vertex] = spec.seed;
        angles[vertex] = spec.angle;
        vertex += 1;
      }
    }
    for (let row = 0; row < segments; row += 1) {
      const index = base + row * 2;
      indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
  geometry.setIndex(indices);
  return geometry;
}

function mark(object) {
  object.userData.editorIgnore = true;
  object.userData.flameVfx = true;
  object.frustumCulled = false;
}

export class FlamingBroomVFX {
  constructor(scene, anchor, options = {}) {
    this.scene = scene;
    this.anchor = anchor;
    this.preset = flamePreset(options.quality);
    this.enableTrail = options.enableTrail !== false;
    this.enableAttack = options.enableAttack !== false;
    this.seed = options.seed ?? Math.random();
    this.power = 1;
    this.powerScale = 1;
    this.particleScale = 1;
    this.active = true;
    this.time = Math.random() * 8;
    this.intensity = 1;
    this.wasSwinging = false;
    this.swingAge = 0;
    this.attackLeft = 0;
    this.attackClock = 0;
    this.emberDebt = 0;
    this.sparkDebt = 0;
    this.hasHead = false;
    this.swingReady = false;
    this.baseRadius = anchor.userData.bristleRadius ?? 0.28;
    this.spawnRadius = this.baseRadius;

    this.head = new THREE.Vector3();
    this.prevHead = new THREE.Vector3();
    this.swingDir = new THREE.Vector3(0, 0, 1);
    this.outward = new THREE.Vector3(0, 1, 0);
    this.flameDir = new THREE.Vector3(0, 1, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.quat = new THREE.Quaternion();
    this.aimQuat = new THREE.Quaternion();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.local = new THREE.Vector3();
    this.worldOffset = new THREE.Vector3();

    this.flameRoot = new THREE.Group();
    this.flameRoot.name = 'broom-flames';
    mark(this.flameRoot);
    anchor.add(this.flameRoot);

    this.geometry = createFlameGeometry(this.preset.planes, this.preset.rows);
    this.material = createFlameMaterial({
      seed: this.seed,
      quality: this.preset.quality,
      glow: false
    });
    this.flameMesh = new THREE.Mesh(this.geometry, this.material);
    this.flameMesh.name = 'broom-flame-planes';
    this.flameMesh.renderOrder = 3;
    mark(this.flameMesh);
    this.flameRoot.add(this.flameMesh);

    this.glowMaterial = null;
    this.glowMesh = null;
    if (this.preset.glow) {
      this.glowMaterial = createFlameMaterial({
        seed: this.seed + 1.7,
        quality: this.preset.quality,
        glow: true
      });
      this.glowMesh = new THREE.Mesh(this.geometry, this.glowMaterial);
      this.glowMesh.name = 'broom-flame-glow';
      this.glowMesh.scale.setScalar(1.22);
      this.glowMesh.renderOrder = 2;
      mark(this.glowMesh);
      this.flameRoot.add(this.glowMesh);
    }

    this.light = null;
    if (this.preset.light && options.enableLight !== false) {
      this.light = new THREE.PointLight(0xff7a2e, 0, 1.8, 2);
      this.light.name = 'broom-flame-light';
      this.light.castShadow = false;
      this.light.userData.editorIgnore = true;
      this.flameRoot.add(this.light);
    }

    const embers = Math.max(4, Math.round(this.preset.emberCapacity));
    const sparks = Math.max(6, Math.round(this.preset.sparkCapacity));
    this.particles = new BroomFireParticles(scene, embers, sparks);
    this.trail = this.enableTrail
      ? new BroomSwingTrail(scene, {
        trailLife: this.preset.trailLife,
        trailWidth: this.preset.trailWidth,
        trailSegments: this.preset.trailSegments,
        seed: this.seed,
        quality: this.preset.quality
      })
      : null;
    this.layout();
  }

  layout() {
    const radius = Math.max(0.12, this.baseRadius * this.powerScale);
    const length = radius * 2.65 * this.power;
    const width = radius * 1.85 * Math.min(this.power, 1.35);
    this.flameRoot.scale.set(width, length, width);
    this.spawnRadius = radius * 0.62;
    if (this.light) {
      this.light.position.set(0, 0.62, 0);
      this.light.distance = this.preset.lightDistance;
    }
  }

  syncAnchor() {
    this.baseRadius = this.anchor?.userData.bristleRadius ?? this.baseRadius;
    this.layout();
  }

  setPower(intensity = 1, scale = 1, particles = 1) {
    this.power = Math.max(0.25, intensity);
    this.powerScale = Math.max(0.45, scale);
    this.particleScale = Math.max(0.35, particles);
    this.layout();
  }

  setActive(active) {
    this.active = active === true;
    if (!this.active) {
      this.attackLeft = 0;
      this.wasSwinging = false;
      this.trail?.end();
    }
  }

  sampleHead() {
    if (!this.anchor) {
      return false;
    }
    this.anchor.updateWorldMatrix(true, false);
    this.anchor.getWorldPosition(this.head);
    this.anchor.getWorldQuaternion(this.quat);
    this.anchor.getWorldScale(this.scale);
    this.outward.set(0, 1, 0).applyQuaternion(this.quat);
    this.aimFlames();
    return true;
  }

  aimFlames() {
    this.flameDir.copy(this.outward).multiplyScalar(0.62);
    this.flameDir.y += 1;
    if (this.flameDir.lengthSq() < 1e-6) {
      this.flameDir.copy(this.up);
    } else {
      this.flameDir.normalize();
    }
    this.aimQuat.setFromUnitVectors(this.up, this.flameDir);
    this.flameRoot.quaternion.copy(this.quat).invert().multiply(this.aimQuat);
    this.flameRoot.rotateY(this.seed * 0.8);
  }

  spawnAround(kind) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * this.spawnRadius;
    this.local.set(
      Math.cos(angle) * radius,
      (Math.random() - 0.15) * this.spawnRadius * 0.8,
      Math.sin(angle) * radius
    );
    this.worldOffset.set(
      this.local.x * Math.abs(this.scale.x),
      this.local.y * Math.abs(this.scale.y),
      this.local.z * Math.abs(this.scale.z)
    ).applyQuaternion(this.quat);
    const x = this.head.x + this.worldOffset.x;
    const y = this.head.y + this.worldOffset.y;
    const z = this.head.z + this.worldOffset.z;
    if (kind === 'spark') {
      const speed = 0.7 + Math.random() * 0.8;
      const warm = Math.random();
      this.particles.spawnSpark(
        x, y, z,
        this.outward.x * speed + (Math.random() - 0.5) * 0.45,
        this.outward.y * speed + 0.15 + Math.random() * 0.35,
        this.outward.z * speed + (Math.random() - 0.5) * 0.45,
        0.14 + Math.random() * 0.12,
        0.045 + Math.random() * 0.02,
        1,
        0.78 + warm * 0.2,
        0.42 + warm * 0.3
      );
      return;
    }
    const rise = 1.05 + Math.random() * 0.75;
    const along = 0.08 + Math.random() * 0.16;
    const gold = Math.random();
    this.particles.spawnEmber(
      x,
      y + 0.06,
      z,
      this.outward.x * along + (Math.random() - 0.5) * 0.16,
      this.outward.y * along + rise,
      this.outward.z * along + (Math.random() - 0.5) * 0.16,
      0.5 + Math.random() * 0.35,
      0.07 + Math.random() * 0.04,
      1,
      0.46 + gold * 0.4,
      0.08 + gold * 0.18
    );
  }

  spawnAttackSpark() {
    const along = 1.25 + Math.random() * 1.35;
    const lift = 0.2 + Math.random() * 0.45;
    this.particles.spawnSpark(
      this.head.x,
      this.head.y,
      this.head.z,
      this.swingDir.x * along + (Math.random() - 0.5) * 0.55,
      this.swingDir.y * along + lift,
      this.swingDir.z * along + (Math.random() - 0.5) * 0.55,
      0.11 + Math.random() * 0.09,
      0.05 + Math.random() * 0.02,
      1,
      0.9 + Math.random() * 0.1,
      0.45 + Math.random() * 0.3
    );
  }

  hitBurst(x, y, z) {
    if (!this.active) {
      return;
    }
    const sparks = Math.max(1, Math.round(this.preset.hitSparks * this.particleScale));
    const embers = Math.max(1, Math.round(this.preset.hitEmbers * this.particleScale));
    for (let i = 0; i < sparks; i += 1) {
      const speed = 0.8 + Math.random() * 1.5;
      const dirY = 0.35 + Math.random() * 0.9;
      const yaw = Math.random() * Math.PI * 2;
      this.particles.spawnSpark(
        x, y, z,
        Math.cos(yaw) * speed,
        dirY * speed,
        Math.sin(yaw) * speed,
        0.1 + Math.random() * 0.08,
        0.03 + Math.random() * 0.02,
        1,
        0.86 + Math.random() * 0.14,
        0.4 + Math.random() * 0.35
      );
    }
    for (let i = 0; i < embers; i += 1) {
      const yaw = Math.random() * Math.PI * 2;
      this.particles.spawnEmber(
        x, y, z,
        Math.cos(yaw) * 0.25,
        0.55 + Math.random() * 0.5,
        Math.sin(yaw) * 0.25,
        0.28 + Math.random() * 0.16,
        0.035 + Math.random() * 0.02,
        1,
        0.5 + Math.random() * 0.35,
        0.1
      );
    }
  }

  burstAtHead() {
    if (!this.sampleHead()) {
      return;
    }
    this.hitBurst(this.head.x, this.head.y, this.head.z);
  }

  emitIdle(dt) {
    const emberTarget = Math.max(1, Math.round(this.preset.emberTarget * this.particleScale));
    const sparkTarget = Math.max(0, Math.round(this.preset.idleSparks * this.particleScale));
    if (this.particles.emberCount < emberTarget) {
      this.emberDebt += this.preset.emberRate * this.particleScale * dt;
      let guard = 3;
      while (guard > 0 && this.emberDebt >= 1 && this.particles.emberCount < emberTarget) {
        this.emberDebt -= 1;
        this.spawnAround('ember');
        guard -= 1;
      }
    } else {
      this.emberDebt = 0;
    }
    if (this.particles.sparkCount < sparkTarget) {
      this.sparkDebt += this.preset.sparkRate * dt;
      if (this.sparkDebt >= 1) {
        this.sparkDebt -= 1;
        this.spawnAround('spark');
      }
    } else {
      this.sparkDebt = 0;
    }
  }

  emitAttack(dt) {
    if (!this.enableAttack || this.attackLeft <= 0 || !this.swingReady) {
      this.attackClock = 0;
      return;
    }
    this.attackClock += dt;
    let guard = 5;
    while (guard > 0 && this.attackLeft > 0 && this.attackClock >= 0.012) {
      this.attackClock -= 0.012;
      this.spawnAttackSpark();
      this.attackLeft -= 1;
      guard -= 1;
    }
  }

  applyUniforms(opacity) {
    const intensity = this.intensity * this.power;
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uIntensity.value = intensity;
    this.material.uniforms.uOpacity.value = 0.94 * opacity;
    if (this.glowMaterial) {
      this.glowMaterial.uniforms.uTime.value = this.time + 0.37;
      this.glowMaterial.uniforms.uIntensity.value = intensity * 0.9;
      this.glowMaterial.uniforms.uOpacity.value = 0.28 * opacity;
    }
    if (this.light) {
      const visible = this.active && opacity > 0.05;
      this.light.visible = visible;
      const glow = Math.min(intensity, 1.12);
      this.light.intensity = visible ? this.preset.lightIntensity * glow * opacity : 0;
    }
  }

  update(dt, swinging) {
    const step = Math.min(Math.max(dt, 0), 0.05);
    const trailBusy = this.trail?.busy === true;
    if (!this.active && this.intensity < 0.02 && !this.particles.busy && !trailBusy) {
      this.flameRoot.visible = false;
      if (this.light) {
        this.light.visible = false;
        this.light.intensity = 0;
      }
      return;
    }

    this.time += step;
    if (!this.sampleHead()) {
      return;
    }

    const attack = this.enableAttack && swinging === true && this.active;
    if (attack && !this.wasSwinging) {
      this.swingAge = 0;
      this.swingReady = false;
      this.attackLeft = Math.max(1, Math.round(this.preset.attackSparks * this.particleScale));
      this.attackClock = 0;
      this.trail?.begin();
    }
    if (this.hasHead) {
      const travel = this.head.distanceTo(this.prevHead);
      const speed = step > 0 ? travel / step : 0;
      if (attack && speed > 0.25 && travel > 0.0001) {
        this.swingDir.copy(this.head).sub(this.prevHead).multiplyScalar(1 / travel);
        this.swingReady = true;
      }
    } else {
      this.hasHead = true;
    }
    this.prevHead.copy(this.head);

    if (attack) {
      this.swingAge += step;
      this.trail?.push(this.head.x, this.head.y, this.head.z, this.time);
      this.emitAttack(step);
    } else if (this.wasSwinging) {
      this.trail?.end();
      this.attackLeft = 0;
    }
    this.wasSwinging = attack;

    const strike = attack ? Math.sin(Math.min(1, this.swingAge / 0.42) * Math.PI) : 0;
    const target = this.active ? 1 + strike * 0.72 : 0;
    const response = attack ? 16 : 7;
    this.intensity += (target - this.intensity) * (1 - Math.exp(-step * response));
    const opacity = Math.min(1, this.intensity);
    this.flameRoot.visible = opacity > 0.02;
    this.applyUniforms(opacity);

    if (this.active) {
      this.emitIdle(step);
    }
    this.particles.update(step, this.head);
    this.trail?.update(this.time);
  }

  dispose() {
    this.flameRoot.removeFromParent();
    this.light?.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.glowMaterial?.dispose();
    this.light?.dispose();
    this.particles.dispose();
    this.trail?.dispose();
    this.anchor = null;
  }
}
