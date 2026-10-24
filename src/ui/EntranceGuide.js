import * as THREE from 'three';

const INSIDE_X = -3.15;

function arrowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 256);
  ctx.beginPath();
  ctx.moveTo(36, 78);
  ctx.lineTo(250, 78);
  ctx.lineTo(250, 28);
  ctx.lineTo(470, 128);
  ctx.lineTo(250, 228);
  ctx.lineTo(250, 178);
  ctx.lineTo(36, 178);
  ctx.closePath();
  ctx.fillStyle = '#ffca45';
  ctx.fill();
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#20283e';
  ctx.lineJoin = 'round';
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A floor arrow outside the door. Shown for a new shop until the player walks in.
export class EntranceGuide {
  constructor(scene) {
    this.active = false;
    this.pulse = 0;
    const material = new THREE.MeshBasicMaterial({
      map: arrowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
    this.material = material;
    this.root = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.36), material);
    this.root.name = 'entrance-guide';
    this.root.position.set(-4.356, 0.02, -2.826);
    this.root.rotation.x = -Math.PI / 2;
    this.root.visible = false;
    this.root.userData.editorIgnore = true;
    scene.add(this.root);
  }

  show() {
    this.active = true;
    this.pulse = 0;
    this.root.visible = true;
    this.material.opacity = 0.9;
  }

  hide() {
    this.active = false;
    this.root.visible = false;
  }

  update(dt, position) {
    if (!this.active || !position) {
      return;
    }
    if (position.x > INSIDE_X && position.z > -4.6 && position.z < 5.6) {
      this.hide();
      return;
    }
    this.pulse += dt;
    const wave = 0.5 + 0.5 * Math.sin(this.pulse * 1.35);
    this.material.opacity = 0.22 + wave * 0.78;
  }
}
