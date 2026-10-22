import * as THREE from 'three';

let thiefIconMaterial = null;
let knockoutTexture = null;

function drawStar(context, x, y, outer, inner) {
  context.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) {
      context.moveTo(px, py);
    } else {
      context.lineTo(px, py);
    }
  }
  context.closePath();
  context.fill();
}

function getKnockoutTexture() {
  if (knockoutTexture) {
    return knockoutTexture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 256, 128);
  context.fillStyle = '#ffe36a';
  drawStar(context, 48, 72, 28, 12);
  drawStar(context, 128, 46, 36, 15);
  drawStar(context, 208, 74, 26, 11);
  knockoutTexture = new THREE.CanvasTexture(canvas);
  knockoutTexture.colorSpace = THREE.SRGBColorSpace;
  return knockoutTexture;
}

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
    this.healthSprite = null;
    this.stars = null;
    this.starSpin = 0;
    this.flashTime = 0;
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

  hideThiefIcon() {
    if (this.icon) {
      this.icon.visible = false;
    }
  }

  showHealth(ratio) {
    if (!this.healthSprite) {
      this.healthSprite = this.createHealthBar();
      this.group.add(this.healthSprite);
    }
    this.healthSprite.visible = true;
    const shown = Math.round(Math.min(1, Math.max(0, ratio)) * 20) / 20;
    if (this.healthValue !== shown) {
      this.drawHealth(shown);
      this.healthValue = shown;
    }
  }

  hideHealth() {
    if (this.healthSprite) {
      this.healthSprite.visible = false;
    }
  }

  showKnockedOut() {
    if (!this.stars) {
      this.stars = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getKnockoutTexture(),
        transparent: true,
        depthTest: false
      }));
      this.stars.name = 'knockout-stars';
      this.stars.position.y = 1.22;
      this.stars.scale.set(0.72, 0.36, 1);
      this.group.add(this.stars);
    }
    this.stars.visible = true;
    this.starSpin = 0;
  }

  hideKnockedOut() {
    if (this.stars) {
      this.stars.visible = false;
    }
  }

  flashHit() {
    this.flashTime = 0.12;
  }

  tick(dt) {
    if (this.stars?.visible) {
      this.starSpin += dt * 2.6;
      this.stars.material.rotation = this.starSpin;
      const pulse = 1 + Math.sin(this.starSpin * 2.2) * 0.08;
      this.stars.scale.set(0.72 * pulse, 0.36 * pulse, 1);
      this.stars.position.y = 1.22 + Math.sin(this.starSpin * 1.5) * 0.04;
    }
    if (this.flashTime <= 0 || !this.thiefMaterials) {
      return;
    }
    this.flashTime -= dt;
    const flashing = this.flashTime > 0;
    for (let i = 0; i < this.thiefMaterials.length; i += 1) {
      const material = this.thiefMaterials[i];
      if (!material.emissive) {
        continue;
      }
      material.emissive.setHex(flashing ? 0xfff1c9 : 0xff2a2a);
      material.emissiveIntensity = flashing ? 1.35 : 0.7;
    }
  }

  createHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.healthCanvas = canvas;
    this.healthTexture = texture;
    this.healthValue = -1;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    }));
    sprite.position.y = 1.78;
    sprite.scale.set(0.62, 0.16, 1);
    sprite.name = 'thief-health';
    sprite.visible = false;
    return sprite;
  }

  drawHealth(ratio) {
    const context = this.healthCanvas.getContext('2d');
    context.clearRect(0, 0, 128, 32);
    context.fillStyle = 'rgba(18, 24, 32, 0.85)';
    context.fillRect(4, 8, 120, 16);
    context.fillStyle = ratio > 0.35 ? '#7dffb2' : '#ff5a5a';
    context.fillRect(6, 10, 116 * ratio, 12);
    this.healthTexture.needsUpdate = true;
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
    if (this.healthSprite) {
      this.healthSprite.removeFromParent();
      this.healthSprite.material.dispose();
      this.healthTexture.dispose();
    }
    if (this.stars) {
      this.stars.removeFromParent();
      this.stars.material.dispose();
    }
  }
}
