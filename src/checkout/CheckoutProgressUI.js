import * as THREE from 'three';
import { findSceneObject } from '../core/findSceneObject.js';

const CANVAS_W = 256;
const CANVAS_H = 128;
const PLANE_W = 0.86;
const PLANE_H = 0.43;
const TRACK = { x: 22, y: 62, w: 212, h: 42 };
const FILL_LERP = 16;

function createFaceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, CANVAS_W, CANVAS_H);
  context.fillStyle = '#ffffff';
  context.font = 'bold 40px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('CHECKOUT', CANVAS_W / 2, 30);
  context.fillStyle = '#ffe08a';
  context.fillRect(TRACK.x - 6, TRACK.y - 6, TRACK.w + 12, TRACK.h + 12);
  context.fillStyle = 'rgba(18, 24, 32, 0.92)';
  context.fillRect(TRACK.x, TRACK.y, TRACK.w, TRACK.h);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class CheckoutProgressUI {
  constructor(scene, camera) {
    this.camera = camera;
    this.target = 0;
    this.display = 0;
    this.root = new THREE.Group();
    this.root.name = 'CheckoutProgressUI';
    this.root.visible = false;
    this.root.renderOrder = 3;

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(PLANE_W, PLANE_H),
      new THREE.MeshBasicMaterial({
        map: createFaceTexture(),
        transparent: true,
        depthWrite: false
      })
    );
    face.name = 'Background';
    face.renderOrder = 3;

    const fillWidth = (TRACK.w / CANVAS_W) * PLANE_W;
    const fillHeight = (TRACK.h / CANVAS_H) * PLANE_H;
    const fillLeft = (TRACK.x / CANVAS_W - 0.5) * PLANE_W;
    const fillCenterY = (0.5 - (TRACK.y + TRACK.h / 2) / CANVAS_H) * PLANE_H;
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(fillWidth, fillHeight),
      new THREE.MeshBasicMaterial({
        color: 0xffca45,
        transparent: true,
        depthWrite: false
      })
    );
    fill.geometry.translate(fillWidth / 2, 0, 0);
    fill.position.set(fillLeft, fillCenterY, 0.01);
    fill.scale.x = 0;
    fill.name = 'Fill';
    fill.renderOrder = 4;

    this.root.add(face);
    this.root.add(fill);
    this.face = face;
    this.fill = fill;
    this.attach(scene);
  }

  attach(scene) {
    const register = findSceneObject(scene, 'cash-register');
    if (!register) {
      this.root.position.set(2.15, 1.2, 2.55);
      scene.add(this.root);
      return;
    }

    register.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(register);
    const anchor = box.isEmpty()
      ? new THREE.Vector3(0, 1.15, 0)
      : new THREE.Vector3(
        (box.min.x + box.max.x) * 0.5,
        box.max.y + 0.36,
        (box.min.z + box.max.z) * 0.5
      );
    if (!box.isEmpty()) {
      register.worldToLocal(anchor);
    }
    this.root.position.copy(anchor);
    register.add(this.root);
  }

  show() {
    this.root.visible = true;
  }

  setProgress(value) {
    this.target = Math.min(1, Math.max(0, value));
  }

  hide() {
    this.root.visible = false;
  }

  reset() {
    this.target = 0;
    this.display = 0;
    this.fill.scale.x = 0.0001;
  }

  update(dt) {
    if (!this.root.visible) {
      return;
    }
    const alpha = 1 - Math.exp(-FILL_LERP * dt);
    this.display += (this.target - this.display) * alpha;
    if (Math.abs(this.target - this.display) < 0.004) {
      this.display = this.target;
    }
    this.fill.scale.x = Math.max(this.display, 0.0001);
    if (this.camera) {
      this.root.lookAt(this.camera.position);
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.face.geometry.dispose();
    this.face.material.map.dispose();
    this.face.material.dispose();
    this.fill.geometry.dispose();
    this.fill.material.dispose();
  }
}
