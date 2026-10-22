import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LEFT_FOOT_BONES = ['Foot.L', 'LeftFoot', 'mixamorigLeftFoot', 'foot.L', 'Foot_L'];
const RIGHT_FOOT_BONES = ['Foot.R', 'RightFoot', 'mixamorigRightFoot', 'foot.R', 'Foot_R'];

function sanitizeBoneName(name) {
  return name.replace(/\s/g, '_').replace(/\./g, '');
}

function findBone(model, names) {
  if (!model) {
    return null;
  }
  const bonesByName = new Map();
  model.traverse((child) => {
    if (!child.isBone) {
      return;
    }
    bonesByName.set(child.name, child);
    bonesByName.set(sanitizeBoneName(child.name), child);
  });
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const found = bonesByName.get(name) ?? bonesByName.get(sanitizeBoneName(name));
    if (found) {
      return found;
    }
  }
  return null;
}

function mirrorGeometry(geometry) {
  geometry.scale(-1, 1, 1);
  const index = geometry.getIndex();
  if (index) {
    const array = index.array;
    for (let i = 0; i < array.length; i += 3) {
      const swap = array[i + 1];
      array[i + 1] = array[i + 2];
      array[i + 2] = swap;
    }
    index.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function geometriesFrom(root, mirror) {
  const geometries = [];
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) {
      return;
    }
    const geometry = child.geometry.clone();
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }
    if (mirror) {
      mirrorGeometry(geometry);
    }
    geometries.push(geometry);
  });
  return geometries;
}

function skateMaterial(toonFactory) {
  const material = toonFactory
    ? new THREE.MeshToonMaterial({
      color: 0xffffff,
      vertexColors: true,
      gradientMap: toonFactory.gradientMap
    })
    : new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.02
    });
  material.userData.ownedSkateMaterial = true;
  return material;
}

// Both feet wear clones of the single left-skate GLB. The right clone is mirrored on X.
export class RollerSkates {
  constructor(options) {
    this.player = options.player;
    this.loader = options.loader;
    this.toonFactory = options.toonFactory ?? null;
    this.config = options.config ?? {};
    this.url = this.config.model || '/models/objects/roller_skate.glb';
    this.template = null;
    this.material = null;
    this.left = null;
    this.right = null;
    this.wanted = false;
    this.loading = false;
  }

  // Called once on purchase and again on load when the upgrade is already owned.
  activate() {
    this.wanted = true;
    if (this.isAttached()) {
      return;
    }
    if (!this.template) {
      this.load();
      return;
    }
    this.attach();
  }

  dispose() {
    this.wanted = false;
    this.detach();
    this.material?.dispose();
    this.material = null;
    this.template = null;
  }

  isAttached() {
    return Boolean(this.left?.parent && this.right?.parent);
  }

  load() {
    if (this.loading || this.template || !this.url) {
      return;
    }
    this.loading = true;
    this.loader.load(this.url).then((asset) => {
      this.loading = false;
      this.template = asset.scene;
      this.template.name = 'roller-skate-template';
      if (this.wanted) {
        this.attach();
      }
    }).catch((error) => {
      this.loading = false;
      console.error('Failed to load roller skates', error);
    });
  }

  attach() {
    this.detach();
    const model = this.player?.model;
    const leftBone = findBone(model, LEFT_FOOT_BONES);
    const rightBone = findBone(model, RIGHT_FOOT_BONES);
    if (!leftBone || !rightBone || !this.template) {
      console.error('Player foot bones were not found. Roller skates were not attached.');
      return;
    }
    if (!this.material) {
      this.material = skateMaterial(this.toonFactory);
    }
    this.left = this.createSkate('left', false);
    this.right = this.createSkate('right', true);
    if (!this.left || !this.right) {
      this.detach();
      return;
    }
    leftBone.add(this.left);
    rightBone.add(this.right);
  }

  createSkate(side, mirror) {
    const geometries = geometriesFrom(this.template, mirror);
    const merged = geometries.length > 0 ? mergeGeometries(geometries, false) : null;
    for (let i = 0; i < geometries.length; i += 1) {
      geometries[i].dispose();
    }
    if (!merged) {
      console.error('Failed to build roller skate mesh');
      return null;
    }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.name = `roller-skate-${side}-mesh`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.ownedGeometry = true;

    const holder = new THREE.Group();
    holder.name = `roller-skate-${side}`;
    holder.userData.editorIgnore = true;
    this.applyPose(holder, side);
    holder.add(mesh);
    return holder;
  }

  applyPose(holder, side) {
    const position = this.config.position ?? {};
    const rotation = this.config.rotation ?? {};
    const outward = Number(this.config.outward) || 0;
    const sign = side === 'right' ? 1 : -1;
    holder.position.set(
      (position.x ?? 0) + sign * outward,
      position.y ?? 0,
      position.z ?? 0
    );
    holder.rotation.set(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
    const scale = Number(this.config.scale) > 0 ? Number(this.config.scale) : 1;
    holder.scale.setScalar(scale);
  }

  detach() {
    this.release(this.left);
    this.release(this.right);
    this.left = null;
    this.right = null;
  }

  release(root) {
    if (!root) {
      return;
    }
    root.removeFromParent();
    root.traverse((child) => {
      if (child.userData?.ownedGeometry) {
        child.geometry?.dispose();
      }
    });
  }
}
