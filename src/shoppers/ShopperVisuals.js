import * as THREE from 'three';

let thiefIconMaterial = null;

function getThiefIconMaterial() {
  if (thiefIconMaterial) {
    return thiefIconMaterial;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 128);
  context.fillStyle = '#e23d3d';
  context.beginPath();
  context.arc(64, 64, 54, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 8;
  context.strokeStyle = '#fff7f2';
  context.stroke();
  context.fillStyle = '#fff7f2';
  context.font = 'bold 84px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('!', 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  thiefIconMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true
  });
  return thiefIconMaterial;
}

export function applyToonOutfit(model, toonFactory) {
  if (!toonFactory) {
    return;
  }
  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((material) => toonFactory.fromImported(material));
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

export function applyThiefEffect(model) {
  const clones = [];
  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((source) => {
      const material = source.clone();
      if (material.color) {
        material.color.lerp(new THREE.Color(0xff3b3b), 0.42);
      }
      if (material.emissive) {
        material.emissive.setHex(0xff2a2a);
        material.emissiveIntensity = 0.7;
      }
      material.needsUpdate = true;
      clones.push(material);
      return material;
    });
    child.material = Array.isArray(child.material) ? next : next[0];
  });
  return clones;
}

export class ShopperVisuals {
  constructor(group, model, debug) {
    this.group = group;
    this.model = model;
    this.icon = null;
    this.thiefMaterials = null;
    this.debugSprite = null;
    this.debugTexture = null;
    if (debug) {
      this.debugSprite = this.createLabel();
      this.group.add(this.debugSprite);
    }
  }

  createLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.debugCanvas = canvas;
    this.debugTexture = texture;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    }));
    sprite.position.y = 2.05;
    sprite.scale.set(1.05, 1.05, 1);
    sprite.name = 'shopper-debug';
    return sprite;
  }

  setDebugLines(lines) {
    if (!this.debugCanvas) {
      return;
    }
    const context = this.debugCanvas.getContext('2d');
    context.clearRect(0, 0, 256, 256);
    context.fillStyle = 'rgba(16, 18, 22, 0.78)';
    context.fillRect(4, 4, 248, 248);
    context.fillStyle = '#ffffff';
    context.font = 'bold 24px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const lineHeight = 32;
    const start = 24;
    for (let i = 0; i < lines.length; i += 1) {
      context.fillText(lines[i], 128, start + i * lineHeight);
    }
    this.debugTexture.needsUpdate = true;
  }

  revealThief() {
    this.hideCountdown();
    if (this.thiefMaterials) {
      return;
    }
    this.thiefMaterials = applyThiefEffect(this.model);
    const icon = new THREE.Sprite(getThiefIconMaterial());
    icon.name = 'thief-icon';
    icon.position.y = 1.38;
    icon.scale.set(0.34, 0.34, 1);
    this.group.add(icon);
    this.icon = icon;
  }

  showCountdown(seconds) {
    const shown = Math.max(1, Math.ceil(seconds));
    if (!this.countdown) {
      this.countdown = this.createCountdown();
      this.group.add(this.countdown);
    }
    this.countdown.visible = true;
    if (this.countdownValue !== shown) {
      this.drawCountdown(shown, seconds <= 2);
      this.countdownValue = shown;
    }
    const pulse = seconds <= 2 ? 1 + Math.sin(seconds * 16) * 0.12 : 1;
    this.countdown.scale.set(0.46 * pulse, 0.46 * pulse, 1);
  }

  hideCountdown() {
    if (this.countdown) {
      this.countdown.visible = false;
    }
    this.countdownValue = 0;
  }

  createCountdown() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.countdownCanvas = canvas;
    this.countdownTexture = texture;
    this.countdownValue = 0;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    }));
    sprite.position.y = 1.62;
    sprite.scale.set(0.46, 0.46, 1);
    sprite.name = 'queue-countdown';
    sprite.visible = false;
    return sprite;
  }

  drawCountdown(shown, urgent) {
    const context = this.countdownCanvas.getContext('2d');
    context.clearRect(0, 0, 128, 128);
    context.fillStyle = urgent ? '#c62828' : '#1b2430';
    context.beginPath();
    context.arc(64, 64, 56, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 8;
    context.strokeStyle = urgent ? '#ffd1d1' : '#ffe08a';
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = 'bold 72px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(shown), 64, 70);
    this.countdownTexture.needsUpdate = true;
  }

  dispose() {
    if (this.icon) {
      this.icon.removeFromParent();
    }
    if (this.thiefMaterials) {
      for (let i = 0; i < this.thiefMaterials.length; i += 1) {
        this.thiefMaterials[i].dispose();
      }
    }
    if (this.debugSprite) {
      this.debugSprite.removeFromParent();
      this.debugSprite.material.dispose();
      this.debugTexture.dispose();
    }
    if (this.countdown) {
      this.countdown.removeFromParent();
      this.countdown.material.dispose();
      this.countdownTexture.dispose();
    }
  }
}
