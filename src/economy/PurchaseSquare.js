import * as THREE from 'three';
import { paletteHex, StorePalette } from '../theme/storePalette.js';

function titleLines(name) {
  const words = String(name || 'BUY').toUpperCase().split(' ').filter(Boolean);
  if (words.length <= 2) {
    return words.length > 0 ? words : ['BUY'];
  }
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

export class PurchaseSquare {
  constructor(offer) {
    this.halfX = offer.halfX ?? offer.half;
    this.halfZ = offer.halfZ ?? offer.half;
    this.half = offer.half;
    this.lines = titleLines(offer.label);
    this.accent = offer.accent;
    this.meter = offer.meter === 'hold' ? 'hold' : 'price';
    this.signature = '';
    this.time = 0;
    this.mode = 'idle';

    this.root = new THREE.Group();
    this.root.name = `purchase-${offer.id}`;
    this.root.position.set(offer.x, 0, offer.z);

    const spanX = this.halfX * 2;
    const spanZ = this.halfZ * 2;
    this.spanX = spanX;
    this.spanZ = spanZ;
    this.wide = spanX / spanZ > 1.35;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.wide ? 1024 : 512;
    this.canvas.height = this.wide ? Math.round(1024 * (spanZ / spanX)) : 512;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.labelMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
    this.base = new THREE.Mesh(new THREE.PlaneGeometry(spanX, spanZ), this.labelMaterial);
    this.base.rotation.x = -Math.PI / 2;
    this.base.position.y = 0.07;
    this.base.renderOrder = 3;

    const y = 0.08;
    const edgeX = this.halfX * 0.98;
    const edgeZ = this.halfZ * 0.98;
    const outlineGeometry = new THREE.BufferGeometry();
    outlineGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        -edgeX, y, -edgeZ,
        edgeX, y, -edgeZ,
        edgeX, y, edgeZ,
        -edgeX, y, edgeZ
      ], 3)
    );
    this.outline = new THREE.LineLoop(
      outlineGeometry,
      new THREE.LineBasicMaterial({ color: offer.accent, transparent: true, opacity: 0.95 })
    );
    this.outline.renderOrder = 4;

    this.root.add(this.base, this.outline);
    this.paint(0, offer.price, 'idle');
  }

  setState(paid, price, mode) {
    if (mode === 'paused') {
      this.outline.material.color.setHex(StorePalette.danger);
    } else if (mode === 'paying') {
      this.outline.material.color.setHex(StorePalette.uiGold);
    } else {
      this.outline.material.color.setHex(this.accent);
    }
    this.paint(paid, price, mode);
    this.mode = mode;
  }

  update(dt) {
    this.time += dt;
    const paying = this.mode === 'paying';
    const pulse = paying ? 0.75 + Math.sin(this.time * 10) * 0.25 : 0.55 + Math.sin(this.time * 3) * 0.12;
    this.outline.material.opacity = this.mode === 'paused' ? 0.95 : pulse;
  }

  paint(paid, price, mode) {
    const signature = `${paid}|${price}|${mode}|${this.lines.join('/')}`;
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;
    const ctx = this.canvas.getContext('2d');
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(32, 40, 62, 0.94)';
    ctx.fillRect(0, 0, width, height);

    const progress = price > 0 ? Math.max(0, Math.min(1, paid / price)) : 1;
    if (progress > 0) {
      ctx.fillStyle = mode === 'paused' ? 'rgba(244, 126, 121, 0.9)' : 'rgba(255, 202, 69, 0.92)';
      const fillHeight = height * progress;
      ctx.fillRect(0, height - fillHeight, width, fillHeight);
    }

    ctx.strokeStyle = paletteHex(mode === 'paused' ? StorePalette.danger : StorePalette.uiGold);
    ctx.lineWidth = 28;
    ctx.strokeRect(18, 18, width - 36, height - 36);

    ctx.fillStyle = paletteHex(StorePalette.uiText);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.meter === 'hold') {
      ctx.font = '800 68px system-ui, sans-serif';
      const titleTop = this.lines.length > 1 ? 0.3 : 0.36;
      for (let i = 0; i < this.lines.length; i += 1) {
        ctx.fillText(this.lines[i], width / 2, height * (titleTop + i * 0.14));
      }
      if (progress <= 0) {
        ctx.font = '800 48px system-ui, sans-serif';
        ctx.fillStyle = paletteHex(StorePalette.uiGold);
        ctx.fillText('STAND', width / 2, height * 0.74);
      }
      this.texture.needsUpdate = true;
      return;
    }
    if (this.wide) {
      ctx.font = '800 92px system-ui, sans-serif';
      ctx.fillText(this.lines.join(' '), width / 2, height * 0.38);
      ctx.font = '800 84px system-ui, sans-serif';
      const detail = mode === 'paused' && paid > 0
        ? `${paid} / ${price}  NEED COINS`
        : paid > 0
          ? `${paid} / ${price}`
          : `$${price}`;
      ctx.fillStyle = paletteHex(mode === 'paused' ? StorePalette.danger : StorePalette.uiText);
      ctx.fillText(detail, width / 2, height * 0.72);
    } else {
      ctx.font = '800 68px system-ui, sans-serif';
      const titleTop = this.lines.length > 1 ? 0.28 : 0.34;
      for (let i = 0; i < this.lines.length; i += 1) {
        ctx.fillText(this.lines[i], width / 2, height * (titleTop + i * 0.13));
      }
      ctx.font = '800 78px system-ui, sans-serif';
      if (mode === 'paused' && paid > 0) {
        ctx.fillStyle = paletteHex(StorePalette.uiText);
        ctx.fillText(`${paid} / ${price}`, width / 2, height * 0.68);
        ctx.font = '800 46px system-ui, sans-serif';
        ctx.fillText('NEED COINS', width / 2, height * 0.82);
      } else if (paid > 0) {
        ctx.fillStyle = paletteHex(StorePalette.uiText);
        ctx.fillText(`${paid} / ${price}`, width / 2, height * 0.72);
      } else {
        ctx.fillStyle = paletteHex(mode === 'paused' ? StorePalette.danger : StorePalette.uiGold);
        ctx.fillText(`$${price}`, width / 2, height * 0.72);
      }
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (let i = 0; i < materials.length; i += 1) {
        materials[i]?.map?.dispose();
        materials[i]?.dispose();
      }
    });
  }
}
