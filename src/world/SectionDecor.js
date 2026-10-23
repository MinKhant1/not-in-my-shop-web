import * as THREE from 'three';
import { paletteHex, StorePalette } from '../theme/storePalette.js';

function basic(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function signTexture(title, accent) {
  return canvasTexture(512, 160, (ctx, width, height) => {
    ctx.fillStyle = paletteHex(StorePalette.uiBackground);
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = paletteHex(accent);
    ctx.fillRect(0, 0, 18, height);
    ctx.fillRect(width - 18, 0, 18, height);
    ctx.fillStyle = paletteHex(StorePalette.uiText);
    ctx.font = '800 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(title || '').toUpperCase(), width / 2, height / 2 + 2);
  });
}

function plaqueTexture(label) {
  return canvasTexture(256, 96, (ctx, width, height) => {
    ctx.fillStyle = 'rgba(32, 40, 62, 0.9)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = paletteHex(StorePalette.uiGold);
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, width - 12, height - 12);
    ctx.fillStyle = paletteHex(StorePalette.uiText);
    ctx.font = '700 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, width / 2, height / 2);
  });
}

export function createDecor(entry) {
  if (entry.decor === 'tint') {
    const [width, depth] = entry.size;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), basic(entry.accent, 0.16));
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = entry.id;
    mesh.renderOrder = 1;
    return mesh;
  }

  if (entry.decor === 'seam') {
    const [width, depth] = entry.size;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), basic(StorePalette.wallTrim, 0.45));
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = entry.id;
    mesh.renderOrder = 2;
    return mesh;
  }

  if (entry.decor === 'baseboard') {
    const [width, height, depth] = entry.size;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), basic(entry.accent, 0.95));
    mesh.position.y = height / 2;
    mesh.name = entry.id;
    return mesh;
  }

  if (entry.decor === 'sign') {
    const material = new THREE.MeshBasicMaterial({
      map: signTexture(entry.title, entry.accent),
      transparent: true,
      depthWrite: true
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), material);
    mesh.name = entry.id;
    return mesh;
  }

  const group = new THREE.Group();
  group.name = entry.id;
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.26),
    new THREE.MeshBasicMaterial({
      map: plaqueTexture(entry.label || 'LATER'),
      transparent: true,
      depthWrite: false
    })
  );
  plaque.position.y = 0.22;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 20),
    basic(StorePalette.inactive, 0.28)
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  group.add(shadow, plaque);
  return group;
}

export function createPurchaseMarker(fixture, accent) {
  const group = new THREE.Group();
  group.name = `marker-${fixture.id}`;
  const [x, , z] = fixture.position;
  group.position.set(x, 0, z);

  const [width, depth] = fixture.footprint;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.045, depth),
    basic(accent, 0.16)
  );
  slab.position.y = 0.04;
  slab.name = 'marker-slab';

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.36, 28),
    basic(accent, 0.72)
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.name = 'marker-ring';

  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.46, 0.07),
    basic(accent, 0.4)
  );
  post.position.y = 0.28;
  post.name = 'marker-post';

  group.add(slab, ring, post);
  return { object: group, ring };
}
