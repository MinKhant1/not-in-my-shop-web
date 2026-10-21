import * as THREE from 'three';

export class EditorCamera {
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 250);
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.enabled = false;
    this.rightMouse = false;
    this.middleMouse = false;
    this.keys = new Set();
    this.lastX = 0;
    this.lastY = 0;
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.frameHome();

    this.onPointerDown = (event) => {
      if (!this.enabled || isEditorUi(event.target)) {
        return;
      }
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      if (event.button === 2) {
        this.rightMouse = true;
        event.preventDefault();
      } else if (event.button === 1) {
        this.middleMouse = true;
        event.preventDefault();
      }
    };
    this.onPointerUp = (event) => {
      if (event.button === 2) this.rightMouse = false;
      if (event.button === 1) this.middleMouse = false;
    };
    this.onPointerMove = (event) => {
      if (!this.enabled) {
        return;
      }
      const dx = event.movementX || event.clientX - this.lastX;
      const dy = event.movementY || event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      if (this.rightMouse) {
        this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.euler.y -= dx * 0.005;
        this.euler.x = Math.max(-1.52, Math.min(1.52, this.euler.x - dy * 0.005));
        this.camera.quaternion.setFromEuler(this.euler);
      } else if (this.middleMouse) {
        this.pan(dx, dy);
      }
    };
    this.onWheel = (event) => {
      if (!this.enabled || isEditorUi(event.target)) {
        return;
      }
      event.preventDefault();
      this.camera.getWorldDirection(this.forward);
      this.camera.position.addScaledVector(this.forward, -event.deltaY * 0.012);
    };
    this.onContext = (event) => {
      if (this.enabled) {
        event.preventDefault();
      }
    };
    this.onBlur = () => {
      this.rightMouse = false;
      this.middleMouse = false;
      this.keys.clear();
    };

    window.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('pointerup', this.onPointerUp, true);
    window.addEventListener('pointermove', this.onPointerMove, true);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContext);
  }

  frameHome() {
    this.camera.position.set(8, 8, 10);
    this.camera.lookAt(0, 0.6, 0);
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  focus(object) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    if (box.isEmpty()) {
      object.getWorldPosition(center);
    }
    const size = box.isEmpty() ? 2 : box.getSize(new THREE.Vector3()).length();
    const distance = THREE.MathUtils.clamp(size * 1.15, 1.6, 48);
    this.camera.getWorldDirection(this.forward);
    this.camera.position.copy(center).addScaledVector(this.forward, -distance);
    this.camera.lookAt(center);
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
  }

  update(dt) {
    if (!this.enabled || !this.rightMouse || isTyping(document.activeElement)) {
      return;
    }
    const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 18 : 7) * dt;
    this.camera.getWorldDirection(this.forward);
    this.camera.updateMatrixWorld();
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    if (this.keys.has('KeyW')) this.camera.position.addScaledVector(this.forward, speed);
    if (this.keys.has('KeyS')) this.camera.position.addScaledVector(this.forward, -speed);
    if (this.keys.has('KeyD')) this.camera.position.addScaledVector(this.right, speed);
    if (this.keys.has('KeyA')) this.camera.position.addScaledVector(this.right, -speed);
    if (this.keys.has('KeyE')) this.camera.position.y += speed;
    if (this.keys.has('KeyQ')) this.camera.position.y -= speed;
  }

  pan(dx, dy) {
    const scale = 0.008 * Math.max(2, this.camera.position.length() * 0.12);
    this.camera.updateMatrixWorld();
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.camera.position.addScaledVector(this.right, -dx * scale);
    this.camera.position.addScaledVector(this.up, dy * scale);
  }
}

export function isEditorUi(target) {
  return target instanceof Element && Boolean(target.closest('#editor-root'));
}

export function isTyping(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
