import * as THREE from 'three';
import { paletteHex, StorePalette } from '../theme/storePalette.js';

function colorWithAlpha(color, alpha) {
  const red = (color >> 16) & 255;
  const green = (color >> 8) & 255;
  const blue = color & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

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
    this.outline.material.color.setHex(mode === 'paused' ? StorePalette.danger : this.accent);
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
      ctx.fillStyle = mode === 'paused' ? 'rgba(244, 126, 121, 0.9)' : colorWithAlpha(this.accent, 0.92);
      const fillHeight = height * progress;
      ctx.fillRect(0, height - fillHeight, width, fillHeight);
    }

    ctx.strokeStyle = paletteHex(mode === 'paused' ? StorePalette.danger : this.accent);
    ctx.lineWidth = 28;
    ctx.strokeRect(18, 18, width - 36, height - 36);

    ctx.fillStyle = paletteHex(StorePalette.uiText);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const drawLine = (text, y, size, min, fill) => {
      const label = String(text);
      const maxWidth = width - 96;
      let next = size;
      while (next > min) {
        ctx.font = `800 ${next}px system-ui, sans-serif`;
        if (ctx.measureText(label).width <= maxWidth) {
          break;
        }
        next -= 2;
      }
      ctx.font = `800 ${next}px system-ui, sans-serif`;
      const measured = ctx.measureText(label).width;
      const scale = measured > maxWidth && maxWidth > 0 ? maxWidth / measured : 1;
      ctx.save();
      ctx.translate(width / 2, y);
      ctx.scale(scale, 1);
      ctx.fillStyle = fill;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    };
    if (this.meter === 'hold') {
      const titleTop = this.lines.length > 1 ? 0.3 : 0.36;
      for (let i = 0; i < this.lines.length; i += 1) {
        drawLine(this.lines[i], height * (titleTop + i * 0.14), 64, 18, paletteHex(StorePalette.uiText));
      }
      if (progress <= 0) {
        drawLine('STAND', height * 0.74, 44, 16, paletteHex(this.accent));
      }
      this.texture.needsUpdate = true;
      return;
    }
    if (this.wide) {
      drawLine(this.lines.join(' '), height * 0.38, 84, 22, paletteHex(StorePalette.uiText));
      const detail = mode === 'paused' && paid > 0
        ? `${paid} / ${price}  NEED COINS`
        : paid > 0
          ? `${paid} / ${price}`
          : `$${price}`;
      drawLine(detail, height * 0.72, 76, 20, paletteHex(mode === 'paused' ? StorePalette.danger : StorePalette.uiText));
    } else {
      const titleTop = this.lines.length > 1 ? 0.28 : 0.34;
      for (let i = 0; i < this.lines.length; i += 1) {
        drawLine(this.lines[i], height * (titleTop + i * 0.13), 60, 18, paletteHex(StorePalette.uiText));
      }
      if (mode === 'paused' && paid > 0) {
        drawLine(`${paid} / ${price}`, height * 0.68, 64, 18, paletteHex(StorePalette.uiText));
        drawLine('NEED COINS', height * 0.82, 40, 16, paletteHex(StorePalette.uiText));
      } else if (paid > 0) {
        drawLine(`${paid} / ${price}`, height * 0.72, 64, 18, paletteHex(StorePalette.uiText));
      } else {
        drawLine(`$${price}`, height * 0.72, 68, 20, paletteHex(mode === 'paused' ? StorePalette.danger : this.accent));
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
