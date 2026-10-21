import * as THREE from 'three';
import { UpgradeInvestment } from './UpgradeInvestment.js';

function titleLines(name) {
  const words = String(name || 'UPGRADE').split(' ').filter(Boolean);
  if (words.length <= 3) {
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
    this.circular = spec.circular === true;
    this.retainWhenOwned = spec.retainWhenOwned === true;
    this.hiredText = spec.hiredText === undefined ? 'HIRED' : spec.hiredText;
    this.brokeText = spec.brokeText || '';
    this.hiredLines = Array.isArray(spec.hiredLines) ? spec.hiredLines : null;
    this.showFloorTitle = spec.showFloorTitle === true;
    this.showCostLabel = spec.showCostLabel !== false;
    this.requireFull = spec.requireFull === true;
    this.banner = spec.banner === true;
    this.investment = new UpgradeInvestment(spec.cost);
    this.signature = '';
    this.labelSignature = '';
    this.finishTimer = 0;
    this.time = 0;
    this.triggerEnabled = false;
    this.hired = this.retainWhenOwned && this.shopUpgrades.owns(this.id);
    this.removed = this.shopUpgrades.owns(this.id) && !this.retainWhenOwned;
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
    const geometry = this.circular
      ? new THREE.CircleGeometry(this.half, 32)
      : new THREE.PlaneGeometry(size, size);
    this.sign = new THREE.Mesh(geometry, this.signMaterial);
    this.sign.name = 'groundVisual';
    this.sign.rotation.x = -Math.PI / 2;
    this.sign.position.set(0, 0.04, 0);

    this.outline = this.createOutline();
    this.root.add(this.outline, this.sign);
    if (this.banner) {
      this.label = this.createBanner();
      this.root.add(this.label);
    }
    scene.add(this.root);
    if (this.hired) {
      this.paintHired();
    } else {
      this.redraw();
    }
  }

  setPosition(x, z) {
    this.x = x;
    this.z = z;
    this.root.position.set(x, 0, z);
  }

  createBanner() {
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 1024;
    this.labelCanvas.height = 160;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: this.labelTexture,
      transparent: true,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = 'upgrade-banner';
    sprite.position.set(0, 1.35, 0);
    sprite.scale.set(2.7, 0.42, 1);
    return sprite;
  }

  createOutline() {
    const half = this.half;
    const y = 0.045;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    if (this.circular) {
      const segments = 28;
      for (let i = 0; i < segments; i += 1) {
        const angle = (i / segments) * Math.PI * 2;
        positions.push(Math.cos(angle) * half, y, Math.sin(angle) * half);
      }
    } else {
      positions.push(
        -half, y, -half,
        half, y, -half,
        half, y, half,
        -half, y, half
      );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
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
    if (!this.triggerEnabled || this.removed || this.hired) {
      return false;
    }
    const dx = x - this.x;
    const dz = z - this.z;
    if (this.circular) {
      return dx * dx + dz * dz <= this.half * this.half;
    }
    return Math.abs(dx) <= this.half && Math.abs(dz) <= this.half;
  }

  update(dt, accepting, x, z) {
    if (this.hired) {
      this.triggerEnabled = false;
      this.root.visible = accepting === true;
      if (this.root.visible) {
        this.paintHired();
      }
      return;
    }
    if (this.removed) {
      this.root.visible = false;
      this.triggerEnabled = false;
      return;
    }
    if (this.investment.purchased) {
      if (this.retainWhenOwned) {
        this.hired = true;
        this.triggerEnabled = false;
        this.root.visible = accepting === true;
        if (this.root.visible) {
          this.paintHired();
        }
        return;
      }
      this.playFinish(dt);
      return;
    }

    const shown = accepting === true;
    this.triggerEnabled = shown;
    this.root.visible = shown;
    const inside = this.contains(x, z);
    const remaining = this.investment.cost - this.investment.invested;
    const broke = this.requireFull && inside && this.money.getMoney() < remaining;
    const result = this.investment.tick(this.money, dt, inside, this.interval, broke);
    if (result === 'purchased') {
      this.shopUpgrades.markPurchased(this.id);
      this.onPurchase?.();
      this.triggerEnabled = false;
      if (this.retainWhenOwned) {
        this.hired = true;
        this.root.visible = accepting === true;
        if (this.root.visible) {
          this.paintHired();
        }
        return;
      }
      this.finishTimer = 0.35;
    }
    if (shown) {
      this.paintBanner(broke ? this.brokeText : `${this.name} — $${this.investment.cost}`);
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
    if (this.circular) {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, width / 2 - 20, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(18, 18, width - 36, height - 36);
    }

    ctx.fillStyle = '#fff6e4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!this.circular || this.showFloorTitle) {
      const lines = titleLines(this.name);
      const stacked = lines.length > 2;
      const fontSize = this.circular ? (stacked ? 52 : 58) : 78;
      ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
      const titleTop = stacked ? 0.22 : lines.length > 1 ? 0.28 : 0.34;
      const step = stacked ? 0.12 : 0.14;
      for (let i = 0; i < lines.length; i += 1) {
        ctx.fillText(lines[i], width / 2, height * (titleTop + i * step));
      }
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

    if (this.showCostLabel) {
      const label = invested > 0 ? `${invested} / ${cost}` : `$${cost}`;
      ctx.font = '800 84px system-ui, sans-serif';
      ctx.fillStyle = '#f0b429';
      ctx.fillText(label, width / 2, height * 0.82);
    }
    this.texture.needsUpdate = true;
  }

  paintHired() {
    const signature = 'hired';
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
    ctx.strokeStyle = '#7dcea0';
    ctx.lineWidth = 28;
    if (this.circular) {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, width / 2 - 20, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(18, 18, width - 36, height - 36);
    }
    ctx.fillStyle = '#7dcea0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.hiredLines?.length) {
      ctx.fillStyle = '#fff6e4';
      ctx.font = '800 64px system-ui, sans-serif';
      const top = this.hiredLines.length > 1 ? 0.4 : 0.5;
      for (let i = 0; i < this.hiredLines.length; i += 1) {
        if (i === this.hiredLines.length - 1) {
          ctx.fillStyle = '#7dcea0';
          ctx.font = '800 72px system-ui, sans-serif';
        }
        ctx.fillText(this.hiredLines[i], width / 2, height * (top + i * 0.22));
      }
    } else {
      ctx.font = '800 180px system-ui, sans-serif';
      ctx.fillText('✓', width / 2, height / 2);
    }
    this.texture.needsUpdate = true;
    if (this.label) {
      if (this.hiredText) {
        this.label.visible = true;
        this.paintBanner(this.hiredText);
      } else {
        this.label.visible = false;
      }
    }
    if (this.outline?.material?.color) {
      this.outline.material.color.setHex(0x7dcea0);
      this.outline.material.opacity = 0.8;
    }
  }

  paintBanner(text) {
    if (!this.labelCanvas || !text || text === this.labelSignature) {
      return;
    }
    this.labelSignature = text;
    const ctx = this.labelCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
    ctx.fillStyle = 'rgba(23, 32, 43, 0.92)';
    ctx.fillRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
    ctx.fillStyle = '#fff6e4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 52px system-ui, sans-serif';
    ctx.fillText(text, this.labelCanvas.width / 2, this.labelCanvas.height / 2);
    this.labelTexture.needsUpdate = true;
  }
}
