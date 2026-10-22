import * as THREE from 'three';

export class FollowCamera {
  constructor(config) {
    const camera = config.camera;
    this.height = camera.height;
    this.distance = camera.distance;
    this.lookAhead = camera.lookAhead;
    this.smoothness = camera.smoothness;
    this.baseFov = camera.fov;
    this.portraitFov = camera.portraitFov ?? camera.fov;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.1, 58);
    this.player = null;
    this.hasSnapped = false;
    this.desiredPosition = new THREE.Vector3();
    this.desiredTarget = new THREE.Vector3();
    this.currentTarget = new THREE.Vector3();
    this.limitMinX = null;
    this.limitMaxX = null;
  }

  setLimits(limits) {
    if (!limits) {
      return;
    }
    this.limitMinX = limits.minX;
    this.limitMaxX = limits.maxX;
  }

  follow(player) {
    this.player = player;
  }

  resize(width, height) {
    const aspect = width / Math.max(height, 1);
    this.camera.aspect = aspect;
    const fov = aspect < 0.8 ? this.portraitFov : this.baseFov;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
    }
    this.camera.updateProjectionMatrix();
  }

  snap() {
    this.hasSnapped = false;
    this.update(0);
  }

  update(dt) {
    const position = this.player.group.position;
    const aspect = this.camera.aspect || 1;
    const portrait = aspect < 0.8 ? Math.min(1, (0.8 - aspect) / 0.38) : 0;
    const height = this.height * (1 - portrait * 0.05);
    const distance = this.distance * (1 - portrait * 0.07);
    this.desiredPosition.set(position.x, height, position.z + distance);
    this.desiredTarget.set(position.x, 0, position.z - this.lookAhead);
    this.clampDesiredX();

    if (!this.hasSnapped) {
      this.camera.position.copy(this.desiredPosition);
      this.currentTarget.copy(this.desiredTarget);
      this.hasSnapped = true;
    } else {
      const alpha = 1 - Math.exp(-this.smoothness * dt);
      this.camera.position.lerp(this.desiredPosition, alpha);
      this.currentTarget.lerp(this.desiredTarget, alpha);
    }

    this.camera.lookAt(this.currentTarget);
  }

  clampDesiredX() {
    if (this.limitMinX == null || this.limitMaxX == null) {
      return;
    }
    const min = this.limitMinX;
    const max = this.limitMaxX;
    const x = max > min
      ? Math.min(max, Math.max(min, this.desiredPosition.x))
      : (min + max) * 0.5;
    const shift = x - this.desiredPosition.x;
    if (shift === 0) {
      return;
    }
    this.desiredPosition.x = x;
    this.desiredTarget.x += shift;
  }
}
