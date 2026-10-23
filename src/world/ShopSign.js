import * as THREE from 'three';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';

const FONT = new Font(fontJson);
const NEON = 0xff6a3d;
const TEXT_SIZE = 0.15;
const TEXT_DEPTH = 0.03;
const MAX_WIDTH = 1.62;
const BOARD_DEPTH = 0.045;

export const DEFAULT_SHOP_NAME = 'MY SHOP';
export const SHOP_NAME_LIMIT = 20;
export const DEFAULT_SIGN_TRANSFORM = {
  position: [-3.662, 1.558, 0.607],
  rotation: [0, -Math.PI / 2, 0],
  scale: [3, 3, 3]
};

export function cleanShopName(value) {
  const glyphs = FONT.data?.glyphs ?? {};
  const source = String(value ?? '').replace(/\s+/g, ' ').trim();
  let name = '';
  for (let i = 0; i < source.length && name.length < SHOP_NAME_LIMIT; i += 1) {
    const char = source[i];
    if (char === ' ' || glyphs[char]) {
      name += char;
    }
  }
  return name.trim().slice(0, SHOP_NAME_LIMIT);
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function sameVec(left, right) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function sameTransform(left, right) {
  return sameVec(left.position, right.position)
    && sameVec(left.rotation, right.rotation)
    && sameVec(left.scale, right.scale);
}

export class ShopSign {
  constructor(scene, save) {
    this.save = save;
    this.name = '';
    this.scene = scene;
    this.letterMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a1210,
      emissive: NEON,
      emissiveIntensity: 0.32,
      roughness: 0.32,
      metalness: 0.04,
      toneMapped: false
    });
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: NEON,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    this.boardMaterial = new THREE.MeshStandardMaterial({
      color: 0x16141c,
      roughness: 0.92,
      metalness: 0.02
    });
    this.root = new THREE.Group();
    this.root.name = 'ShopNameSign';
    this.root.userData.editorId = 'ShopNameSign';
    this.root.userData.editorRoot = true;
    this.root.userData.editorPersistent = true;
    this.root.userData.editorCollision = false;
    this.root.userData.editorKind = 'shop-sign';
    this.letters = new THREE.Group();
    this.letters.name = 'shop-sign-letters';
    this.board = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, BOARD_DEPTH), this.boardMaterial);
    this.board.name = 'shop-sign-board';
    this.board.castShadow = false;
    this.board.receiveShadow = false;
    this.light = new THREE.PointLight(NEON, 0, 2.6, 2);
    this.light.name = 'shop-sign-light';
    this.light.castShadow = false;
    this.light.position.set(0, 0, 0.55);
    this.root.add(this.board, this.letters, this.light);
    scene.add(this.root);
    this.applyTransform(DEFAULT_SIGN_TRANSFORM);
    this.setName(save.shopName());
    const saved = save.shopSign();
    if (saved) {
      this.applyTransform(saved);
    }
  }

  setName(value) {
    const next = cleanShopName(value) || DEFAULT_SHOP_NAME;
    if (next === this.name && this.letters.children.length > 0) {
      return next;
    }
    this.name = next;
    this.rebuild();
    return next;
  }

  applyNewGame(value) {
    this.applyTransform(DEFAULT_SIGN_TRANSFORM);
    this.setName(value);
  }

  applyTransform(transform) {
    const position = transform?.position ?? DEFAULT_SIGN_TRANSFORM.position;
    const rotation = transform?.rotation ?? DEFAULT_SIGN_TRANSFORM.rotation;
    const scale = transform?.scale ?? DEFAULT_SIGN_TRANSFORM.scale;
    this.root.position.set(position[0], position[1], position[2]);
    this.root.rotation.set(rotation[0], rotation[1], rotation[2]);
    this.root.scale.set(scale[0] || 1, scale[1] || 1, scale[2] || 1);
  }

  readTransform() {
    const position = this.root.position;
    const rotation = this.root.rotation;
    const scale = this.root.scale;
    return {
      position: [round(position.x), round(position.y), round(position.z)],
      rotation: [round(rotation.x), round(rotation.y), round(rotation.z)],
      scale: [round(scale.x), round(scale.y), round(scale.z)]
    };
  }

  persistTransform() {
    const current = this.readTransform();
    const saved = this.save.shopSign();
    if (saved && sameTransform(current, saved)) {
      return;
    }
    const initial = {
      position: DEFAULT_SIGN_TRANSFORM.position.map(round),
      rotation: DEFAULT_SIGN_TRANSFORM.rotation.map(round),
      scale: DEFAULT_SIGN_TRANSFORM.scale.map(round)
    };
    if (!saved && sameTransform(current, initial)) {
      return;
    }
    this.save.write({ shopSign: current });
  }

  rebuild() {
    this.disposeLetters();
    const geometry = new TextGeometry(this.name, {
      font: FONT,
      size: TEXT_SIZE,
      depth: TEXT_DEPTH,
      curveSegments: 4,
      bevelEnabled: false
    });
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const width = Math.max(0.01, bounds.max.x - bounds.min.x);
    const height = Math.max(0.01, bounds.max.y - bounds.min.y);
    geometry.translate(-(bounds.min.x + width / 2), -(bounds.min.y + height / 2), 0);
    const fit = Math.min(1, MAX_WIDTH / width);
    this.letters.scale.setScalar(fit);
    this.letters.position.set(0, 0, BOARD_DEPTH);

    const letters = new THREE.Mesh(geometry, this.letterMaterial);
    letters.name = 'shop-sign-text';
    letters.castShadow = false;
    letters.receiveShadow = false;
    const glow = new THREE.Mesh(geometry, this.glowMaterial);
    glow.name = 'shop-sign-glow';
    glow.scale.setScalar(1.06);
    glow.position.z = -0.006;
    glow.castShadow = false;
    glow.receiveShadow = false;
    this.letters.add(letters, glow);

    this.board.geometry.dispose();
    this.board.geometry = new THREE.BoxGeometry(width * fit + 0.18, height * fit + 0.14, BOARD_DEPTH);
    this.board.position.set(0, 0, BOARD_DEPTH / 2);
  }

  update(night) {
    const glow = Math.min(1, Math.max(0, night || 0));
    this.letterMaterial.emissiveIntensity = 0.28 + glow * 1.45;
    this.glowMaterial.opacity = 0.08 + glow * 0.34;
    this.light.intensity = glow * 0.85;
  }

  disposeLetters() {
    const geometry = this.letters.children[0]?.geometry;
    this.letters.clear();
    geometry?.dispose();
  }
}
