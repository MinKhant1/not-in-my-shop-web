import * as THREE from 'three';
import { UpgradeInvestment } from './UpgradeInvestment.js';

function titleLines(name) {
  const words = String(name || 'UPGRADE').split(' ').filter(Boolean);
  if (words.length <= 2) {
    return words.length > 0 ? words : ['UPGRADE'];
  }
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

export class UpgradePad {
  constructor(scene, money, shopUpgrades, spec, interval) {
    this.money = money;
    this.shopUpgrades = shopUpgrades;
    this.id = spec.id;
    this.name = spec.name;
    this.x = spec.position[0];
    this.z = spec.position[1];
    this.half = spec.halfSize ?? 0.75;
    this.interval = interval;
    this.onPurchase = spec.onPurchase;
    this.investment = new UpgradeInvestment(spec.cost);
    this.signature = '';
    this.finishTimer = 0;
    this.time = 0;
    this.triggerEnabled = false;
    this.removed = this.shopUpgrades.owns(this.id);
    if (this.removed) {
      this.investment.purchased = true;
      this.investment.invested = this.investment.cost;
    }

    this.root = new THREE.Group();
    this.root.name = `upgrade-${this.id}`;
    this.root.position.set(this.x, 0, this.z);
    this.root.visible = false;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 512;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.signMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
    const size = this.half * 2;
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.signMaterial);
    this.sign.name = 'groundVisual';
    this.sign.rotation.x = -Math.PI / 2;
    this.sign.position.set(0, 0.04, 0);

    this.outline = this.createOutline();
    this.root.add(this.outline, this.sign);
    scene.add(this.root);
    this.redraw();
  }

  createOutline() {
    const half = this.half;
    const y = 0.045;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        -half, y, -half,
        half, y, -half,
        half, y, half,
        -half, y, half
      ], 3)
    );
    const material = new THREE.LineBasicMaterial({
      color: 0xf0b429,
      transparent: true,
      opacity: 0.42
    });
    const line = new THREE.LineLoop(geometry, material);
    line.name = 'triggerZone';
    return line;
  }

  contains(x, z) {
    if (!this.triggerEnabled || this.removed) {
      return false;
    }
    return Math.abs(x - this.x) <= this.half && Math.abs(z - this.z) <= this.half;
  }

  update(dt, accepting, x, z) {
    if (this.removed) {
      this.root.visible = false;
      this.triggerEnabled = false;
      return;
    }
    if (this.investment.purchased) {
      this.playFinish(dt);
      return;
    }

    const shown = accepting === true;
    this.triggerEnabled = shown;
    this.root.visible = shown;
    const inside = this.contains(x, z);
    const result = this.investment.tick(this.money, dt, inside, this.interval);
    if (result === 'purchased') {
      this.shopUpgrades.markPurchased(this.id);
      this.onPurchase?.();
      this.finishTimer = 0.35;
      this.triggerEnabled = false;
    }
    if (shown) {
      this.redraw();
      this.time += dt;
      const depositing = inside && this.investment.invested > 0;
      const pulse = depositing ? 1 + Math.sin(this.time * 12) * 0.03 : 1;
      this.sign.scale.set(pulse, pulse, 1);
      this.outline.material.opacity = depositing ? 0.7 : 0.42;
    }
  }

  playFinish(dt) {
    this.triggerEnabled = false;
    if (this.finishTimer <= 0) {
      this.removed = true;
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.finishTimer -= dt;
    const life = Math.max(0, this.finishTimer / 0.35);
    const scale = 1 + (1 - life) * 0.12;
    this.sign.scale.set(scale, scale, 1);
    this.signMaterial.opacity = life;
    if (this.finishTimer <= 0) {
      this.removed = true;
      this.root.visible = false;
    }
  }

  redraw() {
    const invested = this.investment.invested;
    const cost = this.investment.cost;
    const signature = `${invested}|${cost}`;
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;
    const ctx = this.canvas.getContext('2d');
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#17202b';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#f0b429';
    ctx.lineWidth = 28;
    ctx.strokeRect(18, 18, width - 36, height - 36);

    const lines = titleLines(this.name);
    ctx.fillStyle = '#fff6e4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 78px system-ui, sans-serif';
    const titleTop = lines.length > 1 ? 0.28 : 0.34;
    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], width / 2, height * (titleTop + i * 0.14));
    }

    const barX = 64;
    const barY = height * 0.62;
    const barW = width - 128;
    const barH = 46;
    ctx.fillStyle = '#0c1218';
    ctx.fillRect(barX, barY, barW, barH);
    const progress = cost > 0 ? invested / cost : 1;
    ctx.fillStyle = '#f0b429';
    ctx.fillRect(barX, barY, Math.max(0, barW * progress), barH);

    const label = invested > 0 ? `${invested} / ${cost}` : `${cost} COINS`;
    ctx.font = '800 84px system-ui, sans-serif';
    ctx.fillStyle = '#f0b429';
    ctx.fillText(label, width / 2, height * 0.82);
    this.texture.needsUpdate = true;
  }
}
