import * as THREE from 'three';
import { UpgradeInvestment } from './UpgradeInvestment.js';
import { paletteHex, StorePalette } from '../theme/storePalette.js';

const PAY_SECONDS = 3;

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
    this.audio = spec.audio ?? null;
    this.circular = spec.circular === true;
    this.markerColor = spec.color ?? StorePalette.upgradeMarker;
    this.filled = Number.isFinite(spec.color);
    this.retainWhenOwned = spec.retainWhenOwned === true;
    this.hiredText = spec.hiredText === undefined ? 'HIRED' : spec.hiredText;
    this.brokeText = spec.brokeText || '';
    this.hiredLines = Array.isArray(spec.hiredLines) ? spec.hiredLines : null;
    this.detail = spec.detail || '';
    this.summary = spec.summary || '';
    this.showFloorTitle = spec.showFloorTitle === true;
    this.floorLines = Array.isArray(spec.floorLines) ? spec.floorLines : null;
    this.closed = false;
    this.closedLines = Array.isArray(spec.closedLines) ? spec.closedLines : ['NOT HUNGRY', 'TONIGHT'];
    this.showCostLabel = spec.showCostLabel !== false;
    this.requireFull = spec.requireFull === true;
    this.banner = spec.banner === true;
    this.manual = spec.manual === true;
    this.investment = new UpgradeInvestment(spec.cost, PAY_SECONDS);
    this.signature = '';
    this.labelSignature = '';
    this.finishTimer = 0;
    this.time = 0;
    this.triggerEnabled = false;
    this.hired = !this.manual && this.retainWhenOwned && this.shopUpgrades.owns(this.id);
    this.removed = !this.manual && this.shopUpgrades.owns(this.id) && !this.retainWhenOwned;
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
      color: this.markerColor,
      transparent: true,
      opacity: 0.42
    });
    const line = new THREE.LineLoop(geometry, material);
    line.name = 'triggerZone';
    return line;
  }

  covers(x, z) {
    if (!this.circular || !this.root.visible || this.removed || this.closed) {
      return false;
    }
    const dx = x - this.x;
    const dz = z - this.z;
    return dx * dx + dz * dz <= this.half * this.half;
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
    if (this.editorReveal) {
      this.root.visible = true;
      this.triggerEnabled = false;
      return;
    }
    if (this.closed) {
      this.triggerEnabled = false;
      this.root.visible = accepting === true;
      if (this.root.visible) {
        this.paintClosed();
      }
      return;
    }
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
      this.audio?.win();
      if (!this.manual) {
        this.shopUpgrades.markPurchased(this.id);
      }
      const followUp = this.onPurchase?.();
      if (followUp === 'again') {
        return;
      }
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

  configure({ name, cost, hired, summary }) {
    if (name) {
      this.name = name;
    }
    if (summary !== undefined) {
      this.summary = summary;
    }
    this.investment = new UpgradeInvestment(cost ?? this.investment.cost, PAY_SECONDS);
    this.hired = hired === true;
    this.closed = false;
    this.removed = false;
    this.signature = '';
    this.labelSignature = '';
    this.finishTimer = 0;
    if (this.outline?.material?.color) {
      this.outline.material.color.setHex(this.hired ? StorePalette.success : this.markerColor);
      this.outline.material.opacity = this.hired ? 0.8 : 0.42;
    }
    if (this.signMaterial) {
      this.signMaterial.opacity = 1;
    }
    this.sign?.scale.set(1, 1, 1);
    if (this.hired) {
      this.paintHired();
      return;
    }
    this.redraw();
  }

  // Clears a finished purchase so a new shop can offer the upgrade again.
  reopen() {
    this.configure({
      name: this.name,
      cost: this.investment.cost,
      hired: false
    });
    this.triggerEnabled = false;
    this.root.visible = false;
  }

  innerHalf(y) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (!this.circular) {
      return width / 2 - 72;
    }
    const radius = width / 2 - 58;
    const dy = y - height / 2;
    const span = radius * radius - dy * dy;
    return span > 0 ? Math.max(16, Math.sqrt(span) - 8) : 16;
  }

  drawFittedText(ctx, text, y, size, min, weight, fill, stroke) {
    const label = String(text);
    const maxWidth = this.innerHalf(y) * 2;
    let next = size;
    while (next > min) {
      ctx.font = `${weight} ${next}px system-ui, sans-serif`;
      if (ctx.measureText(label).width <= maxWidth) {
        break;
      }
      next -= 2;
    }
    ctx.font = `${weight} ${next}px system-ui, sans-serif`;
    const measured = ctx.measureText(label).width;
    const scale = measured > maxWidth && maxWidth > 0 ? maxWidth / measured : 1;
    ctx.save();
    ctx.translate(this.canvas.width / 2, y);
    ctx.scale(scale, 1);
    if (stroke) {
      ctx.lineWidth = Math.max(4, next * 0.14);
      ctx.strokeStyle = stroke;
      ctx.strokeText(label, 0, 0);
    }
    ctx.fillStyle = fill;
    ctx.fillText(label, 0, 0);
    ctx.restore();
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
    ctx.fillStyle = paletteHex(this.filled ? this.markerColor : StorePalette.uiBackground);
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = this.filled ? '#ffffff' : paletteHex(this.markerColor);
    ctx.lineWidth = 28;
    if (this.circular) {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, width / 2 - 20, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(18, 18, width - 36, height - 36);
    }

    ctx.fillStyle = paletteHex(StorePalette.uiText);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!this.circular || this.showFloorTitle) {
      const lines = this.floorLines?.length ? this.floorLines : titleLines(this.name);
      const stacked = lines.length > 2;
      const fontSize = this.circular ? (stacked ? 44 : 50) : 72;
      const titleTop = this.circular
        ? (stacked ? 0.28 : lines.length > 1 ? 0.3 : 0.34)
        : (stacked ? 0.22 : lines.length > 1 ? 0.28 : 0.34);
      const step = this.circular ? 0.1 : (stacked ? 0.11 : 0.13);
      for (let i = 0; i < lines.length; i += 1) {
        const y = height * (titleTop + i * step);
        this.drawFittedText(ctx, lines[i], y, fontSize, 18, '800', this.filled ? '#ffffff' : paletteHex(StorePalette.uiText), this.filled ? '#1b2233' : '');
      }
    }
    if (this.detail) {
      const detailY = height * (this.floorLines?.length ? 0.52 : 0.48);
      this.drawFittedText(
        ctx,
        this.detail,
        detailY,
        36,
        16,
        '700',
        this.filled ? '#ffffff' : paletteHex(StorePalette.woodHighlight),
        this.filled ? '#1b2233' : ''
      );
    }

    const barH = this.circular ? 34 : 46;
    const barY = height * (this.circular ? 0.56 : 0.62);
    const barW = Math.min(width - 128, this.innerHalf(barY + barH / 2) * 2 - 16);
    const barX = (width - barW) / 2;
    ctx.fillStyle = this.filled ? 'rgba(27, 34, 51, 0.35)' : paletteHex(StorePalette.uiBackgroundSecondary);
    ctx.fillRect(barX, barY, barW, barH);
    const progress = cost > 0 ? invested / cost : 1;
    ctx.fillStyle = this.filled ? '#ffffff' : paletteHex(this.markerColor);
    ctx.fillRect(barX, barY, Math.max(0, barW * progress), barH);

    if (this.showCostLabel) {
      const label = invested > 0 ? `${invested} / ${cost}` : `$${cost}`;
      const priceY = height * (this.circular ? 0.74 : 0.82);
      this.drawFittedText(
        ctx,
        label,
        priceY,
        this.circular ? 64 : 80,
        20,
        '800',
        this.filled ? '#ffffff' : paletteHex(this.markerColor),
        this.filled ? '#1b2233' : ''
      );
    }
    this.texture.needsUpdate = true;
  }

  markClosed() {
    this.closed = true;
    this.removed = false;
    this.triggerEnabled = false;
    this.finishTimer = 0;
    this.signature = '';
    if (this.signMaterial) {
      this.signMaterial.opacity = 1;
    }
    this.sign?.scale.set(1, 1, 1);
  }

  paintClosed() {
    const signature = 'closed';
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;
    const ctx = this.canvas.getContext('2d');
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = paletteHex(this.markerColor);
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 28;
    if (this.circular) {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, width / 2 - 20, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(18, 18, width - 36, height - 36);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nameLines = this.floorLines?.length ? this.floorLines : titleLines(this.name);
    for (let i = 0; i < nameLines.length; i += 1) {
      this.drawFittedText(ctx, nameLines[i], height * (0.28 + i * 0.12), 52, 16, '800', '#ffffff', '#1b2233');
    }
    const note = this.closedLines;
    for (let i = 0; i < note.length; i += 1) {
      this.drawFittedText(ctx, note[i], height * (0.62 + i * 0.12), 42, 16, '800', '#ffffff', '#1b2233');
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
    ctx.fillStyle = paletteHex(StorePalette.uiBackground);
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = paletteHex(StorePalette.success);
    ctx.lineWidth = 28;
    if (this.circular) {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, width / 2 - 20, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(18, 18, width - 36, height - 36);
    }
    ctx.fillStyle = paletteHex(StorePalette.success);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.hiredLines?.length) {
      const top = this.hiredLines.length > 1 ? 0.4 : 0.5;
      for (let i = 0; i < this.hiredLines.length; i += 1) {
        const last = i === this.hiredLines.length - 1;
        this.drawFittedText(
          ctx,
          this.hiredLines[i],
          height * (top + i * 0.18),
          last ? 64 : 56,
          18,
          '800',
          paletteHex(last ? StorePalette.success : StorePalette.uiText),
          ''
        );
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
      this.outline.material.color.setHex(StorePalette.success);
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
    ctx.fillStyle = 'rgba(32, 40, 62, 0.92)';
    ctx.fillRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
    ctx.fillStyle = paletteHex(StorePalette.uiText);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 52px system-ui, sans-serif';
    ctx.fillText(text, this.labelCanvas.width / 2, this.labelCanvas.height / 2);
    this.labelTexture.needsUpdate = true;
  }
}
