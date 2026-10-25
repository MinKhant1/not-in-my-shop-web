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
    this.textures = new Map();
    this.texture = this.textureFor(config.broomDamage);
  }

  textureFor(amount) {
    const key = Math.max(0, Math.round(amount));
    let texture = this.textures.get(key);
    if (!texture) {
      texture = createNumberTexture(`-${key}`);
      this.textures.set(key, texture);
    }
    return texture;
  }

  spawn(x, y, z, amount) {
    const material = new THREE.SpriteMaterial({
      map: amount == null ? this.texture : this.textureFor(amount),
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(0.46, 0.23, 1);
    sprite.name = 'hit-number';
    this.scene.add(sprite);
    this.entries.push({ sprite, age: 0, life: 0.7 });
  }

  spawnLine(x, y, z, text) {
    const font = 'bold 32px sans-serif';
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const textWidth = Math.ceil(measure.measureText(text).width);
    const width = textWidth + 28;
    const height = 48;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    context.font = font;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 5;
    context.strokeStyle = '#1b2233';
    context.strokeText(text, width / 2, height / 2);
    context.fillStyle = '#ffe08a';
    context.fillText(text, width / 2, height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    const worldHeight = 0.16;
    sprite.scale.set(worldHeight * (width / height), worldHeight, 1);
    sprite.name = 'hit-number';
    this.scene.add(sprite);
    this.entries.push({ sprite, age: 0, life: 1.25, disposeMap: true });
  }

  update(dt) {
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i];
      const life = entry.life > 0 ? entry.life : 0.7;
      entry.age += dt;
      entry.sprite.position.y += dt * 0.7;
      entry.sprite.material.opacity = Math.max(0, 1 - entry.age / life);
      if (entry.age < life) {
        continue;
      }
      entry.sprite.removeFromParent();
      if (entry.disposeMap) {
        entry.sprite.material.map?.dispose();
      }
      entry.sprite.material.dispose();
      this.entries.splice(i, 1);
    }
  }
}
