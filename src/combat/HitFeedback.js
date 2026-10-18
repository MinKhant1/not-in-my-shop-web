import * as THREE from 'three';

function createNumberTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 64);
  context.fillStyle = '#ffe08a';
  context.font = 'bold 42px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 64, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class HitFeedback {
  constructor(scene, config) {
    this.scene = scene;
    this.entries = [];
    this.texture = createNumberTexture(`-${config.broomDamage}`);
  }

  spawn(x, y, z) {
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(0.46, 0.23, 1);
    sprite.name = 'hit-number';
    this.scene.add(sprite);
    this.entries.push({ sprite, age: 0 });
  }

  update(dt) {
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i];
      entry.age += dt;
      entry.sprite.position.y += dt * 0.7;
      entry.sprite.material.opacity = Math.max(0, 1 - entry.age / 0.7);
      if (entry.age < 0.7) {
        continue;
      }
      entry.sprite.removeFromParent();
      entry.sprite.material.dispose();
      this.entries.splice(i, 1);
    }
  }
}
