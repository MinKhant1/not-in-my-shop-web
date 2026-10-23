import * as THREE from 'three';
import { StorePalette } from '../theme/storePalette.js';

// Add `{ id, model: '/models/...' }` later to swap a box for a grocery model.
export const groceryCatalog = [
  { id: 'carton', color: StorePalette.orange, size: [0.16, 0.1, 0.12] },
  { id: 'bottle', color: StorePalette.sky, size: [0.08, 0.2, 0.08] },
  { id: 'can', color: StorePalette.coral, size: [0.09, 0.12, 0.09] },
  { id: 'bread', color: StorePalette.yellow, size: [0.18, 0.08, 0.1] }
];

const geometries = new Map();

function sharedGeometry(entry) {
  let geometry = geometries.get(entry.id);
  if (!geometry) {
    geometry = new THREE.BoxGeometry(entry.size[0], entry.size[1], entry.size[2]);
    geometries.set(entry.id, geometry);
  }
  return geometry;
}

export class ShopperInventory {
  constructor(holder, gradientMap) {
    this.holder = holder;
    this.gradientMap = gradientMap;
    this.items = [];
  }

  get count() {
    return this.items.length;
  }

  addRandom() {
    const entry = groceryCatalog[Math.floor(Math.random() * groceryCatalog.length)];
    const mesh = new THREE.Mesh(
      sharedGeometry(entry),
      new THREE.MeshToonMaterial({
        color: entry.color,
        gradientMap: this.gradientMap
      })
    );
    mesh.name = `grocery-${entry.id}`;
    mesh.castShadow = false;
    const column = this.items.length % 2;
    const row = Math.floor(this.items.length / 2);
    mesh.position.set((column - 0.5) * 0.16, row * 0.12, 0);
    this.holder.add(mesh);
    mesh.userData.value = entry.value ?? null;
    this.items.push(mesh);
    return entry.id;
  }

  releaseAll() {
    const items = this.items.splice(0, this.items.length);
    return items;
  }

  dispose() {
    for (let i = 0; i < this.items.length; i += 1) {
      const mesh = this.items[i];
      mesh.removeFromParent();
      mesh.material.dispose();
    }
    this.items.length = 0;
  }
}
